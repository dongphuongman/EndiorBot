/**
 * Stage Contracts Module
 *
 * SDLC Stage Contracts for artifact requirements and compliance.
 *
 * @module sdlc/contracts
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2
 * @sprint 68
 */

// Types
export {
  // Stage constants
  SDLC_STAGES,
  type SDLCStage,

  // Artifact types
  type ArtifactRequirement,
  type ArtifactProduction,

  // Validation types
  type ValidationRuleType,
  type ValidationRule,

  // Contract types
  type StageContract,

  // Evaluation types
  type ArtifactEvaluation,
  type ValidationResult,
  type ContractEvaluation,

  // Config types
  type StageContractEngineConfig,

  // Helpers
  isValidStage,
  getNextStage,
  getPreviousStage,
} from "./types.js";

// Default contracts
export {
  // Individual contracts
  FOUNDATION_CONTRACT,
  PLANNING_CONTRACT,
  DESIGN_CONTRACT,
  INTEGRATE_CONTRACT,
  BUILD_CONTRACT,
  TEST_CONTRACT,
  DEPLOY_CONTRACT,
  OPERATE_CONTRACT,
  COLLABORATE_CONTRACT,
  ARCHIVE_CONTRACT,

  // Contract map
  STAGE_CONTRACTS,

  // Helpers
  getStageContract,
  getAllContracts,
  getContractsForTier,
  getRequiredStagesForTier,
} from "./defaults.js";

// Engine
export {
  StageContractEngine,
  getStageContractEngine,
  resetStageContractEngine,
} from "./stage-contract-engine.js";
