/**
 * Multi-Agent Dispatcher
 *
 * Orchestrates multi-agent execution: sequential, parallel, or mixed.
 * Enforces Gate B budget (30 min, $2.00).
 * CTO F4: Uses Promise.allSettled() for parallel execution.
 *
 * @module autonomy/multi-agent-dispatcher
 * @version 1.0.0
 * @authority Sprint 95 Plan (Phase 5)
 * @sprint 95
 */

import type { ChannelRouter, AIResult } from "../agents/channel-router.js";
import type {
  GoalDecomposition,
  Subtask,
  SubtaskResult,
  AggregatedResponse,
  MultiAgentConfig,
  DispatchEvent,
} from "./types.js";
import { DEFAULT_T2_CONFIG } from "./types.js";
import { SessionRelay } from "./session-relay.js";
import { ResponseAggregator } from "./response-aggregator.js";

// ============================================================================
// Cost Estimation (CTO F2)
// ============================================================================

/** Cost per second per provider (rough estimates) */
const PROVIDER_COST_PER_SEC: Record<string, number> = {
  "claude-bridge": 0.005,
  "claude-api": 0.010,
  "gemini-api": 0.003,
  "openai-api": 0.008,
  "ollama": 0.001,
};
const DEFAULT_COST_PER_SEC = 0.005;

function estimateCost(durationMs: number, provider: string): number {
  const rate = PROVIDER_COST_PER_SEC[provider] ?? DEFAULT_COST_PER_SEC;
  return (durationMs / 1000) * rate;
}

// ============================================================================
// MultiAgentDispatcher
// ============================================================================

/**
 * Hook called after goal completion to extract context for cross-session transfer.
 * Sprint 96: fire-and-forget pattern with .catch() (CTO F2).
 */
export type ContextExtractHook = (
  goalId: string,
  results: SubtaskResult[],
) => Promise<void>;

export class MultiAgentDispatcher {
  private readonly config: MultiAgentConfig;
  private readonly relay: SessionRelay;
  private readonly aggregator: ResponseAggregator;
  private readonly listeners: Array<(event: DispatchEvent) => void>;
  private contextExtractHook: ContextExtractHook | undefined;

  constructor(config?: Partial<MultiAgentConfig>) {
    const merged: MultiAgentConfig = { ...DEFAULT_T2_CONFIG };
    if (config) {
      if (config.maxAgents !== undefined) merged.maxAgents = config.maxAgents;
      if (config.maxParallelTracks !== undefined) merged.maxParallelTracks = config.maxParallelTracks;
      if (config.timeoutMs !== undefined) merged.timeoutMs = config.timeoutMs;
      if (config.costLimitUsd !== undefined) merged.costLimitUsd = config.costLimitUsd;
      if (config.perSubtaskTimeoutMs !== undefined) merged.perSubtaskTimeoutMs = config.perSubtaskTimeoutMs;
      if (config.defaultStrategy !== undefined) merged.defaultStrategy = config.defaultStrategy;
    }
    this.config = merged;
    this.relay = new SessionRelay();
    this.aggregator = new ResponseAggregator();
    this.listeners = [];
  }

  /**
   * Register an event listener for dispatch events.
   */
  onEvent(listener: (event: DispatchEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Set a hook for cross-session context extraction (Sprint 96).
   * Called after goal completion. Fire-and-forget with .catch() (CTO F2).
   */
  setContextExtractHook(hook: ContextExtractHook): void {
    this.contextExtractHook = hook;
  }

  /**
   * Dispatch a goal decomposition through the multi-agent pipeline.
   */
  async dispatch(
    decomposition: GoalDecomposition,
    router: ChannelRouter,
  ): Promise<AggregatedResponse> {
    const relayCtx = this.relay.createRelay(
      decomposition.goalId,
      `session-${Date.now()}`,
    );
    const startTime = Date.now();
    let totalCost = 0;
    const results: SubtaskResult[] = [];

    switch (decomposition.strategy) {
      case "sequential":
        for (const subtask of decomposition.subtasks) {
          // Budget check
          if (totalCost >= this.config.costLimitUsd) {
            this.emit("budget:exceeded", decomposition.goalId, subtask.id, subtask.agent, "Cost limit exceeded");
            results.push(this.skippedResult(subtask, "Budget exceeded"));
            continue;
          }
          // Timeout check
          if (Date.now() - startTime > this.config.timeoutMs) {
            this.emit("subtask:skipped", decomposition.goalId, subtask.id, subtask.agent, "Timeout exceeded");
            results.push(this.skippedResult(subtask, "Timeout exceeded"));
            continue;
          }

          const context = this.relay.buildAgentContext(relayCtx, subtask.agent);
          const result = await this.executeSubtask(subtask, router, context);
          results.push(result);
          totalCost += result.estimatedCostUsd;

          if (result.success) {
            this.relay.recordSubtaskResult(relayCtx, result);
          }
        }
        break;

      case "parallel":
        // CTO F4: Promise.allSettled for error isolation
        results.push(...await this.executeParallel(decomposition.subtasks, router));
        break;

      case "mixed":
        // Group by dependency: no-deps → parallel, with-deps → sequential after deps
        results.push(...await this.executeMixed(decomposition, router, relayCtx));
        break;
    }

    this.emit("dispatch:complete", decomposition.goalId, undefined, undefined,
      `Completed ${results.filter((r) => r.success).length}/${results.length} subtasks`);

    // Sprint 96: Fire-and-forget context extraction (CTO F2: .catch() prevents unhandled rejection)
    if (this.contextExtractHook) {
      void this.contextExtractHook(decomposition.goalId, results).catch(() => {
        // Silently ignore extraction errors — non-critical path
      });
    }

    return this.aggregator.aggregate(results);
  }

  // --------------------------------------------------------------------------
  // Private: Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a single subtask with timeout.
   */
  private async executeSubtask(
    subtask: Subtask,
    router: ChannelRouter,
    context?: string,
  ): Promise<SubtaskResult> {
    this.emit("subtask:start", subtask.id, subtask.id, subtask.agent, `Starting @${subtask.agent}`);

    const taskWithContext = context
      ? `${context}\n\nTask: ${subtask.description}`
      : subtask.description;

    const start = Date.now();
    try {
      const aiResult = await Promise.race<AIResult>([
        router.callAI(subtask.agent, taskWithContext),
        this.timeoutPromise(this.config.perSubtaskTimeoutMs),
      ]);

      const durationMs = Date.now() - start;
      const costUsd = estimateCost(durationMs, aiResult.provider);

      this.emit("subtask:complete", subtask.id, subtask.id, subtask.agent,
        `@${subtask.agent} completed in ${durationMs}ms`);

      return {
        subtaskId: subtask.id,
        agent: subtask.agent,
        success: true,
        output: aiResult.content,
        durationMs,
        estimatedCostUsd: costUsd,
        provider: aiResult.provider,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      this.emit("subtask:failed", subtask.id, subtask.id, subtask.agent, message);

      return {
        subtaskId: subtask.id,
        agent: subtask.agent,
        success: false,
        output: "",
        durationMs,
        estimatedCostUsd: estimateCost(durationMs, "unknown"),
        error: message,
      };
    }
  }

  /**
   * Execute subtasks in parallel using Promise.allSettled (CTO F4).
   */
  private async executeParallel(
    subtasks: Subtask[],
    router: ChannelRouter,
  ): Promise<SubtaskResult[]> {
    const promises = subtasks.map((subtask) =>
      this.executeSubtask(subtask, router),
    );

    // CTO F4: allSettled prevents cascading failures
    const settled = await Promise.allSettled(promises);

    return settled.map((outcome, i) => {
      if (outcome.status === "fulfilled") {
        return outcome.value;
      }
      // Should not happen since executeSubtask catches internally, but safety net
      return {
        subtaskId: subtasks[i]!.id,
        agent: subtasks[i]!.agent,
        success: false,
        output: "",
        durationMs: 0,
        estimatedCostUsd: 0,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      };
    });
  }

  /**
   * Execute mixed strategy: parallel for independent, sequential for dependent.
   */
  private async executeMixed(
    decomposition: GoalDecomposition,
    router: ChannelRouter,
    relayCtx: ReturnType<SessionRelay["createRelay"]>,
  ): Promise<SubtaskResult[]> {
    const results: SubtaskResult[] = [];
    const completed = new Set<string>();

    // Group subtasks by whether they have unmet dependencies
    const remaining = [...decomposition.subtasks];

    while (remaining.length > 0) {
      // Find all subtasks whose dependencies are met
      const ready = remaining.filter((s) =>
        s.dependencies.every((dep) => completed.has(dep)),
      );

      if (ready.length === 0) {
        // All remaining have unmet deps — skip them
        for (const s of remaining) {
          results.push(this.skippedResult(s, "Unmet dependencies"));
        }
        break;
      }

      // Execute ready subtasks in parallel
      if (ready.length === 1) {
        const subtask = ready[0]!;
        const context = this.relay.buildAgentContext(relayCtx, subtask.agent);
        const result = await this.executeSubtask(subtask, router, context);
        results.push(result);
        if (result.success) {
          this.relay.recordSubtaskResult(relayCtx, result);
          completed.add(subtask.id);
        }
      } else {
        const parallel = await this.executeParallel(ready, router);
        for (const result of parallel) {
          results.push(result);
          if (result.success) {
            this.relay.recordSubtaskResult(relayCtx, result);
            completed.add(result.subtaskId);
          }
        }
      }

      // Remove executed subtasks from remaining
      const readyIds = new Set(ready.map((s) => s.id));
      remaining.splice(0, remaining.length, ...remaining.filter((s) => !readyIds.has(s.id)));
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  private skippedResult(subtask: Subtask, reason: string): SubtaskResult {
    return {
      subtaskId: subtask.id,
      agent: subtask.agent,
      success: false,
      output: "",
      durationMs: 0,
      estimatedCostUsd: 0,
      error: reason,
    };
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Subtask timeout")), ms),
    );
  }

  private emit(
    type: DispatchEvent["type"],
    goalId: string,
    subtaskId: string | undefined,
    agent: string | undefined,
    message: string,
  ): void {
    const event: DispatchEvent = {
      type,
      goalId,
      message,
      timestamp: new Date().toISOString(),
    };
    if (subtaskId) event.subtaskId = subtaskId;
    if (agent) event.agent = agent;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
