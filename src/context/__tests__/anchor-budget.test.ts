/**
 * Anchor Budget Tests
 *
 * Unit tests for the AnchorBudget class.
 * Sprint 65: T5.14 - Token budget optimization.
 *
 * @module context/__tests__/anchor-budget.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AnchorBudget,
  getAnchorBudget,
  resetAnchorBudget,
  formatWithinBudget,
  formatCheckpointCompact,
  formatBlockerCompact,
  DEFAULT_ANCHOR_BUDGET,
  COMPACT_ANCHOR_BUDGET,
  MINIMAL_ANCHOR_BUDGET,
} from "../anchor-budget.js";

// ============================================================================
// AnchorBudget Tests
// ============================================================================

describe("AnchorBudget", () => {
  beforeEach(() => {
    resetAnchorBudget();
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const budget = new AnchorBudget();
      const config = budget.getConfig();

      expect(config.maxTotalTokens).toBe(DEFAULT_ANCHOR_BUDGET.maxTotalTokens);
      expect(config.maxSprintGoalTokens).toBe(
        DEFAULT_ANCHOR_BUDGET.maxSprintGoalTokens
      );
    });

    it("should create with custom config", () => {
      const budget = new AnchorBudget({ maxTotalTokens: 500 });
      const config = budget.getConfig();

      expect(config.maxTotalTokens).toBe(500);
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens correctly", () => {
      const budget = new AnchorBudget();

      // ~4 chars per token
      expect(budget.estimateTokens("test")).toBe(1);
      expect(budget.estimateTokens("this is a longer text")).toBe(6);
      expect(budget.estimateTokens("a".repeat(100))).toBe(25);
    });
  });

  describe("determineStrategy", () => {
    it("should return full for low usage", () => {
      const budget = new AnchorBudget();

      const strategy = budget.determineStrategy(100, 1000);
      expect(strategy).toBe("full");
    });

    it("should return compact for moderate usage", () => {
      const budget = new AnchorBudget();

      // 75% usage should trigger compact
      const strategy = budget.determineStrategy(750, 1000);
      expect(strategy).toBe("compact");
    });

    it("should return minimal for high usage", () => {
      const budget = new AnchorBudget();

      // 95% usage should trigger minimal
      const strategy = budget.determineStrategy(950, 1000);
      expect(strategy).toBe("minimal");
    });
  });

  describe("allocate", () => {
    it("should allocate within budget", () => {
      const budget = new AnchorBudget();

      const allocation = budget.allocate({
        gitTokens: 100,
        sprintGoalTokens: 200,
        checkpointTokens: 100,
        blockerTokens: 50,
      });

      expect(allocation.totalTokens).toBeLessThanOrEqual(
        DEFAULT_ANCHOR_BUDGET.maxTotalTokens
      );
      expect(allocation.strategy).toBe("full");
      expect(allocation.truncated).toBe(false);
    });

    it("should truncate when over budget", () => {
      const budget = new AnchorBudget({ maxTotalTokens: 200 });

      const allocation = budget.allocate({
        gitTokens: 100,
        sprintGoalTokens: 300,
        checkpointTokens: 100,
        blockerTokens: 100,
      });

      expect(allocation.truncated).toBe(true);
      expect(allocation.totalTokens).toBeLessThanOrEqual(200);
    });

    it("should prioritize git and sprint goal over checkpoint", () => {
      const budget = new AnchorBudget({ maxTotalTokens: 300 });

      const allocation = budget.allocate({
        gitTokens: 100,
        sprintGoalTokens: 150,
        checkpointTokens: 100,
        blockerTokens: 50,
      });

      // Git and sprint goal should be included
      expect(allocation.breakdown.git).toBeGreaterThan(0);
      expect(allocation.breakdown.sprintGoal).toBeGreaterThan(0);
    });

    it("should switch to compact strategy when needed", () => {
      const budget = new AnchorBudget({ maxTotalTokens: 1000 });

      const allocation = budget.allocate(
        {
          gitTokens: 100,
          sprintGoalTokens: 400,
          checkpointTokens: 150,
          blockerTokens: 100,
        },
        1000 // Explicitly set available budget
      );

      // Total requested (750) / 1000 = 75% > 70% threshold = compact
      expect(allocation.strategy).toBe("compact");
    });

    it("should drop items when minimal budget", () => {
      const budget = new AnchorBudget({ maxTotalTokens: 100 });

      const allocation = budget.allocate({
        gitTokens: 50,
        sprintGoalTokens: 200,
        checkpointTokens: 100,
        blockerTokens: 50,
      });

      expect(allocation.droppedItems.length).toBeGreaterThan(0);
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const budget = new AnchorBudget();
      budget.updateConfig({ maxTotalTokens: 1000 });

      expect(budget.getConfig().maxTotalTokens).toBe(1000);
    });
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe("getAnchorBudget", () => {
  beforeEach(() => {
    resetAnchorBudget();
  });

  it("should return same instance", () => {
    const budget1 = getAnchorBudget();
    const budget2 = getAnchorBudget();
    expect(budget1).toBe(budget2);
  });

  it("should create new instance after reset", () => {
    const budget1 = getAnchorBudget();
    resetAnchorBudget();
    const budget2 = getAnchorBudget();
    expect(budget1).not.toBe(budget2);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("formatWithinBudget", () => {
  it("should not truncate short content", () => {
    const content = "Short text";
    const result = formatWithinBudget(content, 100);
    expect(result).toBe(content);
  });

  it("should truncate long content", () => {
    const content = "a".repeat(500);
    const result = formatWithinBudget(content, 50);

    // 50 tokens = ~200 chars, minus "..." = ~197
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("...")).toBe(true);
  });

  it("should use custom truncate suffix", () => {
    const content = "a".repeat(500);
    const result = formatWithinBudget(content, 50, " [truncated]");

    expect(result.endsWith(" [truncated]")).toBe(true);
  });
});

describe("formatCheckpointCompact", () => {
  it("should format checkpoint compactly", () => {
    const checkpoint = {
      name: "Test Checkpoint",
      trigger: "manual",
      createdAt: new Date(),
    };

    const result = formatCheckpointCompact(checkpoint);

    expect(result).toContain("Checkpoint:");
    expect(result).toContain("Test Checkpoint");
    expect(result).toContain("manual");
  });

  it("should show time ago", () => {
    const checkpoint = {
      name: "Test",
      trigger: "auto",
      createdAt: new Date(Date.now() - 3600000), // 1 hour ago
    };

    const result = formatCheckpointCompact(checkpoint);
    expect(result).toContain("1h ago");
  });
});

describe("formatBlockerCompact", () => {
  it("should format blocker compactly", () => {
    const blocker = {
      title: "Test Blocker",
      description: "This is a test blocker description",
    };

    const result = formatBlockerCompact(blocker);

    expect(result).toBe("⚠️ Test Blocker");
    expect(result).not.toContain("description");
  });
});

// ============================================================================
// Budget Configuration Tests
// ============================================================================

describe("Budget Configurations", () => {
  it("DEFAULT should have correct values", () => {
    expect(DEFAULT_ANCHOR_BUDGET.maxTotalTokens).toBe(800);
    expect(DEFAULT_ANCHOR_BUDGET.maxSprintGoalTokens).toBe(400);
    expect(DEFAULT_ANCHOR_BUDGET.compactThreshold).toBe(0.7);
  });

  it("COMPACT should have reduced values", () => {
    expect(COMPACT_ANCHOR_BUDGET.maxTotalTokens).toBe(400);
    expect(COMPACT_ANCHOR_BUDGET.maxSprintGoalTokens).toBe(150);
  });

  it("MINIMAL should have minimal values", () => {
    expect(MINIMAL_ANCHOR_BUDGET.maxTotalTokens).toBe(200);
    expect(MINIMAL_ANCHOR_BUDGET.maxSprintGoalTokens).toBe(80);
  });
});
