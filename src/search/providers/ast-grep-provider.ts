/**
 * AST-Grep Provider (Full Implementation)
 *
 * Structural/AST-aware code search provider using ast-grep.
 * Sprint 64: Full implementation with pattern matching and structural queries.
 *
 * @module search/providers/ast-grep-provider
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @authority Master Plan v4.2, Feature Flag SEARCH_AST_GREP
 * @sprint 64
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { isFeatureEnabled } from "../../config/feature-flags.js";
import { BaseSearchProvider } from "../code-search-provider.js";
import {
  type SearchOptions,
  type SearchResponse,
  type SearchResult,
  type ProviderHealth,
  type AstNodeKind,
  createEmptyResponse,
  SEARCH_BUDGET,
  estimateTokens,
} from "../types.js";

// ============================================================================
// Structural Patterns
// ============================================================================

/**
 * Common AST patterns for structural search.
 *
 * These patterns use ast-grep's pattern syntax:
 * - $NAME: matches any identifier
 * - $$$: matches any sequence
 * - ...: matches remaining items
 */
export const STRUCTURAL_PATTERNS: Record<string, string> = {
  // Functions
  function_declaration: "function $NAME($$$PARAMS) { $$$BODY }",
  arrow_function: "const $NAME = ($$$PARAMS) => $$$BODY",
  async_function: "async function $NAME($$$PARAMS) { $$$BODY }",
  async_arrow: "const $NAME = async ($$$PARAMS) => $$$BODY",

  // Classes
  class_declaration: "class $NAME { $$$BODY }",
  class_extends: "class $NAME extends $PARENT { $$$BODY }",
  class_method: "$NAME($$$PARAMS) { $$$BODY }",

  // Imports/Exports
  import_default: 'import $NAME from "$SOURCE"',
  import_named: 'import { $$$NAMES } from "$SOURCE"',
  import_all: 'import * as $NAME from "$SOURCE"',
  export_default: "export default $EXPR",
  export_named: "export { $$$NAMES }",
  export_const: "export const $NAME = $VALUE",

  // TypeScript
  interface_declaration: "interface $NAME { $$$BODY }",
  type_alias: "type $NAME = $TYPE",
  type_generic: "type $NAME<$$$PARAMS> = $TYPE",

  // React
  react_component: "function $NAME($PROPS) { return $$$JSX }",
  react_hook: "const $STATE = use$HOOK($$$ARGS)",
  use_effect: "useEffect(() => { $$$BODY }, [$$$DEPS])",
  use_state: "const [$STATE, $SETTER] = useState($INIT)",

  // Common patterns
  try_catch: "try { $$$TRY } catch ($ERR) { $$$CATCH }",
  if_statement: "if ($COND) { $$$THEN }",
  for_of: "for (const $ITEM of $ITER) { $$$BODY }",
  await_call: "await $EXPR($$$ARGS)",
};

/**
 * File type to language mapping for ast-grep.
 */
const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
};

// ============================================================================
// AST-Grep JSON Output Types
// ============================================================================

interface AstGrepMatch {
  text: string;
  range: {
    byteOffset: { start: number; end: number };
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  file: string;
  lines: string;
  replacement?: string;
  language: string;
  metaVariables?: Record<
    string,
    {
      text: string;
      range: {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
    }
  >;
  ruleId?: string;
}

// ============================================================================
// AstGrepProvider
// ============================================================================

/**
 * AST-Grep provider for structural code search.
 *
 * Features:
 * - AST pattern matching
 * - Structural queries ("find all route handlers")
 * - Language-aware search
 * - Meta-variable extraction
 *
 * @example
 * ```typescript
 * const provider = new AstGrepProvider({ cwd: "/path/to/repo" });
 *
 * // Search for all function declarations
 * const response = await provider.search({
 *   query: "function $NAME($$$PARAMS) { $$$BODY }",
 *   structural: true,
 * });
 *
 * // Use predefined pattern
 * const classes = await provider.search({
 *   query: "class_declaration",
 *   structural: true,
 * });
 * ```
 */
export class AstGrepProvider extends BaseSearchProvider {
  readonly name = "ast-grep" as const;
  private _version = "unknown";
  private readonly logger: Logger;
  private readonly cwd: string;

  constructor(config: { cwd?: string } = {}) {
    super();
    this.logger = createLogger("AstGrepProvider");
    this.cwd = config.cwd ?? process.cwd();
  }

  get version(): string {
    return `ast-grep ${this._version}`;
  }

  // =========================================================================
  // Search Implementation
  // =========================================================================

  /**
   * Search using ast-grep patterns.
   *
   * Supports:
   * - Direct AST patterns
   * - Named pattern lookup from STRUCTURAL_PATTERNS
   * - Language filtering via fileTypes
   *
   * Per CTO A2: Returns empty response on error (no throw).
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();

    // Check feature flag
    if (!isFeatureEnabled("SEARCH_AST_GREP")) {
      this.logger.debug(
        "AstGrepProvider search skipped - SEARCH_AST_GREP feature flag is off"
      );
      return createEmptyResponse(this.name, this.version);
    }

    try {
      // Resolve pattern (check if it's a named pattern)
      const pattern = this.resolvePattern(options.query);

      // Determine language from fileTypes
      const language = this.resolveLanguage(options.fileTypes);

      // Execute ast-grep search
      const matches = await this.executeAstGrep(pattern, language);

      // Convert to SearchResult format
      const hits = this.convertMatches(matches, options);

      // Apply budget limits (CTO A3)
      const { results: budgetedHits, truncated } = this.applyBudget(
        hits,
        options.topK ?? SEARCH_BUDGET.DEFAULT_TOP_K
      );

      const elapsed = Date.now() - startTime;
      const tokensUsed = budgetedHits.reduce(
        (sum, h) => sum + estimateTokens(h.content),
        0
      );

      return {
        hits: budgetedHits,
        totalHits: matches.length,
        truncated,
        elapsed_ms: elapsed,
        provider: this.name,
        providerVersion: this.version,
        tokensUsed,
      };
    } catch (error) {
      // CTO A2: Log error and return empty response (no throw)
      this.logger.warn("AstGrepProvider search failed", {
        query: options.query,
        error: error instanceof Error ? error.message : String(error),
      });

      return createEmptyResponse(this.name, this.version);
    }
  }

  // =========================================================================
  // Pattern Resolution
  // =========================================================================

  /**
   * Resolve pattern - check if it's a named pattern or use as-is.
   */
  private resolvePattern(query: string): string {
    // Check if it's a named pattern
    if (query in STRUCTURAL_PATTERNS) {
      return STRUCTURAL_PATTERNS[query]!;
    }

    // Use as-is (custom pattern)
    return query;
  }

  /**
   * Resolve language from file types.
   */
  private resolveLanguage(fileTypes?: string[]): string | undefined {
    if (!fileTypes || fileTypes.length === 0) {
      return undefined;
    }

    // Use first file type that maps to a language
    for (const ft of fileTypes) {
      if (ft in LANGUAGE_MAP) {
        return LANGUAGE_MAP[ft];
      }
    }

    return undefined;
  }

  // =========================================================================
  // AST-Grep Execution
  // =========================================================================

  /**
   * Execute ast-grep CLI with pattern.
   */
  private async executeAstGrep(
    pattern: string,
    language?: string
  ): Promise<AstGrepMatch[]> {
    const { spawn } = await import("node:child_process");

    return new Promise((resolve, reject) => {
      const args = ["--json", "--pattern", pattern];

      if (language) {
        args.push("--lang", language);
      }

      // Add current directory
      args.push(this.cwd);

      this.logger.debug("Executing ast-grep", { args });

      const child = spawn("sg", args, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code: number | null) => {
        if (code === 0 || code === 1) {
          // code 1 means no matches found, which is valid
          try {
            // ast-grep outputs NDJSON (newline-delimited JSON)
            const matches: AstGrepMatch[] = [];

            if (stdout.trim()) {
              const lines = stdout.trim().split("\n");
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const match = JSON.parse(line) as AstGrepMatch;
                    matches.push(match);
                  } catch {
                    // Skip invalid JSON lines
                    this.logger.debug("Skipping invalid JSON line", { line });
                  }
                }
              }
            }

            resolve(matches);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse ast-grep output: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
        } else {
          reject(new Error(`ast-grep exited with code ${code}: ${stderr}`));
        }
      });

      child.on("error", (error) => {
        reject(
          new Error(
            `ast-grep execution failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      });
    });
  }

  // =========================================================================
  // Result Conversion
  // =========================================================================

  /**
   * Convert ast-grep matches to SearchResult format.
   */
  private convertMatches(
    matches: AstGrepMatch[],
    options: SearchOptions
  ): SearchResult[] {
    return matches.map((match) => {
      const contextLines = options.contextLines ?? 2;

      // Extract context from lines field
      const allLines = match.lines.split("\n");
      const matchLine = match.range.start.line;

      // Compute context indices
      const lineInContext = allLines.findIndex(
        (line) => line.includes(match.text.split("\n")[0] ?? "")
      );

      const contextBefore = lineInContext > 0
        ? allLines.slice(Math.max(0, lineInContext - contextLines), lineInContext)
        : [];

      const contextAfter = lineInContext >= 0
        ? allLines.slice(lineInContext + 1, lineInContext + 1 + contextLines)
        : [];

      // Determine AST kind from pattern structure
      const astKind = this.inferAstKind(match.text);

      // Build result object (exactOptionalPropertyTypes compliant)
      const result: SearchResult = {
        path: match.file,
        line: matchLine,
        column: match.range.start.column,
        content: match.text,
        contextBefore,
        contextAfter,
        score: 100, // Structural matches get high base score
        ranking_reason: "structural_match" as const,
        provider: this.name,
        specSnapshotMatch: false, // Will be enriched by RetrievalPolicy
      };

      // Only add astKind if defined (exactOptionalPropertyTypes)
      if (astKind) {
        result.astKind = astKind;
      }

      return result;
    });
  }

  /**
   * Infer AST node kind from matched text.
   */
  private inferAstKind(text: string): AstNodeKind | undefined {
    const trimmed = text.trim();

    if (trimmed.startsWith("function ") || trimmed.startsWith("async function ")) {
      return "function_declaration";
    }
    if (trimmed.startsWith("class ")) {
      return "class_declaration";
    }
    if (trimmed.startsWith("interface ")) {
      return "interface_declaration";
    }
    if (trimmed.startsWith("type ")) {
      return "type_alias";
    }
    if (trimmed.startsWith("import ")) {
      return "import_statement";
    }
    if (trimmed.startsWith("export ")) {
      return "export_statement";
    }
    if (trimmed.match(/^const\s+\w+\s*=/)) {
      if (trimmed.includes("=>")) {
        return "arrow_function";
      }
      return "variable_declaration";
    }

    return undefined;
  }

  // =========================================================================
  // Budget Management
  // =========================================================================

  /**
   * Apply budget limits to results.
   */
  private applyBudget(
    hits: SearchResult[],
    topK: number
  ): { results: SearchResult[]; truncated: boolean } {
    let totalBytes = 0;
    const results: SearchResult[] = [];
    let truncated = false;

    for (const hit of hits) {
      if (results.length >= topK) {
        truncated = true;
        break;
      }

      const hitBytes = Buffer.byteLength(hit.content, "utf-8");

      // CTO A3: Check per-result limit
      if (hitBytes > SEARCH_BUDGET.MAX_BYTES_PER_RESULT) {
        // Truncate content
        const truncatedContent = hit.content.slice(
          0,
          SEARCH_BUDGET.MAX_BYTES_PER_RESULT
        );
        results.push({ ...hit, content: truncatedContent + "..." });
        totalBytes += SEARCH_BUDGET.MAX_BYTES_PER_RESULT;
      } else {
        // Check total budget
        if (totalBytes + hitBytes > SEARCH_BUDGET.DEFAULT_MAX_BYTES) {
          truncated = true;
          break;
        }
        results.push(hit);
        totalBytes += hitBytes;
      }
    }

    return { results, truncated };
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
// Utility Functions
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

/**
 * Get available structural patterns.
 *
 * @returns Array of pattern names
 */
export function getStructuralPatterns(): string[] {
  return Object.keys(STRUCTURAL_PATTERNS);
}

/**
 * Get pattern by name.
 *
 * @param name Pattern name
 * @returns Pattern string or undefined
 */
export function getPattern(name: string): string | undefined {
  return STRUCTURAL_PATTERNS[name];
}
