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
  ConsensusResult,
  ConsultationChunk,
  ConsultationRequest,
  ConsultationResult,
  Disagreement,
  ModelRecommendation,
  ModelResponse,
  ModelRole,
  ModelSelection,
  QueryClassification,
  SDLCComplianceCheck,
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
