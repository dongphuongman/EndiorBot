/**
 * Telegram RL Feedback Integration Tests — Sprint 110 (ADR-033)
 *
 * Tests the complete RL feedback cycle as used in the Telegram channel:
 *
 * T1: Keyboard scope guard — onAgentResponse() with valid messageId registers the turn,
 *     subsequent onFeedback() records it correctly (good → JSONL + event log)
 * T2: Orphan callback — onFeedback() with unregistered correlationId → silent drop,
 *     no crash, no records written
 *
 * @module tests/channels/telegram/rl-feedback
 * @sprint 110
 */

import { describe, it, expect, vi } from "vitest";
import { RLFeedbackService } from "../../../src/rl/feedback-service.js";
import { RLSessionTracker } from "../../../src/rl/session-tracker.js";
import type { RLDataStore, RLEventLog } from "../../../src/rl/data-store.js";
import type { RLRecord } from "../../../src/rl/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeServiceWithMocks() {
  const tracker = new RLSessionTracker();
  const dataStore: RLDataStore = {
    append: vi.fn(),
    getStats: vi.fn().mockReturnValue({ recordsWritten: 0, writeFailures: 0 }),
  } as unknown as RLDataStore;
  const eventLog: RLEventLog = {
    append: vi.fn(),
  } as unknown as RLEventLog;
  return {
    service: new RLFeedbackService(tracker, dataStore, eventLog),
    tracker,
    dataStore,
    eventLog,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Telegram RL Feedback — keyboard scope guard + orphan drop", () => {
  it("T1: keyboard scope guard — addTurn+setMessageId path → feedback recorded correctly", () => {
    const { service, dataStore, eventLog } = makeServiceWithMocks();

    // Simulates what telegram-channel.ts does in send() after sendMessageWithId() succeeds:
    // 1. sendMessageWithId() returns message_id=789
    // 2. feedbackService.onAgentResponse() called with that messageId
    service.onAgentResponse({
      chatId: "chat-ceo",
      correlationId: "telegram-ceo-1710000000001",
      telegramMessageId: 789, // message_id from Telegram API
      provider: "claude",
      isTrainableTurn: true,
      response: "Sprint 110 RL feedback capture complete.",
      durationMs: 320,
    });

    // Event log entry written at registration (status="missing")
    expect(vi.mocked(eventLog.append)).toHaveBeenCalledOnce();
    vi.mocked(eventLog.append).mockClear();

    // Simulates CEO tapping 👍 keyboard button — callback "rl_fb:good:telegram-ceo-1710000000001"
    service.onFeedback("telegram-ceo-1710000000001", "good");

    // Training JSONL: good feedback → write record
    expect(vi.mocked(dataStore.append)).toHaveBeenCalledOnce();
    const record = vi.mocked(dataStore.append).mock.calls[0]?.[0] as RLRecord;
    expect(record.correlation_id).toBe("telegram-ceo-1710000000001");
    expect(record.feedback_label).toBe("good");
    expect(record.reward).toBe(1);
    expect(record.schema_version).toBe(1);
    expect(record.hint).toBeNull(); // Sprint 110: always null

    // Event log: written for feedback received
    expect(vi.mocked(eventLog.append)).toHaveBeenCalledOnce();
  });

  it("T2: orphan callback — correlationId never registered → no crash, no records written", () => {
    const { service, dataStore, eventLog } = makeServiceWithMocks();

    // No onAgentResponse() called — simulates:
    // - Turn from before Sprint 110 deployment (no tracking)
    // - Non-trainable turn (correlationId not stored by feedback service)
    // - Stale callback after process restart (tracker lost in-memory state)
    const orphanCorrelationId = "telegram-ceo-orphan-9999999999";

    expect(() => service.onFeedback(orphanCorrelationId, "good")).not.toThrow();
    expect(() => service.onFeedback(orphanCorrelationId, "bad")).not.toThrow();
    expect(() => service.onFeedback(orphanCorrelationId, "partial")).not.toThrow();

    // Orphan: no records written anywhere
    expect(vi.mocked(dataStore.append)).not.toHaveBeenCalled();
    expect(vi.mocked(eventLog.append)).not.toHaveBeenCalled();
  });
});
