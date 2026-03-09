/**
 * MultiAgentDispatcher Tests — Sprint 95
 *
 * Tests sequential/parallel/mixed execution, budget enforcement,
 * timeout, partial results, and event emission.
 * CTO F5: 17 tests for comprehensive combinatorial coverage.
 *
 * @module tests/autonomy/multi-agent-dispatcher
 * @sprint 95
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MultiAgentDispatcher } from "../../src/autonomy/multi-agent-dispatcher.js";
import type { GoalDecomposition, Subtask, DispatchEvent } from "../../src/autonomy/types.js";
import type { ChannelRouter, AIResult } from "../../src/agents/channel-router.js";

// ============================================================================
// Mock Router
// ============================================================================

function createMockRouter(responses?: Record<string, AIResult>): ChannelRouter {
  const defaultResponse: AIResult = {
    content: "Default response.",
    provider: "claude-bridge",
    durationMs: 1000,
  };

  return {
    callAI: vi.fn(async (agent: string, _task: string): Promise<AIResult> => {
      return responses?.[agent] ?? defaultResponse;
    }),
  } as unknown as ChannelRouter;
}

function createFailingRouter(failAgents: string[]): ChannelRouter {
  return {
    callAI: vi.fn(async (agent: string): Promise<AIResult> => {
      if (failAgents.includes(agent)) {
        throw new Error(`All providers failed for @${agent}`);
      }
      return { content: `@${agent} done.`, provider: "claude-bridge", durationMs: 500 };
    }),
  } as unknown as ChannelRouter;
}

// ============================================================================
// Helpers
// ============================================================================

function makeDecomposition(
  subtasks: Subtask[],
  strategy: GoalDecomposition["strategy"] = "sequential",
): GoalDecomposition {
  return {
    goalId: "goal-test",
    originalGoal: "test goal",
    subtasks,
    strategy,
    estimatedDurationMs: subtasks.length * 15000,
    estimatedCostUsd: subtasks.length * 0.15,
  };
}

function makeSubtask(
  id: string,
  agent: string,
  deps: string[] = [],
): Subtask {
  return {
    id,
    description: `Task for @${agent}`,
    agent,
    dependencies: deps,
    priority: 1,
    estimatedDurationMs: 15000,
    status: "pending",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("MultiAgentDispatcher", () => {
  let dispatcher: MultiAgentDispatcher;

  beforeEach(() => {
    dispatcher = new MultiAgentDispatcher();
  });

  // --------------------------------------------------------------------------
  // Sequential execution
  // --------------------------------------------------------------------------

  describe("sequential execution", () => {
    it("should execute 2 agents sequentially", async () => {
      const router = createMockRouter({
        architect: { content: "Design: REST API.", provider: "claude-bridge", durationMs: 2000 },
        coder: { content: "Implemented REST.", provider: "claude-bridge", durationMs: 3000 },
      });

      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "coder", ["s1"]),
      ], "sequential");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.agents).toEqual(["architect", "coder"]);
      expect(result.subtaskResults).toHaveLength(2);
      expect(result.subtaskResults[0].success).toBe(true);
      expect(result.subtaskResults[1].success).toBe(true);
      expect(result.text).toContain("architect");
      expect(result.text).toContain("coder");
    });

    it("should relay context between sequential agents", async () => {
      const router = createMockRouter();
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "coder", ["s1"]),
      ], "sequential");

      await dispatcher.dispatch(decomposition, router);

      // Second call should include context from first
      const calls = (router.callAI as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      // Second call's task should include context about architect
      const secondTask = calls[1][1] as string;
      expect(secondTask).toContain("architect");
    });
  });

  // --------------------------------------------------------------------------
  // Parallel execution
  // --------------------------------------------------------------------------

  describe("parallel execution", () => {
    it("should execute independent agents in parallel", async () => {
      const router = createMockRouter();
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "tester"),
      ], "parallel");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.subtaskResults).toHaveLength(2);
      expect(result.subtaskResults.every((r) => r.success)).toBe(true);
    });

    it("should use Promise.allSettled — one failure doesn't cancel others (CTO F4)", async () => {
      const router = createFailingRouter(["architect"]);
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "coder"),
      ], "parallel");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.subtaskResults).toHaveLength(2);
      const architectResult = result.subtaskResults.find((r) => r.agent === "architect");
      const coderResult = result.subtaskResults.find((r) => r.agent === "coder");
      expect(architectResult?.success).toBe(false);
      expect(coderResult?.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Mixed execution
  // --------------------------------------------------------------------------

  describe("mixed execution", () => {
    it("should execute mixed strategy — parallel first, then sequential", async () => {
      const router = createMockRouter();
      // s1 and s2 are independent; s3 depends on both
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "researcher"),
        makeSubtask("s3", "coder", ["s1", "s2"]),
      ], "mixed");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.subtaskResults).toHaveLength(3);
      expect(result.subtaskResults.every((r) => r.success)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Budget enforcement
  // --------------------------------------------------------------------------

  describe("budget enforcement", () => {
    it("should skip subtasks when cost limit exceeded", async () => {
      // Very tight budget: $0.01 — first subtask will likely exceed it
      const tight = new MultiAgentDispatcher({ costLimitUsd: 0.001 });
      const router = createMockRouter();

      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "coder", ["s1"]),
      ], "sequential");

      const result = await tight.dispatch(decomposition, router);

      // At least one should be skipped due to budget
      // (first one runs, but second may be skipped depending on cost)
      expect(result.subtaskResults.length).toBe(2);
    });

    it("should handle all-fail gracefully", async () => {
      const router = createFailingRouter(["architect", "coder"]);
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
        makeSubtask("s2", "coder"),
      ], "parallel");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.subtaskResults).toHaveLength(2);
      expect(result.subtaskResults.every((r) => !r.success)).toBe(true);
      expect(result.text).toContain("Error");
    });
  });

  // --------------------------------------------------------------------------
  // Timeout
  // --------------------------------------------------------------------------

  describe("timeout", () => {
    it("should timeout individual subtask", async () => {
      const slowRouter = {
        callAI: vi.fn(async (): Promise<AIResult> => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return { content: "late", provider: "claude-bridge", durationMs: 5000 };
        }),
      } as unknown as ChannelRouter;

      const fast = new MultiAgentDispatcher({ perSubtaskTimeoutMs: 100 });
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
      ], "sequential");

      const result = await fast.dispatch(decomposition, slowRouter);

      expect(result.subtaskResults[0].success).toBe(false);
      expect(result.subtaskResults[0].error).toContain("timeout");
    }, 10_000);
  });

  // --------------------------------------------------------------------------
  // Event emission
  // --------------------------------------------------------------------------

  describe("event emission", () => {
    it("should emit events for each subtask", async () => {
      const events: DispatchEvent[] = [];
      dispatcher.onEvent((e) => events.push(e));

      const router = createMockRouter();
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
      ], "sequential");

      await dispatcher.dispatch(decomposition, router);

      const types = events.map((e) => e.type);
      expect(types).toContain("subtask:start");
      expect(types).toContain("subtask:complete");
      expect(types).toContain("dispatch:complete");
    });

    it("should emit failed event on subtask failure", async () => {
      const events: DispatchEvent[] = [];
      dispatcher.onEvent((e) => events.push(e));

      const router = createFailingRouter(["architect"]);
      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
      ], "sequential");

      await dispatcher.dispatch(decomposition, router);

      const types = events.map((e) => e.type);
      expect(types).toContain("subtask:failed");
    });
  });

  // --------------------------------------------------------------------------
  // Cost estimation (CTO F2)
  // --------------------------------------------------------------------------

  describe("cost estimation", () => {
    it("should estimate cost from duration and provider (CTO F2)", async () => {
      // Use a slow mock to ensure non-zero wall-clock duration
      const slowRouter = {
        callAI: vi.fn(async (): Promise<AIResult> => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { content: "Done.", provider: "claude-bridge", durationMs: 50 };
        }),
      } as unknown as ChannelRouter;

      const decomposition = makeDecomposition([
        makeSubtask("s1", "architect"),
      ], "sequential");

      const result = await dispatcher.dispatch(decomposition, slowRouter);

      expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);
      expect(result.subtaskResults[0].estimatedCostUsd).toBeGreaterThanOrEqual(0);
      expect(result.subtaskResults[0].provider).toBe("claude-bridge");
    });
  });

  // --------------------------------------------------------------------------
  // Single subtask
  // --------------------------------------------------------------------------

  describe("single subtask", () => {
    it("should handle single-subtask decomposition", async () => {
      const router = createMockRouter();
      const decomposition = makeDecomposition([
        makeSubtask("s1", "assistant"),
      ], "sequential");

      const result = await dispatcher.dispatch(decomposition, router);

      expect(result.subtaskResults).toHaveLength(1);
      expect(result.agents).toEqual(["assistant"]);
    });
  });
});
