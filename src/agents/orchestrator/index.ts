/**
 * Orchestrator Module
 *
 * Multi-model orchestration for expert consultation.
 *
 * @module agents/orchestrator
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Implementation
 * @authority ADR-001 Multi-Model Orchestrator
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

export {
  MultiModelOrchestrator,
  getOrchestrator,
  resetOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
  type ProviderId,
  type ModelRole,
  type TaskType,
  type QueryStatus,
  type ModelConfig,
  type ModelQueryResult,
  type ConsensusPoint,
  type Disagreement,
  type ConsultationResult,
  type OrchestratorConfig,
} from "./multi-model-orchestrator.js";
