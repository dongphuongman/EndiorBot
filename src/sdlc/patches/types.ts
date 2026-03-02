/**
 * Patch Types
 *
 * Type definitions for PatchManager - tracks file changes with rollback support.
 *
 * @module sdlc/patches/types
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2, Sprint 68 T2.1
 * @sprint 68
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Patch state.
 */
export type PatchState = "pending" | "committed" | "rolledback";

/**
 * Type of file change.
 */
export type ChangeType = "create" | "modify" | "delete" | "rename";

/**
 * A diff hunk representing a contiguous change in a file.
 */
export interface DiffHunk {
  /**
   * Starting line number (1-indexed).
   */
  startLine: number;

  /**
   * Ending line number (1-indexed, inclusive).
   */
  endLine: number;

  /**
   * Old content that was replaced.
   */
  oldContent: string;

  /**
   * New content that replaced the old.
   */
  newContent: string;
}

/**
 * Represents a single file change within a patch.
 */
export interface FileChange {
  /**
   * Relative file path from project root.
   */
  path: string;

  /**
   * Type of change.
   */
  changeType: ChangeType;

  /**
   * Previous content (for rollback).
   * Only populated for "modify" and "delete" changes.
   */
  previousContent?: string;

  /**
   * New content after the change.
   * Only populated for "create" and "modify" changes.
   */
  newContent?: string;

  /**
   * Original path (for rename operations).
   */
  originalPath?: string;

  /**
   * Diff hunks for fine-grained changes.
   */
  diffHunks: DiffHunk[];

  /**
   * SHA256 hash of the previous content.
   */
  previousHash?: string;

  /**
   * SHA256 hash of the new content.
   */
  newHash?: string;

  /**
   * Timestamp when change was recorded.
   */
  timestamp: string;
}

/**
 * A patch represents a set of file changes.
 */
export interface Patch {
  /**
   * Unique patch identifier.
   */
  id: string;

  /**
   * Human-readable patch name.
   */
  name: string;

  /**
   * Patch description.
   */
  description?: string;

  /**
   * When the patch was created.
   */
  createdAt: string;

  /**
   * When the patch was last modified.
   */
  updatedAt: string;

  /**
   * Who created the patch (agent or user).
   */
  author: string;

  /**
   * List of file changes in this patch.
   */
  changes: FileChange[];

  /**
   * Associated sprint ID.
   */
  sprintId?: string;

  /**
   * Associated task ID.
   */
  taskId?: string;

  /**
   * Associated checkpoint ID.
   */
  checkpointId?: string;

  /**
   * Current patch state.
   */
  state: PatchState;

  /**
   * Whether this patch can be rolled back.
   */
  canRollback: boolean;

  /**
   * Patch metadata.
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Manager Types
// ============================================================================

/**
 * Options for creating a new patch.
 */
export interface CreatePatchOptions {
  /**
   * Patch name.
   */
  name: string;

  /**
   * Patch description.
   */
  description?: string;

  /**
   * Author of the patch.
   */
  author: string;

  /**
   * Associated sprint ID.
   */
  sprintId?: string;

  /**
   * Associated task ID.
   */
  taskId?: string;

  /**
   * Associated checkpoint ID.
   */
  checkpointId?: string;

  /**
   * Additional metadata.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Options for recording a file change.
 */
export interface RecordChangeOptions {
  /**
   * Path to the file.
   */
  path: string;

  /**
   * Type of change.
   */
  changeType: ChangeType;

  /**
   * Previous content (required for modify/delete).
   */
  previousContent?: string;

  /**
   * New content (required for create/modify).
   */
  newContent?: string;

  /**
   * Original path (required for rename).
   */
  originalPath?: string;
}

/**
 * Options for getting patch history.
 */
export interface PatchHistoryOptions {
  /**
   * Filter by state.
   */
  state?: PatchState;

  /**
   * Filter by sprint ID.
   */
  sprintId?: string;

  /**
   * Filter by author.
   */
  author?: string;

  /**
   * Maximum number of patches to return.
   */
  limit?: number;

  /**
   * Only include patches after this date.
   */
  after?: string;

  /**
   * Only include patches before this date.
   */
  before?: string;
}

/**
 * Rollback result.
 */
export interface RollbackResult {
  /**
   * Whether the rollback succeeded.
   */
  success: boolean;

  /**
   * Number of files rolled back.
   */
  filesRolledBack: number;

  /**
   * Errors encountered during rollback.
   */
  errors: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * PatchManager configuration.
 */
export interface PatchManagerConfig {
  /**
   * Project root directory.
   */
  projectRoot: string;

  /**
   * Directory to store patch data.
   * Defaults to .endiorbot/patches/
   */
  patchDir?: string;

  /**
   * Maximum number of patches to keep.
   * Older patches will be archived.
   */
  maxPatches?: number;

  /**
   * Whether to compute diff hunks.
   * Defaults to true.
   */
  computeDiffs?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Patch event types.
 */
export type PatchEventType =
  | "patch:created"
  | "patch:change_recorded"
  | "patch:committed"
  | "patch:rolledback"
  | "patch:archived";

/**
 * Patch event payload.
 */
export interface PatchEvent {
  type: PatchEventType;
  patchId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
