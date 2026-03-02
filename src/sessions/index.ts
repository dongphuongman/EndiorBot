/**
 * Sessions Module
 *
 * Session and project context management.
 *
 * @module sessions
 * @version 1.2.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 4
 */

// Types
export type {
  GateId,
  GateStatus,
  GitState,
  ProjectContext,
  ProjectTier,
  SDLCConfig,
  SDLCStage,
  Session,
  SessionEvent,
  SessionEventListener,
  SessionEventType,
  SessionStore,
  SessionSummary,
} from "./types.js";

export { COMPACTION_THRESHOLD, TOKEN_BUDGETS } from "./types.js";

// Token Counter
export { getTokenCounter, TokenCounter } from "./token-counter.js";

// Session Store
export { FileSessionStore, getSessionStore } from "./session-store.js";

// Session Manager
export {
  getSessionManager,
  resetSessionManager,
  SessionManager,
} from "./session-manager.js";

// ============================================================================
// Checkpoint Module (Sprint 35)
// ============================================================================

export {
  // Types
  CHECKPOINT_SCHEMA_VERSION,
  type CheckpointReason,
  type SoulType,
  type ExecutionPhase,
  type ToolCallStatus,
  type CompletedActionType,
  type RestoreStatus,
  type ConflictSeverity,
  type ConflictResolution,
  type ToolCallState,
  type CompletedAction,
  type StepFrame,
  type Task,
  type TokenUsageRecord,
  type FileChange,
  type ApprovalRequest,
  type Decision,
  type CheckpointMeta,
  type SessionSnapshot,
  type ExecutionContext,
  type RuntimeProvenance,
  type IdempotencyState,
  type FilesystemDelta,
  type GitStateSnapshot,
  type CostState,
  type RollbackStrategy,
  type BrainReference,
  type StateMachineState,
  type CheckpointState,
  type CheckpointSummary,
  type FileConflict,
  type RestoreResult,
  type CheckpointStore,
  // Serialization
  COMPRESSION_THRESHOLD,
  serializeCheckpoint,
  deserializeCheckpoint,
  isCompressed,
  getSerializedSize,
  extractSummary,
  validateCheckpoint,
  sanitizeCheckpoint,
  // Checkpoint Management
  generateCheckpointId,
  hashFile,
  hashFiles,
  createCheckpoint,
  type CreateCheckpointOptions,
  FileCheckpointStore,
  getCheckpointStore,
  resetCheckpointStore,
  saveCheckpoint,
  loadCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  cleanupCheckpoints,
  // Conflict Detection (Sprint 35 Day 4)
  type ConflictType,
  type RawConflict,
  type ConflictDetectionResult,
  detectConflicts,
  detectConflictsForPaths,
  hasFileConflict,
  getConflictingPaths,
  filterConflictsByType,
  hasConflictType,
  toFileConflicts,
  // Conflict Classification
  type ClassifiedConflict,
  type ClassificationResult,
  classifyConflict,
  classifyConflicts,
  allAutoResolvable,
  getReviewRequired,
  getConflictSummary,
  // Conflict Resolution
  type ResolvedConflict,
  type ResolutionResult,
  type ResolutionOptions,
  autoResolveConflicts,
  forceRestore,
  acceptNewBaseline,
  abortResolution,
  resolveConflicts,
  listBackups,
  restoreFromBackup,
  getAvailableResolutions,
  getRecommendedResolution,
  // Checkpoint Scheduler (Sprint 69-71)
  type CheckpointTriggerType,
  type CheckpointTrigger,
  type TimeCondition,
  type EventCondition,
  type PatchCountCondition,
  type CheckpointCondition,
  type CheckpointEvent,
  type CheckpointEventData,
  type CheckpointSchedulerConfig,
  type CheckpointReasonContext,
  DEFAULT_CHECKPOINT_TRIGGERS,
  CheckpointScheduler,
  getCheckpointScheduler,
  resetCheckpointScheduler,
  createCheckpointScheduler,
} from "./checkpoint/index.js";

// ============================================================================
// Session State Machine (Sprint 69-71)
// ============================================================================

export {
  // Types
  ResilienceState,
  type StateTransition,
  type StateHistoryEntry,
  type StateMachineConfig,
  // Constants
  DEFAULT_STATE_TRANSITIONS,
  // State Machine
  ResilienceStateMachine,
  createStateMachine,
  // Utilities
  stateToSDLCStage,
  sdlcStageToState,
} from "./state-machine.js";

// ============================================================================
// Session Resilience (Sprint 69-71)
// ============================================================================

export {
  // Types
  type SessionResilienceConfig,
  type StageResult,
  type SessionStatus,
  type StartOptions,
  // Manager
  SessionResilienceManager,
  getSessionResilienceManager,
  setSessionResilienceManager,
  createSessionResilienceManager,
  resetSessionResilienceManager,
} from "./session-resilience.js";

// ============================================================================
// Failure Module (Sprint 69-71)
// ============================================================================

export {
  // Types
  FailureType,
  type EvidenceType,
  type FailureEvidence,
  type ClassificationResult as FailureClassificationResult,
  type FailureClassifierConfig,
  // Classifier
  FailureClassifier,
  getFailureClassifier,
  resetFailureClassifier,
  createFailureClassifier,
} from "./failure/index.js";

// ============================================================================
// Recovery Module (Sprint 69-71)
// ============================================================================

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
} from "./recovery/index.js";

// ============================================================================
// Autonomous Session Module (Sprint 72)
// ============================================================================

export {
  // Types
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
  // Manager
  AutonomousSessionManager,
  getAutonomousSessionManager,
  setAutonomousSessionManager,
  createAutonomousSessionManager,
  resetAutonomousSessionManager,
} from "./autonomous/index.js";
