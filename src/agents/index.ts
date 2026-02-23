/**
 * Agents Module
 *
 * Agent orchestration and management.
 */

// Types
export type {
  AgentEvent,
  AgentEventListener,
  AgentEventType,
  AgentPermissions,
  AgentScope,
  AgentWorkspace,
  ComplexityFactors,
  ConsensusResult,
  ConsultationChunk,
  ConsultationRequest,
  ConsultationResult,
  Disagreement,
  ModelRecommendation,
  ModelResponse,
  ModelRole,
  ModelSelection,
  ModelTier,
  QueryClassification,
  SDLCComplianceCheck,
  TaskComplexity,
  TaskType,
} from "./types.js";

// Agent Scope
export {
  canExecuteCommand,
  canModifyFile,
  createCEOScope,
  createJuniorScope,
  createReadOnlyScope,
  isPathAllowed,
  resolveAgentScope,
} from "./agent-scope.js";
export type { AgentScopeConfig } from "./agent-scope.js";

// Orchestrator
export {
  MultiModelOrchestrator,
  getOrchestrator,
  resetOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from "./orchestrator/index.js";
export type {
  ProviderId,
  ModelConfig,
  ModelQueryResult,
  ConsensusPoint,
  OrchestratorConfig,
} from "./orchestrator/index.js";

// Task Classifier
export {
  TaskClassifier,
  getTaskClassifier,
  resetTaskClassifier,
  createTaskClassifier,
} from "./orchestrator/task-classifier.js";

// Routing (Quality Gates, Cost Optimizer, Model Selector)
export type {
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
} from "./routing/index.js";

export {
  // Quality Gates
  QualityGatesEvaluator,
  createQualityGates,
  getMinTierForTask,
  MODEL_TIER_HIERARCHY,
  DEFAULT_QUALITY_GATES,
  COMPLEXITY_TIER_MAP,
  // Cost Optimizer
  CostOptimizer,
  createCostOptimizer,
  createCostOptimizerFromEnv,
  DEFAULT_BUDGET,
  DEFAULT_LOCAL_FALLBACK_THRESHOLD,
  TOKEN_ESTIMATES,
  OLLAMA_LOCAL_MODEL,
  // Model Selector
  ModelSelector,
  createModelSelector,
  createModelSelectorFromEnv,
  DEFAULT_MODEL_CAPABILITIES,
  CONSULTATION_PRIORITY,
} from "./routing/index.js";
