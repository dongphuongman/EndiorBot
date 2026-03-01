/**
 * Project Detector
 *
 * Detects existing SDLC structure and determines project state.
 *
 * @module sdlc/scaffold/project-detector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../logging/index.js";
import { safeJsonParse } from "../../resilience/graceful-degradation.js";
import type {
  DetectionResult,
  ProjectState,
  ProjectTier,
} from "./types.js";
import { detectTierFromDocs } from "./tier-detector.js";

const logger = createLogger("project-detector");

// ============================================================================
// SDLC File Patterns
// ============================================================================

/** Files that indicate SDLC presence */
const SDLC_INDICATORS = [
  ".sdlc-config.json",
  "CLAUDE.md",
  "AGENTS.md",
  "IDENTITY.md",
  "SOUL.md",
];

/** Stage directory pattern (00-foundation, 01-planning, etc.) */
const STAGE_PATTERN = /^\d{2}-[a-z]+$/;

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect project state and existing SDLC structure.
 */
export function detectProject(projectPath: string): DetectionResult {
  logger.debug("Detecting project state", { path: projectPath });

  const configPath = join(projectPath, ".sdlc-config.json");
  const docsPath = join(projectPath, "docs");

  // Find existing SDLC files
  const existingFiles = findExistingSdlcFiles(projectPath);

  // Check for .sdlc-config.json
  if (existsSync(configPath)) {
    return detectFromConfig(projectPath, configPath, existingFiles);
  }

  // No config - check for docs/ structure
  if (existsSync(docsPath) && hasStageStructure(docsPath)) {
    return detectPartialProject(projectPath, docsPath, existingFiles);
  }

  // Fresh project - no SDLC files
  return {
    state: "FRESH",
    existingFiles,
    missingFiles: getMissingFiles("STANDARD", existingFiles, projectPath),
  };
}

// ============================================================================
// Detection from Config
// ============================================================================

/**
 * Detect project state from .sdlc-config.json content.
 */
function detectFromConfig(
  projectPath: string,
  configPath: string,
  existingFiles: string[]
): DetectionResult {
  const rawContent = readFileSync(configPath, "utf-8");
  const config = safeJsonParse<Record<string, unknown>>(rawContent);

  if (!config) {
    logger.warn("Failed to parse .sdlc-config.json", { path: configPath });
    return {
      state: "UNKNOWN",
      configPath,
      existingFiles,
      missingFiles: [],
    };
  }

  const state = detectStateFromConfig(config);
  const tier = extractTier(config, projectPath);
  const generator = extractGenerator(config);
  const version = extractVersion(config);

  logger.debug("Detected project state from config", {
    state,
    tier,
    generator,
  });

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  const result: DetectionResult = {
    state,
    configTier: tier,
    existingFiles,
    missingFiles: getMissingFiles(tier, existingFiles, projectPath),
    configPath,
    rawConfig: config,
  };

  // Conditionally add optional properties (exactOptionalPropertyTypes)
  const structureTier = detectTierFromDocs(projectPath);
  if (structureTier) {
    result.structureTier = structureTier;
  }
  if (generator) {
    result.generator = generator;
  }
  if (version) {
    result.generatorVersion = version;
  }

  return result;
}

/**
 * Determine project state from config content.
 */
function detectStateFromConfig(config: Record<string, unknown>): ProjectState {
  // Check generator field first
  if (config.generator === "endiorbot") {
    return "ENDIORBOT";
  }

  if (config.generator === "sdlc-orchestrator") {
    return "SDLC_ORCHESTRATOR";
  }

  // Check for tinysdlc format (nested sdlc.frameworkVersion)
  const sdlc = config.sdlc as Record<string, unknown> | undefined;
  if (sdlc?.frameworkVersion) {
    return "TINYSDLC";
  }

  // Unknown format
  return "UNKNOWN";
}

/**
 * Extract tier from config.
 */
function extractTier(
  config: Record<string, unknown>,
  projectPath: string
): ProjectTier {
  // Direct tier field
  if (typeof config.tier === "string") {
    const tier = config.tier.toUpperCase() as ProjectTier;
    if (isValidTier(tier)) return tier;
  }

  // Nested sdlc.tier (tinysdlc format)
  const sdlc = config.sdlc as Record<string, unknown> | undefined;
  if (sdlc && typeof sdlc.tier === "string") {
    const tier = sdlc.tier.toUpperCase() as ProjectTier;
    if (isValidTier(tier)) return tier;
  }

  // Fall back to detecting from docs/ structure
  const structureTier = detectTierFromDocs(projectPath);
  if (structureTier) return structureTier;

  // Default to STANDARD
  return "STANDARD";
}

/**
 * Extract generator name from config.
 */
function extractGenerator(config: Record<string, unknown>): string | undefined {
  if (typeof config.generator === "string") {
    return config.generator;
  }
  return undefined;
}

/**
 * Extract version from config.
 */
function extractVersion(config: Record<string, unknown>): string | undefined {
  // EndiorBot format
  if (typeof config.schema_version === "string") {
    return config.schema_version;
  }

  // Generic version field
  if (typeof config.version === "string") {
    return config.version;
  }

  // Framework version
  const sdlc = config.sdlc as Record<string, unknown> | undefined;
  if (sdlc && typeof sdlc.frameworkVersion === "string") {
    return sdlc.frameworkVersion;
  }

  return undefined;
}

// ============================================================================
// Partial Project Detection
// ============================================================================

/**
 * Detect partial project (has docs/ but no config).
 */
function detectPartialProject(
  projectPath: string,
  docsPath: string,
  existingFiles: string[]
): DetectionResult {
  const tier = detectTierFromDocs(projectPath) ?? "STANDARD";

  logger.debug("Detected partial project", { tier, docsPath });

  return {
    state: "PARTIAL",
    structureTier: tier,
    existingFiles,
    missingFiles: getMissingFiles(tier, existingFiles, projectPath),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find existing SDLC-related files in project.
 */
function findExistingSdlcFiles(projectPath: string): string[] {
  const found: string[] = [];

  // Check root SDLC files
  for (const file of SDLC_INDICATORS) {
    const filePath = join(projectPath, file);
    if (existsSync(filePath)) {
      found.push(file);
    }
  }

  // Check for docs/ directory
  const docsPath = join(projectPath, "docs");
  if (existsSync(docsPath)) {
    found.push("docs/");
    // Add individual stages
    const stages = findStages(docsPath);
    for (const stage of stages) {
      found.push(`docs/${stage}/`);
    }
  }

  // Check for .claude/ directory
  const claudePath = join(projectPath, ".claude");
  if (existsSync(claudePath)) {
    found.push(".claude/");
  }

  // Check for .sdlc-framework/ directory
  const frameworkPath = join(projectPath, ".sdlc-framework");
  if (existsSync(frameworkPath)) {
    found.push(".sdlc-framework/");
  }

  return found;
}

/**
 * Check if docs/ has stage structure.
 */
function hasStageStructure(docsPath: string): boolean {
  try {
    const entries = readdirSync(docsPath);
    return entries.some((entry) => STAGE_PATTERN.test(entry));
  } catch {
    return false;
  }
}

/**
 * Find stage directories in docs/.
 */
function findStages(docsPath: string): string[] {
  try {
    return readdirSync(docsPath)
      .filter((entry) => {
        const fullPath = join(docsPath, entry);
        return STAGE_PATTERN.test(entry) && statSync(fullPath).isDirectory();
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * Get missing files for a tier.
 */
function getMissingFiles(
  tier: ProjectTier,
  existingFiles: string[],
  projectPath: string
): string[] {
  const missing: string[] = [];

  // Check required root files
  const requiredRootFiles = getRequiredRootFiles(tier);
  for (const file of requiredRootFiles) {
    if (!existingFiles.includes(file) && !existsSync(join(projectPath, file))) {
      missing.push(file);
    }
  }

  // Check .sdlc-config.json
  if (!existingFiles.includes(".sdlc-config.json")) {
    missing.push(".sdlc-config.json");
  }

  return missing;
}

/**
 * Get required root files for tier.
 */
function getRequiredRootFiles(tier: ProjectTier): string[] {
  const base = ["CLAUDE.md", "IDENTITY.md"];

  if (tier === "LITE") return base;

  base.push("AGENTS.md");
  if (tier === "STANDARD") return base;

  base.push("USER.md");
  if (tier === "PROFESSIONAL") return base;

  base.push("TOOLS.md", "HEARTBEAT.md");
  return base;
}

/**
 * Check if tier is valid.
 */
function isValidTier(tier: string): tier is ProjectTier {
  return ["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"].includes(tier);
}

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Check if project has EndiorBot initialization.
 */
export function isEndiorBotProject(projectPath: string): boolean {
  const result = detectProject(projectPath);
  return result.state === "ENDIORBOT";
}

/**
 * Check if project needs migration.
 */
export function needsMigration(projectPath: string): boolean {
  const result = detectProject(projectPath);
  return result.state === "TINYSDLC" || result.state === "SDLC_ORCHESTRATOR";
}

/**
 * Check if project is fresh (no SDLC files).
 */
export function isFreshProject(projectPath: string): boolean {
  const result = detectProject(projectPath);
  return result.state === "FRESH";
}
