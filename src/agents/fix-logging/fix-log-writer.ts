/**
 * Fix Log Writer
 *
 * Append-only writer for fix log entries.
 * Handles persistence, rotation, and atomic writes.
 *
 * @module agents/fix-logging/fix-log-writer
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 41 Fix Logging
 */

import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import type {
  EnhancedFixLogEntry,
  FixLogStorage,
} from "./types.js";
import {
  DEFAULT_STORAGE_DIR,
  FIX_LOG_FILENAME,
  FIX_LOG_SCHEMA_VERSION,
  MAX_LOG_ENTRIES,
  ROTATION_KEEP_PERCENT,
} from "./types.js";
import {
  validateFixLogStorage,
  createEmptyFixLogStorage,
  type ValidatedFixLogStorage,
} from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export interface FixLogWriterConfig {
  /** Storage directory */
  storageDir: string;
  /** Maximum entries before rotation */
  maxEntries: number;
  /** Percent to keep on rotation (0-1) */
  rotationKeepPercent: number;
  /** Create directory if not exists */
  createDir: boolean;
}

export interface WriteResult {
  /** Success status */
  success: boolean;
  /** Entry ID if successful */
  entryId?: string;
  /** Error message if failed */
  error?: string;
  /** Was rotation triggered? */
  rotated: boolean;
  /** Total entries after write */
  totalEntries: number;
}

// ============================================================================
// Fix Log Writer
// ============================================================================

/**
 * FixLogWriter - Append-only writer for fix logs.
 *
 * Features:
 * 1. Append-only writes (no data loss)
 * 2. Automatic rotation when max entries exceeded
 * 3. Atomic writes with temp file
 * 4. Schema validation
 */
export class FixLogWriter {
  private config: FixLogWriterConfig;
  private storage: ValidatedFixLogStorage | null = null;
  private filePath: string;

  constructor(config?: Partial<FixLogWriterConfig>) {
    const resolvedDir = (config?.storageDir ?? DEFAULT_STORAGE_DIR).replace(
      /^~/,
      homedir()
    );

    this.config = {
      storageDir: resolvedDir,
      maxEntries: config?.maxEntries ?? MAX_LOG_ENTRIES,
      rotationKeepPercent: config?.rotationKeepPercent ?? ROTATION_KEEP_PERCENT,
      createDir: config?.createDir ?? true,
    };

    this.filePath = path.join(this.config.storageDir, FIX_LOG_FILENAME);
  }

  /**
   * Initialize the writer (ensure directory exists, load existing data).
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    if (this.config.createDir) {
      await fs.mkdir(this.config.storageDir, { recursive: true });
    }

    // Load existing storage or create new
    this.storage = await this.loadOrCreate();
  }

  /**
   * Load existing storage or create new.
   */
  private async loadOrCreate(): Promise<ValidatedFixLogStorage> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const data = JSON.parse(content);

      const validation = validateFixLogStorage(data);
      if (validation.success) {
        return validation.data;
      }

      // Invalid data, backup and create new
      const backupPath = `${this.filePath}.backup.${Date.now()}`;
      await fs.rename(this.filePath, backupPath);
      return createEmptyFixLogStorage();
    } catch (error) {
      // File doesn't exist, create new
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyFixLogStorage();
      }
      throw error;
    }
  }

  /**
   * Append a fix log entry.
   */
  async append(entry: EnhancedFixLogEntry): Promise<WriteResult> {
    if (!this.storage) {
      await this.initialize();
    }

    try {
      // Add entry
      this.storage!.entries.push(entry);
      this.storage!.metadata.totalRecorded++;
      this.storage!.lastUpdated = new Date().toISOString();

      // Check if rotation needed
      let rotated = false;
      if (this.storage!.entries.length > this.config.maxEntries) {
        await this.rotate();
        rotated = true;
      }

      // Write atomically
      await this.writeAtomic();

      return {
        success: true,
        entryId: entry.id,
        rotated,
        totalEntries: this.storage!.entries.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rotated: false,
        totalEntries: this.storage?.entries.length ?? 0,
      };
    }
  }

  /**
   * Append multiple entries.
   */
  async appendBatch(entries: EnhancedFixLogEntry[]): Promise<WriteResult> {
    if (!this.storage) {
      await this.initialize();
    }

    try {
      // Add all entries
      this.storage!.entries.push(...entries);
      this.storage!.metadata.totalRecorded += entries.length;
      this.storage!.lastUpdated = new Date().toISOString();

      // Check if rotation needed
      let rotated = false;
      if (this.storage!.entries.length > this.config.maxEntries) {
        await this.rotate();
        rotated = true;
      }

      // Write atomically
      await this.writeAtomic();

      return {
        success: true,
        ...(entries.length > 0 && { entryId: entries[entries.length - 1]!.id }),
        rotated,
        totalEntries: this.storage!.entries.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rotated: false,
        totalEntries: this.storage?.entries.length ?? 0,
      };
    }
  }

  /**
   * Rotate entries (keep most recent).
   */
  private async rotate(): Promise<void> {
    const keepCount = Math.floor(
      this.config.maxEntries * this.config.rotationKeepPercent
    );

    const removedCount = this.storage!.entries.length - keepCount;

    // Keep most recent entries (sorted by timestamp)
    this.storage!.entries = this.storage!.entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, keepCount);

    this.storage!.metadata.rotatedCount += removedCount;
    this.storage!.metadata.lastRotation = new Date().toISOString();
  }

  /**
   * Write storage atomically (write to temp, then rename).
   */
  private async writeAtomic(): Promise<void> {
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    const content = JSON.stringify(this.storage, null, 2);

    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, this.filePath);
  }

  /**
   * Get all entries.
   */
  async getEntries(): Promise<EnhancedFixLogEntry[]> {
    if (!this.storage) {
      await this.initialize();
    }
    return this.storage!.entries as EnhancedFixLogEntry[];
  }

  /**
   * Get storage metadata.
   */
  async getMetadata(): Promise<FixLogStorage["metadata"]> {
    if (!this.storage) {
      await this.initialize();
    }
    return this.storage!.metadata as FixLogStorage["metadata"];
  }

  /**
   * Get entry count.
   */
  async getCount(): Promise<number> {
    if (!this.storage) {
      await this.initialize();
    }
    return this.storage!.entries.length;
  }

  /**
   * Get entries by date range.
   */
  async getEntriesByDateRange(
    from: Date,
    to: Date
  ): Promise<EnhancedFixLogEntry[]> {
    if (!this.storage) {
      await this.initialize();
    }

    return this.storage!.entries.filter((entry) => {
      const timestamp = new Date(entry.timestamp);
      return timestamp >= from && timestamp <= to;
    }) as EnhancedFixLogEntry[];
  }

  /**
   * Get entries by session ID.
   */
  async getEntriesBySession(sessionId: string): Promise<EnhancedFixLogEntry[]> {
    if (!this.storage) {
      await this.initialize();
    }

    return this.storage!.entries.filter((entry) => entry.sessionId === sessionId) as EnhancedFixLogEntry[];
  }

  /**
   * Get entries by pattern ID.
   */
  async getEntriesByPattern(patternId: string): Promise<EnhancedFixLogEntry[]> {
    if (!this.storage) {
      await this.initialize();
    }

    return this.storage!.entries.filter((entry) => entry.fix.patternId === patternId) as EnhancedFixLogEntry[];
  }

  /**
   * Export to JSON.
   */
  async exportJson(): Promise<string> {
    if (!this.storage) {
      await this.initialize();
    }
    return JSON.stringify(this.storage, null, 2);
  }

  /**
   * Export to CSV.
   */
  async exportCsv(): Promise<string> {
    if (!this.storage) {
      await this.initialize();
    }

    const headers = [
      "id",
      "timestamp",
      "sessionId",
      "category",
      "errorCode",
      "file",
      "line",
      "patternId",
      "fixType",
      "status",
      "verified",
      "durationMs",
      "escalated",
    ];

    const rows = this.storage!.entries.map((entry) => [
      entry.id,
      entry.timestamp,
      entry.sessionId,
      entry.error.category,
      entry.error.code,
      entry.error.file,
      entry.error.line,
      entry.fix.patternId,
      entry.fix.type,
      entry.outcome.status,
      entry.outcome.verified,
      entry.outcome.durationMs,
      entry.outcome.escalated,
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }

  /**
   * Clear all entries (for testing).
   */
  async clear(): Promise<void> {
    this.storage = createEmptyFixLogStorage();
    await this.writeAtomic();
  }

  /**
   * Get file path.
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Get schema version.
   */
  getSchemaVersion(): string {
    return FIX_LOG_SCHEMA_VERSION;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a FixLogWriter instance.
 */
export function createFixLogWriter(
  config?: Partial<FixLogWriterConfig>
): FixLogWriter {
  return new FixLogWriter(config);
}

// Singleton instance
let globalWriter: FixLogWriter | undefined;

/**
 * Get the global FixLogWriter instance.
 */
export async function getFixLogWriter(): Promise<FixLogWriter> {
  if (!globalWriter) {
    globalWriter = new FixLogWriter();
    await globalWriter.initialize();
  }
  return globalWriter;
}

/**
 * Reset the global FixLogWriter (for testing).
 */
export function resetFixLogWriter(): void {
  globalWriter = undefined;
}
