/**
 * RL Session Tracker — Sprint 110 (ADR-033)
 *
 * Manages RL sessions and turns in memory with disk persistence.
 *
 * Key design decisions (see ADR-033):
 * - correlationId is the PRIMARY key for turn lookup (D4)
 * - Session boundary: 30-min idle timeout, not day-based (D7)
 * - Session timezone documented: Asia/Ho_Chi_Minh (D7)
 * - Persist on every addTurn (not just on finalize) — survives crashes
 * - expireStale() writes to event log, NOT to training JSONL
 *
 * @module rl/session-tracker
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 110
 * @authority ADR-033
 * @sprint 110
 */

import type { RLSession, RLTurn, FeedbackLabel, RLRecord, RLEventLogEntry } from "./types.js";

// Session idle timeout: 30 min (ADR-033 D7)
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Feedback window: 2h (after this, turn is "expired")
export const FEEDBACK_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Timezone for session boundary documentation (file grouping only — not lifecycle).
 * Session lifecycle = idle-timeout. See ADR-033 D7.
 */
export const SESSION_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Tracks RL sessions and turns in memory.
 * Primary key: correlationId (not messageId).
 */
export class RLSessionTracker {
  /** Active sessions keyed by chatId */
  private sessions = new Map<string, RLSession>();

  /** Fast reverse lookup: correlationId → {chatId, turnId} */
  private correlationIndex = new Map<string, { chatId: string; turnId: number }>();

  // ============================================================================
  // Session management
  // ============================================================================

  /**
   * Get existing session or create a new one.
   * Creates new if: first message from this chatId, OR last activity > 30min ago.
   */
  createOrGetSession(chatId: string, channel: string): RLSession {
    const existing = this.sessions.get(chatId);
    const now = Date.now();

    if (existing && now - existing.lastActivityAt < SESSION_IDLE_TIMEOUT_MS) {
      return existing;
    }

    // New session (first message OR idle timeout)
    const sessionId = `rl-${chatId}-${now}`;
    const session: RLSession = {
      sessionId,
      chatId,
      channel,
      lastActivityAt: now,
      turns: [],
    };
    this.sessions.set(chatId, session);
    return session;
  }

  // ============================================================================
  // Turn management
  // ============================================================================

  /**
   * Add a new turn to the session. Updates lastActivityAt.
   * Registers correlationId in the fast lookup index.
   */
  addTurn(chatId: string, turn: RLTurn): void {
    const session = this.createOrGetSession(chatId, "telegram");
    session.turns.push(turn);
    session.lastActivityAt = Date.now();

    this.correlationIndex.set(turn.correlationId, {
      chatId,
      turnId: turn.turnId,
    });
  }

  /**
   * Set the Telegram message_id for a turn (after sendMessageWithId() succeeds).
   * Called by telegram-channel.ts in Step 8 after successful send.
   */
  setMessageId(chatId: string, turnId: number, messageId: number): void {
    const session = this.sessions.get(chatId);
    if (!session) return;

    const turn = session.turns.find((t) => t.turnId === turnId);
    if (!turn) return;

    turn.telegramMessageId = messageId;
  }

  /**
   * Look up a turn by correlationId (primary key).
   * Returns null if not found.
   */
  getTurnByCorrelationId(correlationId: string): RLTurn | null {
    const ref = this.correlationIndex.get(correlationId);
    if (!ref) return null;

    const session = this.sessions.get(ref.chatId);
    if (!session) return null;

    return session.turns.find((t) => t.turnId === ref.turnId) ?? null;
  }

  /**
   * Look up session for a correlationId.
   */
  getSessionByCorrelationId(correlationId: string): RLSession | null {
    const ref = this.correlationIndex.get(correlationId);
    if (!ref) return null;
    return this.sessions.get(ref.chatId) ?? null;
  }

  /**
   * Record CEO feedback for a turn.
   *
   * @param correlationId - PRIMARY key (not messageId)
   * @param label - Raw feedback label ("good" | "partial" | "bad")
   * @returns RLRecord if turn is trainable and feedback accepted; null otherwise.
   *          Caller should: write to RLDataStore if record returned.
   *          Always write to RLEventLog regardless.
   */
  recordFeedback(correlationId: string, label: FeedbackLabel): RLRecord | null {
    const ref = this.correlationIndex.get(correlationId);
    if (!ref) return null;

    const session = this.sessions.get(ref.chatId);
    if (!session) return null;

    const turn = session.turns.find((t) => t.turnId === ref.turnId);
    if (!turn) return null;

    // Update turn state
    turn.feedbackLabel = label;
    turn.feedbackStatus = "received";
    turn.feedbackAt = Date.now();

    // Derive reward scalar (good=+1, bad=-1; partial has no scalar in Sprint 110)
    if (label === "good") turn.reward = 1;
    else if (label === "bad") turn.reward = -1;
    // partial: reward stays undefined

    // Only trainable turns with good/bad feedback produce training records
    if (!turn.isTrainableTurn || label === "partial") return null;

    const record: RLRecord = {
      schema_version: 1,
      session_id: session.sessionId,
      turn_id: turn.turnId,
      turn_type: turn.turnType,
      correlation_id: turn.correlationId,
      messages: turn.request ?? [], // Sprint 111a: inbound request threaded through
      response: turn.response,
      feedback_label: label,
      reward: turn.reward ?? (label === "good" ? 1 : -1),
      hint: null, // Sprint 110: always null — OPD deferred to Sprint 112
      provider: turn.provider,
      feedback_status: "received",
      timestamp: turn.feedbackAt,
    };

    return record;
  }

  /**
   * Build event log entry for any turn (regardless of feedbackLabel/isTrainableTurn).
   * Must be called for every turn state change to maintain accurate feedbackRate.
   */
  buildEventLogEntry(correlationId: string): RLEventLogEntry | null {
    const turn = this.getTurnByCorrelationId(correlationId);
    if (!turn) return null;

    const entry: RLEventLogEntry = {
      schema_version: 1,
      correlation_id: turn.correlationId,
      turn_type: turn.turnType,
      is_trainable_turn: turn.isTrainableTurn,
      feedback_status: turn.feedbackStatus,
      timestamp: Date.now(),
    };
    if (turn.feedbackLabel !== undefined) {
      entry.feedback_label = turn.feedbackLabel;
    }
    return entry;
  }

  /**
   * Expire turns that have been waiting for feedback beyond the window (2h).
   * Sets feedbackStatus="expired" on stale turns.
   * Returns correlation IDs of newly expired turns (for event log writing).
   *
   * Intended to be called on a periodic timer (e.g., 15-min setInterval).
   * Expired turns are NOT written to training JSONL.
   */
  expireStale(cutoffMs = FEEDBACK_WINDOW_MS): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const session of this.sessions.values()) {
      for (const turn of session.turns) {
        if (
          turn.feedbackStatus === "missing" &&
          now - turn.createdAt > cutoffMs
        ) {
          turn.feedbackStatus = "expired";
          expired.push(turn.correlationId);
        }
      }
    }

    return expired;
  }

  /**
   * Get stats for observability.
   */
  getStats(): {
    totalTurns: number;
    trainableTurns: number;
    feedbackReceived: number;
    feedbackRate: number;
    positives: number;
    partials: number;
    negatives: number;
    expiredWithoutFeedback: number;
  } {
    let totalTurns = 0;
    let trainableTurns = 0;
    let feedbackReceived = 0;
    let positives = 0;
    let partials = 0;
    let negatives = 0;
    let expiredWithoutFeedback = 0;

    for (const session of this.sessions.values()) {
      for (const turn of session.turns) {
        totalTurns++;
        if (turn.isTrainableTurn) trainableTurns++;
        if (turn.feedbackStatus === "received") {
          feedbackReceived++;
          if (turn.feedbackLabel === "good") positives++;
          else if (turn.feedbackLabel === "partial") partials++;
          else if (turn.feedbackLabel === "bad") negatives++;
        }
        if (turn.feedbackStatus === "expired") expiredWithoutFeedback++;
      }
    }

    const feedbackRate = trainableTurns > 0 ? feedbackReceived / trainableTurns : 0;

    return {
      totalTurns,
      trainableTurns,
      feedbackReceived,
      feedbackRate,
      positives,
      partials,
      negatives,
      expiredWithoutFeedback,
    };
  }
}
