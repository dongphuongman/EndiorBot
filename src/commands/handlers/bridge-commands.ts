/**
 * Bridge Command Handlers
 *
 * Handlers for bridge/session commands: /link, /launch, /sessions, /switch,
 * /mode, /webhook, and the complexity gate callback.
 *
 * @module commands/handlers/bridge-commands
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-024 Notification Bridge + ADR-030 Unified Commands
 */

import { resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import type { AgentRole } from "../../agents/types/handoff.js";
import type { TeamId } from "../../agents/types/team.js";
import { VALID_AGENT_TYPES, type AgentProviderType, type SessionRiskMode, type BridgeAuditActor } from "../../bridge/types.js";
import { getAgentLauncher } from "../../bridge/agent-launcher.js";
import { isValidAgentRole, VALID_AGENT_ROLES } from "../../bridge/intelligence/envelope.js";
import { getSessionRegistry } from "../../bridge/session-registry.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import { assessComplexity } from "../../bridge/intelligence/complexity-gate.js";
import { TEAM_LEADER_ROLES } from "../../bridge/intelligence/team-installer.js";
import { isValidTeamId } from "../../agents/types/team.js";
import { getFeatureFlagWithEnvOverride } from "../../config/feature-flags.js";
import { createComplexityGateKeyboard } from "../../channels/telegram/keyboards.js";

import type { CommandResult } from "../command-dispatcher.js";
import { sanitizeForEcho } from "./shared.js";

export type { CommandResult } from "../command-dispatcher.js";

// ============================================================================
// Agent short name mapping
// ============================================================================

/**
 * Agent short name → AgentProviderType mapping.
 */
const AGENT_SHORT_NAMES: Record<string, AgentProviderType> = {
  claude: "claude-code",
  "claude-code": "claude-code",
  cursor: "cursor",
  codex: "codex-cli",
  "codex-cli": "codex-cli",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
};

// ============================================================================
// In-memory state
// ============================================================================

/**
 * In-memory identity binding: telegramUserId → actorId.
 * All linked users get "ceo@endiorbot" (single-user system).
 */
const identityMap = new Map<string, string>();

/**
 * In-memory active session per actorId.
 * Exported so other handler modules can read/write it.
 */
export const activeSessionMap = new Map<string, string>();

// ============================================================================
// Sprint 90 — Pending Team Launch (complexity gate)
// ============================================================================

interface PendingTeamLaunch {
  agentType: AgentProviderType;
  projectPath: string;
  teamId: TeamId;
  actorId: string;
  task: string;
  createdAt: number;
}

export const pendingTeamLaunches = new Map<string, PendingTeamLaunch>();
export const pendingTeamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
export const TEAM_GATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Link Command
// ============================================================================

/**
 * Handle /link command — bind channel identity to EndiorBot actorId.
 */
export function handleLinkCommand(
  userId: string,
  username?: string,
  channel?: string,
): CommandResult {
  const actorId = "ceo@endiorbot";
  identityMap.set(userId, actorId);

  const displayName = username ?? "unknown";
  const channelName: BridgeAuditActor = (channel as BridgeAuditActor) ?? "telegram";

  getBridgeAuditLogger().log({
    event: "identity_link",
    actorId,
    actor: channelName,
    details: { userId, username: displayName, channel: channelName },
  });

  return {
    success: true,
    response: `✅ Linked as *${actorId}* (${channelName}: ${sanitizeForEcho(displayName)})

Available bridge commands:
  /launch <agent> <path> [--as role] — Launch agent in tmux
  /sessions — List active sessions
  /switch <sessionId> — Switch session
  /capture [lines] — Capture output
  /kill <sessionId> — Kill session`,
  };
}

/**
 * Get linked actorId for a Telegram user.
 * Returns null if user has not called /link.
 */
export function getLinkedActorId(telegramUserId: string): string | null {
  return identityMap.get(telegramUserId) ?? null;
}

// ============================================================================
// Launch Command
// ============================================================================

/**
 * Handle /launch command — launch an AI agent in tmux.
 *
 * Validates path (MF-2 path traversal protection):
 * - Must be absolute after resolve()
 * - Must be under $HOME or /tmp
 */
export async function handleLaunchCommand(
  args: string[],
  actorId: string,
  workspace?: string,
): Promise<CommandResult> {
  if (args.length === 0) {
    const agentList = VALID_AGENT_TYPES.map((t) => `  • ${t}`).join("\n");
    const roleList = VALID_AGENT_ROLES.join(", ");
    return {
      success: false,
      response: `Usage: /launch <agent> [path] [--as <role>] [--as-team <teamId>]

Agents:
${agentList}

Short names: claude, cursor, codex, gemini
Default path: current project directory

SOUL Roles (--as): ${roleList}
Teams (--as-team): dev, planning, design, qa, ops, executive
Example: /launch claude ~/project --as pm
Example: /launch claude ~/project --as-team dev "Refactor auth module"`,
    };
  }

  // Parse --as, --as-team, and --risk flags
  let agentRole: AgentRole | undefined;
  let teamId: TeamId | undefined;
  let riskMode: SessionRiskMode | undefined;
  let deprecationWarning = "";
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--as" && i + 1 < args.length) {
      const role = args[i + 1] ?? "";
      if (isValidAgentRole(role)) {
        agentRole = role;
      } else {
        return {
          success: false,
          response: `Unknown role: ${sanitizeForEcho(role)}\nValid roles: ${VALID_AGENT_ROLES.join(", ")}`,
        };
      }
      i++; // Skip the role value
    } else if (args[i] === "--as-team" && i + 1 < args.length) {
      // Sprint 90: Parse --as-team <teamId>
      const tid = args[i + 1] ?? "";
      if (isValidTeamId(tid)) {
        teamId = tid;
      } else {
        return {
          success: false,
          response: `Unknown team: ${sanitizeForEcho(tid)}\nValid teams: dev, planning, design, qa, ops, executive`,
        };
      }
      i++; // Skip the teamId value
    } else if ((args[i] === "--risk" || args[i] === "--mode") && i + 1 < args.length) {
      // Sprint 104: Parse --risk [read|patch] (GAP-002)
      // Sprint 119: --mode accepted as deprecated alias (ISSUE-2)
      if (args[i] === "--mode") {
        deprecationWarning = "⚠️ --mode is deprecated, use --risk instead.\n\n";
      }
      const mode = (args[i + 1] ?? "").toLowerCase();
      if (mode === "read" || mode === "patch") {
        riskMode = mode as SessionRiskMode;
      } else {
        return {
          success: false,
          response: `Unknown risk mode: ${sanitizeForEcho(mode)}\nValid: read, patch`,
        };
      }
      i++; // Skip the mode value
    } else {
      filteredArgs.push(args[i] ?? "");
    }
  }

  // Mutual exclusion: --as and --as-team cannot coexist
  if (agentRole && teamId) {
    return {
      success: false,
      response: "Cannot use --as and --as-team together. Use --as for solo or --as-team for team mode.",
    };
  }

  // Sprint 90: Check AGENT_TEAMS flag when --as-team is used
  if (teamId && !getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return {
      success: false,
      response: "AGENT_TEAMS feature flag is disabled.\nSet ENDIORBOT_FF_AGENT_TEAMS=true to use team mode.",
    };
  }

  // Sprint 90: Derive agentRole from team leader (CTO MF-1: no registry in launcher)
  if (teamId) {
    const leaderRole = TEAM_LEADER_ROLES[teamId];
    if (leaderRole) {
      agentRole = leaderRole;
    }
  }

  // Resolve agent type
  const agentInput = (filteredArgs[0] ?? "").toLowerCase();
  const agentType = AGENT_SHORT_NAMES[agentInput];
  if (!agentType) {
    return {
      success: false,
      response: `Unknown agent: ${sanitizeForEcho(agentInput)}\nValid: ${VALID_AGENT_TYPES.join(", ")}`,
    };
  }

  // Resolve and validate path (MF-2: path traversal protection)
  // Sprint 99: Use workspace (from /focus) as default when no explicit path given (ADR-029 AD-6)
  const rawPath = filteredArgs[1] ?? workspace ?? process.cwd();
  const resolvedPath = resolve(rawPath);
  const homeDir = homedir();
  const tmpDir = tmpdir();

  if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith(tmpDir) && !resolvedPath.startsWith("/tmp")) {
    return {
      success: false,
      response: `Path must be under ${homeDir} or /tmp.\nGiven: ${sanitizeForEcho(resolvedPath.slice(0, 50))}`,
    };
  }

  // Collect remaining args as task string (for complexity gate)
  const taskString = filteredArgs.slice(2).join(" ");

  // Sprint 90: Complexity gate for team mode
  if (teamId) {
    const assessment = assessComplexity(taskString);
    if (assessment.level === "simple") {
      // Generate gate ID and store pending launch
      const gateId = randomBytes(8).toString("hex");
      pendingTeamLaunches.set(gateId, {
        agentType,
        projectPath: resolvedPath,
        teamId,
        actorId,
        task: taskString,
        createdAt: Date.now(),
      });

      // Set timeout: auto-solo on expiry (CTO MF-2: consume-once)
      const timer = setTimeout(() => {
        const pending = pendingTeamLaunches.get(gateId);
        if (pending) {
          pendingTeamLaunches.delete(gateId);
          pendingTeamTimeouts.delete(gateId);

          getBridgeAuditLogger().log({
            event: "team_launch_aborted",
            actorId: pending.actorId,
            actor: "system",
            details: {
              teamId: pending.teamId,
              reason: "timeout",
              task: pending.task.slice(0, 100),
            },
          });
        }
      }, TEAM_GATE_TIMEOUT_MS);
      pendingTeamTimeouts.set(gateId, timer);

      const taskPreview = taskString.length > 0
        ? `\nTask: "${sanitizeForEcho(taskString)}"`
        : "";

      return {
        success: true,
        response: `⚠️ *Complexity Gate*

This task may be too simple for team mode (est. 3x token cost).
Reason: ${assessment.reason}${taskPreview}`,
        replyMarkup: createComplexityGateKeyboard(gateId),
      };
    }
    // Complex task → proceed with team launch below
  }

  // Launch via AgentLauncher
  const launcher = getAgentLauncher();
  const launchOptions: Parameters<typeof launcher.launch>[0] = {
    agentType,
    projectPath: resolvedPath,
    actorId,
  };
  if (agentRole) {
    launchOptions.agentRole = agentRole;
  }
  if (teamId) {
    launchOptions.teamId = teamId;
  }
  if (riskMode) {
    // Sprint 104: GAP-002 — wire --risk flag to LaunchOptions (already supported in AgentLauncher)
    launchOptions.riskMode = riskMode;
  }
  const result = await launcher.launch(launchOptions);

  if (!result.success || !result.session) {
    return {
      success: false,
      response: `Launch failed: ${result.error ?? "unknown error"}`,
    };
  }

  const session = result.session;
  activeSessionMap.set(actorId, session.id);

  const roleLabel = session.agentRole ? `\nRole: @${session.agentRole}` : "";
  const teamLabel = session.teamId ? `\nTeam: ${session.teamId}-team` : "";

  return {
    success: true,
    response: `${deprecationWarning}🚀 *Agent Launched*

Agent: ${session.agentType}${roleLabel}${teamLabel}
Session: \`${session.id}\`
tmux: \`${session.tmuxTarget}\`
Path: ${sanitizeForEcho(session.projectPath.slice(0, 50))}
Mode: ${session.riskMode}

Use /capture to see output, /kill to stop.`,
  };
}

// ============================================================================
// Complexity Gate Callback
// ============================================================================

/**
 * Handle complexity gate callback — CEO approves team or switches to solo.
 * CTO MF-2: Consume-once semantics with timeout cleanup.
 */
export async function handleComplexityGateCallback(
  action: string, // "team" or "solo"
  gateId: string,
  actorId: string,
): Promise<CommandResult> {
  // Consume-once: retrieve and delete pending entry
  const pending = pendingTeamLaunches.get(gateId);
  if (!pending) {
    return { success: false, response: "Gate expired or already resolved." };
  }
  pendingTeamLaunches.delete(gateId);
  const timer = pendingTeamTimeouts.get(gateId);
  if (timer) clearTimeout(timer);
  pendingTeamTimeouts.delete(gateId);

  const audit = getBridgeAuditLogger();

  // Audit: gate decision
  audit.log({
    event: "complexity_gate_decision",
    actorId,
    actor: "telegram",
    details: {
      gateId,
      teamId: pending.teamId,
      decision: action,
      task: pending.task.slice(0, 100),
    },
  });

  // Launch with team or solo
  const launcher = getAgentLauncher();
  const launchOptions: Parameters<typeof launcher.launch>[0] = {
    agentType: pending.agentType,
    projectPath: pending.projectPath,
    actorId: pending.actorId,
  };

  if (action === "team") {
    // Team launch: set both teamId and derived leader role
    const leaderRole = TEAM_LEADER_ROLES[pending.teamId];
    if (leaderRole) launchOptions.agentRole = leaderRole;
    launchOptions.teamId = pending.teamId;
  } else {
    // Solo launch: use leader role without team
    const leaderRole = TEAM_LEADER_ROLES[pending.teamId];
    if (leaderRole) launchOptions.agentRole = leaderRole;
  }

  const result = await launcher.launch(launchOptions);

  if (!result.success || !result.session) {
    return {
      success: false,
      response: `Launch failed: ${result.error ?? "unknown error"}`,
    };
  }

  const session = result.session;
  activeSessionMap.set(actorId, session.id);

  const modeLabel = action === "team" ? "team" : "solo";
  const roleLabel = session.agentRole ? `\nRole: @${session.agentRole}` : "";
  const teamLabel = session.teamId ? `\nTeam: ${session.teamId}-team` : "";

  return {
    success: true,
    response: `🚀 *Agent Launched* (${modeLabel})

Agent: ${session.agentType}${roleLabel}${teamLabel}
Session: \`${session.id}\`
tmux: \`${session.tmuxTarget}\`
Path: ${sanitizeForEcho(session.projectPath.slice(0, 50))}
Mode: ${session.riskMode}

Use /capture to see output, /kill to stop.`,
  };
}

// ============================================================================
// Sessions Command
// ============================================================================

/**
 * Handle /sessions command — list active bridge sessions.
 */
export function handleSessionsCommand(): CommandResult {
  const registry = getSessionRegistry();
  const sessions = registry.getActive();

  if (sessions.length === 0) {
    return {
      success: true,
      response: "📋 *Sessions*\n\nNo active sessions.\nUse /launch to start one.",
    };
  }

  const lines: string[] = ["📋 *Active Sessions*", ""];
  for (const s of sessions) {
    lines.push(`• \`${s.id}\``);
    lines.push(`  Agent: ${s.agentType} | Mode: ${s.riskMode}`);
    if (s.teamId) {
      lines.push(`  Team: ${s.teamId}-team (leader: @${s.agentRole ?? "unknown"})`);
    } else if (s.agentRole) {
      lines.push(`  Role: @${s.agentRole}`);
    }
    lines.push(`  tmux: \`${s.tmuxTarget}\``);
    lines.push("");
  }

  return { success: true, response: lines.join("\n") };
}

// ============================================================================
// Switch Command
// ============================================================================

/**
 * Handle /switch command — switch active session context.
 */
export function handleSwitchCommand(
  args: string[],
  actorId: string,
): CommandResult {
  if (args.length === 0) {
    const current = activeSessionMap.get(actorId);
    if (!current) {
      return {
        success: true,
        response: "No active session.\n\nUsage: /switch <sessionId>",
      };
    }
    return {
      success: true,
      response: `Current session: \`${current}\`\n\nUsage: /switch <sessionId>`,
    };
  }

  const switchTarget = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(switchTarget);

  if (!session) {
    return {
      success: false,
      response: `Session not found: \`${sanitizeForEcho(switchTarget.slice(0, 40))}\``,
    };
  }

  activeSessionMap.set(actorId, switchTarget);
  return {
    success: true,
    response: `Switched to session \`${session.id}\` (${session.agentType})`,
  };
}

// ============================================================================
// Mode Command
// ============================================================================

/**
 * Handle /mode command — mutate session risk mode (Sprint 104: GAP-004).
 *
 * CPO C4: session.riskMode in SessionInfo is the canonical SSOT.
 * CPO C5: Show transition "READ → PATCH (session X)" + scope.
 * Breaking change: requires linked actor (withLinkedActor in index.ts).
 * Unlinked users receive "No active session" instead of generic help text.
 */
export function handleModeCommand(
  args: string[],
  actorId: string,
): CommandResult {
  const registry = getSessionRegistry();
  const sessionId = activeSessionMap.get(actorId);
  const session = sessionId ? registry.get(sessionId) : null;

  if (!session) {
    return {
      success: false,
      response: "No active session. Use `/launch` first.\n\nUsage: /mode [read|patch]",
    };
  }

  const requestedMode = args[0]?.toLowerCase();

  if (!requestedMode) {
    return {
      success: true,
      response: `*Current Mode:* ${session.riskMode.toUpperCase()} (session \`${session.id}\`)\n\nUsage: /mode [read|patch]\n\n• READ — safe, read-only operations (default)\n• PATCH — file modifications (write-enabled)`,
    };
  }

  if (requestedMode !== "read" && requestedMode !== "patch") {
    return {
      success: false,
      response: `Unknown mode: ${sanitizeForEcho(requestedMode)}\nValid modes: read, patch`,
    };
  }

  const previousMode = session.riskMode;
  // CPO C4: mutate canonical field
  session.riskMode = requestedMode;

  // CPO C5: show transition + scope
  const icon = requestedMode === "patch" ? "🔓" : "🔒";
  return {
    success: true,
    response: `${icon} ${previousMode.toUpperCase()} → ${requestedMode.toUpperCase()} (session \`${session.id}\`)\nAffects this session only.`,
  };
}

// ============================================================================
// Webhook Command
// ============================================================================

/**
 * Handle /webhook command — toggle webhook mode (Telegram only).
 */
export function handleWebhookCommand(
  args: string[],
  isWebhookActive: boolean,
): CommandResult {
  const action = args[0]?.toLowerCase();

  if (!action) {
    return {
      success: true,
      response: `🔗 *Webhook Status:* ${isWebhookActive ? "ACTIVE" : "INACTIVE (polling)"}

Usage: /webhook [on|off]

• on — Enable webhook mode (requires HTTPS reverse proxy)
• off — Disable webhook, resume polling`,
    };
  }

  if (action === "on") {
    return {
      success: true,
      response: "🔗 Webhook activation requires HTTPS URL configuration.\nSet `ENDIORBOT_TELEGRAM_WEBHOOK_URL` environment variable first.\n\nExample:\n`export ENDIORBOT_TELEGRAM_WEBHOOK_URL=https://your-domain/webhook/telegram`",
    };
  }

  if (action === "off") {
    return {
      success: true,
      response: "🔗 Webhook will be disabled. Polling will resume.",
    };
  }

  return {
    success: false,
    response: `Unknown webhook action: ${sanitizeForEcho(action)}\nUsage: /webhook [on|off]`,
  };
}
