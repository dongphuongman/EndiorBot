/**
 * Code Search Provider Interface
 *
 * Abstract interface for code search providers.
 * Implementations: RgProvider, AstGrepProvider, ZoektProvider.
 *
 * @module search/code-search-provider
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, TS-007
 * @sprint 63
 */

import type {
  SearchOptions,
  SearchResponse,
  SearchResult,
  ProviderHealth,
  ProviderName,
} from "./types.js";

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Abstract interface for code search providers.
 *
 * Implementations must:
 * 1. Never throw from search() - return empty response on error (CTO A2)
 * 2. Include providerVersion in response (CTO A1)
 * 3. Respect token budget limits (CTO A3)
 *
 * @example
 * ```typescript
 * const provider = new RgProvider();
 * const health = await provider.healthCheck();
 *
 * if (health.available) {
 *   const response = await provider.search({ query: "function hello" });
 *   console.log(`Found ${response.totalHits} results`);
 * }
 * ```
 */
export interface CodeSearchProvider {
  /**
   * Provider name for identification.
   */
  readonly name: ProviderName;

  /**
   * Provider version string.
   * Format: "ripgrep 14.1.0", "ast-grep 0.30.0", etc.
   */
  readonly version: string;

  /**
   * Search codebase with the given options.
   *
   * IMPORTANT (CTO A2): This method MUST NOT throw.
   * On error, log the error and return an empty response.
   *
   * @param options - Search options
   * @returns Search response with results (empty on error)
   */
  search(options: SearchOptions): Promise<SearchResponse>;

  /**
   * Streaming search for large result sets.
   * Yields results as they are found.
   *
   * @param options - Search options
   * @yields Search results one at a time
   */
  searchStream(options: SearchOptions): AsyncGenerator<SearchResult>;

  /**
   * Check provider health and availability.
   *
   * @returns Health status including version and availability
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Check if provider is available for use.
   * Convenience wrapper around healthCheck().
   *
   * @returns true if provider is ready to search
   */
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Provider Registry
// ============================================================================

/**
 * Provider priority for fallback selection.
 * Lower number = higher priority.
 */
export const PROVIDER_PRIORITY: Record<ProviderName, number> = {
  "ripgrep": 1, // Primary provider (P0)
  "ast-grep": 2, // Structural search (P1)
  "zoekt": 3, // Large codebase (P2)
  "grep": 99, // Fallback only
};

/**
 * Get provider priority for selection.
 */
export function getProviderPriority(name: ProviderName): number {
  return PROVIDER_PRIORITY[name] ?? 100;
}

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Provider factory function type.
 */
export type ProviderFactory = () => CodeSearchProvider;

/**
 * Provider registry for dynamic provider loading.
 */
const providerRegistry = new Map<ProviderName, ProviderFactory>();

/**
 * Register a provider factory.
 */
export function registerProvider(
  name: ProviderName,
  factory: ProviderFactory
): void {
  providerRegistry.set(name, factory);
}

/**
 * Get a provider by name.
 */
export function getProvider(name: ProviderName): CodeSearchProvider | null {
  const factory = providerRegistry.get(name);
  return factory ? factory() : null;
}

/**
 * Get all registered providers.
 */
export function getRegisteredProviders(): ProviderName[] {
  return Array.from(providerRegistry.keys());
}

// ============================================================================
// Base Provider Class
// ============================================================================

/**
 * Base class for code search providers.
 * Provides common functionality and default implementations.
 */
export abstract class BaseSearchProvider implements CodeSearchProvider {
  abstract readonly name: ProviderName;
  abstract readonly version: string;

  /**
   * Search implementation - must be overridden.
   */
  abstract search(options: SearchOptions): Promise<SearchResponse>;

  /**
   * Streaming search - default implementation using search().
   * Override for true streaming support.
   */
  async *searchStream(options: SearchOptions): AsyncGenerator<SearchResult> {
    const response = await this.search(options);
    for (const hit of response.hits) {
      yield hit;
    }
  }

  /**
   * Health check - must be overridden.
   */
  abstract healthCheck(): Promise<ProviderHealth>;

  /**
   * Convenience wrapper for health check.
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.healthCheck();
    return health.available;
  }
}
