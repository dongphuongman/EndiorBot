/**
 * Telegram Extended Commands
 *
 * Sprint 76: 10 OTT commands (/gate, /compliance, /fix, /consult, /agents, /teams, etc.)
 * Sprint 82.5: 6 Bridge commands (/link, /launch, /sessions, /switch, /capture, /kill)
 *
 * @module channels/telegram/telegram-commands
 * @version 2.0.0
 * @date 2026-03-07
 * @status ACTIVE - Sprint 82.5
 * @authority ADR-019 OTT Channel + ADR-024 Notification Bridge
 * @sprint 82.5
 */

import { resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import type { AgentRole } from "../../agents/types/handoff.js";
import type { TeamId } from "../../agents/types/team.js";
import { getTeamRegistry } from "../../agents/orchestrator/team-registry.js";
import { getAgentIcon } from "./keyboards.js";
import { VALID_AGENT_TYPES, CAPTURE_LINE_LIMITS, type AgentProviderType } from "../../bridge/types.js";
import { getAgentLauncher } from "../../bridge/agent-launcher.js";
import { isValidAgentRole, VALID_AGENT_ROLES } from "../../bridge/intelligence/envelope.js";
import { getSessionRegistry } from "../../bridge/session-registry.js";
import { getTmuxBridge } from "../../bridge/tmux/tmux-bridge.js";
import { redactBridgeOutput } from "../../bridge/security/output-redactor.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import type { PermissionRequest } from "../../bridge/types.js";
import { createPermissionKeyboard } from "./keyboards.js";
import type { InlineKeyboardMarkup } from "./keyboards.js";
import {
  buildTurnContext,
  loadTurnContextFromActive,
  incrementTurnCount,
  getTurnCount,
  shouldRefreshContext,
} from "../../bridge/intelligence/turn-context.js";
import { serializeEnvelopeForInjection, buildFullEnvelope } from "../../bridge/intelligence/envelope-builder.js";
import { evaluateOutput } from "../../bridge/intelligence/output-evaluator.js";
import { appendEvaluation, generateEvaluationId } from "../../bridge/intelligence/evaluation-store.js";
import { assessComplexity } from "../../bridge/intelligence/complexity-gate.js";
import { TEAM_LEADER_ROLES } from "../../bridge/intelligence/team-installer.js";
import { isValidTeamId } from "../../agents/types/team.js";
import { getFeatureFlagWithEnvOverride } from "../../config/feature-flags.js";
import { createComplexityGateKeyboard, createTeamCostKeyboard } from "./keyboards.js";
import { randomBytes } from "node:crypto";
import { getTeamStatus, getTeamSessions, formatTeamDashboard } from "../../bridge/teams/team-monitor.js";
import { getBridgePolicyManager } from "../../bridge/security/bridge-policy.js";
import { createPricingRegistry } from "../../budget/pricing-registry.js";

/**
 * Sanitize user input for safe echo in Telegram Markdown responses.
 * Strips Markdown special chars and limits length to prevent injection.
 */
export function sanitizeForEcho(input: string): string {
  return input
    .replace(/[*_`\[\]()~>#+\-=|{}.!\\]/g, "")
    .slice(0, 50);
}

// ============================================================================
// Types
// ============================================================================

export interface CommandResult {
  success: boolean;
  response: string;
  /** Optional inline keyboard for Telegram (Sprint 90 — complexity gate) */
  reply_markup?: InlineKeyboardMarkup;
}

// ============================================================================
// Agent & Team Icons
// ============================================================================

const TEAM_ICONS: Record<TeamId, string> = {
  fullstack: "🛠️",
  planning: "📋",
  design: "🎨",
  dev: "💻",
  qa: "🧪",
  ops: "🚀",
  executive: "👔",
};

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle /agents command — list all agents with icons.
 */
export function handleAgentsCommand(): CommandResult {
  const lines: string[] = ["🤖 *Available Agents*", ""];

  // SE4A Executors
  lines.push("*SE4A Executors:*");
  const se4a: AgentRole[] = ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack"];
  for (const agent of se4a) {
    lines.push(`  ${getAgentIcon(agent)} @${agent}`);
  }

  lines.push("");
  lines.push("*SE4H Advisors (STANDARD+):*");
  const se4h: AgentRole[] = ["ceo", "cpo", "cto"];
  for (const agent of se4h) {
    lines.push(`  ${getAgentIcon(agent)} @${agent}`);
  }

  lines.push("");
  lines.push("Usage: `@agent task` or `[@agent: task]`");

  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /teams command — list tier-appropriate teams with leaders.
 */
export function handleTeamsCommand(
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE",
): CommandResult {
  const registry = getTeamRegistry(tier);
  const lines: string[] = ["👥 *Available Teams*", ""];

  const allTeamIds: TeamId[] = ["fullstack", "planning", "design", "dev", "qa", "ops", "executive"];

  for (const teamId of allTeamIds) {
    const lookup = registry.getTeam(teamId);
    if (!lookup.found || !lookup.team.isActive) continue;

    const icon = TEAM_ICONS[teamId] ?? "🔹";
    lines.push(`  ${icon} @${teamId} → leader: @${lookup.team.leader}`);
  }

  lines.push("");
  lines.push(`Tier: ${registry.getTier()}`);
  lines.push("Usage: `@team task` (routes to leader with team context)");

  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /gate command — show gate status.
 */
export function handleGateCommand(args: string[]): CommandResult {
  const gateId = args[0];
  if (!gateId) {
    return {
      success: true,
      response: "📊 *Quality Gates*\n\nUsage: `/gate <gateId>`\nExample: `/gate G2`\n\nGates: G0.1, G1, G2, G3, G4",
    };
  }

  // Gate check is CLI-bound; OTT provides info message
  const safeGateId = sanitizeForEcho(gateId);
  return {
    success: true,
    response: `📊 Gate ${safeGateId}\n\nRun \`endiorbot gate recommend ${safeGateId}\` for full evaluation.\nOr use: \`@pm check gate ${safeGateId} status\``,
  };
}

/**
 * Handle /compliance command — show compliance score.
 */
export function handleComplianceCommand(args: string[]): CommandResult {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "score" || subCommand === "check") {
    return {
      success: true,
      response: "📋 *Compliance*\n\nRun `endiorbot compliance score` for full report.\nOr use: `@pm check compliance status`\n\nTo fix issues: `/fix --dry-run`",
    };
  }

  return {
    success: true,
    response: `📋 Compliance: unknown sub-command '${sanitizeForEcho(subCommand)}'\nUsage: /compliance [score|check]`,
  };
}

/**
 * Handle /fix command — Sprint 75 compliance fix via OTT.
 *
 * - `/fix` → dry-run (safe preview)
 * - `/fix --yes` → auto-confirm (requires OTT confirmation first)
 * - `/fix --stage 01-planning` → fix specific stage only
 */
export function handleFixCommand(args: string[]): CommandResult {
  const dryRun = !args.includes("--yes");
  const stageIdx = args.indexOf("--stage");
  const stage = stageIdx >= 0 ? args[stageIdx + 1] : undefined;

  const parts: string[] = ["🔧 *Compliance Fix*", ""];

  if (dryRun) {
    parts.push("Mode: *dry-run* (preview only, no file writes)");
  } else {
    parts.push("Mode: *live* (files will be modified)");
  }

  if (stage) {
    parts.push(`Stage: \`${sanitizeForEcho(stage)}\``);
  }

  parts.push("");
  parts.push("Run `endiorbot compliance fix` for full execution.");
  parts.push("Or use: `@pm run compliance fix" + (dryRun ? " --dry-run" : "") + (stage ? ` --stage ${sanitizeForEcho(stage)}` : "") + "`");
  parts.push("");
  parts.push("Options:");
  parts.push("  `/fix` — preview (dry-run)");
  parts.push("  `/fix --yes` — apply fixes (via CLI)");
  parts.push("  `/fix --stage 01-planning` — fix specific stage");

  return { success: true, response: parts.join("\n") };
}

/**
 * Handle /consult command — multi-model consultation.
 */
export function handleConsultCommand(args: string[]): CommandResult {
  const query = args.join(" ");
  if (!query) {
    return {
      success: true,
      response: "🧠 *Multi-Model Consultation*\n\nUsage: `/consult <query>`\nExample: `/consult Redis vs PostgreSQL for sessions?`",
    };
  }

  return {
    success: true,
    response: `🧠 *Consultation*\n\nQuery: ${sanitizeForEcho(query.slice(0, 200))}\n\nRun \`endiorbot consult "${sanitizeForEcho(query.slice(0, 100))}"\` for full multi-model response.\nOr use: \`@researcher ${sanitizeForEcho(query.slice(0, 100))}\``,
  };
}

/**
 * Handle /config command — show project configuration.
 */
export function handleConfigCommand(): CommandResult {
  return {
    success: true,
    response: "⚙️ *Project Config*\n\nRun `endiorbot config show` for full configuration.\nOr use: `@pm show project config`",
  };
}

/**
 * Handle /init command — show init status.
 */
export function handleInitCommand(): CommandResult {
  return {
    success: true,
    response: "🏗️ *Init Status*\n\nRun `endiorbot init --status` to check project initialization.\nOr use: `@pm check init status`",
  };
}

/**
 * Handle /mode command — set invoke mode.
 */
export function handleModeCommand(args: string[], currentMode: string): CommandResult {
  const requestedMode = args[0]?.toLowerCase();

  if (!requestedMode) {
    return {
      success: true,
      response: `🔒 *Current Mode:* ${currentMode}\n\nUsage: /mode [read|patch]\n\n• READ — safe, read-only operations (default)\n• PATCH — file modifications (requires confirmation)`,
    };
  }

  if (requestedMode === "read") {
    return {
      success: true,
      response: "🔒 Mode set to *READ* (read-only, safe).",
    };
  }

  if (requestedMode === "patch") {
    // PATCH mode requires confirmation — handled by mode escalation
    return {
      success: true,
      response: "⚠️ *PATCH mode requested.*\n\nPATCH mode allows file modifications.\nUse `@agent PATCH: task` to invoke with PATCH mode.\nEach PATCH invocation requires explicit confirmation.",
    };
  }

  return {
    success: false,
    response: `Unknown mode: ${sanitizeForEcho(requestedMode)}\nValid modes: read, patch`,
  };
}

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

// ============================================================================
// Bridge Commands (Sprint 82.5 — ADR-024)
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

/**
 * In-memory identity binding: telegramUserId → actorId.
 * All linked users get "ceo@endiorbot" (single-user system).
 */
const identityMap = new Map<string, string>();

/**
 * In-memory active session per actorId.
 */
const activeSessionMap = new Map<string, string>();

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

const pendingTeamLaunches = new Map<string, PendingTeamLaunch>();
const pendingTeamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const TEAM_GATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Exported for testing */
export { pendingTeamLaunches, pendingTeamTimeouts, TEAM_GATE_TIMEOUT_MS };

/**
 * Handle /link command — bind Telegram identity to EndiorBot actorId.
 */
export function handleLinkCommand(
  telegramUserId: string,
  username?: string,
): CommandResult {
  const actorId = "ceo@endiorbot";
  identityMap.set(telegramUserId, actorId);

  const displayName = username ?? "unknown";

  getBridgeAuditLogger().log({
    event: "identity_link",
    actorId,
    actor: "telegram",
    details: { telegramUserId, username: displayName },
  });

  return {
    success: true,
    response: `✅ Linked as *${actorId}* (Telegram: ${sanitizeForEcho(displayName)})

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

  // Parse --as and --as-team flags
  let agentRole: AgentRole | undefined;
  let teamId: TeamId | undefined;
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
  const rawPath = filteredArgs[1] ?? process.cwd();
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
        reply_markup: createComplexityGateKeyboard(gateId),
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
    response: `🚀 *Agent Launched*

Agent: ${session.agentType}${roleLabel}${teamLabel}
Session: \`${session.id}\`
tmux: \`${session.tmuxTarget}\`
Path: ${sanitizeForEcho(session.projectPath.slice(0, 50))}
Mode: ${session.riskMode}

Use /capture to see output, /kill to stop.`,
  };
}

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

/**
 * Handle /capture command — capture output from active session's tmux pane.
 */
export async function handleCaptureCommand(
  args: string[],
  actorId: string,
  _telegramUserId: string,
): Promise<CommandResult> {
  const sessionId = activeSessionMap.get(actorId);
  if (!sessionId) {
    return {
      success: false,
      response: "No active session. Use /launch first or /switch to select one.",
    };
  }

  const registry = getSessionRegistry();
  const session = registry.get(sessionId);
  if (!session || session.status !== "active") {
    activeSessionMap.delete(actorId);
    return {
      success: false,
      response: "No active session. Previous session may have ended.",
    };
  }

  const lineCount = args[0] ? parseInt(args[0], 10) : undefined;
  const tmux = getTmuxBridge();

  try {
    const raw = await tmux.capturePane(session.tmuxTarget, lineCount);
    const redacted = redactBridgeOutput(raw, session.riskMode);

    if (redacted.blocked) {
      return {
        success: false,
        response: `Capture blocked: ${redacted.reason ?? "sensitive content detected"}`,
      };
    }

    getBridgeAuditLogger().log({
      event: "capture",
      actorId,
      actor: "telegram",
      sessionId: session.id,
      agentType: session.agentType,
      details: { lines: lineCount, violations: redacted.violations },
    });

    return {
      success: true,
      response: `📸 *Capture* (\`${session.id}\`${session.teamId ? ` — ${session.teamId}-team` : ""})\n\n\`\`\`\n${redacted.content}\n\`\`\``,
    };
  } catch (err) {
    return {
      success: false,
      response: `Capture failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

/**
 * Handle /kill command — kill a bridge session.
 */
export async function handleKillCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /kill <sessionId>\n\nUse /sessions to list active sessions.",
    };
  }

  const killTarget = args[0] ?? "";
  const launcher = getAgentLauncher();
  const result = await launcher.kill(killTarget, actorId);

  if (!result.success) {
    return {
      success: false,
      response: `Kill failed: ${result.error ?? "Session not found"}`,
    };
  }

  // Clear from active session if it was the current one
  if (activeSessionMap.get(actorId) === killTarget) {
    activeSessionMap.delete(actorId);
  }

  return {
    success: true,
    response: `💀 Session \`${sanitizeForEcho(killTarget.slice(0, 40))}\` killed.`,
  };
}

// ============================================================================
// /send Command (Sprint 86 — ADR-024 §8.5)
// ============================================================================

/** CTO A2: Maximum payload length for sendKeys */
const SEND_MAX_CHARS = 4096;

/**
 * Handle /send command — send task instruction to a running agent session.
 *
 * Usage: /send <sessionId> <message>
 *
 * Prepends turn-time context prefix (sprint, blockers, task) to the message
 * before sending via tmux sendKeys. Only allowed for PATCH/INTERACTIVE sessions.
 *
 * CTO A2: Payload (context + message) capped at 4096 chars.
 * CTO W3: sendKeys uses tmux load-buffer + paste-buffer, so shell metacharacters
 * in the message are NOT interpreted — no sanitization needed here.
 */
export async function handleSendCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  const sessionId = args[0];
  if (!sessionId) {
    return {
      success: false,
      response: `Usage: /send <sessionId> <message>

Example: /send bridge_123_abc fix the auth bug

Use /sessions to list active sessions.`,
    };
  }

  const messageParts = args.slice(1);
  if (messageParts.length === 0) {
    return {
      success: false,
      response: "Missing message. Usage: /send <sessionId> <message>",
    };
  }

  const message = messageParts.join(" ");

  // Look up session
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session || session.status !== "active") {
    return {
      success: false,
      response: `Session not found or inactive: \`${sanitizeForEcho(sessionId.slice(0, 40))}\`\n\nUse /sessions to list active sessions.`,
    };
  }

  // RiskMode enforcement: /send only allowed in PATCH/INTERACTIVE
  if (session.riskMode === "read") {
    return {
      success: false,
      response: `Cannot /send to READ mode session.\n\nUse /mode patch to change mode, or /launch with --risk patch.`,
    };
  }

  // Sprint 87: Increment turn counter for this session
  const turnCount = incrementTurnCount(session.id);

  // Sprint 88: Pre-send auto-evaluation — evaluate previous turn before sending next
  let evalSummary = "";
  if (turnCount > 1) {
    try {
      const summary = await runEvaluation(
        session.id,
        session.tmuxTarget,
        session.riskMode,
        turnCount - 1,
        actorId,
        session.agentType,
      );
      if (summary) evalSummary = summary;
    } catch {
      // Evaluation failure is non-fatal — proceed with send
    }
  }

  // Build turn-time context prefix
  const contextData = loadTurnContextFromActive();
  let contextPrefix = buildTurnContext(contextData);

  // Sprint 87 (CTO MF-2): On refresh turns (every 10th), prepend richer
  // context from envelope builder. Refresh logic lives here (orchestrator),
  // not in turn-context.ts (which stays standalone).
  if (shouldRefreshContext(session.id)) {
    try {
      const dummyPersona = { agentRole: "assistant" as const, soulContent: "", soulContentHash: "" };
      const envelope = buildFullEnvelope(dummyPersona);
      const serialized = serializeEnvelopeForInjection(envelope);
      if (serialized) {
        contextPrefix = serialized + "\n" + contextPrefix;
      }
    } catch {
      // Refresh failure is non-fatal — use basic context
    }
  }

  // Compose full payload
  const payload = contextPrefix ? contextPrefix + message : message;

  // CTO A2: sendKeys MAX 4096 chars
  if (payload.length > SEND_MAX_CHARS) {
    return {
      success: false,
      response: `Message too long (${payload.length} chars). Maximum is ${SEND_MAX_CHARS} chars (including context prefix of ${contextPrefix.length} chars).`,
    };
  }

  // Send to tmux
  const tmux = getTmuxBridge();
  await tmux.sendKeys(session.tmuxTarget, payload);
  await tmux.sendEnter(session.tmuxTarget);

  // Audit log
  getBridgeAuditLogger().log({
    event: "send_command",
    actorId,
    actor: "telegram",
    sessionId: session.id,
    agentType: session.agentType,
    details: {
      messageLength: message.length,
      contextPrefixLength: contextPrefix.length,
      fullPayloadLength: payload.length,
      turnCount,
    },
  });

  const contextInfo = contextPrefix ? " (with context)" : "";
  const evalInfo = evalSummary ? `\n\n📊 *Turn ${turnCount - 1} eval:*\n${evalSummary}` : "";
  return {
    success: true,
    response: `📤 *Sent${contextInfo}*\n\nSession: \`${session.id}\`\nLength: ${payload.length} chars${evalInfo}`,
  };
}

// ============================================================================
// Evaluator (Sprint 88 — ADR-025 Post-turn)
// ============================================================================

/**
 * Run evaluation on a session's tmux output.
 * Captures output, evaluates, stores, and logs audit event.
 * Returns formatted summary or null on failure.
 */
async function runEvaluation(
  sessionId: string,
  tmuxTarget: string,
  riskMode: string,
  turnNumber: number,
  actorId: string,
  agentType?: string,
): Promise<string | null> {
  const captureLines = CAPTURE_LINE_LIMITS[riskMode as keyof typeof CAPTURE_LINE_LIMITS] ?? 50;
  const tmux = getTmuxBridge();
  const raw = await tmux.capturePane(tmuxTarget, captureLines);

  const evalResult = evaluateOutput(raw, turnNumber);
  if (!evalResult) return null;

  const record = {
    id: generateEvaluationId(),
    ts: new Date().toISOString(),
    turnNumber,
    score: evalResult.score,
    signals: evalResult.signals,
    summary: evalResult.summary,
    captureHash: evalResult.captureHash,
    captureLines: raw.split("\n").length,
  };

  appendEvaluation(sessionId, record);

  const auditEntry: { event: "evaluation_recorded"; actorId: string; actor: "telegram"; sessionId: string; agentType?: string; details: Record<string, unknown> } = {
    event: "evaluation_recorded",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      turnNumber,
      score: evalResult.score,
      captureLines: record.captureLines,
    },
  };
  if (agentType) auditEntry.agentType = agentType;
  getBridgeAuditLogger().log(auditEntry);

  const badge = evalResult.score >= 60 ? "✅ PASS" : "⚠️ WARN";
  return `${badge} Score: ${evalResult.score}/100\n${evalResult.summary}`;
}

/**
 * Handle /eval command — evaluate output from an agent session.
 *
 * Usage: /eval <sessionId>
 *
 * Captures tmux output, runs 5-signal vibecoding analysis,
 * stores evaluation, and returns formatted score card.
 *
 * @authority ADR-025 Sprint 88
 */
export async function handleEvalCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  const sessionId = args[0];
  if (!sessionId) {
    return {
      success: false,
      response: `Usage: /eval <sessionId>\n\nEvaluate agent output quality (5-signal vibecoding index).\nUse /sessions to list active sessions.`,
    };
  }

  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session || session.status !== "active") {
    return {
      success: false,
      response: `Session not found or inactive: \`${sanitizeForEcho(sessionId.slice(0, 40))}\`\n\nUse /sessions to list active sessions.`,
    };
  }

  try {
    const turnNumber = getTurnCount(session.id) || 1;
    const summary = await runEvaluation(
      session.id,
      session.tmuxTarget,
      session.riskMode,
      turnNumber,
      actorId,
      session.agentType,
    );

    if (!summary) {
      return {
        success: false,
        response: `No evaluatable output captured from session \`${session.id}\`.\n\nThe agent may not have produced enough output yet.`,
      };
    }

    return {
      success: true,
      response: `📊 *Evaluation* — \`${session.id}\`\n\n${summary}`,
    };
  } catch (err) {
    return {
      success: false,
      response: `Evaluation failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

// ============================================================================
// Permission Approval (Sprint 85 — ADR-024 §8.4)
// ============================================================================

/**
 * Format a permission request as a Telegram message with inline keyboard.
 *
 * Returns the message text and InlineKeyboardMarkup for the bot to send.
 */
export function formatPermissionMessage(
  request: PermissionRequest,
): { text: string; keyboard: InlineKeyboardMarkup } {
  const fileInfo = request.filePath
    ? `\nFile: \`${sanitizeForEcho(request.filePath.slice(0, 60))}\``
    : "";

  const text = `🔐 *Permission Request*

Session: \`${request.sessionId}\`
Tool: *${sanitizeForEcho(request.toolName)}*${fileInfo}
Mode: ${request.riskMode}
Expires: 5 minutes

Approve or deny this operation:`;

  return {
    text,
    keyboard: createPermissionKeyboard(request.id),
  };
}

/**
 * Format a permission decision confirmation message.
 */
export function formatPermissionDecisionMessage(
  permissionId: string,
  decision: string,
  toolName: string,
): string {
  const icon = decision === "approve" ? "✅" : decision === "deny" ? "❌" : "⏰";
  const label = decision === "approve" ? "Approved" : decision === "deny" ? "Denied" : "Timed out";
  return `${icon} Permission *${label}*\n\nTool: ${sanitizeForEcho(toolName)}\nID: \`${permissionId}\``;
}

/**
 * Format a permission timeout notification.
 */
export function formatPermissionTimeoutMessage(
  request: PermissionRequest,
): string {
  return `⏰ Permission *timed out* (auto-denied)

Tool: ${sanitizeForEcho(request.toolName)}
Session: \`${request.sessionId}\``;
}

// ============================================================================
// Team Monitoring (Sprint 91 — ADR-026)
// ============================================================================

/** In-memory cost threshold overrides (teamId → adjusted threshold USD). */
const costThresholdOverrides = new Map<string, number>();

export { costThresholdOverrides };

/**
 * Handle /team-status command — show team dashboard with health + cost.
 */
export async function handleTeamStatusCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /team-status <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /sessions to check." };
  }

  const tmux = getTmuxBridge();
  const policy = getBridgePolicyManager().getPolicy();
  const pricingRegistry = createPricingRegistry();
  const override = costThresholdOverrides.get(session.teamId);

  const deps: import("../../bridge/teams/team-monitor.js").TeamStatusDeps = {
    registry,
    tmux,
    policy,
    pricingRegistry,
  };
  if (override !== undefined) deps.thresholdOverride = override;

  const status = await getTeamStatus(session.teamId, deps);

  const dashboard = formatTeamDashboard(status);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_status_checked",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId: session.teamId,
      memberCount: status.members.length,
      totalCostUsd: status.totalCostUsd,
      thresholdExceeded: status.thresholdExceeded,
    },
  });

  // If threshold exceeded, include cost keyboard
  const result: CommandResult = { success: true, response: dashboard };
  if (status.thresholdExceeded) {
    result.reply_markup = createTeamCostKeyboard(session.teamId);
  }
  return result;
}

/**
 * Handle /kill-team command — kill all sessions in a team.
 */
export async function handleKillTeamCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /kill-team <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /kill for solo sessions." };
  }

  const teamId = session.teamId;
  const teamSessions = getTeamSessions(teamId, registry);

  if (teamSessions.length === 0) {
    return { success: true, response: `Team ${teamId}-team already stopped.` };
  }

  const launcher = getAgentLauncher();
  const killedIds: string[] = [];

  for (const ts of teamSessions) {
    const killResult = await launcher.kill(ts.id, actorId);
    if (killResult.success) {
      killedIds.push(ts.id);
    }
    // Clear from active session if it was the current one
    if (activeSessionMap.get(actorId) === ts.id) {
      activeSessionMap.delete(actorId);
    }
  }

  // Clear cost override for this team
  costThresholdOverrides.delete(teamId);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_killed",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId,
      memberCount: killedIds.length,
      sessionIds: killedIds,
    },
  });

  return {
    success: true,
    response: `💀 Team ${teamId}-team killed (${killedIds.length} members stopped).`,
  };
}

/**
 * Handle team cost threshold callback (Sprint 91).
 *
 * action: "extend" → add $2 to cost override
 * action: "stop" → kill team
 */
export async function handleTeamCostCallback(
  action: string,
  teamId: string,
  actorId: string,
): Promise<CommandResult> {
  const audit = getBridgeAuditLogger();

  if (action === "extend") {
    const policy = getBridgePolicyManager().getPolicy();
    const current = costThresholdOverrides.get(teamId) ?? policy.teamCostThresholdUsd;
    const newThreshold = current + 2.0;
    costThresholdOverrides.set(teamId, newThreshold);

    audit.log({
      event: "team_cost_extended",
      actorId,
      actor: "telegram",
      details: { teamId, previousThreshold: current, newThreshold },
    });

    return {
      success: true,
      response: `✅ Cost limit extended to $${newThreshold.toFixed(2)} for ${teamId}-team.`,
    };
  }

  if (action === "stop") {
    // Find any active session for this team to get a sessionId
    const registry = getSessionRegistry();
    const teamSessions = getTeamSessions(teamId, registry);
    if (teamSessions.length === 0) {
      return { success: true, response: `Team ${teamId}-team already stopped.` };
    }
    return handleKillTeamCommand([teamSessions[0]!.id], actorId);
  }

  return { success: false, response: `Unknown cost action: ${action}` };
}

// ============================================================================
// Help Message
// ============================================================================

/**
 * Generate the full dynamic help message.
 * Lists all commands grouped by category + agent/team format.
 */
export function generateHelpMessage(): string {
  return `🤖 *EndiorBot Commands*

*Workflow:*
  /approve <id> — Approve pending request
  /reject <id> [reason] — Reject pending request
  /status — Show pending approvals

*SDLC:*
  /gate [gateId] — Quality gate status
  /compliance [score|check] — Compliance score
  /fix [--dry-run] [--stage <stage>] — Compliance fix
  /init — Project init status

*AI:*
  /consult <query> — Multi-model consultation
  /agents — List all agents
  /teams — List tier teams

*Bridge (ADR-024):*
  /link — Link Telegram to EndiorBot identity
  /launch <agent> <path> [--as role] — Launch agent in tmux
  /sessions — List active sessions
  /switch <sessionId> — Switch active session
  /capture [lines] — Capture session output
  /send <sessionId> <message> — Send task to agent
  /eval <sessionId> — Evaluate agent output quality
  /kill <sessionId> — Kill a session

*Team Monitoring (Sprint 91):*
  /team-status <sessionId> — Team dashboard (health, cost)
  /kill-team <sessionId> — Kill entire team

*Remote Shell (ADR-024 D4):*
  /repos — List/add/remove repos
  /focus <name> — Set repo for this chat
  /where — Show current focus
  /cp suggest <task> — Copilot CLI suggest
  /cp explain <cmd> — Copilot CLI explain
  /cp status — Copilot CLI status
  /sh <cmd> — Read-only shell (allowlist)
  /attach [lines] — Capture shell output
  /run <cmd> — Run command (approval required)

*System:*
  /config — Project config
  /mode [read|patch] — Set invoke mode
  /webhook [on|off] — Toggle webhook (Telegram)
  /clear — Clear conversation history
  /help — This message

*Agent mention:*
  \`@agent task\` or \`[@agent: task]\`
  Example: \`@pm plan payment gateway\`

*Team mention:*
  \`@team task\` (routes to leader)
  Example: \`@planning review sprint goals\``;
}
