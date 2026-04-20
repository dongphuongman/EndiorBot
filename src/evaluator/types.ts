/**
 * Evaluator-Optimizer Loop Types
 *
 * Core type definitions for the self-improving feedback loop.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 * Sprint 139 (ADR-050): OpenMythos-inspired adaptive loop patterns.
 *
 * @module evaluator/types
 */

import type { TaskComplexity } from "../agents/types.js";

// ============================================================================
// Adaptive Loop Budget (Sprint 139 P0-2, OpenMythos variable-depth analog)
// ============================================================================

/**
 * Sprint 139 P0-2: Complexity → loop iteration budget mapping.
 * OpenMythos analog: variable `max_loop_iters` (1-64) per task difficulty.
 *
 * Controls how deeply the evaluator loop iterates per request. Simple CEO
 * questions skip the evaluator entirely (0 iterations), while critical
 * architecture decisions get an extended loop with a higher quality bar.
 *
 * CPO condition: "simple" gets 0 optimize iterations + 1 lightweight eval
 * (not a total skip — the score is still recorded for telemetry).
 */
export const ADAPTIVE_LOOP_PARAMS: Record<TaskComplexity, {
  maxRetries: number;
  passThreshold: number;
}> = {
  simple:   { maxRetries: 0, passThreshold: 0 },
  moderate: { maxRetries: 1, passThreshold: 50 },
  complex:  { maxRetries: 3, passThreshold: 65 },
  critical: { maxRetries: 5, passThreshold: 75 },
};

// Re-export TaskComplexity for downstream consumers
export type { TaskComplexity };

// ============================================================================
// Frozen Input Injection (Sprint 139 P1-3, OpenMythos frozen `e` analog)
// ============================================================================

/**
 * Sprint 139 P1-3: Frozen context re-injected at every optimizer iteration.
 * OpenMythos analog: the encoded input `e` from Prelude is frozen (detached)
 * and re-injected at every recurrent loop iteration, preventing hidden state
 * drift from the original signal.
 *
 * In EndiorBot: the CEO's original task + SOUL identity are preserved across
 * optimizer iterations so the response doesn't drift from the original request.
 */
export interface FrozenContext {
  /** CEO's original question — immutable across iterations */
  originalTask: string;
  /** Agent SOUL identity string (optional) */
  soulIdentity?: string;
  /** Non-negotiable constraints (e.g. "LOCAL-ONLY") */
  constraints?: string;
}

/** Max token count for frozen context (CTO condition: 500). chars/4 estimate. */
export const FROZEN_CONTEXT_TOKEN_CAP = 500;
export const FROZEN_CONTEXT_CHAR_CAP = FROZEN_CONTEXT_TOKEN_CAP * 4; // 2000 chars

// ============================================================================
// Score Card Types
// ============================================================================

/**
 * Quality dimensions for response evaluation.
 */
export interface ScoreDimensions {
  /** Did it solve the problem? (weight: 25%) - reduced from 30% in Sprint 51 */
  correctness: number;
  /** Token/cost efficiency (weight: 20%) */
  efficiency: number;
  /** Response clarity and structure (weight: 15%) */
  clarity: number;
  /** Security compliance (weight: 20%) */
  safety: number;
  /** CEO preference match (weight: 15%) */
  ceoAlignment: number;
  /** Tool usage effectiveness (weight: 5%) - added in Sprint 51 */
  toolEffectiveness?: number;
}

/**
 * Multi-dimensional quality score card.
 */
export interface ScoreCard {
  /** Weighted overall score (0-100) */
  overall: number;
  /** Individual dimension scores */
  dimensions: ScoreDimensions;
  /** Evaluation confidence (0-1) */
  confidence: number;
}

/**
 * Configurable weights for score calculation.
 */
export interface DimensionWeights {
  correctness: number;
  efficiency: number;
  clarity: number;
  safety: number;
  ceoAlignment: number;
  /** Tool effectiveness weight (added Sprint 51, default 5%) */
  toolEffectiveness: number;
}

/**
 * Default dimension weights.
 * Sprint 51: Renormalized to add toolEffectiveness (5%)
 * - correctness: 30% -> 25% (-5%)
 * - toolEffectiveness: 0% -> 5% (+5%)
 */
export const DEFAULT_DIMENSION_WEIGHTS: DimensionWeights = {
  correctness: 0.25,      // Reduced from 0.30 in Sprint 51
  efficiency: 0.2,
  clarity: 0.15,
  safety: 0.2,
  ceoAlignment: 0.15,
  toolEffectiveness: 0.05, // Added in Sprint 51
};

/**
 * Score thresholds for action decisions.
 */
export interface ScoreThresholds {
  /** Minimum overall score to pass (default: 50) */
  minOverall: number;
  /** Minimum per-dimension score (default: 40) */
  minPerDimension: number;
  /** Score for "excellent" rating (default: 90) */
  excellentThreshold: number;
  /** Score for "good" rating (default: 70) */
  goodThreshold: number;
}

/**
 * Default score thresholds.
 */
export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
  minOverall: 50,
  minPerDimension: 40,
  excellentThreshold: 90,
  goodThreshold: 70,
};

/**
 * Score level classification.
 */
export type ScoreLevel = "excellent" | "good" | "needs_improvement" | "poor";

/**
 * Comparison result between two score cards.
 */
export interface ScoreComparison {
  /** Which is better: 'a', 'b', or 'equal' */
  winner: "a" | "b" | "equal";
  /** Overall score difference (positive = a is better) */
  overallDiff: number;
  /** Per-dimension differences */
  dimensionDiffs: Record<keyof ScoreDimensions, number>;
  /** Improvement percentage */
  improvementPercent: number;
}

// ============================================================================
// Evaluation Types
// ============================================================================

/**
 * Agent response to be evaluated.
 */
export interface AgentResponse {
  /** Unique response identifier */
  id: string;
  /** Original task/prompt */
  task: string;
  /** Generated response content */
  content: string;
  /** Model that generated the response */
  model: string;
  /** Response generation timestamp */
  timestamp: string;
  /** Token usage */
  tokens?: {
    input: number;
    output: number;
  };
  /** Additional context */
  context?: EvaluationContext;
}

/**
 * Context for evaluation (optional enrichment).
 */
export interface EvaluationContext {
  /** Project being worked on */
  projectId?: string;
  /** Session ID */
  sessionId?: string;
  /** File paths involved */
  files?: string[];
  /** Previous attempts for this task */
  previousAttempts?: number;
  /** CEO profile for alignment scoring */
  ceoProfile?: {
    style?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
    conventions?: Record<string, unknown>;
  };
}

/**
 * Result of evaluating a response.
 */
export interface EvaluationResult {
  /** Response that was evaluated */
  responseId: string;
  /** Calculated score card */
  scores: ScoreCard;
  /** Optimization suggestions */
  suggestions: OptimizationSuggestion[];
  /** When evaluation was performed */
  evaluatedAt: string;
  /** Model used for evaluation */
  evaluationModel: string;
  /** Raw evaluation reasoning (optional) */
  reasoning?: string;
  /** Duration of evaluation in ms */
  durationMs: number;
}

/**
 * Result of comparing two responses.
 */
export interface ComparisonResult {
  /** First response ID */
  responseIdA: string;
  /** Second response ID */
  responseIdB: string;
  /** Score comparison */
  comparison: ScoreComparison;
  /** Recommendation */
  recommendation: "use_a" | "use_b" | "either";
  /** Reasoning for recommendation */
  reasoning: string;
}

// ============================================================================
// Optimization Types
// ============================================================================

/**
 * Suggestion for improving a response.
 */
export interface OptimizationSuggestion {
  /** Type of optimization */
  type: "retry" | "escalate" | "simplify" | "enhance";
  /** Why this optimization is suggested */
  reason: string;
  /** Confidence in suggestion (0-1) */
  confidence: number;
  /** Estimated improvement percentage */
  estimatedImprovement: number;
  /** Strategy name to apply */
  strategyName?: string;
}

/**
 * Trigger condition for an optimization strategy.
 */
export interface StrategyTrigger {
  /** Which dimension or overall score to check */
  dimension: keyof ScoreDimensions | "overall";
  /** Comparison operator */
  operator: "<" | "<=" | ">" | ">=";
  /** Threshold value */
  value: number;
}

/**
 * Action to take when strategy is triggered.
 */
export interface StrategyAction {
  /** Type of action */
  type: "retry" | "escalate" | "modify" | "enhance";
  /** Action-specific parameters */
  params: Record<string, unknown>;
}

/**
 * Optimization strategy definition.
 */
export interface OptimizationStrategy {
  /** Unique strategy name */
  name: string;
  /** Human-readable description */
  description: string;
  /** When to trigger this strategy */
  trigger: StrategyTrigger;
  /** What action to take */
  action: StrategyAction;
  /** Priority (higher = tried first) */
  priority: number;
  /** Maximum attempts before giving up */
  maxAttempts: number;
  /** Cooldown between attempts in ms */
  cooldownMs: number;
  /** Whether strategy is enabled */
  enabled: boolean;
}

/**
 * Result of applying an optimization.
 */
export interface OptimizedResponse {
  /** Original response ID */
  originalResponseId: string;
  /** New optimized response */
  optimizedResponse: AgentResponse;
  /** Strategy that was applied */
  strategyUsed: string;
  /** Score card before optimization */
  beforeScore: ScoreCard;
  /** Score card after optimization */
  afterScore: ScoreCard;
  /** Attempt number */
  attemptNumber: number;
  /** Optimization duration in ms */
  durationMs: number;
}

// ============================================================================
// Loop Types
// ============================================================================

/**
 * Configuration for the evaluator loop.
 */
/**
 * Sprint 139 P0-1 (OpenMythos ACT analog): convergence guard configuration.
 * Robust pattern per CPO: patience + minDelta + warmup, not raw decline count.
 *
 * The guard watches the score trajectory across evaluator iterations:
 *   - `warmup`: number of initial iterations to skip before arming (allow the
 *     optimizer to find its footing). 0 = arm from iteration 1.
 *   - `patience`: consecutive non-improving iterations to tolerate before halting.
 *     Non-improving = current score ≤ (bestScore - minDelta).
 *   - `minDelta`: minimum absolute score improvement to count as "improving".
 *     0 = any improvement counts; 1 = must gain ≥1 point to reset patience.
 *
 * CTO condition: uses `<=` not `<` — a flat score after decline counts as
 * non-convergence.
 */
export interface ConvergenceGuardConfig {
  /** Skip the first N iterations before arming the guard (default: 0) */
  warmup: number;
  /** Consecutive non-improving iterations to tolerate before halting (default: 2) */
  patience: number;
  /** Minimum score gain to count as improvement (default: 1) */
  minDelta: number;
}

export const DEFAULT_CONVERGENCE_GUARD: ConvergenceGuardConfig = {
  warmup: 0,
  patience: 2,
  minDelta: 1,
};

export interface LoopConfig {
  /** Whether loop is enabled */
  enabled: boolean;
  /** Whether to auto-optimize poor responses */
  autoOptimize: boolean;
  /** Score thresholds */
  thresholds: ScoreThresholds;
  /** Retry and timeout limits */
  limits: {
    /** Maximum retry attempts (default: 3) */
    maxRetries: number;
    /** Maximum optimization time in ms (default: 30000) */
    maxOptimizationTime: number;
  };
  /**
   * Sprint 139 P0-1: Convergence guard stops the loop when scores plateau
   * or decline. Optional — omit or set patience to Infinity to disable.
   */
  convergenceGuard?: ConvergenceGuardConfig;
  /** CEO notification settings */
  notifications: {
    /** Whether to notify on low scores */
    notifyOnLowScore: boolean;
    /** Threshold for notification (default: 40) */
    lowScoreThreshold: number;
    /** Notification channel */
    channel: "telegram" | "desktop" | "both";
  };
  /** Evaluation settings */
  evaluation: {
    /** Run evaluation asynchronously */
    async: boolean;
    /** Model to use for evaluation */
    evaluationModel?: string;
    /** Use multi-model consensus */
    useConsensus: boolean;
    /** Models for consensus (if enabled) */
    consensusModels?: string[];
  };
}

/**
 * Default loop configuration.
 */
export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  enabled: true,
  autoOptimize: true,
  thresholds: DEFAULT_SCORE_THRESHOLDS,
  limits: {
    maxRetries: 3,
    maxOptimizationTime: 30000,
  },
  notifications: {
    notifyOnLowScore: true,
    lowScoreThreshold: 40,
    channel: "desktop",
  },
  evaluation: {
    async: true,
    useConsensus: false,
  },
};

/**
 * Current loop status.
 */
export interface LoopStatus {
  /** Whether loop is running */
  running: boolean;
  /** Whether loop is paused */
  paused: boolean;
  /** Current configuration */
  config: LoopConfig;
  /** Responses currently being processed */
  pendingEvaluations: number;
  /** Optimizations in progress */
  activeOptimizations: number;
}

/**
 * Loop metrics for monitoring.
 */
export interface LoopMetrics {
  /** Total responses evaluated */
  totalEvaluated: number;
  /** Responses that triggered optimization */
  totalOptimized: number;
  /** Successful optimizations (score improved) */
  successfulOptimizations: number;
  /** Average overall score */
  averageScore: number;
  /** Average evaluation time in ms */
  averageEvaluationTime: number;
  /** Score distribution */
  scoreDistribution: {
    excellent: number;
    good: number;
    needsImprovement: number;
    poor: number;
  };
  /** Most common low-score dimensions */
  commonIssues: Array<{
    dimension: keyof ScoreDimensions;
    count: number;
  }>;
  /** Period for these metrics */
  periodStart: string;
  periodEnd: string;
}

/**
 * Result of processing a response through the loop.
 */
export interface ProcessedResponse {
  /** Final response (original or optimized) */
  response: AgentResponse;
  /** Evaluation result */
  evaluation: EvaluationResult;
  /** Whether optimization was attempted */
  wasOptimized: boolean;
  /** Optimization details (if attempted) */
  optimization?: OptimizedResponse;
  /** Total processing time in ms */
  totalProcessingTime: number;
}

// ============================================================================
// Event Types (for Brain integration)
// ============================================================================

/**
 * Evaluation event for Brain Layer 1.
 */
export interface EvaluationEvent {
  type: "evaluation";
  responseId: string;
  overall: number;
  dimensions: ScoreDimensions;
  level: ScoreLevel;
  timestamp: string;
}

/**
 * Optimization event for Brain Layer 1.
 */
export interface OptimizationEvent {
  type: "optimization";
  responseId: string;
  strategy: string;
  beforeScore: number;
  afterScore: number;
  success: boolean;
  timestamp: string;
}

/**
 * Score history for a context.
 */
export interface ScoreHistory {
  /** Context (project, file, etc.) */
  context: EvaluationContext;
  /** Historical evaluations */
  evaluations: Array<{
    responseId: string;
    overall: number;
    timestamp: string;
  }>;
  /** Trend direction */
  trend: "improving" | "stable" | "declining";
  /** Average score */
  averageScore: number;
}

// ============================================================================
// Evaluator Configuration
// ============================================================================

/**
 * Configuration for the Evaluator class.
 */
export interface EvaluatorConfig {
  /** Weights for dimension scoring */
  weights: DimensionWeights;
  /** Model to use for evaluation */
  evaluationModel?: string;
  /** Whether to include reasoning in results */
  includeReasoning: boolean;
  /** Timeout for evaluation in ms */
  timeoutMs: number;
  /** Custom evaluation prompt template */
  promptTemplate?: string;
}

/**
 * Default evaluator configuration.
 */
export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  weights: DEFAULT_DIMENSION_WEIGHTS,
  includeReasoning: true,
  timeoutMs: 10000,
};

/**
 * Response metrics extracted for scoring.
 */
export interface ResponseMetrics {
  /** Task completion indicators */
  correctness: {
    /** Error count in response */
    errorCount: number;
    /** Whether tests pass (if applicable) */
    testsPass?: boolean;
    /** Explicit success/failure */
    succeeded?: boolean;
  };
  /** Efficiency metrics */
  efficiency: {
    /** Tokens used */
    tokensUsed: number;
    /** Response latency in ms */
    latencyMs: number;
    /** Estimated cost */
    estimatedCost?: number;
  };
  /** Clarity metrics */
  clarity: {
    /** Response is well-structured */
    wellStructured: boolean;
    /** Has clear sections/formatting */
    hasFormatting: boolean;
    /** Response length (chars) */
    length: number;
  };
  /** Safety metrics */
  safety: {
    /** Security scan passed */
    securityScanPass: boolean;
    /** No secrets exposed */
    noSecretsExposed: boolean;
    /** No dangerous operations */
    noDangerousOps: boolean;
  };
  /** CEO alignment metrics */
  ceoAlignment: {
    /** Matches style preferences */
    matchesStyle: boolean;
    /** Follows conventions */
    followsConventions: boolean;
    /** Matches communication preferences */
    matchesTone: boolean;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a score meets the threshold for a level.
 */
export function getScoreLevel(overall: number, thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS): ScoreLevel {
  if (overall >= thresholds.excellentThreshold) return "excellent";
  if (overall >= thresholds.goodThreshold) return "good";
  if (overall >= thresholds.minOverall) return "needs_improvement";
  return "poor";
}

/**
 * Check if all dimension scores meet the minimum threshold.
 */
export function allDimensionsMeetThreshold(
  dimensions: ScoreDimensions,
  minScore: number
): boolean {
  return Object.values(dimensions).every((score) => score >= minScore);
}

/**
 * Get dimensions below threshold.
 */
export function getDimensionsBelowThreshold(
  dimensions: ScoreDimensions,
  threshold: number
): Array<keyof ScoreDimensions> {
  const below: Array<keyof ScoreDimensions> = [];
  for (const [key, value] of Object.entries(dimensions)) {
    if (value < threshold) {
      below.push(key as keyof ScoreDimensions);
    }
  }
  return below;
}

/**
 * Calculate weighted overall score from dimensions.
 * Sprint 51: Added toolEffectiveness dimension (5% weight)
 */
export function calculateOverallScore(
  dimensions: ScoreDimensions,
  weights: DimensionWeights = DEFAULT_DIMENSION_WEIGHTS
): number {
  // toolEffectiveness is optional (may not be present for non-tool responses)
  const toolScore = dimensions.toolEffectiveness ?? 50; // Neutral if not set

  return Math.round(
    dimensions.correctness * weights.correctness +
    dimensions.efficiency * weights.efficiency +
    dimensions.clarity * weights.clarity +
    dimensions.safety * weights.safety +
    dimensions.ceoAlignment * weights.ceoAlignment +
    toolScore * weights.toolEffectiveness
  );
}

/**
 * Create an empty score card.
 */
export function createEmptyScoreCard(): ScoreCard {
  return {
    overall: 0,
    dimensions: {
      correctness: 0,
      efficiency: 0,
      clarity: 0,
      safety: 0,
      ceoAlignment: 0,
    },
    confidence: 0,
  };
}

/**
 * Validate score card values are in valid range.
 */
export function isValidScoreCard(card: ScoreCard): boolean {
  if (card.overall < 0 || card.overall > 100) return false;
  if (card.confidence < 0 || card.confidence > 1) return false;
  for (const score of Object.values(card.dimensions)) {
    if (score < 0 || score > 100) return false;
  }
  return true;
}
