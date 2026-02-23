/**
 * Parallel Execution Module Index
 *
 * Provides parallel task execution capabilities.
 *
 * @module agents/parallel
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 40 Parallel Execution
 */

// Dependency Graph
export {
  DependencyGraph,
  createDependencyGraph,
  createDependencyGraphFromTasks,
  type TaskNode,
  type DependencyConflict,
  type GraphAnalysis,
} from "./dependency-graph.js";

// Track Manager
export {
  TrackManager,
  createTrackManager,
  type TrackConfig,
  type TrackAssignment,
  type TrackStats,
} from "./track-manager.js";

// Dependency Scheduler
export {
  DependencyScheduler,
  createDependencyScheduler,
  scheduleTasksForExecution,
  type ScheduleConfig,
  type Schedule,
  type ScheduleStats,
} from "./dependency-scheduler.js";

// Parallel Executor
export {
  ParallelExecutor,
  createParallelExecutor,
  createNoOpExecutor,
  executeTasksInParallel,
  type ExecutorConfig,
  type ExecutionContext,
  type TaskExecutor,
  type ExecutorEvents,
} from "./parallel-executor.js";
