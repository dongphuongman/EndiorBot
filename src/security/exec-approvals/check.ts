/**
 * Exec-Policy Check
 *
 * Primary entry point: checkCommand(command, ctx) → ExecPolicyDecision
 *
 * Decision logic:
 *   1. Non-CLI origin → deny (fail-closed, OTT routing deferred per ADR-046 Amendment 1)
 *   2. Hard-deny match → deny
 *   3. Allow match → allow
 *   4. askMode:
 *      - "off" → allow (open preset behavior)
 *      - "always" → prompt (strict preset behavior)
 *      - "on-miss" → prompt (balanced preset on unknown command)
 *
 * Writes audit record as a side effect.
 *
 * @module security/exec-approvals/check
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL, M1-exec-policy-design.md §2.1
 * @sprint 132
 */

import type { ExecPolicyDecision, PolicyContext } from "./types.js";
import { getEffectivePolicy } from "./effective-policy.js";
import { findMatchingPattern } from "./allowlist-pattern.js";
import { writeAuditRecord } from "./audit.js";

// ============================================================================
// checkCommand
// ============================================================================

/**
 * Check whether a command is allowed under the current exec-policy.
 *
 * This is the single call site used by AutonomousSessionManager.executeTaskWork()
 * (see src/sessions/autonomous/manager.ts:666 integration point).
 *
 * @param command - The command string to evaluate (normalized internally)
 * @param ctx - Policy context (session, agent, gate, channel, etc.)
 * @returns ExecPolicyDecision with decision, reason, and optional matched pattern
 */
export function checkCommand(command: string, ctx: PolicyContext): ExecPolicyDecision {
  const policy = getEffectivePolicy();

  // --- Non-CLI origin: fail closed (ADR-046 Amendment 1) ---
  // OTT prompt routing is deferred until an OTT adapter wires through an autonomous session.
  // Until that sprint lands, any non-CLI originChannel is denied here.
  if (ctx.originChannel !== "cli") {
    const decision: ExecPolicyDecision = {
      decision: "deny",
      reason: `OTT prompt routing deferred — awaiting adapter wiring (originChannel: ${ctx.originChannel})`,
    };
    _writeAudit(command, "deny", decision.reason, undefined, ctx, policy.preset);
    return decision;
  }

  // --- Hard-deny: wins over allowlist ---
  const hardDenyMatch = findMatchingPattern(policy.hardDeny, command);
  if (hardDenyMatch !== null) {
    const decision: ExecPolicyDecision = {
      decision: "deny",
      reason: `hard-deny matched: ${hardDenyMatch}`,
      matchedPattern: hardDenyMatch,
    };
    _writeAudit(command, "deny", decision.reason, hardDenyMatch, ctx, policy.preset);
    return decision;
  }

  // --- Allowlist match: allow ---
  const allowMatch = findMatchingPattern(policy.allowlist, command);
  if (allowMatch !== null) {
    const decision: ExecPolicyDecision = {
      decision: "allow",
      reason: `allowlist matched: ${allowMatch}`,
      matchedPattern: allowMatch,
    };
    _writeAudit(command, "allow", decision.reason, allowMatch, ctx, policy.preset);
    return decision;
  }

  // --- No match: consult askMode ---
  if (policy.askMode === "off") {
    // open preset: allow anything not hard-denied
    const decision: ExecPolicyDecision = {
      decision: "allow",
      reason: "askMode:off — no match required",
    };
    _writeAudit(command, "allow", decision.reason, undefined, ctx, policy.preset);
    return decision;
  }

  // askMode "always" or "on-miss" → prompt
  const decision: ExecPolicyDecision = {
    decision: "prompt",
    reason: `askMode:${policy.askMode} — no allowlist match`,
  };
  _writeAudit(command, "prompt", decision.reason, undefined, ctx, policy.preset);
  return decision;
}

// ============================================================================
// Internal helpers
// ============================================================================

function _writeAudit(
  command: string,
  decision: "allow" | "deny" | "prompt",
  reason: string,
  matchedPattern: string | undefined,
  ctx: PolicyContext,
  preset: "open" | "balanced" | "strict",
): void {
  const record = {
    timestamp: new Date().toISOString(),
    sessionId: ctx.sessionId,
    agent: ctx.agent,
    command,
    preset,
    decision,
    reason,
    gate: ctx.gate,
    autoHandoff: ctx.autoHandoff,
    originChannel: ctx.originChannel,
  } as import("./types.js").ExecPolicyAuditRecord;

  if (ctx.taskId !== undefined) {
    record.taskId = ctx.taskId;
  }
  if (matchedPattern !== undefined) {
    record.matchedPattern = matchedPattern;
  }

  try {
    writeAuditRecord(record);
  } catch {
    // Best-effort; do not crash the session on audit write failure
  }
}
