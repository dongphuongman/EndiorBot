/**
 * Context Anchoring Module
 *
 * Unified entry point for the Context Anchoring system.
 * Sprint 65: v1.5 Context Anchoring.
 *
 * This module provides:
 * - Sprint Goals persistence
 * - Conversation checkpoints
 * - Spec snapshots (source of truth)
 * - Decision tracking
 * - Blocker management
 *
 * @module context
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65
 * @sprint 65
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Anchor types
  AnchorType,
  AnchorPriority,
  AnchorState,
  AnchorPoint,

  // Sprint goals
  SprintGoal,
  SprintObjective,

  // Checkpoints
  Checkpoint,
  CheckpointTrigger,

  // Spec snapshots
  SpecSnapshot,
  SpecSource,
  DriftPolicy,
  DriftAction,
  DriftStatus,

  // Decisions & blockers
  Decision,
  Blocker,
  BlockerResolution,

  // Store & query
  AnchorStoreConfig,
  AnchorQuery,

  // Events
  AnchorEventType,
  AnchorEvent,
} from "./types.js";

export {
  // Factory functions
  createAnchorId,
  createBaseAnchor,

  // Defaults
  DEFAULT_DRIFT_POLICY,
  DEFAULT_ANCHOR_STORE_CONFIG,
} from "./types.js";

// ============================================================================
// Context Anchor (Core)
// ============================================================================

export {
  ContextAnchor,
  getContextAnchor,
  resetContextAnchor,
} from "./context-anchor.js";

// ============================================================================
// Sprint Goals
// ============================================================================

export {
  SprintGoalManager,
  getSprintGoalManager,
  resetSprintGoalManager,
  createSprintGoal,
  loadCurrentSprintGoal,
  updateSprintProgress,
} from "./sprint-goals.js";

// ============================================================================
// Checkpoints
// ============================================================================

export {
  CheckpointManager,
  getCheckpointManager,
  resetCheckpointManager,
  createCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
} from "./checkpoint-manager.js";

// ============================================================================
// Spec Snapshot Anchor (Enhanced)
// ============================================================================

export {
  SpecSnapshotAnchor,
  getSpecSnapshotAnchor,
  resetSpecSnapshotAnchor,
  createSpecSnapshot,
  checkSpecDrift,
  type CreateSnapshotOptions,
  type DriftCheckResult,
  type DriftedFile,
} from "./spec-snapshot-anchor.js";

// ============================================================================
// Git Context (Sprint 65 T5.10)
// ============================================================================

export {
  GitContextManager,
  getGitContextManager,
  resetGitContextManager,
  getGitContext,
  getFileAtRef,
  formatGitContext,
  type GitBranchInfo,
  type GitCommitInfo,
  type GitContext,
  type TimeTravelResult,
} from "./git-context.js";

// ============================================================================
// Anchor Budget (Sprint 65 T5.14)
// ============================================================================

export {
  AnchorBudget,
  getAnchorBudget,
  resetAnchorBudget,
  formatWithinBudget,
  formatCheckpointCompact,
  formatBlockerCompact,
  DEFAULT_ANCHOR_BUDGET,
  COMPACT_ANCHOR_BUDGET,
  MINIMAL_ANCHOR_BUDGET,
  type AnchorBudgetConfig,
  type AnchorBudgetAllocation,
  type BudgetStrategy,
} from "./anchor-budget.js";

// ============================================================================
// Cross-Session Context Transfer (Sprint 96)
// ============================================================================

export {
  // Types
  type ContextQualityScore,
  type QualityWeights,
  type TransferContextType,
  type TransferableContext,
  type ContextTransferConfig,
  type ContextSelectionResult,
  type ContextQualityGateResult,
  type QualityViolation,
  type TransferStoreStats,
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_TRANSFER_CONFIG,
  ALL_TRANSFER_CONTEXT_TYPES,

  // Quality Scorer
  ContextQualityScorer,
  getContextQualityScorer,
  resetContextQualityScorer,

  // Quality Gate
  ContextQualityGate,
  getContextQualityGate,
  resetContextQualityGate,

  // Store
  ContextTransferStore,
  getContextTransferStore,
  resetContextTransferStore,

  // Extractor
  SessionContextExtractor,

  // Selector
  ContextSelector,
  getContextSelector,
  resetContextSelector,

  // Sprint 97: T3 types
  type RetentionLevel,
  type RetentionMetrics,
  type ContextCheckpointState,
  type ContextRefreshConfig,
  RETENTION_THRESHOLDS,
  DEFAULT_REFRESH_CONFIG,

  // Sprint 97: Injector
  ContextInjector,
  getContextInjector,
  resetContextInjector,

  // Sprint 97: Retention Tracker
  RetentionTracker,
  getRetentionTracker,
  resetRetentionTracker,

  // Sprint 97: Lifecycle Manager
  ContextLifecycleManager,
  getContextLifecycleManager,
  resetContextLifecycleManager,
} from "./transfer/index.js";
