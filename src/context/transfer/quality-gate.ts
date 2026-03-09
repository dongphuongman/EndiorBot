/**
 * Context Quality Gate — Sprint 96
 *
 * Threshold-based gating for cross-session context.
 * Decides whether persisted context is high enough quality to carry forward.
 *
 * Separate from QualityGatesEvaluator (AD-5: different domain —
 * knowledge retention vs model selection).
 *
 * @module context/transfer/quality-gate
 * @version 1.0.0
 * @sprint 96
 */

import type {
  TransferableContext,
  ContextQualityGateResult,
  QualityViolation,
  QualityGateThresholds,
  ContextQualityScore,
} from "./types.js";
import { DEFAULT_TRANSFER_CONFIG } from "./types.js";
import {
  ContextQualityScorer,
  getContextQualityScorer,
} from "./quality-scorer.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Per-dimension minimum thresholds.
 * Any dimension below this triggers a violation.
 */
const DIMENSION_MINIMUMS = {
  relevance: 0.15,
  recency: 0.05,
  confidence: 0.2,
  completeness: 0.2,
} as const;

// ============================================================================
// ContextQualityGate
// ============================================================================

export interface ContextQualityGateOptions {
  thresholds?: QualityGateThresholds;
  scorer?: ContextQualityScorer;
}

export class ContextQualityGate {
  private readonly thresholds: QualityGateThresholds;
  private readonly scorer: ContextQualityScorer;

  constructor(options?: ContextQualityGateOptions) {
    this.thresholds = options?.thresholds ?? DEFAULT_TRANSFER_CONFIG.thresholds;
    this.scorer = options?.scorer ?? getContextQualityScorer();
  }

  /**
   * Evaluate whether a context entry passes the quality gate.
   */
  evaluate(
    context: TransferableContext,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): ContextQualityGateResult {
    // Re-score with current context
    const quality = this.scorer.score(context, currentGoal, currentTags, currentStage);
    const threshold = this.getThreshold(context.type);

    const violations = this.findViolations(quality);
    const recommendations = this.generateRecommendations(violations, context);

    const result: ContextQualityGateResult = {
      passed: quality.composite >= threshold && violations.length === 0,
      contextId: context.id,
      compositeScore: quality.composite,
      threshold,
      violations,
      recommendations,
    };

    return result;
  }

  /**
   * Evaluate a batch of context entries.
   */
  evaluateBatch(
    contexts: TransferableContext[],
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): ContextQualityGateResult[] {
    return contexts.map((ctx) =>
      this.evaluate(ctx, currentGoal, currentTags, currentStage),
    );
  }

  /**
   * Get the minimum composite score threshold for a context type.
   */
  getThreshold(type: TransferableContext["type"]): number {
    return this.thresholds[type];
  }

  /**
   * Filter contexts, keeping only those that pass the quality gate.
   */
  filterByQuality(
    contexts: TransferableContext[],
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
    minScore?: number,
  ): TransferableContext[] {
    return contexts.filter((ctx) => {
      const result = this.evaluate(ctx, currentGoal, currentTags, currentStage);
      if (!result.passed) return false;
      if (minScore !== undefined && result.compositeScore < minScore) return false;
      return true;
    });
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Find per-dimension violations below absolute minimums.
   */
  private findViolations(quality: ContextQualityScore): QualityViolation[] {
    const violations: QualityViolation[] = [];

    if (quality.relevance < DIMENSION_MINIMUMS.relevance) {
      violations.push({
        dimension: "relevance",
        actual: quality.relevance,
        minimum: DIMENSION_MINIMUMS.relevance,
        message: `Relevance too low (${quality.relevance.toFixed(2)} < ${DIMENSION_MINIMUMS.relevance})`,
      });
    }

    if (quality.recency < DIMENSION_MINIMUMS.recency) {
      violations.push({
        dimension: "recency",
        actual: quality.recency,
        minimum: DIMENSION_MINIMUMS.recency,
        message: `Context too old (recency ${quality.recency.toFixed(2)} < ${DIMENSION_MINIMUMS.recency})`,
      });
    }

    if (quality.confidence < DIMENSION_MINIMUMS.confidence) {
      violations.push({
        dimension: "confidence",
        actual: quality.confidence,
        minimum: DIMENSION_MINIMUMS.confidence,
        message: `Low confidence (${quality.confidence.toFixed(2)} < ${DIMENSION_MINIMUMS.confidence})`,
      });
    }

    if (quality.completeness < DIMENSION_MINIMUMS.completeness) {
      violations.push({
        dimension: "completeness",
        actual: quality.completeness,
        minimum: DIMENSION_MINIMUMS.completeness,
        message: `Incomplete content (${quality.completeness.toFixed(2)} < ${DIMENSION_MINIMUMS.completeness})`,
      });
    }

    return violations;
  }

  /**
   * Generate human-readable recommendations for violations.
   */
  private generateRecommendations(
    violations: QualityViolation[],
    context: TransferableContext,
  ): string[] {
    const recommendations: string[] = [];

    for (const v of violations) {
      switch (v.dimension) {
        case "relevance":
          recommendations.push(
            `Context "${context.id}" has low relevance — consider adding more specific tags.`,
          );
          break;
        case "recency":
          recommendations.push(
            `Context "${context.id}" is stale — consider refreshing or removing.`,
          );
          break;
        case "confidence":
          recommendations.push(
            `Context "${context.id}" was produced with low confidence — verify accuracy.`,
          );
          break;
        case "completeness":
          recommendations.push(
            `Context "${context.id}" is incomplete or truncated — consider regenerating.`,
          );
          break;
      }
    }

    return recommendations;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalGate: ContextQualityGate | undefined;

export function getContextQualityGate(): ContextQualityGate {
  if (!globalGate) {
    globalGate = new ContextQualityGate();
  }
  return globalGate;
}

export function resetContextQualityGate(): void {
  globalGate = undefined;
}
