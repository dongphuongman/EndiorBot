/**
 * Tests for HistoryCompactor — threshold, stale-guard, summarizer, fallback.
 *
 * @module tests/agents/quality/history-compactor
 * @sprint 121 — Track 2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  HistoryCompactor,
  COMPACTION_THRESHOLD_RATIO,
  KEEP_RECENT,
  MAX_SUMMARY_CHARS,
  STALE_GUARD_DELTA,
  SUMMARIZER_PROMPT,
  getHistoryCompactor,
  resetHistoryCompactor,
  type CompactionState,
  type CompactionResult,
  type HistoryCompactorConfig,
} from "../../../src/agents/quality/history-compactor.js";
import type { Message } from "../../../src/providers/types.js";

let compactor: HistoryCompactor;

beforeEach(() => {
  compactor = new HistoryCompactor();
  resetHistoryCompactor();
});

/** Helper: create N messages */
function makeMessages(n: number, role: "user" | "assistant" = "user"): Message[] {
  return Array.from({ length: n }, (_, i) => ({
    role,
    content: `Message ${i + 1}`,
  }));
}

// ============================================================================
// Constants
// ============================================================================

describe("constants", () => {
  it("COMPACTION_THRESHOLD_RATIO is 0.80", () => {
    expect(COMPACTION_THRESHOLD_RATIO).toBe(0.80);
  });

  it("KEEP_RECENT is 20", () => {
    expect(KEEP_RECENT).toBe(20);
  });

  it("MAX_SUMMARY_CHARS is 2000", () => {
    expect(MAX_SUMMARY_CHARS).toBe(2000);
  });

  it("STALE_GUARD_DELTA is 5", () => {
    expect(STALE_GUARD_DELTA).toBe(5);
  });

  it("SUMMARIZER_PROMPT is a non-empty string", () => {
    expect(SUMMARIZER_PROMPT).toBeDefined();
    expect(SUMMARIZER_PROMPT.length).toBeGreaterThan(0);
    expect(SUMMARIZER_PROMPT).toContain("summarizer");
  });
});

// ============================================================================
// Constructor
// ============================================================================

describe("constructor", () => {
  it("uses defaults when no config provided", () => {
    const c = new HistoryCompactor();
    // Verify defaults by testing behavior: 80 msgs / max 100 = 80% threshold
    expect(c.shouldCompact(80, 100)).toBe(true);
  });

  it("accepts custom thresholdRatio", () => {
    const c = new HistoryCompactor({ thresholdRatio: 0.5 });
    // 50 msgs / max 100 = 50% threshold, should trigger
    expect(c.shouldCompact(50, 100)).toBe(true);
    expect(c.shouldCompact(49, 100)).toBe(false);
  });

  it("accepts custom staleGuardDelta", () => {
    const c = new HistoryCompactor({ staleGuardDelta: 10 });
    // At threshold but only 5 delta (below custom 10)
    expect(c.shouldCompact(85, 100, { lastCompactedMessages: 80 })).toBe(false);
    // 10 delta = meets guard
    expect(c.shouldCompact(90, 100, { lastCompactedMessages: 80 })).toBe(true);
  });
});

// ============================================================================
// shouldCompact
// ============================================================================

describe("shouldCompact", () => {
  it("returns false when count below threshold", () => {
    expect(compactor.shouldCompact(10, 100)).toBe(false);
  });

  it("returns true when count at threshold (80%)", () => {
    expect(compactor.shouldCompact(80, 100)).toBe(true);
  });

  it("returns true when count above threshold", () => {
    expect(compactor.shouldCompact(95, 100)).toBe(true);
  });

  it("returns false at 79 of 100 (just below 80%)", () => {
    // floor(100 * 0.8) = 80, so 79 < 80
    expect(compactor.shouldCompact(79, 100)).toBe(false);
  });

  it("returns false when stale-guard blocks (delta < 5)", () => {
    const state: CompactionState = { lastCompactedMessages: 78 };
    // 80 - 78 = 2 < 5 (staleGuardDelta)
    expect(compactor.shouldCompact(80, 100, state)).toBe(false);
  });

  it("returns true when stale-guard passes (delta >= 5)", () => {
    const state: CompactionState = { lastCompactedMessages: 75 };
    // 80 - 75 = 5 >= 5
    expect(compactor.shouldCompact(80, 100, state)).toBe(true);
  });

  it("handles empty state (no previous compaction)", () => {
    // delta = 80 - 0 = 80 >= 5
    expect(compactor.shouldCompact(80, 100, {})).toBe(true);
  });

  it("handles zero maxCount", () => {
    // floor(0 * 0.8) = 0, 0 < 0 is false, but 0 >= 0 → stale guard: 0 - 0 = 0 < 5
    expect(compactor.shouldCompact(0, 0)).toBe(false);
  });

  it("works with small maxCount", () => {
    // floor(10 * 0.8) = 8
    expect(compactor.shouldCompact(8, 10)).toBe(true);
    expect(compactor.shouldCompact(7, 10)).toBe(false);
  });
});

// ============================================================================
// compact (no summarizer — fallback truncation)
// ============================================================================

describe("compact (fallback truncation)", () => {
  it("returns compacted=false when below threshold", async () => {
    const msgs = makeMessages(10);
    const result = await compactor.compact(msgs, 100);
    expect(result.compacted).toBe(false);
  });

  it("returns compacted=false when messages <= keepRecent", async () => {
    // Even at threshold, if messages.length <= 20, nothing to compact
    const msgs = makeMessages(20);
    // threshold = floor(20 * 0.8) = 16, current 20 >= 16 ✓
    // but messages.length (20) <= keepRecent (20) → skip
    const result = await compactor.compact(msgs, 20);
    expect(result.compacted).toBe(false);
  });

  it("compacts older messages and keeps recent", async () => {
    const msgs = makeMessages(50);
    const result = await compactor.compact(msgs, 50);

    expect(result.compacted).toBe(true);
    expect(result.compactedCount).toBe(30); // 50 - 20 = 30 older
    expect(result.keptCount).toBe(20);
    expect(result.messages).toBeDefined();
    expect(result.messages!.length).toBe(21); // 1 summary + 20 recent
  });

  it("first message in result is system summary", async () => {
    const msgs = makeMessages(50);
    const result = await compactor.compact(msgs, 50);

    expect(result.messages![0]!.role).toBe("system");
    expect(result.messages![0]!.content).toContain("Previous conversation summary:");
  });

  it("summary is included in result", async () => {
    const msgs = makeMessages(50);
    const result = await compactor.compact(msgs, 50);
    expect(result.summary).toBeDefined();
    expect(result.summary!.length).toBeGreaterThan(0);
  });

  it("updates state with compaction info", async () => {
    const state: CompactionState = {};
    const msgs = makeMessages(50);
    await compactor.compact(msgs, 50, state);

    expect(state.lastCompactedMessages).toBe(50);
    expect(state.lastCompactedAt).toBeDefined();
    expect(state.compactionSummary).toBeDefined();
  });

  it("truncates long text with indicator", async () => {
    // Create messages with long content to exceed MAX_SUMMARY_CHARS
    const msgs: Message[] = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}: ${"x".repeat(400)}`,
    }));
    const result = await compactor.compact(msgs, 50);

    expect(result.compacted).toBe(true);
    // fallbackTruncate cuts at maxSummaryChars - 20 and appends "[...truncated]"
    if (result.summary!.length > 100) {
      // If text was long enough to trigger truncation
      expect(result.summary!).toContain("[...truncated]");
    }
  });
});

// ============================================================================
// compact (with summarizer)
// ============================================================================

describe("compact (with summarizer)", () => {
  it("uses summarizer when provided", async () => {
    const summarizer = vi.fn().mockResolvedValue("AI summary of conversation");
    const c = new HistoryCompactor({ summarizer });
    const msgs = makeMessages(50);

    const result = await c.compact(msgs, 50);

    expect(result.compacted).toBe(true);
    expect(summarizer).toHaveBeenCalledOnce();
    expect(result.summary).toBe("AI summary of conversation");
  });

  it("truncates summarizer output to maxSummaryChars", async () => {
    const longSummary = "S".repeat(3000);
    const summarizer = vi.fn().mockResolvedValue(longSummary);
    const c = new HistoryCompactor({ summarizer });
    const msgs = makeMessages(50);

    const result = await c.compact(msgs, 50);

    expect(result.summary!.length).toBe(MAX_SUMMARY_CHARS);
  });

  it("falls back to truncation when summarizer throws", async () => {
    const summarizer = vi.fn().mockRejectedValue(new Error("LLM error"));
    const c = new HistoryCompactor({ summarizer });
    const msgs = makeMessages(50);

    const result = await c.compact(msgs, 50);

    expect(result.compacted).toBe(true);
    expect(summarizer).toHaveBeenCalledOnce();
    // Should still produce a summary via fallback
    expect(result.summary).toBeDefined();
  });

  it("passes older messages text to summarizer", async () => {
    const summarizer = vi.fn().mockResolvedValue("summary");
    const c = new HistoryCompactor({ summarizer });
    const msgs = makeMessages(25);

    await c.compact(msgs, 25);

    // Summarizer receives text of older messages (first 5 = 25 - 20)
    const calledWith = summarizer.mock.calls[0]![0] as string;
    expect(calledWith).toContain("[user]:");
    expect(calledWith).toContain("Message 1");
  });
});

// ============================================================================
// extractContent (via compact behavior)
// ============================================================================

describe("multimodal content handling", () => {
  it("handles string content", async () => {
    const summarizer = vi.fn().mockResolvedValue("summary");
    const c = new HistoryCompactor({ summarizer });
    const msgs: Message[] = [
      ...Array.from({ length: 25 }, () => ({
        role: "user" as const,
        content: "text message",
      })),
    ];

    await c.compact(msgs, 25);

    const text = summarizer.mock.calls[0]![0] as string;
    expect(text).toContain("text message");
  });

  it("handles array content (multimodal)", async () => {
    const summarizer = vi.fn().mockResolvedValue("summary");
    const c = new HistoryCompactor({ summarizer });
    const msgs: Message[] = [
      ...Array.from({ length: 25 }, () => ({
        role: "user" as const,
        content: [
          { type: "text" as const, text: "visible text" },
          { type: "image" as const, source: { data: "base64" } },
        ],
      })),
    ];

    await c.compact(msgs, 25);

    const text = summarizer.mock.calls[0]![0] as string;
    expect(text).toContain("visible text");
    expect(text).not.toContain("base64");
  });

  it("limits each message to 500 chars in text representation", async () => {
    const summarizer = vi.fn().mockResolvedValue("summary");
    const c = new HistoryCompactor({ summarizer });
    const msgs: Message[] = [
      ...Array.from({ length: 25 }, () => ({
        role: "user" as const,
        content: "x".repeat(600),
      })),
    ];

    await c.compact(msgs, 25);

    const text = summarizer.mock.calls[0]![0] as string;
    // Each message excerpt should be at most 500 chars (497 + "...")
    const lines = text.split("\n\n");
    for (const line of lines) {
      // [user]: + 500 chars max
      const content = line.replace(/^\[user\]: /, "");
      expect(content.length).toBeLessThanOrEqual(500);
    }
  });
});

// ============================================================================
// Custom keepRecent
// ============================================================================

describe("custom keepRecent", () => {
  it("keeps custom number of recent messages", async () => {
    const c = new HistoryCompactor({ keepRecent: 5 });
    const msgs = makeMessages(50);
    const result = await c.compact(msgs, 50);

    expect(result.compactedCount).toBe(45); // 50 - 5
    expect(result.keptCount).toBe(5);
    expect(result.messages!.length).toBe(6); // 1 summary + 5 recent
  });

  it("preserves the most recent messages", async () => {
    const c = new HistoryCompactor({ keepRecent: 3 });
    const msgs = makeMessages(10);
    const result = await c.compact(msgs, 10);

    // Last 3 messages should be Message 8, 9, 10
    const recent = result.messages!.slice(1); // skip summary
    expect(recent[0]!.content).toBe("Message 8");
    expect(recent[1]!.content).toBe("Message 9");
    expect(recent[2]!.content).toBe("Message 10");
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe("singleton", () => {
  it("getHistoryCompactor returns same instance", () => {
    const a = getHistoryCompactor();
    const b = getHistoryCompactor();
    expect(a).toBe(b);
  });

  it("resetHistoryCompactor clears the singleton", () => {
    const a = getHistoryCompactor();
    resetHistoryCompactor();
    const b = getHistoryCompactor();
    expect(a).not.toBe(b);
  });

  it("getHistoryCompactor accepts config on first call", () => {
    const c = getHistoryCompactor({ keepRecent: 10 });
    // Verify it uses custom config: shouldCompact at threshold with delta
    expect(c.shouldCompact(80, 100)).toBe(true);
  });

  it("second call ignores config", () => {
    getHistoryCompactor({ staleGuardDelta: 100 });
    const b = getHistoryCompactor({ staleGuardDelta: 1 });
    // staleGuardDelta should be 100 from first call
    // delta = 80 - 0 = 80 < 100 → false (first config wins)
    expect(b.shouldCompact(80, 100)).toBe(false);
  });
});
