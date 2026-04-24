/**
 * OpenMythos #7: Expert Routing tests (MoE analog, pragmatic version).
 *
 * CTO conditions:
 *   - FF_EXPERT_ROUTING_ENABLED = read-only Phase 1
 *   - Recommendations logged but don't change routing
 *   - Data threshold: >= 5 records before recommending
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  recordRoutingOutcome,
  scoreProviders,
  getRecommendation,
  getRoutingStats,
  resetRoutingRecords,
  type RoutingRecord,
} from "../../src/providers/expert-routing.js";

let savedFF: string | undefined;

beforeEach(() => {
  resetRoutingRecords();
  savedFF = process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED;
  delete process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED;
});

afterEach(() => {
  if (savedFF === undefined) delete process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED;
  else process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED = savedFF;
});

function makeRecord(overrides: Partial<RoutingRecord> = {}): RoutingRecord {
  return {
    agent: "coder",
    provider: "kimi",
    model: "kimi-k2-6",
    taskType: "chat",
    success: true,
    durationMs: 3000,
    tokenCount: 1500,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("recordRoutingOutcome", () => {
  it("records and retrieves outcomes", () => {
    recordRoutingOutcome(makeRecord());
    recordRoutingOutcome(makeRecord({ success: false }));
    const stats = getRoutingStats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.byAgent["coder"]).toBe(2);
  });

  it("caps at 1000 records (FIFO eviction)", () => {
    for (let i = 0; i < 1050; i++) {
      recordRoutingOutcome(makeRecord({ timestamp: i }));
    }
    const stats = getRoutingStats();
    expect(stats.totalRecords).toBe(1000);
  });
});

describe("scoreProviders", () => {
  it("scores by success rate descending", () => {
    // Kimi: 8 success + 2 fail = 80%
    for (let i = 0; i < 8; i++) recordRoutingOutcome(makeRecord({ provider: "kimi", model: "kimi-k2-6" }));
    for (let i = 0; i < 2; i++) recordRoutingOutcome(makeRecord({ provider: "kimi", model: "kimi-k2-6", success: false }));

    // Claude: 9 success + 1 fail = 90%
    for (let i = 0; i < 9; i++) recordRoutingOutcome(makeRecord({ provider: "claude-code", model: "claude-opus-4" }));
    recordRoutingOutcome(makeRecord({ provider: "claude-code", model: "claude-opus-4", success: false }));

    const scores = scoreProviders("coder", "chat");
    expect(scores).toHaveLength(2);
    expect(scores[0]!.provider).toBe("claude-code"); // 90% > 80%
    expect(scores[0]!.successRate).toBeCloseTo(0.9);
    expect(scores[1]!.provider).toBe("kimi");
    expect(scores[1]!.successRate).toBeCloseTo(0.8);
  });

  it("returns empty for agent with no records", () => {
    const scores = scoreProviders("nonexistent", "chat");
    expect(scores).toHaveLength(0);
  });

  it("calculates average duration and tokens", () => {
    recordRoutingOutcome(makeRecord({ durationMs: 1000, tokenCount: 500 }));
    recordRoutingOutcome(makeRecord({ durationMs: 3000, tokenCount: 1500 }));
    const scores = scoreProviders("coder", "chat");
    expect(scores[0]!.avgDurationMs).toBe(2000);
    expect(scores[0]!.avgTokens).toBe(1000);
  });
});

describe("getRecommendation", () => {
  it("returns null when insufficient data (< 5 records)", () => {
    for (let i = 0; i < 4; i++) recordRoutingOutcome(makeRecord());
    const rec = getRecommendation("coder", "chat");
    expect(rec).toBeNull();
  });

  it("returns recommendation when >= 5 records", () => {
    for (let i = 0; i < 10; i++) recordRoutingOutcome(makeRecord());
    const rec = getRecommendation("coder", "chat");
    expect(rec).not.toBeNull();
    expect(rec!.agent).toBe("coder");
    expect(rec!.recommended.provider).toBe("kimi");
    expect(rec!.confidence).toBeGreaterThan(0);
  });

  it("confidence scales with sample count (1.0 at 50 samples)", () => {
    for (let i = 0; i < 50; i++) recordRoutingOutcome(makeRecord());
    const rec = getRecommendation("coder", "chat");
    expect(rec!.confidence).toBe(1);
  });

  it("recommends the provider with highest success rate", () => {
    // Kimi: 3/5 = 60%
    for (let i = 0; i < 3; i++) recordRoutingOutcome(makeRecord({ provider: "kimi" }));
    for (let i = 0; i < 2; i++) recordRoutingOutcome(makeRecord({ provider: "kimi", success: false }));

    // Claude: 4/5 = 80%
    for (let i = 0; i < 4; i++) recordRoutingOutcome(makeRecord({ provider: "claude-code", model: "claude-opus-4" }));
    recordRoutingOutcome(makeRecord({ provider: "claude-code", model: "claude-opus-4", success: false }));

    const rec = getRecommendation("coder", "chat");
    expect(rec!.recommended.provider).toBe("claude-code");
    expect(rec!.alternatives[0]!.provider).toBe("kimi");
  });
});

describe("getRoutingStats", () => {
  it("aggregates by agent and provider", () => {
    recordRoutingOutcome(makeRecord({ agent: "coder", provider: "kimi" }));
    recordRoutingOutcome(makeRecord({ agent: "coder", provider: "kimi" }));
    recordRoutingOutcome(makeRecord({ agent: "reviewer", provider: "claude-code" }));

    const stats = getRoutingStats();
    expect(stats.totalRecords).toBe(3);
    expect(stats.byAgent["coder"]).toBe(2);
    expect(stats.byAgent["reviewer"]).toBe(1);
    expect(stats.byProvider["kimi"]!.total).toBe(2);
    expect(stats.byProvider["kimi"]!.success).toBe(2);
    expect(stats.byProvider["claude-code"]!.total).toBe(1);
  });
});

describe("FF_EXPERT_ROUTING_ENABLED — Phase 1 (read-only)", () => {
  it("recommendation is produced regardless of FF state (Phase 1 data collection)", () => {
    for (let i = 0; i < 10; i++) recordRoutingOutcome(makeRecord());

    // FF off — still produces recommendation (logged, not acted on)
    const recOff = getRecommendation("coder", "chat");
    expect(recOff).not.toBeNull();

    // FF on — same recommendation (Phase 2 would act on it)
    process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED = "true";
    const recOn = getRecommendation("coder", "chat");
    expect(recOn).not.toBeNull();
    expect(recOn!.recommended.provider).toBe(recOff!.recommended.provider);
  });
});
