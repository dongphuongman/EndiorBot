/**
 * RL Feedback Capture Types — Sprint 110 (ADR-033)
 *
 * Pure type definitions for the RL feedback capture pipeline.
 * No imports from other src/ modules.
 *
 * Key design decisions (see ADR-033):
 * - feedbackLabel (raw human signal) kept separate from reward scalar (D5)
 * - Two storage paths: training JSONL (good/bad) + event log (all turns) (D6)
 * - correlationId is the primary key (not telegramMessageId) (D4)
 * - hint: null for Sprint 110 — OPD deferred to Sprint 112 (D8)
 * - schema_version: 1 in every JSONL record for migration safety (D6)
 *
 * @module rl/types
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 110
 * @authority ADR-033
 * @sprint 110
 */

// ============================================================================
// Core enums
// ============================================================================

/**
 * Status of feedback for a turn.
 * - "received": CEO tapped 👍/🔄/👎 within 2h window
 * - "missing": turn is still waiting for feedback (default until expired)
 * - "expired": 2h window passed, no feedback received
 *
 * Only "received" records with feedbackLabel in ("good","bad") go to training JSONL.
 * All statuses go to event log for kill-criteria measurement.
 */
export type FeedbackStatus = "received" | "missing" | "expired";

/**
 * Raw human feedback label from CEO.
 * Stored separately from reward scalar — training pipeline owns the mapping.
 * (Sprint 110: partial → event log only; Sprint 112+: may treat as 0 or hint-prompt)
 */
export type FeedbackLabel = "good" | "partial" | "bad";

// ============================================================================
// Session + Turn
// ============================================================================

/**
 * A single turn in a CEO conversation, tracked for RL feedback.
 */
export interface RLTurn {
  /** Sequential turn number within the session */
  turnId: number;
  /** "main": agent response eligible for training; "side": system/error/command */
  turnType: "main" | "side";
  /** PRIMARY app-level key — links bus message to Telegram message to feedback callback */
  correlationId: string;
  /** Secondary transport key — set after sendMessageWithId() succeeds */
  telegramMessageId?: number;
  /** AI provider/model that generated this response */
  provider: string;
  /** Whether this turn is eligible for RL training */
  isTrainableTurn: boolean;
  /**
   * Conversation context — inbound message(s) that prompted this response.
   * Populated in Sprint 111a: [{role: "user", content: <inbound_text>}]
   * Optional for backward compatibility with Sprint 110 in-flight sessions.
   */
  request?: Array<{ role: string; content: string }>;
  /** Response text sent to CEO */
  response: string;
  /** Total time from inbound to response delivery (ms) */
  durationMs: number;
  /** Token usage from AI provider (Sprint 114). */
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** Raw human feedback label (set when CEO taps keyboard) */
  feedbackLabel?: FeedbackLabel;
  /**
   * Reward scalar derived from feedbackLabel.
   * good=+1, bad=-1. partial not mapped to scalar in Sprint 110.
   * Mapping done here for convenience; source of truth is feedbackLabel.
   */
  reward?: number;
  /**
   * Hint text from CEO after 👎 (OPD signal).
   * Always null in Sprint 110 — deferred to Sprint 112. See ADR-033 D8.
   */
  hint: string | null;
  feedbackStatus: FeedbackStatus;
  /** Unix timestamp (ms) when turn was created */
  createdAt: number;
  /** Unix timestamp (ms) when feedback was received */
  feedbackAt?: number;
}

/**
 * A conversation session — groups turns by idle-timeout.
 * Session boundary: 30-min idle timeout. See ADR-033 D7.
 */
export interface RLSession {
  /** Format: "rl-{chatId}-{startTs}" (timestamp-based, not day-based) */
  sessionId: string;
  chatId: string;
  channel: string;
  lastActivityAt: number;
  turns: RLTurn[];
}

// ============================================================================
// JSONL Records
// ============================================================================

/**
 * Training JSONL record — written only for feedbackLabel in ("good","bad").
 * Format matches OpenClaw-RL's OPENCLAW_RECORD_ENABLED=1 output. See ADR-033 D6.
 */
export interface RLRecord {
  /** Always 1 in Sprint 110/111 — for migration safety */
  schema_version: 1;
  session_id: string;
  turn_id: number;
  turn_type: "main" | "side";
  /** PRIMARY key — app-level correlationId */
  correlation_id: string;
  /**
   * Conversation context messages (inbound request that prompted the response).
   * Populated from Sprint 111a: [{role: "user", content: <inbound_text>}]
   * Was empty in Sprint 110 records (history threading not yet implemented).
   */
  messages: Array<{ role: string; content: string }>;
  response: string;
  /** Raw human signal — training pipeline owns reward mapping */
  feedback_label: FeedbackLabel;
  /** Reward scalar: good=+1, bad=-1 */
  reward: number;
  /** Always null in Sprint 110. OPD hint field, populated in Sprint 112. */
  hint: string | null;
  provider: string;
  feedback_status: FeedbackStatus;
  /** Token usage from AI provider (Sprint 114). */
  token_usage?: { input: number; output: number; total: number };
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Event log entry — written for ALL turns (including partial/missing/expired).
 * Used for kill-criteria measurement (feedbackRate = received/trainable).
 * Survives process restart because it's persisted to disk.
 * Path: ~/.endiorbot/rl-state/event-log.jsonl. See ADR-033 D6.
 */
export interface RLEventLogEntry {
  schema_version: 1;
  correlation_id: string;
  turn_type: "main" | "side";
  is_trainable_turn: boolean;
  feedback_label?: FeedbackLabel;
  feedback_status: FeedbackStatus;
  /** Unix timestamp (ms) */
  timestamp: number;
}
