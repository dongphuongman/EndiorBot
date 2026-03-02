/**
 * Autonomous Session Module
 *
 * Full SDLC loop orchestration with model tiering and budget management.
 *
 * @module sessions/autonomous
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.5
 * @sprint 72
 */

// Types
export {
  AutonomyLevel,
  AUTONOMY_GATE_CONFIG,
  DEFAULT_AUTONOMOUS_CONFIG,
  type AutonomyGate,
  type AutonomousTask,
  type TaskExecutionResult,
  type DecisionPoint,
  type DecisionType,
  type DecisionOption,
  type EscalationRequest,
  type EscalationResponse,
  type AutonomousSessionConfig,
  type AutonomousSessionStatus,
  type AutonomousEvent,
  type AutonomousEventType,
  type AutonomousEventListener,
} from "./types.js";

// Manager
export {
  AutonomousSessionManager,
  getAutonomousSessionManager,
  setAutonomousSessionManager,
  createAutonomousSessionManager,
  resetAutonomousSessionManager,
} from "./manager.js";
