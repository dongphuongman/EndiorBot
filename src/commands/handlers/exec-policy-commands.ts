/**
 * Exec-Policy OTT Commands — Sprint 135 Task 1
 *
 * /exec-policy show    → current preset + effective rules
 * /exec-policy preset  → change preset (2-step confirm, C-HARD-1)
 * /exec-policy audit   → last 5 decisions
 *
 * @module commands/handlers/exec-policy-commands
 * @version 1.0.0
 * @date 2026-04-12
 * @status ACTIVE — Sprint 135
 */

import type { CommandResult } from "../command-dispatcher.js";
import {
  getPreset,
  setPreset,
  getEffectivePolicy,
  readAuditTail,
} from "../../security/exec-approvals/index.js";
import type { Preset } from "../../security/exec-approvals/types.js";

// ============================================================================
// Confirm state (C-HARD-1 + CPO-3: 2-step confirm for mutations)
// ============================================================================

const VALID_PRESETS = new Set<string>(["open", "balanced", "strict"]);
const CONFIRM_TTL_MS = 30_000; // 30s to confirm

interface PendingConfirm {
  preset: Preset;
  timestamp: number;
}

/** Per-chat pending confirm state. Key = chatId or userId. */
const pendingConfirms = new Map<string, PendingConfirm>();

/** Clean expired confirms */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, val] of pendingConfirms) {
    if (now - val.timestamp > CONFIRM_TTL_MS) pendingConfirms.delete(key);
  }
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * /exec-policy show — read current preset + effective rules
 */
function handleShow(): CommandResult {
  const preset = getPreset();
  const policy = getEffectivePolicy();

  const lines = [
    `🛡️ **Exec-Policy Status**`,
    ``,
    `**Preset:** \`${preset}\``,
    `**Ask mode:** ${policy.askMode}`,
    `**Allowlist:** ${policy.allowlist.length} patterns`,
    `**Hard-deny:** ${policy.hardDeny.length} patterns`,
    ``,
    `Allowlist (top 10):`,
    ...policy.allowlist.slice(0, 10).map(p => `  ✅ \`${p}\``),
    ...(policy.allowlist.length > 10 ? [`  ... +${policy.allowlist.length - 10} more`] : []),
    ``,
    `Hard-deny (top 5):`,
    ...policy.hardDeny.slice(0, 5).map(p => `  🚫 \`${p}\``),
    ...(policy.hardDeny.length > 5 ? [`  ... +${policy.hardDeny.length - 5} more`] : []),
  ];

  return { success: true, response: lines.join("\n") };
}

/**
 * /exec-policy preset <open|balanced|strict> — mutation with 2-step confirm
 */
function handlePreset(args: string[], chatId: string): CommandResult {
  cleanExpired();

  const targetPreset = args[0]?.toLowerCase();

  // Check if this is a YES confirmation for a pending change
  if (!targetPreset || targetPreset === "yes") {
    const pending = pendingConfirms.get(chatId);
    if (pending && targetPreset === "yes") {
      pendingConfirms.delete(chatId);
      const oldPreset = getPreset();
      setPreset(pending.preset);
      return {
        success: true,
        response: `✅ Exec-policy preset changed: \`${oldPreset}\` → \`${pending.preset}\``,
      };
    }
    if (!targetPreset) {
      return {
        success: false,
        response: `Usage: /exec-policy preset <open|balanced|strict>\nCurrent: \`${getPreset()}\``,
      };
    }
    // "yes" but no pending → stale
    return { success: false, response: `No pending preset change. Use: /exec-policy preset <open|balanced|strict>` };
  }

  if (!VALID_PRESETS.has(targetPreset)) {
    return {
      success: false,
      response: `Invalid preset "${targetPreset}". Valid: open, balanced, strict`,
    };
  }

  const current = getPreset();
  if (targetPreset === current) {
    return { success: true, response: `Preset already \`${current}\`. No change needed.` };
  }

  // C-HARD-1: Store pending + ask for confirmation
  pendingConfirms.set(chatId, {
    preset: targetPreset as Preset,
    timestamp: Date.now(),
  });

  return {
    success: true,
    response: [
      `⚠️ Change exec-policy preset: \`${current}\` → \`${targetPreset}\`?`,
      ``,
      `Reply \`/exec-policy preset yes\` within 30s to confirm.`,
      `Any other command cancels.`,
    ].join("\n"),
  };
}

/**
 * /exec-policy audit — last 5 decisions
 */
function handleAudit(): CommandResult {
  const entries = readAuditTail(5);

  if (entries.length === 0) {
    return { success: true, response: "📋 No exec-policy audit entries yet." };
  }

  const lines = [
    `📋 **Exec-Policy Audit** (last ${entries.length})`,
    ``,
  ];

  for (const entry of entries.reverse()) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const icon = entry.decision === "allow" ? "✅" : entry.decision === "deny" ? "🚫" : "❓";
    lines.push(`${icon} \`${time}\` **${entry.decision}** — ${entry.reason ?? "—"}`);
  }

  return { success: true, response: lines.join("\n") };
}

// ============================================================================
// Main dispatcher
// ============================================================================

/**
 * Handle /exec-policy <subcommand> from OTT.
 */
export function handleExecPolicyOttCommand(
  args: string[],
  chatId: string,
): CommandResult {
  const sub = args[0]?.toLowerCase();

  switch (sub) {
    case "show":
      return handleShow();
    case "preset":
      return handlePreset(args.slice(1), chatId);
    case "audit":
      return handleAudit();
    default:
      return {
        success: true,
        response: [
          `🛡️ **Exec-Policy Commands**`,
          ``,
          `/exec-policy show — current preset + rules`,
          `/exec-policy preset <open|balanced|strict> — change preset`,
          `/exec-policy audit — last 5 decisions`,
        ].join("\n"),
      };
  }
}
