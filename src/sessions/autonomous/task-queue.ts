/**
 * Task Queue
 *
 * Task array management, priority sorting, dequeue, and dependency checks
 * for the Autonomous Session Manager.
 *
 * @module sessions/autonomous/task-queue
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import { createLogger, type Logger } from "../../logging/index.js";
import type {
  AutonomousTask,
  TaskExecutionResult,
  AutonomousSessionConfig,
} from "./types.js";
import type { SubtaskStatus } from "../../autonomy/types.js";
import type { AutonomousEventEmitter } from "./event-emitter.js";

// ============================================================================
// TaskQueue
// ============================================================================

/**
 * Manages the task queue for an autonomous session.
 *
 * Responsibilities:
 * - Add and remove tasks
 * - Priority-based sorting
 * - Dependency resolution (dequeue only when deps satisfied)
 * - Per-task lifecycle state tracking (Sprint 131)
 */
export class TaskQueue {
  private readonly log: Logger;
  private readonly emitter: AutonomousEventEmitter;
  private readonly maxTaskRetries: number;

  private queue: AutonomousTask[] = [];
  private completedTasks: Map<string, TaskExecutionResult> = new Map();
  private taskIdCounter: number = 0;
  private taskStates: Map<string, SubtaskStatus> = new Map();

  constructor(
    config: Pick<Required<AutonomousSessionConfig>, "maxTaskRetries">,
    emitter: AutonomousEventEmitter,
  ) {
    this.log = createLogger("TaskQueue");
    this.maxTaskRetries = config.maxTaskRetries;
    this.emitter = emitter;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Add a task to the queue. Returns the assigned task ID.
   */
  add(
    task: Omit<AutonomousTask, "id" | "createdAt" | "maxRetries" | "dependencies"> &
      Partial<Pick<AutonomousTask, "maxRetries" | "dependencies">>,
  ): string {
    const taskId = `task-${++this.taskIdCounter}`;
    const fullTask: AutonomousTask = {
      id: taskId,
      createdAt: new Date().toISOString(),
      maxRetries: task.maxRetries ?? this.maxTaskRetries,
      dependencies: task.dependencies ?? [],
      ...task,
    };

    this.queue.push(fullTask);
    this.sort();

    // Sprint 131: track lifecycle
    this.transitionState(taskId, fullTask.dependencies.length > 0 ? "pending" : "queued");

    this.log.debug("Task added", {
      taskId,
      type: task.type,
      stage: task.stage,
    });

    return taskId;
  }

  /**
   * Dequeue the next task whose dependencies are all satisfied.
   * Returns null if no executable task is available.
   */
  dequeue(): AutonomousTask | null {
    for (const task of this.queue) {
      const dependenciesSatisfied = task.dependencies.every((dep) =>
        this.completedTasks.has(dep),
      );
      if (dependenciesSatisfied) {
        return task;
      }
    }
    return null;
  }

  /**
   * Remove a task from the queue by ID.
   */
  remove(taskId: string): void {
    this.queue = this.queue.filter((t) => t.id !== taskId);
  }

  /**
   * Record the result of a completed or failed task.
   */
  recordResult(result: TaskExecutionResult): void {
    this.completedTasks.set(result.taskId, result);
  }

  /**
   * Get count of pending tasks in the queue.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Snapshot of all pending tasks (immutable copy).
   */
  getPendingTasks(): AutonomousTask[] {
    return [...this.queue];
  }

  /**
   * All completed task results.
   */
  getCompletedTasks(): TaskExecutionResult[] {
    return Array.from(this.completedTasks.values());
  }

  /**
   * Completed task map (read-only reference for cost/status lookups).
   */
  getCompletedTaskMap(): ReadonlyMap<string, TaskExecutionResult> {
    return this.completedTasks;
  }

  // ==========================================================================
  // Task State (Sprint 131 visibility)
  // ==========================================================================

  /**
   * Transition a task to a new lifecycle state and emit event.
   *
   * CTO C3: Read-only visibility — updates from existing execution flow only,
   * never auto-progresses tasks.
   */
  transitionState(taskId: string, to: SubtaskStatus): void {
    const from = this.taskStates.get(taskId) ?? "pending";
    if (from === to) return;
    this.taskStates.set(taskId, to);
    this.emitter.emit("task_state_changed", { taskId, from, to });
  }

  /**
   * Get current state of a task (for /status display).
   */
  getTaskState(taskId: string): SubtaskStatus | undefined {
    return this.taskStates.get(taskId);
  }

  /**
   * Get all task states (snapshot for UI).
   */
  getAllTaskStates(): ReadonlyMap<string, SubtaskStatus> {
    return new Map(this.taskStates);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private sort(): void {
    this.queue.sort((a, b) => a.priority - b.priority);
  }
}
