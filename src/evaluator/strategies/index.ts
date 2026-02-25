/**
 * Optimization Strategies Index
 *
 * Built-in strategies for response optimization.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 *
 * @module evaluator/strategies
 */

import type { OptimizationStrategy } from "../types.js";
import { rephraseStrategy } from "./rephrase.js";
import { decomposeStrategy } from "./decompose.js";
import { escalateModelStrategy } from "./escalate-model.js";
import { addContextStrategy } from "./add-context.js";
import { reduceScopeStrategy } from "./reduce-scope.js";

// Re-export individual strategies
export { rephraseStrategy } from "./rephrase.js";
export { decomposeStrategy } from "./decompose.js";
export { escalateModelStrategy } from "./escalate-model.js";
export {
  addContextStrategy,
  getCeoRulesFromBrain,
  hasBrainRules,
  applyAddContextStrategy,
} from "./add-context.js";
export { reduceScopeStrategy } from "./reduce-scope.js";

/**
 * All built-in optimization strategies.
 */
export const BUILTIN_STRATEGIES: OptimizationStrategy[] = [
  rephraseStrategy,
  decomposeStrategy,
  escalateModelStrategy,
  addContextStrategy,
  reduceScopeStrategy,
];

/**
 * Strategy names for reference.
 */
export const STRATEGY_NAMES = {
  REPHRASE: "rephrase",
  DECOMPOSE: "decompose",
  ESCALATE_MODEL: "escalate-model",
  ADD_CONTEXT: "add-context",
  REDUCE_SCOPE: "reduce-scope",
} as const;

/**
 * Get a strategy by name.
 */
export function getStrategy(name: string): OptimizationStrategy | undefined {
  return BUILTIN_STRATEGIES.find((s) => s.name === name);
}

/**
 * Get all strategies that would trigger for a given score.
 */
export function getApplicableStrategies(
  overall: number,
  dimensions: Record<string, number>,
  thresholds: { clarity?: number; correctness?: number; efficiency?: number; ceoAlignment?: number; overall?: number } = {}
): OptimizationStrategy[] {
  const applicable: OptimizationStrategy[] = [];

  const clarityThreshold = thresholds.clarity ?? 50;
  const correctnessThreshold = thresholds.correctness ?? 60;
  const efficiencyThreshold = thresholds.efficiency ?? 40;
  const ceoAlignmentThreshold = thresholds.ceoAlignment ?? 50;
  const overallThreshold = thresholds.overall ?? 50;

  if ((dimensions.clarity ?? 100) < clarityThreshold) {
    applicable.push(rephraseStrategy);
  }
  if ((dimensions.correctness ?? 100) < correctnessThreshold) {
    applicable.push(decomposeStrategy);
  }
  if (overall < overallThreshold) {
    applicable.push(escalateModelStrategy);
  }
  if ((dimensions.ceoAlignment ?? 100) < ceoAlignmentThreshold) {
    applicable.push(addContextStrategy);
  }
  if ((dimensions.efficiency ?? 100) < efficiencyThreshold) {
    applicable.push(reduceScopeStrategy);
  }

  return applicable.sort((a, b) => b.priority - a.priority);
}
