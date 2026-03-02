/**
 * Code Search Types
 *
 * Type definitions for the Code Search Layer.
 * Includes CTO amendments A1 (providerVersion) and A3 (SEARCH_BUDGET).
 *
 * @module search/types
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, TS-007
 * @sprint 63
 */

// ============================================================================
// Search Result Types
// ============================================================================

/**
 * Individual search result with ranking metadata.
 * Enriched with ranking_reason and specSnapshotMatch for anti-hallucination.
 */
export interface SearchResult {
  // Core location
  path: string;
  line: number;
  column: number;

  // Content
  content: string;
  contextBefore: string[];
  contextAfter: string[];

  // Ranking (for retrieval logging)
  score: number;
  ranking_reason: RankingReason[];  // Array: multiple reasons possible (ADR-015)

  // Provider metadata (anti-hallucination)
  provider: ProviderName;
  specSnapshotMatch: boolean;

  // AST metadata (only from AstGrepProvider)
  astKind?: AstNodeKind;
}

/**
 * Ranking reasons for result ordering.
 * Enum contract per ADR-015 (Sprint 65+).
 *
 * Results can have multiple reasons, use array: ranking_reason: RankingReason[]
 */
export enum RankingReason {
  // Exact matches (highest priority)
  EXACT_SYMBOL_MATCH = 'exact_symbol_match',
  EXACT_MATCH = 'exact_match',

  // Spec-based boosting (ADR-015)
  SPEC_SNAPSHOT_MATCH = 'spec_snapshot_match',

  // Context-aware boosting (Sprint 65+, ADR-015)
  STAGE_BOOST = 'stage_boost',           // Stage-specific relevance (e.g., design stage → docs/02-design/**)
  ROLE_BOOST = 'role_boost',             // Role-specific relevance (e.g., @coder → src/**)
  RECENCY_BOOST = 'recency_boost',       // Git blame/mtime (newer = more relevant)

  // Structural matching
  AST_STRUCTURAL_MATCH = 'ast_structural_match',  // AST pattern match via ast-grep
  STRUCTURAL_MATCH = 'structural_match',          // Legacy structural (deprecated)

  // Text-based matching
  REGEX_MATCH = 'regex_match',
  TRIGRAM_MATCH = 'trigram_match',       // Zoekt indexing (Sprint 66-67 conditional)

  // Fallback
  DEFAULT = 'default'
}

/**
 * AST node kinds from ast-grep.
 */
export type AstNodeKind =
  | "function_declaration"
  | "class_declaration"
  | "interface_declaration"
  | "type_alias"
  | "variable_declaration"
  | "import_statement"
  | "export_statement"
  | "method_definition"
  | "arrow_function"
  | "other";

/**
 * Provider names for identification.
 */
export type ProviderName = "ripgrep" | "ast-grep" | "zoekt" | "grep";

// ============================================================================
// Search Response Types (CTO Amendment A1)
// ============================================================================

/**
 * Search response with metadata.
 * Includes providerVersion per CTO Amendment A1.
 */
export interface SearchResponse {
  // Results
  hits: SearchResult[];
  totalHits: number;

  // Truncation info
  truncated: boolean;
  truncatedAt?: number;

  // Performance
  elapsed_ms: number;

  // Provider info (CTO A1)
  provider: ProviderName;
  providerVersion: string; // e.g., "ripgrep 14.1.0"

  // Token budget
  tokensUsed: number;
}

/**
 * Empty response factory for error cases (CTO A2).
 */
export function createEmptyResponse(
  provider: ProviderName,
  providerVersion: string
): SearchResponse {
  return {
    hits: [],
    totalHits: 0,
    truncated: false,
    elapsed_ms: 0,
    provider,
    providerVersion,
    tokensUsed: 0,
  };
}

// ============================================================================
// Search Options
// ============================================================================

/**
 * Search options for controlling search behavior.
 */
export interface SearchOptions {
  // Query
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;

  // Result limits
  topK?: number;
  maxBytes?: number;
  timeout?: number;

  // Search scope
  paths?: string[];
  glob?: string;
  fileTypes?: string[];

  // Provider hints
  structural?: boolean; // Force ast-grep
  indexed?: boolean; // Force zoekt

  // SDLC context
  stage?: string;
  role?: string;

  // Context lines
  contextLines?: number;
}

/**
 * Default search options.
 */
export const DEFAULT_SEARCH_OPTIONS: Required<
  Pick<SearchOptions, "topK" | "maxBytes" | "timeout" | "contextLines">
> = {
  topK: 15,
  maxBytes: 50_000,
  timeout: 5_000,
  contextLines: 2,
};

// ============================================================================
// Search Budget (CTO Amendment A3)
// ============================================================================

/**
 * Search budget constants.
 * Per CTO Amendment A3: MAX_BYTES_PER_RESULT=500, HARD_CAP_TOKENS=2500.
 */
export const SEARCH_BUDGET = {
  /** Default number of top results to return */
  DEFAULT_TOP_K: 15,

  /** Default max bytes for all results combined */
  DEFAULT_MAX_BYTES: 50_000,

  /** Max bytes per individual result (CTO A3) */
  MAX_BYTES_PER_RESULT: 500,

  /** Default timeout in milliseconds */
  DEFAULT_TIMEOUT_MS: 5_000,

  /** Soft token limit (warning threshold) */
  TOKEN_LIMIT: 2_000,

  /** Hard cap on tokens - never exceed (CTO A3) */
  HARD_CAP_TOKENS: 2_500,

  /** Estimated tokens per byte (rough approximation) */
  TOKENS_PER_BYTE: 0.25,
} as const;

/**
 * Calculate token estimate for content.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length * SEARCH_BUDGET.TOKENS_PER_BYTE);
}

/**
 * Check if token budget exceeded.
 */
export function isTokenBudgetExceeded(
  tokensUsed: number,
  hardCap: boolean = false
): boolean {
  const limit = hardCap
    ? SEARCH_BUDGET.HARD_CAP_TOKENS
    : SEARCH_BUDGET.TOKEN_LIMIT;
  return tokensUsed >= limit;
}

/**
 * Truncate content to fit token budget.
 */
export function truncateToTokenBudget(
  content: string,
  maxTokens: number = SEARCH_BUDGET.HARD_CAP_TOKENS
): { content: string; truncated: boolean; tokensUsed: number } {
  const tokens = estimateTokens(content);

  if (tokens <= maxTokens) {
    return { content, truncated: false, tokensUsed: tokens };
  }

  // Calculate max bytes based on token limit
  const maxBytes = Math.floor(maxTokens / SEARCH_BUDGET.TOKENS_PER_BYTE);
  const truncatedContent = content.slice(0, maxBytes);

  return {
    content: truncatedContent + "\n... [truncated]",
    truncated: true,
    tokensUsed: maxTokens,
  };
}

// ============================================================================
// Provider Health
// ============================================================================

/**
 * Provider health status.
 */
export interface ProviderHealth {
  provider: ProviderName;
  available: boolean;
  version?: string;
  error?: string;
  lastChecked: Date;
}

// ============================================================================
// Decision Context (Sprint 64 - T4.3)
// ============================================================================

/**
 * Context about the decision being made.
 * Sprint 64: T4.3 - Decision Packet enrichment.
 */
export interface DecisionContext {
  /** SDLC stage (e.g., "04-BUILD", "05-TEST") */
  stage?: string;
  /** Agent role (e.g., "@coder", "@architect") */
  role?: string;
  /** Decision intent (e.g., "find related tests", "locate API handlers") */
  intent?: string;
  /** Task ID or reference */
  taskRef?: string;
  /** Sprint number */
  sprint?: string;
  /** Spec snapshot ID if applicable */
  specSnapshotId?: string;
}

// ============================================================================
// Retrieval Evidence (for Retrieval Logger)
// ============================================================================

/**
 * Evidence pack for anti-hallucination logging.
 * Logs what the agent relied on for context.
 *
 * Sprint 64: Enhanced with DecisionContext for decision packet enrichment.
 */
export interface RetrievalEvidence {
  timestamp: string;
  query: string;
  provider: ProviderName;
  providerVersion: string;
  elapsed_ms: number;
  totalHits: number;
  topKReturned: number;
  truncated: boolean;
  tokensUsed: number;
  results: RetrievalEvidenceResult[];
  /** Decision context (Sprint 64 - T4.3) */
  context?: DecisionContext;
}

export interface RetrievalEvidenceResult {
  path: string;
  line: number;
  score: number;  // ADD: for machine-readable logs (ADR-015)
  ranking_reason: RankingReason[];  // Array: multiple reasons (ADR-015)
  specSnapshotMatch: boolean;
  sourceExcerpt: string; // 1-3 lines context
}

/**
 * Format evidence for logging to SESSION-PROGRESS.md.
 */
export function formatRetrievalEvidence(evidence: RetrievalEvidence): string {
  const lines = [
    `## Search Evidence [${evidence.timestamp}]`,
    "",
  ];

  // Add decision context if present (Sprint 64 - T4.3)
  if (evidence.context) {
    lines.push("### Decision Context");
    lines.push("");
    if (evidence.context.stage) {
      lines.push(`- **Stage:** ${evidence.context.stage}`);
    }
    if (evidence.context.role) {
      lines.push(`- **Role:** ${evidence.context.role}`);
    }
    if (evidence.context.intent) {
      lines.push(`- **Intent:** ${evidence.context.intent}`);
    }
    if (evidence.context.taskRef) {
      lines.push(`- **Task:** ${evidence.context.taskRef}`);
    }
    if (evidence.context.sprint) {
      lines.push(`- **Sprint:** ${evidence.context.sprint}`);
    }
    if (evidence.context.specSnapshotId) {
      lines.push(`- **Spec Snapshot:** ${evidence.context.specSnapshotId}`);
    }
    lines.push("");
    lines.push("### Search Details");
    lines.push("");
  }

  lines.push(`- **Query:** \`${evidence.query}\``);
  lines.push(`- **Provider:** ${evidence.provider} (${evidence.providerVersion})`);
  lines.push(`- **Latency:** ${evidence.elapsed_ms}ms`);
  lines.push(`- **Results:** ${evidence.topKReturned}/${evidence.totalHits} (truncated: ${evidence.truncated})`);
  lines.push(`- **Tokens:** ${evidence.tokensUsed}`);
  lines.push("");
  lines.push("### Top Results");
  lines.push("");

  for (const result of evidence.results.slice(0, 5)) {
    lines.push(`- \`${result.path}:${result.line}\` [${result.ranking_reason}]`);
    if (result.specSnapshotMatch) {
      lines.push("  - ⭐ Spec Snapshot Match");
    }
  }

  return lines.join("\n");
}
