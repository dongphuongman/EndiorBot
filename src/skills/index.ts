/**
 * Skills Module
 *
 * Skill ecosystem for extending EndiorBot capabilities.
 * Skills are loaded from skills/ directories and provide
 * modular agent prompts and functionality.
 *
 * @module skills
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 5 Implementation
 * @authority ADR-005 Skills Architecture
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.2.0
 */

// Types
export type {
  BinaryRequirement,
  InstallOptions,
  SkillMetadata,
  SkillStatus,
  Skill,
  SkillInfo,
  SkillLoaderConfig,
  SkillLoadResult,
  SkillRegistryConfig,
  SkillSearchOptions,
  SkillExecutionContext,
  SkillExecutionResult,
} from "./types.js";

// Skill Loader
export {
  SkillLoader,
  getSkillLoader,
  resetSkillLoader,
} from "./skill-loader.js";

// Skill Registry
export {
  SkillRegistry,
  getSkillRegistry,
  resetSkillRegistry,
} from "./skill-registry.js";
