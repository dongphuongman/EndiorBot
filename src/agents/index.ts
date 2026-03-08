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

// Agent Router
export {
  AgentRouter,
  getAgentRouter,
  resetAgentRouter,
  createAgentRouter,
} from "./orchestrator/agent-router.js";
export type {
  SoulMetadata,
  SoulTemplate,
  TierConfig,
  RoutingDecision,
  RoutingError,
  RoutingResult,
  RouterConfig,
} from "./orchestrator/agent-router.js";

// Mention Parser
export {
  parseMention,
  parseCLIMention,
  parseOTTMention,
  getFirstAgent,
  hasMention,
  getExecutorAgents,
  formatMention,
} from "./orchestrator/mention-parser.js";
export type {
  ParsedMention,
  ParseError,
  ParseResult,
} from "./orchestrator/mention-parser.js";

// Team Registry (ADR-017)
export {
  TeamRegistry,
  getTeamRegistry,
  resetTeamRegistry,
  createTeamRegistry,
} from "./orchestrator/team-registry.js";

// Team Types (ADR-017)
export type {
  TeamId,
  TeamArchetype,
  TeamConfigEntry,
  TeamDefinition,
  TeamContext,
  TeammateInfo,
  TeamLookupResult,
  TeamRoutingOutcome,
  TeamRoutingError,
} from "./types/team.js";
export {
  isValidTeamId,
  isValidTeamArchetype,
  isAllowedTeamTransition,
  ALLOWED_TEAM_TRANSITIONS,
  TEAM_SDLC_INFO,
  TEAM_DISPLAY_NAMES,
} from "./types/team.js";

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

// Channel Router (shared OTT/Web routing)
export {
  ChannelRouter,
  createChannelRouter,
  VALID_AGENTS,
  AGENT_SOULS,
  DEFAULT_ROUTER_CONFIG,
} from "./channel-router.js";
export type {
  AgentName,
  ChannelRouterConfig,
  RouteResult,
  AIResult,
  RouterStatus,
} from "./channel-router.js";
