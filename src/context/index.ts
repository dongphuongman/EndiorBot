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
