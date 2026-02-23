/**
 * Cost Optimizer Tests
 *
 * @module tests/agents/routing/cost-optimizer
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CostOptimizer,
  createCostOptimizer,
  DEFAULT_BUDGET,
  DEFAULT_LOCAL_FALLBACK_THRESHOLD,
  TOKEN_ESTIMATES,
  OLLAMA_LOCAL_MODEL,
} from "../../../src/agents/routing/cost-optimizer.js";
import type { BudgetConstraint, ModelCapability } from "../../../src/agents/routing/types.js";

// ============================================================================
// Test Data
// ============================================================================

const TEST_MODELS: ModelCapability[] = [
  {
    providerId: "anthropic",
    modelId: "claude-opus-4",
    name: "Claude Opus 4",
    tier: "expert",
    inputCost: 0.015,
    outputCost: 0.075,
    maxTokens: 200000,
    strengths: ["architecture", "security"],
    features: ["reasoning", "coding"],
  },
  {
    providerId: "anthropic",
    modelId: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    tier: "powerful",
    inputCost: 0.003,
    outputCost: 0.015,
    maxTokens: 200000,
    strengths: ["code_gen", "bug_fix"],
    features: ["reasoning", "coding"],
  },
  {
    providerId: "openai",
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    tier: "balanced",
    inputCost: 0.00015,
    outputCost: 0.0006,
    maxTokens: 128000,
    strengths: ["general"],
    features: ["fast", "coding"],
  },
  OLLAMA_LOCAL_MODEL,
];

// ============================================================================
// Tests
// ============================================================================

describe("CostOptimizer", () => {
  let optimizer: CostOptimizer;

  beforeEach(() => {
    optimizer = createCostOptimizer(DEFAULT_BUDGET, TEST_MODELS);
  });

  describe("getBudgetStatus", () => {
    it("should return initial budget status", () => {
      const status = optimizer.getBudgetStatus();

      expect(status.dailyRemaining).toBe(DEFAULT_BUDGET.dailyBudget);
      expect(status.monthlyRemaining).toBe(DEFAULT_BUDGET.monthlyBudget);
      expect(status.dailyUsedPercent).toBe(0);
      expect(status.monthlyUsedPercent).toBe(0);
      expect(status.shouldFallbackToLocal).toBe(false);
    });

    it("should update after recording spend", () => {
      optimizer.recordSpend(5.0);
      const status = optimizer.getBudgetStatus();

      expect(status.dailyRemaining).toBe(5.0);
      expect(status.dailyUsedPercent).toBe(50);
    });

    it("should trigger fallback when budget is low", () => {
      // Spend 95% of daily budget
      optimizer.recordSpend(9.5);
      const status = optimizer.getBudgetStatus();

      expect(status.shouldFallbackToLocal).toBe(true);
    });
  });

  describe("estimateCost", () => {
    it("should estimate cost for known model", () => {
      const estimate = optimizer.estimateCost("anthropic", "claude-sonnet-4", "moderate");

      // moderate: 1500 input, 800 output
      // sonnet: 0.003/1K input, 0.015/1K output
      const expectedCost = (1500 / 1000) * 0.003 + (800 / 1000) * 0.015;

      expect(estimate.estimatedInputTokens).toBe(TOKEN_ESTIMATES.moderate.input);
      expect(estimate.estimatedOutputTokens).toBe(TOKEN_ESTIMATES.moderate.output);
      expect(estimate.estimatedCost).toBeCloseTo(expectedCost, 4);
      expect(estimate.withinBudget).toBe(true);
    });

    it("should return high estimate for unknown model", () => {
      const estimate = optimizer.estimateCost("unknown" as any, "unknown-model", "moderate");

      expect(estimate.estimatedCost).toBe(DEFAULT_BUDGET.maxCostPerRequest);
      expect(estimate.withinBudget).toBe(false);
    });

    it("should mark as not within budget when exceeds limits", () => {
      // Spend most of budget
      optimizer.recordSpend(9.9);
      const estimate = optimizer.estimateCost("anthropic", "claude-opus-4", "critical");

      expect(estimate.withinBudget).toBe(false);
    });
  });

  describe("optimize", () => {
    it("should select cheapest model that meets tier", () => {
      const result = optimizer.optimize(TEST_MODELS, "moderate", "balanced");

      // GPT-4o-mini is cheapest balanced tier
      expect(result.recommendedModel.providerId).toBe("openai");
      expect(result.recommendedModel.modelId).toBe("gpt-4o-mini");
      expect(result.shouldFallbackToLocal).toBe(false);
    });

    it("should provide alternatives", () => {
      const result = optimizer.optimize(TEST_MODELS, "moderate", "balanced");

      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it("should fallback to local when budget is low", () => {
      optimizer.recordSpend(9.5); // 95% spent
      const result = optimizer.optimize(TEST_MODELS, "moderate", "balanced");

      expect(result.shouldFallbackToLocal).toBe(true);
      expect(result.recommendedModel.providerId).toBe("ollama");
      expect(result.recommendedModel.estimatedCost).toBe(0);
      expect(result.fallbackReason).toContain("Budget low");
    });

    it("should fallback when no models meet tier", () => {
      // Filter to only fast models, but require expert tier
      const fastOnly = TEST_MODELS.filter((m) => m.tier === "fast");
      const result = optimizer.optimize(fastOnly, "critical", "expert");

      expect(result.shouldFallbackToLocal).toBe(true);
      expect(result.fallbackReason).toContain("No models meet minimum tier");
    });

    it("should include budget status in result", () => {
      optimizer.recordSpend(3.0);
      const result = optimizer.optimize(TEST_MODELS, "simple", "fast");

      expect(result.budgetStatus.remainingDaily).toBe(7.0);
      expect(result.budgetStatus.withinDailyBudget).toBe(true);
    });
  });

  describe("recordSpend", () => {
    it("should accumulate spending", () => {
      optimizer.recordSpend(2.0);
      optimizer.recordSpend(3.0);
      const status = optimizer.getBudgetStatus();

      expect(status.dailyRemaining).toBe(5.0);
      expect(status.monthlyRemaining).toBe(95.0);
    });
  });

  describe("resetDailySpend", () => {
    it("should reset daily spend only", () => {
      optimizer.recordSpend(5.0);
      optimizer.resetDailySpend();
      const status = optimizer.getBudgetStatus();

      expect(status.dailyRemaining).toBe(10.0);
      expect(status.monthlyRemaining).toBe(95.0); // Still reflects previous spend
    });
  });

  describe("resetMonthlySpend", () => {
    it("should reset both daily and monthly spend", () => {
      optimizer.recordSpend(5.0);
      optimizer.resetMonthlySpend();
      const status = optimizer.getBudgetStatus();

      expect(status.dailyRemaining).toBe(10.0);
      expect(status.monthlyRemaining).toBe(100.0);
    });
  });

  describe("shouldUseLocalFallback", () => {
    it("should return false when budget is healthy", () => {
      expect(optimizer.shouldUseLocalFallback()).toBe(false);
    });

    it("should return true when daily budget is low", () => {
      optimizer.recordSpend(9.1); // > 90%
      expect(optimizer.shouldUseLocalFallback()).toBe(true);
    });

    it("should return true when monthly budget is low", () => {
      optimizer.updateBudget({ currentMonthlySpend: 91 }); // > 90%
      expect(optimizer.shouldUseLocalFallback()).toBe(true);
    });
  });
});

describe("Token Estimates", () => {
  it("should have estimates for all complexity levels", () => {
    expect(TOKEN_ESTIMATES.simple).toBeDefined();
    expect(TOKEN_ESTIMATES.moderate).toBeDefined();
    expect(TOKEN_ESTIMATES.complex).toBeDefined();
    expect(TOKEN_ESTIMATES.critical).toBeDefined();
  });

  it("should increase with complexity", () => {
    expect(TOKEN_ESTIMATES.simple.input).toBeLessThan(TOKEN_ESTIMATES.moderate.input);
    expect(TOKEN_ESTIMATES.moderate.input).toBeLessThan(TOKEN_ESTIMATES.complex.input);
    expect(TOKEN_ESTIMATES.complex.input).toBeLessThan(TOKEN_ESTIMATES.critical.input);
  });
});

describe("Default Budget", () => {
  it("should have reasonable defaults", () => {
    expect(DEFAULT_BUDGET.maxCostPerRequest).toBe(0.50);
    expect(DEFAULT_BUDGET.dailyBudget).toBe(10.00);
    expect(DEFAULT_BUDGET.monthlyBudget).toBe(100.00);
  });
});

describe("Ollama Local Model", () => {
  it("should be zero cost", () => {
    expect(OLLAMA_LOCAL_MODEL.inputCost).toBe(0);
    expect(OLLAMA_LOCAL_MODEL.outputCost).toBe(0);
  });

  it("should be balanced tier", () => {
    expect(OLLAMA_LOCAL_MODEL.tier).toBe("balanced");
  });
});
