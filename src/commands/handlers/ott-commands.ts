/**
 * OTT Command Handlers
 *
 * Handlers for OTT-facing commands: /agents, /teams, /config, /capture,
 * /kill, /send, /cost, and the help message generator.
 *
 * @module commands/handlers/ott-commands
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-019 OTT Channel + ADR-030 Unified Commands
 */

import { join } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";

import type { AgentRole } from "../../agents/types/handoff.js";
import type { TeamId } from "../../agents/types/team.js";
import { getTeamRegistry } from "../../agents/orchestrator/team-registry.js";
import { getAgentIcon } from "../../channels/telegram/keyboards.js";
import { CAPTURE_LINE_LIMITS } from "../../bridge/types.js";
import { getAgentLauncher } from "../../bridge/agent-launcher.js";
import { getSessionRegistry } from "../../bridge/session-registry.js";
import { getTmuxBridge } from "../../bridge/tmux/tmux-bridge.js";
import { redactBridgeOutput } from "../../bridge/security/output-redactor.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import {
  incrementTurnCount,
  getTurnCount,
  loadTurnContextFromActive,
  buildTurnContext,
  shouldRefreshContext,
} from "../../bridge/intelligence/turn-context.js";
import { serializeEnvelopeForInjection, buildFullEnvelope } from "../../bridge/intelligence/envelope-builder.js";
import { evaluateOutput } from "../../bridge/intelligence/output-evaluator.js";
import { appendEvaluation, generateEvaluationId } from "../../bridge/intelligence/evaluation-store.js";
import { createPricingRegistry } from "../../budget/pricing-registry.js";

import type { CommandResult } from "../command-dispatcher.js";
import { sanitizeForEcho, TEAM_ICONS } from "./shared.js";
import { activeSessionMap } from "./bridge-commands.js";

export type { CommandResult } from "../command-dispatcher.js";

// ============================================================================
// Agents & Teams Commands
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

// ============================================================================
// Config Command
// ============================================================================

/**
 * Handle /config command — show project configuration.
 */
export function handleConfigCommand(): CommandResult {
  return {
    success: true,
    response: "⚙️ *Project Config*\n\nUse: `@pm show project config` for full configuration.",
  };
}

// ============================================================================
// Capture Command
// ============================================================================

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

// ============================================================================
// Kill Command
// ============================================================================

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
// Send Command
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
      // CPO C5: show current mode + actionable fix options (Sprint 104)
      response: `Cannot /send to READ mode session (\`${session.id}\`).\n\nCurrent mode: READ\nUse \`/mode patch\` to change, or relaunch with \`--risk patch\`.`,
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
      const envelope = await buildFullEnvelope(dummyPersona);
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
// Evaluator (internal helper — also used by eval-commands.ts)
// ============================================================================

/**
 * Run evaluation on a session's tmux output.
 * Captures output, evaluates, stores, and logs audit event.
 * Returns formatted summary or null on failure.
 */
export async function runEvaluation(
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

// Re-export for backward compat (used in eval-commands.ts)
export { getTurnCount };

// ============================================================================
// Cost Command
// ============================================================================

/**
 * Handle /cost command — show token usage and estimated cost.
 * Reads from RL training JSONL files to aggregate token_usage fields.
 */
export function handleCostCommand(args: string[]): CommandResult {
  const rlDir = join(homedir(), ".endiorbot", "rl-training-data");

  if (!existsSync(rlDir)) {
    return { success: true, response: "No usage data available yet." };
  }

  // Parse period: default 24h, optional --period 7d
  let periodHours = 24;
  const periodIdx = args.indexOf("--period");
  if (periodIdx >= 0 && args[periodIdx + 1]) {
    const val = args[periodIdx + 1]!;
    if (val.endsWith("d")) periodHours = parseInt(val, 10) * 24;
    else if (val.endsWith("h")) periodHours = parseInt(val, 10);
  }
  const cutoff = Date.now() - periodHours * 60 * 60 * 1000;

  // C5 fix: Build set of date strings within the period to filter filenames
  const relevantDates = new Set<string>();
  for (let d = new Date(cutoff); d <= new Date(); d = new Date(d.getTime() + 86_400_000)) {
    relevantDates.add(d.toISOString().slice(0, 10));
  }

  // Read JSONL files
  let totalInput = 0;
  let totalOutput = 0;
  let totalRecords = 0;
  let recordsWithTokens = 0;
  const providerTokens = new Map<string, { input: number; output: number }>();

  try {
    const files = readdirSync(rlDir).filter((f: string) => {
      if (!f.endsWith(".jsonl")) return false;
      // C5 fix: Only read files whose date matches the period
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) return relevantDates.has(dateMatch[1]!);
      return true; // non-dated files: read anyway
    });
    for (const file of files) {
      const content = readFileSync(join(rlDir, file), "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as {
            timestamp?: number;
            provider?: string;
            token_usage?: { input?: number; output?: number; total?: number };
          };
          if (rec.timestamp && rec.timestamp < cutoff) continue;

          totalRecords++;
          const tu = rec.token_usage;
          if (tu) {
            recordsWithTokens++;
            const inp = tu.input ?? 0;
            const out = tu.output ?? 0;
            totalInput += inp;
            totalOutput += out;

            const provider = rec.provider ?? "unknown";
            const existing = providerTokens.get(provider) ?? { input: 0, output: 0 };
            existing.input += inp;
            existing.output += out;
            providerTokens.set(provider, existing);
          }
        } catch { /* skip malformed line */ }
      }
    }
  } catch {
    return { success: true, response: "Unable to read usage data." };
  }

  if (totalRecords === 0) {
    return { success: true, response: `No usage data in the last ${periodHours}h.` };
  }

  const totalTokens = totalInput + totalOutput;

  // Cost estimation
  const registry = createPricingRegistry();
  let totalCost = 0;
  const providerLines: string[] = [];

  for (const [provider, tokens] of providerTokens) {
    const cost = registry.calculateCost(provider, tokens.input, tokens.output);
    totalCost += cost;
    const providerTotal = tokens.input + tokens.output;
    providerLines.push(`  ${provider}: $${cost.toFixed(4)} (${providerTotal.toLocaleString()} tokens)`);
  }

  // C6 fix: Show records with/without token data for clarity
  const recordsLabel = recordsWithTokens < totalRecords
    ? `Records: ${totalRecords} (${recordsWithTokens} with token data)`
    : `Records: ${totalRecords}`;

  const periodLabel = periodHours >= 24 ? `${periodHours / 24}d` : `${periodHours}h`;
  const lines = [
    `Token Usage (last ${periodLabel}):`,
    `  Input:  ${totalInput.toLocaleString()} tokens`,
    `  Output: ${totalOutput.toLocaleString()} tokens`,
    `  Total:  ${totalTokens.toLocaleString()} tokens`,
    `  ${recordsLabel}`,
    "",
    `Estimated Cost: ~$${totalCost.toFixed(4)}`,
    ...providerLines,
  ];

  return { success: true, response: lines.join("\n") };
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
  /plan <description> — Structured dev plan (saved to drafts/)
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
  /cost [--period 7d] — Token usage & cost
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
