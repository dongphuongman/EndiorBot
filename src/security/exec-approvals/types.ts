/**
 * Exec-Policy Types
 *
 * Type definitions for the exec-policy command allowlist layer (Sprint 132 M1).
 * Fires BEFORE Autonomy Gates A/B/C in executeTaskWork().
 *
 * @module security/exec-approvals/types
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL (signed @cpo + @cto 2026-04-11)
 * @sprint 132
 */

// ============================================================================
// Preset
// ============================================================================

/**
 * Exec-policy preset.
 *
 * Locked names per ADR-046: open / balanced / strict.
 * openclaw lineage: yolo / cautious / deny-all (code-comment reference only).
 */
export type Preset = "open" | "balanced" | "strict";

// ============================================================================
// Policy Shapes
// ============================================================================

/**
 * Ask mode controlling when CEO prompts fire.
 */
export type AskMode = "off" | "on-miss" | "always";

/**
 * Effective policy — resolved from preset + store overrides.
 */
export interface EffectivePolicy {
  /** The active preset name */
  preset: Preset;
  /** Allowlisted command patterns (glob) */
  allowlist: string[];
  /** Hard-deny command patterns that always block */
  hardDeny: string[];
  /** When to prompt the CEO */
  askMode: AskMode;
}

/**
 * Policy decision returned by checkCommand().
 */
export type PolicyDecision = "allow" | "deny" | "prompt";

/**
 * Result of checkCommand().
 */
export interface ExecPolicyDecision {
  /** The routing decision */
  decision: PolicyDecision;
  /** Human-readable reason for the decision */
  reason: string;
  /** Pattern that matched (if any) */
  matchedPattern?: string;
}

// ============================================================================
// Context
// ============================================================================

/**
 * Context passed to checkCommand().
 */
export interface PolicyContext {
  /** Session ID */
  sessionId: string;
  /** Task ID (optional) */
  taskId?: string;
  /** Agent name (e.g. "coder") */
  agent: string;
  /** Current autonomy gate */
  gate: "A" | "B" | "C";
  /** Whether ENDIORBOT_AUTO_HANDOFF is true */
  autoHandoff: boolean;
  /** Origin channel of the autonomous session */
  originChannel: "web" | "telegram" | "zalo" | "cli";
}

// ============================================================================
// Audit
// ============================================================================

/**
 * A single exec-policy audit record (JSONL).
 *
 * Written to ~/.endiorbot/audit-logs/exec-policy.log for every checkCommand() call.
 * The command field is scrubbed via output-scrubber before persistence.
 */
export interface ExecPolicyAuditRecord {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Session ID */
  sessionId: string;
  /** Task ID (optional) */
  taskId?: string;
  /** Agent name */
  agent: string;
  /** Scrubbed command string */
  command: string;
  /** Preset in effect */
  preset: Preset;
  /** Decision taken */
  decision: "allow" | "deny" | "prompt" | "approved-by-ceo" | "denied-by-ceo";
  /** Human-readable reason (optional) */
  reason?: string;
  /** Pattern that was matched (optional) */
  matchedPattern?: string;
  /** Gate in effect */
  gate: "A" | "B" | "C";
  /** Auto-handoff flag value */
  autoHandoff: boolean;
  /** Origin channel */
  originChannel: "web" | "telegram" | "zalo" | "cli";
  /** Optional correlation trace ID */
  traceId?: string;
}

// ============================================================================
// PromptFn
// ============================================================================

/**
 * Injectable prompt function.
 *
 * M1 ships only the CLI implementation (promptConfirmation).
 * Future OTT adapters inject a channel-aware implementation here.
 * Per ADR-046 Amendment 1: non-CLI origins fail closed (deny) in M1.
 */
export type PromptFn = (message: string, command: string) => Promise<boolean>;
