/**
 * Routing Module
 *
 * Task routing, quality gates, and cost optimization.
 *
 * @module agents/routing
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 39 Backlog
 * @authority ADR-001 Multi-Model Orchestrator
 * @pillar 3 - Resource Optimization
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

// Types
export type {
  ProviderId,
  ModelCapability,
  ModelFeature,
  QualityGate,
  QualityGateResult,
  BudgetConstraint,
  CostEstimate,
  CostOptimizationResult,
  SelectionCriteria,
  ModelSelectionResult,
  RoutingConfig,
} from "./types.js";

// Quality Gates
export {
  QualityGatesEvaluator,
  createQualityGates,
  getMinTierForTask,
  MODEL_TIER_HIERARCHY,
  DEFAULT_QUALITY_GATES,
  COMPLEXITY_TIER_MAP,
} from "./quality-gates.js";

// Cost Optimizer
export {
  CostOptimizer,
  createCostOptimizer,
  createCostOptimizerFromEnv,
  DEFAULT_BUDGET,
  DEFAULT_LOCAL_FALLBACK_THRESHOLD,
  TOKEN_ESTIMATES,
  OLLAMA_LOCAL_MODEL,
} from "./cost-optimizer.js";

// Model Selector
export {
  ModelSelector,
  createModelSelector,
  createModelSelectorFromEnv,
  DEFAULT_MODEL_CAPABILITIES,
  CONSULTATION_PRIORITY,
} from "./model-selector.js";
