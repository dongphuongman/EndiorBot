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
  taskTypeToAgent,
  isEfficiencyTask,
  requiresGateC,
  buildTaskContext,
  estimateCostFromTokens,
} from "./task-agent-mapper.js";
import {
  checkStability,
  type SessionStabilityState,
} from "./stability-policy.js";
import { callCloudFallback, type ProviderDeps } from "../../agents/router/providers.js";
import { checkCommand } from "../../security/exec-approvals/check.js";
import { selectPromptFn } from "../../security/exec-approvals/prompt.js";

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

  // Task management
  private taskQueue: AutonomousTask[] = [];
  private completedTasks: Map<string, TaskExecutionResult> = new Map();
  private currentTask: AutonomousTask | null = null;
  private taskIdCounter: number = 0;

  // Sprint 131 (Multica ADOPT 2): Per-task state machine for CEO visibility.
  // CTO C3: Read-only — states update from existing execution flow,
  // no separate scheduler, no auto-progression.
  private taskStates: Map<string, SubtaskStatus> = new Map();

  // Escalation management
  private escalations: EscalationRequest[] = [];
  private pendingEscalations: EscalationRequest[] = [];

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

  // OpenMythos #6: Stability guard tracking
  private riskyOpTimestamps: number[] = [];
  private tasksSinceLastCheckpoint: number = 0;
  private lastCheckpointAt: number = 0;

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

    // Subscribe to budget events
    this.budget.addEventListener((event) => {
      if (event.type === "warning_threshold_reached") {
        this.handleBudgetWarning(event.details);
      } else if (event.type === "budget_exceeded") {
        this.handleBudgetExceeded(event.details);
      } else if (event.type === "opus_cap_reached") {
        this.handleOpusCapReached(event.details);
      }
    });

    this.log.info("Autonomous session manager initialized", {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
      gate: this.config.gate,
      autonomyLevel: AUTONOMY_GATE_CONFIG[this.config.gate].level,
    });
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Start the autonomous session.
   */
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

  /**
   * Pause the session.
   */
  async pause(reason?: string): Promise<string> {
    this.isPaused = true;
    const checkpointId = await this.resilience.pause(reason);

    this.emitEvent("session_paused", {
      reason,
      checkpointId,
      tasksCompleted: this.completedTasks.size,
      tasksPending: this.taskQueue.length,
    });

    return checkpointId;
  }

  /**
   * Resume the session.
   */
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

  /**
   * Complete the session.
   */
  async complete(): Promise<void> {
    this.isRunning = false;
    await this.resilience.complete();

    this.emitEvent("session_completed", {
      tasksCompleted: this.completedTasks.size,
      tasksFailed: Array.from(this.completedTasks.values()).filter((t) => !t.success).length,
      totalCost: this.budget.getTotalSpent(),
      durationMs: Date.now() - this.startTime.getTime(),
    });

    this.log.info("Autonomous session completed", {
      sessionId: this.config.sessionId,
      tasksCompleted: this.completedTasks.size,
      totalCost: this.budget.getTotalSpent(),
    });
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  /**
   * Add a task to the queue.
   */
  addTask(
    task: Omit<AutonomousTask, "id" | "createdAt" | "maxRetries" | "dependencies"> &
      Partial<Pick<AutonomousTask, "maxRetries" | "dependencies">>
  ): string {
    const taskId = `task-${++this.taskIdCounter}`;
    const fullTask: AutonomousTask = {
      id: taskId,
      createdAt: new Date().toISOString(),
      maxRetries: task.maxRetries ?? this.config.maxTaskRetries,
      dependencies: task.dependencies ?? [],
      ...task,
    };

    this.taskQueue.push(fullTask);
    this.sortTaskQueue();

    // Sprint 131: track lifecycle
    this.transitionTaskState(taskId, fullTask.dependencies.length > 0 ? "pending" : "queued");

    this.log.debug("Task added", {
      taskId,
      type: task.type,
      stage: task.stage,
    });

    return taskId;
  }

  /**
   * Get next task from queue.
   */
  private getNextTask(): AutonomousTask | null {
    // Find task with satisfied dependencies
    for (const task of this.taskQueue) {
      const dependenciesSatisfied = task.dependencies.every((dep) =>
        this.completedTasks.has(dep)
      );
      if (dependenciesSatisfied) {
        return task;
      }
    }
    return null;
  }

  /**
   * Sort task queue by priority.
   */
  private sortTaskQueue(): void {
    this.taskQueue.sort((a, b) => a.priority - b.priority);
  }

  // ============================================================================
  // Main Loop
  // ============================================================================

  /**
   * Run the autonomous loop.
   */
  /**
   * Run the full autonomous session loop.
   *
   * OpenMythos Prelude/Recurrent/Coda pattern (Sprint 139 adoption #5):
   *   prelude()       — run once: context injection, session setup
   *   recurrentLoop() — loop: budget/time checks, task execution, context refresh
   *   coda()          — run once: context extraction, metrics summary
   *
   * This refactor extracts the 3 phases into named methods without changing
   * any behavior. CTO condition: refactor-first commit (no behavior change),
   * then feature commit (add phase hooks/events).
   */
  async runLoop(): Promise<void> {
    this.log.info("Starting autonomous loop", {
      sessionId: this.config.sessionId,
      tasksInQueue: this.taskQueue.length,
    });

    await this.prelude();
    await this.recurrentLoop();
    await this.coda();

    this.log.info("Autonomous loop finished", {
      sessionId: this.config.sessionId,
      tasksCompleted: this.completedTasks.size,
      tasksFailed: Array.from(this.completedTasks.values()).filter((t) => !t.success).length,
      budgetSpent: this.budget.getTotalSpent(),
    });
  }

  // ==========================================================================
  // Phase-Specific Behavior (OpenMythos Prelude/Recurrent/Coda)
  // ==========================================================================

  /**
   * Prelude phase — run once before the task loop.
   * Context injection, session initialization, workspace discovery.
   * OpenMythos analog: Prelude layers (1-6 fixed transformer blocks).
   */
  private async prelude(): Promise<void> {
    this.emitEvent("phase_prelude_start", {
      tasksInQueue: this.taskQueue.length,
    });

    // Sprint 97: Inject prior context before first task (CTO F5: additive hook)
    // CTO B1 fix: track actual success, not just lifecycle existence.
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
        // Non-critical — session continues without prior context
        this.log.warn("Context injection failed, continuing without prior context");
      }
    }

    this.emitEvent("phase_prelude_end", {
      contextInjected,
    });
  }

  /**
   * Recurrent phase — the main task execution loop.
   * Budget checks, time limits, task dispatch, context refresh.
   * OpenMythos analog: Recurrent block looped T times.
   */
  private async recurrentLoop(): Promise<void> {
    this.emitEvent("phase_recurrent_start", {
      tasksInQueue: this.taskQueue.length,
      budgetRemaining: this.budget.getRemaining(),
    });

    while (this.isRunning && !this.isPaused) {
      // OpenMythos #6: Stability guard — check composite invariants
      // atomically before each task execution.
      const stabilityState: SessionStabilityState = {
        pendingEscalations: this.pendingEscalations.length,
        riskyOpTimestamps: this.riskyOpTimestamps,
        tasksSinceLastCheckpoint: this.tasksSinceLastCheckpoint,
        lastCheckpointAt: this.lastCheckpointAt,
      };
      const stabilityCheck = checkStability(stabilityState);
      if (!stabilityCheck.stable) {
        this.log.warn("Stability guard BLOCKED — session paused", {
          violations: stabilityCheck.violations.map((v) => v.guard),
        });
        // W1 fix: set isPaused so getStatus() reflects the pause.
        this.isPaused = true;
        this.emitEvent("stability_violation", {
          violations: stabilityCheck.violations,
        });
        break;
      }
      // Log warnings (non-blocking)
      for (const v of stabilityCheck.violations) {
        if (v.severity === "warning") {
          this.log.warn(`Stability warning: ${v.guard}`, { message: v.message });
        }
      }

      // Check budget
      if (!this.checkBudgetAvailable()) {
        this.log.warn("Budget exhausted, stopping loop");
        break;
      }

      // Check time limit
      if (this.isTimeLimitReached()) {
        this.log.warn("Time limit reached, stopping loop");
        break;
      }

      // Handle pending escalations (non-blocking if configured)
      if (!this.config.nonBlockingEscalation && this.pendingEscalations.length > 0) {
        this.log.info("Waiting for escalation resolution", {
          pendingCount: this.pendingEscalations.length,
        });
        break;
      }

      // Sprint 97: Mid-session context refresh (CTO F5: inside loop condition check)
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

      // Get next task
      const task = this.getNextTask();
      if (!task) {
        if (this.taskQueue.length === 0) {
          this.log.info("All tasks completed");
          break;
        }
        // Tasks have unsatisfied dependencies
        this.log.warn("No executable tasks (dependencies not satisfied)", {
          pendingTasks: this.taskQueue.length,
        });
        break;
      }

      // Execute task
      await this.executeTask(task);

      // Sprint 97: Increment turn count for refresh tracking
      if (this.contextLifecycle) {
        this.contextLifecycle.incrementTurn();
      }
    }

    this.emitEvent("phase_recurrent_end", {
      tasksCompleted: this.completedTasks.size,
      budgetSpent: this.budget.getTotalSpent(),
    });
  }

  /**
   * Coda phase — run once after the task loop exits.
   * Context extraction, evidence synthesis, metrics capture.
   * OpenMythos analog: Coda layers (1-6 fixed transformer blocks).
   */
  private async coda(): Promise<void> {
    this.emitEvent("phase_coda_start", {
      tasksCompleted: this.completedTasks.size,
    });

    // Sprint 97: Extract context after loop exits (CTO F5: additive hook)
    // CTO B1 fix: track actual extraction success, not lifecycle existence.
    let contextExtracted = false;
    if (this.contextLifecycle) {
      try {
        const results = Array.from(this.completedTasks.values()).map((r) => ({
          agent: "autonomous",
          success: r.success,
          output: r.output ?? "",
        }));
        const sdlcStage = stateToSDLCStage(this.resilience.getStatus().state);
        await this.contextLifecycle.onSessionEnd(results, undefined, sdlcStage ?? undefined);
        contextExtracted = true;
      } catch {
        // Non-critical — context extraction failure doesn't affect session result
        this.log.warn("Context extraction failed at session end");
      }
    }

    this.emitEvent("phase_coda_end", {
      contextExtracted,
      tasksCompleted: this.completedTasks.size,
    });
  }

  /**
   * Execute a single task.
   */
  private async executeTask(task: AutonomousTask): Promise<TaskExecutionResult> {
    this.currentTask = task;
    const startTime = Date.now();

    // Remove from queue
    this.taskQueue = this.taskQueue.filter((t) => t.id !== task.id);

    // Sprint 131 (Multica ADOPT 2): state transitions for visibility
    this.transitionTaskState(task.id, "dispatched");
    this.transitionTaskState(task.id, "running");

    this.emitEvent("task_started", {
      taskId: task.id,
      type: task.type,
      stage: task.stage,
    });

    // Select model
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

    // Record decision
    this.recordDecision({
      type: "model_selection",
      context: `Task: ${task.description}`,
      options: [
        {
          id: "elite",
          label: "Opus (ELITE)",
          risk: "low",
          isConservative: false,
          impact: "Highest quality, highest cost",
        },
        {
          id: "standard",
          label: "Sonnet (STANDARD)",
          risk: "low",
          isConservative: true,
          impact: "Good quality, moderate cost",
        },
        {
          id: "efficiency",
          label: "Haiku (EFFICIENCY)",
          risk: "medium",
          isConservative: true,
          impact: "Fast, low cost",
        },
      ],
      autoSelected: modelSelection.config.tier,
      requiresEscalation: false,
    });

    // Execute with retry logic
    let retryCount = 0;
    let lastError: Error | null = null;
    let success = false;
    let actualCost = 0;
    const filesModified: string[] = [];
    const filesCreated: string[] = [];

    while (retryCount <= task.maxRetries && !success) {
      try {
        // Simulate task execution (in real impl, this would call the model)
        const result = await this.executeTaskWork(task, modelSelection.config.tier, modelSelection.config.model);
        success = true;
        actualCost = result.cost;
        filesModified.push(...(result.filesModified ?? []));
        filesCreated.push(...(result.filesCreated ?? []));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Classify failure
        const classification = this.failureClassifier.classify(lastError, {
          taskId: task.id,
          taskType: task.type,
          stage: task.stage.toString(),
        });

        // Attempt recovery
        if (classification.type !== FailureType.DESIGN_ISSUE) {
          const recoveryResult = await this.attemptRecovery(
            task,
            lastError,
            classification.type,
            retryCount
          );

          if (recoveryResult.recovered) {
            // Retry with higher-tier model if needed
            if (recoveryResult.action === "RETRY" || recoveryResult.action === "FIX") {
              retryCount++;
              continue;
            }
          }
        }

        // If recovery failed or design issue, escalate
        if (classification.type === FailureType.DESIGN_ISSUE) {
          await this.createEscalation({
            severity: "critical",
            reason: `Design issue detected: ${lastError.message}`,
            taskId: task.id,
            blocking: !this.config.nonBlockingEscalation,
            suggestions: [
              "Review the task requirements",
              "Consult with architect",
              "Break down into smaller tasks",
            ],
          });
        }

        retryCount++;
      }
    }

    // Record cost
    if (actualCost > 0) {
      const callRecord: ModelCallRecord = {
        tier: modelSelection.config.tier,
        model: modelSelection.config.model,
        cost: actualCost,
        durationSeconds: (Date.now() - startTime) / 1000,
        inputTokens: 0, // Would be set by actual model call
        outputTokens: 0,
        timestamp: new Date().toISOString(),
      };
      const taskStage = stateToSDLCStage(task.stage);
      if (taskStage) callRecord.stage = taskStage;
      this.budget.recordCall(callRecord);
    }

    const durationMs = Date.now() - startTime;

    // Build result
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

    // Sprint 131 (Multica ADOPT 2): state → verifying (briefly, while recording result)
    this.transitionTaskState(task.id, "verifying");

    // Store result
    this.completedTasks.set(task.id, result);
    this.currentTask = null;

    // Emit event + final state transition
    if (success) {
      this.transitionTaskState(task.id, "completed");
      this.emitEvent("task_completed", {
        taskId: task.id,
        durationMs,
        cost: actualCost,
        filesModified: filesModified.length,
        filesCreated: filesCreated.length,
      });
    } else {
      this.transitionTaskState(task.id, "failed");
      this.emitEvent("task_failed", {
        taskId: task.id,
        durationMs,
        retryCount,
        error: lastError?.message,
      });
    }

    // OpenMythos #6 fix (CTO B1): update stability guard tracking fields.
    this.tasksSinceLastCheckpoint++;

    // Checkpoint after task if configured
    if (this.config.autoCheckpoint && success) {
      await this.resilience.createCheckpoint("milestone", `Task ${task.id} completed`);
      // Reset checkpoint tracking on successful checkpoint
      this.lastCheckpointAt = Date.now();
      this.tasksSinceLastCheckpoint = 0;
    }

    return result;
  }

  /**
   * Execute task work — wired to cloud providers (Sprint 124b, ADR-042).
   *
   * C1: Uses callCloudFallback directly with explicit model tier
   * C4: Gate B = READ only, PATCH tasks blocked
   */
  private async executeTaskWork(
    task: AutonomousTask,
    tier: ModelTier,
    modelId?: string,
  ): Promise<{ cost: number; output?: string; filesModified?: string[]; filesCreated?: string[] }> {
    // -------------------------------------------------------------------------
    // Sprint 132 M1 — Exec-Policy Hook (fires BEFORE Gate A/B/C)
    //
    // ADR-046 composition rule: exec-policy → Gate A/B/C → PATCH/risk gate → execute
    //
    // COARSE HOOK (CEO decision #2, 2026-04-11):
    //   task.type + task.description is used as the candidate-command proxy because
    //   executeTaskWork() does not emit Bash today — it calls callCloudFallback.
    //   When a fine-grained tool-use dispatcher lands, it must call checkCommand()
    //   directly per-invocation (not via this coarse hook).
    //   See: docs/02-design/14-Technical-Specs/M1-exec-policy-design.md §9.1
    // -------------------------------------------------------------------------
    const candidateCommand = `${task.type} ${task.description}`;
    const originChannel = this.config.originChannel ?? "cli";
    const execCtx = {
      sessionId: this.config.sessionId,
      taskId: task.id,
      agent: taskTypeToAgent(task.type),
      gate: this.config.gate,
      autoHandoff: process.env["ENDIORBOT_AUTO_HANDOFF"] === "true",
      originChannel,
    };
    const policyResult = checkCommand(candidateCommand, execCtx);

    if (policyResult.decision === "deny") {
      throw new Error(`exec-policy denied command: ${policyResult.reason}`);
    }

    if (policyResult.decision === "prompt") {
      // Resolve the prompt function: CLI → interactive, non-CLI → fail-closed (ADR-046 Amendment 1)
      const promptFn = this.config.promptFn ?? selectPromptFn(originChannel);
      const approved = await promptFn(
        `exec-policy requires CEO approval (preset: ${policyResult.reason})`,
        candidateCommand,
      );
      if (!approved) {
        throw new Error(`exec-policy denied command: CEO declined prompt for "${candidateCommand}"`);
      }
    }
    // policyResult.decision === "allow" → fall through to Gate A/B/C checks below

    // OpenMythos #6 fix (CTO B1): track risky ops for stability guard.
    // Any task that would require Gate C (PATCH capability) is a risky op.
    if (requiresGateC(task.type)) {
      this.riskyOpTimestamps.push(Date.now());
    }

    // C4: Gate B = READ only — block PATCH-requiring tasks
    if (requiresGateC(task.type)) {
      throw new Error(
        `Task type "${task.type}" requires Gate C (autonomous PATCH). Current session is Gate B (read-only).`
      );
    }

    // EFFICIENCY tasks — no agent call needed
    if (isEfficiencyTask(task.type)) {
      return { cost: 0, output: `EFFICIENCY task "${task.type}" completed (no agent call).` };
    }

    // Test-only: deterministic cost (no provider calls in test)
    if (process.env.NODE_ENV === "test" && !this.providerDeps) {
      const baseCost =
        tier === ModelTier.ELITE ? 0.15 : tier === ModelTier.STANDARD ? 0.03 : 0.005;
      return { cost: baseCost, output: `[test] Task "${task.description}" executed at tier ${tier}` };
    }

    // C1: Use callCloudFallback directly with explicit tier
    if (!this.providerDeps) {
      throw new Error(
        "Provider deps not injected. Pass ProviderDeps to AutonomousSessionManager constructor."
      );
    }

    const agent = taskTypeToAgent(task.type);
    const context = buildTaskContext(task, {
      sprintGoal: this.config.sprintGoal,
      projectRoot: this.config.projectRoot,
      tier: tier.toString(),
      completedTasks: this.completedTasks,
    });

    const result = await callCloudFallback(
      this.providerDeps,
      agent,
      context,
      [],
      this.config.projectRoot,
      modelId, // C1: Forward tier-selected model to provider
    );

    if (!result) {
      throw new Error(`No cloud provider available for agent @${agent}`);
    }

    const cost = result.tokenUsage
      ? estimateCostFromTokens(result.tokenUsage, tier.toString())
      : 0;

    return { cost, output: result.content };
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

  // ============================================================================
  // Escalation Management
  // ============================================================================

  /**
   * Create an escalation request.
   */
  private async createEscalation(
    params: Omit<EscalationRequest, "id" | "timestamp" | "context"> & { taskId?: string }
  ): Promise<string> {
    const escalation: EscalationRequest = {
      id: `esc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      context: {
        sessionId: this.config.sessionId,
        currentState: this.resilience.getStatus().state,
        budgetRemaining: this.budget.getRemaining(),
        taskId: params.taskId,
      },
      ...params,
    };

    this.escalations.push(escalation);
    if (escalation.blocking || !this.config.nonBlockingEscalation) {
      this.pendingEscalations.push(escalation);
    }

    this.emitEvent("escalation_created", {
      escalationId: escalation.id,
      severity: escalation.severity,
      reason: escalation.reason,
      blocking: escalation.blocking,
    });

    this.log.warn("Escalation created", {
      escalationId: escalation.id,
      severity: escalation.severity,
      reason: escalation.reason,
    });

    return escalation.id;
  }

  /**
   * Resolve an escalation.
   */
  resolveEscalation(response: EscalationResponse): void {
    this.pendingEscalations = this.pendingEscalations.filter(
      (e) => e.id !== response.escalationId
    );

    this.emitEvent("escalation_resolved", {
      escalationId: response.escalationId,
      action: response.action,
    });

    this.log.info("Escalation resolved", {
      escalationId: response.escalationId,
      action: response.action,
    });
  }

  // ============================================================================
  // Budget Handlers
  // ============================================================================

  private handleBudgetWarning(details: Record<string, unknown>): void {
    this.emitEvent("budget_warning", details);

    if (this.config.conservativeFallback) {
      this.log.info("Budget warning - switching to conservative mode");
      // Prefer cheaper models for remaining tasks
    }
  }

  private handleBudgetExceeded(details: Record<string, unknown>): void {
    this.emitEvent("budget_exceeded", details);

    this.createEscalation({
      severity: "critical",
      reason: `Budget exceeded: spent $${(details.spent as number).toFixed(2)} of $${details.budget}`,
      blocking: true,
      suggestions: ["Review spending", "Increase budget", "Complete essential tasks only"],
    });
  }

  private handleOpusCapReached(details: Record<string, unknown>): void {
    this.log.info("Opus cap reached, downgrading to Sonnet", details);
    // Model selector will automatically downgrade
  }

  // ============================================================================
  // Status
  // ============================================================================

  /**
   * Get current session status.
   */
  getStatus(): AutonomousSessionStatus {
    const resilienceStatus = this.resilience.getStatus();
    const remaining = this.budget.getRemaining();
    const opusSpending = this.budget.getTierSpending(ModelTier.ELITE);

    const status: AutonomousSessionStatus = {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
      state: resilienceStatus.state,
      autonomyLevel: AUTONOMY_GATE_CONFIG[this.config.gate].level,
      gate: this.config.gate,
      durationMs: Date.now() - this.startTime.getTime(),
      tasksCompleted: Array.from(this.completedTasks.values()).filter((t) => t.success).length,
      tasksFailed: Array.from(this.completedTasks.values()).filter((t) => !t.success).length,
      tasksPending: this.taskQueue.length,
      budgetSpent: this.budget.getTotalSpent(),
      budgetRemaining: remaining.total,
      opusTimeUsed: opusSpending.seconds / 60,
      escalationCount: this.escalations.length,
      pendingEscalations: this.pendingEscalations,
      isActive: this.isRunning && !this.isPaused,
      lastActivity: new Date().toISOString(),
    };
    if (this.currentTask) status.currentTaskId = this.currentTask.id;
    return status;
  }

  /**
   * Get completed task results.
   */
  getCompletedTasks(): TaskExecutionResult[] {
    return Array.from(this.completedTasks.values());
  }

  /**
   * Get pending tasks.
   */
  getPendingTasks(): AutonomousTask[] {
    return [...this.taskQueue];
  }

  /**
   * Get decisions made.
   */
  getDecisions(): DecisionPoint[] {
    return [...this.decisions];
  }

  /**
   * Get escalation history.
   */
  getEscalations(): EscalationRequest[] {
    return [...this.escalations];
  }

  /**
   * Get model selector.
   */
  getModelSelector(): ModelSelector {
    return this.modelSelector;
  }

  /**
   * Get session budget.
   */
  getBudget(): SessionBudget {
    return this.budget;
  }

  /**
   * Get resilience manager.
   */
  getResilienceManager(): SessionResilienceManager {
    return this.resilience;
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Add event listener.
   */
  addEventListener(listener: AutonomousEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener.
   */
  removeEventListener(listener: AutonomousEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Set context lifecycle manager for T3 cross-session context.
   * Sprint 97: Additive hook — does not restructure runLoop() (CTO F5).
   */
  setContextLifecycle(lifecycle: ContextLifecycleManager): void {
    this.contextLifecycle = lifecycle;
  }

  /**
   * Sprint 131 (Multica ADOPT 2): Transition a task to a new state and emit event.
   *
   * CTO C3: Read-only visibility — this updates from existing execution flow only,
   * never auto-progresses tasks. The state map is a projection, not a scheduler.
   */
  private transitionTaskState(taskId: string, to: SubtaskStatus): void {
    const from = this.taskStates.get(taskId) ?? "pending";
    if (from === to) return;
    this.taskStates.set(taskId, to);
    this.emitEvent("task_state_changed", {
      taskId,
      from,
      to,
    });
  }

  /**
   * Sprint 131: Get current state of a task (for /status display).
   */
  getTaskState(taskId: string): SubtaskStatus | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * Sprint 131: Get all task states (snapshot for UI).
   */
  getAllTaskStates(): ReadonlyMap<string, SubtaskStatus> {
    return new Map(this.taskStates);
  }

  /**
   * Emit event.
   */
  private emitEvent(
    type: AutonomousEvent["type"],
    data: Record<string, unknown>
  ): void {
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

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `auto-${timestamp}-${random}`;
  }

  /**
   * Check if budget is available.
   */
  private checkBudgetAvailable(): boolean {
    const remaining = this.budget.getRemaining();
    return remaining.total > 0;
  }

  /**
   * Check if time limit is reached.
   */
  private isTimeLimitReached(): boolean {
    const elapsed = Date.now() - this.startTime.getTime();
    const maxDuration = AUTONOMY_GATE_CONFIG[this.config.gate].maxDurationMs;
    return elapsed >= maxDuration;
  }

  /**
   * Record a decision point.
   */
  private recordDecision(
    params: Omit<DecisionPoint, "id" | "timestamp">
  ): void {
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
