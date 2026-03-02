/**
 * Checkpoint Module
 *
 * Exports for checkpoint/resume functionality.
 *
 * @module sessions/checkpoint
 * @version 1.4.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 8
 * @authority ADR-006 Checkpoint State Model
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Schema version
  CHECKPOINT_SCHEMA_VERSION,
  // Enums/Types
  type CheckpointReason,
  type SoulType,
  type ExecutionPhase,
  type ToolCallStatus,
  type CompletedActionType,
  type RestoreStatus,
  type ConflictSeverity,
  type ConflictResolution,
  // Sub-interfaces
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
  // Main interfaces
  type CheckpointState,
  type CheckpointSummary,
  type FileConflict,
  type RestoreResult,
  type CheckpointStore,
} from "./types.js";

// ============================================================================
// Serialization
// ============================================================================

export {
  // Constants
  COMPRESSION_THRESHOLD,
  // Functions
  serializeCheckpoint,
  deserializeCheckpoint,
  isCompressed,
  getSerializedSize,
  extractSummary,
  validateCheckpoint,
  sanitizeCheckpoint,
} from "./serializer.js";

// ============================================================================
// Checkpoint Management
// ============================================================================

export {
  // ID generation
  generateCheckpointId,
  // File hashing
  hashFile,
  hashFiles,
  // Checkpoint creation
  createCheckpoint,
  type CreateCheckpointOptions,
  // Store
  FileCheckpointStore,
  getCheckpointStore,
  resetCheckpointStore,
  // Convenience functions
  saveCheckpoint,
  loadCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  cleanupCheckpoints,
} from "./checkpoint.js";

// ============================================================================
// Conflict Detection (Sprint 35 Day 4)
// ============================================================================

export {
  // Types
  type ConflictType,
  type RawConflict,
  type ConflictDetectionResult,
  // Detection functions
  detectConflicts,
  detectConflictsForPaths,
  hasFileConflict,
  getConflictingPaths,
  // Utilities
  filterConflictsByType,
  hasConflictType,
  toFileConflicts,
} from "./conflict-detector.js";

export {
  // Types
  type ClassifiedConflict,
  type ClassificationResult,
  // Classification functions
  classifyConflict,
  classifyConflicts,
  // Utilities
  allAutoResolvable,
  getReviewRequired,
  getConflictSummary,
} from "./conflict-classifier.js";

export {
  // Types
  type ResolvedConflict,
  type ResolutionResult,
  type ResolutionOptions,
  // Resolution functions
  autoResolveConflicts,
  forceRestore,
  acceptNewBaseline,
  abortResolution,
  resolveConflicts,
  // Backup functions
  listBackups,
  restoreFromBackup,
  // Utilities
  getAvailableResolutions,
  getRecommendedResolution,
} from "./conflict-resolver.js";

// ============================================================================
// Versioning (Sprint 35 Day 5)
// ============================================================================

export {
  // Types
  type VersionComparison,
  type VersionCompatibility,
  type ParsedVersion,
  // Version parsing
  parseVersion,
  isValidVersion,
  formatVersion,
  // Version comparison
  compareVersions,
  getVersionComparison,
  // Compatibility checking
  checkVersionCompatibility,
  // Utilities
  getCurrentSchemaVersion,
  incrementVersion,
  getVersionRange,
  isVersionInRange,
  // Error classes
  VersionIncompatibleError,
  MigrationError,
} from "./versioning.js";

// ============================================================================
// Migration (Sprint 35 Day 5)
// ============================================================================

export {
  // Types
  type MigrationFn,
  type MigrationStep,
  type MigrationResult,
  type MigrationRegistry,
  // Registry
  registerMigration,
  getMigrationRegistry,
  clearMigrations,
  // Migration path finding
  findMigrationPath,
  applyMigrationStep,
  migrateCheckpoint,
  // Validation
  validateCheckpointVersion,
  needsMigration,
  getCheckpointVersion,
  // Builder
  MigrationBuilder,
  defineMigration,
} from "./migration.js";

// ============================================================================
// Resume Handler (Sprint 35 Day 6-7)
// ============================================================================

export {
  // Types
  type ResumeOptions,
  type ResumeStep,
  type ResumeResult,
  type ProvenanceCheckResult,
  // Resume functions
  resumeFromCheckpoint,
  canResume,
  getResumePreview,
} from "./resume-handler.js";

// ============================================================================
// Restore Flow (Sprint 35 Day 6-7)
// ============================================================================

export {
  // Types
  type RestoreOperationResult,
  type RestoreOperation,
  type RestoreFlowOptions,
  type RestoreFlowResult,
  // Restore functions
  executeRestoreFlow,
  executeRollback,
  validateRestoration,
  createCompensationCommit,
} from "./restore-flow.js";

// ============================================================================
// Git Automation (Sprint 35 Day 8)
// ============================================================================

export {
  // Types
  type GitOperationResult,
  type GitOperation,
  type MilestoneType,
  type AutoCommitOptions,
  type CompensationCommitOptions,
  type WorktreeCaptureOptions,
  type WorktreeState,
  type GitCheckpointState,
  type ResetStrategy,
  // Git utilities
  isGitRepository,
  getCurrentBranch,
  getCurrentCommit,
  getUncommittedFiles,
  isWorkingTreeClean,
  getGitState,
  getCommitFiles,
  // Auto-commit
  autoCommitOnMilestone,
  // Compensation commits
  createCompensationCommit as gitCreateCompensationCommit,
  // Working tree
  captureWorkingTree,
  restoreWorkingTree,
  // Reset operations
  resetToCommit,
  // Branch operations
  createCheckpointBranch,
  deleteCheckpointBranch,
  // Checkpoint integration
  createGitCompletedAction,
  commitAndCheckpoint,
  gitRollback,
} from "./git-automation.js";

// ============================================================================
// Checkpoint Scheduler (Sprint 69-71)
// ============================================================================

export {
  // Types
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
  // Constants
  DEFAULT_CHECKPOINT_TRIGGERS,
  // Scheduler
  CheckpointScheduler,
  getCheckpointScheduler,
  resetCheckpointScheduler,
  createCheckpointScheduler,
} from "./scheduler.js";
