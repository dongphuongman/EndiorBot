/**
 * Ripgrep Provider (RgProvider)
 *
 * Primary code search provider using ripgrep (rg).
 * Implements CTO Amendment A2: log + return empty on error (no throw).
 *
 * @module search/providers/rg-provider
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, CTO Amendment A2
 * @sprint 63
 */

import { spawn } from "node:child_process";
import { createLogger, type Logger } from "../../logging/index.js";
import { BaseSearchProvider } from "../code-search-provider.js";
import {
  type SearchOptions,
  type SearchResponse,
  type SearchResult,
  type ProviderHealth,
  type RankingReason,
  createEmptyResponse,
  DEFAULT_SEARCH_OPTIONS,
  SEARCH_BUDGET,
} from "../types.js";
import { SearchBudgetManager } from "../search-budget.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Ripgrep JSON output format (--json flag).
 */
interface RgJsonMatch {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

interface RgJsonBegin {
  type: "begin";
  data: { path: { text: string } };
}

interface RgJsonEnd {
  type: "end";
  data: { path: { text: string }; binary_offset: number | null; stats: unknown };
}

interface RgJsonSummary {
  type: "summary";
  data: {
    elapsed_total: { secs: number; nanos: number };
    stats: { searches: number; searches_with_match: number; bytes_searched: number; bytes_printed: number; matched_lines: number; matches: number };
  };
}

type RgJsonLine = RgJsonMatch | RgJsonBegin | RgJsonEnd | RgJsonSummary;

/**
 * RgProvider configuration.
 */
export interface RgProviderConfig {
  /** Path to rg binary (default: "rg") */
  rgPath?: string;

  /** Working directory for search */
  cwd?: string;

  /** Max file size to search (bytes) */
  maxFileSize?: number;

  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// RgProvider Implementation
// ============================================================================

/**
 * Ripgrep-based code search provider.
 *
 * Features:
 * - Fast regex search using ripgrep
 * - JSON output parsing for structured results
 * - Streaming support for large result sets
 * - Health check with version detection
 *
 * Error Handling (CTO A2):
 * - NEVER throws from search()
 * - Logs errors and returns empty response
 *
 * @example
 * ```typescript
 * const provider = new RgProvider({ cwd: "/path/to/repo" });
 *
 * if (await provider.isAvailable()) {
 *   const response = await provider.search({ query: "function hello" });
 *   console.log(`Found ${response.totalHits} results`);
 * }
 * ```
 */
export class RgProvider extends BaseSearchProvider {
  readonly name = "ripgrep" as const;
  private _version = "unknown";
  private readonly logger: Logger;
  private readonly config: Required<RgProviderConfig>;

  constructor(config: RgProviderConfig = {}) {
    super();
    this.config = {
      rgPath: config.rgPath ?? "rg",
      cwd: config.cwd ?? process.cwd(),
      maxFileSize: config.maxFileSize ?? 1024 * 1024, // 1MB
      debug: config.debug ?? false,
    };
    this.logger = createLogger("RgProvider");
  }

  get version(): string {
    return `ripgrep ${this._version}`;
  }

  // =========================================================================
  // Search Implementation
  // =========================================================================

  /**
   * Search codebase using ripgrep.
   *
   * CTO A2: This method MUST NOT throw.
   * On any error, logs the error and returns an empty response.
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      // Validate options
      if (!options.query || options.query.trim() === "") {
        this.logger.warn("RgProvider search called with empty query");
        return createEmptyResponse(this.name, this.version);
      }

      // Build rg arguments
      const args = this.buildArgs(options);

      // Execute ripgrep
      const output = await this.executeRg(args, options.timeout);

      // Parse results
      const results = this.parseOutput(output, options);

      // Apply budget limits
      const budget = new SearchBudgetManager(
        SEARCH_BUDGET.HARD_CAP_TOKENS,
        SEARCH_BUDGET.TOKEN_LIMIT,
        SEARCH_BUDGET.MAX_BYTES_PER_RESULT
      );

      for (const result of results) {
        if (!budget.add(result)) {
          break;
        }
      }

      const elapsed_ms = Date.now() - startTime;
      const truncated = budget.getResults().length < results.length;

      const response: SearchResponse = {
        hits: budget.getResults(),
        totalHits: results.length,
        truncated,
        elapsed_ms,
        provider: this.name,
        providerVersion: this.version,
        tokensUsed: budget.getTokensUsed(),
      };

      if (truncated) {
        response.truncatedAt = budget.getResults().length;
      }

      return response;
    } catch (error) {
      // CTO A2: Log error and return empty response - NEVER throw
      this.logger.warn("RgProvider search failed", {
        query: options.query,
        error: error instanceof Error ? error.message : String(error),
      });

      return createEmptyResponse(this.name, this.version);
    }
  }

  /**
   * Streaming search for large result sets.
   */
  async *searchStream(options: SearchOptions): AsyncGenerator<SearchResult> {
    try {
      if (!options.query || options.query.trim() === "") {
        return;
      }

      const args = this.buildArgs(options);
      const child = spawn(this.config.rgPath, args, {
        cwd: this.config.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Handle spawn errors (e.g., rg not found)
      const errorState = { error: null as Error | null };
      child.on("error", (err) => {
        errorState.error = err;
      });

      // Ensure stdout is available
      if (!child.stdout) {
        this.logger.warn("RgProvider searchStream: stdout not available");
        return;
      }

      let buffer = "";
      let resultCount = 0;
      const topK = options.topK ?? DEFAULT_SEARCH_OPTIONS.topK;

      try {
        for await (const chunk of child.stdout) {
          // Check for process error
          if (errorState.error) {
            this.logger.warn("RgProvider searchStream failed", {
              query: options.query,
              error: errorState.error.message,
            });
            return;
          }

          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed = JSON.parse(line) as RgJsonLine;
              if (parsed.type === "match") {
                const result = this.convertMatch(parsed, options);
                yield result;
                resultCount++;

                if (resultCount >= topK) {
                  child.kill();
                  return;
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch {
        // Handle stream errors gracefully
        if (errorState.error) {
          this.logger.warn("RgProvider searchStream failed", {
            query: options.query,
            error: errorState.error.message,
          });
        }
        return;
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer) as RgJsonLine;
          if (parsed.type === "match") {
            yield this.convertMatch(parsed, options);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    } catch (error) {
      // CTO A2: Log error but don't throw from generator
      this.logger.warn("RgProvider searchStream failed", {
        query: options.query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  /**
   * Check if ripgrep is available.
   */
  async healthCheck(): Promise<ProviderHealth> {
    const lastChecked = new Date();

    try {
      const version = await this.getRgVersion();
      this._version = version;

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

  private buildArgs(options: SearchOptions): string[] {
    const args: string[] = [
      "--json", // JSON output for structured parsing
      "--line-number", // Include line numbers
      "--column", // Include column numbers
      "--no-heading", // Don't group by file
      "--color", "never", // No ANSI colors
      "--max-filesize", `${this.config.maxFileSize}`,
    ];

    // Context lines
    const contextLines = options.contextLines ?? DEFAULT_SEARCH_OPTIONS.contextLines;
    if (contextLines > 0) {
      args.push("-C", String(contextLines));
    }

    // Case sensitivity
    if (options.caseSensitive === false) {
      args.push("-i");
    }

    // Regex mode
    if (options.isRegex === false) {
      args.push("-F"); // Fixed string
    }

    // File type filter
    if (options.fileTypes && options.fileTypes.length > 0) {
      for (const type of options.fileTypes) {
        args.push("-t", type);
      }
    }

    // Glob filter
    if (options.glob) {
      args.push("-g", options.glob);
    }

    // Paths to search
    if (options.paths && options.paths.length > 0) {
      args.push("--", options.query, ...options.paths);
    } else {
      args.push("--", options.query, ".");
    }

    return args;
  }

  private async executeRg(args: string[], timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout ?? DEFAULT_SEARCH_OPTIONS.timeout;
      let output = "";
      let stderr = "";

      const child = spawn(this.config.rgPath, args, {
        cwd: this.config.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Search timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        // rg returns 1 for "no matches" which is not an error
        if (code === 0 || code === 1) {
          resolve(output);
        } else {
          reject(new Error(`rg exited with code ${code}: ${stderr}`));
        }
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private parseOutput(output: string, options: SearchOptions): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as RgJsonLine;
        if (parsed.type === "match") {
          results.push(this.convertMatch(parsed, options));
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    // Sort by relevance (exact matches first, then by line number)
    results.sort((a, b) => {
      if (a.ranking_reason !== b.ranking_reason) {
        const priority: Record<RankingReason, number> = {
          exact_match: 0,
          spec_snapshot_match: 1,
          stage_boost: 2,
          regex_match: 3,
          structural_match: 4,
          recency: 5,
          default: 10,
        };
        return priority[a.ranking_reason] - priority[b.ranking_reason];
      }
      return a.line - b.line;
    });

    // Limit to topK
    const topK = options.topK ?? DEFAULT_SEARCH_OPTIONS.topK;
    return results.slice(0, topK);
  }

  private convertMatch(match: RgJsonMatch, options: SearchOptions): SearchResult {
    const data = match.data;
    const query = options.query.toLowerCase();
    const content = data.lines.text.toLowerCase();

    // Determine ranking reason
    let ranking_reason: RankingReason = "default";
    if (content.includes(query)) {
      ranking_reason = "exact_match";
    } else if (options.isRegex !== false) {
      ranking_reason = "regex_match";
    }

    return {
      path: data.path.text,
      line: data.line_number,
      column: data.submatches[0]?.start ?? 0,
      content: data.lines.text.trimEnd(),
      contextBefore: [], // rg -C includes context in lines, need to parse separately
      contextAfter: [],
      score: this.calculateScore(match, options),
      ranking_reason,
      provider: this.name,
      specSnapshotMatch: false, // Will be enriched by retrieval policy
    };
  }

  private calculateScore(match: RgJsonMatch, _options: SearchOptions): number {
    // Simple scoring based on match position and count
    const submatches = match.data.submatches.length;
    const lineLength = match.data.lines.text.length;
    const matchPosition = match.data.submatches[0]?.start ?? 0;

    // Higher score for:
    // - More submatches
    // - Earlier position in line
    // - Shorter lines (more focused content)
    let score = 100;
    score += submatches * 10;
    score -= (matchPosition / lineLength) * 20;
    score += Math.max(0, 50 - lineLength / 10);

    return Math.max(0, Math.min(100, score));
  }

  private async getRgVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.rgPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          // Parse "ripgrep 14.1.0" -> "14.1.0"
          const match = output.match(/ripgrep\s+(\d+\.\d+\.\d+)/);
          resolve(match?.[1] ?? "unknown");
        } else {
          reject(new Error("Failed to get rg version"));
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });
  }
}
