/**
 * RL Feedback Service Tests — Sprint 110 (ADR-033)
 *
 * T1: onAgentResponse() with trainable turn + telegramMessageId → registers turn + writes event log
 * T2: onAgentResponse() with trainable turn + no messageId → skips (feedback scope guard CPO C4)
 * T3: onFeedback("good") → writes to training JSONL AND event log
 * T4: onFeedback("partial") → writes to event log ONLY, NOT training JSONL
 * T5: onFeedback() with orphan correlationId → no crash, silent drop
 *
 * @module tests/rl/feedback-service
 * @sprint 110
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RLFeedbackService } from "../../src/rl/feedback-service.js";
import { RLSessionTracker } from "../../src/rl/session-tracker.js";
import type { RLDataStore, RLEventLog } from "../../src/rl/data-store.js";
import type { RLRecord, RLEventLogEntry } from "../../src/rl/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeService() {
  const tracker = new RLSessionTracker();
  const dataStore: RLDataStore = {
    append: vi.fn(),
    getStats: vi.fn().mockReturnValue({ recordsWritten: 0, writeFailures: 0 }),
  } as unknown as RLDataStore;
  const eventLog: RLEventLog = {
    append: vi.fn(),
  } as unknown as RLEventLog;
  const service = new RLFeedbackService(tracker, dataStore, eventLog);
  return { service, tracker, dataStore, eventLog };
}

// ============================================================================
// Tests
// ============================================================================

describe("RLFeedbackService", () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it("T1: onAgentResponse() with trainable turn + messageId → registers turn + writes event log", () => {
    const { service, eventLog } = ctx;

    service.onAgentResponse({
      chatId: "chat-1",
      correlationId: "corr-t1",
      telegramMessageId: 42,
      provider: "claude",
      isTrainableTurn: true,
      response: "Test agent response",
      durationMs: 150,
    });

    // Event log entry written at registration
    expect(vi.mocked(eventLog.append)).toHaveBeenCalledOnce();

    // Turn should be in tracker
    const tracked = (service as unknown as { _tracker: RLSessionTracker })._tracker
      .getTurnByCorrelationId("corr-t1");
    expect(tracked).not.toBeNull();
    expect(tracked?.feedbackStatus).toBe("missing");
    expect(tracked?.isTrainableTurn).toBe(true);
  });

  it("T2: onAgentResponse() with trainable turn + no messageId → skips (feedback scope guard)", () => {
    const { service, eventLog } = ctx;

    service.onAgentResponse({
      chatId: "chat-2",
      correlationId: "corr-t2",
      // telegramMessageId omitted — scope guard should block tracking
      provider: "claude",
      isTrainableTurn: true,
      response: "Should not be tracked",
      durationMs: 100,
    });

    // Scope guard: no messageId → turn NOT registered → no event log entry
    expect(vi.mocked(eventLog.append)).not.toHaveBeenCalled();
    const tracked = (service as unknown as { _tracker: RLSessionTracker })._tracker
      .getTurnByCorrelationId("corr-t2");
    expect(tracked).toBeNull();
  });

  it("T3: onFeedback('good') → writes to training JSONL AND event log", () => {
    const { service, dataStore, eventLog } = ctx;

    service.onAgentResponse({
      chatId: "chat-3",
      correlationId: "corr-t3",
      telegramMessageId: 100,
      provider: "claude",
      isTrainableTurn: true,
      response: "CEO-approved answer",
      durationMs: 200,
    });
    vi.mocked(eventLog.append).mockClear();

    service.onFeedback("corr-t3", "good");

    // Training JSONL: dataStore.append called with valid record
    expect(vi.mocked(dataStore.append)).toHaveBeenCalledOnce();
    const record = vi.mocked(dataStore.append).mock.calls[0]?.[0] as RLRecord;
    expect(record.schema_version).toBe(1);
    expect(record.feedback_label).toBe("good");
    expect(record.reward).toBe(1);
    expect(record.hint).toBeNull();
    expect(record.correlation_id).toBe("corr-t3");

    // Event log: always written
    expect(vi.mocked(eventLog.append)).toHaveBeenCalledOnce();
  });

  it("T4: onFeedback('partial') → writes to event log ONLY, NOT training JSONL", () => {
    const { service, dataStore, eventLog } = ctx;

    service.onAgentResponse({
      chatId: "chat-4",
      correlationId: "corr-t4",
      telegramMessageId: 200,
      provider: "claude",
      isTrainableTurn: true,
      response: "Partially helpful",
      durationMs: 80,
    });
    vi.mocked(eventLog.append).mockClear();

    service.onFeedback("corr-t4", "partial");

    // Training JSONL: NOT written for partial (ADR-033 D5)
    expect(vi.mocked(dataStore.append)).not.toHaveBeenCalled();

    // Event log: always written (including partial)
    expect(vi.mocked(eventLog.append)).toHaveBeenCalledOnce();
    const entry = vi.mocked(eventLog.append).mock.calls[0]?.[0] as RLEventLogEntry;
    expect(entry.feedback_label).toBe("partial");
    expect(entry.feedback_status).toBe("received");
  });

  it("T5: onFeedback() with orphan correlationId → no crash, silent drop", () => {
    const { service, dataStore, eventLog } = ctx;

    // No onAgentResponse() called — correlationId unknown to tracker
    expect(() => service.onFeedback("orphan-unknown-corr", "good")).not.toThrow();

    expect(vi.mocked(dataStore.append)).not.toHaveBeenCalled();
    expect(vi.mocked(eventLog.append)).not.toHaveBeenCalled();
  });
});
