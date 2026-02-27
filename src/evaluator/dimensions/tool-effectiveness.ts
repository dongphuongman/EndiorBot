/**
 * Tool Effectiveness Dimension
 * Sprint 51 - Day 3-4 - Composio Integration Phase 2
 *
 * Evaluates how effectively AI selects and uses tools.
 * Weight: 5% (added in Sprint 51)
 *
 * Metrics:
 * - Tool Selection Accuracy: Was the right tool chosen?
 * - Argument Correctness: Were arguments valid?
 * - Execution Success: Did execution succeed?
 * - Result Utilization: Was result used effectively?
 *
 * @module evaluator/dimensions/tool-effectiveness
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import type { ToolCall, ToolResult } from '../../tools/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Metrics for tool effectiveness evaluation.
 */
export interface ToolEffectivenessMetrics {
  /** Was the right tool chosen for the task? (0-1) */
  toolSelectionAccuracy: number;
  /** Were arguments correctly formatted? (0-1) */
  argumentCorrectness: number;
  /** Did tool execution succeed? (0-1) */
  executionSuccess: number;
  /** Was the result referenced in response? (0-1) */
  resultUtilization: number;
  /** Raw data */
  raw: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    resultsReferenced: number;
  };
}

/**
 * Dimension score for tool effectiveness.
 */
export interface ToolEffectivenessScore {
  /** Dimension name */
  dimension: 'toolEffectiveness';
  /** Final score (0-100) */
  score: number;
  /** Confidence in this score (0-1) */
  confidence: number;
  /** Human-readable reason */
  reason: string;
  /** Detailed metrics */
  metrics: ToolEffectivenessMetrics;
}

/**
 * Context for evaluation.
 */
export interface ToolEvaluationContext {
  /** Original response content */
  responseContent: string;
  /** Tool calls made */
  toolCalls?: ToolCall[];
  /** Tool results received */
  toolResults?: ToolResult[];
  /** Original task/prompt */
  task?: string;
}

// =============================================================================
// Weights for sub-metrics
// =============================================================================

const METRIC_WEIGHTS = {
  toolSelectionAccuracy: 0.25,
  argumentCorrectness: 0.30,
  executionSuccess: 0.30,
  resultUtilization: 0.15,
} as const;

// =============================================================================
// Evaluation Functions
// =============================================================================

/**
 * Evaluate tool effectiveness from context.
 */
export function evaluateToolEffectiveness(
  context: ToolEvaluationContext
): ToolEffectivenessScore {
  const { toolCalls, toolResults, responseContent } = context;

  // No tools used - neutral score
  if (!toolCalls || toolCalls.length === 0) {
    return {
      dimension: 'toolEffectiveness',
      score: 50, // Neutral score when no tools used
      confidence: 0.3, // Low confidence (not applicable)
      reason: 'No tools were used in this response',
      metrics: {
        toolSelectionAccuracy: 0.5,
        argumentCorrectness: 0.5,
        executionSuccess: 0.5,
        resultUtilization: 0.5,
        raw: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          resultsReferenced: 0,
        },
      },
    };
  }

  const metrics = calculateMetrics(toolCalls, toolResults ?? [], responseContent);
  const score = calculateScore(metrics);

  return {
    dimension: 'toolEffectiveness',
    score,
    confidence: calculateConfidence(toolCalls.length, metrics.executionSuccess),
    reason: generateReason(metrics),
    metrics,
  };
}

/**
 * Calculate effectiveness metrics.
 */
function calculateMetrics(
  toolCalls: ToolCall[],
  toolResults: ToolResult[],
  responseContent: string
): ToolEffectivenessMetrics {
  const totalCalls = toolCalls.length;

  // Execution success rate
  const successfulCalls = toolResults.filter((r) => r.success).length;
  const failedCalls = toolResults.filter((r) => !r.success).length;
  const executionSuccess = totalCalls > 0 ? successfulCalls / totalCalls : 0;

  // Argument correctness - check for validation errors in results
  const validationErrors = toolResults.filter(
    (r) => !r.success && r.error?.code === 'VALIDATION_ERROR'
  ).length;
  const argumentCorrectness = totalCalls > 0
    ? (totalCalls - validationErrors) / totalCalls
    : 1;

  // Tool selection accuracy - heuristic based on success and task match
  // If tools succeeded, likely good selection
  const toolSelectionAccuracy = executionSuccess > 0.5 ? 0.8 : 0.5;

  // Result utilization - check if results are referenced in response
  let resultsReferenced = 0;
  for (const result of toolResults) {
    if (result.success && result.output) {
      const outputStr = JSON.stringify(result.output);
      // Simple heuristic: check if key values appear in response
      const keyValues = extractKeyValues(outputStr);
      for (const value of keyValues) {
        if (responseContent.includes(value)) {
          resultsReferenced++;
          break;
        }
      }
    }
  }
  const resultUtilization = successfulCalls > 0
    ? resultsReferenced / successfulCalls
    : 0;

  return {
    toolSelectionAccuracy,
    argumentCorrectness,
    executionSuccess,
    resultUtilization,
    raw: {
      totalCalls,
      successfulCalls,
      failedCalls,
      resultsReferenced,
    },
  };
}

/**
 * Calculate final score from metrics.
 */
function calculateScore(metrics: ToolEffectivenessMetrics): number {
  const weightedScore =
    metrics.toolSelectionAccuracy * METRIC_WEIGHTS.toolSelectionAccuracy +
    metrics.argumentCorrectness * METRIC_WEIGHTS.argumentCorrectness +
    metrics.executionSuccess * METRIC_WEIGHTS.executionSuccess +
    metrics.resultUtilization * METRIC_WEIGHTS.resultUtilization;

  // Convert to 0-100 scale
  return Math.round(weightedScore * 100);
}

/**
 * Calculate confidence based on sample size.
 */
function calculateConfidence(callCount: number, successRate: number): number {
  // More calls = higher confidence
  // Higher success rate = higher confidence in the score
  const sampleConfidence = Math.min(1, callCount / 5); // Max at 5+ calls
  const successConfidence = successRate > 0.5 ? 0.9 : 0.6;

  return Math.round((sampleConfidence * 0.5 + successConfidence * 0.5) * 100) / 100;
}

/**
 * Generate human-readable reason.
 */
function generateReason(metrics: ToolEffectivenessMetrics): string {
  const reasons: string[] = [];

  if (metrics.executionSuccess >= 0.9) {
    reasons.push('High tool execution success rate');
  } else if (metrics.executionSuccess < 0.5) {
    reasons.push('Low tool execution success rate');
  }

  if (metrics.argumentCorrectness >= 0.9) {
    reasons.push('Accurate tool arguments');
  } else if (metrics.argumentCorrectness < 0.7) {
    reasons.push('Some argument validation errors');
  }

  if (metrics.resultUtilization >= 0.8) {
    reasons.push('Tool results well-utilized in response');
  } else if (metrics.resultUtilization < 0.3) {
    reasons.push('Tool results underutilized');
  }

  if (metrics.toolSelectionAccuracy < 0.7) {
    reasons.push('Could improve tool selection');
  }

  if (reasons.length === 0) {
    return 'Tool usage was adequate';
  }

  return reasons.join('. ');
}

/**
 * Extract key values from JSON string for utilization check.
 */
function extractKeyValues(jsonStr: string): string[] {
  const values: string[] = [];

  try {
    const obj = JSON.parse(jsonStr);
    extractValuesRecursive(obj, values);
  } catch {
    // If not valid JSON, extract quoted strings
    const matches = jsonStr.match(/"([^"]+)"/g);
    if (matches) {
      for (const match of matches) {
        const value = match.slice(1, -1);
        if (value.length >= 5 && value.length <= 100) {
          values.push(value);
        }
      }
    }
  }

  return values.slice(0, 10); // Limit to 10 key values
}

/**
 * Recursively extract string values from object.
 */
function extractValuesRecursive(
  obj: unknown,
  values: string[],
  depth = 0
): void {
  if (depth > 3 || values.length >= 10) {
    return;
  }

  if (typeof obj === 'string') {
    if (obj.length >= 5 && obj.length <= 100) {
      values.push(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractValuesRecursive(item, values, depth + 1);
    }
  } else if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      extractValuesRecursive(value, values, depth + 1);
    }
  }
}

// =============================================================================
// Aggregate Statistics
// =============================================================================

/**
 * Aggregate effectiveness scores over multiple evaluations.
 */
export function aggregateToolEffectivenessScores(
  scores: ToolEffectivenessScore[]
): {
  averageScore: number;
  averageMetrics: ToolEffectivenessMetrics;
  trend: 'improving' | 'stable' | 'declining';
} {
  if (scores.length === 0) {
    return {
      averageScore: 50,
      averageMetrics: {
        toolSelectionAccuracy: 0.5,
        argumentCorrectness: 0.5,
        executionSuccess: 0.5,
        resultUtilization: 0.5,
        raw: { totalCalls: 0, successfulCalls: 0, failedCalls: 0, resultsReferenced: 0 },
      },
      trend: 'stable',
    };
  }

  // Calculate averages
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

  const avgMetrics: ToolEffectivenessMetrics = {
    toolSelectionAccuracy:
      scores.reduce((sum, s) => sum + s.metrics.toolSelectionAccuracy, 0) / scores.length,
    argumentCorrectness:
      scores.reduce((sum, s) => sum + s.metrics.argumentCorrectness, 0) / scores.length,
    executionSuccess:
      scores.reduce((sum, s) => sum + s.metrics.executionSuccess, 0) / scores.length,
    resultUtilization:
      scores.reduce((sum, s) => sum + s.metrics.resultUtilization, 0) / scores.length,
    raw: {
      totalCalls: scores.reduce((sum, s) => sum + s.metrics.raw.totalCalls, 0),
      successfulCalls: scores.reduce((sum, s) => sum + s.metrics.raw.successfulCalls, 0),
      failedCalls: scores.reduce((sum, s) => sum + s.metrics.raw.failedCalls, 0),
      resultsReferenced: scores.reduce((sum, s) => sum + s.metrics.raw.resultsReferenced, 0),
    },
  };

  // Calculate trend (compare first half vs second half)
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (scores.length >= 4) {
    const midpoint = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, midpoint);
    const secondHalf = scores.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    if (diff > 5) trend = 'improving';
    else if (diff < -5) trend = 'declining';
  }

  return {
    averageScore: Math.round(avgScore),
    averageMetrics: avgMetrics,
    trend,
  };
}
