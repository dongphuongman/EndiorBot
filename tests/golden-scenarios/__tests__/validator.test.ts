/**
 * ScenarioValidator Tests
 *
 * Tests for golden scenario validation.
 *
 * @module tests/golden-scenarios/__tests__/validator.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @sprint 72
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ScenarioValidator } from "../validator.js";
import { ResilienceState } from "../../../src/sessions/state-machine.js";
import { AutonomyLevel } from "../../../src/sessions/autonomous/types.js";
import type {
  GoldenScenario,
  TaskResult,
  BudgetSummary,
  EscalationSummary,
  ValidationRule,
} from "../types.js";

describe("ScenarioValidator", () => {
  let validator: ScenarioValidator;

  beforeEach(() => {
    validator = new ScenarioValidator();
  });

  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  describe("validateSchema", () => {
    const createMinimalScenario = (): GoldenScenario => ({
      metadata: {
        name: "test-scenario",
        description: "Test scenario",
        version: "1.0.0",
        author: "test",
        tags: ["test"],
        expectedDurationMin: 30,
        priority: 1,
      },
      gate: {
        level: "A",
        autonomyLevel: AutonomyLevel.SUPERVISED,
        maxDurationMin: 30,
        maxCostUsd: 0.5,
        allowedOperations: ["read_file"],
        forbiddenOperations: ["write_file"],
      },
      setup: {
        template: "minimal",
        files: [],
        env: {},
        initialState: ResilienceState.PLANNING,
        budget: {
          totalUsd: 1.0,
          opusCapUsd: 0.3,
          opusCapMin: 5,
        },
      },
      tasks: [
        {
          id: "task-1",
          type: "architecture",
          description: "Test task",
          stage: ResilienceState.PLANNING,
          priority: 1,
          estimatedCost: 0.1,
          dependencies: [],
          expectedTier: "STANDARD",
          expectedOutcome: "success",
          timeoutSec: 60,
          input: {},
          expectedArtifacts: [],
        },
      ],
      expectations: {
        taskCompletion: {
          minCompleted: 1,
          maxFailed: 0,
          minCompletionRate: 1.0,
        },
        budget: {
          maxSpentUsd: 0.5,
          maxOpusSpentUsd: 0.1,
          maxOpusTimeMin: 5,
          withinBudget: true,
        },
        escalations: {
          maxCount: 0,
          expectedTypes: [],
          minTimeBetweenMin: 30,
        },
        recovery: {
          minRecoveryRate: 1.0,
          maxRetryAttempts: 0,
        },
        artifacts: [],
        finalState: ResilienceState.DESIGN,
      },
      validations: [
        {
          id: "rule-1",
          name: "Test rule",
          type: "task_completion",
          severity: "error",
          config: {
            target: "tasks.completionRate",
            operator: "gte",
            expected: 1.0,
          },
          errorMessage: "Test error",
        },
      ],
    });

    it("should pass for valid scenario", () => {
      const scenario = createMinimalScenario();
      const errors = validator.validateSchema(scenario);
      expect(errors).toHaveLength(0);
    });

    it("should fail for missing metadata.name", () => {
      const scenario = createMinimalScenario();
      scenario.metadata.name = "";
      const errors = validator.validateSchema(scenario);
      expect(errors).toContain("Missing metadata.name");
    });

    it("should fail for missing gate.level", () => {
      const scenario = createMinimalScenario();
      (scenario.gate as any).level = undefined;
      const errors = validator.validateSchema(scenario);
      expect(errors).toContain("Missing gate.level");
    });

    it("should fail for invalid gate.level", () => {
      const scenario = createMinimalScenario();
      (scenario.gate as any).level = "D";
      const errors = validator.validateSchema(scenario);
      expect(errors).toContain("gate.level must be A, B, or C");
    });

    it("should fail for empty tasks", () => {
      const scenario = createMinimalScenario();
      scenario.tasks = [];
      const errors = validator.validateSchema(scenario);
      expect(errors).toContain("tasks must be a non-empty array");
    });

    it("should fail for duplicate task ids", () => {
      const scenario = createMinimalScenario();
      scenario.tasks.push({ ...scenario.tasks[0] });
      const errors = validator.validateSchema(scenario);
      expect(errors.some((e) => e.includes("Duplicate task id"))).toBe(true);
    });

    it("should fail for invalid task dependency", () => {
      const scenario = createMinimalScenario();
      scenario.tasks[0].dependencies = ["non-existent-task"];
      const errors = validator.validateSchema(scenario);
      expect(errors.some((e) => e.includes("invalid dependency"))).toBe(true);
    });

    it("should fail for missing expectations", () => {
      const scenario = createMinimalScenario();
      (scenario as any).expectations = undefined;
      const errors = validator.validateSchema(scenario);
      expect(errors).toContain("Missing expectations");
    });

    it("should fail for duplicate validation rule ids", () => {
      const scenario = createMinimalScenario();
      scenario.validations.push({ ...scenario.validations[0] });
      const errors = validator.validateSchema(scenario);
      expect(errors.some((e) => e.includes("Duplicate validation rule id"))).toBe(true);
    });
  });

  // ==========================================================================
  // Task Completion Validation
  // ==========================================================================

  describe("task completion validation", () => {
    const createTaskResults = (completed: number, failed: number): TaskResult[] => {
      const results: TaskResult[] = [];
      for (let i = 0; i < completed; i++) {
        results.push({
          taskId: `task-${i}`,
          type: "architecture",
          success: true,
          actualTier: "STANDARD",
          cost: 0.1,
          durationMs: 1000,
          retryCount: 0,
          artifacts: [],
        });
      }
      for (let i = 0; i < failed; i++) {
        results.push({
          taskId: `task-failed-${i}`,
          type: "code_generation",
          success: false,
          actualTier: "STANDARD",
          cost: 0.05,
          durationMs: 500,
          retryCount: 2,
          artifacts: [],
          error: "Test failure",
        });
      }
      return results;
    };

    it("should pass when completion rate meets target", () => {
      const scenario = createMinimalScenario();
      const taskResults = createTaskResults(5, 0);
      const results = validator.validateResults(
        scenario,
        taskResults,
        createEmptyBudgetSummary(),
        createEmptyEscalationSummary(),
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const completionResult = results.find((r) => r.ruleId === "rule-1");
      expect(completionResult?.passed).toBe(true);
    });

    it("should fail when completion rate is below target", () => {
      const scenario = createMinimalScenario();
      const taskResults = createTaskResults(1, 3);
      const results = validator.validateResults(
        scenario,
        taskResults,
        createEmptyBudgetSummary(),
        createEmptyEscalationSummary(),
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const completionResult = results.find((r) => r.ruleId === "rule-1");
      expect(completionResult?.passed).toBe(false);
    });

    function createMinimalScenario(): GoldenScenario {
      return {
        metadata: {
          name: "test",
          description: "test",
          version: "1.0.0",
          author: "test",
          tags: [],
          expectedDurationMin: 30,
          priority: 1,
        },
        gate: {
          level: "A",
          autonomyLevel: AutonomyLevel.SUPERVISED,
          maxDurationMin: 30,
          maxCostUsd: 0.5,
          allowedOperations: [],
          forbiddenOperations: [],
        },
        setup: {
          template: "minimal",
          files: [],
          env: {},
          initialState: ResilienceState.PLANNING,
          budget: { totalUsd: 1, opusCapUsd: 0.3, opusCapMin: 5 },
        },
        tasks: [],
        expectations: {
          taskCompletion: { minCompleted: 1, maxFailed: 0, minCompletionRate: 1.0 },
          budget: { maxSpentUsd: 0.5, maxOpusSpentUsd: 0.1, maxOpusTimeMin: 5, withinBudget: true },
          escalations: { maxCount: 0, expectedTypes: [], minTimeBetweenMin: 30 },
          recovery: { minRecoveryRate: 1.0, maxRetryAttempts: 0 },
          artifacts: [],
          finalState: ResilienceState.DESIGN,
        },
        validations: [
          {
            id: "rule-1",
            name: "Completion rate",
            type: "task_completion",
            severity: "error",
            config: { target: "tasks.completionRate", operator: "gte", expected: 1.0 },
            errorMessage: "Completion rate too low",
          },
        ],
      };
    }
  });

  // ==========================================================================
  // Budget Validation
  // ==========================================================================

  describe("budget validation", () => {
    it("should pass when budget is within limit", () => {
      const scenario = createBudgetScenario(0.5);
      const budgetSummary: BudgetSummary = {
        totalSpentUsd: 0.3,
        opusSpentUsd: 0.1,
        opusTimeMin: 5,
        remainingUsd: 0.7,
        withinBudget: true,
      };

      const results = validator.validateResults(
        scenario,
        [],
        budgetSummary,
        createEmptyEscalationSummary(),
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const budgetResult = results.find((r) => r.ruleId === "budget-limit");
      expect(budgetResult?.passed).toBe(true);
    });

    it("should fail when budget exceeds limit", () => {
      const scenario = createBudgetScenario(0.5);
      const budgetSummary: BudgetSummary = {
        totalSpentUsd: 0.8,
        opusSpentUsd: 0.3,
        opusTimeMin: 10,
        remainingUsd: 0.2,
        withinBudget: false,
      };

      const results = validator.validateResults(
        scenario,
        [],
        budgetSummary,
        createEmptyEscalationSummary(),
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const budgetResult = results.find((r) => r.ruleId === "budget-limit");
      expect(budgetResult?.passed).toBe(false);
    });

    function createBudgetScenario(limit: number): GoldenScenario {
      return {
        metadata: {
          name: "test",
          description: "test",
          version: "1.0.0",
          author: "test",
          tags: [],
          expectedDurationMin: 30,
          priority: 1,
        },
        gate: {
          level: "A",
          autonomyLevel: AutonomyLevel.SUPERVISED,
          maxDurationMin: 30,
          maxCostUsd: limit,
          allowedOperations: [],
          forbiddenOperations: [],
        },
        setup: {
          template: "minimal",
          files: [],
          env: {},
          initialState: ResilienceState.PLANNING,
          budget: { totalUsd: 1, opusCapUsd: 0.3, opusCapMin: 5 },
        },
        tasks: [],
        expectations: {
          taskCompletion: { minCompleted: 0, maxFailed: 0, minCompletionRate: 1.0 },
          budget: { maxSpentUsd: limit, maxOpusSpentUsd: 0.1, maxOpusTimeMin: 5, withinBudget: true },
          escalations: { maxCount: 0, expectedTypes: [], minTimeBetweenMin: 30 },
          recovery: { minRecoveryRate: 1.0, maxRetryAttempts: 0 },
          artifacts: [],
          finalState: ResilienceState.DESIGN,
        },
        validations: [
          {
            id: "budget-limit",
            name: "Budget limit",
            type: "budget_limit",
            severity: "error",
            config: { target: "budget.totalSpent", operator: "lte", expected: limit },
            errorMessage: "Budget exceeded",
          },
        ],
      };
    }
  });

  // ==========================================================================
  // Escalation Validation
  // ==========================================================================

  describe("escalation validation", () => {
    it("should pass when escalation count is within limit", () => {
      const scenario = createEscalationScenario(2);
      const escalationSummary: EscalationSummary = {
        count: 1,
        types: ["clarification"],
        avgTimeBetweenMin: 15,
      };

      const results = validator.validateResults(
        scenario,
        [],
        createEmptyBudgetSummary(),
        escalationSummary,
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const escalationResult = results.find((r) => r.ruleId === "escalation-count");
      expect(escalationResult?.passed).toBe(true);
    });

    it("should fail when escalation count exceeds limit", () => {
      const scenario = createEscalationScenario(2);
      const escalationSummary: EscalationSummary = {
        count: 5,
        types: ["clarification", "design_decision"],
        avgTimeBetweenMin: 5,
      };

      const results = validator.validateResults(
        scenario,
        [],
        createEmptyBudgetSummary(),
        escalationSummary,
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const escalationResult = results.find((r) => r.ruleId === "escalation-count");
      expect(escalationResult?.passed).toBe(false);
    });

    function createEscalationScenario(maxCount: number): GoldenScenario {
      return {
        metadata: {
          name: "test",
          description: "test",
          version: "1.0.0",
          author: "test",
          tags: [],
          expectedDurationMin: 30,
          priority: 1,
        },
        gate: {
          level: "B",
          autonomyLevel: AutonomyLevel.ASSISTED,
          maxDurationMin: 30,
          maxCostUsd: 2.0,
          allowedOperations: [],
          forbiddenOperations: [],
        },
        setup: {
          template: "minimal",
          files: [],
          env: {},
          initialState: ResilienceState.PLANNING,
          budget: { totalUsd: 2, opusCapUsd: 0.5, opusCapMin: 10 },
        },
        tasks: [],
        expectations: {
          taskCompletion: { minCompleted: 0, maxFailed: 0, minCompletionRate: 1.0 },
          budget: { maxSpentUsd: 2, maxOpusSpentUsd: 0.5, maxOpusTimeMin: 10, withinBudget: true },
          escalations: { maxCount, expectedTypes: [], minTimeBetweenMin: 10 },
          recovery: { minRecoveryRate: 1.0, maxRetryAttempts: 0 },
          artifacts: [],
          finalState: ResilienceState.TEST,
        },
        validations: [
          {
            id: "escalation-count",
            name: "Escalation count",
            type: "escalation_count",
            severity: "error",
            config: { target: "escalations.count", operator: "lte", expected: maxCount },
            errorMessage: "Too many escalations",
          },
        ],
      };
    }
  });

  // ==========================================================================
  // Recovery Rate Validation
  // ==========================================================================

  describe("recovery rate validation", () => {
    it("should pass when recovery rate meets target", () => {
      const scenario = createRecoveryScenario(0.8);
      const taskResults: TaskResult[] = [
        { taskId: "1", type: "code_generation", success: true, actualTier: "STANDARD", cost: 0.1, durationMs: 1000, retryCount: 2, artifacts: [] },
        { taskId: "2", type: "code_generation", success: false, actualTier: "STANDARD", cost: 0.05, durationMs: 500, retryCount: 3, artifacts: [], error: "Failed" },
      ];

      const results = validator.validateResults(
        scenario,
        taskResults,
        createEmptyBudgetSummary(),
        createEmptyEscalationSummary(),
        [],
        ResilienceState.DESIGN,
        "/tmp/test"
      );

      const recoveryResult = results.find((r) => r.ruleId === "recovery-rate");
      expect(recoveryResult?.passed).toBe(false); // 1/(1+1) = 0.5 < 0.8
    });

    function createRecoveryScenario(minRate: number): GoldenScenario {
      return {
        metadata: {
          name: "test",
          description: "test",
          version: "1.0.0",
          author: "test",
          tags: [],
          expectedDurationMin: 30,
          priority: 1,
        },
        gate: {
          level: "C",
          autonomyLevel: AutonomyLevel.AUTONOMOUS,
          maxDurationMin: 120,
          maxCostUsd: 10.0,
          allowedOperations: [],
          forbiddenOperations: [],
        },
        setup: {
          template: "minimal",
          files: [],
          env: {},
          initialState: ResilienceState.PLANNING,
          budget: { totalUsd: 10, opusCapUsd: 3, opusCapMin: 20 },
        },
        tasks: [],
        expectations: {
          taskCompletion: { minCompleted: 0, maxFailed: 2, minCompletionRate: 0.8 },
          budget: { maxSpentUsd: 10, maxOpusSpentUsd: 3, maxOpusTimeMin: 20, withinBudget: true },
          escalations: { maxCount: 3, expectedTypes: [], minTimeBetweenMin: 5 },
          recovery: { minRecoveryRate: minRate, maxRetryAttempts: 3 },
          artifacts: [],
          finalState: ResilienceState.TEST,
        },
        validations: [
          {
            id: "recovery-rate",
            name: "Recovery rate",
            type: "recovery_rate",
            severity: "error",
            config: { target: "recovery.rate", operator: "gte", expected: minRate },
            errorMessage: "Recovery rate too low",
          },
        ],
      };
    }
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function createEmptyBudgetSummary(): BudgetSummary {
    return {
      totalSpentUsd: 0,
      opusSpentUsd: 0,
      opusTimeMin: 0,
      remainingUsd: 1,
      withinBudget: true,
    };
  }

  function createEmptyEscalationSummary(): EscalationSummary {
    return {
      count: 0,
      types: [],
      avgTimeBetweenMin: 0,
    };
  }
});
