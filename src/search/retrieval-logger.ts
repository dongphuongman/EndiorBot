/**
 * Retrieval Logger
 *
 * Anti-hallucination evidence logging for code search.
 * Logs search evidence to SESSION-PROGRESS.md for audit trail.
 *
 * @module search/retrieval-logger
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, Sprint 63 T2.7
 * @sprint 63
 */

import { existsSync, mkdirSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isFeatureEnabled } from "../config/feature-flags.js";
import { createLogger, type Logger } from "../logging/index.js";
import {
  type SearchResponse,
  type RetrievalEvidence,
  type RetrievalEvidenceResult,
  type DecisionContext,
  formatRetrievalEvidence,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Retrieval logger configuration.
 */
export interface RetrievalLoggerConfig {
  /** Path to SESSION-PROGRESS.md */
  progressPath: string;
  /** Path to evidence directory */
  evidenceDir: string;
  /** Maximum evidence entries to keep */
  maxEntries: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_RETRIEVAL_LOGGER_CONFIG: RetrievalLoggerConfig = {
  progressPath: "SESSION-PROGRESS.md",
  evidenceDir: ".endiorbot/evidence",
  maxEntries: 100,
  verbose: false,
};

// ============================================================================
// RetrievalLogger Class
// ============================================================================

/**
 * Logs search evidence for anti-hallucination audit trail.
 *
 * Features:
 * - Logs to SESSION-PROGRESS.md for human review
 * - Stores detailed evidence in JSON for programmatic access
 * - Respects RETRIEVAL_LOGGER feature flag
 *
 * @example
 * ```typescript
 * const logger = new RetrievalLogger();
 *
 * // Log search evidence after search
 * await logger.logSearchEvidence(searchResponse, "function hello");
 *
 * // Get recent evidence
 * const recent = await logger.getRecentEvidence(5);
 * ```
 */
export class RetrievalLogger {
  private readonly config: RetrievalLoggerConfig;
  private readonly log: Logger;

  constructor(config: Partial<RetrievalLoggerConfig> = {}) {
    this.config = { ...DEFAULT_RETRIEVAL_LOGGER_CONFIG, ...config };
    this.log = createLogger("RetrievalLogger");
  }

  /**
   * Log search evidence.
   * Creates evidence pack and appends to SESSION-PROGRESS.md.
   *
   * Sprint 64 T4.3: Enhanced with decision context support.
   *
   * @param response - Search response to log
   * @param query - Search query string
   * @param context - Optional decision context for enrichment
   */
  async logSearchEvidence(
    response: SearchResponse,
    query: string,
    context?: DecisionContext
  ): Promise<void> {
    // Check feature flag
    if (!isFeatureEnabled("RETRIEVAL_LOGGER")) {
      this.log.debug("Retrieval logging disabled by feature flag");
      return;
    }

    const evidence = this.createEvidence(response, query, context);

    // Log to SESSION-PROGRESS.md
    await this.appendToProgress(evidence);

    // Store detailed evidence
    await this.storeEvidence(evidence);

    if (this.config.verbose) {
      this.log.info("Search evidence logged", {
        query,
        provider: response.provider,
        hits: response.hits.length,
        totalHits: response.totalHits,
        context: context ? { stage: context.stage, role: context.role } : undefined,
      });
    }
  }

  /**
   * Create evidence pack from search response.
   *
   * Sprint 64 T4.3: Enhanced with decision context.
   */
  private createEvidence(
    response: SearchResponse,
    query: string,
    context?: DecisionContext
  ): RetrievalEvidence {
    const results: RetrievalEvidenceResult[] = response.hits.slice(0, 10).map((hit) => ({
      path: hit.path,
      line: hit.line,
      score: hit.score,
      ranking_reason: hit.ranking_reason,
      specSnapshotMatch: hit.specSnapshotMatch,
      sourceExcerpt: hit.content.slice(0, 100) + (hit.content.length > 100 ? "..." : ""),
    }));

    // Build evidence object (exactOptionalPropertyTypes compliant)
    const evidence: RetrievalEvidence = {
      timestamp: new Date().toISOString(),
      query,
      provider: response.provider,
      providerVersion: response.providerVersion,
      elapsed_ms: response.elapsed_ms,
      totalHits: response.totalHits,
      topKReturned: response.hits.length,
      truncated: response.truncated,
      tokensUsed: response.tokensUsed,
      results,
    };

    // Add context if provided
    if (context) {
      evidence.context = context;
    }

    return evidence;
  }

  /**
   * Append evidence to SESSION-PROGRESS.md.
   */
  private async appendToProgress(evidence: RetrievalEvidence): Promise<void> {
    const formatted = formatRetrievalEvidence(evidence);
    const separator = "\n\n---\n\n";

    try {
      const progressPath = this.config.progressPath;

      if (existsSync(progressPath)) {
        await appendFile(progressPath, separator + formatted);
      } else {
        // Create new file with header
        const header = `# Session Progress

*Auto-generated by EndiorBot Retrieval Logger*
*Feature: Code Search Layer (Sprint 63)*

`;
        await writeFile(progressPath, header + formatted);
      }
    } catch (error) {
      this.log.warn("Failed to append to SESSION-PROGRESS.md", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Store detailed evidence to JSON file.
   */
  private async storeEvidence(evidence: RetrievalEvidence): Promise<void> {
    try {
      // Ensure evidence directory exists
      const evidenceDir = this.config.evidenceDir;
      if (!existsSync(evidenceDir)) {
        mkdirSync(evidenceDir, { recursive: true });
      }

      // Generate filename based on timestamp
      const filename = `search_${evidence.timestamp.replace(/[:.]/g, "-")}.json`;
      const filepath = join(evidenceDir, filename);

      await writeFile(filepath, JSON.stringify(evidence, null, 2));

      // Clean up old evidence files
      await this.cleanupOldEvidence();
    } catch (error) {
      this.log.warn("Failed to store evidence", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up old evidence files if exceeding maxEntries.
   */
  private async cleanupOldEvidence(): Promise<void> {
    try {
      const { readdir, unlink } = await import("node:fs/promises");
      const evidenceDir = this.config.evidenceDir;

      if (!existsSync(evidenceDir)) return;

      const files = await readdir(evidenceDir);
      const jsonFiles = files
        .filter((f) => f.startsWith("search_") && f.endsWith(".json"))
        .sort();

      // Remove oldest files if exceeding max
      const toRemove = jsonFiles.length - this.config.maxEntries;
      if (toRemove > 0) {
        for (let i = 0; i < toRemove; i++) {
          await unlink(join(evidenceDir, jsonFiles[i]!));
        }
      }
    } catch (error) {
      this.log.debug("Cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get recent evidence entries.
   */
  async getRecentEvidence(count: number = 10): Promise<RetrievalEvidence[]> {
    try {
      const { readdir } = await import("node:fs/promises");
      const evidenceDir = this.config.evidenceDir;

      if (!existsSync(evidenceDir)) return [];

      const files = await readdir(evidenceDir);
      const jsonFiles = files
        .filter((f) => f.startsWith("search_") && f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, count);

      const evidence: RetrievalEvidence[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await readFile(join(evidenceDir, file), "utf-8");
          evidence.push(JSON.parse(content));
        } catch {
          // Skip corrupt files
        }
      }

      return evidence;
    } catch (error) {
      this.log.warn("Failed to get recent evidence", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get evidence summary for a session.
   */
  async getSessionSummary(): Promise<{
    totalSearches: number;
    totalHits: number;
    avgLatency: number;
    providers: Record<string, number>;
  }> {
    const evidence = await this.getRecentEvidence(100);

    if (evidence.length === 0) {
      return {
        totalSearches: 0,
        totalHits: 0,
        avgLatency: 0,
        providers: {},
      };
    }

    const providers: Record<string, number> = {};
    let totalHits = 0;
    let totalLatency = 0;

    for (const e of evidence) {
      totalHits += e.totalHits;
      totalLatency += e.elapsed_ms;
      providers[e.provider] = (providers[e.provider] ?? 0) + 1;
    }

    return {
      totalSearches: evidence.length,
      totalHits,
      avgLatency: Math.round(totalLatency / evidence.length),
      providers,
    };
  }

  /**
   * Clear all evidence (for testing).
   */
  async clearEvidence(): Promise<void> {
    try {
      const { readdir, unlink } = await import("node:fs/promises");
      const evidenceDir = this.config.evidenceDir;

      if (existsSync(evidenceDir)) {
        const files = await readdir(evidenceDir);
        for (const file of files) {
          await unlink(join(evidenceDir, file));
        }
      }

      // Also clear SESSION-PROGRESS.md search sections
      const progressPath = this.config.progressPath;
      if (existsSync(progressPath)) {
        const content = await readFile(progressPath, "utf-8");
        // Keep content before first search evidence
        const cleanedContent = content.split("## Search Evidence")[0];
        await writeFile(progressPath, cleanedContent?.trim() ?? "");
      }
    } catch (error) {
      this.log.warn("Failed to clear evidence", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalLogger: RetrievalLogger | undefined;

/**
 * Get the global RetrievalLogger instance.
 */
export function getRetrievalLogger(
  config?: Partial<RetrievalLoggerConfig>
): RetrievalLogger {
  if (!globalLogger) {
    globalLogger = new RetrievalLogger(config);
  }
  return globalLogger;
}

/**
 * Reset the global RetrievalLogger (for testing).
 */
export function resetRetrievalLogger(): void {
  globalLogger = undefined;
}

/**
 * Create a new RetrievalLogger instance.
 */
export function createRetrievalLogger(
  config?: Partial<RetrievalLoggerConfig>
): RetrievalLogger {
  return new RetrievalLogger(config);
}
