/**
 * AST-Grep Provider (Stub)
 *
 * Structural/AST-aware code search provider using ast-grep.
 * This is a STUB for Sprint 63 - full implementation in Sprint 64.
 *
 * @module search/providers/ast-grep-provider
 * @version 0.1.0
 * @date 2026-03-01
 * @status STUB - Sprint 63 (Full implementation Sprint 64)
 * @authority Master Plan v4.2, Feature Flag SEARCH_AST_GREP
 * @sprint 63
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { isFeatureEnabled } from "../../config/feature-flags.js";
import { BaseSearchProvider } from "../code-search-provider.js";
import {
  type SearchOptions,
  type SearchResponse,
  type ProviderHealth,
  createEmptyResponse,
} from "../types.js";

// ============================================================================
// AstGrepProvider Stub
// ============================================================================

/**
 * AST-Grep provider stub.
 *
 * Sprint 63: Interface + installation + feature flag
 * Sprint 64: Full structural search implementation
 *
 * Current capabilities:
 * - Health check (detects ast-grep installation)
 * - Returns empty results (feature flag off by default)
 *
 * Planned features (Sprint 64):
 * - AST pattern matching
 * - Structural queries ("find all route handlers")
 * - "find unused exports"
 * - TypeScript/JavaScript AST analysis
 *
 * @example
 * ```typescript
 * // Sprint 63 - Stub only
 * const provider = new AstGrepProvider();
 * const health = await provider.healthCheck();
 * // health.available = true/false based on installation
 *
 * // Sprint 64 - Full implementation
 * const response = await provider.search({
 *   query: "function $NAME($PARAMS) { $BODY }",
 *   structural: true,
 * });
 * ```
 */
export class AstGrepProvider extends BaseSearchProvider {
  readonly name = "ast-grep" as const;
  private _version = "stub";
  private readonly logger: Logger;

  constructor() {
    super();
    this.logger = createLogger("AstGrepProvider");
  }

  get version(): string {
    return `ast-grep ${this._version}`;
  }

  // =========================================================================
  // Search Implementation (Stub)
  // =========================================================================

  /**
   * Search using ast-grep patterns.
   *
   * STUB: Returns empty response.
   * Full implementation in Sprint 64.
   *
   * Note: Controlled by SEARCH_AST_GREP feature flag.
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    // Check feature flag
    if (!isFeatureEnabled("SEARCH_AST_GREP")) {
      this.logger.debug(
        "AstGrepProvider search skipped - SEARCH_AST_GREP feature flag is off"
      );
      return createEmptyResponse(this.name, this.version);
    }

    // STUB: Log and return empty
    this.logger.info("AstGrepProvider search called (stub)", {
      query: options.query,
      structural: options.structural,
    });

    // TODO (Sprint 64): Implement actual ast-grep search
    // - Parse query as ast-grep pattern
    // - Execute sg (ast-grep CLI) with pattern
    // - Parse JSON output
    // - Convert to SearchResult format

    return createEmptyResponse(this.name, this.version);
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  /**
   * Check if ast-grep is available.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const lastChecked = new Date();

    try {
      // Check if sg command exists
      const version = await this.getAstGrepVersion();
      this._version = version;

      // Note: available=true means installed, but may be disabled by SEARCH_AST_GREP feature flag
      return {
        provider: this.name,
        available: true,
        version: this.version,
        lastChecked,
      };
    } catch (error) {
      return {
        provider: this.name,
        available: false,
        error: error instanceof Error ? error.message : String(error),
        lastChecked,
      };
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async getAstGrepVersion(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = await import("node:child_process");

    return new Promise((resolve, reject) => {
      const child = spawn("sg", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";

      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      child.on("close", (code: number | null) => {
        if (code === 0) {
          // Parse version from output
          const match = output.match(/(\d+\.\d+\.\d+)/);
          resolve(match?.[1] ?? "unknown");
        } else {
          reject(new Error("ast-grep (sg) not installed"));
        }
      });

      child.on("error", () => {
        reject(new Error("ast-grep (sg) not installed"));
      });
    });
  }
}

// ============================================================================
// Feature Flag Check Utility
// ============================================================================

/**
 * Check if ast-grep search should be used.
 *
 * @returns true if ast-grep is enabled and available
 */
export async function shouldUseAstGrep(): Promise<boolean> {
  if (!isFeatureEnabled("SEARCH_AST_GREP")) {
    return false;
  }

  const provider = new AstGrepProvider();
  const health = await provider.healthCheck();
  return health.available;
}
