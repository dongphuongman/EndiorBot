/**
 * Gateway Evaluator Methods
 *
 * JSON-RPC methods for response evaluation and scoring.
 *
 * @module gateway/methods/eval
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 48 Day 8
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";
import { createEvaluator } from "../../evaluator/evaluator.js";
import type { AgentResponse } from "../../evaluator/types.js";
import { getScoreLevel } from "../../evaluator/types.js";
import {
  getRecentFeedback,
  getFeedbackByTask,
  getAverageScore,
  getImprovementRate,
  clearFeedback,
  type FeedbackEntry,
} from "../../evaluator/brain-bridge.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for eval.score method.
 */
export interface EvalScoreParams {
  /** Response to evaluate */
  response: AgentResponse;
  /** Whether to include reasoning in result */
  includeReasoning?: boolean;
}

/**
 * Result of eval.score method.
 */
export interface EvalScoreResult {
  overall: number;
  dimensions: {
    correctness: number;
    efficiency: number;
    clarity: number;
    safety: number;
    ceoAlignment: number;
  };
  confidence: number;
  level: string;
  reasoning?: string;
  evaluatedAt: string;
  durationMs: number;
}

/**
 * Parameters for eval.history method.
 */
export interface EvalHistoryParams {
  /** Maximum entries to return */
  limit?: number;
  /** Filter by task (partial match) */
  task?: string;
}

/**
 * Result of eval.history method.
 */
export interface EvalHistoryResult {
  entries: FeedbackEntry[];
  total: number;
  averageScore: number;
  improvementRate: number;
}

/**
 * Parameters for eval.compare method.
 */
export interface EvalCompareParams {
  /** First response to compare */
  responseA: AgentResponse;
  /** Second response to compare */
  responseB: AgentResponse;
}

/**
 * Result of eval.compare method.
 */
export interface EvalCompareResult {
  winner: "a" | "b" | "equal";
  delta: number;
  dimensions: {
    correctness: number;
    efficiency: number;
    clarity: number;
    safety: number;
    ceoAlignment: number;
  };
  recommendation: string;
  reasoning: string;
}

// ============================================================================
// Module State
// ============================================================================

const evaluator = createEvaluator({ includeReasoning: true });

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Score a response on-demand.
 */
async function handleEvalScore(
  params: unknown,
  _client: ClientInfo
): Promise<EvalScoreResult> {
  const { response, includeReasoning = false } = (params ?? {}) as EvalScoreParams;

  if (!response || !response.id || !response.task || !response.content) {
    throw new Error("Invalid response: must have id, task, and content");
  }

  // Configure reasoning
  if (includeReasoning) {
    evaluator.setWeights(evaluator.getWeights()); // Trigger config update
  }

  const evaluation = await evaluator.evaluate(response);

  const result: EvalScoreResult = {
    overall: evaluation.scores.overall,
    dimensions: evaluation.scores.dimensions,
    confidence: evaluation.scores.confidence,
    level: getScoreLevel(evaluation.scores.overall),
    evaluatedAt: evaluation.evaluatedAt,
    durationMs: evaluation.durationMs,
  };

  if (includeReasoning && evaluation.reasoning) {
    result.reasoning = evaluation.reasoning;
  }

  return result;
}

/**
 * Get evaluation history from feedback storage.
 */
function handleEvalHistory(
  params: unknown,
  _client: ClientInfo
): EvalHistoryResult {
  const { limit = 50, task } = (params ?? {}) as EvalHistoryParams;

  let entries: FeedbackEntry[];

  if (task) {
    entries = getFeedbackByTask(task);
  } else {
    entries = getRecentFeedback(limit);
  }

  // Apply limit after task filter
  if (entries.length > limit) {
    entries = entries.slice(0, limit);
  }

  return {
    entries,
    total: entries.length,
    averageScore: getAverageScore() ?? 0,
    improvementRate: getImprovementRate(),
  };
}

/**
 * Compare two responses and determine which is better.
 */
async function handleEvalCompare(
  params: unknown,
  _client: ClientInfo
): Promise<EvalCompareResult> {
  const { responseA, responseB } = (params ?? {}) as EvalCompareParams;

  if (!responseA || !responseA.id || !responseA.task || !responseA.content) {
    throw new Error("Invalid responseA: must have id, task, and content");
  }
  if (!responseB || !responseB.id || !responseB.task || !responseB.content) {
    throw new Error("Invalid responseB: must have id, task, and content");
  }

  const comparison = await evaluator.compareResponses(responseA, responseB);

  return {
    winner: comparison.comparison.winner,
    delta: comparison.comparison.overallDiff,
    dimensions: comparison.comparison.dimensionDiffs,
    recommendation: comparison.recommendation,
    reasoning: comparison.reasoning,
  };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register evaluator methods with the gateway server.
 */
export function registerEvalMethods(server: GatewayServer): void {
  server.registerMethod("eval.score", handleEvalScore);
  server.registerMethod("eval.history", handleEvalHistory);
  server.registerMethod("eval.compare", handleEvalCompare);
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear evaluation history (for testing).
 */
export function clearEvalHistory(): void {
  clearFeedback();
}

/**
 * Get the evaluator instance (for testing).
 */
export function getEvaluator() {
  return evaluator;
}
