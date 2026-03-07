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
import { existsSync } from "node:fs";
import { TmuxBridge, getTmuxBridge } from "./tmux/tmux-bridge.js";
import { SessionRegistry, getSessionRegistry } from "./session-registry.js";
import { BridgePolicyManager, getBridgePolicyManager } from "./security/bridge-policy.js";
import { getBridgeAuditLogger } from "./security/bridge-audit.js";
import {
  AGENT_COMMANDS,
  VALID_AGENT_TYPES,
  type AgentProviderType,
  type BridgeSession,
  type SessionRiskMode,
} from "./types.js";

const execFileAsync = promisify(execFile);

// ============================================================================
// Agent Launcher
// ============================================================================

export interface LaunchOptions {
  agentType: AgentProviderType;
  projectPath: string;
  actorId: string;
  riskMode?: SessionRiskMode;
}

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
    const { agentType, projectPath, actorId, riskMode } = options;
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

    // 6. Build command
    const command = AGENT_COMMANDS[agentType];
    const windowName = agentType.replace("-", "");
    const fullCommand = `cd ${this.escapeShellArg(projectPath)} && ${command}`;

    // 7. Create tmux session/window
    try {
      const tmuxInfo = await this.tmux.createSession(windowName, fullCommand);

      // 8. Register session
      const sessionId = SessionRegistry.generateId();
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

      this.registry.add(session);

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
        },
      });

      return { success: true, session };
    } catch (err) {
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
   * Escape a shell argument for use in tmux command.
   * Only used for the cd path — the agent command itself is a constant.
   */
  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
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
