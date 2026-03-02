/**
 * Patch Manager
 *
 * Tracks file changes with rollback support for SDLC compliance.
 *
 * Features:
 *   - Create/commit/rollback patches
 *   - Track file changes (create, modify, delete, rename)
 *   - Compute diff hunks for fine-grained changes
 *   - Persist patches for audit trail
 *
 * @module sdlc/patches/patch-manager
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2, Sprint 68 T2.2-T2.5
 * @sprint 68
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, unlink, mkdir, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLogger, type Logger } from "../../logging/index.js";
import {
  type Patch,
  type FileChange,
  type DiffHunk,
  type CreatePatchOptions,
  type RecordChangeOptions,
  type PatchHistoryOptions,
  type RollbackResult,
  type PatchManagerConfig,
} from "./types.js";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique patch ID.
 */
function generatePatchId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `patch-${timestamp}-${random}`;
}

/**
 * Compute SHA256 hash of content.
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Compute diff hunks between two strings.
 * Simple line-based diff implementation.
 */
function computeDiffHunks(oldContent: string, newContent: string): DiffHunk[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const hunks: DiffHunk[] = [];

  // Simple diff: find contiguous changed regions
  let i = 0;
  let j = 0;
  let hunkStart = -1;
  const oldChanged: string[] = [];
  const newChanged: string[] = [];

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (oldLine === newLine) {
      // Lines match - flush any accumulated hunk
      if (hunkStart !== -1) {
        hunks.push({
          startLine: hunkStart + 1,
          endLine: i,
          oldContent: oldChanged.join("\n"),
          newContent: newChanged.join("\n"),
        });
        hunkStart = -1;
        oldChanged.length = 0;
        newChanged.length = 0;
      }
      i++;
      j++;
    } else {
      // Lines differ
      if (hunkStart === -1) {
        hunkStart = i;
      }
      if (i < oldLines.length) {
        oldChanged.push(oldLines[i] ?? "");
        i++;
      }
      if (j < newLines.length) {
        newChanged.push(newLines[j] ?? "");
        j++;
      }
    }
  }

  // Flush final hunk
  if (hunkStart !== -1) {
    hunks.push({
      startLine: hunkStart + 1,
      endLine: Math.max(i, 1),
      oldContent: oldChanged.join("\n"),
      newContent: newChanged.join("\n"),
    });
  }

  return hunks;
}

// ============================================================================
// PatchManager Class
// ============================================================================

/**
 * Manages file change patches with rollback support.
 *
 * @example
 * ```typescript
 * const manager = new PatchManager({
 *   projectRoot: '/path/to/project',
 * });
 *
 * // Start a new patch
 * const patch = await manager.startPatch({
 *   name: 'Add auth feature',
 *   author: '@coder',
 * });
 *
 * // Record changes
 * await manager.recordChange(patch.id, {
 *   path: 'src/auth.ts',
 *   changeType: 'create',
 *   newContent: '// auth code',
 * });
 *
 * // Commit or rollback
 * await manager.commitPatch(patch.id);
 * // or
 * await manager.rollbackPatch(patch.id);
 * ```
 */
export class PatchManager {
  private readonly config: Required<PatchManagerConfig>;
  private readonly log: Logger;
  private patches: Map<string, Patch> = new Map();
  private activePatchId: string | null = null;

  constructor(config: PatchManagerConfig) {
    this.config = {
      patchDir: ".endiorbot/patches",
      maxPatches: 100,
      computeDiffs: true,
      ...config,
    };
    this.log = createLogger("PatchManager");

    // Ensure patch directory exists
    const patchPath = join(this.config.projectRoot, this.config.patchDir);
    if (!existsSync(patchPath)) {
      mkdirSync(patchPath, { recursive: true });
    }
  }

  // ============================================================================
  // Patch Lifecycle
  // ============================================================================

  /**
   * Start a new patch for tracking changes.
   */
  async startPatch(options: CreatePatchOptions): Promise<Patch> {
    const id = generatePatchId();
    const now = new Date().toISOString();

    const patch: Patch = {
      id,
      name: options.name,
      createdAt: now,
      updatedAt: now,
      author: options.author,
      changes: [],
      state: "pending",
      canRollback: true,
    };

    // Add optional fields without assigning undefined (exactOptionalPropertyTypes)
    if (options.description) patch.description = options.description;
    if (options.sprintId) patch.sprintId = options.sprintId;
    if (options.taskId) patch.taskId = options.taskId;
    if (options.checkpointId) patch.checkpointId = options.checkpointId;
    if (options.metadata) patch.metadata = options.metadata;

    this.patches.set(id, patch);
    this.activePatchId = id;

    this.log.info("Patch started", { id, name: options.name });

    // Persist patch
    await this.persistPatch(patch);

    return patch;
  }

  /**
   * Record a file change in the active patch.
   */
  async recordChange(
    patchId: string,
    options: RecordChangeOptions
  ): Promise<FileChange> {
    const patch = this.patches.get(patchId);
    if (!patch) {
      throw new Error(`Patch not found: ${patchId}`);
    }

    if (patch.state !== "pending") {
      throw new Error(`Cannot record changes to ${patch.state} patch`);
    }

    const now = new Date().toISOString();
    const change: FileChange = {
      path: options.path,
      changeType: options.changeType,
      diffHunks: [],
      timestamp: now,
    };

    // Add content and compute diffs based on change type
    switch (options.changeType) {
      case "create":
        if (options.newContent !== undefined) {
          change.newContent = options.newContent;
          change.newHash = hashContent(options.newContent);
        }
        break;

      case "modify":
        if (options.previousContent !== undefined) {
          change.previousContent = options.previousContent;
          change.previousHash = hashContent(options.previousContent);
        }
        if (options.newContent !== undefined) {
          change.newContent = options.newContent;
          change.newHash = hashContent(options.newContent);
        }
        // Compute diff hunks
        if (
          this.config.computeDiffs &&
          options.previousContent !== undefined &&
          options.newContent !== undefined
        ) {
          change.diffHunks = computeDiffHunks(
            options.previousContent,
            options.newContent
          );
        }
        break;

      case "delete":
        if (options.previousContent !== undefined) {
          change.previousContent = options.previousContent;
          change.previousHash = hashContent(options.previousContent);
        }
        break;

      case "rename":
        if (options.originalPath) {
          change.originalPath = options.originalPath;
        }
        if (options.previousContent !== undefined) {
          change.previousContent = options.previousContent;
          change.previousHash = hashContent(options.previousContent);
        }
        if (options.newContent !== undefined) {
          change.newContent = options.newContent;
          change.newHash = hashContent(options.newContent);
        }
        break;
    }

    patch.changes.push(change);
    patch.updatedAt = now;

    this.log.debug("Change recorded", {
      patchId,
      path: options.path,
      changeType: options.changeType,
    });

    // Persist updated patch
    await this.persistPatch(patch);

    return change;
  }

  /**
   * Commit a patch (finalize changes).
   */
  async commitPatch(patchId: string): Promise<Patch> {
    const patch = this.patches.get(patchId);
    if (!patch) {
      throw new Error(`Patch not found: ${patchId}`);
    }

    if (patch.state !== "pending") {
      throw new Error(`Cannot commit ${patch.state} patch`);
    }

    patch.state = "committed";
    patch.updatedAt = new Date().toISOString();

    if (this.activePatchId === patchId) {
      this.activePatchId = null;
    }

    this.log.info("Patch committed", {
      id: patchId,
      changes: patch.changes.length,
    });

    // Persist updated patch
    await this.persistPatch(patch);

    return patch;
  }

  /**
   * Rollback a patch (revert all changes).
   */
  async rollbackPatch(patchId: string): Promise<RollbackResult> {
    const patch = this.patches.get(patchId);
    if (!patch) {
      throw new Error(`Patch not found: ${patchId}`);
    }

    if (!patch.canRollback) {
      return {
        success: false,
        filesRolledBack: 0,
        errors: [{ path: "*", error: "Patch cannot be rolled back" }],
      };
    }

    const result: RollbackResult = {
      success: true,
      filesRolledBack: 0,
      errors: [],
    };

    // Rollback changes in reverse order
    const reversedChanges = [...patch.changes].reverse();

    for (const change of reversedChanges) {
      try {
        await this.rollbackChange(change);
        result.filesRolledBack++;
      } catch (error) {
        result.success = false;
        result.errors.push({
          path: change.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update patch state
    patch.state = "rolledback";
    patch.updatedAt = new Date().toISOString();

    if (this.activePatchId === patchId) {
      this.activePatchId = null;
    }

    this.log.info("Patch rolled back", {
      id: patchId,
      filesRolledBack: result.filesRolledBack,
      errors: result.errors.length,
    });

    // Persist updated patch
    await this.persistPatch(patch);

    return result;
  }

  // ============================================================================
  // Change Rollback
  // ============================================================================

  /**
   * Rollback a single file change.
   */
  private async rollbackChange(change: FileChange): Promise<void> {
    const fullPath = join(this.config.projectRoot, change.path);

    switch (change.changeType) {
      case "create":
        // Delete the created file
        if (existsSync(fullPath)) {
          await unlink(fullPath);
        }
        break;

      case "modify":
        // Restore previous content
        if (change.previousContent !== undefined) {
          await this.ensureDir(dirname(fullPath));
          await writeFile(fullPath, change.previousContent, "utf-8");
        }
        break;

      case "delete":
        // Recreate the deleted file
        if (change.previousContent !== undefined) {
          await this.ensureDir(dirname(fullPath));
          await writeFile(fullPath, change.previousContent, "utf-8");
        }
        break;

      case "rename":
        // Rename back to original path
        if (change.originalPath) {
          const originalFullPath = join(
            this.config.projectRoot,
            change.originalPath
          );
          const currentContent = await readFile(fullPath, "utf-8");
          await this.ensureDir(dirname(originalFullPath));
          await writeFile(originalFullPath, currentContent, "utf-8");
          await unlink(fullPath);
        }
        break;
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a patch by ID.
   */
  getPatch(patchId: string): Patch | undefined {
    return this.patches.get(patchId);
  }

  /**
   * Get the active patch.
   */
  getActivePatch(): Patch | undefined {
    if (!this.activePatchId) return undefined;
    return this.patches.get(this.activePatchId);
  }

  /**
   * Get patch history.
   */
  async getHistory(options: PatchHistoryOptions = {}): Promise<Patch[]> {
    // Load patches from disk if not in memory
    await this.loadPatches();

    let patches = Array.from(this.patches.values());

    // Apply filters
    if (options.state) {
      patches = patches.filter((p) => p.state === options.state);
    }
    if (options.sprintId) {
      patches = patches.filter((p) => p.sprintId === options.sprintId);
    }
    if (options.author) {
      patches = patches.filter((p) => p.author === options.author);
    }
    if (options.after) {
      const afterDate = new Date(options.after);
      patches = patches.filter((p) => new Date(p.createdAt) >= afterDate);
    }
    if (options.before) {
      const beforeDate = new Date(options.before);
      patches = patches.filter((p) => new Date(p.createdAt) <= beforeDate);
    }

    // Sort by creation time (newest first)
    patches.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit
    if (options.limit && options.limit > 0) {
      patches = patches.slice(0, options.limit);
    }

    return patches;
  }

  /**
   * Get change history for a specific file.
   */
  async getFileHistory(path: string): Promise<FileChange[]> {
    await this.loadPatches();

    const changes: FileChange[] = [];

    for (const patch of this.patches.values()) {
      for (const change of patch.changes) {
        if (change.path === path || change.originalPath === path) {
          changes.push(change);
        }
      }
    }

    // Sort by timestamp (newest first)
    changes.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return changes;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Persist a patch to disk.
   */
  private async persistPatch(patch: Patch): Promise<void> {
    const patchPath = join(
      this.config.projectRoot,
      this.config.patchDir,
      `${patch.id}.json`
    );

    await this.ensureDir(dirname(patchPath));
    await writeFile(patchPath, JSON.stringify(patch, null, 2), "utf-8");
  }

  /**
   * Load patches from disk.
   */
  private async loadPatches(): Promise<void> {
    const patchDir = join(this.config.projectRoot, this.config.patchDir);

    if (!existsSync(patchDir)) {
      return;
    }

    try {
      const files = await readdir(patchDir);
      const patchFiles = files.filter((f) => f.endsWith(".json"));

      for (const file of patchFiles) {
        const filePath = join(patchDir, file);
        try {
          const content = await readFile(filePath, "utf-8");
          const patch = JSON.parse(content) as Patch;
          this.patches.set(patch.id, patch);
        } catch (error) {
          this.log.warn(`Failed to load patch: ${file}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.log.warn("Failed to load patches", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Archive old patches.
   */
  async archiveOldPatches(): Promise<number> {
    await this.loadPatches();

    const patches = await this.getHistory();
    const toArchive = patches.slice(this.config.maxPatches);

    if (toArchive.length === 0) {
      return 0;
    }

    const archiveDir = join(
      this.config.projectRoot,
      this.config.patchDir,
      "archive"
    );
    await this.ensureDir(archiveDir);

    for (const patch of toArchive) {
      const sourcePath = join(
        this.config.projectRoot,
        this.config.patchDir,
        `${patch.id}.json`
      );
      const targetPath = join(archiveDir, `${patch.id}.json`);

      try {
        const content = await readFile(sourcePath, "utf-8");
        await writeFile(targetPath, content, "utf-8");
        await rm(sourcePath);
        this.patches.delete(patch.id);
      } catch (error) {
        this.log.warn(`Failed to archive patch: ${patch.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.log.info(`Archived ${toArchive.length} patches`);
    return toArchive.length;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Ensure a directory exists.
   */
  private async ensureDir(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: PatchManager | null = null;

/**
 * Get the singleton PatchManager instance.
 */
export function getPatchManager(config?: PatchManagerConfig): PatchManager {
  if (!managerInstance && config) {
    managerInstance = new PatchManager(config);
  }
  if (!managerInstance) {
    throw new Error(
      "PatchManager not initialized. Call with config first."
    );
  }
  return managerInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetPatchManager(): void {
  managerInstance = null;
}
