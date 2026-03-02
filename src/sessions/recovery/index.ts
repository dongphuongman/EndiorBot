/**
 * Recovery Module
 *
 * Failure recovery engine with retry, fix, and escalation strategies.
 *
 * @module sessions/recovery
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @sprint 69-71
 */

export {
  // Types
  type RecoveryAction,
  type RecoveryResult,
  type EscalationDetails,
  type RecoveryEngineConfig,
  type RecoveryContext,
  // Engine
  RecoveryEngine,
  getRecoveryEngine,
  setRecoveryEngine,
  createRecoveryEngine,
  resetRecoveryEngine,
} from "./engine.js";
