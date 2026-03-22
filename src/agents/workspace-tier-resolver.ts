/**
 * Workspace Tier Resolver
 *
 * Reads `.sdlc-config.json` from workspace directory, extracts ProjectTier,
 * and caches the result with a 10-minute TTL using a local Map.
 *
 * @module agents/workspace-tier-resolver
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectTier } from "../sdlc/scaffold/types.js";

// ============================================================================
// Constants
// ============================================================================

/** Cache TTL in milliseconds (10 minutes). */
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Valid tier values. */
const VALID_TIERS: ReadonlySet<string> = new Set([
  "LITE",
  "STANDARD",
  "PROFESSIONAL",
  "ENTERPRISE",
]);

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  tier: ProjectTier;
  expiresAt: number;
}

/** Local cache — Map<workspacePath, CacheEntry>. No external dependency (CTO SF-1). */
const tierCache = new Map<string, CacheEntry>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve the project tier for a workspace by reading `.sdlc-config.json`.
 *
 * - Returns cached tier if TTL has not expired
 * - Defaults to ENTERPRISE when config is missing, invalid, or unparseable
 * - Synchronous read — safe for call sites that need sync model selection
 *
 * @param workspacePath - Absolute path to the workspace directory
 * @returns ProjectTier from config, or ENTERPRISE as default
 */
export function resolveWorkspaceTier(workspacePath: string): ProjectTier {
  // Check cache
  const cached = tierCache.get(workspacePath);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tier;
  }

  // Read from filesystem
  const tier = readTierFromConfig(workspacePath);

  // Cache result
  tierCache.set(workspacePath, {
    tier,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return tier;
}

/**
 * Clear the workspace tier cache. Forces re-read on next call.
 * Useful for testing and after config changes.
 */
export function clearWorkspaceTierCache(): void {
  tierCache.clear();
}

// ============================================================================
// Internal
// ============================================================================

/**
 * Read tier from .sdlc-config.json in workspace.
 * Returns ENTERPRISE as default for any error condition.
 */
function readTierFromConfig(workspacePath: string): ProjectTier {
  const configPath = join(workspacePath, ".sdlc-config.json");

  if (!existsSync(configPath)) {
    return "ENTERPRISE";
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as Record<string, unknown>;
    const tier = config.tier;

    if (typeof tier === "string" && VALID_TIERS.has(tier)) {
      return tier as ProjectTier;
    }

    return "ENTERPRISE";
  } catch {
    return "ENTERPRISE";
  }
}
