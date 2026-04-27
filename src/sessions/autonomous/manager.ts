/**
 * Autonomous Session Manager
 *
 * Full SDLC loop orchestration with model tiering and budget management.
 *
 * @module sessions/autonomous/manager
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.5
 * @sprint 72
 */

import { createLogger, type Logger } from "../../logging/index.js";
import {
  SessionResilienceManager,
  type SessionResilienceConfig,
} from "../session-resilience.js";
import { stateToSDLCStage } from "../state-machine.js";
import { FailureClassifier, FailureType } from "../failure/index.js";
import { RecoveryEngine, type RecoveryResult } from "../recovery/index.js";
import {
  ModelSelector,
  createModelSelector,
} from "../../models/model-selector.js";
import {
  SessionBudget,
  createSessionBudget,
} from "../../models/session-budget.js";
import { ModelTier, type ModelCallRecord } from "../../models/types.js";
import {
  AUTONOMY_GATE_CONFIG,
  DEFAULT_AUTONOMOUS_CONFIG,
  type AutonomousSessionConfig,
  type AutonomousSessionStatus,
  type AutonomousTask,
  type TaskExecutionResult,
  type DecisionPoint,
  type EscalationRequest,
  type EscalationResponse,
  type AutonomousEvent,
  type AutonomousEventListener,
} from "./types.js";
import type { ContextLifecycleManager } from "../../context/transfer/context-lifecycle.js";
import type { SubtaskStatus } from "../../autonomy/types.js";
import {
  checkStability,
  type SessionStabilityState,
} from "./stability-policy.js";
import type { ProviderDeps } from "../../agents/router/providers.js";
import { TaskQueue } from "./task-queue.js";
import { AutonomyGateManager } from "./gate-manager.js";
import type { AutonomousEventEmitter } from "./event-emitter.js";
import { TaskWorkExecutor } from "./task-work-executor.js";

// ============================================================================
// Autonomous Session Manager
// ============================================================================

/**
 * Autonomous Session Manager.
 *
 * Orchestrates full SDLC loop (01→05) with:
 * - Model tiering (Opus/Sonnet/Haiku selection)
 * - Budget management ($10 total, $3 Opus cap)
 * - Non-blocking escalation
 * - Conservative choice fallback
 * - State machine integration
 *
 * @example
 * ```typescript
 * const manager = new AutonomousSessionManager({
 *   projectRoot: '/path/to/project',
 *   projectId: 'my-project',
 *   gate: 'C', // Full autonomy
 * });
 *
 * await manager.start();
 *
 * // Add tasks
 * manager.addTask({
 *   type: 'code_generation',
 *   description: 'Implement user login',
 *   stage: ResilienceState.BUILD,
 *   priority: 1,
 * });
 *
 * // Run autonomous loop
 * await manager.runLoop();
 *
 * // Check status
 * const status = manager.getStatus();
 * console.log(status.tasksCompleted);
 * ```
 */
export class AutonomousSessionManager {
  private readonly log: Logger;
  private readonly config: Required<AutonomousSessionConfig>;
  private readonly resilience: SessionResilienceManager;
  private readonly modelSelector: ModelSelector;
  private readonly budget: SessionBudget;
  private readonly failureClassifier: FailureClassifier;
  private readonly recoveryEngine: RecoveryEngine;

  // Extracted sub-modules
  private readonly tasks: TaskQueue;
  private readonly gateManager: AutonomyGateManager;
  private readonly taskWorkExecutor: TaskWorkExecutor;

  // Decision tracking
  private decisions: DecisionPoint[] = [];

  // Event listeners
  private listeners: AutonomousEventListener[] = [];

  // Sprint 97: Context lifecycle integration (T3)
  private contextLifecycle: ContextLifecycleManager | undefined;

  // Sprint 124b: Provider deps for executeTaskWork (CTO C1+C5)
  private providerDeps: ProviderDeps | undefined;

  // Session state
  private startTime: Date;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentTask: AutonomousTask | null = null;

  // OpenMythos #6: Stability guard tracking
  private riskyOpTimestamps: number[] = [];
  private tasksSinceLastCheckpoint: number = 0;
  private lastCheckpointAt: number = 0;
  /** Sprint 143 A1: Brain L2 pattern hint for next retry/fix attempt. */
  private pendingPatternHint: string | null = null;

  constructor(config: Partial<AutonomousSessionConfig> & { projectRoot: string; projectId: string }, providerDeps?: ProviderDeps) {
    this.log = createLogger("AutonomousSessionManager");
    this.config = {
      ...DEFAULT_AUTONOMOUS_CONFIG,
      ...config,
      sessionId: config.sessionId ?? this.generateSessionId(),
    } as Required<AutonomousSessionConfig>;

    this.startTime = new Date();

    // Initialize session budget
    this.budget = createSessionBudget({
      totalUsd: this.config.budgetUsd,
      opusCapUsd: this.config.opusCapUsd,
      opusCapMin: this.config.opusCapMin,
      enableWarnings: true,
      warningThreshold: 80,
    });

    // Initialize model selector with budget
    this.modelSelector = createModelSelector({
      budget: this.budget,
      autoEscalate: true,
      failureEscalationThreshold: this.config.maxTaskRetries,
    });

    // Initialize resilience manager
    const resilienceConfig: SessionResilienceConfig = {
      projectRoot: this.config.projectRoot,
      projectId: this.config.projectId,
      sessionId: this.config.sessionId,
      autoCheckpoint: this.config.autoCheckpoint,
      maxRetries: this.config.maxTaskRetries,
      debug: this.config.debug,
    };
    this.resilience = new SessionResilienceManager(resilienceConfig);

    // Initialize failure/recovery components
    this.failureClassifier = new FailureClassifier({ debug: this.config.debug });
    this.recoveryEngine = new RecoveryEngine({ projectRoot: this.config.projectRoot, debug: this.config.debug });

    // Sprint 124b: Store provider deps for executeTaskWork (CTO C5)
    if (providerDeps) {
      this.providerDeps = providerDeps;
    }

    // Build the event emitter shim used by sub-modules
    const emitter: AutonomousEventEmitter = {
      emit: (type, data) => this.emitEvent(type, data),
    };

    // Initialize extracted sub-modules
    this.tasks = new TaskQueue({ maxTaskRetries: this.config.maxTaskRetries }, emitter);
    this.gateManager = new AutonomyGateManager(
      {
        gate: this.config.gate,
        nonBlockingEscalation: this.config.nonBlockingEscalation,
        conservativeFallback: this.config.conservativeFallback,
        sessionId: this.config.sessionId,
      },
      this.budget,
      this.startTime,
      emitter,
    );
    this.taskWorkExecutor = new TaskWorkExecutor();

    // Subscribe to budget events
    this.budget.addEventListener((event) => {
      const currentState = this.resilience.getStatus().state;
      if (event.type === "warning_threshold_reached") {
        this.gateManager.handleBudgetWarning(event.details);
      } else if (event.type === "budget_exceeded") {
        this.gateManager.handleBudgetExceeded(event.details, String(currentState));
      } else if (event.type === "opus_cap_reached") {
        this.gateManager.handleOpusCapReached(event.details);
      }
    });

    this.log.info("Autonomous session manager initialized", {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
      gate: this.config.gate,
      autonomyLevel: AUTONOMY_GATE_CONFIG[this.config.gate].level,
    });
  }

  /** Start the autonomous session. */
  async start(): Promise<void> {
    await this.resilience.start();
    this.startTime = new Date();
    this.isRunning = true;

    this.emitEvent("session_started", {
      gate: this.config.gate,
      autonomyLevel: AUTONOMY_GATE_CONFIG[this.config.gate].level,
      budgetUsd: this.config.budgetUsd,
    });

    this.log.info("Autonomous session started", {
      sessionId: this.config.sessionId,
      gate: this.config.gate,
    });
  }

  /** Pause the session. */
  async pause(reason?: string): Promise<string> {
    this.isPaused = true;
    const checkpointId = await this.resilience.pause(reason);

    this.emitEvent("session_paused", {
      reason,
      checkpointId,
      tasksCompleted: this.tasks.getCompletedTasks().length,
      tasksPending: this.tasks.length,
    });

    return checkpointId;
  }

  /** Resume the session. */
  async resume(checkpointId?: string): Promise<void> {
    if (checkpointId) {
      await this.resilience.resume(checkpointId);
    }
    this.isPaused = false;
    this.isRunning = true;

    this.emitEvent("session_resumed", {
      checkpointId,
    });
  }

  /** Complete the session. */
  async complete(): Promise<void> {
    this.isRunning = false;
    await this.resilience.complete();

    const completedTasks = this.tasks.getCompletedTasks();
    this.emitEvent("session_completed", {
      tasksCompleted: completedTasks.length,
      tasksFailed: completedTasks.filter((t) => !t.success).length,
      totalCost: this.budget.getTotalSpent(),
      durationMs: Date.now() - this.startTime.getTime(),
    });

    this.log.info("Autonomous session completed", {
      sessionId: this.config.sessionId,
      tasksCompleted: completedTasks.length,
      totalCost: this.budget.getTotalSpent(),
    });
  }

  /** Add a task to the queue. */
  addTask(
    task: Omit<AutonomousTask, "id" | "createdAt" | "maxRetries" | "dependencies"> &
      Partial<Pick<AutonomousTask, "maxRetries" | "dependencies">>
  ): string {
    return this.tasks.add(task);
  }

  /**
   * Run the full autonomous session loop (Prelude → Recurrent → Coda).
   * OpenMythos pattern: Sprint 139 adoption #5.
   */
  async runLoop(): Promise<void> {
    this.log.info("Starting autonomous loop", {
      sessionId: this.config.sessionId,
      tasksInQueue: this.tasks.length,
    });

    await this.prelude();
    await this.recurrentLoop();
    await this.coda();

    const completedTasks = this.tasks.getCompletedTasks();
    this.log.info("Autonomous loop finished", {
      sessionId: this.config.sessionId,
      tasksCompleted: completedTasks.length,
      tasksFailed: completedTasks.filter((t) => !t.success).length,
      budgetSpent: this.budget.getTotalSpent(),
    });
  }

  // ==========================================================================
  // Phase-Specific Behavior (OpenMythos Prelude/Recurrent/Coda)
  // ==========================================================================

  /**
   * Prelude phase — run once before the task loop.
   */
  private async prelude(): Promise<void> {
    this.emitEvent("phase_prelude_start", {
      tasksInQueue: this.tasks.length,
    });

    let contextInjected = false;
    if (this.contextLifecycle) {
      try {
        const sdlcStage = stateToSDLCStage(this.resilience.getStatus().state);
        await this.contextLifecycle.onSessionStart(
          this.config.projectId,
          this.config.sessionId,
          this.config.sprintGoal,
          undefined,
          sdlcStage ?? undefined,
        );
        contextInjected = true;
      } catch {
        this.log.warn("Context injection failed, continuing without prior context");
      }
    }

    this.emitEvent("phase_prelude_end", { contextInjected });
  }

  /**
   * Recurrent phase — the main task execution loop.
   */
  private async recurrentLoop(): Promise<void> {
    this.emitEvent("phase_recurrent_start", {
      tasksInQueue: this.tasks.length,
      budgetRemaining: this.budget.getRemaining(),
    });

    while (this.isRunning && !this.isPaused) {
      // OpenMythos #6: Stability guard
      const stabilityState: SessionStabilityState = {
        pendingEscalations: this.gateManager.pendingEscalationCount,
        riskyOpTimestamps: this.riskyOpTimestamps,
        tasksSinceLastCheckpoint: this.tasksSinceLastCheckpoint,
        lastCheckpointAt: this.lastCheckpointAt,
      };
      const stabilityCheck = checkStability(stabilityState);
      if (!stabilityCheck.stable) {
        this.log.warn("Stability guard BLOCKED — session paused", {
          violations: stabilityCheck.violations.map((v) => v.guard),
        });
        this.isPaused = true;
        this.emitEvent("stability_violation", { violations: stabilityCheck.violations });
        break;
      }
      for (const v of stabilityCheck.violations) {
        if (v.severity === "warning") {
          this.log.warn(`Stability warning: ${v.guard}`, { message: v.message });
        }
      }

      if (!this.gateManager.isBudgetAvailable()) {
        this.log.warn("Budget exhausted, stopping loop");
        break;
      }

      if (this.gateManager.isTimeLimitReached()) {
        this.log.warn("Time limit reached, stopping loop");
        break;
      }

      if (this.gateManager.hasBlockingEscalations()) {
        this.log.info("Waiting for escalation resolution", {
          pendingCount: this.gateManager.pendingEscalationCount,
        });
        break;
      }

      // Sprint 97: Mid-session context refresh
      if (this.contextLifecycle) {
        this.contextLifecycle.incrementTurn();
        if (this.contextLifecycle.shouldRefresh()) {
          try {
            const sdlcStage = stateToSDLCStage(this.resilience.getStatus().state);
            await this.contextLifecycle.refreshContext(
              this.config.sprintGoal,
              undefined,
              sdlcStage ?? undefined,
            );
          } catch {
            // Non-critical — continue with existing context
          }
        }
      }

      const task = this.tasks.dequeue();
      if (!task) {
        if (this.tasks.length === 0) {
          this.log.info("All tasks completed");
          break;
        }
        this.log.warn("No executable tasks (dependencies not satisfied)", {
          pendingTasks: this.tasks.length,
        });
        break;
      }

      await this.executeTask(task);

      if (this.contextLifecycle) {
        this.contextLifecycle.incrementTurn();
      }
    }

    this.emitEvent("phase_recurrent_end", {
      tasksCompleted: this.tasks.getCompletedTasks().length,
      budgetSpent: this.budget.getTotalSpent(),
    });
  }

  /**
   * Coda phase — run once after the task loop exits.
   */
  private async coda(): Promise<void> {
    this.emitEvent("phase_coda_start", {
      tasksCompleted: this.tasks.getCompletedTasks().length,
    });

    let contextExtracted = false;
    if (this.contextLifecycle) {
      try {
        const results = this.tasks.getCompletedTasks().map((r) => ({
          agent: "autonomous",
          success: r.success,
          output: r.output ?? "",
        }));
        const sdlcStage = stateToSDLCStage(this.resilience.getStatus().state);
        await this.contextLifecycle.onSessionEnd(results, undefined, sdlcStage ?? undefined);
        contextExtracted = true;
      } catch {
        this.log.warn("Context extraction failed at session end");
      }
    }

    this.emitEvent("phase_coda_end", {
      contextExtracted,
      tasksCompleted: this.tasks.getCompletedTasks().length,
    });
  }

  /**
   * Execute a single task.
   */
  private async executeTask(task: AutonomousTask): Promise<TaskExecutionResult> {
    this.currentTask = task;
    const startTime = Date.now();

    this.tasks.remove(task.id);
    this.tasks.transitionState(task.id, "dispatched");
    this.tasks.transitionState(task.id, "running");

    this.emitEvent("task_started", {
      taskId: task.id,
      type: task.type,
      stage: task.stage,
    });

    const modelSelection = this.modelSelector.selectModel(task.type, 0);

    this.emitEvent("model_selected", {
      taskId: task.id,
      tier: modelSelection.config.tier,
      model: modelSelection.config.model,
      reason: modelSelection.reason,
      downgraded: modelSelection.downgraded,
    });

    if (modelSelection.downgraded) {
      this.emitEvent("model_downgraded", {
        taskId: task.id,
        originalTier: modelSelection.originalTier,
        newTier: modelSelection.config.tier,
        reason: modelSelection.reason,
      });
    }

    this.recordDecision({
      type: "model_selection",
      context: `Task: ${task.description}`,
      options: [
        { id: "elite", label: "Opus (ELITE)", risk: "low", isConservative: false, impact: "Highest quality, highest cost" },
        { id: "standard", label: "Sonnet (STANDARD)", risk: "low", isConservative: true, impact: "Good quality, moderate cost" },
        { id: "efficiency", label: "Haiku (EFFICIENCY)", risk: "medium", isConservative: true, impact: "Fast, low cost" },
      ],
      autoSelected: modelSelection.config.tier,
      requiresEscalation: false,
    });

    let retryCount = 0;
    let lastError: Error | null = null;
    let success = false;
    let actualCost = 0;
    const filesModified: string[] = [];
    const filesCreated: string[] = [];

    while (retryCount <= task.maxRetries && !success) {
      try {
        const workResult = await this.taskWorkExecutor.execute(task, modelSelection.config.tier, {
          sessionId: this.config.sessionId,
          gate: this.config.gate,
          originChannel: this.config.originChannel ?? "cli",
          sprintGoal: this.config.sprintGoal,
          projectRoot: this.config.projectRoot,
          promptFn: this.config.promptFn,
          providerDeps: this.providerDeps,
          completedTasks: this.tasks.getCompletedTaskMap(),
          pendingPatternHint: this.pendingPatternHint,
        }, modelSelection.config.model);
        this.pendingPatternHint = workResult.pendingPatternHint;
        if (workResult.recordedRiskyOp) this.riskyOpTimestamps.push(Date.now());
        success = true;
        actualCost = workResult.cost;
        filesModified.push(...(workResult.filesModified ?? []));
        filesCreated.push(...(workResult.filesCreated ?? []));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const classification = this.failureClassifier.classify(lastError, {
          taskId: task.id,
          taskType: task.type,
          stage: task.stage.toString(),
        });

        if (classification.type !== FailureType.DESIGN_ISSUE) {
          const recoveryResult = await this.attemptRecovery(task, lastError, classification.type, retryCount);
          if (recoveryResult.recovered) {
            if (recoveryResult.action === "RETRY" || recoveryResult.action === "FIX") {
              this.pendingPatternHint = recoveryResult.patternHint ?? null;
              retryCount++;
              continue;
            }
          }
        }

        if (classification.type === FailureType.DESIGN_ISSUE) {
          await this.gateManager.createEscalation({
            severity: "critical",
            reason: `Design issue detected: ${lastError.message}`,
            taskId: task.id,
            blocking: !this.config.nonBlockingEscalation,
            suggestions: ["Review the task requirements", "Consult with architect", "Break down into smaller tasks"],
            currentState: String(this.resilience.getStatus().state),
          });
        }

        retryCount++;
      }
    }

    if (actualCost > 0) {
      const callRecord: ModelCallRecord = {
        tier: modelSelection.config.tier,
        model: modelSelection.config.model,
        cost: actualCost,
        durationSeconds: (Date.now() - startTime) / 1000,
        inputTokens: 0,
        outputTokens: 0,
        timestamp: new Date().toISOString(),
      };
      const taskStage = stateToSDLCStage(task.stage);
      if (taskStage) callRecord.stage = taskStage;
      this.budget.recordCall(callRecord);
    }

    const durationMs = Date.now() - startTime;

    const result: TaskExecutionResult = {
      taskId: task.id,
      success,
      modelTier: modelSelection.config.tier,
      modelSelection,
      actualCost,
      durationMs,
      filesModified,
      filesCreated,
    };

    if (!success && lastError) {
      const classification = this.failureClassifier.classify(lastError, {});
      result.failure = {
        type: classification.type,
        message: lastError.message,
        retryCount,
      };
    }

    this.tasks.transitionState(task.id, "verifying");
    this.tasks.recordResult(result);
    this.currentTask = null;

    if (success) {
      this.tasks.transitionState(task.id, "completed");
      this.emitEvent("task_completed", {
        taskId: task.id,
        durationMs,
        cost: actualCost,
        filesModified: filesModified.length,
        filesCreated: filesCreated.length,
      });
    } else {
      this.tasks.transitionState(task.id, "failed");
      this.emitEvent("task_failed", {
        taskId: task.id,
        durationMs,
        retryCount,
        error: lastError?.message,
      });
    }

    this.tasksSinceLastCheckpoint++;

    if (this.config.autoCheckpoint && success) {
      await this.resilience.createCheckpoint("milestone", `Task ${task.id} completed`);
      this.lastCheckpointAt = Date.now();
      this.tasksSinceLastCheckpoint = 0;
    }

    return result;
  }

  /**
   * Attempt recovery from failure.
   */
  private async attemptRecovery(
    task: AutonomousTask,
    error: Error,
    _failureType: FailureType,
    _retryCount: number
  ): Promise<RecoveryResult> {
    const result = await this.recoveryEngine.handleFailure(error, {
      taskId: task.id,
      stage: task.stage.toString(),
    });

    this.emitEvent("recovery_attempted", {
      taskId: task.id,
      failureType: _failureType,
      action: result.action,
      recovered: result.recovered,
    });

    return result;
  }

  /** Resolve an escalation (delegated to GateManager). */
  resolveEscalation(response: EscalationResponse): void {
    this.gateManager.resolveEscalation(response);
  }

  /**
   * Get current session status.
   */
  getStatus(): AutonomousSessionStatus {
    const resilienceStatus = this.resilience.getStatus();
    const remaining = this.budget.getRemaining();
    const opusSpending = this.budget.getTierSpending(ModelTier.ELITE);
    const completedTasks = this.tasks.getCompletedTasks();

    const status: AutonomousSessionStatus = {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
      state: resilienceStatus.state,
      autonomyLevel: AUTONOMY_GATE_CONFIG[this.config.gate].level,
      gate: this.config.gate,
      durationMs: Date.now() - this.startTime.getTime(),
      tasksCompleted: completedTasks.filter((t) => t.success).length,
      tasksFailed: completedTasks.filter((t) => !t.success).length,
      tasksPending: this.tasks.length,
      budgetSpent: this.budget.getTotalSpent(),
      budgetRemaining: remaining.total,
      opusTimeUsed: opusSpending.seconds / 60,
      escalationCount: this.gateManager.getEscalations().length,
      pendingEscalations: this.gateManager.getPendingEscalations(),
      isActive: this.isRunning && !this.isPaused,
      lastActivity: new Date().toISOString(),
    };
    if (this.currentTask) status.currentTaskId = this.currentTask.id;
    return status;
  }

  /** Get completed task results. */
  getCompletedTasks(): TaskExecutionResult[] { return this.tasks.getCompletedTasks(); }

  /** Get pending tasks. */
  getPendingTasks(): AutonomousTask[] { return this.tasks.getPendingTasks(); }

  /** Get decisions made. */
  getDecisions(): DecisionPoint[] { return [...this.decisions]; }

  /** Get escalation history. */
  getEscalations(): EscalationRequest[] { return this.gateManager.getEscalations(); }

  /** Get model selector. */
  getModelSelector(): ModelSelector { return this.modelSelector; }

  /** Get session budget. */
  getBudget(): SessionBudget { return this.budget; }

  /** Get resilience manager. */
  getResilienceManager(): SessionResilienceManager { return this.resilience; }

  /** Add event listener. */
  addEventListener(listener: AutonomousEventListener): void {
    this.listeners.push(listener);
  }

  /** Remove event listener. */
  removeEventListener(listener: AutonomousEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /** Set context lifecycle manager. Sprint 97: additive hook (CTO F5). */
  setContextLifecycle(lifecycle: ContextLifecycleManager): void {
    this.contextLifecycle = lifecycle;
  }

  /** Sprint 131: Get current state of a task (for /status display). */
  getTaskState(taskId: string): SubtaskStatus | undefined {
    return this.tasks.getTaskState(taskId);
  }

  /** Sprint 131: Get all task states (snapshot for UI). */
  getAllTaskStates(): ReadonlyMap<string, SubtaskStatus> {
    return this.tasks.getAllTaskStates();
  }

  private emitEvent(type: AutonomousEvent["type"], data: Record<string, unknown>): void {
    const event: AutonomousEvent = {
      type,
      sessionId: this.config.sessionId,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.log.warn("Event listener error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `auto-${timestamp}-${random}`;
  }

  private recordDecision(params: Omit<DecisionPoint, "id" | "timestamp">): void {
    const decision: DecisionPoint = {
      id: `dec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...params,
    };
    this.decisions.push(decision);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalManager: AutonomousSessionManager | null = null;

/**
 * Get the global autonomous session manager.
 */
export function getAutonomousSessionManager(): AutonomousSessionManager | null {
  return globalManager;
}

/**
 * Set the global autonomous session manager.
 */
export function setAutonomousSessionManager(manager: AutonomousSessionManager | null): void {
  globalManager = manager;
}

/**
 * Create a new autonomous session manager.
 */
export function createAutonomousSessionManager(
  config: Partial<AutonomousSessionConfig> & { projectRoot: string; projectId: string },
  providerDeps?: ProviderDeps,
): AutonomousSessionManager {
  const manager = new AutonomousSessionManager(config, providerDeps);
  globalManager = manager;
  return manager;
}

/**
 * Reset the global autonomous session manager (for testing).
 */
export function resetAutonomousSessionManager(): void {
  globalManager = null;
}
