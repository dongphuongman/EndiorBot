/**
 * RL Session Tracker Tests — Sprint 110 (ADR-033)
 *
 * T1: createOrGetSession() creates new session on first call
 * T2: createOrGetSession() returns same session within 30-min idle window
 * T3: createOrGetSession() creates new session after 30-min idle timeout
 * T4: addTurn() registers correlationId in fast lookup index
 * T5: recordFeedback() returns RLRecord for good/bad, null for partial
 * T6: expireStale() marks old missing turns as expired, returns correlationIds
 *
 * @module tests/rl/session-tracker
 * @sprint 110
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RLSessionTracker, SESSION_IDLE_TIMEOUT_MS } from "../../src/rl/session-tracker.js";
import type { RLTurn } from "../../src/rl/types.js";

// ============================================================================
// Helpers
// ============================================================================

let counter = 0;

function makeTurn(overrides?: Partial<RLTurn>): RLTurn {
  const id = ++counter;
  return {
    turnId: id,
    turnType: "main",
    correlationId: `corr-${id}`,
    provider: "claude",
    isTrainableTurn: true,
    response: "Test agent response",
    durationMs: 100,
    hint: null,
    feedbackStatus: "missing",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RLSessionTracker", () => {
  let tracker: RLSessionTracker;

  beforeEach(() => {
    tracker = new RLSessionTracker();
    counter = 0;
  });

  it("T1: createOrGetSession() creates new session on first call", () => {
    const session = tracker.createOrGetSession("chat-1", "telegram");

    expect(session.chatId).toBe("chat-1");
    expect(session.channel).toBe("telegram");
    expect(session.sessionId).toMatch(/^rl-chat-1-\d+$/);
    expect(session.turns).toHaveLength(0);
    expect(session.lastActivityAt).toBeGreaterThan(0);
  });

  it("T2: createOrGetSession() returns same session within 30-min idle window", () => {
    const s1 = tracker.createOrGetSession("chat-2", "telegram");
    const s2 = tracker.createOrGetSession("chat-2", "telegram");

    expect(s1.sessionId).toBe(s2.sessionId);
  });

  it("T3: createOrGetSession() creates new session after 30-min idle timeout", () => {
    const s1 = tracker.createOrGetSession("chat-3", "telegram");
    // Add a turn so we can distinguish s1 from s2
    const turn = makeTurn({ correlationId: "corr-s1-marker" });
    s1.turns.push(turn);

    // Manually age the session beyond the idle timeout
    s1.lastActivityAt = Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000;

    const s2 = tracker.createOrGetSession("chat-3", "telegram");

    // s2 must be a different object (new session) — even if timestamps collide in same ms
    expect(s2).not.toBe(s1);
    // New session starts with no turns (not the aged session with our marker turn)
    expect(s2.turns).toHaveLength(0);
  });

  it("T4: addTurn() registers correlationId in fast lookup index", () => {
    tracker.createOrGetSession("chat-4", "telegram");
    const turn = makeTurn({ correlationId: "corr-lookup-test" });
    tracker.addTurn("chat-4", turn);

    const found = tracker.getTurnByCorrelationId("corr-lookup-test");
    expect(found).not.toBeNull();
    expect(found?.correlationId).toBe("corr-lookup-test");
    expect(found?.response).toBe(turn.response);
  });

  it("T5: recordFeedback() returns RLRecord for good/bad, null for partial", () => {
    tracker.createOrGetSession("chat-5", "telegram");
    const goodTurn = makeTurn({ correlationId: "corr-good" });
    const partialTurn = makeTurn({ correlationId: "corr-partial" });
    const badTurn = makeTurn({ correlationId: "corr-bad" });
    tracker.addTurn("chat-5", goodTurn);
    tracker.addTurn("chat-5", partialTurn);
    tracker.addTurn("chat-5", badTurn);

    // good → RLRecord with schema_version:1, reward:+1, hint:null
    const goodRecord = tracker.recordFeedback("corr-good", "good");
    expect(goodRecord).not.toBeNull();
    expect(goodRecord?.schema_version).toBe(1);
    expect(goodRecord?.feedback_label).toBe("good");
    expect(goodRecord?.reward).toBe(1);
    expect(goodRecord?.hint).toBeNull();
    expect(goodRecord?.correlation_id).toBe("corr-good");

    // partial → null (event log only, NOT training JSONL)
    const partialRecord = tracker.recordFeedback("corr-partial", "partial");
    expect(partialRecord).toBeNull();

    // bad → RLRecord with reward:-1
    const badRecord = tracker.recordFeedback("corr-bad", "bad");
    expect(badRecord).not.toBeNull();
    expect(badRecord?.feedback_label).toBe("bad");
    expect(badRecord?.reward).toBe(-1);
  });

  it("T6: expireStale() marks old missing turns as expired, returns correlationIds", () => {
    tracker.createOrGetSession("chat-6", "telegram");

    const oldTurn = makeTurn({
      correlationId: "corr-old-stale",
      createdAt: Date.now() - 3 * 60 * 60 * 1000, // 3h ago — beyond 2h window
    });
    const recentTurn = makeTurn({
      correlationId: "corr-new-active",
      createdAt: Date.now() - 1000, // 1s ago — within window
    });
    tracker.addTurn("chat-6", oldTurn);
    tracker.addTurn("chat-6", recentTurn);

    const expired = tracker.expireStale();

    expect(expired).toContain("corr-old-stale");
    expect(expired).not.toContain("corr-new-active");

    const expiredTurn = tracker.getTurnByCorrelationId("corr-old-stale");
    expect(expiredTurn?.feedbackStatus).toBe("expired");

    const activeTurn = tracker.getTurnByCorrelationId("corr-new-active");
    expect(activeTurn?.feedbackStatus).toBe("missing");
  });
});
