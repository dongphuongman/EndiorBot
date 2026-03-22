/**
 * Scaffold Types
 *
 * Type definitions for project initialization and scaffolding.
 *
 * @module sdlc/scaffold/types
 * @version 1.1.0
 * @date 2026-03-05
 * @status ACTIVE - Sprint 79
 */

import type { ProjectSnapshot, TechStackInfo } from "../compliance/fix-types.js";

// ============================================================================
// Project State Detection
// ============================================================================

/**
 * Detected project state based on existing files.
 *
 * - FRESH: No SDLC files exist
 * - ENDIORBOT: Has .sdlc-config.json with generator: "endiorbot"
 * - SDLC_ORCHESTRATOR: Has .sdlc-config.json with generator: "sdlc-orchestrator"
 * - TINYSDLC: Has .sdlc-config.json with sdlc.frameworkVersion (no generator)
 * - PARTIAL: Has docs/ structure but no .sdlc-config.json
 * - UNKNOWN: Has .sdlc-config.json but unknown format
 */
export type ProjectState =
  | "FRESH"
  | "ENDIORBOT"
  | "SDLC_ORCHESTRATOR"
  | "TINYSDLC"
  | "PARTIAL"
  | "UNKNOWN";

/**
 * Project tier classification.
 */
export type ProjectTier = "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";

/**
 * Result of project detection.
 */
export interface DetectionResult {
  /** Detected project state */
  state: ProjectState;
  /** Generator that created the config (if any) */
  generator?: string;
  /** Generator version (if available) */
  generatorVersion?: string;
  /** Tier from config */
  configTier?: ProjectTier;
  /** Tier inferred from docs/ structure */
  structureTier?: ProjectTier;
  /** Existing SDLC-related files found */
  existingFiles: string[];
  /** Missing required files for the tier */
  missingFiles: string[];
  /** Path to .sdlc-config.json if exists */
  configPath?: string;
  /** Raw config content if exists */
  rawConfig?: unknown;
}

// ============================================================================
// Init Command Options
// ============================================================================

/**
 * Init command options.
 */
export interface InitOptions {
  /** Project name (defaults to directory name) */
  projectName?: string;
  /** Target tier */
  tier?: ProjectTier;
  /** Target directory path */
  path?: string;
  /** Show preview without writing (dry-run) */
  analyze?: boolean;
  /** Overwrite existing files (creates backup) */
  force?: boolean;
  /** Merge with existing config (default behavior) */
  merge?: boolean;
  /** Convert from other generators */
  migrate?: boolean;
  /** Update EndiorBot-managed sections only */
  refresh?: boolean;
  /** Verify compliance only, no changes */
  check?: boolean;
  /** Skip docs/ structure creation */
  noScaffold?: boolean;
  /** Skip codebase analysis, use generic placeholders */
  skipAnalysis?: boolean;
  /** Codebase analysis snapshot (threaded from executeInit) */
  snapshot?: ProjectSnapshot;
}

/**
 * Result of init command execution.
 */
export interface InitResult {
  /** Files that were created */
  created: string[];
  /** Files that were updated */
  updated: string[];
  /** Files that were preserved (not modified) */
  preserved: string[];
  /** Files that were skipped (already up to date) */
  skipped: string[];
  /** Migration info if applicable */
  migrated?: {
    from: string;
    originalConfig: unknown;
  };
  /** Backup path if --force was used */
  backupPath?: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Detected project state */
  detectedState: ProjectState;
  /** Final tier used */
  tier: ProjectTier;
}

// ============================================================================
// Config Schemas
// ============================================================================

/**
 * EndiorBot SDLC config schema.
 */
export interface SdlcConfig {
  /** Config schema version */
  schema_version: string;
  /** SDLC framework version */
  framework_version: string;
  /** Generator that created this config */
  generator: "endiorbot";
  /** When config was generated */
  generated_at: string;
  /** Migration source (if migrated) */
  migrated_from?: string;
  /** When migration occurred */
  migrated_at?: string;
  /** Project information */
  project: {
    id: string;
    name: string;
    description?: string;
  };
  /** Project tier */
  tier: ProjectTier;
  /** Stage paths (optional) */
  stages?: Record<string, string>;
  /** Gate configuration (optional) */
  gates?: {
    current?: string;
    passed?: string[];
  };
  /** Original config preserved for debugging */
  _original?: unknown;
  /** Detected tech stack (populated by smart init) */
  techStack?: TechStackInfo;
  /** When codebase analysis was performed */
  analyzedAt?: string;
}

/**
 * tinysdlc config format (for migration).
 */
export interface TinysdlcConfig {
  version?: string;
  project?: {
    id?: string;
    name?: string;
    description?: string;
  };
  sdlc?: {
    frameworkVersion?: string;
    tier?: string;
    stages?: Record<string, string>;
  };
  gates?: {
    current?: string;
    passed?: string[];
  };
  validation?: {
    required_score?: number;
  };
}

/**
 * SDLC Orchestrator config format (for migration).
 */
export interface SdlcOrchestratorConfig {
  generator?: "sdlc-orchestrator";
  version?: string;
  project?: {
    id?: string;
    name?: string;
    description?: string;
  };
  tier?: string;
  framework?: {
    name?: string;
    version?: string;
  };
  stages?: Record<string, unknown>;
}

// ============================================================================
// Scaffolding Types
// ============================================================================

/**
 * Scaffold configuration.
 */
export interface ScaffoldConfig {
  /** Project name */
  projectName: string;
  /** Project description */
  projectDescription?: string;
  /** Target tier */
  tier: ProjectTier;
  /** Target directory */
  targetPath: string;
  /** Dry-run mode (no actual writes) */
  dryRun?: boolean;
  /** Overwrite existing files */
  force?: boolean;
  /** Existing detection result */
  detection?: DetectionResult;
  /** Codebase analysis snapshot (populated if --skip-analysis not used) */
  snapshot?: ProjectSnapshot;
}

/**
 * Result of a single scaffold step.
 */
export interface StepResult {
  /** Step name */
  name: string;
  /** File path affected */
  path: string;
  /** Step status */
  status: "created" | "updated" | "skipped" | "preserved" | "would-create" | "would-update" | "error";
  /** Error message if failed */
  error?: string;
}

/**
 * Result of full scaffolding process.
 */
export interface ScaffoldResult {
  /** Individual step results */
  steps: StepResult[];
  /** Overall success */
  success: boolean;
  /** Total duration in ms */
  durationMs: number;
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Project configuration for template generation.
 */
export interface ProjectConfig {
  /** Project ID (slug format) */
  id: string;
  /** Project display name */
  name: string;
  /** Project description */
  description: string;
  /** Project tier */
  tier: ProjectTier;
  /** Framework version */
  frameworkVersion: string;
}

/**
 * Agent definition for AGENTS.md generation.
 */
export interface AgentDefinition {
  /** Agent role ID */
  id: string;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Model to use */
  model: "opus" | "sonnet" | "haiku";
  /** Minimum tier required */
  minTier: ProjectTier;
  /** Agent capabilities */
  capabilities: string[];
}

// ============================================================================
// State Tracking
// ============================================================================

/**
 * File tracking info for idempotent updates.
 */
export interface FileTrackingInfo {
  /** SHA256 hash of file content */
  hash: string;
  /** Last update timestamp */
  lastUpdated: string;
  /** Whether user has modified the file */
  userModified: boolean;
  /** Managed sections in the file (if any) */
  managedSections?: string[];
}

/**
 * Project state for tracking init runs.
 */
export interface ProjectInitState {
  /** Last init timestamp */
  lastInit: string;
  /** EndiorBot version used */
  generatorVersion: string;
  /** Tracked files */
  filesManaged: Record<string, FileTrackingInfo>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Required stages per tier.
 */
export const TIER_STAGES: Record<ProjectTier, string[]> = {
  LITE: ["00-foundation", "01-planning", "02-design", "04-build"],
  STANDARD: [
    "00-foundation",
    "01-planning",
    "02-design",
    "04-build",
    "05-test",
    "06-deploy",
    "08-collaborate",
  ],
  PROFESSIONAL: [
    "00-foundation",
    "01-planning",
    "02-design",
    "03-integrate",
    "04-build",
    "05-test",
    "06-deploy",
    "07-operate",
    "08-collaborate",
    "09-govern",
  ],
  ENTERPRISE: [
    "00-foundation",
    "01-planning",
    "02-design",
    "03-integrate",
    "04-build",
    "05-test",
    "06-deploy",
    "07-operate",
    "08-collaborate",
    "09-govern",
    "10-archive",
  ],
};

/**
 * Tier ordering for comparison.
 */
export const TIER_ORDER: Record<ProjectTier, number> = {
  LITE: 0,
  STANDARD: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

/**
 * Root files per tier.
 */
export const TIER_ROOT_FILES: Record<ProjectTier, string[]> = {
  LITE: ["CLAUDE.md", "IDENTITY.md"],
  STANDARD: ["CLAUDE.md", "IDENTITY.md", "AGENTS.md"],
  PROFESSIONAL: ["CLAUDE.md", "IDENTITY.md", "AGENTS.md", "USER.md"],
  ENTERPRISE: ["CLAUDE.md", "IDENTITY.md", "AGENTS.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"],
};

/**
 * Agent count per tier.
 */
export const TIER_AGENT_COUNT: Record<ProjectTier, number> = {
  LITE: 3,
  STANDARD: 6,
  PROFESSIONAL: 10,
  ENTERPRISE: 13,
};
