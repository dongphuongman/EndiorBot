/**
 * Sprint 141 P0-1: Cost Telemetry tests.
 *
 * Validates:
 *   - AgentMetric.provider + model + fallbackUsed fields accepted
 *   - DailyMetrics.cost.byAgent + cost.byProvider populated on recordInvocation()
 *   - DailyMetrics.tokens.byProvider populated
 *   - DailyMetrics.fallbacks tracking
 *   - getDailyMetrics() public accessor
 *
 * CPO P3 contract: cost data supports 3 questions:
 *   Q1: top-cost agent → cost.byAgent sorted
 *   Q2: most expensive fallback → fallbacks.byProvider + cost.byProvider
 *   Q3: savings vs baseline → total tokens × baseline rate vs actual cost
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MetricsCollector, type AgentMetric, type DailyMetrics } from "../../src/analytics/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let metricsDir: string;
let collector: MetricsCollector;

beforeEach(() => {
  metricsDir = mkdtempSync(join(tmpdir(), "cost-test-"));
  collector = new MetricsCollector({ metricsDir });
});

afterEach(() => {
  try { rmSync(metricsDir, { recursive: true, force: true }); } catch { /* cleanup */ }
});

function makeMetric(overrides: Partial<AgentMetric> = {}): AgentMetric {
  return {
    agent: "coder",
    task: "implement feature",
    mode: "READ",
    startTime: Date.now(),
    endTime: Date.now() + 5000,
    durationMs: 5000,
    success: true,
    tokenUsage: { input: 1000, output: 500 },
    cost: 0.005,
    provider: "kimi",
    model: "kimi-k2-6",
    ...overrides,
  };
}

describe("AgentMetric — new fields accepted", () => {
  it("provider, model, fallbackUsed fields are recorded without error", () => {
    const metric = makeMetric({
      provider: "kimi",
      model: "kimi-k2-6",
      fallbackUsed: false,
    });
    collector.recordInvocation(metric);
    // No throw = success
  });

  it("fallbackUsed=true is accepted", () => {
    const metric = makeMetric({
      provider: "claude-code",
      model: "claude-opus-4",
      fallbackUsed: true,
    });
    collector.recordInvocation(metric);
  });
});

describe("DailyMetrics — cost.byAgent populated", () => {
  it("records cost per agent on invocation", () => {
    collector.recordInvocation(makeMetric({ agent: "coder", cost: 0.01 }));
    collector.recordInvocation(makeMetric({ agent: "reviewer", cost: 0.02 }));
    collector.recordInvocation(makeMetric({ agent: "coder", cost: 0.015 }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today);
    expect(daily).not.toBeNull();
    expect(daily!.cost.byAgent["coder"]).toBeCloseTo(0.025);
    expect(daily!.cost.byAgent["reviewer"]).toBeCloseTo(0.02);
  });
});

describe("DailyMetrics — cost.byProvider populated", () => {
  it("records cost per provider on invocation", () => {
    collector.recordInvocation(makeMetric({ provider: "kimi", cost: 0.01 }));
    collector.recordInvocation(makeMetric({ provider: "claude-code", cost: 0.05 }));
    collector.recordInvocation(makeMetric({ provider: "kimi", cost: 0.008 }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today);
    expect(daily!.cost.byProvider["kimi"]).toBeCloseTo(0.018);
    expect(daily!.cost.byProvider["claude-code"]).toBeCloseTo(0.05);
  });
});

describe("DailyMetrics — tokens.byProvider populated", () => {
  it("aggregates token usage per provider", () => {
    collector.recordInvocation(makeMetric({
      provider: "kimi",
      tokenUsage: { input: 1000, output: 500 },
    }));
    collector.recordInvocation(makeMetric({
      provider: "claude-code",
      tokenUsage: { input: 2000, output: 1000 },
    }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today);
    expect(daily!.tokens.byProvider["kimi"]).toEqual({ input: 1000, output: 500 });
    expect(daily!.tokens.byProvider["claude-code"]).toEqual({ input: 2000, output: 1000 });
  });
});

describe("DailyMetrics — fallback tracking", () => {
  it("counts fallbacks per provider", () => {
    collector.recordInvocation(makeMetric({ provider: "claude-code", fallbackUsed: true }));
    collector.recordInvocation(makeMetric({ provider: "claude-code", fallbackUsed: true }));
    collector.recordInvocation(makeMetric({ provider: "kimi", fallbackUsed: false }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today);
    expect(daily!.fallbacks.total).toBe(2);
    expect(daily!.fallbacks.byProvider["claude-code"]).toBe(2);
    expect(daily!.fallbacks.byProvider["kimi"]).toBeUndefined();
  });
});

describe("getDailyMetrics — public accessor", () => {
  it("returns null for dates with no data", () => {
    expect(collector.getDailyMetrics("2020-01-01")).toBeNull();
  });

  it("returns metrics for dates with data", () => {
    collector.recordInvocation(makeMetric());
    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today);
    expect(daily).not.toBeNull();
    expect(daily!.date).toBe(today);
    expect(daily!.usage.totalInvocations).toBe(1);
  });
});

describe("CPO P3 — cost data supports 3 decision questions", () => {
  it("Q1: top-cost agent — byAgent has enough data to sort", () => {
    collector.recordInvocation(makeMetric({ agent: "coder", cost: 0.10 }));
    collector.recordInvocation(makeMetric({ agent: "architect", cost: 0.50 }));
    collector.recordInvocation(makeMetric({ agent: "reviewer", cost: 0.20 }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today)!;
    const sorted = Object.entries(daily.cost.byAgent).sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("architect");
    expect(sorted[1]![0]).toBe("reviewer");
    expect(sorted[2]![0]).toBe("coder");
  });

  it("Q2: most expensive fallback — fallback entries linked to provider cost", () => {
    collector.recordInvocation(makeMetric({ provider: "claude-code", cost: 0.50, fallbackUsed: true }));
    collector.recordInvocation(makeMetric({ provider: "kimi", cost: 0.01, fallbackUsed: false }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today)!;
    // Fallback provider with highest cost
    const fallbackProviders = Object.keys(daily.fallbacks.byProvider);
    expect(fallbackProviders).toContain("claude-code");
    expect(daily.cost.byProvider["claude-code"]).toBe(0.50);
  });

  it("Q3: savings vs baseline — total tokens available for baseline calculation", () => {
    collector.recordInvocation(makeMetric({
      tokenUsage: { input: 5000, output: 2000 },
      cost: 0.01,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const daily = collector.getDailyMetrics(today)!;

    // Baseline: Claude Sonnet pricing
    const baselineInputPer1k = 0.003;
    const baselineOutputPer1k = 0.015;
    const baselineCost = (daily.tokens.totalInput / 1000) * baselineInputPer1k
      + (daily.tokens.totalOutput / 1000) * baselineOutputPer1k;
    const actualCost = daily.cost.total;
    const savings = baselineCost - actualCost;

    expect(savings).toBeGreaterThan(0); // Kimi is cheaper than Sonnet baseline
    expect(daily.tokens.totalInput).toBe(5000);
    expect(daily.tokens.totalOutput).toBe(2000);
  });
});
