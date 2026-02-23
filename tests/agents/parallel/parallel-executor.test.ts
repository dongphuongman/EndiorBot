/**
 * Parallel Executor Tests
 *
 * @module tests/agents/parallel/parallel-executor
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ParallelExecutor,
  createParallelExecutor,
  createNoOpExecutor,
  executeTasksInParallel,
  type TaskExecutor,
} from "../../../src/agents/parallel/parallel-executor.js";
import type { ParallelTask } from "../../../src/agents/types.js";

describe("ParallelExecutor", () => {
  const mockExecutor: TaskExecutor = vi.fn(async (task) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { taskId: task.id, executed: true };
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("should execute single task", async () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "test query",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.totalTasks).toBe(1);
      expect(result.completedTasks).toBe(1);
      expect(result.failedTasks).toBe(0);
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it("should execute independent tasks in parallel", async () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "query 1",
        },
        {
          id: "task-2",
          name: "Task 2",
          type: "code_gen",
          complexity: "simple",
          query: "query 2",
        },
        {
          id: "task-3",
          name: "Task 3",
          type: "code_gen",
          complexity: "simple",
          query: "query 3",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(3);
      expect(result.batches.length).toBe(1); // All in one batch (independent)
    });

    it("should respect dependencies", async () => {
      const executionOrder: string[] = [];
      const trackingExecutor: TaskExecutor = async (task) => {
        executionOrder.push(task.id);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { taskId: task.id };
      };

      const executor = createParallelExecutor(trackingExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "first",
          name: "First",
          type: "code_gen",
          complexity: "simple",
          query: "first",
        },
        {
          id: "second",
          name: "Second",
          type: "code_gen",
          complexity: "simple",
          query: "second",
          dependsOn: ["first"],
        },
      ];

      await executor.execute(tasks);

      // First should complete before second starts
      expect(executionOrder.indexOf("first")).toBeLessThan(
        executionOrder.indexOf("second")
      );
    });

    it("should handle task failures", async () => {
      const failingExecutor: TaskExecutor = async (task) => {
        if (task.id === "fail") {
          throw new Error("Task failed intentionally");
        }
        return { taskId: task.id };
      };

      const executor = createParallelExecutor(failingExecutor, {
        continueOnError: true,
      });

      const tasks: ParallelTask[] = [
        {
          id: "success",
          name: "Success",
          type: "code_gen",
          complexity: "simple",
          query: "success",
        },
        {
          id: "fail",
          name: "Fail",
          type: "code_gen",
          complexity: "simple",
          query: "fail",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.completedTasks).toBe(1);
      expect(result.failedTasks).toBe(1);

      const failResult = result.taskResults.get("fail");
      expect(failResult?.status).toBe("failed");
      expect(failResult?.error).toContain("intentionally");
    });

    it("should stop on error when continueOnError is false", async () => {
      const failingExecutor: TaskExecutor = async (task) => {
        if (task.id === "fail") {
          throw new Error("Task failed");
        }
        return { taskId: task.id };
      };

      const executor = createParallelExecutor(failingExecutor, {
        continueOnError: false,
      });

      const tasks: ParallelTask[] = [
        {
          id: "first",
          name: "First",
          type: "code_gen",
          complexity: "simple",
          query: "first",
        },
        {
          id: "fail",
          name: "Fail",
          type: "code_gen",
          complexity: "simple",
          query: "fail",
          dependsOn: ["first"],
        },
        {
          id: "third",
          name: "Third",
          type: "code_gen",
          complexity: "simple",
          query: "third",
          dependsOn: ["fail"],
        },
      ];

      const result = await executor.execute(tasks);

      // Third should not execute
      expect(result.taskResults.has("third")).toBe(false);
    });

    it("should report batch statistics", async () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "a",
          name: "A",
          type: "code_gen",
          complexity: "simple",
          query: "a",
        },
        {
          id: "b",
          name: "B",
          type: "code_gen",
          complexity: "simple",
          query: "b",
          dependsOn: ["a"],
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.batches.length).toBe(2);
      expect(result.batches[0]!.taskCount).toBe(1);
      expect(result.batches[1]!.taskCount).toBe(1);
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it("should fire events", async () => {
      const onTaskStart = vi.fn();
      const onTaskComplete = vi.fn();
      const onBatchStart = vi.fn();
      const onBatchComplete = vi.fn();
      const onExecutionComplete = vi.fn();

      const executor = createParallelExecutor(
        mockExecutor,
        {},
        {
          onTaskStart,
          onTaskComplete,
          onBatchStart,
          onBatchComplete,
          onExecutionComplete,
        }
      );

      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "query",
        },
      ];

      await executor.execute(tasks);

      expect(onTaskStart).toHaveBeenCalledTimes(1);
      expect(onTaskComplete).toHaveBeenCalledTimes(1);
      expect(onBatchStart).toHaveBeenCalledTimes(1);
      expect(onBatchComplete).toHaveBeenCalledTimes(1);
      expect(onExecutionComplete).toHaveBeenCalledTimes(1);
    });

    it("should handle circular dependencies", async () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "a",
          name: "A",
          type: "code_gen",
          complexity: "simple",
          query: "a",
          dependsOn: ["b"],
        },
        {
          id: "b",
          name: "B",
          type: "code_gen",
          complexity: "simple",
          query: "b",
          dependsOn: ["a"],
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.completedTasks).toBe(0);
      expect(result.batches.length).toBe(0);
    });
  });

  describe("dry run", () => {
    it("should not execute tasks in dry run mode", async () => {
      const executor = createParallelExecutor(mockExecutor, { dryRun: true });
      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "query",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.completedTasks).toBe(1);
      expect(mockExecutor).not.toHaveBeenCalled();

      const taskResult = result.taskResults.get("task-1");
      expect(taskResult?.result).toEqual({ dryRun: true });
    });

    it("should generate dry run plan", () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "a",
          name: "A",
          type: "code_gen",
          complexity: "simple",
          query: "a",
        },
        {
          id: "b",
          name: "B",
          type: "code_gen",
          complexity: "simple",
          query: "b",
          dependsOn: ["a"],
        },
      ];

      const plan = executor.getDryRunPlan(tasks);

      expect(plan).toContain("batch");
      expect(plan).toContain("a");
      expect(plan).toContain("b");
    });
  });

  describe("file locking", () => {
    it("should acquire and release locks for file operations", async () => {
      const executor = createParallelExecutor(mockExecutor);
      const tasks: ParallelTask[] = [
        {
          id: "reader",
          name: "Reader",
          type: "code_gen",
          complexity: "simple",
          query: "read",
          reads: ["/src/file.ts"],
        },
        {
          id: "writer",
          name: "Writer",
          type: "code_gen",
          complexity: "simple",
          query: "write",
          writes: ["/src/output.ts"],
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.completedTasks).toBe(2);

      // Locks should be released
      const lockManager = executor.getLockManager();
      expect(lockManager.getAllLocks().length).toBe(0);
    });
  });

  describe("createNoOpExecutor", () => {
    it("should create executor that does nothing", async () => {
      const executor = createNoOpExecutor();
      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "query",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.completedTasks).toBe(1);
      const taskResult = result.taskResults.get("task-1");
      expect(taskResult?.result).toEqual({ taskId: "task-1", executed: true });
    });
  });

  describe("executeTasksInParallel", () => {
    it("should provide quick execution", async () => {
      const tasks: ParallelTask[] = [
        {
          id: "task-1",
          name: "Task 1",
          type: "code_gen",
          complexity: "simple",
          query: "query",
        },
      ];

      const result = await executeTasksInParallel(tasks, mockExecutor);

      expect(result.completedTasks).toBe(1);
    });
  });

  describe("task timeout", () => {
    it("should timeout slow tasks", async () => {
      const slowExecutor: TaskExecutor = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { completed: true };
      };

      const executor = createParallelExecutor(slowExecutor, {
        taskTimeoutMs: 50,
      });

      const tasks: ParallelTask[] = [
        {
          id: "slow",
          name: "Slow",
          type: "code_gen",
          complexity: "simple",
          query: "slow",
        },
      ];

      const result = await executor.execute(tasks);

      expect(result.failedTasks).toBe(1);
      const taskResult = result.taskResults.get("slow");
      expect(taskResult?.error).toContain("timed out");
    });
  });

  describe("getStatus", () => {
    it("should return null when not executing", () => {
      const executor = createParallelExecutor(mockExecutor);
      expect(executor.getStatus()).toBeNull();
    });
  });

  describe("configuration", () => {
    it("should update config", () => {
      const executor = createParallelExecutor(mockExecutor);
      executor.updateConfig({ taskTimeoutMs: 60000 });

      const config = executor.getConfig();
      expect(config.taskTimeoutMs).toBe(60000);
    });

    it("should provide access to managers", () => {
      const executor = createParallelExecutor(mockExecutor);

      expect(executor.getTrackManager()).toBeDefined();
      expect(executor.getScheduler()).toBeDefined();
      expect(executor.getLockManager()).toBeDefined();
    });
  });
});

describe("Track Manager Integration", () => {
  it("should assign tasks to tracks", async () => {
    const executor = createParallelExecutor(
      async (task) => ({ taskId: task.id }),
      { tracks: { maxTracks: 2 } }
    );

    const tasks: ParallelTask[] = [
      {
        id: "a",
        name: "A",
        type: "code_gen",
        complexity: "simple",
        query: "a",
      },
      {
        id: "b",
        name: "B",
        type: "code_gen",
        complexity: "simple",
        query: "b",
      },
    ];

    await executor.execute(tasks);

    const trackManager = executor.getTrackManager();
    const stats = trackManager.getOverallStats();

    expect(stats.totalTasks).toBe(2);
    expect(stats.completed).toBe(2);
  });
});

describe("Dependency Scheduler Integration", () => {
  it("should create batches respecting dependencies", async () => {
    const executor = createParallelExecutor(async (task) => ({ taskId: task.id }));

    const tasks: ParallelTask[] = [
      {
        id: "a",
        name: "A",
        type: "code_gen",
        complexity: "simple",
        query: "a",
      },
      {
        id: "b",
        name: "B",
        type: "code_gen",
        complexity: "simple",
        query: "b",
        dependsOn: ["a"],
      },
      {
        id: "c",
        name: "C",
        type: "code_gen",
        complexity: "simple",
        query: "c",
        dependsOn: ["a"],
      },
      {
        id: "d",
        name: "D",
        type: "code_gen",
        complexity: "simple",
        query: "d",
        dependsOn: ["b", "c"],
      },
    ];

    const result = await executor.execute(tasks);

    // Should have 3 batches: [a], [b,c], [d]
    expect(result.batches.length).toBe(3);
    expect(result.completedTasks).toBe(4);
  });
});
