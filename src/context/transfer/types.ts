/**
 * Cross-Session Context Transfer Types — Sprint 96
 *
 * Portable type definitions for cross-session context transfer
 * and quality scoring. ADR-002 compliant: ZERO imports from src/.
 *
 * @module context/transfer/types
 * @version 1.0.0
 * @sprint 96
 */

// ============================================================================
// Context Quality
// ============================================================================

/**
 * Quality score across 4 dimensions.
 * Each dimension is 0-1. Composite = weighted sum.
 */
export interface ContextQualityScore {
  /** How related is this context to the current goal? (tag overlap, stage proximity) */
  relevance: number;
  /** How fresh is this context? (exponential decay based on age) */
  recency: number;
  /** Was this produced by a reliable source? (model tier, task success) */
  confidence: number;
  /** Is this a complete result or a truncated fragment? */
  completeness: number;
  /** Weighted composite score */
  composite: number;
}

/**
 * Weights for quality scoring dimensions.
 * Must sum to 1.0 (invariant, tested).
 */
export interface QualityWeights {
  relevance: number;
  recency: number;
  confidence: number;
  completeness: number;
}

/**
 * Default quality weights.
 * relevance (0.35) + recency (0.25) + confidence (0.25) + completeness (0.15) = 1.0
 */
export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  relevance: 0.35,
  recency: 0.25,
  confidence: 0.25,
  completeness: 0.15,
};

// ============================================================================
// Transfer Context Types (CTO F3: all 6 enumerated)
// ============================================================================

/**
 * Type of context being transferred across sessions.
 * CTO F3: All 6 values explicitly enumerated.
 */
export type TransferContextType =
  | "goal_result"         // Completed multi-agent goal output
  | "decision"            // Key decision made during session
  | "architecture"        // Architecture insight or pattern
  | "error_pattern"       // Error + resolution pair
  | "task_output"         // Individual agent task result
  | "blocker_resolution"; // How a blocker was resolved

/**
 * All transfer context types as an array (for exhaustiveness checks).
 */
export const ALL_TRANSFER_CONTEXT_TYPES: readonly TransferContextType[] = [
  "goal_result",
  "decision",
  "architecture",
  "error_pattern",
  "task_output",
  "blocker_resolution",
] as const;

// ============================================================================
// Transferable Context
// ============================================================================

/**
 * A unit of context that can be persisted and transferred across sessions.
 */
export interface TransferableContext {
  /** Unique ID for this context entry */
  id: string;
  /** Project this context belongs to */
  projectId: string;
  /** Session that produced this context */
  sourceSessionId: string;
  /** Goal ID if extracted from a multi-agent goal */
  sourceGoalId?: string;
  /** Type of context */
  type: TransferContextType;
  /** The actual context content (text) */
  content: string;
  /** Token count of content */
  tokenCount: number;
  /** Quality score at time of creation */
  quality: ContextQualityScore;
  /** Tags for relevance matching */
  tags: string[];
  /** Agent that produced this context */
  agentSource?: string;
  /** SDLC stage when context was created */
  sdlcStage?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 expiration timestamp */
  expiresAt?: string;
  /** Vendor-specific metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Recency decay configuration per context type.
 * Half-life in milliseconds — after this time, recency score drops to 0.5.
 */
export interface RecencyDecayConfig {
  /** Half-life for decisions (default: 24h) */
  decisionHalfLifeMs: number;
  /** Half-life for architecture insights (default: 24h) */
  architectureHalfLifeMs: number;
  /** Half-life for goal results (default: 12h) */
  goalResultHalfLifeMs: number;
  /** Half-life for task outputs (default: 4h) */
  taskOutputHalfLifeMs: number;
  /** Half-life for error patterns (default: 12h) */
  errorPatternHalfLifeMs: number;
  /** Half-life for blocker resolutions (default: 12h) */
  blockerResolutionHalfLifeMs: number;
}

/**
 * Quality gate thresholds per context type.
 * Context below threshold is rejected.
 */
export interface QualityGateThresholds {
  goal_result: number;
  decision: number;
  architecture: number;
  error_pattern: number;
  task_output: number;
  blocker_resolution: number;
}

/**
 * Full configuration for cross-session context transfer.
 */
export interface ContextTransferConfig {
  /** Quality weights for scoring */
  weights: QualityWeights;
  /** Recency decay configuration */
  decay: RecencyDecayConfig;
  /** Quality gate thresholds */
  thresholds: QualityGateThresholds;
  /** Maximum tokens for cross-session context injection */
  maxInjectionTokens: number;
  /** Default expiry in ms for task_output (7 days) */
  taskOutputExpiryMs: number;
  /** Default expiry in ms for decisions/architecture (30 days) */
  decisionExpiryMs: number;
  /** Base path for context transfer storage */
  basePath: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Default context transfer configuration.
 *
 * CTO F1 resolution: maxInjectionTokens = 600 tokens.
 * This leaves room within the 2K total (AnchorBudget uses ~800).
 * Total: 800 (anchors) + 600 (cross-session) = 1400 < 2000.
 */
export const DEFAULT_TRANSFER_CONFIG: ContextTransferConfig = {
  weights: DEFAULT_QUALITY_WEIGHTS,
  decay: {
    decisionHalfLifeMs: 24 * HOUR,
    architectureHalfLifeMs: 24 * HOUR,
    goalResultHalfLifeMs: 12 * HOUR,
    taskOutputHalfLifeMs: 4 * HOUR,
    errorPatternHalfLifeMs: 12 * HOUR,
    blockerResolutionHalfLifeMs: 12 * HOUR,
  },
  thresholds: {
    goal_result: 0.6,
    decision: 0.7,
    architecture: 0.7,
    error_pattern: 0.5,
    task_output: 0.5,
    blocker_resolution: 0.6,
  },
  maxInjectionTokens: 600,
  taskOutputExpiryMs: 7 * DAY,
  decisionExpiryMs: 30 * DAY,
  basePath: "~/.endiorbot/context-transfer",
};

// ============================================================================
// Selection Result
// ============================================================================

/**
 * Result of context selection for a new session.
 */
export interface ContextSelectionResult {
  /** Selected context entries, sorted by composite score descending */
  selected: TransferableContext[];
  /** Entries that were considered but dropped (below threshold or over budget) */
  dropped: TransferableContext[];
  /** Total tokens of selected context */
  totalTokens: number;
  /** Token budget used (0-1) */
  budgetUtilization: number;
  /** Retention rate: selected tokens / total available tokens (0-1) */
  retentionRate: number;
}

// ============================================================================
// Quality Gate Result
// ============================================================================

/**
 * Result of quality gate evaluation for a single context entry.
 */
export interface ContextQualityGateResult {
  /** Whether the context passes the quality gate */
  passed: boolean;
  /** The context entry evaluated */
  contextId: string;
  /** Composite score */
  compositeScore: number;
  /** Threshold applied */
  threshold: number;
  /** Specific violations (dimensions below acceptable levels) */
  violations: QualityViolation[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * A specific quality violation.
 */
export interface QualityViolation {
  /** Which dimension was violated */
  dimension: keyof Omit<ContextQualityScore, "composite">;
  /** Actual value */
  actual: number;
  /** Minimum expected */
  minimum: number;
  /** Human-readable description */
  message: string;
}

// ============================================================================
// Store Types
// ============================================================================

/**
 * Statistics for the context transfer store.
 */
export interface TransferStoreStats {
  /** Total number of entries */
  totalEntries: number;
  /** Total tokens across all entries */
  totalTokens: number;
  /** Entries by type */
  byType: Record<TransferContextType, number>;
  /** Number of expired entries */
  expiredEntries: number;
  /** Average composite quality score */
  averageQuality: number;
}

// ============================================================================
// T3 Types — Sprint 97: Progressive Trust T3
// ============================================================================

/**
 * Retention level classification.
 * CTO F2: retention = selectedTokens / gatedTokens (not total available).
 */
export type RetentionLevel = "pass" | "warning" | "critical";

/**
 * Retention rate thresholds.
 */
export const RETENTION_THRESHOLDS = {
  /** T3 target: ≥95% of gated context retained */
  pass: 0.95,
  /** Warning: retention below 90% */
  warning: 0.90,
  /** Critical: retention below 80% */
  critical: 0.80,
} as const;

/**
 * Per-session retention metrics.
 */
export interface RetentionMetrics {
  /** Session ID */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Retention rate: selectedTokens / gatedTokens (CTO F2) */
  retentionRate: number;
  /** Retention level classification */
  level: RetentionLevel;
  /** Target rate */
  target: number;
  /** Whether target was met */
  passed: boolean;
  /** Total tokens available (all non-expired) */
  totalAvailableTokens: number;
  /** Tokens that passed quality gate */
  gatedTokens: number;
  /** Tokens actually selected (within budget) */
  selectedTokens: number;
  /** Number of mid-session refreshes */
  refreshCount: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Context checkpoint state — stored in ExecutionContext.partialResults["contextTransfer"].
 * CTO F1: Uses partialResults (existing Record<string, unknown>) to avoid schema change.
 */
export interface ContextCheckpointState {
  /** IDs of currently injected contexts (content stays in store) */
  injectedContextIds: string[];
  /** Total tokens of injected context */
  injectedTokens: number;
  /** Current retention rate */
  retentionRate: number;
  /** Number of mid-session refreshes performed */
  refreshCount: number;
  /** Timestamp of last refresh */
  lastRefreshAt: string;
  /** Current turn count (for refresh trigger) */
  turnCount: number;
}

/**
 * Mid-session refresh configuration.
 */
export interface ContextRefreshConfig {
  /** Refresh every N turns */
  turnInterval: number;
  /** Refresh every N milliseconds */
  timeIntervalMs: number;
  /** Minimum time between refreshes (ms) */
  minRefreshIntervalMs: number;
  /** Minimum composite score improvement to swap (CTO F3) */
  swapThreshold: number;
}

/**
 * Default refresh configuration for T3 (2-hour sessions).
 */
export const DEFAULT_REFRESH_CONFIG: ContextRefreshConfig = {
  turnInterval: 30,                    // Every 30 turns
  timeIntervalMs: 30 * 60 * 1000,     // Every 30 minutes
  minRefreshIntervalMs: 5 * 60 * 1000, // At least 5 min apart
  swapThreshold: 0.1,                  // CTO F3: ≥0.1 improvement required
};
