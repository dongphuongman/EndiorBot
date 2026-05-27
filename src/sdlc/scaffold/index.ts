/**
 * Scaffold Module
 *
 * Project initialization and scaffolding utilities.
 *
 * @module sdlc/scaffold
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

// Types
export type {
  ProjectState,
  ProjectTier,
  DetectionResult,
  InitOptions,
  InitResult,
  SdlcConfig,
  TinysdlcConfig,
  SdlcOrchestratorConfig,
  ScaffoldConfig,
  ScaffoldResult,
  StepResult,
  ProjectConfig,
  AgentDefinition,
  FileTrackingInfo,
  ProjectInitState,
} from "./types.js";

export {
  TIER_STAGES,
  TIER_ORDER,
  TIER_ROOT_FILES,
  TIER_AGENT_COUNT,
} from "./types.js";

// Project detection
export {
  detectProject,
  isEndiorBotProject,
  needsMigration,
  isFreshProject,
} from "./project-detector.js";

// Tier detection
export {
  detectTierFromDocs,
  compareTiers,
  isTierAtLeast,
  maxTier,
  getStagesForTier,
  getMissingStages,
  getExtraStages,
  isValidStage,
  getStageNumber,
  getStageName,
  formatStageName,
  getStageQuestion,
} from "./tier-detector.js";

// Structure generation
export {
  scaffoldProject,
  slugify,
  createBackup,
  updateGitignore,
} from "./structure-generator.js";

// Templates
export {
  generateSdlcConfig,
  serializeSdlcConfig,
  generateMinimalConfig,
  generateClaudeMd,
  generateIdentityMd,
  generateAgentsMd,
  getAllAgents,
  getAgentById,
} from "./templates/index.js";

// Tier recommendation (ADR-054, Sprint 149)
export type { TierSignals, TierRecommendation } from "./tier-recommender.js";
export { recommendTier } from "./tier-recommender.js";

// Config migration
export type { MigrationResult, MigrationOptions } from "./config-migrator.js";
export { migrateConfig, writeMigratedConfig } from "./config-migrator.js";
