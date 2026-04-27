/**
 * Evaluator Loop Orchestrator
 *
 * Automatic evaluation and optimization loop for responses.
 * Coordinates Evaluator + Optimizer with configurable thresholds.
 *
 * @module evaluator/loop
 */

import { createLogger } from '../logging/logger.js';
import { Evaluator } from './evaluator.js';
import { Optimizer } from './optimizer.js';
import { storeFeedback, type FeedbackEntry } from './brain-bridge.js';
import type {
  AgentResponse,
  EvaluationResult,
  ScoreCard,
  LoopConfig,
  ConvergenceGuardConfig,
  TaskComplexity,
  FrozenContext,
} from './types.js';
import { DEFAULT_SCORE_THRESHOLDS, DEFAULT_CONVERGENCE_GUARD, ADAPTIVE_LOOP_PARAMS } from './types.js';

const logger = createLogger('evaluator-loop');

// =============================================================================
// Types
// =============================================================================

/**
 * Loop state enum.
 */
export type LoopState = 'stopped' | 'running' | 'paused';

/**
 * Loop status information.
 */
export interface LoopStatus {
  state: LoopState;
  autoOptimize: boolean;
  thresholds: {
    minOverall: number;
    minPerDimension: number;
  };
  limits: {
    maxRetries: number;
    maxOptimizationTime: number;
  };
  startedAt?: string;
  pausedAt?: string;
}

/**
 * Loop metrics.
 */
export interface LoopMetrics {
  totalEvaluated: number;
  totalOptimized: number;
  totalFailed: number;
  totalSkipped: number;
  averageScore: number;
  averageOptimizationTime: number;
  optimizationSuccessRate: number;
  dimensionAverages: Record<string, number>;
}

/**
 * Processed response result.
 */
export interface ProcessedResponse {
  original: AgentResponse;
  evaluation: EvaluationResult;
  optimized?: AgentResponse;
  optimizationApplied?: string;
  finalScore: number;
  iterations: number;
  durationMs: number;
}

/**
 * Event types for the loop.
 */
export type LoopEventType = 'evaluated' | 'optimized' | 'failed' | 'skipped' | 'convergence_halted' | 'iteration_budget_applied';

/**
 * Event handler function.
 */
export type LoopEventHandler = (data: LoopEventData) => void;

/**
 * Event data.
 */
export interface LoopEventData {
  type: LoopEventType;
  responseId: string;
  score?: number;
  strategy?: string;
  error?: string;
  timestamp: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

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
    channel: 'desktop',
  },
  evaluation: {
    async: true,
    useConsensus: false,
  },
};

// =============================================================================
// Evaluator Loop Class
// =============================================================================

/**
 * Evaluator Loop - orchestrates automatic evaluation and optimization.
 */
export class EvaluatorLoop {
  private evaluator: Evaluator;
  private optimizer: Optimizer;
  private config: LoopConfig;
  private state: LoopState = 'stopped';
  private startedAt: string | undefined;
  private pausedAt: string | undefined;

  // Metrics
  private metrics: LoopMetrics = {
    totalEvaluated: 0,
    totalOptimized: 0,
    totalFailed: 0,
    totalSkipped: 0,
    averageScore: 0,
    averageOptimizationTime: 0,
    optimizationSuccessRate: 0,
    dimensionAverages: {},
  };

  // Event handlers
  private eventHandlers: Map<LoopEventType, Set<LoopEventHandler>> = new Map();

  // Score history for average calculation
  private scoreHistory: number[] = [];
  private optimizationTimes: number[] = [];
  private optimizationResults: boolean[] = [];

  constructor(
    evaluator: Evaluator,
    optimizer: Optimizer,
    config: Partial<LoopConfig> = {}
  ) {
    this.evaluator = evaluator;
    this.optimizer = optimizer;
    // Deep copy to prevent mutation of DEFAULT_LOOP_CONFIG
    this.config = {
      ...DEFAULT_LOOP_CONFIG,
      ...config,
      thresholds: { ...DEFAULT_LOOP_CONFIG.thresholds, ...config.thresholds },
      limits: { ...DEFAULT_LOOP_CONFIG.limits, ...config.limits },
      notifications: { ...DEFAULT_LOOP_CONFIG.notifications, ...config.notifications },
      evaluation: { ...DEFAULT_LOOP_CONFIG.evaluation, ...config.evaluation },
    };
  }

  // ===========================================================================
  // Main Loop
  // ===========================================================================

  /**
   * Process a response through evaluation and optional optimization.
   *
   * Key invariants (per CTO spec):
   * - Loop exits on PASS (score >= passThreshold)
   * - Loop exits when no strategy available
   * - bestResponse tracks best result across iterations
   * - storeFeedback on every iteration
   *
   * @param response - The agent response to process
   * @param passThreshold - Score threshold to pass (default: minOverall from config)
   * @returns Processed response with evaluation and possible optimization
   */
  /**
   * Process a response through the evaluator-optimizer loop.
   *
   * Sprint 139 P0-2: threshold precedence (W3 doc fix):
   *   1. `ADAPTIVE_LOOP_PARAMS[complexity].passThreshold` — when complexity is set
   *   2. `passThreshold` parameter — explicit caller override
   *   3. `this.config.thresholds.minOverall` — static config fallback
   *
   * When `complexity` is provided, it overrides BOTH maxRetries AND passThreshold
   * from ADAPTIVE_LOOP_PARAMS. The explicit `passThreshold` parameter is only used
   * when no complexity is set.
   */
  async processResponse(
    response: AgentResponse,
    passThreshold?: number,
    complexity?: TaskComplexity,
  ): Promise<ProcessedResponse> {
    const startTime = Date.now();

    // Sprint 139 P0-2 (OpenMythos variable-depth analog): resolve effective
    // loop limits from TaskComplexity. When complexity is provided, the
    // ADAPTIVE_LOOP_PARAMS map overrides the static config.
    const adaptiveParams = complexity ? ADAPTIVE_LOOP_PARAMS[complexity] : undefined;
    const effectiveMaxRetries = adaptiveParams?.maxRetries ?? this.config.limits.maxRetries;
    const threshold = adaptiveParams?.passThreshold ?? passThreshold ?? this.config.thresholds.minOverall;

    if (adaptiveParams) {
      logger.info('Adaptive iteration budget applied', {
        responseId: response.id,
        complexity,
        effectiveMaxRetries,
        threshold,
        staticMaxRetries: this.config.limits.maxRetries,
      });
      // W2 fix: include iterationsSaved for telemetry consumers
      this.emitEvent({
        type: 'iteration_budget_applied',
        responseId: response.id,
        score: effectiveMaxRetries,
        timestamp: new Date().toISOString(),
        strategy: `complexity=${complexity}, saved=${this.config.limits.maxRetries - effectiveMaxRetries}`,
      });
    }

    // Check if loop is running
    if (this.state !== 'running') {
      logger.warn('Loop is not running, skipping processing', {
        state: this.state,
        responseId: response.id,
      });

      this.emitEvent({
        type: 'skipped',
        responseId: response.id,
        timestamp: new Date().toISOString(),
      });

      this.metrics.totalSkipped++;

      // Return minimal result with default score card
      const emptyEval: EvaluationResult = {
        responseId: response.id,
        scores: {
          overall: 0,
          dimensions: {
            correctness: 0,
            efficiency: 0,
            clarity: 0,
            safety: 0,
            ceoAlignment: 0,
          },
          confidence: 0,
        },
        suggestions: [],
        evaluatedAt: new Date().toISOString(),
        evaluationModel: 'skipped',
        durationMs: 0,
      };

      return {
        original: response,
        evaluation: emptyEval,
        finalScore: emptyEval.scores.overall,
        iterations: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Track best response across iterations (CTO spec)
    let currentResponse = response;
    let currentEvaluation: EvaluationResult;
    let bestScore = 0;
    let bestResponse: AgentResponse = response;
    let bestEvaluation: EvaluationResult | null = null;
    let iterations = 0;
    let optimizationApplied: string | undefined;

    try {
      const optimizationStart = Date.now();

      // Sprint 139 P1-3 (OpenMythos frozen input analog): construct frozen
      // context ONCE from the original response. Passed to every optimize() call
      // so the optimizer stays anchored to the CEO's original task.
      const frozenCtx: FrozenContext = {
        originalTask: response.task,
      };

      // Sprint 139 P0-1 (OpenMythos ACT analog): convergence guard.
      // Robust pattern (CPO: patience + minDelta + warmup).
      // Tracks consecutive non-improving iterations after a warmup period.
      // "Non-improving" = current score ≤ (bestScore - minDelta).
      // Uses <= per CTO: flat score after decline is still non-convergence.
      const cg: ConvergenceGuardConfig =
        this.config.convergenceGuard ?? DEFAULT_CONVERGENCE_GUARD;
      let nonImprovingStreak = 0;

      // Sprint 139 P0-2: simple-task fast path.
      // CPO condition: 0 optimize iterations + 1 lightweight eval (not total
      // skip — the score is recorded for telemetry). When effectiveMaxRetries
      // is 0, run a single evaluation and return immediately.
      if (effectiveMaxRetries === 0) {
        const singleEval = await this.evaluator.evaluate(response);
        this.metrics.totalEvaluated++;
        this.scoreHistory.push(singleEval.scores.overall);
        this.updateDimensionAverages(singleEval.scores);
        this.storeFeedbackEntry(response, singleEval, undefined, false);

        logger.info('Simple-task fast path: 1 eval, 0 optimize iterations', {
          responseId: response.id,
          complexity,
          score: singleEval.scores.overall,
        });

        return {
          original: response,
          evaluation: singleEval,
          finalScore: singleEval.scores.overall,
          iterations: 1,
          durationMs: Date.now() - startTime,
        };
      }

      // Main optimization loop
      // Sprint 139 P0-2: use effectiveMaxRetries (adaptive per complexity)
      // instead of static this.config.limits.maxRetries.
      for (let iter = 0; iter < effectiveMaxRetries; iter++) {
        iterations++;

        // Evaluate current response
        currentEvaluation = await this.evaluator.evaluate(currentResponse);
        this.metrics.totalEvaluated++;

        logger.info('Evaluation complete', {
          responseId: response.id,
          iteration: iter + 1,
          overall: currentEvaluation.scores.overall,
        });

        this.emitEvent({
          type: 'evaluated',
          responseId: response.id,
          score: currentEvaluation.scores.overall,
          timestamp: new Date().toISOString(),
        });

        // Update score history
        this.scoreHistory.push(currentEvaluation.scores.overall);
        this.updateDimensionAverages(currentEvaluation.scores);

        // Store feedback on every iteration (CTO spec)
        const improved = currentEvaluation.scores.overall > bestScore;
        this.storeFeedbackEntry(
          currentResponse,
          currentEvaluation,
          optimizationApplied,
          improved
        );

        // Track best response (handles oscillation)
        if (currentEvaluation.scores.overall > bestScore) {
          bestScore = currentEvaluation.scores.overall;
          bestResponse = currentResponse;
          bestEvaluation = currentEvaluation;
        }

        // Sprint 139 P0-1: Convergence guard (OpenMythos ACT analog).
        // After warmup, check if this iteration improved by at least minDelta
        // over bestScore. If not, increment the non-improving streak. Once the
        // streak reaches `patience`, halt and return bestResponse.
        if (iter >= cg.warmup) {
          const meetsConvergenceCriteria = currentEvaluation.scores.overall > bestScore - cg.minDelta;
          if (!meetsConvergenceCriteria) {
            nonImprovingStreak++;
            if (nonImprovingStreak >= cg.patience) {
              logger.info('Convergence guard: non-improving streak reached patience limit', {
                responseId: response.id,
                iterations,
                bestScore,
                currentScore: currentEvaluation.scores.overall,
                patience: cg.patience,
                warmup: cg.warmup,
                minDelta: cg.minDelta,
                nonImprovingStreak,
              });
              this.emitEvent({
                type: 'convergence_halted',
                responseId: response.id,
                score: bestScore,
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } else {
            nonImprovingStreak = 0;
          }
        }

        // Early exit on PASS (CTO spec)
        if (currentEvaluation.scores.overall >= threshold) {
          logger.info('Score meets threshold, exiting loop', {
            responseId: response.id,
            score: currentEvaluation.scores.overall,
            threshold,
            iterations,
          });
          break;
        }

        // Don't optimize on last iteration
        if (iter >= effectiveMaxRetries - 1) {
          break;
        }

        // Check if auto-optimize is enabled
        if (!this.config.autoOptimize) {
          break;
        }

        // Select strategy for lowest-scoring dimension
        // Sprint 139 P1-4: pass iteration index for iteration-aware strategy selection
        const strategy = this.optimizer.selectStrategy(currentEvaluation.scores, iter);

        // Exit when no strategy available (CTO spec - prevents infinite loop)
        if (!strategy) {
          logger.info('No applicable strategy found, exiting loop', {
            responseId: response.id,
            iteration: iter + 1,
          });
          break;
        }

        logger.info('Applying optimization strategy', {
          responseId: response.id,
          strategy: strategy.name,
          iteration: iter + 1,
        });

        try {
          // Sprint 139 P1-3: pass frozenCtx so the optimizer re-anchors
          // to the CEO's original task at every iteration.
          // Sprint 139 P1-4: pass iteration index + total for iteration-aware prompting.
          const optimized = await this.optimizer.optimize(
            currentResponse,
            strategy,
            currentEvaluation.scores,
            frozenCtx,
            iter,
            effectiveMaxRetries,
          );

          // Update current response for next iteration
          currentResponse = optimized.optimizedResponse;
          optimizationApplied = strategy.name;
          this.optimizationResults.push(true);
        } catch (error) {
          logger.error('Strategy application failed', {
            responseId: response.id,
            strategy: strategy.name,
            error: error instanceof Error ? error.message : String(error),
          });
          this.optimizationResults.push(false);
        }

        // Check time limit
        if (Date.now() - optimizationStart > this.config.limits.maxOptimizationTime) {
          logger.warn('Optimization time limit reached', {
            responseId: response.id,
            elapsedMs: Date.now() - optimizationStart,
          });
          break;
        }
      }

      const optimizationDuration = Date.now() - optimizationStart;
      this.optimizationTimes.push(optimizationDuration);

      if (optimizationApplied) {
        this.metrics.totalOptimized++;
        this.emitEvent({
          type: 'optimized',
          responseId: response.id,
          score: bestScore,
          strategy: optimizationApplied,
          timestamp: new Date().toISOString(),
        });
      }

      // Use best evaluation (fallback to last if no improvement)
      const finalEvaluation = bestEvaluation ?? currentEvaluation!;

      // Check for low score notification
      if (
        this.config.notifications.notifyOnLowScore &&
        finalEvaluation.scores.overall < this.config.notifications.lowScoreThreshold
      ) {
        this.notifyLowScore(response.id, finalEvaluation.scores.overall);
      }

      // Update metrics
      this.updateMetrics();

      // Return best response, not just last (CTO spec)
      const result: ProcessedResponse = {
        original: response,
        evaluation: finalEvaluation,
        finalScore: finalEvaluation.scores.overall,
        iterations,
        durationMs: Date.now() - startTime,
      };

      if (optimizationApplied) {
        result.optimized = bestResponse;
        result.optimizationApplied = optimizationApplied;
      }

      return result;
    } catch (error) {
      this.metrics.totalFailed++;

      logger.error('Response processing failed', {
        responseId: response.id,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emitEvent({
        type: 'failed',
        responseId: response.id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Optimize a response with a specific prompt/rubric iteratively.
   *
   * This is the main entry point matching CTO's spec:
   * `optimizeLoop(prompt, rubric, maxIter)`
   *
   * @param prompt - The original prompt/task
   * @param _rubric - Evaluation rubric/criteria (reserved for future)
   * @param maxIter - Maximum iterations (default: 3)
   * @param passThreshold - Score to consider passing (default: minOverall)
   * @returns Processed response with best result
   */
  async optimizeLoop(
    prompt: string,
    _rubric: string,
    maxIter: number = 3,
    passThreshold?: number
  ): Promise<ProcessedResponse> {
    const response: AgentResponse = {
      id: `loop-${Date.now()}`,
      task: prompt,
      content: prompt,
      model: 'pending',
      timestamp: new Date().toISOString(),
      tokens: {
        input: 0,
        output: 0,
      },
    };

    // Temporarily override max retries
    const originalMaxRetries = this.config.limits.maxRetries;
    this.config.limits.maxRetries = maxIter;

    try {
      return await this.processResponse(response, passThreshold);
    } finally {
      this.config.limits.maxRetries = originalMaxRetries;
    }
  }

  /**
   * Evaluate without optimization - single-shot evaluation.
   *
   * @param response - The response to evaluate
   * @returns Evaluation result only (no optimization)
   */
  async evaluateOnly(response: AgentResponse): Promise<EvaluationResult> {
    // Temporarily disable auto-optimize
    const originalAutoOptimize = this.config.autoOptimize;
    this.config.autoOptimize = false;

    try {
      const result = await this.processResponse(response);
      return result.evaluation;
    } finally {
      this.config.autoOptimize = originalAutoOptimize;
    }
  }

  // ===========================================================================
  // Control Methods
  // ===========================================================================

  /**
   * Start the evaluation loop.
   */
  start(): void {
    if (this.state === 'running') {
      logger.warn('Loop is already running');
      return;
    }

    this.state = 'running';
    this.startedAt = new Date().toISOString();
    this.pausedAt = undefined;

    logger.info('Evaluation loop started', {
      config: {
        autoOptimize: this.config.autoOptimize,
        thresholds: this.config.thresholds,
        limits: this.config.limits,
      },
    });
  }

  /**
   * Stop the evaluation loop.
   */
  stop(): void {
    if (this.state === 'stopped') {
      logger.warn('Loop is already stopped');
      return;
    }

    this.state = 'stopped';
    this.startedAt = undefined;
    this.pausedAt = undefined;

    logger.info('Evaluation loop stopped');
  }

  /**
   * Pause the evaluation loop.
   */
  pause(): void {
    if (this.state !== 'running') {
      logger.warn('Cannot pause - loop is not running', { state: this.state });
      return;
    }

    this.state = 'paused';
    this.pausedAt = new Date().toISOString();

    logger.info('Evaluation loop paused');
  }

  /**
   * Resume the evaluation loop.
   */
  resume(): void {
    if (this.state !== 'paused') {
      logger.warn('Cannot resume - loop is not paused', { state: this.state });
      return;
    }

    this.state = 'running';
    this.pausedAt = undefined;

    logger.info('Evaluation loop resumed');
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set score thresholds.
   */
  setThresholds(thresholds: Partial<LoopConfig['thresholds']>): void {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...thresholds,
    };

    logger.info('Thresholds updated', { thresholds: this.config.thresholds });
  }

  /**
   * Set maximum retry count.
   */
  setMaxRetries(max: number): void {
    this.config.limits.maxRetries = max;
    logger.info('Max retries updated', { maxRetries: max });
  }

  /**
   * Enable or disable auto-optimization.
   */
  setAutoOptimize(enabled: boolean): void {
    this.config.autoOptimize = enabled;
    logger.info('Auto-optimize updated', { autoOptimize: enabled });
  }

  /**
   * Get current configuration.
   */
  getConfig(): LoopConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: LoopEventType, handler: LoopEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: LoopEventType, handler: LoopEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit an event to all registered handlers.
   */
  private emitEvent(data: LoopEventData): void {
    const handlers = this.eventHandlers.get(data.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          logger.error('Event handler error', {
            event: data.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  // ===========================================================================
  // Status & Metrics
  // ===========================================================================

  /**
   * Get current loop status.
   */
  getStatus(): LoopStatus {
    const status: LoopStatus = {
      state: this.state,
      autoOptimize: this.config.autoOptimize,
      thresholds: {
        minOverall: this.config.thresholds.minOverall,
        minPerDimension: this.config.thresholds.minPerDimension,
      },
      limits: { ...this.config.limits },
    };

    if (this.startedAt) {
      status.startedAt = this.startedAt;
    }
    if (this.pausedAt) {
      status.pausedAt = this.pausedAt;
    }

    return status;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): LoopMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalEvaluated: 0,
      totalOptimized: 0,
      totalFailed: 0,
      totalSkipped: 0,
      averageScore: 0,
      averageOptimizationTime: 0,
      optimizationSuccessRate: 0,
      dimensionAverages: {},
    };
    this.scoreHistory = [];
    this.optimizationTimes = [];
    this.optimizationResults = [];

    logger.info('Metrics reset');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Update average metrics.
   */
  private updateMetrics(): void {
    // Average score
    if (this.scoreHistory.length > 0) {
      const sum = this.scoreHistory.reduce((a, b) => a + b, 0);
      this.metrics.averageScore = Math.round(sum / this.scoreHistory.length);
    }

    // Average optimization time
    if (this.optimizationTimes.length > 0) {
      const sum = this.optimizationTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageOptimizationTime = Math.round(sum / this.optimizationTimes.length);
    }

    // Optimization success rate
    if (this.optimizationResults.length > 0) {
      const successful = this.optimizationResults.filter(Boolean).length;
      this.metrics.optimizationSuccessRate = Math.round(
        (successful / this.optimizationResults.length) * 100
      );
    }
  }

  /**
   * Update dimension averages.
   */
  private updateDimensionAverages(scoreCard: ScoreCard): void {
    const dimensions = scoreCard.dimensions;

    for (const key of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      const current = this.metrics.dimensionAverages[key] ?? 0;
      const count = this.scoreHistory.length;
      const dimValue = dimensions[key] ?? 50; // Default to neutral for optional dimensions
      const newAvg = count > 1
        ? Math.round((current * (count - 1) + dimValue) / count)
        : dimValue;
      this.metrics.dimensionAverages[key] = newAvg;
    }
  }

  /**
   * Store feedback entry for learning.
   */
  private storeFeedbackEntry(
    response: AgentResponse,
    evaluation: EvaluationResult,
    strategyApplied?: string,
    improved: boolean = false
  ): void {
    const entry: FeedbackEntry = {
      taskId: response.id,
      timestamp: new Date().toISOString(),
      prompt: response.task,
      response: response.content,
      score: evaluation.scores.overall,
      dimensions: { ...evaluation.scores.dimensions },
      improved,
    };

    if (strategyApplied) {
      entry.strategyApplied = strategyApplied;
    }

    storeFeedback(entry);
  }

  /**
   * Notify about low score (placeholder for actual notification).
   */
  private notifyLowScore(responseId: string, score: number): void {
    logger.warn('Low score detected', {
      responseId,
      score,
      threshold: this.config.notifications.lowScoreThreshold,
      channel: this.config.notifications.channel,
    });

    // DEFERRED(Sprint 147): Implement actual notification via Telegram/Desktop
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an EvaluatorLoop with default components.
 */
export function createEvaluatorLoop(
  config: Partial<LoopConfig> = {}
): EvaluatorLoop {
  const evaluator = new Evaluator();
  const optimizer = new Optimizer();

  return new EvaluatorLoop(evaluator, optimizer, config);
}

/**
 * Create an EvaluatorLoop with custom components.
 */
export function createEvaluatorLoopWithComponents(
  evaluator: Evaluator,
  optimizer: Optimizer,
  config: Partial<LoopConfig> = {}
): EvaluatorLoop {
  return new EvaluatorLoop(evaluator, optimizer, config);
}
