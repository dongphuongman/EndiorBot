/**
 * Tier Detector
 *
 * Detects project tier from docs/ structure.
 * CEO Decision: Trust docs/ structure, suggest config update if mismatch.
 *
 * @module sdlc/scaffold/tier-detector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../logging/index.js";
import type { ProjectTier } from "./types.js";
import { TIER_STAGES, TIER_ORDER } from "./types.js";

const logger = createLogger("tier-detector");

// ============================================================================
// Stage Pattern
// ============================================================================

/** Valid stage directory pattern */
const STAGE_PATTERN = /^(\d{2})-([a-z]+)$/;

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect tier from docs/ structure.
 *
 * Uses CEO decision: Trust docs/, suggest config update if mismatch.
 */
export function detectTierFromDocs(projectPath: string): ProjectTier | undefined {
  const docsPath = join(projectPath, "docs");

  if (!existsSync(docsPath)) {
    logger.debug("No docs/ directory found", { path: projectPath });
    return undefined;
  }

  const stages = findStages(docsPath);

  if (stages.length === 0) {
    logger.debug("No stage directories found in docs/", { path: docsPath });
    return undefined;
  }

  const tier = matchTierFromStages(stages);

  logger.debug("Detected tier from docs/", {
    stages: stages.length,
    tier,
    stageList: stages,
  });

  return tier;
}

/**
 * Find stage directories in docs/.
 */
function findStages(docsPath: string): string[] {
  try {
    const entries = readdirSync(docsPath);
    return entries
      .filter((entry) => {
        const fullPath = join(docsPath, entry);
        return STAGE_PATTERN.test(entry) && statSync(fullPath).isDirectory();
      })
      .sort();
  } catch (error) {
    logger.debug("Failed to read docs/ directory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Match tier from found stages.
 *
 * Logic: Find the highest tier where ALL required stages exist.
 */
function matchTierFromStages(foundStages: string[]): ProjectTier {
  // Convert to Set for O(1) lookup
  const stageSet = new Set(foundStages);

  // Check tiers in reverse order (highest first)
  const tiers: ProjectTier[] = ["ENTERPRISE", "PROFESSIONAL", "STANDARD", "LITE"];

  for (const tier of tiers) {
    const required = TIER_STAGES[tier];
    const hasAll = required.every((stage) => stageSet.has(stage));

    if (hasAll) {
      return tier;
    }
  }

  // If no tier fully matches, find best partial match
  return findBestPartialMatch(foundStages);
}

/**
 * Find best partial match when no tier fully matches.
 */
function findBestPartialMatch(foundStages: string[]): ProjectTier {
  const stageSet = new Set(foundStages);
  let bestTier: ProjectTier = "LITE";
  let bestScore = 0;

  for (const [tier, required] of Object.entries(TIER_STAGES)) {
    const matched = required.filter((s) => stageSet.has(s)).length;
    const score = matched / required.length;

    if (score > bestScore) {
      bestScore = score;
      bestTier = tier as ProjectTier;
    }
  }

  return bestTier;
}

// ============================================================================
// Tier Comparison
// ============================================================================

/**
 * Compare two tiers.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareTiers(a: ProjectTier, b: ProjectTier): number {
  return TIER_ORDER[a] - TIER_ORDER[b];
}

/**
 * Check if tier a is higher than or equal to tier b.
 */
export function isTierAtLeast(actual: ProjectTier, required: ProjectTier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[required];
}

/**
 * Get the higher of two tiers.
 */
export function maxTier(a: ProjectTier, b: ProjectTier): ProjectTier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

// ============================================================================
// Stage Utilities
// ============================================================================

/**
 * Get stages required for a tier.
 */
export function getStagesForTier(tier: ProjectTier): string[] {
  return [...TIER_STAGES[tier]];
}

/**
 * Get missing stages for a tier given existing stages.
 */
export function getMissingStages(
  tier: ProjectTier,
  existingStages: string[]
): string[] {
  const required = TIER_STAGES[tier];
  const existing = new Set(existingStages);
  return required.filter((stage) => !existing.has(stage));
}

/**
 * Get extra stages (not required for tier).
 */
export function getExtraStages(
  tier: ProjectTier,
  existingStages: string[]
): string[] {
  const required = new Set(TIER_STAGES[tier]);
  return existingStages.filter((stage) => !required.has(stage));
}

/**
 * Validate stage directory name.
 */
export function isValidStage(stageName: string): boolean {
  return STAGE_PATTERN.test(stageName);
}

/**
 * Get stage number from name (e.g., "04-build" -> "04").
 */
export function getStageNumber(stageName: string): string | undefined {
  const match = stageName.match(STAGE_PATTERN);
  return match ? match[1] : undefined;
}

/**
 * Get stage name without number (e.g., "04-build" -> "build").
 */
export function getStageName(stageName: string): string | undefined {
  const match = stageName.match(STAGE_PATTERN);
  return match ? match[2] : undefined;
}

/**
 * Format stage name for display.
 */
export function formatStageName(stageName: string): string {
  const name = getStageName(stageName);
  if (!name) return stageName;

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Get stage question (from SDLC Framework).
 */
export function getStageQuestion(stageName: string): string {
  const name = getStageName(stageName);

  const questions: Record<string, string> = {
    foundation: "WHY?",
    planning: "WHAT?",
    design: "HOW?",
    integrate: "How connect?",
    build: "Building right?",
    test: "Works correctly?",
    deploy: "Ship safely?",
    operate: "Running reliably?",
    collaborate: "Team effective?",
    govern: "Compliant?",
    archive: "Preserved?",
  };

  return questions[name ?? ""] ?? "";
}
