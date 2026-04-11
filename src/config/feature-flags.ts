/**
 * Feature Flags
 *
 * Central registry of feature flags for gradual rollout and A/B testing.
 * Follows CTO Condition C1 for Sprint 63+ features.
 *
 * @module config/feature-flags
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, CTO Condition C1
 * @sprint 63
 */

// ============================================================================
// Feature Flag Definitions
// ============================================================================

/**
 * Central feature flag registry.
 *
 * Naming Convention:
 * - SEARCH_* : Code Search Layer features (Sprint 63-67)
 * - CONTEXT_* : Context Anchoring features (Sprint 65)
 * - COMPLIANCE_* : Compliance features (Sprint 68)
 * - AUTONOMY_* : Autonomy features (Sprint 72)
 *
 * @example
 * ```typescript
 * import { FEATURE_FLAGS, isFeatureEnabled } from "@config/feature-flags";
 *
 * if (isFeatureEnabled("SEARCH_ENABLED")) {
 *   // Code search is available
 * }
 * ```
 */
export const FEATURE_FLAGS = {
  // =========================================================================
  // Code Search Layer (Sprint 63-67)
  // =========================================================================

  /**
   * Master switch for code search functionality.
   * When disabled, all search-related features are unavailable.
   * @sprint 63
   */
  SEARCH_ENABLED: true,

  /**
   * Enable ast-grep provider for structural/AST-aware code search.
   * Requires @ast-grep/napi to be installed.
   * @sprint 64 (stub in 63)
   */
  SEARCH_AST_GREP: false,

  /**
   * Enable Zoekt provider for large codebase search (1M+ LOC).
   * Requires Zoekt binary and index to be configured.
   * Only enable if ripgrep P95 > 2s on BFlow benchmark.
   * @sprint 66-67
   */
  SEARCH_ZOEKT: false,

  // =========================================================================
  // Context Anchoring (Sprint 65)
  // =========================================================================

  /**
   * Enable context anchoring for session state persistence.
   * Includes Sprint Goals, Checkpoints, and Spec Snapshots.
   * @sprint 65
   * @enabled 2026-03-01 - Sprint 65 Complete
   */
  CONTEXT_ANCHORING: true,

  // =========================================================================
  // Observability
  // =========================================================================

  /**
   * Enable retrieval logger for anti-hallucination evidence trail.
   * Logs search evidence to SESSION-PROGRESS.md.
   * @sprint 63
   */
  RETRIEVAL_LOGGER: true,

  // =========================================================================
  // Future Features (Placeholder)
  // =========================================================================

  /**
   * Enable stage contracts for SDLC compliance enforcement.
   * @sprint 68
   */
  STAGE_CONTRACTS: false,

  /**
   * Enable patch manager for patch discipline.
   * @sprint 68
   */
  PATCH_MANAGER: false,

  /**
   * Enable autonomy features for 2h autopilot sessions.
   * @sprint 72
   */
  AUTONOMY_MODE: false,

  /**
   * Enable Agent Teams file generation for Claude Code.
   * When enabled, `bridge install-teams` generates team leader agent files.
   * @sprint 89
   */
  AGENT_TEAMS: false,

  // =========================================================================
  // Active Memory (Sprint 133 S1)
  // =========================================================================

  /**
   * Enable Active Memory per-query context injection.
   * When enabled, recent session context is fetched and injected before
   * the main agent reply (cache-first, circuit-breaker-wrapped fetcher).
   *
   * Kill-switch ownership: CEO only. No automatic policy.
   * Env override: ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED=true|false
   *
   * @sprint 133
   * @default false
   */
  ACTIVE_MEMORY_ENABLED: false,
} as const;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Union type of all feature flag keys.
 */
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Feature flag value type.
 */
export type FeatureFlagValue = (typeof FEATURE_FLAGS)[FeatureFlagKey];

// ============================================================================
// Feature Flag Utilities
// ============================================================================

/**
 * Check if a feature is enabled.
 *
 * @param flag - The feature flag key to check
 * @returns true if the feature is enabled
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled("SEARCH_ENABLED")) {
 *   const results = await searchProvider.search(query);
 * }
 * ```
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Get all enabled features.
 *
 * @returns Array of enabled feature flag keys
 *
 * @example
 * ```typescript
 * const enabled = getEnabledFeatures();
 * // ["SEARCH_ENABLED", "RETRIEVAL_LOGGER"]
 * ```
 */
export function getEnabledFeatures(): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).filter(
    (key) => FEATURE_FLAGS[key] === true
  );
}

/**
 * Get all disabled features.
 *
 * @returns Array of disabled feature flag keys
 */
export function getDisabledFeatures(): FeatureFlagKey[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).filter(
    (key) => FEATURE_FLAGS[key] === false
  );
}

/**
 * Get feature flag summary for logging/debugging.
 *
 * @returns Object with enabled and disabled feature lists
 */
export function getFeatureFlagSummary(): {
  enabled: FeatureFlagKey[];
  disabled: FeatureFlagKey[];
  total: number;
} {
  const enabled = getEnabledFeatures();
  const disabled = getDisabledFeatures();
  return {
    enabled,
    disabled,
    total: enabled.length + disabled.length,
  };
}

// ============================================================================
// Environment Override Support
// ============================================================================

/**
 * Environment variable prefix for feature flags.
 * e.g., ENDIORBOT_FF_SEARCH_ENABLED=true
 */
const FF_ENV_PREFIX = "ENDIORBOT_FF_";

/**
 * Get feature flag value with environment override support.
 *
 * Environment variables take precedence over default values.
 * Format: ENDIORBOT_FF_<FLAG_NAME>=true|false
 *
 * @param flag - The feature flag key
 * @returns The effective feature flag value
 *
 * @example
 * ```typescript
 * // Set ENDIORBOT_FF_SEARCH_AST_GREP=true in environment
 * const enabled = getFeatureFlagWithEnvOverride("SEARCH_AST_GREP");
 * // returns true (overridden from default false)
 * ```
 */
export function getFeatureFlagWithEnvOverride(flag: FeatureFlagKey): boolean {
  const envKey = `${FF_ENV_PREFIX}${flag}`;
  const envValue = process.env[envKey];

  if (envValue !== undefined) {
    return envValue.toLowerCase() === "true" || envValue === "1";
  }

  return FEATURE_FLAGS[flag];
}

// ============================================================================
// Sprint-based Feature Groups
// ============================================================================

/**
 * Feature flags grouped by sprint for documentation and planning.
 */
export const FEATURE_FLAG_SPRINTS: Record<string, FeatureFlagKey[]> = {
  "63": ["SEARCH_ENABLED", "RETRIEVAL_LOGGER"],
  "64": ["SEARCH_AST_GREP"],
  "65": ["CONTEXT_ANCHORING"],
  "66-67": ["SEARCH_ZOEKT"],
  "68": ["STAGE_CONTRACTS", "PATCH_MANAGER"],
  "72": ["AUTONOMY_MODE"],
  "89": ["AGENT_TEAMS"],
  "133": ["ACTIVE_MEMORY_ENABLED"],
};

/**
 * Get features for a specific sprint.
 *
 * @param sprint - Sprint identifier (e.g., "63", "66-67")
 * @returns Array of feature flags for that sprint
 */
export function getFeaturesForSprint(sprint: string): FeatureFlagKey[] {
  return FEATURE_FLAG_SPRINTS[sprint] ?? [];
}
