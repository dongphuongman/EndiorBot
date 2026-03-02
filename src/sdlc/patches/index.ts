/**
 * Patches Module
 *
 * Exports for PatchManager - file change tracking with rollback support.
 *
 * @module sdlc/patches
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

// Types
export {
  type PatchState,
  type ChangeType,
  type DiffHunk,
  type FileChange,
  type Patch,
  type CreatePatchOptions,
  type RecordChangeOptions,
  type PatchHistoryOptions,
  type RollbackResult,
  type PatchManagerConfig,
  type PatchEventType,
  type PatchEvent,
} from "./types.js";

// Manager
export {
  PatchManager,
  getPatchManager,
  resetPatchManager,
} from "./patch-manager.js";
