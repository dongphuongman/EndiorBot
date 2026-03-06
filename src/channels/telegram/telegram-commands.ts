/**
 * Telegram Extended Commands
 *
 * Handles 10 new OTT commands for Sprint 76:
 * /gate, /compliance, /fix, /consult, /agents, /teams,
 * /config, /init, /mode, /webhook
 *
 * @module channels/telegram/telegram-commands
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 76
 * @authority ADR-019 OTT Channel Enhancement
 * @sprint 76
 */

import type { AgentRole } from "../../agents/types/handoff.js";
import type { TeamId } from "../../agents/types/team.js";
import { getTeamRegistry } from "../../agents/orchestrator/team-registry.js";
import { getAgentIcon } from "./keyboards.js";

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
    response: `📊 Gate ${safeGateId}\n\nRun \`endiorbot gate check ${safeGateId}\` for full evaluation.\nOr use: \`@pm check gate ${safeGateId} status\``,
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

/**
 * Generate the full dynamic help message.
 * Lists all 14 commands grouped by category + agent/team format.
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
