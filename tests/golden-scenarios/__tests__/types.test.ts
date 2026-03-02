/**
 * Golden Scenario Types Tests
 *
 * Tests for type definitions and constants.
 *
 * @module tests/golden-scenarios/__tests__/types.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @sprint 72
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_RUNNER_CONFIG } from "../types.js";
import type {
  GoldenScenario,
  ScenarioMetadata,
  GateConfig,
  ScenarioSetup,
  ScenarioTask,
  ScenarioExpectations,
  ValidationRule,
  ScenarioResult,
  TaskResult,
  ValidationResult,
  BudgetSummary,
  EscalationSummary,
} from "../types.js";

describe("Golden Scenario Types", () => {
  // ==========================================================================
  // Default Configuration
  // ==========================================================================

  describe("DEFAULT_RUNNER_CONFIG", () => {
    it("should have scenariosDir", () => {
      expect(DEFAULT_RUNNER_CONFIG.scenariosDir).toBe("tests/golden-scenarios");
    });

    it("should have outputDir", () => {
      expect(DEFAULT_RUNNER_CONFIG.outputDir).toBe("tests/golden-scenarios/results");
    });

    it("should not run in parallel by default", () => {
      expect(DEFAULT_RUNNER_CONFIG.parallel).toBe(false);
    });

    it("should have maxParallel of 2", () => {
      expect(DEFAULT_RUNNER_CONFIG.maxParallel).toBe(2);
    });

    it("should have 30 minute timeout", () => {
      expect(DEFAULT_RUNNER_CONFIG.timeoutMs).toBe(30 * 60 * 1000);
    });

    it("should cleanup by default", () => {
      expect(DEFAULT_RUNNER_CONFIG.cleanup).toBe(true);
    });

    it("should not be in debug mode by default", () => {
      expect(DEFAULT_RUNNER_CONFIG.debug).toBe(false);
    });

    it("should not be in dry run mode by default", () => {
      expect(DEFAULT_RUNNER_CONFIG.dryRun).toBe(false);
    });
  });

  // ==========================================================================
  // Type Shape Tests (compile-time validation)
  // ==========================================================================

  describe("type shapes", () => {
    it("should accept valid ScenarioMetadata", () => {
      const metadata: ScenarioMetadata = {
        name: "test-scenario",
        description: "A test scenario",
        version: "1.0.0",
        author: "test",
        tags: ["test", "unit"],
        expectedDurationMin: 30,
        priority: 1,
      };
      expect(metadata.name).toBe("test-scenario");
    });

    it("should accept valid GateConfig", () => {
      const gateConfig: GateConfig = {
        level: "A",
        autonomyLevel: "SUPERVISED" as any,
        maxDurationMin: 30,
        maxCostUsd: 0.5,
        allowedOperations: ["read_file", "search_code"],
        forbiddenOperations: ["write_file", "git_commit"],
      };
      expect(gateConfig.level).toBe("A");
    });

    it("should accept valid TaskResult", () => {
      const taskResult: TaskResult = {
        taskId: "task-1",
        type: "architecture",
        success: true,
        actualTier: "ELITE",
        cost: 0.5,
        durationMs: 5000,
        retryCount: 0,
        artifacts: ["docs/adr/ADR-001.md"],
      };
      expect(taskResult.success).toBe(true);
    });

    it("should accept valid ValidationResult", () => {
      const result: ValidationResult = {
        ruleId: "rule-1",
        ruleName: "Budget check",
        passed: true,
        severity: "error",
        actualValue: 0.3,
        expectedValue: 0.5,
        message: "Budget within limit",
      };
      expect(result.passed).toBe(true);
    });

    it("should accept valid BudgetSummary", () => {
      const summary: BudgetSummary = {
        totalSpentUsd: 0.35,
        opusSpentUsd: 0.15,
        opusTimeMin: 5,
        remainingUsd: 0.65,
        withinBudget: true,
      };
      expect(summary.withinBudget).toBe(true);
    });

    it("should accept valid EscalationSummary", () => {
      const summary: EscalationSummary = {
        count: 2,
        types: ["clarification", "design_decision"],
        avgTimeBetweenMin: 15,
      };
      expect(summary.count).toBe(2);
    });
  });

  // ==========================================================================
  // Gate Level Validations
  // ==========================================================================

  describe("gate levels", () => {
    it("should support Gate A configuration", () => {
      const config: GateConfig = {
        level: "A",
        autonomyLevel: "SUPERVISED" as any,
        maxDurationMin: 30,
        maxCostUsd: 0.5,
        allowedOperations: ["read_file", "search_code", "analyze_code", "generate_plan"],
        forbiddenOperations: ["write_file", "edit_file", "delete_file", "git_commit"],
      };
      expect(config.maxCostUsd).toBe(0.5);
    });

    it("should support Gate B configuration", () => {
      const config: GateConfig = {
        level: "B",
        autonomyLevel: "ASSISTED" as any,
        maxDurationMin: 30,
        maxCostUsd: 2.0,
        allowedOperations: ["read_file", "write_file", "edit_file", "run_tests"],
        forbiddenOperations: ["delete_file", "git_commit", "git_push"],
      };
      expect(config.maxCostUsd).toBe(2.0);
    });

    it("should support Gate C configuration", () => {
      const config: GateConfig = {
        level: "C",
        autonomyLevel: "AUTONOMOUS" as any,
        maxDurationMin: 120,
        maxCostUsd: 10.0,
        allowedOperations: ["read_file", "write_file", "git_commit", "create_pr"],
        forbiddenOperations: ["git_push"],
      };
      expect(config.maxCostUsd).toBe(10.0);
    });
  });

  // ==========================================================================
  // Validation Rule Types
  // ==========================================================================

  describe("validation rule types", () => {
    it("should support task_completion rule", () => {
      const rule: ValidationRule = {
        id: "completion-check",
        name: "Task completion",
        type: "task_completion",
        severity: "error",
        config: {
          target: "tasks.completionRate",
          operator: "gte",
          expected: 0.8,
        },
        errorMessage: "Completion rate too low",
      };
      expect(rule.type).toBe("task_completion");
    });

    it("should support budget_limit rule", () => {
      const rule: ValidationRule = {
        id: "budget-check",
        name: "Budget limit",
        type: "budget_limit",
        severity: "error",
        config: {
          target: "budget.totalSpent",
          operator: "lte",
          expected: 2.0,
        },
        errorMessage: "Budget exceeded",
      };
      expect(rule.type).toBe("budget_limit");
    });

    it("should support artifact_exists rule", () => {
      const rule: ValidationRule = {
        id: "artifact-check",
        name: "Artifact exists",
        type: "artifact_exists",
        severity: "error",
        config: {
          target: "src/calculator.ts",
          operator: "eq",
          expected: true,
        },
        errorMessage: "Calculator not created",
      };
      expect(rule.type).toBe("artifact_exists");
    });

    it("should support operation_forbidden rule", () => {
      const rule: ValidationRule = {
        id: "no-writes",
        name: "No file writes",
        type: "operation_forbidden",
        severity: "error",
        config: {
          target: "operations.write_file",
          operator: "eq",
          expected: 0,
        },
        errorMessage: "File writes are forbidden in Gate A",
      };
      expect(rule.type).toBe("operation_forbidden");
    });
  });

  // ==========================================================================
  // Task Types
  // ==========================================================================

  describe("task types", () => {
    it("should support architecture task type", () => {
      const task: Partial<ScenarioTask> = {
        type: "architecture",
        expectedTier: "ELITE",
      };
      expect(task.type).toBe("architecture");
    });

    it("should support code_generation task type", () => {
      const task: Partial<ScenarioTask> = {
        type: "code_generation",
        expectedTier: "STANDARD",
      };
      expect(task.type).toBe("code_generation");
    });

    it("should support lint task type", () => {
      const task: Partial<ScenarioTask> = {
        type: "lint",
        expectedTier: "EFFICIENCY",
      };
      expect(task.type).toBe("lint");
    });
  });
});
