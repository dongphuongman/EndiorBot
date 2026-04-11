/**
 * Agent Launcher
 *
 * Launches AI agents in tmux panes and registers sessions.
 * Computes workspaceFingerprint to prevent wrong-repo confusion.
 *
 * @module bridge/agent-launcher
 * @version 1.0.0
 * @authority ADR-024
 * @stage 04 - BUILD (Sprint 82)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { TmuxBridge, getTmuxBridge } from "./tmux/tmux-bridge.js";
import { SessionRegistry, getSessionRegistry } from "./session-registry.js";
import { BridgePolicyManager, getBridgePolicyManager } from "./security/bridge-policy.js";
import { getBridgeAuditLogger } from "./security/bridge-audit.js";
import { getSoulLoader, type SoulLoadResult } from "./intelligence/soul-loader.js";
import { isValidAgentRole } from "./intelligence/envelope.js";
import { buildFullEnvelope, serializeEnvelopeForInjection } from "./intelligence/envelope-builder.js";
import { TEAM_LEADERS } from "./intelligence/team-installer.js";
import type { TeamId } from "../agents/types/team.js";
import { getFeatureFlagWithEnvOverride } from "../config/feature-flags.js";
import {
  AGENT_COMMANDS,
  VALID_AGENT_TYPES,
  type BridgeSession,
  type LaunchOptions,
} from "./types.js";

const execFileAsync = promisify(execFile);

// ============================================================================
// Agent Launcher
// ============================================================================

export type { LaunchOptions };

export interface LaunchResult {
  success: boolean;
  session?: BridgeSession;
  error?: string;
}

export class AgentLauncher {
  private readonly tmux: TmuxBridge;
  private readonly registry: SessionRegistry;
  private readonly policy: BridgePolicyManager;

  constructor(
    tmux?: TmuxBridge,
    registry?: SessionRegistry,
    policy?: BridgePolicyManager
  ) {
    this.tmux = tmux ?? getTmuxBridge();
    this.registry = registry ?? getSessionRegistry();
    this.policy = policy ?? getBridgePolicyManager();
  }

  /**
   * Launch an AI agent in a tmux pane.
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const { agentType, projectPath, actorId, riskMode, agentRole } = options;
    const audit = getBridgeAuditLogger();

    // 1. Validate agent type
    if (!VALID_AGENT_TYPES.includes(agentType)) {
      return { success: false, error: `Unknown agent type: ${agentType}` };
    }

    // 2. Check tmux availability
    const tmuxVersion = await this.tmux.isAvailable();
    if (!tmuxVersion) {
      return { success: false, error: "tmux not found. Install: brew install tmux" };
    }

    // 3. Validate project path
    if (!existsSync(projectPath)) {
      return { success: false, error: `Project path not found: ${projectPath}` };
    }

    // 4. Check policy
    const activeSessions = this.registry.getActive();
    const policyCheck = this.policy.canCreateSession(agentType, activeSessions);
    if (!policyCheck.allowed) {
      audit.log({
        event: "policy_violation",
        actorId,
        actor: "telegram",
        agentType,
        details: { reason: policyCheck.reason },
      });
      return { success: false, error: policyCheck.reason };
    }

    // 5. Get git remote for fingerprint
    const gitRemote = await this.getGitRemote(projectPath);
    const fingerprint = SessionRegistry.createFingerprint(projectPath, gitRemote);

    // 6. Build command (SOUL-aware — Sprint 84, ADR-025)
    const baseCmd = AGENT_COMMANDS[agentType];
    const windowName = agentType.replace("-", "");
    const sessionId = SessionRegistry.generateId();

    let fullCommand: string;
    let soulResult: SoulLoadResult | undefined;
    let strategyUsed: "native-agent" | "append-system-prompt-file" | "none" = "none";
    let soulTempPath: string | undefined;
    let resolvedTeamId: string | undefined; // Sprint 90: track team mode for session fields

    if (agentRole && isValidAgentRole(agentRole) && agentType === "claude-code") {
      // Sprint 90: Direct teamId from --as-team, OR Sprint 89: auto-detect from TEAM_LEADERS
      const teamId = options.teamId ?? TEAM_LEADERS[agentRole];
      const teamFile = teamId ? join(projectPath, ".claude", "agents", `${teamId}-team.md`) : null;
      const useTeamFile = teamFile && existsSync(teamFile) && getFeatureFlagWithEnvOverride("AGENT_TEAMS");

      // Strategy A: native --agent flag (preferred)
      const agentFile = join(projectPath, ".claude", "agents", `${agentRole}.md`);
      if (useTeamFile && teamId) {
        fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${baseCmd} --agent ${this.escapeShellArg(`${teamId}-team`)}`;
        strategyUsed = "native-agent";
        resolvedTeamId = teamId;
      } else if (existsSync(agentFile)) {
        fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${baseCmd} --agent ${this.escapeShellArg(agentRole)}`;
        strategyUsed = "native-agent";
      } else {
        // Strategy B: --append-system-prompt-file (fallback)
        soulResult = getSoulLoader().load(agentRole);
        soulTempPath = this.writeSoulTempFile(sessionId, soulResult.content);
        fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${baseCmd} --append-system-prompt-file ${this.escapeShellArg(soulTempPath)}`;
        strategyUsed = "append-system-prompt-file";
      }

      // Audit: strategy selection event
      audit.log({
        event: "soul_strategy_selected",
        actorId,
        actor: "telegram",
        sessionId,
        agentType,
        details: {
          agentRole,
          strategy: strategyUsed,
          agentFileExists: existsSync(agentFile),
          soulSource: soulResult?.source,
          soulContentHash: soulResult?.contentHash,
        },
      });
    } else {
      // No SOUL injection — bare launch (or non-claude agent)
      fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${baseCmd}`;
    }

    // 6b. Brain L4 + Context injection (Sprint 87 — ADR-025)
    // Build envelope and serialize brain+context for file injection.
    // CTO MF-1: Strategy A writes temp agent copy with brain+context appended.
    //           Strategy B appends to existing soul temp file.
    //           No strategy: creates brain-context.md with --append-system-prompt-file.
    let envelopeInjected = false;
    let brainContentHash: string | undefined;
    let contextHash: string | undefined;

    if (agentType === "claude-code") {
      try {
        const dummyPersona = { agentRole: (agentRole ?? "assistant") as import("./intelligence/envelope.js").AgentRole, soulContent: "", soulContentHash: "" };

        // Sprint 131 Fix A (CTO follow-up): Only enrich with CRG when agentRole
        // is explicitly set. Bare launches fall back to "assistant" which is not
        // in GRAPH_AWARE_AGENTS — skip git diff work entirely for bare launches.
        // enrichWithCRG() still validates GRAPH_AWARE_AGENTS internally as a
        // second guard for non-graph-aware real agents.
        let crgOptions: { repoId: string; changedFiles: string[] } | undefined;
        if (agentRole) {
          const changedFiles = await this.getChangedFiles(projectPath);
          if (changedFiles.length > 0) {
            crgOptions = { repoId: this.deriveRepoId(projectPath), changedFiles };
          }
        }

        const envelope = await buildFullEnvelope(dummyPersona, crgOptions);
        const serialized = serializeEnvelopeForInjection(envelope);

        if (serialized) {
          if (strategyUsed === "native-agent") {
            // Strategy A: Write temp copy of agent file with brain+context appended
            const agentFile = join(projectPath, ".claude", "agents", `${agentRole}.md`);
            const originalContent = readFileSync(agentFile, "utf-8");
            const augmented = `${originalContent}\n\n${serialized}`;
            const tempAgentPath = this.writeEnvelopeTempFile(sessionId, augmented);
            // Replace --agent with --append-system-prompt-file pointing to temp copy
            fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${baseCmd} --append-system-prompt-file ${this.escapeShellArg(tempAgentPath)}`;
          } else if (strategyUsed === "append-system-prompt-file" && soulTempPath) {
            // Strategy B: Append brain+context to existing soul temp file
            const existingContent = readFileSync(soulTempPath, "utf-8");
            writeFileSync(soulTempPath, `${existingContent}\n\n${serialized}`, { mode: 0o600 });
          } else {
            // No strategy: create brain-context temp file
            const bcPath = this.writeEnvelopeTempFile(sessionId, serialized);
            fullCommand += ` --append-system-prompt-file ${this.escapeShellArg(bcPath)}`;
          }

          envelopeInjected = true;
          if (envelope.brain) brainContentHash = envelope.brain.contentHash;
          if (envelope.context) contextHash = envelope.context.contentHash;
        }
      } catch {
        // Brain/context injection failure is non-fatal — session launches bare
      }
    }

    // 7. Create tmux session/window
    try {
      const tmuxInfo = await this.tmux.createSession(windowName, fullCommand);

      // 8. Register session
      const now = new Date().toISOString();
      const session: BridgeSession = {
        id: sessionId,
        agentType,
        tmuxTarget: tmuxInfo.target,
        tmuxSessionName: tmuxInfo.sessionName,
        projectPath,
        workspaceFingerprint: fingerprint,
        status: "active",
        riskMode: riskMode ?? "read",
        createdAt: now,
        lastActivityAt: now,
      };

      // Add optional SOUL fields (exactOptionalPropertyTypes)
      if (agentRole && isValidAgentRole(agentRole)) {
        session.agentRole = agentRole;
      }
      if (soulResult) {
        session.soulContentHash = soulResult.contentHash;
      }
      // Sprint 87: Brain + Context hashes
      if (brainContentHash) session.brainContentHash = brainContentHash;
      if (contextHash) session.contextHash = contextHash;
      // Sprint 90: Team session fields (exactOptionalPropertyTypes)
      if (resolvedTeamId) {
        session.teamId = resolvedTeamId as TeamId;
      }

      this.registry.add(session);

      // Sprint 92: Populate providerPid + tmuxPaneId (best-effort)
      try {
        const panePid = await this.tmux.getPanePid(tmuxInfo.target);
        const paneId = await this.tmux.getPaneId(tmuxInfo.target);
        const pidUpdates: Partial<BridgeSession> = {};
        if (panePid !== null) pidUpdates.providerPid = panePid;
        if (paneId !== null) pidUpdates.tmuxPaneId = paneId;
        pidUpdates.launcherStartTime = Date.now();
        if (Object.keys(pidUpdates).length > 0) {
          this.registry.update(sessionId, pidUpdates);
          Object.assign(session, pidUpdates);
        }
      } catch {
        // PID tracking is best-effort — don't fail the launch
      }

      // 9. Audit log
      audit.log({
        event: "session_create",
        actorId,
        actor: "telegram",
        sessionId,
        agentType,
        details: {
          projectPath,
          workspaceFingerprint: fingerprint,
          riskMode: session.riskMode,
          tmuxTarget: tmuxInfo.target,
          agentRole: session.agentRole,
          soulContentHash: session.soulContentHash,
          soulStrategy: strategyUsed,
          brainContentHash,
          contextHash,
          envelopeInjected,
        },
      });

      // Sprint 90: Audit team launch event
      if (resolvedTeamId) {
        audit.log({
          event: "team_launch",
          actorId,
          actor: "telegram",
          sessionId,
          agentType,
          details: {
            teamId: resolvedTeamId,
            leader: session.agentRole,
          },
        });
      }

      // Sprint 87: Audit brain+context injection event
      if (envelopeInjected) {
        audit.log({
          event: "brain_context_injected",
          actorId,
          actor: "telegram",
          sessionId,
          agentType,
          details: { brainContentHash, contextHash },
        });
      }

      return { success: true, session };
    } catch (err) {
      // Clean up temp SOUL file on failure
      if (soulTempPath) {
        this.cleanupSoulTempFile(soulTempPath);
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to create tmux session: ${errorMsg}` };
    }
  }

  /**
   * Kill a session and clean up.
   */
  async kill(sessionId: string, actorId: string): Promise<{ success: boolean; error?: string }> {
    const audit = getBridgeAuditLogger();
    const session = this.registry.get(sessionId);

    if (!session) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }

    try {
      await this.tmux.killWindow(session.tmuxTarget);
    } catch {
      // Window may already be gone
    }

    this.registry.markStopped(sessionId);

    // Clean up SOUL temp file (Strategy B lifecycle — CTO W-2)
    this.cleanupSoulTempFile(this.getSoulTempPath(sessionId));
    // Clean up Brain+Context temp file (Sprint 87)
    this.cleanupSoulTempFile(this.getEnvelopeTempPath(sessionId));

    audit.log({
      event: "session_kill",
      actorId,
      actor: "telegram",
      sessionId,
      agentType: session.agentType,
      details: { tmuxTarget: session.tmuxTarget },
    });

    return { success: true };
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async getGitRemote(path: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", path, "remote", "get-url", "origin"], {
        timeout: 3000,
      });
      return stdout.trim();
    } catch {
      return "";
    }
  }

  /**
   * Get list of changed files from git (unstaged + staged, relative to HEAD).
   * Sprint 131 (ADR-045): Used for CRG blast radius enrichment.
   * Returns empty array if not a git repo or on any error (fail-soft).
   */
  private async getChangedFiles(path: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", path, "diff", "--name-only", "HEAD"], {
        timeout: 3000,
      });
      return stdout.trim().split("\n").filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Derive repo_id for CRG queries from project path.
   * Uses directory basename (matches how AI-Platform registers repos).
   */
  private deriveRepoId(projectPath: string): string {
    const parts = projectPath.split("/").filter(Boolean);
    const basename = parts[parts.length - 1] ?? "unknown";
    return basename.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  /**
   * Escape a shell argument for use in tmux command.
   * Only used for the cd path — the agent command itself is a constant.
   */
  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  // ==========================================================================
  // SOUL Temp File Management (Strategy B — CTO W-2)
  // ==========================================================================

  /** Get the temp file path for a session's SOUL content */
  private getSoulTempPath(sessionId: string): string {
    return join(homedir(), ".endiorbot", "sessions", sessionId, "soul.md");
  }

  /** Write SOUL content to temp file with restricted permissions */
  private writeSoulTempFile(sessionId: string, content: string): string {
    const soulPath = this.getSoulTempPath(sessionId);
    const dir = dirname(soulPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(soulPath, content, { mode: 0o600 });
    return soulPath;
  }

  // ==========================================================================
  // Envelope Temp File Management (Sprint 87)
  // ==========================================================================

  /** Get the temp file path for brain+context content */
  private getEnvelopeTempPath(sessionId: string): string {
    return join(homedir(), ".endiorbot", "sessions", sessionId, "brain-context.md");
  }

  /** Write brain+context content to temp file */
  private writeEnvelopeTempFile(sessionId: string, content: string): string {
    const envelopePath = this.getEnvelopeTempPath(sessionId);
    const dir = dirname(envelopePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(envelopePath, content, { mode: 0o600 });
    return envelopePath;
  }

  /** Clean up SOUL temp file (silent on missing) */
  private cleanupSoulTempFile(soulPath: string): void {
    try {
      if (existsSync(soulPath)) {
        unlinkSync(soulPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLauncher: AgentLauncher | undefined;

export function getAgentLauncher(): AgentLauncher {
  if (!globalLauncher) {
    globalLauncher = new AgentLauncher();
  }
  return globalLauncher;
}

export function resetAgentLauncher(): void {
  globalLauncher = undefined;
}
