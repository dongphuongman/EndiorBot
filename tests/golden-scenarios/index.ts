/**
 * Golden Scenarios Module
 *
 * End-to-end testing for autonomous session gates.
 *
 * @module tests/golden-scenarios
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.6
 * @sprint 72
 */

// Types
export type {
  GoldenScenario,
  ScenarioMetadata,
  GateConfig,
  AllowedOperation,
  ForbiddenOperation,
  ScenarioSetup,
  ProjectTemplate,
  SetupFile,
  BudgetSetup,
  ScenarioTask,
  ScenarioTaskType,
  TaskOutcome,
  ScenarioExpectations,
  TaskCompletionExpectation,
  BudgetExpectation,
  EscalationExpectation,
  RecoveryExpectation,
  ArtifactExpectation,
  ValidationRule,
  ValidationRuleType,
  ValidationSeverity,
  ValidationConfig,
  ScenarioResult,
  TaskResult,
  ValidationResult,
  BudgetSummary,
  EscalationSummary,
  ScenarioError,
  ScenarioRunnerConfig,
} from "./types.js";

// Constants
export { DEFAULT_RUNNER_CONFIG } from "./types.js";

// Runner
export {
  ScenarioRunner,
  createScenarioRunner,
  getScenarioRunner,
  resetScenarioRunner,
} from "./runner.js";

// Validator
export { ScenarioValidator } from "./validator.js";
