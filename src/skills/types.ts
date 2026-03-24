/**
 * Skills Type Definitions
 *
 * Type definitions for the EndiorBot skills ecosystem.
 * Skills are modular extensions that add capabilities to the agent.
 *
 * Format based on OpenClaw skill.md YAML frontmatter:
 * - name: Skill display name
 * - description: What the skill does
 * - metadata: Configuration and requirements
 *
 * @module skills/types
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 5 Implementation
 * @authority ADR-005 Skills Architecture
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.2.0
 */

// ============================================================================
// Skill Metadata
// ============================================================================

/**
 * Binary dependency requirement.
 */
export interface BinaryRequirement {
  name: string;
  version?: string;
  installCommand?: string;
}

/**
 * Install options for the skill.
 */
export interface InstallOptions {
  /**
   * npm packages to install.
   */
  npm?: string[];

  /**
   * Shell commands to run during install.
   */
  shell?: string[];

  /**
   * Environment variables to set.
   */
  env?: Record<string, string>;
}

/**
 * Skill metadata from YAML frontmatter.
 */
export interface SkillMetadata {
  /**
   * Display emoji for the skill.
   */
  emoji?: string;

  /**
   * Required binary dependencies.
   */
  requires?: BinaryRequirement[];

  /**
   * Installation options.
   */
  install?: InstallOptions;

  /**
   * Skill category for grouping.
   */
  category?: string;

  /**
   * Skill tags for discovery.
   */
  tags?: string[];

  /**
   * Author of the skill.
   */
  author?: string;

  /**
   * Skill version.
   */
  version?: string;

  /**
   * Whether skill is enabled by default.
   */
  enabled?: boolean;
}

// ============================================================================
// Skill Definition
// ============================================================================

/**
 * Skill status.
 */
export type SkillStatus =
  | "available"
  | "installed"
  | "enabled"
  | "disabled"
  | "error";

/**
 * Complete skill definition.
 */
export interface Skill {
  /**
   * Unique skill identifier (directory name).
   */
  id: string;

  /**
   * Display name.
   */
  name: string;

  /**
   * Skill description.
   */
  description: string;

  /**
   * Skill metadata.
   */
  metadata: SkillMetadata;

  /**
   * Path to skill directory.
   */
  path: string;

  /**
   * Skill prompt content (from skill.md body).
   */
  prompt: string;

  /**
   * Current status.
   */
  status: SkillStatus;

  /**
   * Error message if status is "error".
   */
  error?: string;

  /**
   * When the skill was loaded.
   */
  loadedAt: string;
}

/**
 * Minimal skill info for listing.
 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  category?: string;
  status: SkillStatus;
}

// ============================================================================
// Skill Loader Config
// ============================================================================

/**
 * Configuration for skill loader.
 */
export interface SkillLoaderConfig {
  /**
   * Directories to search for skills.
   */
  skillDirs: string[];

  /**
   * Whether to validate binary requirements.
   */
  validateRequirements?: boolean;

  /**
   * Whether to load disabled skills.
   */
  loadDisabled?: boolean;
}

/**
 * Result of loading a skill.
 */
export interface SkillLoadResult {
  success: boolean;
  skill?: Skill;
  error?: string;
}

// ============================================================================
// Skill Registry Config
// ============================================================================

/**
 * Configuration for skill registry.
 */
export interface SkillRegistryConfig {
  /**
   * Skill loader configuration.
   */
  loader: SkillLoaderConfig;

  /**
   * Auto-enable all skills on load.
   */
  autoEnable?: boolean;
}

/**
 * Skill search options.
 */
export interface SkillSearchOptions {
  /**
   * Filter by status.
   */
  status?: SkillStatus;

  /**
   * Filter by category.
   */
  category?: string;

  /**
   * Filter by tag.
   */
  tag?: string;

  /**
   * Search in name/description.
   */
  query?: string;
}

// ============================================================================
// Skill Execution
// ============================================================================

/**
 * Context for skill execution.
 */
export interface SkillExecutionContext {
  /**
   * Current project ID.
   */
  projectId?: string;

  /**
   * Current working directory.
   */
  cwd: string;

  /**
   * Environment variables.
   */
  env: Record<string, string>;

  /**
   * User input/arguments.
   */
  args?: string[];
}

/**
 * Result of skill execution.
 */
export interface SkillExecutionResult {
  /**
   * Whether execution succeeded.
   */
  success: boolean;

  /**
   * Output from the skill.
   */
  output?: string;

  /**
   * Error message if failed.
   */
  error?: string;

  /**
   * Execution duration in ms.
   */
  durationMs: number;
}
