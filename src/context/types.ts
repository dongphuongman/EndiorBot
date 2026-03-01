/**
 * Context Anchoring Types
 *
 * Type definitions for the Context Anchoring system.
 * Sprint 65: v1.5 Context Anchoring.
 *
 * Context anchoring prevents "context drift" by:
 * - Persisting sprint goals across sessions
 * - Creating/restoring conversation checkpoints
 * - Maintaining spec snapshots as source of truth
 * - Tracking key decisions and blockers
 *
 * @module context/types
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65
 * @sprint 65
 */

// ============================================================================
// Anchor Types
// ============================================================================

/**
 * Types of context anchors.
 *
 * Each anchor type serves a specific purpose in maintaining context:
 * - sprint_goal: Persistent objectives for the current sprint
 * - checkpoint: Snapshot of conversation state for restore
 * - spec_snapshot: Current specification state (source of truth)
 * - identity: Project identity and capabilities
 * - decision: Key decisions made during session
 * - blocker: Active blockers that need resolution
 */
export type AnchorType =
  | "sprint_goal"
  | "checkpoint"
  | "spec_snapshot"
  | "identity"
  | "decision"
  | "blocker";

/**
 * Priority levels for anchors.
 */
export type AnchorPriority = "critical" | "high" | "medium" | "low";

/**
 * Anchor lifecycle states.
 */
export type AnchorState = "active" | "archived" | "expired" | "superseded";

// ============================================================================
// Base Anchor
// ============================================================================

/**
 * Base anchor point structure.
 *
 * All anchor types extend this base structure.
 */
export interface AnchorPoint {
  /** Unique identifier */
  id: string;
  /** Anchor type */
  type: AnchorType;
  /** Human-readable title */
  title: string;
  /** Detailed content */
  content: string;
  /** Priority level */
  priority: AnchorPriority;
  /** Current state */
  state: AnchorState;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Expiration timestamp (optional) */
  expiresAt?: Date;
  /** Associated SDLC stage */
  stage?: string;
  /** Associated sprint */
  sprint?: string;
  /** Tags for categorization */
  tags: string[];
  /** Metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Sprint Goal
// ============================================================================

/**
 * Sprint goal anchor.
 *
 * Persists sprint objectives across sessions to prevent context drift.
 */
export interface SprintGoal extends AnchorPoint {
  type: "sprint_goal";
  /** Sprint number (e.g., "65") */
  sprintNumber: string;
  /** Goal objectives */
  objectives: SprintObjective[];
  /** Success criteria */
  successCriteria: string[];
  /** Definition of done */
  definitionOfDone: string[];
  /** Estimated hours */
  estimatedHours: number;
  /** Hours spent so far */
  hoursSpent: number;
  /** Completion percentage (0-100) */
  progress: number;
  /** Target completion date */
  targetDate?: Date;
}

/**
 * Individual sprint objective.
 */
export interface SprintObjective {
  /** Objective ID */
  id: string;
  /** Description */
  description: string;
  /** Status */
  status: "pending" | "in_progress" | "completed" | "blocked";
  /** Blocking reason if blocked */
  blockingReason?: string;
  /** Completion percentage */
  progress: number;
  /** Associated tasks */
  taskRefs: string[];
}

// ============================================================================
// Checkpoint
// ============================================================================

/**
 * Conversation checkpoint anchor.
 *
 * Captures conversation state for restore.
 */
export interface Checkpoint extends AnchorPoint {
  type: "checkpoint";
  /** Checkpoint name */
  name: string;
  /** Git commit SHA at checkpoint */
  gitCommit?: string;
  /** Git branch at checkpoint */
  gitBranch?: string;
  /** Files modified since last checkpoint */
  modifiedFiles: string[];
  /** Token count at checkpoint */
  tokenCount: number;
  /** Active anchors at checkpoint */
  activeAnchors: string[];
  /** Checkpoint trigger */
  trigger: CheckpointTrigger;
  /** Can this checkpoint be restored? */
  restorable: boolean;
  /** Restore instructions */
  restoreInstructions?: string;
}

/**
 * What triggered the checkpoint creation.
 */
export type CheckpointTrigger =
  | "manual" // User requested
  | "auto_time" // Time-based (e.g., every 30 min)
  | "auto_tokens" // Token count threshold
  | "auto_milestone" // Task completion
  | "pre_destructive" // Before destructive operation
  | "session_end"; // End of session

// ============================================================================
// Spec Snapshot
// ============================================================================

/**
 * Spec snapshot anchor.
 *
 * Captures the current state of specifications as source of truth.
 */
export interface SpecSnapshot extends AnchorPoint {
  type: "spec_snapshot";
  /** SHA256 hash of snapshot content */
  contentHash: string;
  /** Source files included */
  sources: SpecSource[];
  /** Drift detection settings */
  driftPolicy: DriftPolicy;
  /** Last drift check timestamp */
  lastDriftCheck?: Date;
  /** Current drift status */
  driftStatus: DriftStatus;
  /** Files that have drifted */
  driftedFiles: string[];
}

/**
 * Source file in spec snapshot.
 */
export interface SpecSource {
  /** File path */
  path: string;
  /** Content hash */
  hash: string;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** File size in bytes */
  size: number;
  /** Include in context injection? */
  includeInContext: boolean;
}

/**
 * Drift detection policy.
 *
 * Per ADR-011: PAUSE_AND_ESCALATE for drift detection.
 */
export interface DriftPolicy {
  /** Enable drift detection */
  enabled: boolean;
  /** Check interval in minutes */
  checkIntervalMinutes: number;
  /** Drift threshold percentage (0-100) */
  thresholdPercent: number;
  /** Action on drift detection */
  action: DriftAction;
  /** Notify on drift */
  notifyOnDrift: boolean;
}

/**
 * Action to take when drift is detected.
 */
export type DriftAction =
  | "ignore" // Log but continue
  | "warn" // Warn user but continue
  | "block" // Block until resolved
  | "pause_and_escalate"; // ADR-011: Pause and require explicit acknowledgment

/**
 * Current drift status.
 */
export type DriftStatus =
  | "in_sync" // All files match snapshot
  | "minor_drift" // < threshold, warning
  | "major_drift" // >= threshold, action required
  | "unknown"; // Not yet checked

// ============================================================================
// Decision
// ============================================================================

/**
 * Decision anchor.
 *
 * Records key decisions made during the session.
 */
export interface Decision extends AnchorPoint {
  type: "decision";
  /** Decision question/topic */
  question: string;
  /** Chosen option */
  chosenOption: string;
  /** Alternatives considered */
  alternatives: string[];
  /** Rationale for decision */
  rationale: string;
  /** Impact assessment */
  impact: "low" | "medium" | "high" | "critical";
  /** Reversibility */
  reversible: boolean;
  /** Associated ADR if any */
  adrRef?: string;
  /** Decision maker (agent role) */
  decidedBy: string;
}

// ============================================================================
// Blocker
// ============================================================================

/**
 * Blocker anchor.
 *
 * Tracks active blockers that need resolution.
 */
export interface Blocker extends AnchorPoint {
  type: "blocker";
  /** Blocker description */
  description: string;
  /** What is blocked */
  blocks: string[];
  /** Potential resolutions */
  resolutions: BlockerResolution[];
  /** Escalation path */
  escalationPath?: string;
  /** Resolution deadline */
  deadline?: Date;
  /** Resolution status */
  resolutionStatus: "open" | "in_progress" | "resolved" | "escalated";
  /** How it was resolved */
  resolvedBy?: string;
  /** Resolution timestamp */
  resolvedAt?: Date;
}

/**
 * Potential resolution for a blocker.
 */
export interface BlockerResolution {
  /** Resolution description */
  description: string;
  /** Effort estimate */
  effort: "trivial" | "small" | "medium" | "large";
  /** Confidence level */
  confidence: "low" | "medium" | "high";
  /** Prerequisites */
  prerequisites: string[];
}

// ============================================================================
// Anchor Store
// ============================================================================

/**
 * Anchor store configuration.
 */
export interface AnchorStoreConfig {
  /** Storage path */
  storagePath: string;
  /** Enable auto-save */
  autoSave: boolean;
  /** Auto-save interval in seconds */
  autoSaveInterval: number;
  /** Maximum anchors to keep */
  maxAnchors: number;
  /** Enable compression */
  compress: boolean;
  /** Encryption key (optional) */
  encryptionKey?: string;
}

/**
 * Anchor query options.
 */
export interface AnchorQuery {
  /** Filter by type */
  types?: AnchorType[];
  /** Filter by state */
  states?: AnchorState[];
  /** Filter by priority */
  priorities?: AnchorPriority[];
  /** Filter by sprint */
  sprint?: string;
  /** Filter by stage */
  stage?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by date range */
  createdAfter?: Date;
  createdBefore?: Date;
  /** Sort by */
  sortBy?: "createdAt" | "updatedAt" | "priority";
  /** Sort direction */
  sortDirection?: "asc" | "desc";
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Anchor event types.
 */
export type AnchorEventType =
  | "anchor_created"
  | "anchor_updated"
  | "anchor_archived"
  | "anchor_expired"
  | "checkpoint_created"
  | "checkpoint_restored"
  | "drift_detected"
  | "blocker_resolved";

/**
 * Anchor event payload.
 */
export interface AnchorEvent {
  type: AnchorEventType;
  anchorId: string;
  anchorType: AnchorType;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new anchor ID.
 */
export function createAnchorId(type: AnchorType): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${type}_${timestamp}_${random}`;
}

/**
 * Create a base anchor point.
 */
export function createBaseAnchor(
  type: AnchorType,
  title: string,
  content: string,
  options: Partial<AnchorPoint> = {}
): AnchorPoint {
  const now = new Date();
  return {
    id: createAnchorId(type),
    type,
    title,
    content,
    priority: options.priority ?? "medium",
    state: options.state ?? "active",
    createdAt: now,
    updatedAt: now,
    tags: options.tags ?? [],
    metadata: options.metadata ?? {},
    ...options,
  };
}

/**
 * Default drift policy.
 */
export const DEFAULT_DRIFT_POLICY: DriftPolicy = {
  enabled: true,
  checkIntervalMinutes: 15,
  thresholdPercent: 10,
  action: "pause_and_escalate",
  notifyOnDrift: true,
};

/**
 * Default anchor store config.
 */
export const DEFAULT_ANCHOR_STORE_CONFIG: AnchorStoreConfig = {
  storagePath: ".endiorbot/anchors",
  autoSave: true,
  autoSaveInterval: 60,
  maxAnchors: 1000,
  compress: true,
};
