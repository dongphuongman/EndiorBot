/**
 * Search Budget Management
 *
 * Token budget enforcement for search results.
 * Implements CTO Amendment A3: MAX_BYTES_PER_RESULT=500, HARD_CAP_TOKENS=2500.
 *
 * @module search/search-budget
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, CTO Amendment A3
 * @sprint 63
 */

import {
  SEARCH_BUDGET,
  estimateTokens,
  isTokenBudgetExceeded,
  type SearchResult,
  type SearchResponse,
} from "./types.js";

// ============================================================================
// Budget Manager
// ============================================================================

/**
 * Search budget manager for enforcing token limits.
 *
 * Ensures search results don't exceed token budget:
 * - Soft limit: 2000 tokens (warning)
 * - Hard cap: 2500 tokens (truncate)
 *
 * @example
 * ```typescript
 * const manager = new SearchBudgetManager();
 *
 * for (const result of results) {
 *   if (!manager.canAdd(result)) {
 *     break; // Budget exceeded
 *   }
 *   manager.add(result);
 * }
 *
 * const finalResults = manager.getResults();
 * ```
 */
export class SearchBudgetManager {
  private results: SearchResult[] = [];
  private tokensUsed = 0;
  private bytesUsed = 0;
  private softLimitWarned = false;

  constructor(
    private readonly maxTokens: number = SEARCH_BUDGET.HARD_CAP_TOKENS,
    private readonly softLimit: number = SEARCH_BUDGET.TOKEN_LIMIT,
    private readonly maxBytesPerResult: number = SEARCH_BUDGET.MAX_BYTES_PER_RESULT
  ) {}

  /**
   * Check if a result can be added within budget.
   */
  canAdd(result: SearchResult): boolean {
    const tokens = this.estimateResultTokens(result);
    return this.tokensUsed + tokens <= this.maxTokens;
  }

  /**
   * Add a result to the budget.
   * Returns true if added, false if budget exceeded.
   */
  add(result: SearchResult): boolean {
    if (!this.canAdd(result)) {
      return false;
    }

    // Truncate content if too large
    const truncatedResult = this.truncateResult(result);
    const tokens = this.estimateResultTokens(truncatedResult);

    this.results.push(truncatedResult);
    this.tokensUsed += tokens;
    this.bytesUsed += this.getResultBytes(truncatedResult);

    // Check soft limit
    if (!this.softLimitWarned && this.tokensUsed >= this.softLimit) {
      this.softLimitWarned = true;
    }

    return true;
  }

  /**
   * Get all added results.
   */
  getResults(): SearchResult[] {
    return this.results;
  }

  /**
   * Get current token usage.
   */
  getTokensUsed(): number {
    return this.tokensUsed;
  }

  /**
   * Get current byte usage.
   */
  getBytesUsed(): number {
    return this.bytesUsed;
  }

  /**
   * Check if soft limit was exceeded (warning threshold).
   */
  isSoftLimitExceeded(): boolean {
    return this.tokensUsed >= this.softLimit;
  }

  /**
   * Check if hard cap was reached.
   */
  isHardCapReached(): boolean {
    return this.tokensUsed >= this.maxTokens;
  }

  /**
   * Get remaining token budget.
   */
  getRemainingTokens(): number {
    return Math.max(0, this.maxTokens - this.tokensUsed);
  }

  /**
   * Reset the budget manager.
   */
  reset(): void {
    this.results = [];
    this.tokensUsed = 0;
    this.bytesUsed = 0;
    this.softLimitWarned = false;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private estimateResultTokens(result: SearchResult): number {
    const contentTokens = estimateTokens(result.content);
    const beforeTokens = result.contextBefore.reduce(
      (sum, line) => sum + estimateTokens(line),
      0
    );
    const afterTokens = result.contextAfter.reduce(
      (sum, line) => sum + estimateTokens(line),
      0
    );
    const metadataTokens = estimateTokens(
      `${result.path}:${result.line}:${result.column}`
    );

    return contentTokens + beforeTokens + afterTokens + metadataTokens;
  }

  private getResultBytes(result: SearchResult): number {
    return (
      result.content.length +
      result.contextBefore.join("\n").length +
      result.contextAfter.join("\n").length +
      result.path.length
    );
  }

  private truncateResult(result: SearchResult): SearchResult {
    const bytes = this.getResultBytes(result);

    if (bytes <= this.maxBytesPerResult) {
      return result;
    }

    // Truncate content to fit
    const maxContentBytes =
      this.maxBytesPerResult -
      result.path.length -
      result.contextBefore.join("\n").length -
      result.contextAfter.join("\n").length;

    if (maxContentBytes <= 0) {
      // Even metadata exceeds limit - truncate everything
      return {
        ...result,
        content: result.content.slice(0, 100) + "...",
        contextBefore: [],
        contextAfter: [],
      };
    }

    return {
      ...result,
      content:
        result.content.slice(0, maxContentBytes) +
        (result.content.length > maxContentBytes ? "..." : ""),
    };
  }
}

// ============================================================================
// Budget Utilities
// ============================================================================

/**
 * Apply budget to search response.
 * Truncates results to fit within token budget.
 */
export function applyBudgetToResponse(
  response: SearchResponse,
  maxTokens: number = SEARCH_BUDGET.HARD_CAP_TOKENS
): SearchResponse {
  const manager = new SearchBudgetManager(maxTokens);

  for (const hit of response.hits) {
    if (!manager.add(hit)) {
      break;
    }
  }

  const truncated =
    manager.getResults().length < response.hits.length ||
    manager.isHardCapReached();

  // Build result with optional truncatedAt (exactOptionalPropertyTypes compliant)
  const result: SearchResponse = {
    ...response,
    hits: manager.getResults(),
    truncated,
    tokensUsed: manager.getTokensUsed(),
  };

  // Only add truncatedAt when truncated (never assign undefined)
  if (truncated) {
    result.truncatedAt = manager.getResults().length;
  }

  return result;
}

/**
 * Check if response exceeds budget.
 */
export function isResponseOverBudget(
  response: SearchResponse,
  hardCap: boolean = false
): boolean {
  return isTokenBudgetExceeded(response.tokensUsed, hardCap);
}

/**
 * Get budget summary for logging.
 */
export function getBudgetSummary(response: SearchResponse): string {
  const pct = Math.round(
    (response.tokensUsed / SEARCH_BUDGET.HARD_CAP_TOKENS) * 100
  );
  const status =
    response.tokensUsed >= SEARCH_BUDGET.HARD_CAP_TOKENS
      ? "HARD_CAP"
      : response.tokensUsed >= SEARCH_BUDGET.TOKEN_LIMIT
        ? "SOFT_LIMIT"
        : "OK";

  return `${response.tokensUsed}/${SEARCH_BUDGET.HARD_CAP_TOKENS} tokens (${pct}%) [${status}]`;
}
