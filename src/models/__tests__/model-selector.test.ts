/**
 * ModelSelector Tests
 *
 * Tests for model selection and tier escalation/downgrade logic.
 *
 * @module models/__tests__/model-selector.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @sprint 72
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ModelSelector,
  createModelSelector,
  getModelSelector,
  resetModelSelector,
} from "../model-selector.js";
import { createSessionBudget } from "../session-budget.js";
import { ModelTier } from "../types.js";

describe("ModelSelector", () => {
  beforeEach(() => {
    resetModelSelector();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor and Config
  // ==========================================================================

  describe("constructor", () => {
    it("should create with default config", () => {
      const selector = new ModelSelector();
      expect(selector).toBeDefined();
    });

    it("should accept custom config", () => {
      const selector = new ModelSelector({
        autoEscalate: false,
        failureEscalationThreshold: 5,
        debug: true,
      });
      expect(selector).toBeDefined();
    });

    it("should accept budget in config", () => {
      const budget = createSessionBudget();
      const selector = new ModelSelector({ budget });
      expect(selector.getBudget()).toBe(budget);
    });
  });

  // ==========================================================================
  // Task Type Selection
  // ==========================================================================

  describe("selectModel by task type", () => {
    it("should select ELITE for architecture tasks", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("architecture");

      expect(result.config.tier).toBe(ModelTier.ELITE);
      expect(result.reason).toBe("task_type_match");
      expect(result.downgraded).toBe(false);
    });

    it("should select ELITE for design_decision", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("design_decision");

      expect(result.config.tier).toBe(ModelTier.ELITE);
    });

    it("should select ELITE for adr_draft", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("adr_draft");

      expect(result.config.tier).toBe(ModelTier.ELITE);
    });

    it("should select STANDARD for code_generation", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("code_generation");

      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.reason).toBe("task_type_match");
    });

    it("should select STANDARD for bug_fix", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("bug_fix");

      expect(result.config.tier).toBe(ModelTier.STANDARD);
    });

    it("should select STANDARD for code_review", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("code_review");

      expect(result.config.tier).toBe(ModelTier.STANDARD);
    });

    it("should select EFFICIENCY for lint tasks", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("lint");

      expect(result.config.tier).toBe(ModelTier.EFFICIENCY);
      expect(result.reason).toBe("task_type_match");
    });

    it("should select EFFICIENCY for format tasks", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("format");

      expect(result.config.tier).toBe(ModelTier.EFFICIENCY);
    });

    it("should select EFFICIENCY for simple_edit", () => {
      const selector = new ModelSelector();
      const result = selector.selectModel("simple_edit");

      expect(result.config.tier).toBe(ModelTier.EFFICIENCY);
    });
  });

  // ==========================================================================
  // Escalation on Failures
  // ==========================================================================

  describe("escalation on failures", () => {
    it("should escalate EFFICIENCY to STANDARD after threshold failures", () => {
      const selector = new ModelSelector({
        autoEscalate: true,
        failureEscalationThreshold: 3,
      });

      const result = selector.selectModel("lint", 3);

      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.reason).toBe("escalation_due_to_failures");
    });

    it("should escalate STANDARD to ELITE after threshold failures", () => {
      const selector = new ModelSelector({
        autoEscalate: true,
        failureEscalationThreshold: 3,
      });

      const result = selector.selectModel("code_generation", 4);

      expect(result.config.tier).toBe(ModelTier.ELITE);
      expect(result.reason).toBe("escalation_due_to_failures");
    });

    it("should not escalate if failures below threshold", () => {
      const selector = new ModelSelector({
        autoEscalate: true,
        failureEscalationThreshold: 3,
      });

      const result = selector.selectModel("code_generation", 2);

      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.reason).toBe("task_type_match");
    });

    it("should not escalate ELITE (already highest)", () => {
      const selector = new ModelSelector({
        autoEscalate: true,
        failureEscalationThreshold: 3,
      });

      const result = selector.selectModel("architecture", 5);

      expect(result.config.tier).toBe(ModelTier.ELITE);
      // Still task_type_match because it didn't change tier
      expect(result.reason).toBe("task_type_match");
    });

    it("should not escalate if autoEscalate is disabled", () => {
      const selector = new ModelSelector({
        autoEscalate: false,
        failureEscalationThreshold: 3,
      });

      const result = selector.selectModel("lint", 10);

      expect(result.config.tier).toBe(ModelTier.EFFICIENCY);
      expect(result.reason).toBe("task_type_match");
    });
  });

  // ==========================================================================
  // Budget-based Downgrade
  // ==========================================================================

  describe("budget-based downgrade", () => {
    it("should downgrade ELITE to STANDARD when Opus cap reached", () => {
      const budget = createSessionBudget({ opusCapUsd: 0 }); // No Opus budget
      const selector = new ModelSelector({ budget });

      const result = selector.selectModel("architecture");

      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.reason).toBe("downgrade_due_to_budget");
      expect(result.downgraded).toBe(true);
      expect(result.originalTier).toBe(ModelTier.ELITE);
      expect(result.warning).toContain("downgraded");
    });

    it("should downgrade STANDARD to EFFICIENCY when budget low", () => {
      const budget = createSessionBudget({ totalUsd: 0.001 }); // Almost no budget
      const selector = new ModelSelector({ budget });

      const result = selector.selectModel("code_generation");

      expect(result.config.tier).toBe(ModelTier.EFFICIENCY);
      expect(result.reason).toBe("downgrade_due_to_budget");
      expect(result.downgraded).toBe(true);
    });

    it("should not downgrade when budget sufficient", () => {
      const budget = createSessionBudget({ totalUsd: 10, opusCapUsd: 3 });
      const selector = new ModelSelector({ budget });

      const result = selector.selectModel("architecture");

      expect(result.config.tier).toBe(ModelTier.ELITE);
      expect(result.downgraded).toBe(false);
    });
  });

  // ==========================================================================
  // Select by Tier
  // ==========================================================================

  describe("selectByTier", () => {
    it("should select specified tier", () => {
      const selector = new ModelSelector();

      const elite = selector.selectByTier(ModelTier.ELITE);
      expect(elite.config.tier).toBe(ModelTier.ELITE);

      const standard = selector.selectByTier(ModelTier.STANDARD);
      expect(standard.config.tier).toBe(ModelTier.STANDARD);

      const efficiency = selector.selectByTier(ModelTier.EFFICIENCY);
      expect(efficiency.config.tier).toBe(ModelTier.EFFICIENCY);
    });

    it("should downgrade if budget insufficient", () => {
      const budget = createSessionBudget({ opusCapUsd: 0 });
      const selector = new ModelSelector({ budget });

      const result = selector.selectByTier(ModelTier.ELITE);

      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.downgraded).toBe(true);
      expect(result.originalTier).toBe(ModelTier.ELITE);
    });
  });

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  describe("helper methods", () => {
    it("should return recommended tier for task type", () => {
      const selector = new ModelSelector();

      expect(selector.getRecommendedTier("architecture")).toBe(ModelTier.ELITE);
      expect(selector.getRecommendedTier("code_generation")).toBe(ModelTier.STANDARD);
      expect(selector.getRecommendedTier("lint")).toBe(ModelTier.EFFICIENCY);
    });

    it("should identify ELITE tasks correctly", () => {
      const selector = new ModelSelector();

      expect(selector.isEliteTask("architecture")).toBe(true);
      expect(selector.isEliteTask("design_decision")).toBe(true);
      expect(selector.isEliteTask("code_generation")).toBe(false);
      expect(selector.isEliteTask("lint")).toBe(false);
    });

    it("should return task types for tier", () => {
      const selector = new ModelSelector();

      const eliteTasks = selector.getTaskTypesForTier(ModelTier.ELITE);
      expect(eliteTasks).toContain("architecture");
      expect(eliteTasks).toContain("design_decision");

      const standardTasks = selector.getTaskTypesForTier(ModelTier.STANDARD);
      expect(standardTasks).toContain("code_generation");
      expect(standardTasks).toContain("bug_fix");

      const efficiencyTasks = selector.getTaskTypesForTier(ModelTier.EFFICIENCY);
      expect(efficiencyTasks).toContain("lint");
      expect(efficiencyTasks).toContain("format");
    });
  });

  // ==========================================================================
  // Budget Integration
  // ==========================================================================

  describe("budget integration", () => {
    it("should allow setting budget", () => {
      const selector = new ModelSelector();
      expect(selector.getBudget()).toBeNull();

      const budget = createSessionBudget();
      selector.setBudget(budget);

      expect(selector.getBudget()).toBe(budget);
    });

    it("should check if ELITE is available", () => {
      const selector = new ModelSelector();
      // No budget = always available
      expect(selector.isEliteAvailable()).toBe(true);

      const budget = createSessionBudget({ opusCapUsd: 0 });
      selector.setBudget(budget);
      expect(selector.isEliteAvailable()).toBe(false);
    });

    it("should return true for isEliteAvailable with sufficient budget", () => {
      const budget = createSessionBudget({ opusCapUsd: 3 });
      const selector = new ModelSelector({ budget });

      expect(selector.isEliteAvailable()).toBe(true);
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe("factory functions", () => {
    it("should create selector with createModelSelector", () => {
      const selector = createModelSelector({ debug: true });
      expect(selector).toBeInstanceOf(ModelSelector);
    });

    it("should get global selector with getModelSelector", () => {
      const selector1 = getModelSelector();
      const selector2 = getModelSelector();

      expect(selector1).toBe(selector2);
    });

    it("should reset global selector", () => {
      const selector1 = getModelSelector();
      resetModelSelector();
      const selector2 = getModelSelector();

      expect(selector1).not.toBe(selector2);
    });
  });
});
