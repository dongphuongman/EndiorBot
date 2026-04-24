/**
 * OpenMythos #6: Stability Policy tests (LTI-stability analog).
 *
 * Validates composite runtime invariant guards:
 *   - Escalation cap → block at N pending escalations
 *   - Risky ops window → block at N PATCH/INTERACTIVE in rolling window
 *   - Checkpoint cadence (tasks) → warn at N tasks since checkpoint
 *   - Checkpoint cadence (time) → warn at T ms since checkpoint
 */

import { describe, it, expect } from "vitest";
import {
  checkStability,
  DEFAULT_STABILITY_POLICY,
  type SessionStabilityState,
} from "../../../src/sessions/autonomous/stability-policy.js";

function makeState(overrides: Partial<SessionStabilityState> = {}): SessionStabilityState {
  return {
    pendingEscalations: 0,
    riskyOpTimestamps: [],
    tasksSinceLastCheckpoint: 0,
    lastCheckpointAt: Date.now(),
    ...overrides,
  };
}

describe("Stability Guard — escalation cap", () => {
  it("stable when escalations < max", () => {
    const result = checkStability(makeState({ pendingEscalations: 2 }));
    expect(result.stable).toBe(true);
  });

  it("BLOCKS when escalations >= max (default 3)", () => {
    const result = checkStability(makeState({ pendingEscalations: 3 }));
    expect(result.stable).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.guard).toBe("escalation_cap");
    expect(result.violations[0]!.severity).toBe("block");
  });

  it("custom max escalations", () => {
    const result = checkStability(
      makeState({ pendingEscalations: 5 }),
      { maxEscalations: 10 },
    );
    expect(result.stable).toBe(true);
  });
});

describe("Stability Guard — risky ops window", () => {
  it("stable when risky ops < max in window", () => {
    const now = Date.now();
    const result = checkStability(makeState({
      riskyOpTimestamps: [now - 1000, now - 2000, now - 3000],
    }));
    expect(result.stable).toBe(true);
  });

  it("BLOCKS when risky ops >= max in window (default 5)", () => {
    const now = Date.now();
    const result = checkStability(makeState({
      riskyOpTimestamps: [now - 100, now - 200, now - 300, now - 400, now - 500],
    }));
    expect(result.stable).toBe(false);
    expect(result.violations.find((v) => v.guard === "risky_ops_window")).toBeDefined();
  });

  it("ignores ops outside the rolling window", () => {
    const now = Date.now();
    const oldOps = Array.from({ length: 10 }, (_, i) => now - (40 * 60_000) - i * 1000);
    const result = checkStability(makeState({
      riskyOpTimestamps: oldOps,
    }));
    expect(result.stable).toBe(true);
  });
});

describe("Stability Guard — checkpoint cadence", () => {
  it("warns when tasks since checkpoint >= max (default 10)", () => {
    const result = checkStability(makeState({
      tasksSinceLastCheckpoint: 10,
    }));
    expect(result.stable).toBe(true); // warning, not block
    expect(result.violations.find((v) => v.guard === "checkpoint_cadence_tasks")).toBeDefined();
    expect(result.violations[0]!.severity).toBe("warning");
  });

  it("warns when time since checkpoint >= max (default 15 min)", () => {
    const result = checkStability(makeState({
      lastCheckpointAt: Date.now() - 20 * 60_000, // 20 min ago
    }));
    expect(result.stable).toBe(true); // warning, not block
    expect(result.violations.find((v) => v.guard === "checkpoint_cadence_time")).toBeDefined();
  });

  it("no warning when checkpoint is fresh", () => {
    const result = checkStability(makeState({
      tasksSinceLastCheckpoint: 2,
      lastCheckpointAt: Date.now() - 60_000, // 1 min ago
    }));
    expect(result.violations).toHaveLength(0);
  });
});

describe("Stability Guard — composite", () => {
  it("multiple violations accumulate", () => {
    const now = Date.now();
    const result = checkStability(makeState({
      pendingEscalations: 5,
      riskyOpTimestamps: [now - 100, now - 200, now - 300, now - 400, now - 500],
      tasksSinceLastCheckpoint: 15,
      lastCheckpointAt: now - 20 * 60_000,
    }));
    expect(result.stable).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it("all-clear state has zero violations", () => {
    const result = checkStability(makeState());
    expect(result.stable).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe("DEFAULT_STABILITY_POLICY — sensible defaults", () => {
  it("maxEscalations = 3", () => {
    expect(DEFAULT_STABILITY_POLICY.maxEscalations).toBe(3);
  });

  it("maxRiskyOpsPerWindow = 5", () => {
    expect(DEFAULT_STABILITY_POLICY.maxRiskyOpsPerWindow).toBe(5);
  });

  it("riskyOpsWindowMs = 30 min", () => {
    expect(DEFAULT_STABILITY_POLICY.riskyOpsWindowMs).toBe(30 * 60_000);
  });

  it("maxTasksBetweenCheckpoints = 10", () => {
    expect(DEFAULT_STABILITY_POLICY.maxTasksBetweenCheckpoints).toBe(10);
  });

  it("maxTimeBetweenCheckpointsMs = 15 min", () => {
    expect(DEFAULT_STABILITY_POLICY.maxTimeBetweenCheckpointsMs).toBe(15 * 60_000);
  });
});
