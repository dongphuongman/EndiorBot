/**
 * Golden Scenario Types
 *
 * Type definitions for golden scenario testing.
 *
 * @module tests/golden-scenarios/types
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.6
 * @sprint 72
 */

import { AutonomyLevel, type AutonomyGate } from "../../src/sessions/autonomous/types.js";
import { ResilienceState } from "../../src/sessions/state-machine.js";

// ============================================================================
// Scenario Definition
// ============================================================================

/**
 * Golden scenario definition.
 */
export interface GoldenScenario {
  /** Scenario metadata */
  metadata: ScenarioMetadata;

  /** Gate configuration */
  gate: GateConfig;

  /** Initial project state */
  setup: ScenarioSetup;

  /** Tasks to execute */
  tasks: ScenarioTask[];

  /** Expected outcomes */
  expectations: ScenarioExpectations;

  /** Validation rules */
  validations: ValidationRule[];
}

/**
 * Scenario metadata.
 */
export interface ScenarioMetadata {
  /** Scenario name */
  name: string;

  /** Description */
  description: string;

  /** Version */
  version: string;

  /** Author */
  author: string;

  /** Tags for categorization */
  tags: string[];

  /** Expected duration in minutes */
  expectedDurationMin: number;

  /** Scenario priority (1=highest) */
  priority: number;
}

/**
 * Gate configuration for the scenario.
 */
export interface GateConfig {
  /** Gate level */
  level: AutonomyGate;

  /** Autonomy level */
  autonomyLevel: AutonomyLevel;

  /** Maximum duration in minutes */
  maxDurationMin: number;

  /** Maximum cost in USD */
  maxCostUsd: number;

  /** Allowed operations */
  allowedOperations: AllowedOperation[];

  /** Forbidden operations */
  forbiddenOperations: ForbiddenOperation[];
}

/**
 * Allowed operation types.
 */
export type AllowedOperation =
  | "read_file"
  | "search_code"
  | "analyze_code"
  | "generate_plan"
  | "create_adr"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "run_tests"
  | "run_build"
  | "git_commit"
  | "git_push"
  | "create_pr";

/**
 * Forbidden operation types.
 */
export type ForbiddenOperation = AllowedOperation;

// ============================================================================
// Scenario Setup
// ============================================================================

/**
 * Initial project state for scenario.
 */
export interface ScenarioSetup {
  /** Project template to use */
  template: ProjectTemplate;

  /** Initial files to create */
  files: SetupFile[];

  /** Environment variables */
  env: Record<string, string>;

  /** Initial SDLC state */
  initialState: ResilienceState;

  /** Budget configuration */
  budget: BudgetSetup;
}

/**
 * Project template options.
 */
export type ProjectTemplate =
  | "minimal"
  | "typescript-basic"
  | "typescript-full"
  | "monorepo"
  | "custom";

/**
 * File to create during setup.
 */
export interface SetupFile {
  /** File path (relative to project root) */
  path: string;

  /** File content */
  content: string;

  /** Whether file should exist before scenario */
  mustExist?: boolean;
}

/**
 * Budget setup for scenario.
 */
export interface BudgetSetup {
  /** Total budget in USD */
  totalUsd: number;

  /** Opus cap in USD */
  opusCapUsd: number;

  /** Opus cap in minutes */
  opusCapMin: number;
}

// ============================================================================
// Scenario Tasks
// ============================================================================

/**
 * Task to execute in scenario.
 */
export interface ScenarioTask {
  /** Task ID */
  id: string;

  /** Task type */
  type: ScenarioTaskType;

  /** Task description */
  description: string;

  /** SDLC stage */
  stage: ResilienceState;

  /** Priority (1=highest) */
  priority: number;

  /** Estimated cost in USD */
  estimatedCost: number;

  /** Dependencies (task IDs) */
  dependencies: string[];

  /** Expected model tier */
  expectedTier: "ELITE" | "STANDARD" | "EFFICIENCY";

  /** Expected outcome */
  expectedOutcome: TaskOutcome;

  /** Timeout in seconds */
  timeoutSec: number;

  /** Input data */
  input: Record<string, unknown>;

  /** Expected artifacts */
  expectedArtifacts: string[];
}

/**
 * Task type in scenario.
 */
export type ScenarioTaskType =
  | "architecture"
  | "design_decision"
  | "adr_draft"
  | "code_generation"
  | "refactor"
  | "bug_fix"
  | "test_write"
  | "code_review"
  | "documentation"
  | "lint"
  | "format"
  | "verify";

/**
 * Expected task outcome.
 */
export type TaskOutcome =
  | "success"
  | "failure_transient"
  | "failure_fixable"
  | "failure_design"
  | "escalation"
  | "skip";

// ============================================================================
// Expectations
// ============================================================================

/**
 * Expected outcomes for scenario.
 */
export interface ScenarioExpectations {
  /** Task completion expectations */
  taskCompletion: TaskCompletionExpectation;

  /** Budget expectations */
  budget: BudgetExpectation;

  /** Escalation expectations */
  escalations: EscalationExpectation;

  /** Recovery expectations */
  recovery: RecoveryExpectation;

  /** Artifact expectations */
  artifacts: ArtifactExpectation[];

  /** State expectations */
  finalState: ResilienceState;
}

/**
 * Task completion expectation.
 */
export interface TaskCompletionExpectation {
  /** Minimum tasks completed */
  minCompleted: number;

  /** Maximum tasks failed */
  maxFailed: number;

  /** Minimum completion rate (0-1) */
  minCompletionRate: number;
}

/**
 * Budget expectation.
 */
export interface BudgetExpectation {
  /** Maximum total spent */
  maxSpentUsd: number;

  /** Maximum Opus spent */
  maxOpusSpentUsd: number;

  /** Maximum Opus time used (minutes) */
  maxOpusTimeMin: number;

  /** Should stay within budget */
  withinBudget: boolean;
}

/**
 * Escalation expectation.
 */
export interface EscalationExpectation {
  /** Maximum escalations allowed */
  maxCount: number;

  /** Expected escalation types */
  expectedTypes: string[];

  /** Minimum time between escalations (minutes) */
  minTimeBetweenMin: number;
}

/**
 * Recovery expectation.
 */
export interface RecoveryExpectation {
  /** Minimum recovery rate (0-1) */
  minRecoveryRate: number;

  /** Maximum retry attempts */
  maxRetryAttempts: number;
}

/**
 * Artifact expectation.
 */
export interface ArtifactExpectation {
  /** Artifact path pattern */
  pathPattern: string;

  /** Should exist */
  shouldExist: boolean;

  /** Content validation (regex) */
  contentPattern?: string;

  /** Minimum file size */
  minSizeBytes?: number;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation rule for scenario.
 */
export interface ValidationRule {
  /** Rule ID */
  id: string;

  /** Rule name */
  name: string;

  /** Rule type */
  type: ValidationRuleType;

  /** Severity */
  severity: ValidationSeverity;

  /** Rule configuration */
  config: ValidationConfig;

  /** Error message on failure */
  errorMessage: string;
}

/**
 * Validation rule types.
 */
export type ValidationRuleType =
  | "task_completion"
  | "budget_limit"
  | "escalation_count"
  | "recovery_rate"
  | "artifact_exists"
  | "artifact_content"
  | "final_state"
  | "operation_forbidden"
  | "duration_limit"
  | "model_usage"
  | "custom";

/**
 * Validation severity levels.
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Validation configuration.
 */
export interface ValidationConfig {
  /** Target metric/value */
  target: string;

  /** Comparison operator */
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "matches";

  /** Expected value */
  expected: unknown;

  /** Tolerance (for numeric comparisons) */
  tolerance?: number;
}

// ============================================================================
// Execution Results
// ============================================================================

/**
 * Scenario execution result.
 */
export interface ScenarioResult {
  /** Scenario name */
  scenarioName: string;

  /** Gate level */
  gate: AutonomyGate;

  /** Overall pass/fail */
  passed: boolean;

  /** Execution duration in ms */
  durationMs: number;

  /** Task results */
  taskResults: TaskResult[];

  /** Validation results */
  validationResults: ValidationResult[];

  /** Budget summary */
  budgetSummary: BudgetSummary;

  /** Escalation summary */
  escalationSummary: EscalationSummary;

  /** Artifacts created */
  artifactsCreated: string[];

  /** Final state */
  finalState: ResilienceState;

  /** Error details (if failed) */
  errors: ScenarioError[];

  /** Timestamp */
  timestamp: string;
}

/**
 * Individual task result.
 */
export interface TaskResult {
  /** Task ID */
  taskId: string;

  /** Task type */
  type: ScenarioTaskType;

  /** Success/failure */
  success: boolean;

  /** Actual model tier used */
  actualTier: "ELITE" | "STANDARD" | "EFFICIENCY";

  /** Cost in USD */
  cost: number;

  /** Duration in ms */
  durationMs: number;

  /** Retry count */
  retryCount: number;

  /** Artifacts created */
  artifacts: string[];

  /** Error message (if failed) */
  error?: string;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Rule ID */
  ruleId: string;

  /** Rule name */
  ruleName: string;

  /** Pass/fail */
  passed: boolean;

  /** Severity */
  severity: ValidationSeverity;

  /** Actual value */
  actualValue: unknown;

  /** Expected value */
  expectedValue: unknown;

  /** Message */
  message: string;
}

/**
 * Budget summary.
 */
export interface BudgetSummary {
  /** Total spent */
  totalSpentUsd: number;

  /** Opus spent */
  opusSpentUsd: number;

  /** Opus time used (minutes) */
  opusTimeMin: number;

  /** Remaining budget */
  remainingUsd: number;

  /** Within budget */
  withinBudget: boolean;
}

/**
 * Escalation summary.
 */
export interface EscalationSummary {
  /** Total escalations */
  count: number;

  /** Escalation types */
  types: string[];

  /** Average time between (minutes) */
  avgTimeBetweenMin: number;
}

/**
 * Scenario error.
 */
export interface ScenarioError {
  /** Error type */
  type: "setup" | "execution" | "validation" | "cleanup";

  /** Error message */
  message: string;

  /** Stack trace */
  stack?: string;

  /** Related task ID */
  taskId?: string;
}

// ============================================================================
// Scenario Runner Config
// ============================================================================

/**
 * Runner configuration.
 */
export interface ScenarioRunnerConfig {
  /** Scenarios directory */
  scenariosDir: string;

  /** Output directory for results */
  outputDir: string;

  /** Parallel execution */
  parallel: boolean;

  /** Max parallel scenarios */
  maxParallel: number;

  /** Timeout per scenario (ms) */
  timeoutMs: number;

  /** Cleanup after each scenario */
  cleanup: boolean;

  /** Debug mode */
  debug: boolean;

  /** Dry run (don't execute, just validate) */
  dryRun: boolean;
}

/**
 * Default runner configuration.
 */
export const DEFAULT_RUNNER_CONFIG: ScenarioRunnerConfig = {
  scenariosDir: "tests/golden-scenarios",
  outputDir: "tests/golden-scenarios/results",
  parallel: false,
  maxParallel: 2,
  timeoutMs: 30 * 60 * 1000, // 30 minutes
  cleanup: true,
  debug: false,
  dryRun: false,
};
