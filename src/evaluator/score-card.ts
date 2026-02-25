/**
 * Score Card Calculator
 *
 * Multi-dimensional quality scoring with configurable weights.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 *
 * @module evaluator/score-card
 */

import { createLogger } from "../logging/logger.js";
import {
  type ScoreCard,
  type ScoreDimensions,
  type DimensionWeights,
  type ScoreThresholds,
  type ScoreComparison,
  type ScoreLevel,
  type ResponseMetrics,
  DEFAULT_DIMENSION_WEIGHTS,
  DEFAULT_SCORE_THRESHOLDS,
  calculateOverallScore,
  getScoreLevel,
  getDimensionsBelowThreshold,
  allDimensionsMeetThreshold,
  isValidScoreCard,
  createEmptyScoreCard,
} from "./types.js";

const logger = createLogger("score-card");

// ============================================================================
// Score Card Calculator Class
// ============================================================================

/**
 * Calculator for multi-dimensional quality scores.
 */
export class ScoreCardCalculator {
  private weights: DimensionWeights;
  private thresholds: ScoreThresholds;

  constructor(
    weights?: Partial<DimensionWeights>,
    thresholds?: Partial<ScoreThresholds>
  ) {
    this.weights = { ...DEFAULT_DIMENSION_WEIGHTS, ...weights };
    this.thresholds = { ...DEFAULT_SCORE_THRESHOLDS, ...thresholds };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get current weights.
   */
  getWeights(): DimensionWeights {
    return { ...this.weights };
  }

  /**
   * Set new weights.
   */
  setWeights(weights: Partial<DimensionWeights>): void {
    Object.assign(this.weights, weights);
    logger.debug("Updated score card weights", { weights: this.weights });
  }

  /**
   * Get current thresholds.
   */
  getThresholds(): ScoreThresholds {
    return { ...this.thresholds };
  }

  /**
   * Set new thresholds.
   */
  setThresholds(thresholds: Partial<ScoreThresholds>): void {
    Object.assign(this.thresholds, thresholds);
    logger.debug("Updated score card thresholds", { thresholds: this.thresholds });
  }

  // ==========================================================================
  // Score Calculation
  // ==========================================================================

  /**
   * Calculate a score card from response metrics.
   */
  calculate(metrics: ResponseMetrics): ScoreCard {
    const dimensions = this.calculateDimensions(metrics);
    const overall = calculateOverallScore(dimensions, this.weights);
    const confidence = this.calculateConfidence(metrics);

    const card: ScoreCard = {
      overall,
      dimensions,
      confidence,
    };

    logger.debug("Calculated score card", {
      overall,
      level: this.getLevel(card),
    });

    return card;
  }

  /**
   * Calculate the weighted overall score from dimensions.
   */
  getWeightedScore(card: ScoreCard): number {
    return calculateOverallScore(card.dimensions, this.weights);
  }

  /**
   * Recalculate overall score for a card (useful after modifying dimensions).
   */
  recalculateOverall(card: ScoreCard): ScoreCard {
    return {
      ...card,
      overall: calculateOverallScore(card.dimensions, this.weights),
    };
  }

  // ==========================================================================
  // Score Analysis
  // ==========================================================================

  /**
   * Get the score level for a card.
   */
  getLevel(card: ScoreCard): ScoreLevel {
    return getScoreLevel(card.overall, this.thresholds);
  }

  /**
   * Check if a card meets the minimum thresholds.
   */
  meetsThreshold(card: ScoreCard): boolean {
    return (
      card.overall >= this.thresholds.minOverall &&
      allDimensionsMeetThreshold(card.dimensions, this.thresholds.minPerDimension)
    );
  }

  /**
   * Get dimensions that are below the per-dimension threshold.
   */
  getDeficientDimensions(card: ScoreCard): Array<keyof ScoreDimensions> {
    return getDimensionsBelowThreshold(card.dimensions, this.thresholds.minPerDimension);
  }

  /**
   * Get dimensions that are below a custom threshold.
   */
  getDimensionsBelowThreshold(
    card: ScoreCard,
    threshold: number
  ): Array<keyof ScoreDimensions> {
    return getDimensionsBelowThreshold(card.dimensions, threshold);
  }

  /**
   * Check if the card represents excellent quality.
   */
  isExcellent(card: ScoreCard): boolean {
    return card.overall >= this.thresholds.excellentThreshold;
  }

  /**
   * Check if the card represents good quality.
   */
  isGood(card: ScoreCard): boolean {
    return card.overall >= this.thresholds.goodThreshold;
  }

  /**
   * Check if the card represents poor quality (needs optimization).
   */
  isPoor(card: ScoreCard): boolean {
    return card.overall < this.thresholds.minOverall;
  }

  /**
   * Check if the card is valid (all values in range).
   */
  isValid(card: ScoreCard): boolean {
    return isValidScoreCard(card);
  }

  // ==========================================================================
  // Score Comparison
  // ==========================================================================

  /**
   * Compare two score cards.
   */
  compareCards(a: ScoreCard, b: ScoreCard): ScoreComparison {
    const overallDiff = a.overall - b.overall;

    const dimensionDiffs: Record<keyof ScoreDimensions, number> = {
      correctness: a.dimensions.correctness - b.dimensions.correctness,
      efficiency: a.dimensions.efficiency - b.dimensions.efficiency,
      clarity: a.dimensions.clarity - b.dimensions.clarity,
      safety: a.dimensions.safety - b.dimensions.safety,
      ceoAlignment: a.dimensions.ceoAlignment - b.dimensions.ceoAlignment,
    };

    let winner: "a" | "b" | "equal";
    if (Math.abs(overallDiff) < 3) {
      winner = "equal"; // Within margin of error
    } else if (overallDiff > 0) {
      winner = "a";
    } else {
      winner = "b";
    }

    const improvementPercent = b.overall > 0
      ? (overallDiff / b.overall) * 100
      : 0;

    return {
      winner,
      overallDiff,
      dimensionDiffs,
      improvementPercent,
    };
  }

  /**
   * Calculate the improvement from one card to another.
   */
  calculateImprovement(before: ScoreCard, after: ScoreCard): {
    overallImprovement: number;
    percentImprovement: number;
    improvedDimensions: Array<keyof ScoreDimensions>;
    worsenedDimensions: Array<keyof ScoreDimensions>;
  } {
    const overallImprovement = after.overall - before.overall;
    const percentImprovement = before.overall > 0
      ? (overallImprovement / before.overall) * 100
      : 0;

    const improvedDimensions: Array<keyof ScoreDimensions> = [];
    const worsenedDimensions: Array<keyof ScoreDimensions> = [];

    const dims: Array<keyof ScoreDimensions> = [
      "correctness",
      "efficiency",
      "clarity",
      "safety",
      "ceoAlignment",
    ];

    for (const dim of dims) {
      const diff = after.dimensions[dim] - before.dimensions[dim];
      if (diff > 5) {
        improvedDimensions.push(dim);
      } else if (diff < -5) {
        worsenedDimensions.push(dim);
      }
    }

    return {
      overallImprovement,
      percentImprovement,
      improvedDimensions,
      worsenedDimensions,
    };
  }

  // ==========================================================================
  // Aggregation
  // ==========================================================================

  /**
   * Calculate average score card from multiple cards.
   */
  average(cards: ScoreCard[]): ScoreCard {
    if (cards.length === 0) {
      return createEmptyScoreCard();
    }

    const sumDimensions: ScoreDimensions = {
      correctness: 0,
      efficiency: 0,
      clarity: 0,
      safety: 0,
      ceoAlignment: 0,
    };

    let sumConfidence = 0;

    for (const card of cards) {
      sumDimensions.correctness += card.dimensions.correctness;
      sumDimensions.efficiency += card.dimensions.efficiency;
      sumDimensions.clarity += card.dimensions.clarity;
      sumDimensions.safety += card.dimensions.safety;
      sumDimensions.ceoAlignment += card.dimensions.ceoAlignment;
      sumConfidence += card.confidence;
    }

    const count = cards.length;
    const dimensions: ScoreDimensions = {
      correctness: Math.round(sumDimensions.correctness / count),
      efficiency: Math.round(sumDimensions.efficiency / count),
      clarity: Math.round(sumDimensions.clarity / count),
      safety: Math.round(sumDimensions.safety / count),
      ceoAlignment: Math.round(sumDimensions.ceoAlignment / count),
    };

    return {
      overall: calculateOverallScore(dimensions, this.weights),
      dimensions,
      confidence: sumConfidence / count,
    };
  }

  /**
   * Find the minimum value for each dimension across multiple cards.
   */
  minimum(cards: ScoreCard[]): ScoreCard {
    if (cards.length === 0) {
      return createEmptyScoreCard();
    }

    const dimensions: ScoreDimensions = {
      correctness: Math.min(...cards.map((c) => c.dimensions.correctness)),
      efficiency: Math.min(...cards.map((c) => c.dimensions.efficiency)),
      clarity: Math.min(...cards.map((c) => c.dimensions.clarity)),
      safety: Math.min(...cards.map((c) => c.dimensions.safety)),
      ceoAlignment: Math.min(...cards.map((c) => c.dimensions.ceoAlignment)),
    };

    return {
      overall: calculateOverallScore(dimensions, this.weights),
      dimensions,
      confidence: Math.min(...cards.map((c) => c.confidence)),
    };
  }

  /**
   * Find the maximum value for each dimension across multiple cards.
   */
  maximum(cards: ScoreCard[]): ScoreCard {
    if (cards.length === 0) {
      return createEmptyScoreCard();
    }

    const dimensions: ScoreDimensions = {
      correctness: Math.max(...cards.map((c) => c.dimensions.correctness)),
      efficiency: Math.max(...cards.map((c) => c.dimensions.efficiency)),
      clarity: Math.max(...cards.map((c) => c.dimensions.clarity)),
      safety: Math.max(...cards.map((c) => c.dimensions.safety)),
      ceoAlignment: Math.max(...cards.map((c) => c.dimensions.ceoAlignment)),
    };

    return {
      overall: calculateOverallScore(dimensions, this.weights),
      dimensions,
      confidence: Math.max(...cards.map((c) => c.confidence)),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private calculateDimensions(metrics: ResponseMetrics): ScoreDimensions {
    return {
      correctness: this.calculateCorrectness(metrics.correctness),
      efficiency: this.calculateEfficiency(metrics.efficiency),
      clarity: this.calculateClarity(metrics.clarity),
      safety: this.calculateSafety(metrics.safety),
      ceoAlignment: this.calculateCeoAlignment(metrics.ceoAlignment),
    };
  }

  private calculateCorrectness(metrics: ResponseMetrics["correctness"]): number {
    let score = 70; // Base score

    // Error count penalty
    if (metrics.errorCount > 0) {
      score -= Math.min(40, metrics.errorCount * 10);
    }

    // Test pass bonus
    if (metrics.testsPass === true) {
      score += 20;
    } else if (metrics.testsPass === false) {
      score -= 20;
    }

    // Explicit success/failure
    if (metrics.succeeded === true) {
      score += 15;
    } else if (metrics.succeeded === false) {
      score -= 25;
    }

    return this.clamp(score);
  }

  private calculateEfficiency(metrics: ResponseMetrics["efficiency"]): number {
    let score = 80; // Base score

    // Token usage penalty
    const tokens = metrics.tokensUsed;
    if (tokens > 3000) score -= 30;
    else if (tokens > 2000) score -= 20;
    else if (tokens > 1000) score -= 10;
    else if (tokens < 200) score += 10;

    // Latency penalty
    const latency = metrics.latencyMs;
    if (latency > 10000) score -= 20;
    else if (latency > 5000) score -= 10;
    else if (latency < 1000) score += 5;

    return this.clamp(score);
  }

  private calculateClarity(metrics: ResponseMetrics["clarity"]): number {
    let score = 60; // Base score

    if (metrics.wellStructured) score += 15;
    if (metrics.hasFormatting) score += 15;

    // Length scoring (prefer medium length)
    const len = metrics.length;
    if (len < 100) score -= 10; // Too short
    else if (len < 500) score += 5; // Good length
    else if (len < 2000) score += 10; // Detailed
    else if (len > 5000) score -= 15; // Too long

    return this.clamp(score);
  }

  private calculateSafety(metrics: ResponseMetrics["safety"]): number {
    let score = 100; // Start at perfect

    // Deductions for security issues
    if (!metrics.securityScanPass) score -= 30;
    if (!metrics.noSecretsExposed) score -= 40;
    if (!metrics.noDangerousOps) score -= 30;

    return this.clamp(score);
  }

  private calculateCeoAlignment(metrics: ResponseMetrics["ceoAlignment"]): number {
    let score = 60; // Base score

    if (metrics.matchesStyle) score += 15;
    if (metrics.followsConventions) score += 15;
    if (metrics.matchesTone) score += 10;

    return this.clamp(score);
  }

  private calculateConfidence(metrics: ResponseMetrics): number {
    // Higher confidence when more metrics are available
    let confidence = 0.5;

    if (metrics.correctness.testsPass !== undefined) confidence += 0.15;
    if (metrics.correctness.succeeded !== undefined) confidence += 0.1;
    if (metrics.efficiency.estimatedCost !== undefined) confidence += 0.05;
    if (metrics.ceoAlignment.matchesStyle !== undefined) confidence += 0.1;
    if (metrics.safety.securityScanPass !== undefined) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private clamp(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a score card calculator with default configuration.
 */
export function createScoreCardCalculator(
  weights?: Partial<DimensionWeights>,
  thresholds?: Partial<ScoreThresholds>
): ScoreCardCalculator {
  return new ScoreCardCalculator(weights, thresholds);
}

/**
 * Create a score card from raw dimension values.
 */
export function createScoreCard(
  dimensions: ScoreDimensions,
  confidence: number = 0.8,
  weights: DimensionWeights = DEFAULT_DIMENSION_WEIGHTS
): ScoreCard {
  return {
    overall: calculateOverallScore(dimensions, weights),
    dimensions,
    confidence,
  };
}

/**
 * Format a score card for display.
 */
export function formatScoreCard(card: ScoreCard): string {
  const level = getScoreLevel(card.overall);
  const levelEmoji = {
    excellent: "🌟",
    good: "✅",
    needs_improvement: "⚠️",
    poor: "❌",
  };

  return [
    `Overall: ${card.overall} ${levelEmoji[level]} (${level})`,
    `  Correctness:   ${card.dimensions.correctness.toString().padStart(3)}`,
    `  Efficiency:    ${card.dimensions.efficiency.toString().padStart(3)}`,
    `  Clarity:       ${card.dimensions.clarity.toString().padStart(3)}`,
    `  Safety:        ${card.dimensions.safety.toString().padStart(3)}`,
    `  CEO Alignment: ${card.dimensions.ceoAlignment.toString().padStart(3)}`,
    `  Confidence:    ${(card.confidence * 100).toFixed(0)}%`,
  ].join("\n");
}
