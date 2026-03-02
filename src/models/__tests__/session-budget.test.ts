/**
 * SessionBudget Tests
 *
 * Tests for session budget tracking and enforcement.
 *
 * @module models/__tests__/session-budget.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @sprint 72
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SessionBudget,
  createSessionBudget,
  getSessionBudget,
  resetSessionBudget,
} from "../session-budget.js";
import {
  ModelTier,
  type ModelCallRecord,
  DEFAULT_BUDGET_CONFIG,
} from "../types.js";

describe("SessionBudget", () => {
  beforeEach(() => {
    resetSessionBudget();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor and Config
  // ==========================================================================

  describe("constructor", () => {
    it("should create with default config", () => {
      const budget = new SessionBudget();
      expect(budget).toBeDefined();
      expect(budget.getConfig().totalUsd).toBe(DEFAULT_BUDGET_CONFIG.totalUsd);
    });

    it("should accept custom config", () => {
      const budget = new SessionBudget({
        totalUsd: 20,
        opusCapUsd: 5,
        opusCapMin: 30,
      });

      const config = budget.getConfig();
      expect(config.totalUsd).toBe(20);
      expect(config.opusCapUsd).toBe(5);
      expect(config.opusCapMin).toBe(30);
    });

    it("should initialize with zero spending", () => {
      const budget = new SessionBudget();
      expect(budget.getTotalSpent()).toBe(0);
    });
  });

  // ==========================================================================
  // Budget Checking
  // ==========================================================================

  describe("checkBudget", () => {
    it("should return canAfford=true when budget available", () => {
      const budget = new SessionBudget({ totalUsd: 10, opusCapUsd: 3 });

      const result = budget.checkBudget(ModelTier.STANDARD, 0.10);

      expect(result.canAfford).toBe(true);
      expect(result.remainingTotal).toBe(10);
    });

    it("should return canAfford=false when total budget exceeded", () => {
      const budget = new SessionBudget({ totalUsd: 1 });

      // Record some spending first
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 1.0));

      const result = budget.checkBudget(ModelTier.STANDARD, 0.50);

      expect(result.canAfford).toBe(false);
      expect(result.warning).toContain("exceeded");
    });

    it("should check Opus cost cap", () => {
      const budget = new SessionBudget({ opusCapUsd: 1 });

      // Exhaust Opus budget
      budget.recordCall(createCallRecord(ModelTier.ELITE, 1.0));

      const result = budget.checkBudget(ModelTier.ELITE, 0.10);

      expect(result.canAfford).toBe(false);
      expect(result.warning).toContain("cost cap");
      expect(result.suggestedAlternative).toBe(ModelTier.STANDARD);
    });

    it("should check Opus time cap", () => {
      const budget = new SessionBudget({ opusCapMin: 1 }); // 1 minute

      // Use all Opus time
      budget.recordCall({
        ...createCallRecord(ModelTier.ELITE, 0.10),
        durationSeconds: 60,
      });

      const result = budget.checkBudget(ModelTier.ELITE, 0.10);

      expect(result.canAfford).toBe(false);
      expect(result.warning).toContain("time cap");
    });

    it("should return warning when threshold reached", () => {
      const budget = new SessionBudget({
        totalUsd: 10,
        enableWarnings: true,
        warningThreshold: 80,
      });

      // Spend 80%
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 8.0));

      const result = budget.checkBudget(ModelTier.STANDARD, 0.10);

      expect(result.canAfford).toBe(true);
      expect(result.warning).toContain("80");
    });

    it("should suggest alternative when budget exceeded", () => {
      const budget = new SessionBudget({ totalUsd: 1 });

      // Exhaust most budget
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.95));

      const result = budget.checkBudget(ModelTier.ELITE, 0.50);

      expect(result.canAfford).toBe(false);
      expect(result.suggestedAlternative).toBe(ModelTier.STANDARD);
    });
  });

  // ==========================================================================
  // canUseElite
  // ==========================================================================

  describe("canUseElite", () => {
    it("should return true when Opus available", () => {
      const budget = new SessionBudget({ opusCapUsd: 3 });
      expect(budget.canUseElite()).toBe(true);
    });

    it("should return false when Opus cap reached", () => {
      const budget = new SessionBudget({ opusCapUsd: 1 });
      budget.recordCall(createCallRecord(ModelTier.ELITE, 1.0));

      expect(budget.canUseElite()).toBe(false);
    });
  });

  // ==========================================================================
  // Recording Calls
  // ==========================================================================

  describe("recordCall", () => {
    it("should update spending for tier", () => {
      const budget = new SessionBudget();

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));

      const spending = budget.getTierSpending(ModelTier.STANDARD);
      expect(spending.usd).toBe(0.05);
      expect(spending.calls).toBe(1);
    });

    it("should accumulate spending", () => {
      const budget = new SessionBudget();

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.10));
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.15));

      const spending = budget.getTierSpending(ModelTier.STANDARD);
      expect(spending.usd).toBeCloseTo(0.30);
      expect(spending.calls).toBe(3);
    });

    it("should track tokens", () => {
      const budget = new SessionBudget();

      budget.recordCall({
        ...createCallRecord(ModelTier.STANDARD, 0.05),
        inputTokens: 1000,
        outputTokens: 500,
      });

      const spending = budget.getTierSpending(ModelTier.STANDARD);
      expect(spending.tokens).toBe(1500);
    });

    it("should track stage spending", () => {
      const budget = new SessionBudget();

      budget.recordCall({
        ...createCallRecord(ModelTier.STANDARD, 0.10),
        stage: "build",
      });

      expect(budget.getStageSpending("build")).toBe(0.10);
    });

    it("should update lastUpdate timestamp", () => {
      const budget = new SessionBudget();
      const before = new Date().toISOString();

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));

      const state = budget.getState();
      expect(state.lastUpdate >= before).toBe(true);
    });
  });

  // ==========================================================================
  // Budget Queries
  // ==========================================================================

  describe("budget queries", () => {
    it("should return total spent across all tiers", () => {
      const budget = new SessionBudget();

      budget.recordCall(createCallRecord(ModelTier.ELITE, 0.50));
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.10));
      budget.recordCall(createCallRecord(ModelTier.EFFICIENCY, 0.01));

      expect(budget.getTotalSpent()).toBeCloseTo(0.61);
    });

    it("should return remaining budget", () => {
      const budget = new SessionBudget({ totalUsd: 10, opusCapUsd: 3, opusCapMin: 20 });

      budget.recordCall(createCallRecord(ModelTier.ELITE, 1.0, 300)); // 5 minutes

      const remaining = budget.getRemaining();
      expect(remaining.total).toBe(9);
      expect(remaining.opus).toBe(2);
      expect(remaining.opusMinutes).toBe(15);
    });

    it("should return tier spending copy", () => {
      const budget = new SessionBudget();
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));

      const spending = budget.getTierSpending(ModelTier.STANDARD);
      spending.usd = 100; // Modify the copy

      // Original should be unchanged
      expect(budget.getTierSpending(ModelTier.STANDARD).usd).toBe(0.05);
    });

    it("should return 0 for unknown stage spending", () => {
      const budget = new SessionBudget();
      expect(budget.getStageSpending("unknown")).toBe(0);
    });
  });

  // ==========================================================================
  // Utilization
  // ==========================================================================

  describe("getUtilization", () => {
    it("should return utilization percentages", () => {
      const budget = new SessionBudget({ totalUsd: 10, opusCapUsd: 2, opusCapMin: 10 });

      budget.recordCall(createCallRecord(ModelTier.ELITE, 1.0, 300)); // 5 min

      const util = budget.getUtilization();
      expect(util.total).toBe(10); // 10% of total
      expect(util.opus).toBe(50); // 50% of Opus cost
      expect(util.opusTime).toBe(50); // 50% of Opus time
      expect(util.byTier[ModelTier.ELITE]).toBe(1.0);
    });

    it("should return zero utilization initially", () => {
      const budget = new SessionBudget();

      const util = budget.getUtilization();
      expect(util.total).toBe(0);
      expect(util.opus).toBe(0);
      expect(util.opusTime).toBe(0);
    });
  });

  // ==========================================================================
  // Stage Management
  // ==========================================================================

  describe("stage management", () => {
    it("should set and get current stage", () => {
      const budget = new SessionBudget();

      budget.setCurrentStage("build");
      expect(budget.getCurrentStage()).toBe("build");

      budget.setCurrentStage("test");
      expect(budget.getCurrentStage()).toBe("test");
    });

    it("should get stage budget allocation", () => {
      const budget = new SessionBudget({
        totalUsd: 100,
        perStage: {
          planning: 10,
          design: 20,
          build: 50,
          test: 20,
        },
      });

      expect(budget.getStageBudget("planning")).toBe(10);
      expect(budget.getStageBudget("design")).toBe(20);
      expect(budget.getStageBudget("build")).toBe(50);
      expect(budget.getStageBudget("test")).toBe(20);
    });

    it("should use current stage if not specified", () => {
      const budget = new SessionBudget({
        totalUsd: 100,
        perStage: { planning: 10, design: 20, build: 50, test: 20 },
      });

      budget.setCurrentStage("build");
      expect(budget.getStageBudget()).toBe(50);
    });

    it("should return default for unknown stage", () => {
      const budget = new SessionBudget({ totalUsd: 100 });
      // Unknown stage gets 25% by default
      expect(budget.getStageBudget("unknown")).toBe(25);
    });

    it("should check if stage budget exceeded", () => {
      const budget = new SessionBudget({
        totalUsd: 100,
        perStage: { planning: 10, design: 20, build: 50, test: 20 },
      });

      budget.recordCall({
        ...createCallRecord(ModelTier.STANDARD, 15),
        stage: "planning",
      });

      expect(budget.isStageBudgetExceeded("planning")).toBe(true);
      expect(budget.isStageBudgetExceeded("build")).toBe(false);
    });
  });

  // ==========================================================================
  // Event System
  // ==========================================================================

  describe("event system", () => {
    it("should emit model_call_recorded event", () => {
      const budget = new SessionBudget();
      const listener = vi.fn();
      budget.addEventListener(listener);

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "model_call_recorded",
          details: expect.objectContaining({
            tier: ModelTier.STANDARD,
            cost: 0.05,
          }),
        })
      );
    });

    it("should emit warning_threshold_reached event", () => {
      const budget = new SessionBudget({
        totalUsd: 1,
        enableWarnings: true,
        warningThreshold: 50,
      });
      const listener = vi.fn();
      budget.addEventListener(listener);

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.60));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning_threshold_reached",
        })
      );
    });

    it("should emit opus_cap_reached event when cost cap reached", () => {
      const budget = new SessionBudget({ opusCapUsd: 1 });
      const listener = vi.fn();
      budget.addEventListener(listener);

      budget.recordCall(createCallRecord(ModelTier.ELITE, 1.0));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "opus_cap_reached",
          details: expect.objectContaining({
            type: "cost",
          }),
        })
      );
    });

    it("should emit opus_cap_reached event when time cap reached", () => {
      const budget = new SessionBudget({ opusCapMin: 1 });
      const listener = vi.fn();
      budget.addEventListener(listener);

      budget.recordCall({
        ...createCallRecord(ModelTier.ELITE, 0.10),
        durationSeconds: 60,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "opus_cap_reached",
          details: expect.objectContaining({
            type: "time",
          }),
        })
      );
    });

    it("should emit budget_exceeded event", () => {
      const budget = new SessionBudget({ totalUsd: 1 });
      const listener = vi.fn();
      budget.addEventListener(listener);

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 1.5));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "budget_exceeded",
          details: expect.objectContaining({
            overage: 0.5,
          }),
        })
      );
    });

    it("should remove event listener", () => {
      const budget = new SessionBudget();
      const listener = vi.fn();
      budget.addEventListener(listener);
      budget.removeEventListener(listener);

      budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener errors gracefully", () => {
      const budget = new SessionBudget();
      const badListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();

      budget.addEventListener(badListener);
      budget.addEventListener(goodListener);

      // Should not throw
      expect(() => {
        budget.recordCall(createCallRecord(ModelTier.STANDARD, 0.05));
      }).not.toThrow();

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // State Management
  // ==========================================================================

  describe("state management", () => {
    it("should reset state", () => {
      const budget = new SessionBudget();
      budget.recordCall(createCallRecord(ModelTier.STANDARD, 1.0));

      budget.reset();

      expect(budget.getTotalSpent()).toBe(0);
    });

    it("should restore state", () => {
      const budget = new SessionBudget();

      const state = budget.getState();
      state.spending[ModelTier.STANDARD].usd = 5.0;
      state.spending[ModelTier.STANDARD].calls = 10;

      const newBudget = new SessionBudget();
      newBudget.restoreState(state);

      expect(newBudget.getTotalSpent()).toBe(5.0);
      expect(newBudget.getTierSpending(ModelTier.STANDARD).calls).toBe(10);
    });

    it("should get config copy", () => {
      const budget = new SessionBudget({ totalUsd: 15 });

      const config = budget.getConfig();
      expect(config.totalUsd).toBe(15);

      // Should be a copy
      (config as { totalUsd: number }).totalUsd = 100;
      expect(budget.getConfig().totalUsd).toBe(15);
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe("factory functions", () => {
    it("should create budget with createSessionBudget", () => {
      const budget = createSessionBudget({ totalUsd: 20 });
      expect(budget).toBeInstanceOf(SessionBudget);
      expect(budget.getConfig().totalUsd).toBe(20);
    });

    it("should get global budget with getSessionBudget", () => {
      const budget1 = getSessionBudget();
      const budget2 = getSessionBudget();

      expect(budget1).toBe(budget2);
    });

    it("should reset global budget", () => {
      const budget1 = getSessionBudget();
      resetSessionBudget();
      const budget2 = getSessionBudget();

      expect(budget1).not.toBe(budget2);
    });
  });
});

// ==========================================================================
// Test Helpers
// ==========================================================================

function createCallRecord(
  tier: ModelTier,
  cost: number,
  durationSeconds: number = 10
): ModelCallRecord {
  return {
    tier,
    model:
      tier === ModelTier.ELITE
        ? "claude-opus-4-5-20251101"
        : tier === ModelTier.STANDARD
          ? "claude-sonnet-4-5-20250929"
          : "claude-haiku-4-5-20251001",
    cost,
    durationSeconds,
    inputTokens: 1000,
    outputTokens: 500,
    timestamp: new Date().toISOString(),
  };
}
