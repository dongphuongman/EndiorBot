/**
 * Code Search Module
 *
 * Unified entry point for code search functionality.
 * Provides search providers, types, budget management, and result ranking.
 *
 * @module search
 * @version 1.1.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @authority Master Plan v4.2, TS-007
 * @sprint 64
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  SearchResult,
  SearchResponse,
  SearchOptions,
  ProviderHealth,

  // Enum-like types
  RankingReason,
  AstNodeKind,
  ProviderName,

  // Evidence types (Sprint 64 T4.3 enhanced)
  DecisionContext,
  RetrievalEvidence,
  RetrievalEvidenceResult,
} from "./types.js";

export {
  // Constants
  SEARCH_BUDGET,
  DEFAULT_SEARCH_OPTIONS,

  // Utility functions
  createEmptyResponse,
  estimateTokens,
  isTokenBudgetExceeded,
  truncateToTokenBudget,
  formatRetrievalEvidence,
} from "./types.js";

// ============================================================================
// Provider Interface
// ============================================================================

export type {
  CodeSearchProvider,
  ProviderFactory,
} from "./code-search-provider.js";

export {
  BaseSearchProvider,
  PROVIDER_PRIORITY,
  getProviderPriority,
  registerProvider,
  getProvider,
  getRegisteredProviders,
} from "./code-search-provider.js";

// ============================================================================
// Provider Implementations
// ============================================================================

export {
  RgProvider,
  type RgProviderConfig,
} from "./providers/rg-provider.js";

export {
  AstGrepProvider,
  shouldUseAstGrep,
  getStructuralPatterns,
  getPattern,
  STRUCTURAL_PATTERNS,
} from "./providers/ast-grep-provider.js";

// ============================================================================
// Budget Management
// ============================================================================

export {
  SearchBudgetManager,
  applyBudgetToResponse,
  isResponseOverBudget,
  getBudgetSummary,
} from "./search-budget.js";

// ============================================================================
// Retrieval Policy
// ============================================================================

export {
  RetrievalPolicy,
  STAGE_FILTERS,
  ROLE_FILTERS,
  createStagePolicy,
  createRolePolicy,
  createPolicy,
  getAvailableStages,
  getAvailableRoles,
  type StageFilter,
  type RoleFilter,
  type RetrievalPolicyConfig,
} from "./retrieval-policy.js";

// ============================================================================
// Retrieval Logger
// ============================================================================

export {
  RetrievalLogger,
  getRetrievalLogger,
  resetRetrievalLogger,
  createRetrievalLogger,
  DEFAULT_RETRIEVAL_LOGGER_CONFIG,
  type RetrievalLoggerConfig,
} from "./retrieval-logger.js";

// ============================================================================
// Result Ranker (Sprint 64)
// ============================================================================

export {
  ResultRanker,
  createRanker,
  rankResults,
  getScoreBreakdown,
  createRankerWithSpecSnapshots,
  rankWithSpecSnapshotBoost,
  DEFAULT_RANKING_CONFIG,
  type RankingConfig,
  type ScoreBreakdown,
} from "./result-ranker.js";

// ============================================================================
// Spec Snapshot Manager (Sprint 64)
// ============================================================================

export {
  SpecSnapshotManager,
  getSpecSnapshotManager,
  resetSpecSnapshotManager,
  loadSpecSnapshotPaths,
  isSpecSourceFile,
  DEFAULT_SPEC_SOURCES,
  type SpecSnapshotConfig,
  type SpecSnapshotState,
} from "./spec-snapshot.js";

// ============================================================================
// Convenience Functions
// ============================================================================

import { RgProvider, type RgProviderConfig } from "./providers/rg-provider.js";
import type { SearchOptions, SearchResponse } from "./types.js";

/**
 * Quick search using RgProvider.
 *
 * Convenience function for simple searches.
 * For more control, use RgProvider directly.
 *
 * @example
 * ```typescript
 * import { quickSearch } from "@search";
 *
 * const results = await quickSearch("function hello", { cwd: "/path/to/repo" });
 * console.log(`Found ${results.totalHits} results`);
 * ```
 */
export async function quickSearch(
  query: string,
  options: { cwd?: string } & Partial<SearchOptions> = {}
): Promise<SearchResponse> {
  const config: RgProviderConfig = {};
  if (options.cwd) {
    config.cwd = options.cwd;
  }
  const provider = new RgProvider(config);
  return provider.search({ query, ...options });
}

/**
 * Check if code search is available.
 *
 * Returns true if at least one provider is available.
 */
export async function isSearchAvailable(): Promise<boolean> {
  const provider = new RgProvider();
  const health = await provider.healthCheck();
  return health.available;
}
