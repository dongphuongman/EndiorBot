/**
 * Pattern Manager
 *
 * Manages fix patterns for learning engine.
 * Manual pattern creation and import/export.
 *
 * @module agents/fix-logging/pattern-manager
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 41 Fix Logging
 */

import * as fs from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import type {
  ErrorPattern,
  PatternStatus,
  PatternQueryOptions,
  ErrorCategory,
  FixType,
  FixConfidence,
} from "./types.js";
import {
  DEFAULT_STORAGE_DIR,
  PATTERNS_FILENAME,
} from "./types.js";
import {
  validatePatternStorage,
  createEmptyPatternStorage,
  generatePatternId,
  type ValidatedPatternStorage,
} from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export interface PatternManagerConfig {
  /** Storage directory */
  storageDir: string;
  /** Create directory if not exists */
  createDir: boolean;
}

export interface CreatePatternParams {
  /** Error category */
  category: ErrorCategory;
  /** Error code */
  errorCode: string;
  /** Fix type */
  fixType: FixType;
  /** Description */
  description: string;
  /** Confidence */
  confidence: FixConfidence;
  /** Status */
  status?: PatternStatus;
}

// ============================================================================
// Default Patterns
// ============================================================================

/**
 * Default patterns from deterministic fixer.
 */
const DEFAULT_PATTERNS: CreatePatternParams[] = [
  // TypeScript patterns
  { category: "TYPE", errorCode: "TS2304", fixType: "add_import", description: "Add missing import", confidence: "high" },
  { category: "TYPE", errorCode: "TS2339", fixType: "add_property", description: "Add missing property", confidence: "medium" },
  { category: "TYPE", errorCode: "TS6133", fixType: "remove_unused", description: "Remove unused variable", confidence: "high" },
  { category: "TYPE", errorCode: "TS7006", fixType: "add_type", description: "Add type annotation", confidence: "medium" },
  { category: "TYPE", errorCode: "TS2322", fixType: "add_type", description: "Fix type mismatch", confidence: "medium" },
  { category: "TYPE", errorCode: "TS2345", fixType: "add_type", description: "Fix argument type", confidence: "medium" },
  { category: "TYPE", errorCode: "TS1005", fixType: "fix_syntax", description: "Fix syntax error", confidence: "high" },
  { category: "TYPE", errorCode: "TS2532", fixType: "fix_null_check", description: "Add null check", confidence: "high" },
  { category: "TYPE", errorCode: "TS2531", fixType: "fix_null_check", description: "Handle undefined", confidence: "high" },
  { category: "TYPE", errorCode: "TS2355", fixType: "add_return", description: "Add return statement", confidence: "high" },

  // ESLint patterns
  { category: "LINT", errorCode: "semi", fixType: "fix_lint_rule", description: "Fix semicolon", confidence: "high" },
  { category: "LINT", errorCode: "quotes", fixType: "fix_lint_rule", description: "Fix quotes style", confidence: "high" },
  { category: "LINT", errorCode: "prefer-const", fixType: "fix_lint_rule", description: "Use const", confidence: "high" },
  { category: "LINT", errorCode: "no-trailing-spaces", fixType: "fix_format", description: "Remove trailing spaces", confidence: "high" },
  { category: "LINT", errorCode: "eol-last", fixType: "fix_format", description: "Add newline at end", confidence: "high" },
  { category: "LINT", errorCode: "no-unused-vars", fixType: "remove_unused", description: "Remove unused variable", confidence: "high" },
  { category: "LINT", errorCode: "@typescript-eslint/no-unused-vars", fixType: "remove_unused", description: "Remove unused variable", confidence: "high" },
  { category: "LINT", errorCode: "no-extra-semi", fixType: "fix_lint_rule", description: "Remove extra semicolon", confidence: "high" },
];

// ============================================================================
// Pattern Manager
// ============================================================================

/**
 * PatternManager - Manages fix patterns.
 *
 * Features:
 * 1. Manual pattern creation/editing
 * 2. Import/export patterns
 * 3. Query patterns
 * 4. Update pattern metadata
 */
export class PatternManager {
  private config: PatternManagerConfig;
  private storage: ValidatedPatternStorage | null = null;
  private filePath: string;
  private initialized = false;

  constructor(config?: Partial<PatternManagerConfig>) {
    const resolvedDir = (config?.storageDir ?? DEFAULT_STORAGE_DIR).replace(
      /^~/,
      homedir()
    );

    this.config = {
      storageDir: resolvedDir,
      createDir: config?.createDir ?? true,
    };

    this.filePath = path.join(this.config.storageDir, PATTERNS_FILENAME);
  }

  /**
   * Initialize the manager.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    if (this.config.createDir) {
      await fs.mkdir(this.config.storageDir, { recursive: true });
    }

    // Load or create storage
    this.storage = await this.loadOrCreate();
    this.initialized = true;
  }

  /**
   * Load existing storage or create with defaults.
   */
  private async loadOrCreate(): Promise<ValidatedPatternStorage> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const data = JSON.parse(content);

      const validation = validatePatternStorage(data);
      if (validation.success) {
        return validation.data;
      }

      // Invalid, backup and recreate
      const backupPath = `${this.filePath}.backup.${Date.now()}`;
      await fs.rename(this.filePath, backupPath);
      return this.createWithDefaults();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.createWithDefaults();
      }
      throw error;
    }
  }

  /**
   * Create storage with default patterns.
   */
  private createWithDefaults(): ValidatedPatternStorage {
    const storage = createEmptyPatternStorage();
    const now = new Date().toISOString();

    for (const params of DEFAULT_PATTERNS) {
      const pattern = this.createPatternObject(params, now);
      storage.patterns.push(pattern);
    }

    storage.metadata.source = "default";
    return storage;
  }

  /**
   * Create pattern object from params.
   */
  private createPatternObject(
    params: CreatePatternParams,
    timestamp: string
  ): ErrorPattern {
    const id = generatePatternId(
      params.category,
      params.errorCode,
      params.fixType
    );

    return {
      id,
      description: params.description,
      category: params.category,
      errorCode: params.errorCode,
      fixType: params.fixType,
      confidence: params.confidence,
      status: params.status ?? "active",
      metadata: {
        appliedCount: 0,
        successCount: 0,
        failureCount: 0,
        escalationCount: 0,
        successRate: 0,
        avgDurationMs: 0,
        source: "default",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Save storage.
   */
  private async save(): Promise<void> {
    this.storage!.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(this.storage, null, 2);
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, this.filePath);
  }

  /**
   * Add a new pattern.
   */
  async addPattern(params: CreatePatternParams): Promise<ErrorPattern> {
    if (!this.initialized) {
      await this.initialize();
    }

    const now = new Date().toISOString();
    const pattern = this.createPatternObject(params, now);
    pattern.metadata.source = "manual";

    // Check for existing
    const existing = this.storage!.patterns.find((p) => p.id === pattern.id);
    if (existing) {
      throw new Error(`Pattern ${pattern.id} already exists`);
    }

    this.storage!.patterns.push(pattern);
    await this.save();

    return pattern;
  }

  /**
   * Update a pattern.
   */
  async updatePattern(
    patternId: string,
    updates: Partial<Omit<ErrorPattern, "id" | "createdAt">>
  ): Promise<ErrorPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const index = this.storage!.patterns.findIndex((p) => p.id === patternId);
    if (index === -1) {
      return null;
    }

    const pattern = this.storage!.patterns[index]!;
    const updated = {
      ...pattern,
      ...updates,
      id: pattern.id,
      createdAt: pattern.createdAt,
      updatedAt: new Date().toISOString(),
    } as ErrorPattern;

    this.storage!.patterns[index] = updated;
    await this.save();

    return updated;
  }

  /**
   * Update pattern metadata (for tracking success/failure).
   */
  async updateMetadata(
    patternId: string,
    success: boolean,
    durationMs: number,
    escalated = false
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const pattern = this.storage!.patterns.find((p) => p.id === patternId);
    if (!pattern) return;

    pattern.metadata.appliedCount++;
    if (success) {
      pattern.metadata.successCount++;
    } else {
      pattern.metadata.failureCount++;
    }
    if (escalated) {
      pattern.metadata.escalationCount++;
    }

    // Update success rate
    pattern.metadata.successRate =
      pattern.metadata.appliedCount > 0
        ? pattern.metadata.successCount / pattern.metadata.appliedCount
        : 0;

    // Update average duration
    const totalDuration =
      pattern.metadata.avgDurationMs * (pattern.metadata.appliedCount - 1) +
      durationMs;
    pattern.metadata.avgDurationMs = totalDuration / pattern.metadata.appliedCount;

    pattern.metadata.lastUsedAt = new Date().toISOString();
    pattern.updatedAt = new Date().toISOString();

    await this.save();
  }

  /**
   * Get a pattern by ID.
   */
  async getPattern(patternId: string): Promise<ErrorPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return (this.storage!.patterns.find((p) => p.id === patternId) ?? null) as ErrorPattern | null;
  }

  /**
   * Find pattern for error.
   */
  async findPatternForError(
    category: ErrorCategory,
    errorCode: string
  ): Promise<ErrorPattern | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Find active patterns matching the error
    const matches = this.storage!.patterns.filter(
      (p) =>
        p.category === category &&
        p.errorCode === errorCode &&
        p.status === "active"
    );

    if (matches.length === 0) return null;

    // Return highest success rate pattern
    return matches.sort((a, b) => b.metadata.successRate - a.metadata.successRate)[0]! as ErrorPattern;
  }

  /**
   * Query patterns.
   */
  async query(options: PatternQueryOptions): Promise<ErrorPattern[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    let patterns = this.storage!.patterns;

    // Apply filters
    if (options.category) {
      patterns = patterns.filter((p) => p.category === options.category);
    }
    if (options.status) {
      patterns = patterns.filter((p) => p.status === options.status);
    }
    if (options.errorCode) {
      patterns = patterns.filter((p) => p.errorCode === options.errorCode);
    }
    if (options.minSuccessRate !== undefined) {
      patterns = patterns.filter(
        (p) => p.metadata.successRate >= options.minSuccessRate!
      );
    }

    // Sort
    const sortBy = options.sortBy ?? "createdAt";
    const sortOrder = options.sortOrder ?? "desc";

    patterns.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "successRate":
          comparison = a.metadata.successRate - b.metadata.successRate;
          break;
        case "appliedCount":
          comparison = a.metadata.appliedCount - b.metadata.appliedCount;
          break;
        case "createdAt":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return patterns as ErrorPattern[];
  }

  /**
   * Get all patterns.
   */
  async getAllPatterns(): Promise<ErrorPattern[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.storage!.patterns as ErrorPattern[];
  }

  /**
   * Delete a pattern.
   */
  async deletePattern(patternId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    const index = this.storage!.patterns.findIndex((p) => p.id === patternId);
    if (index === -1) return false;

    this.storage!.patterns.splice(index, 1);
    await this.save();

    return true;
  }

  /**
   * Export patterns to JSON string.
   */
  async exportJson(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    return JSON.stringify(this.storage, null, 2);
  }

  /**
   * Import patterns from JSON string.
   */
  async importJson(json: string, merge = true): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const data = JSON.parse(json);
    const validation = validatePatternStorage(data);

    if (!validation.success) {
      throw new Error(`Invalid pattern data: ${validation.error.message}`);
    }

    if (merge) {
      // Merge: add new, update existing
      let imported = 0;
      for (const pattern of validation.data.patterns) {
        const existing = this.storage!.patterns.find((p) => p.id === pattern.id);
        if (existing) {
          Object.assign(existing, pattern);
        } else {
          this.storage!.patterns.push(pattern);
        }
        imported++;
      }
      this.storage!.metadata.importedAt = new Date().toISOString();
      await this.save();
      return imported;
    } else {
      // Replace all
      this.storage = validation.data;
      this.storage.metadata.importedAt = new Date().toISOString();
      await this.save();
      return this.storage.patterns.length;
    }
  }

  /**
   * Get pattern count.
   */
  async getCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.storage!.patterns.length;
  }

  /**
   * Reset to defaults.
   */
  async resetToDefaults(): Promise<void> {
    this.storage = this.createWithDefaults();
    await this.save();
  }

  /**
   * Clear all patterns (for testing).
   */
  async clear(): Promise<void> {
    this.storage = createEmptyPatternStorage();
    await this.save();
  }

  /**
   * Get file path.
   */
  getFilePath(): string {
    return this.filePath;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PatternManager instance.
 */
export function createPatternManager(
  config?: Partial<PatternManagerConfig>
): PatternManager {
  return new PatternManager(config);
}

// Singleton instance
let globalManager: PatternManager | undefined;

/**
 * Get the global PatternManager instance.
 */
export async function getPatternManager(): Promise<PatternManager> {
  if (!globalManager) {
    globalManager = new PatternManager();
    await globalManager.initialize();
  }
  return globalManager;
}

/**
 * Reset the global PatternManager (for testing).
 */
export function resetPatternManager(): void {
  globalManager = undefined;
}
