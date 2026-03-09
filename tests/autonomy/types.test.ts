/**
 * Autonomy Types Tests — Sprint 95
 *
 * Validates type structures and default T2 configuration.
 *
 * @module tests/autonomy/types
 * @sprint 95
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_T2_CONFIG,
  type GoalDecomposition,
  type Subtask,
  type SubtaskResult,
  type SessionRelayContext,
  type AggregatedResponse,
  type DecompositionStrategy,
  type MultiAgentConfig,
} from "../../src/autonomy/index.js";

// ============================================================================
// DEFAULT_T2_CONFIG
// ============================================================================

describe("DEFAULT_T2_CONFIG", () => {
  it("should align with AUTONOMY_GATE_CONFIG.B (30 min, $2.00)", () => {
    expect(DEFAULT_T2_CONFIG.timeoutMs).toBe(30 * 60 * 1000);
    expect(DEFAULT_T2_CONFIG.costLimitUsd).toBe(2.0);
  });

  it("should have reasonable defaults", () => {
    expect(DEFAULT_T2_CONFIG.maxAgents).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_T2_CONFIG.maxAgents).toBeLessThanOrEqual(10);
    expect(DEFAULT_T2_CONFIG.maxParallelTracks).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_T2_CONFIG.perSubtaskTimeoutMs).toBeGreaterThan(0);
    expect(DEFAULT_T2_CONFIG.defaultStrategy).toBe("sequential");
  });
});

// ============================================================================
// GoalDecomposition
// ============================================================================

describe("GoalDecomposition", () => {
  it("should create a valid decomposition with all required fields", () => {
    const decomposition: GoalDecomposition = {
      goalId: "goal-1",
      originalGoal: "design and implement payment gateway",
      subtasks: [
        {
          id: "sub-1",
          description: "Design payment architecture",
          agent: "architect",
          dependencies: [],
          priority: 1,
          estimatedDurationMs: 10_000,
          status: "pending",
        },
        {
          id: "sub-2",
          description: "Implement payment module",
          agent: "coder",
          dependencies: ["sub-1"],
          priority: 2,
          estimatedDurationMs: 20_000,
          status: "pending",
        },
      ],
      strategy: "sequential",
      estimatedDurationMs: 30_000,
      estimatedCostUsd: 0.5,
    };

    expect(decomposition.goalId).toBe("goal-1");
    expect(decomposition.subtasks).toHaveLength(2);
    expect(decomposition.subtasks[1].dependencies).toContain("sub-1");
    expect(decomposition.strategy).toBe("sequential");
  });
});

// ============================================================================
// DecompositionStrategy
// ============================================================================

describe("DecompositionStrategy", () => {
  it("should cover all valid strategies", () => {
    const strategies: DecompositionStrategy[] = ["sequential", "parallel", "mixed"];
    expect(strategies).toHaveLength(3);

    // Verify each is assignable
    const s1: DecompositionStrategy = "sequential";
    const s2: DecompositionStrategy = "parallel";
    const s3: DecompositionStrategy = "mixed";
    expect(s1).toBe("sequential");
    expect(s2).toBe("parallel");
    expect(s3).toBe("mixed");
  });
});

// ============================================================================
// SubtaskResult
// ============================================================================

describe("SubtaskResult", () => {
  it("should create a successful result", () => {
    const result: SubtaskResult = {
      subtaskId: "sub-1",
      agent: "architect",
      success: true,
      output: "Architecture design complete.",
      durationMs: 5000,
      estimatedCostUsd: 0.15,
      provider: "claude-bridge",
    };

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.estimatedCostUsd).toBeLessThan(DEFAULT_T2_CONFIG.costLimitUsd);
  });

  it("should create a failed result with error", () => {
    const result: SubtaskResult = {
      subtaskId: "sub-2",
      agent: "coder",
      success: false,
      output: "",
      durationMs: 60_000,
      estimatedCostUsd: 0.05,
      error: "All providers failed",
    };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
