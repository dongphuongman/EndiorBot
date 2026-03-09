/**
 * Progressive Autonomy T2 — Barrel Export
 *
 * Multi-agent orchestration: GoalDecomposer, SessionRelay,
 * MultiAgentDispatcher, ResponseAggregator.
 *
 * @module autonomy
 * @version 1.0.0
 * @sprint 95
 */

export type {
  DecompositionStrategy,
  SubtaskStatus,
  Subtask,
  GoalDecomposition,
  SubtaskResult,
  SessionRelayContext,
  AggregatedResponse,
  MultiAgentConfig,
  DispatchEventType,
  DispatchEvent,
} from "./types.js";

export { DEFAULT_T2_CONFIG } from "./types.js";

export { GoalDecomposer } from "./goal-decomposer.js";

export { SessionRelay } from "./session-relay.js";
export type { RelayStatus } from "./session-relay.js";

export { ResponseAggregator } from "./response-aggregator.js";

export { MultiAgentDispatcher } from "./multi-agent-dispatcher.js";
