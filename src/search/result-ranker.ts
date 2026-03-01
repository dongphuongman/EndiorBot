/**
 * Result Ranker
 *
 * Sophisticated scoring and ranking for search results.
 * Sprint 64: Enhanced result ranking with multiple scoring factors.
 *
 * @module search/result-ranker
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @authority Master Plan v4.2, Sprint 64 T3.4
 * @sprint 64
 */

import type { SearchResult, RankingReason } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Ranking configuration.
 */
export interface RankingConfig {
  /** Boost for spec snapshot matches */
  specSnapshotBoost: number;
  /** Boost for stage priority matches */
  stageBoost: number;
  /** Boost for exact matches */
  exactMatchBoost: number;
  /** Boost for structural matches */
  structuralBoost: number;
  /** Penalty for deeply nested files */
  depthPenalty: number;
  /** Boost for matches near top of file */
  topOfFileBoost: number;
  /** Paths to consider as spec snapshots */
  specSnapshotPaths: Set<string>;
  /** Stage priority patterns */
  stagePriorityPatterns: string[];
}

/**
 * Score breakdown for a result.
 */
export interface ScoreBreakdown {
  baseScore: number;
  matchTypeBoost: number;
  specSnapshotBoost: number;
  stageBoost: number;
  positionBoost: number;
  depthPenalty: number;
  totalScore: number;
  rankingReason: RankingReason;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  specSnapshotBoost: 50,
  stageBoost: 30,
  exactMatchBoost: 40,
  structuralBoost: 35,
  depthPenalty: 5,
  topOfFileBoost: 20,
  specSnapshotPaths: new Set(),
  stagePriorityPatterns: [],
};

// ============================================================================
// Result Ranker Class
// ============================================================================

/**
 * Result ranker with multi-factor scoring.
 *
 * Scoring factors:
 * - Match type (exact > structural > regex > default)
 * - Spec snapshot match (high priority)
 * - Stage priority match
 * - Position in file (top of file preferred)
 * - Path depth (less nested preferred)
 *
 * @example
 * ```typescript
 * const ranker = new ResultRanker({
 *   specSnapshotPaths: new Set(["src/api/routes.ts"]),
 *   stagePriorityPatterns: ["src/**\/*.ts"],
 * });
 *
 * const ranked = ranker.rank(results);
 * ```
 */
export class ResultRanker {
  private readonly config: RankingConfig;

  constructor(config: Partial<RankingConfig> = {}) {
    this.config = { ...DEFAULT_RANKING_CONFIG, ...config };
  }

  /**
   * Rank search results by score.
   */
  rank(results: SearchResult[]): SearchResult[] {
    // Score each result
    const scored = results.map((result) => ({
      result,
      breakdown: this.scoreResult(result),
    }));

    // Sort by total score descending
    scored.sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore);

    // Update ranking reason based on score breakdown
    return scored.map(({ result, breakdown }) => ({
      ...result,
      score: breakdown.totalScore,
      ranking_reason: breakdown.rankingReason,
    }));
  }

  /**
   * Score a single result.
   */
  scoreResult(result: SearchResult): ScoreBreakdown {
    const breakdown: ScoreBreakdown = {
      baseScore: result.score || 50,
      matchTypeBoost: 0,
      specSnapshotBoost: 0,
      stageBoost: 0,
      positionBoost: 0,
      depthPenalty: 0,
      totalScore: 0,
      rankingReason: result.ranking_reason || "default",
    };

    // 1. Match type boost
    breakdown.matchTypeBoost = this.getMatchTypeBoost(result.ranking_reason);

    // 2. Spec snapshot boost
    if (this.isSpecSnapshotMatch(result.path)) {
      breakdown.specSnapshotBoost = this.config.specSnapshotBoost;
      breakdown.rankingReason = "spec_snapshot_match";
    }

    // 3. Stage priority boost
    if (this.isStagePriorityMatch(result.path)) {
      breakdown.stageBoost = this.config.stageBoost;
      if (breakdown.rankingReason === "default") {
        breakdown.rankingReason = "stage_boost";
      }
    }

    // 4. Position boost (top of file preferred)
    breakdown.positionBoost = this.getPositionBoost(result.line);

    // 5. Depth penalty (deeply nested files less preferred)
    breakdown.depthPenalty = this.getDepthPenalty(result.path);

    // Calculate total score
    breakdown.totalScore =
      breakdown.baseScore +
      breakdown.matchTypeBoost +
      breakdown.specSnapshotBoost +
      breakdown.stageBoost +
      breakdown.positionBoost -
      breakdown.depthPenalty;

    return breakdown;
  }

  /**
   * Get match type boost.
   */
  private getMatchTypeBoost(reason: RankingReason): number {
    switch (reason) {
      case "exact_match":
        return this.config.exactMatchBoost;
      case "structural_match":
        return this.config.structuralBoost;
      case "regex_match":
        return 10;
      default:
        return 0;
    }
  }

  /**
   * Check if path is a spec snapshot match.
   */
  private isSpecSnapshotMatch(path: string): boolean {
    return this.config.specSnapshotPaths.has(path);
  }

  /**
   * Check if path matches stage priority patterns.
   */
  private isStagePriorityMatch(path: string): boolean {
    for (const pattern of this.config.stagePriorityPatterns) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get position boost (lines 1-50 get boost).
   */
  private getPositionBoost(line: number): number {
    if (line <= 10) return this.config.topOfFileBoost;
    if (line <= 25) return this.config.topOfFileBoost * 0.7;
    if (line <= 50) return this.config.topOfFileBoost * 0.4;
    if (line <= 100) return this.config.topOfFileBoost * 0.2;
    return 0;
  }

  /**
   * Get depth penalty based on path segments.
   */
  private getDepthPenalty(path: string): number {
    const depth = path.split("/").length - 1;
    // Penalty starts after 3 levels
    if (depth <= 3) return 0;
    return (depth - 3) * this.config.depthPenalty;
  }

  /**
   * Simple glob matching.
   */
  private matchGlob(path: string, pattern: string): boolean {
    const DOUBLE_STAR_SLASH = "___DOUBLE_STAR_SLASH___";
    const DOUBLE_STAR = "___DOUBLE_STAR___";
    const SINGLE_STAR = "___SINGLE_STAR___";
    const QUESTION = "___QUESTION___";

    const regex = pattern
      .replace(/\*\*\//g, DOUBLE_STAR_SLASH)
      .replace(/\*\*/g, DOUBLE_STAR)
      .replace(/\*/g, SINGLE_STAR)
      .replace(/\?/g, QUESTION)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(new RegExp(DOUBLE_STAR_SLASH, "g"), "(?:.*/)?")
      .replace(new RegExp(DOUBLE_STAR, "g"), ".*")
      .replace(new RegExp(SINGLE_STAR, "g"), "[^/]*")
      .replace(new RegExp(QUESTION, "g"), ".");

    return new RegExp(`^${regex}$`).test(path);
  }

  /**
   * Update config.
   */
  updateConfig(config: Partial<RankingConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Set spec snapshot paths.
   */
  setSpecSnapshotPaths(paths: string[]): void {
    this.config.specSnapshotPaths = new Set(paths);
  }

  /**
   * Set stage priority patterns.
   */
  setStagePriorityPatterns(patterns: string[]): void {
    this.config.stagePriorityPatterns = patterns;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a result ranker with default config.
 */
export function createRanker(config?: Partial<RankingConfig>): ResultRanker {
  return new ResultRanker(config);
}

/**
 * Rank results with default ranker.
 */
export function rankResults(
  results: SearchResult[],
  config?: Partial<RankingConfig>
): SearchResult[] {
  const ranker = new ResultRanker(config);
  return ranker.rank(results);
}

/**
 * Get score breakdown for a result.
 */
export function getScoreBreakdown(
  result: SearchResult,
  config?: Partial<RankingConfig>
): ScoreBreakdown {
  const ranker = new ResultRanker(config);
  return ranker.scoreResult(result);
}

/**
 * Create a ranker with spec snapshot paths.
 *
 * Convenience function for Sprint 64 T3.6 - Spec Snapshot cross-ref boost.
 *
 * @param specSnapshotPaths - Paths to boost (e.g., from spec snapshot sources)
 * @param stagePriorityPatterns - Glob patterns for stage priority (e.g., ["src/**\/*.ts"])
 */
export function createRankerWithSpecSnapshots(
  specSnapshotPaths: string[],
  stagePriorityPatterns: string[] = []
): ResultRanker {
  return new ResultRanker({
    specSnapshotPaths: new Set(specSnapshotPaths),
    stagePriorityPatterns,
  });
}

/**
 * Rank results with spec snapshot boost.
 *
 * Convenience function that combines enrichment and ranking.
 *
 * @param results - Search results to rank
 * @param specSnapshotPaths - Paths to boost
 * @param stagePriorityPatterns - Glob patterns for stage priority
 */
export function rankWithSpecSnapshotBoost(
  results: SearchResult[],
  specSnapshotPaths: string[],
  stagePriorityPatterns: string[] = []
): SearchResult[] {
  const ranker = createRankerWithSpecSnapshots(
    specSnapshotPaths,
    stagePriorityPatterns
  );
  return ranker.rank(results);
}
