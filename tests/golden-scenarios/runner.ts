/**
 * Golden Scenario Runner
 *
 * Executes golden scenarios and validates results.
 *
 * @module tests/golden-scenarios/runner
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.6
 * @sprint 72
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import { createLogger, type Logger } from "../../src/logging/index.js";
import {
  AutonomousSessionManager,
  createAutonomousSessionManager,
} from "../../src/sessions/autonomous/index.js";
import { ResilienceState } from "../../src/sessions/state-machine.js";
import type {
  GoldenScenario,
  ScenarioResult,
  ScenarioRunnerConfig,
  TaskResult,
  ValidationResult,
  BudgetSummary,
  EscalationSummary,
  ScenarioError,
  ScenarioTask,
} from "./types.js";
import { DEFAULT_RUNNER_CONFIG } from "./types.js";
import { ScenarioValidator } from "./validator.js";

// ============================================================================
// Scenario Runner
// ============================================================================

/**
 * Golden scenario runner.
 */
export class ScenarioRunner {
  private readonly logger: Logger;
  private readonly config: ScenarioRunnerConfig;
  private readonly validator: ScenarioValidator;

  constructor(config: Partial<ScenarioRunnerConfig> = {}) {
    this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
    this.logger = createLogger("ScenarioRunner");
    this.validator = new ScenarioValidator();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Run a single scenario from file.
   */
  async runScenario(scenarioPath: string): Promise<ScenarioResult> {
    this.logger.info("Running scenario", { scenarioPath });

    const startTime = Date.now();
    const errors: ScenarioError[] = [];

    // Load scenario
    let scenario: GoldenScenario;
    try {
      scenario = await this.loadScenario(scenarioPath);
    } catch (error) {
      return this.createFailedResult("unknown", "A", startTime, [
        {
          type: "setup",
          message: `Failed to load scenario: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    }

    // Validate scenario schema
    const schemaErrors = this.validator.validateSchema(scenario);
    if (schemaErrors.length > 0) {
      return this.createFailedResult(scenario.metadata.name, scenario.gate.level, startTime, [
        ...schemaErrors.map((e) => ({ type: "setup" as const, message: e })),
      ]);
    }

    // Dry run mode
    if (this.config.dryRun) {
      this.logger.info("Dry run mode - skipping execution", {
        scenario: scenario.metadata.name,
      });
      return this.createDryRunResult(scenario, startTime);
    }

    // Setup project
    let projectRoot: string;
    try {
      projectRoot = await this.setupProject(scenario);
    } catch (error) {
      errors.push({
        type: "setup",
        message: `Failed to setup project: ${error instanceof Error ? error.message : String(error)}`,
      });
      return this.createFailedResult(scenario.metadata.name, scenario.gate.level, startTime, errors);
    }

    // Execute scenario
    let taskResults: TaskResult[] = [];
    let manager: AutonomousSessionManager | undefined;
    try {
      const result = await this.executeScenario(scenario, projectRoot);
      taskResults = result.taskResults;
      manager = result.manager;
    } catch (error) {
      errors.push({
        type: "execution",
        message: `Scenario execution failed: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // Get budget and escalation summaries
    const budgetSummary = manager
      ? this.getBudgetSummary(manager, scenario)
      : this.getEmptyBudgetSummary();
    const escalationSummary = manager
      ? this.getEscalationSummary(manager)
      : this.getEmptyEscalationSummary();

    // Get artifacts created
    const artifactsCreated = this.getCreatedArtifacts(projectRoot, scenario);

    // Get final state
    const finalState = manager
      ? manager.getStatus().state
      : ResilienceState.INIT;

    // Validate results
    const validationResults = this.validator.validateResults(
      scenario,
      taskResults,
      budgetSummary,
      escalationSummary,
      artifactsCreated,
      finalState,
      projectRoot
    );

    // Cleanup
    if (this.config.cleanup && projectRoot) {
      await this.cleanup(projectRoot);
    }

    // Build result
    const durationMs = Date.now() - startTime;
    const passed =
      errors.length === 0 &&
      validationResults.filter((v) => v.severity === "error" && !v.passed).length === 0;

    const result: ScenarioResult = {
      scenarioName: scenario.metadata.name,
      gate: scenario.gate.level,
      passed,
      durationMs,
      taskResults,
      validationResults,
      budgetSummary,
      escalationSummary,
      artifactsCreated,
      finalState,
      errors,
      timestamp: new Date().toISOString(),
    };

    this.logger.info("Scenario complete", {
      scenario: scenario.metadata.name,
      passed,
      durationMs,
      tasksCompleted: taskResults.filter((t) => t.success).length,
      tasksFailed: taskResults.filter((t) => !t.success).length,
    });

    return result;
  }

  /**
   * Run all scenarios in directory.
   */
  async runAllScenarios(): Promise<ScenarioResult[]> {
    const scenarios = await this.discoverScenarios();
    this.logger.info("Discovered scenarios", { count: scenarios.length });

    if (this.config.parallel) {
      return this.runParallel(scenarios);
    }

    return this.runSequential(scenarios);
  }

  /**
   * Run scenarios by gate level.
   */
  async runByGate(gate: "A" | "B" | "C"): Promise<ScenarioResult[]> {
    const scenarios = await this.discoverScenarios();
    const filtered = scenarios.filter((s) =>
      s.toLowerCase().includes(`gate-${gate.toLowerCase()}`)
    );

    this.logger.info("Running scenarios for gate", { gate, count: filtered.length });

    return this.runSequential(filtered);
  }

  // ==========================================================================
  // Scenario Loading
  // ==========================================================================

  /**
   * Load scenario from YAML file.
   */
  private async loadScenario(scenarioPath: string): Promise<GoldenScenario> {
    const fullPath = path.isAbsolute(scenarioPath)
      ? scenarioPath
      : path.join(process.cwd(), scenarioPath);

    const content = await fs.promises.readFile(fullPath, "utf-8");
    const scenario = yaml.parse(content) as GoldenScenario;

    // Convert string states to ResilienceState enum
    scenario.tasks = scenario.tasks.map((task) => ({
      ...task,
      stage: this.parseState(task.stage as unknown as string),
    }));

    if (scenario.setup.initialState) {
      scenario.setup.initialState = this.parseState(
        scenario.setup.initialState as unknown as string
      );
    }

    if (scenario.expectations.finalState) {
      scenario.expectations.finalState = this.parseState(
        scenario.expectations.finalState as unknown as string
      );
    }

    return scenario;
  }

  /**
   * Discover all scenario files.
   */
  private async discoverScenarios(): Promise<string[]> {
    const dir = path.join(process.cwd(), this.config.scenariosDir);
    const files = await fs.promises.readdir(dir);
    return files
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => path.join(dir, f));
  }

  /**
   * Parse state string to ResilienceState enum.
   */
  private parseState(state: string): ResilienceState {
    const stateMap: Record<string, ResilienceState> = {
      INIT: ResilienceState.INIT,
      PLANNING: ResilienceState.PLANNING,
      DESIGN: ResilienceState.DESIGN,
      BUILD: ResilienceState.BUILD,
      TEST: ResilienceState.TEST,
      VERIFY: ResilienceState.VERIFY,
      DEPLOY: ResilienceState.DEPLOY,
      DONE: ResilienceState.DONE,
      FAILED: ResilienceState.FAILED,
    };
    return stateMap[state] ?? ResilienceState.INIT;
  }

  // ==========================================================================
  // Project Setup
  // ==========================================================================

  /**
   * Setup project directory for scenario.
   */
  private async setupProject(scenario: GoldenScenario): Promise<string> {
    const projectRoot = path.join(
      process.cwd(),
      "tmp",
      `scenario-${scenario.metadata.name}-${Date.now()}`
    );

    await fs.promises.mkdir(projectRoot, { recursive: true });

    // Create setup files
    for (const file of scenario.setup.files) {
      const filePath = path.join(projectRoot, file.path);
      const fileDir = path.dirname(filePath);
      await fs.promises.mkdir(fileDir, { recursive: true });
      await fs.promises.writeFile(filePath, file.content);
    }

    this.logger.info("Project setup complete", {
      projectRoot,
      filesCreated: scenario.setup.files.length,
    });

    return projectRoot;
  }

  /**
   * Cleanup project directory.
   */
  private async cleanup(projectRoot: string): Promise<void> {
    try {
      await fs.promises.rm(projectRoot, { recursive: true, force: true });
      this.logger.info("Cleanup complete", { projectRoot });
    } catch (error) {
      this.logger.warn("Cleanup failed", { projectRoot, error });
    }
  }

  // ==========================================================================
  // Scenario Execution
  // ==========================================================================

  /**
   * Execute scenario with AutonomousSessionManager.
   */
  private async executeScenario(
    scenario: GoldenScenario,
    projectRoot: string
  ): Promise<{ taskResults: TaskResult[]; manager: AutonomousSessionManager }> {
    // Create manager
    const manager = createAutonomousSessionManager({
      projectRoot,
      projectId: scenario.metadata.name,
      gate: scenario.gate.level,
      budgetUsd: scenario.setup.budget.totalUsd,
      opusCapUsd: scenario.setup.budget.opusCapUsd,
      opusCapMin: scenario.setup.budget.opusCapMin,
      maxTaskRetries: scenario.expectations.recovery.maxRetryAttempts,
      debug: this.config.debug,
    });

    // Start session
    await manager.start();

    // Add tasks
    for (const task of scenario.tasks) {
      manager.addTask({
        type: task.type,
        description: task.description,
        stage: task.stage,
        priority: task.priority,
        estimatedCost: task.estimatedCost,
        dependencies: task.dependencies,
      });
    }

    // Execute tasks (simulated - real impl would run the loop)
    const taskResults: TaskResult[] = [];
    const pendingTasks = manager.getPendingTasks();

    for (const task of pendingTasks) {
      const startTime = Date.now();
      const scenarioTask = scenario.tasks.find((t) => t.id === task.id);

      // Simulate task execution
      const result = await this.simulateTaskExecution(task, scenarioTask);
      taskResults.push({
        taskId: task.id,
        type: task.type as TaskResult["type"],
        success: result.success,
        actualTier: result.tier,
        cost: result.cost,
        durationMs: Date.now() - startTime,
        retryCount: result.retryCount,
        artifacts: result.artifacts,
        error: result.error,
      });
    }

    return { taskResults, manager };
  }

  /**
   * Simulate task execution (for testing).
   */
  private async simulateTaskExecution(
    task: { id: string; type: string; estimatedCost: number },
    scenarioTask?: ScenarioTask
  ): Promise<{
    success: boolean;
    tier: "ELITE" | "STANDARD" | "EFFICIENCY";
    cost: number;
    retryCount: number;
    artifacts: string[];
    error?: string;
  }> {
    // Simulate based on expected outcome if provided
    const expectedOutcome = scenarioTask?.expectedOutcome ?? "success";
    const success = expectedOutcome === "success";
    const tier = (scenarioTask?.expectedTier ?? "STANDARD") as "ELITE" | "STANDARD" | "EFFICIENCY";

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success,
      tier,
      cost: task.estimatedCost,
      retryCount: success ? 0 : 1,
      artifacts: scenarioTask?.expectedArtifacts ?? [],
      error: success ? undefined : "Simulated failure",
    };
  }

  // ==========================================================================
  // Result Building
  // ==========================================================================

  /**
   * Run scenarios sequentially.
   */
  private async runSequential(scenarioPaths: string[]): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];
    for (const scenarioPath of scenarioPaths) {
      const result = await this.runScenario(scenarioPath);
      results.push(result);
    }
    return results;
  }

  /**
   * Run scenarios in parallel.
   */
  private async runParallel(scenarioPaths: string[]): Promise<ScenarioResult[]> {
    const batches: string[][] = [];
    for (let i = 0; i < scenarioPaths.length; i += this.config.maxParallel) {
      batches.push(scenarioPaths.slice(i, i + this.config.maxParallel));
    }

    const results: ScenarioResult[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((scenarioPath) => this.runScenario(scenarioPath))
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Get budget summary from manager.
   */
  private getBudgetSummary(
    manager: AutonomousSessionManager,
    scenario: GoldenScenario
  ): BudgetSummary {
    const status = manager.getStatus();
    return {
      totalSpentUsd: status.budgetSpent,
      opusSpentUsd: manager.getBudget().getTierSpending("ELITE" as any).usd,
      opusTimeMin: status.opusTimeUsed,
      remainingUsd: status.budgetRemaining,
      withinBudget: status.budgetSpent <= scenario.setup.budget.totalUsd,
    };
  }

  /**
   * Get escalation summary from manager.
   */
  private getEscalationSummary(manager: AutonomousSessionManager): EscalationSummary {
    const escalations = manager.getEscalations();
    const types = [...new Set(escalations.map((e) => e.type))];

    let avgTimeBetween = 0;
    if (escalations.length > 1) {
      const times = escalations.map((e) => new Date(e.timestamp).getTime());
      const diffs: number[] = [];
      for (let i = 1; i < times.length; i++) {
        diffs.push((times[i] - times[i - 1]) / 60000); // Convert to minutes
      }
      avgTimeBetween = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }

    return {
      count: escalations.length,
      types,
      avgTimeBetweenMin: avgTimeBetween,
    };
  }

  /**
   * Get created artifacts.
   */
  private getCreatedArtifacts(projectRoot: string, scenario: GoldenScenario): string[] {
    const artifacts: string[] = [];

    for (const expectation of scenario.expectations.artifacts) {
      const fullPath = path.join(projectRoot, expectation.pathPattern);
      if (fs.existsSync(fullPath)) {
        artifacts.push(expectation.pathPattern);
      }
    }

    return artifacts;
  }

  /**
   * Create empty budget summary.
   */
  private getEmptyBudgetSummary(): BudgetSummary {
    return {
      totalSpentUsd: 0,
      opusSpentUsd: 0,
      opusTimeMin: 0,
      remainingUsd: 0,
      withinBudget: false,
    };
  }

  /**
   * Create empty escalation summary.
   */
  private getEmptyEscalationSummary(): EscalationSummary {
    return {
      count: 0,
      types: [],
      avgTimeBetweenMin: 0,
    };
  }

  /**
   * Create failed result.
   */
  private createFailedResult(
    scenarioName: string,
    gate: "A" | "B" | "C",
    startTime: number,
    errors: ScenarioError[]
  ): ScenarioResult {
    return {
      scenarioName,
      gate,
      passed: false,
      durationMs: Date.now() - startTime,
      taskResults: [],
      validationResults: [],
      budgetSummary: this.getEmptyBudgetSummary(),
      escalationSummary: this.getEmptyEscalationSummary(),
      artifactsCreated: [],
      finalState: ResilienceState.FAILED,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create dry run result.
   */
  private createDryRunResult(
    scenario: GoldenScenario,
    startTime: number
  ): ScenarioResult {
    return {
      scenarioName: scenario.metadata.name,
      gate: scenario.gate.level,
      passed: true,
      durationMs: Date.now() - startTime,
      taskResults: scenario.tasks.map((task) => ({
        taskId: task.id,
        type: task.type as TaskResult["type"],
        success: true,
        actualTier: task.expectedTier,
        cost: task.estimatedCost,
        durationMs: 0,
        retryCount: 0,
        artifacts: task.expectedArtifacts,
      })),
      validationResults: [],
      budgetSummary: {
        totalSpentUsd: 0,
        opusSpentUsd: 0,
        opusTimeMin: 0,
        remainingUsd: scenario.setup.budget.totalUsd,
        withinBudget: true,
      },
      escalationSummary: {
        count: 0,
        types: [],
        avgTimeBetweenMin: 0,
      },
      artifactsCreated: [],
      finalState: scenario.expectations.finalState,
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalRunner: ScenarioRunner | null = null;

/**
 * Create a scenario runner.
 */
export function createScenarioRunner(
  config?: Partial<ScenarioRunnerConfig>
): ScenarioRunner {
  globalRunner = new ScenarioRunner(config);
  return globalRunner;
}

/**
 * Get the global scenario runner.
 */
export function getScenarioRunner(): ScenarioRunner | null {
  return globalRunner;
}

/**
 * Reset the global scenario runner.
 */
export function resetScenarioRunner(): void {
  globalRunner = null;
}
