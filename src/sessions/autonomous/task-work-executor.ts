/**
 * Task Work Executor
 *
 * Low-level execution of a single task unit: exec-policy check, gate
 * enforcement, provider dispatch, and pattern-hint injection.
 *
 * Extracted from AutonomousSessionManager.executeTaskWork to keep
 * manager.ts below 900 lines.
 *
 * @module sessions/autonomous/task-work-executor
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { ModelTier } from "../../models/types.js";
import type { AutonomousTask, TaskExecutionResult, AutonomousSessionConfig, OriginChannel } from "./types.js";
import {
  taskTypeToAgent,
  isEfficiencyTask,
  requiresGateC,
  buildTaskContext,
  estimateCostFromTokens,
} from "./task-agent-mapper.js";
import { callCloudFallback, type ProviderDeps } from "../../agents/router/providers.js";
import { checkCommand } from "../../security/exec-approvals/check.js";
import { selectPromptFn } from "../../security/exec-approvals/prompt.js";

// ============================================================================
// Types
// ============================================================================

/** All mutable fields that executeTaskWork reads from the manager. */
export interface TaskWorkContext {
  sessionId: string;
  gate: Required<AutonomousSessionConfig>["gate"];
  originChannel: OriginChannel;
  sprintGoal?: string;
  projectRoot: string;
  promptFn: Required<AutonomousSessionConfig>["promptFn"] | undefined;
  providerDeps: ProviderDeps | undefined;
  completedTasks: ReadonlyMap<string, TaskExecutionResult>;
  /** Consumed and reset to null after first use. */
  pendingPatternHint: string | null;
}

export interface TaskWorkResult {
  cost: number;
  output?: string;
  filesModified?: string[];
  filesCreated?: string[];
  /** Updated pendingPatternHint (null = consumed). */
  pendingPatternHint: string | null;
  /** True if a risky op timestamp should be recorded by the caller. */
  recordedRiskyOp: boolean;
}

// ============================================================================
// TaskWorkExecutor
// ============================================================================

/**
 * Stateless executor for a single task unit.
 *
 * The caller (AutonomousSessionManager) passes all needed context in and
 * receives an updated context fragment back (pattern hint, risky op flag).
 */
export class TaskWorkExecutor {
  private readonly log: Logger;

  constructor() {
    this.log = createLogger("TaskWorkExecutor");
  }

  /**
   * Execute task work — exec-policy → gate check → provider dispatch.
   *
   * Sprint 132 M1: exec-policy hook fires BEFORE Gate A/B/C.
   * Sprint 124b: uses callCloudFallback with explicit model tier.
   * Sprint 143 A1: injects Brain L2 pattern hint into retry prompt.
   */
  async execute(
    task: AutonomousTask,
    tier: ModelTier,
    ctx: TaskWorkContext,
    modelId?: string,
  ): Promise<TaskWorkResult> {
    let pendingPatternHint = ctx.pendingPatternHint;
    let recordedRiskyOp = false;

    // -------------------------------------------------------------------------
    // Sprint 132 M1 — Exec-Policy Hook (fires BEFORE Gate A/B/C)
    // -------------------------------------------------------------------------
    const candidateCommand = `${task.type} ${task.description}`;
    const originChannel = ctx.originChannel;
    const execCtx = {
      sessionId: ctx.sessionId,
      taskId: task.id,
      agent: taskTypeToAgent(task.type),
      gate: ctx.gate,
      autoHandoff: process.env["ENDIORBOT_AUTO_HANDOFF"] === "true",
      originChannel,
    };
    const policyResult = checkCommand(candidateCommand, execCtx);

    if (policyResult.decision === "deny") {
      throw new Error(`exec-policy denied command: ${policyResult.reason}`);
    }

    if (policyResult.decision === "prompt") {
      const promptFn = ctx.promptFn ?? selectPromptFn(originChannel);
      const approved = await promptFn(
        `exec-policy requires CEO approval (preset: ${policyResult.reason})`,
        candidateCommand,
      );
      if (!approved) {
        throw new Error(`exec-policy denied command: CEO declined prompt for "${candidateCommand}"`);
      }
    }

    // OpenMythos #6: track risky ops for stability guard
    if (requiresGateC(task.type)) {
      recordedRiskyOp = true;
    }

    // C4: Gate B = READ only — block PATCH-requiring tasks
    if (requiresGateC(task.type)) {
      throw new Error(
        `Task type "${task.type}" requires Gate C (autonomous PATCH). Current session is Gate B (read-only).`,
      );
    }

    // EFFICIENCY tasks — no agent call needed
    if (isEfficiencyTask(task.type)) {
      return {
        cost: 0,
        output: `EFFICIENCY task "${task.type}" completed (no agent call).`,
        pendingPatternHint: null,
        recordedRiskyOp,
      };
    }

    // Test-only: deterministic cost (no provider calls in test)
    if (process.env.NODE_ENV === "test" && !ctx.providerDeps) {
      const baseCost =
        tier === ModelTier.ELITE ? 0.15 : tier === ModelTier.STANDARD ? 0.03 : 0.005;
      return {
        cost: baseCost,
        output: `[test] Task "${task.description}" executed at tier ${tier}`,
        pendingPatternHint: null,
        recordedRiskyOp,
      };
    }

    if (!ctx.providerDeps) {
      throw new Error(
        "Provider deps not injected. Pass ProviderDeps to AutonomousSessionManager constructor.",
      );
    }

    const agent = taskTypeToAgent(task.type);
    const taskCtxOpts: { sprintGoal?: string; projectRoot?: string; tier?: string; completedTasks?: Map<string, TaskExecutionResult> } = {
      projectRoot: ctx.projectRoot,
      tier: tier.toString(),
      completedTasks: ctx.completedTasks as Map<string, TaskExecutionResult>,
    };
    if (ctx.sprintGoal) taskCtxOpts.sprintGoal = ctx.sprintGoal;
    let context = buildTaskContext(task, taskCtxOpts);

    // Sprint 143 A1: Inject Brain L2 pattern hint into retry prompt
    if (pendingPatternHint) {
      context = `${context}\n\n${pendingPatternHint}`;
      this.log.info("Brain L2 pattern hint injected into retry prompt", {
        taskId: task.id,
        hint: pendingPatternHint.slice(0, 100),
      });
      pendingPatternHint = null; // consumed
    }

    const result = await callCloudFallback(
      ctx.providerDeps,
      agent,
      context,
      [],
      ctx.projectRoot,
      modelId,
    );

    if (!result) {
      throw new Error(`No cloud provider available for agent @${agent}`);
    }

    const cost = result.tokenUsage
      ? estimateCostFromTokens(result.tokenUsage, tier.toString())
      : 0;

    return { cost, output: result.content, pendingPatternHint, recordedRiskyOp };
  }
}
