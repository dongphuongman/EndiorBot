/**
 * Fix Logger
 *
 * Public API for fix logging with analytics support.
 *
 * @module agents/fix-logging/fix-logger
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 41 Fix Logging
 */

import { randomUUID } from "crypto";
import type {
  EnhancedFixLogEntry,
  FixLogError,
  FixLogFix,
  FixLogOutcome,
  FixLogContext,
  WeeklySummary,
  CategorySummary,
  PatternSummary,
  FixLogQueryOptions,
  ErrorCategory,
} from "./types.js";
import { AUTO_FIX_TARGETS } from "../../self-correction/types.js";
import {
  FixLogWriter,
  createFixLogWriter,
  type FixLogWriterConfig,
} from "./fix-log-writer.js";
import { generatePatternId } from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export interface LogFixParams {
  /** Session ID */
  sessionId: string;
  /** Track ID (optional) */
  trackId?: string;
  /** Project ID (optional) */
  projectId?: string;
  /** Error information */
  error: FixLogError;
  /** Fix information (without patternId, will be generated) */
  fix: Omit<FixLogFix, "patternId">;
  /** Outcome information */
  outcome: FixLogOutcome;
  /** Context information (optional) */
  context?: FixLogContext;
}

export interface FixLoggerConfig extends Partial<FixLogWriterConfig> {
  /** Enable logging */
  enabled: boolean;
}

// ============================================================================
// Fix Logger
// ============================================================================

/**
 * FixLogger - High-level API for fix logging.
 *
 * Features:
 * 1. Simple API for logging fixes
 * 2. Auto-generate pattern IDs
 * 3. Weekly/pattern analytics
 * 4. Query support
 */
export class FixLogger {
  private writer: FixLogWriter;
  private config: FixLoggerConfig;
  private initialized = false;

  constructor(config?: Partial<FixLoggerConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      ...config,
    };

    this.writer = createFixLogWriter(config);
  }

  /**
   * Initialize the logger.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.writer.initialize();
    this.initialized = true;
  }

  /**
   * Log a fix attempt.
   */
  async logFix(params: LogFixParams): Promise<string | null> {
    if (!this.config.enabled) return null;

    if (!this.initialized) {
      await this.initialize();
    }

    // Generate pattern ID
    const patternId = generatePatternId(
      params.error.category,
      params.error.code,
      params.fix.type
    );

    // Create entry (omit undefined optional fields for exactOptionalPropertyTypes)
    const entry: EnhancedFixLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId: params.sessionId,
      ...(params.trackId !== undefined && { trackId: params.trackId }),
      ...(params.projectId !== undefined && { projectId: params.projectId }),
      error: params.error,
      fix: {
        ...params.fix,
        patternId,
      },
      outcome: params.outcome,
      ...(params.context !== undefined && { context: params.context }),
    };

    const result = await this.writer.append(entry);
    return result.success ? entry.id : null;
  }

  /**
   * Get weekly summary.
   */
  async getWeeklySummary(weeksAgo = 0): Promise<WeeklySummary> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Calculate date range
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - weeksAgo * 7);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // Get entries for the week
    const entries = await this.writer.getEntriesByDateRange(weekStart, weekEnd);

    // Calculate statistics
    const totalAttempts = entries.length;
    const successfulFixes = entries.filter(
      (e) => e.outcome.status === "success"
    ).length;
    const failedFixes = entries.filter(
      (e) => e.outcome.status === "failed"
    ).length;
    const escalatedFixes = entries.filter((e) => e.outcome.escalated).length;
    const successRate = totalAttempts > 0 ? successfulFixes / totalAttempts : 0;

    // By category
    const byCategory = this.calculateCategorySummary(entries);

    // Top patterns (by success rate, min 3 applications)
    const patternStats = this.calculatePatternStats(entries);
    const topPatterns = patternStats
      .filter((p) => p.count >= 3)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    // Problematic patterns (low success rate, high count)
    const problematicPatterns = patternStats
      .filter((p) => p.count >= 3 && p.successRate < 0.5)
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5);

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalAttempts,
      successfulFixes,
      failedFixes,
      escalatedFixes,
      successRate,
      byCategory,
      topPatterns,
      problematicPatterns,
    };
  }

  /**
   * Calculate category summary from entries.
   */
  private calculateCategorySummary(
    entries: EnhancedFixLogEntry[]
  ): Record<ErrorCategory, CategorySummary> {
    const categories: ErrorCategory[] = ["BUILD", "LINT", "TYPE", "TEST"];
    const result: Record<ErrorCategory, CategorySummary> = {} as Record<
      ErrorCategory,
      CategorySummary
    >;

    for (const category of categories) {
      const categoryEntries = entries.filter(
        (e) => e.error.category === category
      );
      const total = categoryEntries.length;
      const fixed = categoryEntries.filter(
        (e) => e.outcome.status === "success"
      ).length;
      const remaining = total - fixed;
      const successRate = total > 0 ? fixed / total : 0;
      const targetRate = AUTO_FIX_TARGETS[category];

      result[category] = {
        total,
        fixed,
        remaining,
        successRate,
        targetRate,
        metTarget: successRate >= targetRate,
      };
    }

    return result;
  }

  /**
   * Calculate pattern statistics from entries.
   */
  private calculatePatternStats(
    entries: EnhancedFixLogEntry[]
  ): PatternSummary[] {
    const patternMap = new Map<
      string,
      { count: number; success: number }
    >();

    for (const entry of entries) {
      const patternId = entry.fix.patternId;
      const current = patternMap.get(patternId) ?? { count: 0, success: 0 };
      current.count++;
      if (entry.outcome.status === "success") {
        current.success++;
      }
      patternMap.set(patternId, current);
    }

    return Array.from(patternMap.entries()).map(([patternId, stats]) => {
      const sr = stats.count > 0 ? stats.success / stats.count : 0;
      const summary: PatternSummary = {
        patternId,
        count: stats.count,
        successRate: sr,
        trend: "stable" as const, // TODO: compare with previous week
        ...(sr < 0.5 && { recommendation: "Review this pattern" }),
      };
      return summary;
    });
  }

  /**
   * Get recurring patterns (grouped by error code).
   */
  async getRecurringPatterns(
    minCount = 3
  ): Promise<
    Array<{
      errorCode: string;
      category: ErrorCategory;
      count: number;
      successRate: number;
      patterns: PatternSummary[];
    }>
  > {
    if (!this.initialized) {
      await this.initialize();
    }

    const entries = await this.writer.getEntries();

    // Group by error code
    const codeMap = new Map<
      string,
      {
        category: ErrorCategory;
        entries: EnhancedFixLogEntry[];
      }
    >();

    for (const entry of entries) {
      const key = `${entry.error.category}:${entry.error.code}`;
      const current = codeMap.get(key) ?? {
        category: entry.error.category,
        entries: [],
      };
      current.entries.push(entry);
      codeMap.set(key, current);
    }

    // Filter by minimum count and calculate stats
    const result = Array.from(codeMap.entries())
      .filter(([_, data]) => data.entries.length >= minCount)
      .map(([key, data]) => {
        const [, errorCode] = key.split(":");
        const successCount = data.entries.filter(
          (e) => e.outcome.status === "success"
        ).length;

        return {
          errorCode: errorCode!,
          category: data.category,
          count: data.entries.length,
          successRate: successCount / data.entries.length,
          patterns: this.calculatePatternStats(data.entries),
        };
      })
      .sort((a, b) => b.count - a.count);

    return result;
  }

  /**
   * Query entries with options.
   */
  async query(options: FixLogQueryOptions): Promise<EnhancedFixLogEntry[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    let entries = await this.writer.getEntries();

    // Apply filters
    if (options.sessionId) {
      entries = entries.filter((e) => e.sessionId === options.sessionId);
    }
    if (options.projectId) {
      entries = entries.filter((e) => e.projectId === options.projectId);
    }
    if (options.category) {
      entries = entries.filter((e) => e.error.category === options.category);
    }
    if (options.status) {
      entries = entries.filter((e) => e.outcome.status === options.status);
    }
    if (options.patternId) {
      entries = entries.filter((e) => e.fix.patternId === options.patternId);
    }
    if (options.from) {
      entries = entries.filter(
        (e) => new Date(e.timestamp) >= options.from!
      );
    }
    if (options.to) {
      entries = entries.filter((e) => new Date(e.timestamp) <= options.to!);
    }

    // Sort
    const sortBy = options.sortBy ?? "timestamp";
    const sortOrder = options.sortOrder ?? "desc";

    entries.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "timestamp":
          comparison =
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case "patternId":
          comparison = a.fix.patternId.localeCompare(b.fix.patternId);
          break;
        case "status":
          comparison = a.outcome.status.localeCompare(b.outcome.status);
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? entries.length;
    entries = entries.slice(offset, offset + limit);

    return entries;
  }

  /**
   * Get total entry count.
   */
  async getCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.writer.getCount();
  }

  /**
   * Export to JSON.
   */
  async exportJson(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.writer.exportJson();
  }

  /**
   * Export to CSV.
   */
  async exportCsv(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.writer.exportCsv();
  }

  /**
   * Get success rate by category for last N days.
   */
  async getSuccessRates(
    days = 7
  ): Promise<Record<ErrorCategory, { rate: number; target: number; met: boolean }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const entries = await this.writer.getEntriesByDateRange(startDate, endDate);
    const summary = this.calculateCategorySummary(entries);

    const result: Record<ErrorCategory, { rate: number; target: number; met: boolean }> = {
      BUILD: {
        rate: summary.BUILD.successRate,
        target: summary.BUILD.targetRate,
        met: summary.BUILD.metTarget,
      },
      LINT: {
        rate: summary.LINT.successRate,
        target: summary.LINT.targetRate,
        met: summary.LINT.metTarget,
      },
      TYPE: {
        rate: summary.TYPE.successRate,
        target: summary.TYPE.targetRate,
        met: summary.TYPE.metTarget,
      },
      TEST: {
        rate: summary.TEST.successRate,
        target: summary.TEST.targetRate,
        met: summary.TEST.metTarget,
      },
    };

    return result;
  }

  /**
   * Clear all entries (for testing).
   */
  async clear(): Promise<void> {
    await this.writer.clear();
  }

  /**
   * Get the underlying writer.
   */
  getWriter(): FixLogWriter {
    return this.writer;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a FixLogger instance.
 */
export function createFixLogger(config?: Partial<FixLoggerConfig>): FixLogger {
  return new FixLogger(config);
}

// Singleton instance
let globalLogger: FixLogger | undefined;

/**
 * Get the global FixLogger instance.
 */
export async function getFixLogger(): Promise<FixLogger> {
  if (!globalLogger) {
    globalLogger = new FixLogger();
    await globalLogger.initialize();
  }
  return globalLogger;
}

/**
 * Reset the global FixLogger (for testing).
 */
export function resetFixLogger(): void {
  globalLogger = undefined;
}
