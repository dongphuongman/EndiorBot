/**
 * Context Quality Scorer — Sprint 96
 *
 * Scores TransferableContext entries across 4 quality dimensions:
 * - Relevance (0.35): tag overlap + stage proximity
 * - Recency (0.25): exponential decay based on age
 * - Confidence (0.25): model tier + task success
 * - Completeness (0.15): content length vs expected, truncation
 *
 * Follows RoutingConfidenceCalculator weighted scoring pattern.
 *
 * @module context/transfer/quality-scorer
 * @version 1.0.0
 * @sprint 96
 */

import type {
  TransferableContext,
  ContextQualityScore,
  QualityWeights,
  RecencyDecayConfig,
  TransferContextType,
} from "./types.js";
import {
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_TRANSFER_CONFIG,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * SDLC stages in order for proximity calculation (CTO F4).
 * Not imported from src/ — hardcoded here to avoid coupling.
 */
const SDLC_STAGES = [
  "00-FOUNDATION",
  "01-PLANNING",
  "02-DESIGN",
  "03-INTEGRATE",
  "04-BUILD",
  "05-TEST",
  "06-DEPLOY",
  "07-OPERATE",
];

/**
 * Minimum content length (in characters) considered "complete" per type.
 */
const MIN_COMPLETE_LENGTH: Record<TransferContextType, number> = {
  goal_result: 100,
  decision: 40,
  architecture: 80,
  error_pattern: 60,
  task_output: 50,
  blocker_resolution: 40,
};

/**
 * High-confidence model provider keywords.
 */
const HIGH_CONFIDENCE_PROVIDERS = ["opus", "claude", "gpt-4"];

// ============================================================================
// ContextQualityScorer
// ============================================================================

export class ContextQualityScorer {
  private readonly weights: QualityWeights;
  private readonly decay: RecencyDecayConfig;

  constructor(
    weights?: QualityWeights,
    decay?: RecencyDecayConfig,
  ) {
    this.weights = weights ?? DEFAULT_QUALITY_WEIGHTS;
    this.decay = decay ?? DEFAULT_TRANSFER_CONFIG.decay;
  }

  /**
   * Score a context entry across all 4 dimensions.
   *
   * CTO F4: currentStage parameter for stage proximity.
   */
  score(
    context: TransferableContext,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): ContextQualityScore {
    const relevance = this.scoreRelevance(context, currentGoal, currentTags, currentStage);
    const recency = this.scoreRecency(context);
    const confidence = this.scoreConfidence(context);
    const completeness = this.scoreCompleteness(context);

    const composite =
      relevance * this.weights.relevance +
      recency * this.weights.recency +
      confidence * this.weights.confidence +
      completeness * this.weights.completeness;

    return {
      relevance,
      recency,
      confidence,
      completeness,
      composite,
    };
  }

  /**
   * Score relevance based on tag overlap and stage proximity.
   */
  scoreRelevance(
    context: TransferableContext,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): number {
    let score = 0.0;
    let factors = 0;

    // Tag overlap (0-1)
    if (currentTags && currentTags.length > 0 && context.tags.length > 0) {
      const contextTagSet = new Set(context.tags.map((t) => t.toLowerCase()));
      const matchCount = currentTags.filter((t) =>
        contextTagSet.has(t.toLowerCase()),
      ).length;
      score += matchCount / Math.max(currentTags.length, context.tags.length);
      factors++;
    }

    // Stage proximity (0-1) — CTO F4
    if (currentStage && context.sdlcStage) {
      score += this.stageProximity(currentStage, context.sdlcStage);
      factors++;
    }

    // Goal keyword overlap (0-1)
    if (currentGoal && context.content) {
      const goalWords = this.extractKeywords(currentGoal);
      const contentWords = this.extractKeywords(context.content);
      if (goalWords.length > 0 && contentWords.length > 0) {
        const contentSet = new Set(contentWords);
        const overlap = goalWords.filter((w) => contentSet.has(w)).length;
        score += overlap / goalWords.length;
        factors++;
      }
    }

    // If no context signals, give a baseline score based on type
    if (factors === 0) {
      return this.baselineRelevance(context.type);
    }

    return Math.min(1.0, score / factors);
  }

  /**
   * Score recency using exponential decay.
   * Returns 1.0 for fresh context, decays toward 0.
   */
  scoreRecency(context: TransferableContext): number {
    const createdAt = new Date(context.createdAt).getTime();
    const now = Date.now();
    const ageMs = now - createdAt;

    if (ageMs <= 0) return 1.0;

    const halfLife = this.getHalfLife(context.type);

    // Exponential decay: score = 2^(-age/halfLife)
    return Math.pow(2, -ageMs / halfLife);
  }

  /**
   * Score confidence based on metadata signals.
   */
  scoreConfidence(context: TransferableContext): number {
    let score = 0.5; // baseline

    // Check if from a high-confidence provider
    const provider = String(context.metadata.provider ?? "");
    if (HIGH_CONFIDENCE_PROVIDERS.some((p) => provider.toLowerCase().includes(p))) {
      score += 0.2;
    }

    // Check if task was successful
    const success = context.metadata.success;
    if (success === true) {
      score += 0.2;
    } else if (success === false) {
      score -= 0.2;
    }

    // Check if quality gate was passed
    const gatePassed = context.metadata.qualityGatePassed;
    if (gatePassed === true) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1.0, score));
  }

  /**
   * Score completeness based on content length and truncation markers.
   */
  scoreCompleteness(context: TransferableContext): number {
    // Check for truncation markers
    if (context.content.endsWith("...") || context.content.endsWith("[truncated]")) {
      return 0.5;
    }

    // Check content length vs minimum expected
    const minLength = MIN_COMPLETE_LENGTH[context.type];
    if (context.content.length >= minLength) {
      return 1.0;
    }

    // Proportional score for shorter content
    return Math.max(0.2, context.content.length / minLength);
  }

  /**
   * Apply recency decay to an existing score.
   */
  applyDecay(score: ContextQualityScore, ageMs: number, type: TransferContextType): ContextQualityScore {
    const halfLife = this.getHalfLife(type);
    const decayFactor = Math.pow(2, -ageMs / halfLife);

    const newRecency = score.recency * decayFactor;
    const composite =
      score.relevance * this.weights.relevance +
      newRecency * this.weights.recency +
      score.confidence * this.weights.confidence +
      score.completeness * this.weights.completeness;

    return {
      ...score,
      recency: newRecency,
      composite,
    };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Calculate proximity between two SDLC stages.
   * Same stage = 1.0, adjacent = 0.7, 2 apart = 0.4, else 0.1
   */
  private stageProximity(stageA: string, stageB: string): number {
    const idxA = SDLC_STAGES.indexOf(stageA);
    const idxB = SDLC_STAGES.indexOf(stageB);

    // Unknown stages → neutral
    if (idxA === -1 || idxB === -1) return 0.5;

    const distance = Math.abs(idxA - idxB);

    if (distance === 0) return 1.0;
    if (distance === 1) return 0.7;
    if (distance === 2) return 0.4;
    return 0.1;
  }

  /**
   * Extract lowercase keywords from text (3+ chars, no stop words).
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "and", "for", "with", "this", "that", "from", "have", "will",
      "should", "would", "could", "been", "being", "into", "also", "than",
    ]);

    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));
  }

  /**
   * Baseline relevance when no comparison signals available.
   */
  private baselineRelevance(type: TransferContextType): number {
    switch (type) {
      case "decision":
      case "architecture":
        return 0.6; // High-value types get moderate baseline
      case "goal_result":
      case "blocker_resolution":
        return 0.5;
      case "error_pattern":
      case "task_output":
        return 0.4;
    }
  }

  /**
   * Get recency half-life for a context type.
   */
  private getHalfLife(type: TransferContextType): number {
    switch (type) {
      case "decision":
        return this.decay.decisionHalfLifeMs;
      case "architecture":
        return this.decay.architectureHalfLifeMs;
      case "goal_result":
        return this.decay.goalResultHalfLifeMs;
      case "task_output":
        return this.decay.taskOutputHalfLifeMs;
      case "error_pattern":
        return this.decay.errorPatternHalfLifeMs;
      case "blocker_resolution":
        return this.decay.blockerResolutionHalfLifeMs;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalScorer: ContextQualityScorer | undefined;

export function getContextQualityScorer(): ContextQualityScorer {
  if (!globalScorer) {
    globalScorer = new ContextQualityScorer();
  }
  return globalScorer;
}

export function resetContextQualityScorer(): void {
  globalScorer = undefined;
}
