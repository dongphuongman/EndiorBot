/**
 * Progressive Autonomy T2 Types
 *
 * Portable type definitions for multi-agent orchestration.
 * ADR-002: This file imports ZERO modules from src/.
 *
 * CTO MF-1: Agent fields use `string` (not AgentRole) because
 * RouteResult.agents is string[]. Validation happens in GoalDecomposer.
 *
 * @module autonomy/types
 * @version 1.0.0
 * @authority Sprint 95 Plan + ADR-002
 * @sprint 95
 */

// ============================================================================
// Decomposition Strategy
// ============================================================================

/**
 * How subtasks should be executed.
 * - sequential: one after another, context relayed between steps
 * - parallel: all at once, results aggregated
 * - mixed: dependency graph determines which are parallel vs sequential
 */
export type DecompositionStrategy = "sequential" | "parallel" | "mixed";

// ============================================================================
// Subtask
// ============================================================================

/**
 * Status of a subtask in the execution pipeline.
 *
 * Sprint 131 (Multica ADOPT 2, CTO C3): Extended lifecycle for CEO visibility.
 * Read-only — states update from existing execution flow, no auto-progression.
 *
 * Lifecycle:
 *   pending → queued → dispatched → running → verifying → completed
 *                                                       ↘ failed
 *   (any) → cancelled
 *   (pending) → skipped (if dependency failed)
 */
export type SubtaskStatus =
  | "pending"      // Initial state, waiting for dependencies
  | "queued"       // Dependencies satisfied, ready to dispatch
  | "dispatched"   // Picked up by scheduler, about to run
  | "running"      // Agent invocation in progress
  | "verifying"    // Agent returned, recording budget + emitting events
  | "completed"    // Successfully finished
  | "failed"       // Execution error
  | "cancelled"    // Session stopped or task aborted
  | "skipped";     // Dependency failed or task bypassed

/**
 * A single subtask in a goal decomposition.
 */
export interface Subtask {
  /** Unique subtask ID */
  id: string;
  /** Human-readable description of what this subtask does */
  description: string;
  /** Target agent (string, validated by GoalDecomposer against AgentRole) */
  agent: string;
  /** IDs of subtasks that must complete before this one */
  dependencies: string[];
  /** Execution priority (1 = highest) */
  priority: number;
  /** Estimated duration in milliseconds */
  estimatedDurationMs: number;
  /** Current status */
  status: SubtaskStatus;
}

// ============================================================================
// Goal Decomposition
// ============================================================================

/**
 * Result of decomposing a CEO goal into multi-agent subtasks.
 */
export interface GoalDecomposition {
  /** Unique goal ID */
  goalId: string;
  /** Original CEO goal text */
  originalGoal: string;
  /** Ordered list of subtasks */
  subtasks: Subtask[];
  /** Execution strategy */
  strategy: DecompositionStrategy;
  /** Estimated total duration in milliseconds */
  estimatedDurationMs: number;
  /** Estimated total cost in USD */
  estimatedCostUsd: number;
}

// ============================================================================
// Subtask Result
// ============================================================================

/**
 * Result from executing a single subtask.
 */
export interface SubtaskResult {
  /** Subtask ID */
  subtaskId: string;
  /** Agent that executed this subtask */
  agent: string;
  /** Whether the subtask succeeded */
  success: boolean;
  /** Agent output text */
  output: string;
  /** Actual duration in milliseconds */
  durationMs: number;
  /** Estimated cost in USD (from durationMs + provider — CTO F2) */
  estimatedCostUsd: number;
  /** Provider that handled the request */
  provider?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Session Relay Context
// ============================================================================

/**
 * Context propagated between sequential agent invocations.
 * SessionRelay maintains this as subtasks complete.
 */
export interface SessionRelayContext {
  /** Session ID */
  sessionId: string;
  /** Goal ID this relay belongs to */
  goalId: string;
  /** Results from completed subtasks (in execution order) */
  completedSubtasks: SubtaskResult[];
  /** Shared context string (accumulated, token-budgeted) */
  sharedContext: string;
  /** Handoff chain for audit: agent → agent transitions */
  handoffChain: string[];
  /** Created timestamp — ISO 8601 */
  createdAt: string;
}

// ============================================================================
// Aggregated Response
// ============================================================================

/**
 * Final merged response from multiple agents.
 * CTO F3: Uses own template, does NOT reuse ChannelRouter.formatResponse().
 */
export interface AggregatedResponse {
  /** Merged response text */
  text: string;
  /** Output format */
  format: "markdown" | "plain";
  /** Agents that contributed (in execution order) */
  agents: string[];
  /** Total execution duration in milliseconds */
  totalDurationMs: number;
  /** Total estimated cost in USD */
  totalCostUsd: number;
  /** Individual subtask results */
  subtaskResults: SubtaskResult[];
}

// ============================================================================
// Multi-Agent Configuration
// ============================================================================

/**
 * Configuration for multi-agent dispatch.
 * Aligned with AUTONOMY_GATE_CONFIG.B (T2).
 */
export interface MultiAgentConfig {
  /** Max agents per goal */
  maxAgents: number;
  /** Max parallel execution tracks */
  maxParallelTracks: number;
  /** Total workflow timeout in milliseconds */
  timeoutMs: number;
  /** Cost limit in USD (Gate B: $2.00) */
  costLimitUsd: number;
  /** Per-subtask timeout in milliseconds */
  perSubtaskTimeoutMs: number;
  /** Default decomposition strategy */
  defaultStrategy: DecompositionStrategy;
}

/**
 * Default T2 configuration.
 * Aligned with AUTONOMY_GATE_CONFIG.B: 30 min, $2.00.
 */
export const DEFAULT_T2_CONFIG: MultiAgentConfig = {
  maxAgents: 4,
  maxParallelTracks: 3,
  timeoutMs: 30 * 60 * 1000,          // 30 minutes (Gate B)
  costLimitUsd: 2.0,                   // $2.00 (Gate B)
  perSubtaskTimeoutMs: 60 * 1000,      // 60 seconds per subtask
  defaultStrategy: "sequential",
};

/**
 * Default T3 configuration.
 * Aligned with AUTONOMY_GATE_CONFIG.C: 120 min, $10.00.
 * Sprint 97: Progressive Trust T3 — longer sessions with mixed strategy.
 * CTO C4: Same file as DEFAULT_T2_CONFIG, no new imports.
 *
 * @sprint 97
 */
export const DEFAULT_T3_CONFIG: MultiAgentConfig = {
  maxAgents: 6,                        // T2: 4 → T3: 6 (longer sessions)
  maxParallelTracks: 4,                // T2: 3 → T3: 4
  timeoutMs: 2 * 60 * 60 * 1000,      // 120 minutes (Gate C)
  costLimitUsd: 10.0,                  // $10.00 (Gate C)
  perSubtaskTimeoutMs: 2 * 60 * 1000,  // T2: 60s → T3: 120s (complex tasks)
  defaultStrategy: "mixed",            // T2: sequential → T3: mixed
};

// ============================================================================
// Dispatcher Events
// ============================================================================

/** Events emitted during multi-agent dispatch */
export type DispatchEventType =
  | "subtask:start"
  | "subtask:complete"
  | "subtask:failed"
  | "subtask:skipped"
  | "budget:warning"
  | "budget:exceeded"
  | "dispatch:complete";

/**
 * Event payload for dispatch monitoring.
 */
export interface DispatchEvent {
  /** Event type */
  type: DispatchEventType;
  /** Goal ID */
  goalId: string;
  /** Subtask ID (if subtask-related) */
  subtaskId?: string;
  /** Agent involved */
  agent?: string;
  /** Event message */
  message: string;
  /** Timestamp — ISO 8601 */
  timestamp: string;
}
