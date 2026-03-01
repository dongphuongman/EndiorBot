/**
 * Spec Snapshot Anchor Manager
 *
 * Enhanced spec snapshot management with context anchoring integration.
 * Sprint 65: T5.9 - Spec Snapshot manager enhancement.
 *
 * This wraps the search module's SpecSnapshotManager and adds:
 * - Drift detection with ADR-011 policy support
 * - Context anchor persistence
 * - Snapshot versioning and history
 *
 * @module context/spec-snapshot-anchor
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.9
 * @sprint 65
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createLogger, type Logger } from "../logging/index.js";
import { getContextAnchor, type ContextAnchor } from "./context-anchor.js";
import {
  type SpecSnapshot,
  type SpecSource,
  type DriftPolicy,
  type DriftStatus,
  type DriftAction,
  DEFAULT_DRIFT_POLICY,
} from "./types.js";
import {
  SpecSnapshotManager as SearchSpecSnapshotManager,
  DEFAULT_SPEC_SOURCES,
} from "../search/spec-snapshot.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a spec snapshot.
 */
export interface CreateSnapshotOptions {
  /** Custom sources to include */
  sources?: string[];
  /** Custom drift policy */
  driftPolicy?: Partial<DriftPolicy>;
  /** Tags for categorization */
  tags?: string[];
  /** SDLC stage */
  stage?: string;
}

/**
 * Drift check result.
 */
export interface DriftCheckResult {
  /** Overall drift status */
  status: DriftStatus;
  /** Files that have drifted */
  driftedFiles: DriftedFile[];
  /** Drift percentage */
  driftPercent: number;
  /** Recommended action */
  action: DriftAction;
  /** Human-readable summary */
  summary: string;
}

/**
 * Details about a drifted file.
 */
export interface DriftedFile {
  /** File path */
  path: string;
  /** Original hash */
  originalHash: string;
  /** Current hash */
  currentHash: string;
  /** Drift type */
  type: "modified" | "deleted" | "added";
}

// ============================================================================
// SpecSnapshotAnchor Class
// ============================================================================

/**
 * Enhanced Spec Snapshot Manager with context anchoring.
 *
 * @example
 * ```typescript
 * const manager = getSpecSnapshotAnchor();
 *
 * // Create a snapshot
 * const snapshot = await manager.create({
 *   sources: ["docs/01-planning/*.md"],
 *   driftPolicy: { action: "pause_and_escalate" },
 * });
 *
 * // Check for drift
 * const drift = await manager.checkDrift(snapshot.id);
 * if (drift.status === "major_drift") {
 *   console.log("Drift detected:", drift.summary);
 * }
 * ```
 */
export class SpecSnapshotAnchor {
  private readonly anchor: ContextAnchor;
  private readonly searchManager: SearchSpecSnapshotManager;
  private readonly logger: Logger;
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd(), anchor?: ContextAnchor) {
    this.projectRoot = projectRoot;
    this.anchor = anchor ?? getContextAnchor();
    this.searchManager = new SearchSpecSnapshotManager(projectRoot);
    this.logger = createLogger("SpecSnapshotAnchor");
  }

  // =========================================================================
  // Snapshot Creation
  // =========================================================================

  /**
   * Create a new spec snapshot.
   */
  async create(options: CreateSnapshotOptions = {}): Promise<SpecSnapshot> {
    // Load search manager if not already loaded
    if (!this.searchManager.isLoaded()) {
      await this.searchManager.load();
    }

    // Get sources
    const sources =
      options.sources ?? this.searchManager.getSourcePatterns();

    // Build source entries with hashes
    const sourceEntries: SpecSource[] = [];
    for (const pattern of sources) {
      const files = await this.resolvePattern(pattern);
      for (const file of files) {
        const entry = await this.buildSourceEntry(file);
        if (entry) {
          sourceEntries.push(entry);
        }
      }
    }

    // Compute content hash
    const contentHash = this.computeContentHash(sourceEntries);

    // Build drift policy
    const driftPolicy: DriftPolicy = {
      ...DEFAULT_DRIFT_POLICY,
      ...options.driftPolicy,
    };

    // Build snapshot data with proper optional property handling
    const snapshotData: Omit<SpecSnapshot, "id" | "createdAt" | "updatedAt"> = {
      type: "spec_snapshot",
      title: `Spec Snapshot ${new Date().toISOString().slice(0, 10)}`,
      content: `Spec snapshot with ${sourceEntries.length} files`,
      priority: "high",
      state: "active",
      contentHash,
      sources: sourceEntries,
      driftPolicy,
      driftStatus: "in_sync",
      driftedFiles: [],
      tags: options.tags ?? ["spec-snapshot"],
      metadata: {},
    };

    // Add optional properties only if defined
    if (options.stage) {
      snapshotData.stage = options.stage;
    }

    // Create anchor
    const snapshot = await this.anchor.create<SpecSnapshot>(snapshotData);

    this.logger.info("Spec snapshot created", {
      id: snapshot.id,
      files: sourceEntries.length,
      hash: contentHash.slice(0, 8),
    });

    return snapshot;
  }

  /**
   * Get a snapshot by ID.
   */
  async get(id: string): Promise<SpecSnapshot | null> {
    return this.anchor.get<SpecSnapshot>(id);
  }

  /**
   * Get the most recent active snapshot.
   */
  async getCurrent(): Promise<SpecSnapshot | null> {
    const snapshots = await this.anchor.getSpecSnapshots();
    return snapshots[0] ?? null;
  }

  /**
   * List all snapshots.
   */
  async list(): Promise<SpecSnapshot[]> {
    return this.anchor.getSpecSnapshots();
  }

  // =========================================================================
  // Drift Detection
  // =========================================================================

  /**
   * Check for drift against a snapshot.
   */
  async checkDrift(snapshotId: string): Promise<DriftCheckResult> {
    const snapshot = await this.get(snapshotId);

    if (!snapshot) {
      return {
        status: "unknown",
        driftedFiles: [],
        driftPercent: 0,
        action: "ignore",
        summary: "Snapshot not found",
      };
    }

    const driftedFiles: DriftedFile[] = [];

    // Check each source file
    for (const source of snapshot.sources) {
      const currentEntry = await this.buildSourceEntry(source.path);

      if (!currentEntry) {
        // File deleted
        driftedFiles.push({
          path: source.path,
          originalHash: source.hash,
          currentHash: "",
          type: "deleted",
        });
      } else if (currentEntry.hash !== source.hash) {
        // File modified
        driftedFiles.push({
          path: source.path,
          originalHash: source.hash,
          currentHash: currentEntry.hash,
          type: "modified",
        });
      }
    }

    // Calculate drift percentage
    const driftPercent =
      snapshot.sources.length > 0
        ? (driftedFiles.length / snapshot.sources.length) * 100
        : 0;

    // Determine status
    let status: DriftStatus;
    if (driftPercent === 0) {
      status = "in_sync";
    } else if (driftPercent < snapshot.driftPolicy.thresholdPercent) {
      status = "minor_drift";
    } else {
      status = "major_drift";
    }

    // Determine action based on status
    const action =
      status === "major_drift" ? snapshot.driftPolicy.action : "ignore";

    // Build summary
    const summary = this.buildDriftSummary(status, driftedFiles, driftPercent);

    // Update snapshot with drift status
    await this.anchor.update<SpecSnapshot>(snapshotId, {
      driftStatus: status,
      driftedFiles: driftedFiles.map((f) => f.path),
      lastDriftCheck: new Date(),
    });

    return {
      status,
      driftedFiles,
      driftPercent,
      action,
      summary,
    };
  }

  /**
   * Build drift summary message.
   */
  private buildDriftSummary(
    status: DriftStatus,
    driftedFiles: DriftedFile[],
    driftPercent: number
  ): string {
    if (status === "in_sync") {
      return "All spec files are in sync with snapshot";
    }

    const modified = driftedFiles.filter((f) => f.type === "modified").length;
    const deleted = driftedFiles.filter((f) => f.type === "deleted").length;

    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} modified`);
    if (deleted > 0) parts.push(`${deleted} deleted`);

    return `${status === "major_drift" ? "Major" : "Minor"} drift detected: ${parts.join(", ")} (${driftPercent.toFixed(1)}% drift)`;
  }

  // =========================================================================
  // Source Management
  // =========================================================================

  /**
   * Resolve a glob pattern to file paths.
   */
  private async resolvePattern(pattern: string): Promise<string[]> {
    // For now, treat as exact path if no glob chars
    if (!pattern.includes("*") && !pattern.includes("?")) {
      const fullPath = path.join(this.projectRoot, pattern);
      try {
        await fs.access(fullPath);
        return [pattern];
      } catch {
        return [];
      }
    }

    // For glob patterns, we need a glob implementation
    // For now, return the pattern itself (will be resolved by search)
    return [pattern];
  }

  /**
   * Build a source entry for a file.
   */
  private async buildSourceEntry(filepath: string): Promise<SpecSource | null> {
    const fullPath = path.join(this.projectRoot, filepath);

    try {
      const stat = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      return {
        path: filepath,
        hash,
        modifiedAt: stat.mtime,
        size: stat.size,
        includeInContext: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Compute combined hash for all sources.
   */
  private computeContentHash(sources: SpecSource[]): string {
    const combined = sources
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((s) => `${s.path}:${s.hash}`)
      .join("\n");

    return crypto.createHash("sha256").update(combined).digest("hex");
  }

  // =========================================================================
  // Context Integration
  // =========================================================================

  /**
   * Format snapshot for context injection.
   */
  formatForContext(snapshot: SpecSnapshot): string {
    const lines: string[] = [
      `## Spec Snapshot (${snapshot.id.slice(0, 8)})`,
      "",
      `**Status:** ${snapshot.driftStatus}`,
      `**Files:** ${snapshot.sources.length}`,
      `**Hash:** ${snapshot.contentHash.slice(0, 16)}...`,
      "",
    ];

    if (snapshot.driftedFiles.length > 0) {
      lines.push("### Drifted Files");
      lines.push("");
      for (const file of snapshot.driftedFiles) {
        lines.push(`- ⚠️ ${file}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get default spec sources.
   */
  getDefaultSources(): string[] {
    return DEFAULT_SPEC_SOURCES;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: SpecSnapshotAnchor | null = null;

/**
 * Get the default SpecSnapshotAnchor instance.
 */
export function getSpecSnapshotAnchor(
  projectRoot?: string
): SpecSnapshotAnchor {
  if (!defaultManager || (projectRoot && projectRoot !== process.cwd())) {
    defaultManager = new SpecSnapshotAnchor(projectRoot);
  }
  return defaultManager;
}

/**
 * Reset the default manager.
 */
export function resetSpecSnapshotAnchor(): void {
  defaultManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a spec snapshot.
 */
export async function createSpecSnapshot(
  options?: CreateSnapshotOptions
): Promise<SpecSnapshot> {
  const manager = getSpecSnapshotAnchor();
  return manager.create(options);
}

/**
 * Check drift for current snapshot.
 */
export async function checkSpecDrift(): Promise<DriftCheckResult | null> {
  const manager = getSpecSnapshotAnchor();
  const current = await manager.getCurrent();

  if (!current) {
    return null;
  }

  return manager.checkDrift(current.id);
}
