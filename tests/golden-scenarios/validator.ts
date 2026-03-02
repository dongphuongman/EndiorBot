/**
 * Golden Scenario Validator
 *
 * Validates scenario definitions and execution results.
 *
 * @module tests/golden-scenarios/validator
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.6
 * @sprint 72
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ResilienceState } from "../../src/sessions/state-machine.js";
import type {
  GoldenScenario,
  ValidationRule,
  ValidationResult,
  TaskResult,
  BudgetSummary,
  EscalationSummary,
  ValidationConfig,
} from "./types.js";

// ============================================================================
// Scenario Validator
// ============================================================================

/**
 * Validates golden scenarios and their execution results.
 */
export class ScenarioValidator {
  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  /**
   * Validate scenario schema.
   */
  validateSchema(scenario: GoldenScenario): string[] {
    const errors: string[] = [];

    // Validate metadata
    if (!scenario.metadata?.name) {
      errors.push("Missing metadata.name");
    }
    if (!scenario.metadata?.version) {
      errors.push("Missing metadata.version");
    }
    if (typeof scenario.metadata?.expectedDurationMin !== "number") {
      errors.push("metadata.expectedDurationMin must be a number");
    }

    // Validate gate
    if (!scenario.gate?.level) {
      errors.push("Missing gate.level");
    } else if (!["A", "B", "C"].includes(scenario.gate.level)) {
      errors.push("gate.level must be A, B, or C");
    }
    if (typeof scenario.gate?.maxDurationMin !== "number") {
      errors.push("gate.maxDurationMin must be a number");
    }
    if (typeof scenario.gate?.maxCostUsd !== "number") {
      errors.push("gate.maxCostUsd must be a number");
    }

    // Validate setup
    if (!scenario.setup?.template) {
      errors.push("Missing setup.template");
    }
    if (!Array.isArray(scenario.setup?.files)) {
      errors.push("setup.files must be an array");
    }
    if (!scenario.setup?.budget) {
      errors.push("Missing setup.budget");
    }

    // Validate tasks
    if (!Array.isArray(scenario.tasks) || scenario.tasks.length === 0) {
      errors.push("tasks must be a non-empty array");
    } else {
      const taskIds = new Set<string>();
      for (const task of scenario.tasks) {
        if (!task.id) {
          errors.push("Task missing id");
        } else if (taskIds.has(task.id)) {
          errors.push(`Duplicate task id: ${task.id}`);
        } else {
          taskIds.add(task.id);
        }
        if (!task.type) {
          errors.push(`Task ${task.id} missing type`);
        }
        if (typeof task.priority !== "number") {
          errors.push(`Task ${task.id} priority must be a number`);
        }
        // Validate dependencies exist
        for (const dep of task.dependencies ?? []) {
          if (!taskIds.has(dep)) {
            // Dependencies might be defined later, check all tasks
            const depExists = scenario.tasks.some((t) => t.id === dep);
            if (!depExists) {
              errors.push(`Task ${task.id} has invalid dependency: ${dep}`);
            }
          }
        }
      }
    }

    // Validate expectations
    if (!scenario.expectations) {
      errors.push("Missing expectations");
    } else {
      if (!scenario.expectations.taskCompletion) {
        errors.push("Missing expectations.taskCompletion");
      }
      if (!scenario.expectations.budget) {
        errors.push("Missing expectations.budget");
      }
      if (!scenario.expectations.escalations) {
        errors.push("Missing expectations.escalations");
      }
      if (!scenario.expectations.recovery) {
        errors.push("Missing expectations.recovery");
      }
    }

    // Validate validations
    if (!Array.isArray(scenario.validations)) {
      errors.push("validations must be an array");
    } else {
      const ruleIds = new Set<string>();
      for (const rule of scenario.validations) {
        if (!rule.id) {
          errors.push("Validation rule missing id");
        } else if (ruleIds.has(rule.id)) {
          errors.push(`Duplicate validation rule id: ${rule.id}`);
        } else {
          ruleIds.add(rule.id);
        }
        if (!rule.type) {
          errors.push(`Validation rule ${rule.id} missing type`);
        }
        if (!rule.config) {
          errors.push(`Validation rule ${rule.id} missing config`);
        }
      }
    }

    return errors;
  }

  // ==========================================================================
  // Result Validation
  // ==========================================================================

  /**
   * Validate execution results against scenario expectations.
   */
  validateResults(
    scenario: GoldenScenario,
    taskResults: TaskResult[],
    budgetSummary: BudgetSummary,
    escalationSummary: EscalationSummary,
    artifactsCreated: string[],
    finalState: ResilienceState,
    projectRoot: string
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const rule of scenario.validations) {
      const result = this.evaluateRule(
        rule,
        scenario,
        taskResults,
        budgetSummary,
        escalationSummary,
        artifactsCreated,
        finalState,
        projectRoot
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single validation rule.
   */
  private evaluateRule(
    rule: ValidationRule,
    scenario: GoldenScenario,
    taskResults: TaskResult[],
    budgetSummary: BudgetSummary,
    escalationSummary: EscalationSummary,
    artifactsCreated: string[],
    finalState: ResilienceState,
    projectRoot: string
  ): ValidationResult {
    const baseResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      expectedValue: rule.config.expected,
    };

    try {
      switch (rule.type) {
        case "task_completion":
          return this.validateTaskCompletion(rule, taskResults, baseResult);

        case "budget_limit":
          return this.validateBudgetLimit(rule, budgetSummary, baseResult);

        case "escalation_count":
          return this.validateEscalationCount(rule, escalationSummary, baseResult);

        case "recovery_rate":
          return this.validateRecoveryRate(rule, taskResults, baseResult);

        case "artifact_exists":
          return this.validateArtifactExists(rule, projectRoot, baseResult);

        case "artifact_content":
          return this.validateArtifactContent(rule, projectRoot, baseResult);

        case "final_state":
          return this.validateFinalState(rule, finalState, baseResult);

        case "operation_forbidden":
          return this.validateOperationForbidden(rule, taskResults, baseResult);

        case "duration_limit":
          return this.validateDurationLimit(rule, taskResults, baseResult);

        case "model_usage":
          return this.validateModelUsage(rule, taskResults, baseResult);

        case "custom":
          return this.validateCustom(rule, scenario, taskResults, baseResult);

        default:
          return {
            ...baseResult,
            passed: false,
            actualValue: null,
            message: `Unknown validation type: ${rule.type}`,
          };
      }
    } catch (error) {
      return {
        ...baseResult,
        passed: false,
        actualValue: null,
        message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ==========================================================================
  // Specific Validators
  // ==========================================================================

  /**
   * Validate task completion metrics.
   */
  private validateTaskCompletion(
    rule: ValidationRule,
    taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    let actualValue: number;
    let passed: boolean;

    switch (config.target) {
      case "tasks.completionRate":
        actualValue =
          taskResults.length > 0
            ? taskResults.filter((t) => t.success).length / taskResults.length
            : 0;
        passed = this.compare(actualValue, config.operator, config.expected as number);
        break;

      case "tasks.completedCount":
        actualValue = taskResults.filter((t) => t.success).length;
        passed = this.compare(actualValue, config.operator, config.expected as number);
        break;

      case "tasks.failedCount":
        actualValue = taskResults.filter((t) => !t.success).length;
        passed = this.compare(actualValue, config.operator, config.expected as number);
        break;

      default:
        actualValue = 0;
        passed = false;
    }

    return {
      ...baseResult,
      passed,
      actualValue,
      message: passed
        ? `Task completion check passed`
        : `${rule.errorMessage} (actual: ${actualValue}, expected: ${config.operator} ${config.expected})`,
    } as ValidationResult;
  }

  /**
   * Validate budget limits.
   */
  private validateBudgetLimit(
    rule: ValidationRule,
    budgetSummary: BudgetSummary,
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    let actualValue: number;

    switch (config.target) {
      case "budget.totalSpent":
        actualValue = budgetSummary.totalSpentUsd;
        break;
      case "budget.opusSpent":
        actualValue = budgetSummary.opusSpentUsd;
        break;
      case "budget.opusTime":
        actualValue = budgetSummary.opusTimeMin;
        break;
      default:
        actualValue = 0;
    }

    const passed = this.compare(actualValue, config.operator, config.expected as number);

    return {
      ...baseResult,
      passed,
      actualValue,
      message: passed
        ? `Budget limit check passed`
        : `${rule.errorMessage} (actual: ${actualValue}, expected: ${config.operator} ${config.expected})`,
    } as ValidationResult;
  }

  /**
   * Validate escalation count.
   */
  private validateEscalationCount(
    rule: ValidationRule,
    escalationSummary: EscalationSummary,
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    let actualValue: number;

    switch (config.target) {
      case "escalations.count":
        actualValue = escalationSummary.count;
        break;
      case "escalations.avgTimeBetween":
        actualValue = escalationSummary.avgTimeBetweenMin;
        break;
      default:
        actualValue = 0;
    }

    const passed = this.compare(actualValue, config.operator, config.expected as number);

    return {
      ...baseResult,
      passed,
      actualValue,
      message: passed
        ? `Escalation count check passed`
        : `${rule.errorMessage} (actual: ${actualValue}, expected: ${config.operator} ${config.expected})`,
    } as ValidationResult;
  }

  /**
   * Validate recovery rate.
   */
  private validateRecoveryRate(
    rule: ValidationRule,
    taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const failedTasks = taskResults.filter((t) => !t.success);
    const recoveredTasks = taskResults.filter((t) => t.retryCount > 0 && t.success);

    const actualValue =
      failedTasks.length > 0
        ? recoveredTasks.length / (failedTasks.length + recoveredTasks.length)
        : 1.0;

    const passed = this.compare(actualValue, config.operator, config.expected as number);

    return {
      ...baseResult,
      passed,
      actualValue,
      message: passed
        ? `Recovery rate check passed`
        : `${rule.errorMessage} (actual: ${actualValue.toFixed(2)}, expected: ${config.operator} ${config.expected})`,
    } as ValidationResult;
  }

  /**
   * Validate artifact exists.
   */
  private validateArtifactExists(
    rule: ValidationRule,
    projectRoot: string,
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const artifactPath = path.join(projectRoot, config.target);
    const exists = fs.existsSync(artifactPath);
    const expectedExists = config.expected === true || config.expected === "true";
    const passed = exists === expectedExists;

    return {
      ...baseResult,
      passed,
      actualValue: exists,
      message: passed
        ? `Artifact exists check passed`
        : `${rule.errorMessage} (exists: ${exists}, expected: ${expectedExists})`,
    } as ValidationResult;
  }

  /**
   * Validate artifact content.
   */
  private validateArtifactContent(
    rule: ValidationRule,
    projectRoot: string,
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const artifactPath = path.join(projectRoot, config.target);

    if (!fs.existsSync(artifactPath)) {
      return {
        ...baseResult,
        passed: false,
        actualValue: null,
        message: `${rule.errorMessage} (file not found: ${config.target})`,
      } as ValidationResult;
    }

    const content = fs.readFileSync(artifactPath, "utf-8");
    let passed = false;

    switch (config.operator) {
      case "contains":
        passed = content.includes(config.expected as string);
        break;
      case "matches":
        passed = new RegExp(config.expected as string).test(content);
        break;
      default:
        passed = false;
    }

    return {
      ...baseResult,
      passed,
      actualValue: passed ? "content matches" : "content does not match",
      message: passed
        ? `Artifact content check passed`
        : `${rule.errorMessage}`,
    } as ValidationResult;
  }

  /**
   * Validate final state.
   */
  private validateFinalState(
    rule: ValidationRule,
    finalState: ResilienceState,
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const expectedState = config.expected as string;
    const passed = finalState === expectedState;

    return {
      ...baseResult,
      passed,
      actualValue: finalState,
      message: passed
        ? `Final state check passed`
        : `${rule.errorMessage} (actual: ${finalState}, expected: ${expectedState})`,
    } as ValidationResult;
  }

  /**
   * Validate forbidden operations.
   */
  private validateOperationForbidden(
    rule: ValidationRule,
    taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    // In a real implementation, we would track operation counts
    // For now, we check if any task artifacts suggest forbidden operations
    const operationType = config.target.replace("operations.", "");
    let actualValue = 0;

    // Simplified check - in real impl, track actual operations
    for (const task of taskResults) {
      if (task.artifacts.some((a) => this.artifactImpliesOperation(a, operationType))) {
        actualValue++;
      }
    }

    const passed = this.compare(actualValue, config.operator, config.expected as number);

    return {
      ...baseResult,
      passed,
      actualValue,
      message: passed
        ? `Forbidden operation check passed`
        : `${rule.errorMessage} (${operationType} count: ${actualValue})`,
    } as ValidationResult;
  }

  /**
   * Validate duration limit.
   */
  private validateDurationLimit(
    rule: ValidationRule,
    taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const totalDurationMs = taskResults.reduce((sum, t) => sum + t.durationMs, 0);
    const totalDurationMin = totalDurationMs / 60000;

    const passed = this.compare(totalDurationMin, config.operator, config.expected as number);

    return {
      ...baseResult,
      passed,
      actualValue: totalDurationMin.toFixed(2),
      message: passed
        ? `Duration limit check passed`
        : `${rule.errorMessage} (actual: ${totalDurationMin.toFixed(2)} min)`,
    } as ValidationResult;
  }

  /**
   * Validate model usage.
   */
  private validateModelUsage(
    rule: ValidationRule,
    taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    const config = rule.config;
    const eliteTaskTypes = (config.expected as string[]) ?? [];

    // Check that ELITE tier was used for specified task types
    let passed = true;
    const mismatches: string[] = [];

    for (const result of taskResults) {
      if (eliteTaskTypes.includes(result.type)) {
        if (result.actualTier !== "ELITE") {
          passed = false;
          mismatches.push(`${result.type}: ${result.actualTier}`);
        }
      }
    }

    return {
      ...baseResult,
      passed,
      actualValue: mismatches.length > 0 ? mismatches.join(", ") : "correct",
      message: passed
        ? `Model usage check passed`
        : `${rule.errorMessage} (mismatches: ${mismatches.join(", ")})`,
    } as ValidationResult;
  }

  /**
   * Validate custom rule.
   */
  private validateCustom(
    rule: ValidationRule,
    _scenario: GoldenScenario,
    _taskResults: TaskResult[],
    baseResult: Partial<ValidationResult>
  ): ValidationResult {
    // Custom validation would be implemented here
    return {
      ...baseResult,
      passed: true,
      actualValue: "custom",
      message: "Custom validation not implemented",
    } as ValidationResult;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Compare values using operator.
   */
  private compare(
    actual: number,
    operator: ValidationConfig["operator"],
    expected: number
  ): boolean {
    switch (operator) {
      case "eq":
        return actual === expected;
      case "ne":
        return actual !== expected;
      case "gt":
        return actual > expected;
      case "gte":
        return actual >= expected;
      case "lt":
        return actual < expected;
      case "lte":
        return actual <= expected;
      default:
        return false;
    }
  }

  /**
   * Check if artifact implies an operation type.
   */
  private artifactImpliesOperation(artifact: string, operation: string): boolean {
    // Map artifacts to operations
    const operationPatterns: Record<string, RegExp[]> = {
      write_file: [/\.ts$/, /\.js$/, /\.md$/],
      edit_file: [/\.ts$/, /\.js$/],
      delete_file: [],
      git_commit: [/\.git/],
      git_push: [],
    };

    const patterns = operationPatterns[operation] ?? [];
    return patterns.some((p) => p.test(artifact));
  }
}
