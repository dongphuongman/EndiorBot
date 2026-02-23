/**
 * Fix Logger for Self-Correction Engine
 *
 * Persists fix history to fix-log.json for auditing and analysis.
 *
 * Per Sprint 37 requirements:
 * - Log all fix attempts (success and failure)
 * - Track fix patterns over time
 * - Support session-based logging
 * - Enable analysis of auto-fix effectiveness
 *
 * @module src/self-correction/fix-logger
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 * @authority ADR-007 Budget Control, Phase 3
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type {
  FixLogEntry,
  FixResult,
  SelfCorrectionStats,
  ErrorCategory,
} from "./types.js";
import { AUTO_FIX_TARGETS } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Fix log configuration.
 */
export interface FixLoggerConfig {
  /** Path to fix-log.json */
  logPath: string;
  /** Session ID for grouping entries */
  sessionId: string;
  /** Maximum entries to keep in log */
  maxEntries: number;
  /** Auto-save after each entry */
  autoSave: boolean;
  /** Include code snippets in log */
  includeCodeSnippets: boolean;
}

/**
 * Fix log file structure.
 */
export interface FixLogFile {
  /** Version of log format */
  version: string;
  /** Creation timestamp */
  created: string;
  /** Last updated timestamp */
  updated: string;
  /** Log entries */
  entries: FixLogEntry[];
  /** Session summaries */
  sessions: Record<string, {
    startTime: string;
    endTime?: string;
    totalErrors: number;
    successfulFixes: number;
    failedFixes: number;
  }>;
}

// ============================================================================
// FixLogger
// ============================================================================

/**
 * FixLogger - Persists fix history to fix-log.json.
 *
 * Provides:
 * - Persistent logging of all fix attempts
 * - Session-based grouping
 * - Statistics and analysis
 * - Rotation/cleanup of old entries
 */
export class FixLogger {
  private config: FixLoggerConfig;
  private entries: FixLogEntry[] = [];
  private sessionStart: Date;
  private stats: SelfCorrectionStats;

  constructor(config: Partial<FixLoggerConfig> = {}) {
    this.config = {
      logPath: config.logPath ?? "./fix-log.json",
      sessionId: config.sessionId ?? this.generateSessionId(),
      maxEntries: config.maxEntries ?? 1000,
      autoSave: config.autoSave ?? true,
      includeCodeSnippets: config.includeCodeSnippets ?? true,
    };

    this.sessionStart = new Date();
    this.stats = this.initializeStats();

    // Load existing entries
    this.loadExistingEntries();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Log a fix result.
   */
  logFix(result: FixResult): FixLogEntry {
    const entry = this.createEntry(result);
    this.entries.push(entry);
    this.updateStats(result);

    if (this.config.autoSave) {
      this.save();
    }

    // Rotate if needed
    if (this.entries.length > this.config.maxEntries) {
      this.rotate();
    }

    return entry;
  }

  /**
   * Log multiple fix results.
   */
  logFixes(results: FixResult[]): FixLogEntry[] {
    const entries = results.map((r) => this.createEntry(r));
    this.entries.push(...entries);

    for (const result of results) {
      this.updateStats(result);
    }

    if (this.config.autoSave) {
      this.save();
    }

    return entries;
  }

  /**
   * Save log to file.
   */
  save(): void {
    const logFile = this.createLogFile();
    const dir = dirname(this.config.logPath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.config.logPath, JSON.stringify(logFile, null, 2));
  }

  /**
   * Load log from file.
   */
  load(): void {
    this.loadExistingEntries();
  }

  /**
   * Get all entries.
   */
  getEntries(): FixLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries for current session.
   */
  getSessionEntries(): FixLogEntry[] {
    return this.entries.filter((e) => e.sessionId === this.config.sessionId);
  }

  /**
   * Get entries by category.
   */
  getEntriesByCategory(category: ErrorCategory): FixLogEntry[] {
    return this.entries.filter((e) => e.error.category === category);
  }

  /**
   * Get entries by status.
   */
  getEntriesByStatus(status: string): FixLogEntry[] {
    return this.entries.filter((e) => e.result.status === status);
  }

  /**
   * Get statistics.
   */
  getStats(): SelfCorrectionStats {
    return { ...this.stats };
  }

  /**
   * Get session ID.
   */
  getSessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Get config.
   */
  getConfig(): FixLoggerConfig {
    return { ...this.config };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
    this.stats = this.initializeStats();

    if (this.config.autoSave) {
      this.save();
    }
  }

  /**
   * Rotate log, keeping only recent entries.
   */
  rotate(): void {
    const keepCount = Math.floor(this.config.maxEntries * 0.8);
    this.entries = this.entries.slice(-keepCount);

    if (this.config.autoSave) {
      this.save();
    }
  }

  /**
   * Get fix success rate analysis.
   */
  getSuccessRateAnalysis(): {
    overall: number;
    byCategory: Record<ErrorCategory, number>;
    vsTargets: Record<ErrorCategory, { actual: number; target: number; met: boolean }>;
  } {
    const overall = this.calculateSuccessRate(this.entries);
    const byCategory: Record<ErrorCategory, number> = {
      BUILD: this.calculateSuccessRate(this.getEntriesByCategory("BUILD")),
      LINT: this.calculateSuccessRate(this.getEntriesByCategory("LINT")),
      TYPE: this.calculateSuccessRate(this.getEntriesByCategory("TYPE")),
      TEST: this.calculateSuccessRate(this.getEntriesByCategory("TEST")),
    };

    const vsTargets: Record<ErrorCategory, { actual: number; target: number; met: boolean }> = {
      BUILD: {
        actual: byCategory.BUILD,
        target: AUTO_FIX_TARGETS.BUILD,
        met: byCategory.BUILD >= AUTO_FIX_TARGETS.BUILD,
      },
      LINT: {
        actual: byCategory.LINT,
        target: AUTO_FIX_TARGETS.LINT,
        met: byCategory.LINT >= AUTO_FIX_TARGETS.LINT,
      },
      TYPE: {
        actual: byCategory.TYPE,
        target: AUTO_FIX_TARGETS.TYPE,
        met: byCategory.TYPE >= AUTO_FIX_TARGETS.TYPE,
      },
      TEST: {
        actual: byCategory.TEST,
        target: AUTO_FIX_TARGETS.TEST,
        met: byCategory.TEST >= AUTO_FIX_TARGETS.TEST,
      },
    };

    return { overall, byCategory, vsTargets };
  }

  /**
   * Export entries as CSV.
   */
  exportCsv(): string {
    const headers = [
      "id",
      "timestamp",
      "sessionId",
      "category",
      "errorCode",
      "errorMessage",
      "filePath",
      "line",
      "fixType",
      "fixDescription",
      "confidence",
      "status",
      "verified",
      "duration",
      "strikes",
    ].join(",");

    const rows = this.entries.map((e) =>
      [
        e.id,
        e.timestamp,
        e.sessionId,
        e.error.category,
        e.error.code,
        `"${e.error.message.replace(/"/g, '""')}"`,
        e.error.filePath,
        e.error.line,
        e.fix.type,
        `"${e.fix.description.replace(/"/g, '""')}"`,
        e.fix.confidence,
        e.result.status,
        e.result.verified,
        e.result.duration,
        e.result.strikes,
      ].join(",")
    );

    return [headers, ...rows].join("\n");
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Generate unique session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Initialize stats.
   */
  private initializeStats(): SelfCorrectionStats {
    return {
      totalErrors: 0,
      byCategory: { BUILD: 0, LINT: 0, TYPE: 0, TEST: 0 },
      totalFixAttempts: 0,
      successfulFixes: 0,
      failedFixes: 0,
      escalatedCount: 0,
      successRateByCategory: { BUILD: 0, LINT: 0, TYPE: 0, TEST: 0 },
      averageFixTime: 0,
      sessionStart: this.sessionStart,
      sessionId: this.config.sessionId,
    };
  }

  /**
   * Create log entry from fix result.
   */
  private createEntry(result: FixResult): FixLogEntry {
    const entry: FixLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date(),
      sessionId: this.config.sessionId,
      error: {
        category: result.fix.error.category,
        code: result.fix.error.code,
        message: result.fix.error.message,
        filePath: result.fix.error.filePath,
        line: result.fix.error.line,
      },
      fix: {
        type: result.fix.type,
        description: result.fix.description,
        confidence: result.fix.confidence,
      },
      result: {
        status: result.status,
        verified: result.verified,
        duration: result.duration,
        strikes: result.strikes,
      },
    };

    // Include code snippets if configured
    if (this.config.includeCodeSnippets) {
      entry.originalCode = result.fix.originalCode;
      entry.fixedCode = result.fix.fixedCode;
    }

    return entry;
  }

  /**
   * Update stats with fix result.
   */
  private updateStats(result: FixResult): void {
    this.stats.totalErrors++;
    this.stats.byCategory[result.fix.error.category]++;
    this.stats.totalFixAttempts++;

    if (result.status === "success") {
      this.stats.successfulFixes++;
    } else if (result.status === "failed") {
      this.stats.failedFixes++;
    }

    if (result.strikes >= 3) {
      this.stats.escalatedCount++;
    }

    // Update average fix time
    const totalTime =
      this.stats.averageFixTime * (this.stats.totalFixAttempts - 1) + result.duration;
    this.stats.averageFixTime = totalTime / this.stats.totalFixAttempts;

    // Update success rates by category
    this.updateSuccessRates();
  }

  /**
   * Update success rates by category.
   */
  private updateSuccessRates(): void {
    const categories: ErrorCategory[] = ["BUILD", "LINT", "TYPE", "TEST"];

    for (const category of categories) {
      const categoryEntries = this.getEntriesByCategory(category);
      this.stats.successRateByCategory[category] = this.calculateSuccessRate(categoryEntries);
    }
  }

  /**
   * Calculate success rate for entries.
   */
  private calculateSuccessRate(entries: FixLogEntry[]): number {
    if (entries.length === 0) return 0;
    const successful = entries.filter((e) => e.result.status === "success").length;
    return successful / entries.length;
  }

  /**
   * Load existing entries from file.
   */
  private loadExistingEntries(): void {
    if (!existsSync(this.config.logPath)) {
      return;
    }

    try {
      const content = readFileSync(this.config.logPath, "utf-8");
      const logFile: FixLogFile = JSON.parse(content);
      this.entries = logFile.entries.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
    } catch {
      // File corrupted or invalid, start fresh
      this.entries = [];
    }
  }

  /**
   * Create log file structure.
   */
  private createLogFile(): FixLogFile {
    const now = new Date().toISOString();

    // Build session summaries
    const sessions: FixLogFile["sessions"] = {};
    const sessionIds = new Set(this.entries.map((e) => e.sessionId));

    for (const sessionId of sessionIds) {
      const sessionEntries = this.entries.filter((e) => e.sessionId === sessionId);
      const timestamps = sessionEntries.map((e) => new Date(e.timestamp).getTime());

      sessions[sessionId] = {
        startTime: new Date(Math.min(...timestamps)).toISOString(),
        endTime: new Date(Math.max(...timestamps)).toISOString(),
        totalErrors: sessionEntries.length,
        successfulFixes: sessionEntries.filter((e) => e.result.status === "success").length,
        failedFixes: sessionEntries.filter((e) => e.result.status === "failed").length,
      };
    }

    return {
      version: "1.0.0",
      created: this.entries.length > 0
        ? new Date(Math.min(...this.entries.map((e) => new Date(e.timestamp).getTime()))).toISOString()
        : now,
      updated: now,
      entries: this.entries,
      sessions,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a fix logger instance.
 */
export function createFixLogger(config?: Partial<FixLoggerConfig>): FixLogger {
  return new FixLogger(config);
}

/**
 * Get default log path.
 */
export function getDefaultLogPath(): string {
  const stateDir = process.env.ENDIORBOT_STATE_DIR || join(process.env.HOME || ".", ".endiorbot");
  return join(stateDir, "fix-log.json");
}
