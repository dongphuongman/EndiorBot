/**
 * RL Data Store Tests — Sprint 110 (ADR-033)
 *
 * T1: RLDataStore.append() writes good/bad to JSONL; getStats().recordsWritten increments
 * T2: RLDataStore.append() silently skips partial feedback (not written to training JSONL)
 * T3: JSONL fixture validation — written record has schema_version:1, correlation_id,
 *     feedback_label, reward, hint:null, provider, messages:[]
 *
 * @module tests/rl/data-store
 * @sprint 110
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock node:fs — prevent real disk writes during tests
// ============================================================================

vi.mock("node:fs", () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { appendFileSync } from "node:fs";
import { RLDataStore } from "../../src/rl/data-store.js";
import type { RLRecord } from "../../src/rl/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeRecord(overrides?: Partial<RLRecord>): RLRecord {
  return {
    schema_version: 1,
    session_id: "rl-chat-ceo-1710000000000",
    turn_id: 1,
    turn_type: "main",
    correlation_id: "telegram-ceo-1710000000000",
    messages: [],
    response: "Here is the sprint plan for Sprint 110.",
    feedback_label: "good",
    reward: 1,
    hint: null,
    provider: "claude",
    feedback_status: "received",
    timestamp: 1710000000000,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RLDataStore", () => {
  let store: RLDataStore;

  beforeEach(() => {
    store = new RLDataStore();
    vi.mocked(appendFileSync).mockClear();
  });

  it("T1: append() writes good/bad records to JSONL; getStats().recordsWritten increments", () => {
    store.append(makeRecord({ feedback_label: "good", reward: 1 }));
    store.append(makeRecord({ feedback_label: "bad", reward: -1 }));

    expect(store.getStats().recordsWritten).toBe(2);
    expect(store.getStats().writeFailures).toBe(0);
    expect(vi.mocked(appendFileSync)).toHaveBeenCalledTimes(2);
  });

  it("T2: append() silently skips partial feedback — NOT written to training JSONL", () => {
    store.append(makeRecord({ feedback_label: "partial" }));

    // Partial does not go to training JSONL (ADR-033 D5)
    expect(store.getStats().recordsWritten).toBe(0);
    expect(vi.mocked(appendFileSync)).not.toHaveBeenCalled();
  });

  it("T3: JSONL fixture validation — written record has schema_version:1, correlation_id, feedback_label, reward, hint:null", () => {
    const record = makeRecord({
      correlation_id: "telegram-ceo-9999999999999",
      feedback_label: "good",
      reward: 1,
      provider: "claude",
      messages: [],
    });
    store.append(record);

    expect(vi.mocked(appendFileSync)).toHaveBeenCalledOnce();

    // Extract the JSONL line written to disk
    const call = vi.mocked(appendFileSync).mock.calls[0];
    const writtenContent = call?.[1] as string;
    expect(writtenContent).toBeDefined();

    // Must be valid JSON followed by newline
    expect(writtenContent.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(writtenContent.trim()) as RLRecord;

    // ADR-033 D6: JSONL fixture validation
    expect(parsed.schema_version).toBe(1);
    expect(parsed.correlation_id).toBe("telegram-ceo-9999999999999");
    expect(parsed.feedback_label).toBe("good");
    expect(parsed.reward).toBe(1);
    expect(parsed.hint).toBeNull();
    expect(parsed.provider).toBe("claude");
    expect(parsed.messages).toEqual([]);
    expect(parsed.turn_type).toBe("main");
    expect(typeof parsed.timestamp).toBe("number");
  });
});
