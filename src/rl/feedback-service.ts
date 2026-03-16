/**
 * RL Feedback Service — Sprint 110 (ADR-033)
 *
 * Business logic layer for RL feedback capture.
 * Separated from Telegram transport adapter (telegram-channel.ts).
 *
 * Owns: RLSessionTracker + RLDataStore + RLEventLog
 * Consumed by: telegram-channel.ts (after sendMessageWithId)
 *
 * See ADR-033 D3 (hook location) for why this is called from telegram-channel.ts,
 * not from ingress.ts or BusConsumer.
 *
 * @module rl/feedback-service
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 110
 * @authority ADR-033
 * @sprint 110
 */

import type { FeedbackLabel, RLTurn } from "./types.js";
import { RLSessionTracker } from "./session-tracker.js";
import { RLDataStore, RLEventLog } from "./data-store.js";
import type { RLStats } from "./observability.js";

/**
 * Parameters for registering a new agent response turn.
 */
export interface AgentResponseParams {
  chatId: string;
  correlationId: string;
  /** Set after sendMessageWithId() succeeds. Optional — keyboard attached in onMessageSent(). */
  telegramMessageId?: number;
  /** AI provider/model name */
  provider: string;
  /** True for agent responses (main turns); false for system/error/commands */
  isTrainableTurn: boolean;
  /** Response text sent to CEO */
  response: string;
  /** Processing time from inbound to response delivery (ms) */
  durationMs: number;
  /**
   * Conversation context (inbound messages) for RL training record.
   * Sprint 111a: [{role: "user", content: <inbound_text>}]
   * Optional — omitted for non-trainable turns.
   */
  request?: Array<{ role: string; content: string }>;
}

/**
 * RL Feedback Service.
 *
 * Three-phase flow per turn:
 * 1. onAgentResponse() — called from telegram-channel.ts after sendMessageWithId()
 *    Registers turn, sets telegramMessageId, writes event log entry (status="missing")
 * 2. onFeedback() — called when CEO taps 👍/🔄/👎 callback
 *    Updates turn, writes training JSONL (good/bad) + event log entry (status="received")
 * 3. expireStale() — called on 15-min timer
 *    Marks unfeedback turns as expired, writes event log entries (status="expired")
 */
export class RLFeedbackService {
  /** Sequential turn ID counter — instance field (not module-level) for test isolation. */
  private turnCounter = 0;
  private tracker: RLSessionTracker;
  private dataStore: RLDataStore;
  private eventLog: RLEventLog;

  constructor(
    tracker?: RLSessionTracker,
    dataStore?: RLDataStore,
    eventLog?: RLEventLog,
  ) {
    this.tracker = tracker ?? new RLSessionTracker();
    this.dataStore = dataStore ?? new RLDataStore();
    this.eventLog = eventLog ?? new RLEventLog();
  }

  // ============================================================================
  // Phase 1: Agent response received
  // ============================================================================

  /**
   * Register an agent response turn.
   * Called from telegram-channel.ts after sendMessageWithId() returns message_id.
   *
   * Feedback scope guard (CPO C4):
   * - Only registers if telegramMessageId is provided (message was successfully sent)
   * - If no messageId → turn not tracked → no keyboard attached
   */
  onAgentResponse(params: AgentResponseParams): void {
    // Feedback scope guard: only track if message was successfully delivered
    if (params.isTrainableTurn && !params.telegramMessageId) return;

    this.tracker.createOrGetSession(params.chatId, "telegram");

    const turnId = ++this.turnCounter;

    const turn: RLTurn = {
      turnId,
      turnType: params.isTrainableTurn ? "main" : "side",
      correlationId: params.correlationId,
      provider: params.provider,
      isTrainableTurn: params.isTrainableTurn,
      response: params.response,
      durationMs: params.durationMs,
      hint: null, // Sprint 110: always null. OPD in Sprint 112.
      feedbackStatus: "missing",
      createdAt: Date.now(),
    };

    if (params.telegramMessageId !== undefined) {
      turn.telegramMessageId = params.telegramMessageId;
    }
    if (params.request !== undefined) {
      turn.request = params.request;
    }

    this.tracker.addTurn(params.chatId, turn);
    this.tracker.setMessageId(params.chatId, turnId, params.telegramMessageId ?? 0);

    // Write event log entry (status="missing")
    const entry = this.tracker.buildEventLogEntry(params.correlationId);
    if (entry) this.eventLog.append(entry);
  }

  // ============================================================================
  // Phase 2: CEO feedback received
  // ============================================================================

  /**
   * Record CEO feedback for a turn.
   *
   * @param correlationId - PRIMARY key (from callback data "rl_fb:{label}:{correlationId}")
   * @param label - Raw feedback label ("good" | "partial" | "bad")
   *
   * Behavior:
   * - Always writes to event log (all labels)
   * - Writes to training JSONL only for good/bad (not partial)
   * - Orphan correlationIds (not in tracker) → logged + dropped silently
   */
  onFeedback(correlationId: string, label: FeedbackLabel): void {
    // recordFeedback returns RLRecord only for good/bad trainable turns
    const record = this.tracker.recordFeedback(correlationId, label);

    // Write to training JSONL (good/bad only)
    if (record) {
      this.dataStore.append(record);
    }

    // Always write to event log (includes partial/missing/expired turns)
    const entry = this.tracker.buildEventLogEntry(correlationId);
    if (entry) {
      this.eventLog.append(entry);
    }

    // Orphan: correlationId not in tracker (unknown turn) → silent drop
    // This is expected for: turns before Sprint 110 deploy, non-trainable turns, etc.
  }

  // ============================================================================
  // Phase 3: Stale expiry (called on 15-min timer)
  // ============================================================================

  /**
   * Expire turns that have been waiting for feedback beyond 2h.
   * Writes event log entries for newly expired turns.
   */
  expireStale(cutoffMs?: number): void {
    const expiredCorrelationIds = this.tracker.expireStale(cutoffMs);

    for (const correlationId of expiredCorrelationIds) {
      const entry = this.tracker.buildEventLogEntry(correlationId);
      if (entry) this.eventLog.append(entry);
    }
  }

  // ============================================================================
  // Observability
  // ============================================================================

  /**
   * Get combined stats from session tracker + data store.
   */
  getStats(): RLStats {
    const trackerStats = this.tracker.getStats();
    const storeStats = this.dataStore.getStats();

    return {
      ...trackerStats,
      hintsReceived: 0, // Sprint 110: always 0. OPD in Sprint 112.
      ...storeStats,
    };
  }

  /**
   * Expose tracker for test inspection.
   * @internal
   */
  get _tracker(): RLSessionTracker {
    return this.tracker;
  }
}
