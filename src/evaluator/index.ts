/**
 * Evaluator-Optimizer Loop Module
 *
 * Self-improving feedback loop for response quality.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 *
 * @module evaluator
 */

// Types
export * from "./types.js";

// Evaluator
export { Evaluator, createEvaluator, createEvaluatorWithModel } from "./evaluator.js";

// Score Card
export {
  ScoreCardCalculator,
  createScoreCardCalculator,
  createScoreCard,
  formatScoreCard,
} from "./score-card.js";

// Optimizer
export {
  Optimizer,
  createOptimizer,
  createOptimizerWithDefaults,
  DEFAULT_OPTIMIZER_CONFIG,
  type OptimizerConfig,
} from "./optimizer.js";

// Strategies
export {
  BUILTIN_STRATEGIES,
  STRATEGY_NAMES,
  getStrategy,
  getApplicableStrategies,
  rephraseStrategy,
  decomposeStrategy,
  escalateModelStrategy,
  addContextStrategy,
  reduceScopeStrategy,
} from "./strategies/index.js";

// Brain Bridge (Day 6)
export {
  getBrainRulesAsCeoRules,
  hasBrainRulesAvailable,
  getBrainFormattedRules,
  checkRuleViolations,
  storeFeedback,
  getRecentFeedback,
  getFeedbackByTask,
  getAverageScore,
  getImprovementRate,
  clearFeedback,
  type FeedbackEntry,
} from "./brain-bridge.js";

// Loop Orchestrator (Day 7)
export {
  EvaluatorLoop,
  createEvaluatorLoop,
  createEvaluatorLoopWithComponents,
  DEFAULT_LOOP_CONFIG,
  type LoopState,
  type LoopStatus,
  type LoopMetrics,
  type ProcessedResponse,
  type LoopEventType,
  type LoopEventHandler,
  type LoopEventData,
} from "./loop.js";
