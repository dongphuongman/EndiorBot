/**
 * Self-Correction Types
 *
 * Core types for the Self-Correction Engine (Phase 3).
 *
 * Per Sprint 37 Day 1 requirements:
 * - Error classification: BUILD/LINT/TYPE/TEST
 * - Auto-fix targets: Build 80%, Lint 90%, Type 70%, Test 30%
 * - 3-strike escalation
 * - Fix logging
 *
 * @module src/self-correction/types
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 * @authority ADR-007 Budget Control, Phase 3
 */

// ============================================================================
// Error Categories
// ============================================================================

/**
 * Error category for classification.
 * Per Sprint 37 spec: 4 categories with different auto-fix targets.
 */
export type ErrorCategory = "BUILD" | "LINT" | "TYPE" | "TEST";

/**
 * Error severity level.
 */
export type ErrorSeverity = "error" | "warning" | "info";

/**
 * Fix confidence level.
 * Deterministic fixes have high confidence, AI-suggested fixes have lower.
 */
export type FixConfidence = "high" | "medium" | "low" | "experimental";

/**
 * Fix result status.
 */
export type FixStatus = "success" | "failed" | "partial" | "skipped" | "escalated";

// ============================================================================
// Error Information
// ============================================================================

/**
 * Parsed error information from build/lint/type/test output.
 */
export interface ParsedError {
  /** Error category */
  category: ErrorCategory;
  /** Error code (e.g., TS2339, ESLint rule name) */
  code: string;
  /** Error message */
  message: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** File path where error occurred */
  filePath: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column?: number;
  /** End line for range errors */
  endLine?: number;
  /** End column for range errors */
  endColumn?: number;
  /** Original raw error text */
  raw: string;
  /** Additional context (surrounding code, etc.) */
  context?: string;
}

/**
 * Build error specific information.
 */
export interface BuildError extends ParsedError {
  category: "BUILD";
  /** Build tool that reported the error */
  tool: "tsc" | "esbuild" | "vite" | "webpack" | "other";
  /** Is this a configuration error? */
  isConfigError: boolean;
}

/**
 * Lint error specific information.
 */
export interface LintError extends ParsedError {
  category: "LINT";
  /** ESLint rule name */
  rule: string;
  /** Is this auto-fixable by ESLint? */
  fixable: boolean;
  /** ESLint fix suggestion if available */
  fix?: {
    range: [number, number];
    text: string;
  };
}

/**
 * TypeScript error specific information.
 */
export interface TypeScriptError extends ParsedError {
  category: "TYPE";
  /** TypeScript error code (e.g., 2339) */
  tsCode: number;
  /** Related information if available */
  relatedInfo?: {
    filePath: string;
    line: number;
    message: string;
  }[];
}

/**
 * Test error specific information.
 */
export interface TestError extends ParsedError {
  category: "TEST";
  /** Test file path */
  testFile: string;
  /** Test suite name */
  suiteName?: string;
  /** Test case name */
  testName: string;
  /** Expected value */
  expected?: unknown;
  /** Actual value */
  actual?: unknown;
  /** Stack trace */
  stack?: string;
  /** Is this a timeout error? */
  isTimeout: boolean;
}

/**
 * Union type for all error types.
 */
export type ClassifiedError = BuildError | LintError | TypeScriptError | TestError;

// ============================================================================
// Fix Information
// ============================================================================

/**
 * Proposed fix for an error.
 */
export interface ProposedFix {
  /** Unique fix ID */
  id: string;
  /** Error being fixed */
  error: ClassifiedError;
  /** Fix type */
  type: FixType;
  /** Confidence level */
  confidence: FixConfidence;
  /** Description of the fix */
  description: string;
  /** File to modify */
  filePath: string;
  /** Line to modify */
  line: number;
  /** Original code */
  originalCode: string;
  /** Fixed code */
  fixedCode: string;
  /** Is this a multi-line fix? */
  isMultiLine: boolean;
  /** Additional files affected (for refactoring fixes) */
  additionalFiles?: {
    filePath: string;
    changes: string;
  }[];
}

/**
 * Fix type classification.
 */
export type FixType =
  | "add_import"           // Missing import
  | "add_type"             // Missing type annotation
  | "add_property"         // Missing property in interface/object
  | "remove_unused"        // Unused variable/import
  | "fix_typo"             // Typo in identifier
  | "fix_syntax"           // Syntax error
  | "fix_null_check"       // Null/undefined handling
  | "add_return"           // Missing return statement
  | "fix_async"            // Async/await issues
  | "fix_lint_rule"        // ESLint rule fix
  | "fix_format"           // Formatting fix
  | "experimental"         // AI-suggested fix (low confidence)
  | "manual";              // Requires manual intervention

/**
 * Result of applying a fix.
 */
export interface FixResult {
  /** Fix that was attempted */
  fix: ProposedFix;
  /** Result status */
  status: FixStatus;
  /** Time taken to apply fix (ms) */
  duration: number;
  /** Verification result */
  verified: boolean;
  /** New errors introduced (if any) */
  newErrors?: ParsedError[];
  /** Error message if failed */
  errorMessage?: string;
  /** Number of strikes for this error pattern */
  strikes: number;
}

// ============================================================================
// Strike Tracking
// ============================================================================

/**
 * Strike record for an error pattern.
 * Per Sprint 37: 3-strike escalation.
 */
export interface StrikeRecord {
  /** Error pattern identifier (code + category) */
  patternId: string;
  /** Error category */
  category: ErrorCategory;
  /** Error code */
  code: string;
  /** Number of failed fix attempts */
  strikes: number;
  /** Last strike timestamp */
  lastStrike: Date;
  /** Fix attempts history */
  attempts: {
    timestamp: Date;
    fixType: FixType;
    success: boolean;
    error?: string;
  }[];
  /** Is this pattern escalated? */
  escalated: boolean;
}

// ============================================================================
// Fix Log Entry
// ============================================================================

/**
 * Fix log entry for persistence.
 * Stored in fix-log.json.
 */
export interface FixLogEntry {
  /** Entry ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Session ID */
  sessionId: string;
  /** Error that was fixed */
  error: {
    category: ErrorCategory;
    code: string;
    message: string;
    filePath: string;
    line: number;
  };
  /** Fix that was applied */
  fix: {
    type: FixType;
    description: string;
    confidence: FixConfidence;
  };
  /** Result */
  result: {
    status: FixStatus;
    verified: boolean;
    duration: number;
    strikes: number;
  };
  /** Original code snapshot */
  originalCode?: string;
  /** Fixed code snapshot */
  fixedCode?: string;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Self-correction statistics.
 */
export interface SelfCorrectionStats {
  /** Total errors encountered */
  totalErrors: number;
  /** Errors by category */
  byCategory: Record<ErrorCategory, number>;
  /** Fix attempts */
  totalFixAttempts: number;
  /** Successful fixes */
  successfulFixes: number;
  /** Failed fixes */
  failedFixes: number;
  /** Escalated (3-strike) count */
  escalatedCount: number;
  /** Success rate by category */
  successRateByCategory: Record<ErrorCategory, number>;
  /** Average fix time (ms) */
  averageFixTime: number;
  /** Session start time */
  sessionStart: Date;
  /** Session ID */
  sessionId: string;
}

/**
 * Auto-fix target rates per Sprint 37 spec.
 */
export const AUTO_FIX_TARGETS: Record<ErrorCategory, number> = {
  BUILD: 0.8,  // 80%
  LINT: 0.9,   // 90%
  TYPE: 0.7,   // 70%
  TEST: 0.3,   // 30% (EXPERIMENTAL)
};

/**
 * Maximum strikes before escalation.
 */
export const MAX_STRIKES = 3;

// ============================================================================
// Self-Correction Engine Types (Day 2)
// ============================================================================

/**
 * Self-correction engine configuration.
 */
export interface SelfCorrectionConfig {
  /** Max fix attempts per error (default: 3) */
  maxAttempts: number;
  /** Verify after each fix (default: true) */
  verifyAfterFix: boolean;
  /** Log all fix attempts (default: true) */
  logFixes: boolean;
  /** Escalate after max failures (default: true) */
  escalateOnFailure: boolean;
  /** Target success rates by category */
  targetRates: Record<ErrorCategory, number>;
  /** Working directory for file operations */
  workingDirectory: string;
  /** Enable dry-run mode (no actual file changes) */
  dryRun: boolean;
}

/**
 * Default self-correction config.
 */
export const DEFAULT_SELF_CORRECTION_CONFIG: SelfCorrectionConfig = {
  maxAttempts: MAX_STRIKES,
  verifyAfterFix: true,
  logFixes: true,
  escalateOnFailure: true,
  targetRates: AUTO_FIX_TARGETS,
  workingDirectory: process.cwd(),
  dryRun: false,
};

/**
 * Fix attempt record.
 */
export interface FixAttempt {
  /** Error being fixed */
  error: ClassifiedError;
  /** Fix result */
  fixResult: FixResult;
  /** Attempt number (1-3) */
  attemptNumber: number;
  /** Timestamp */
  timestamp: Date;
  /** Verification result if performed */
  verification?: {
    success: boolean;
    output: string;
    remainingErrors: number;
  };
}

/**
 * Correction result from self-correction engine.
 */
export interface CorrectionResult {
  /** Overall success (all errors fixed) */
  success: boolean;
  /** Total errors detected */
  totalErrors: number;
  /** Errors successfully fixed */
  fixedErrors: number;
  /** Errors still remaining */
  remainingErrors: number;
  /** All fix attempts */
  attempts: FixAttempt[];
  /** Duration in milliseconds */
  duration: number;
  /** Whether any errors were escalated */
  escalated: boolean;
  /** Actual success rate */
  successRate: number;
  /** Target success rate */
  targetRate: number;
  /** Whether target was met */
  metTarget: boolean;
  /** Errors grouped by category */
  byCategory: Record<ErrorCategory, {
    total: number;
    fixed: number;
    remaining: number;
    escalated: number;
  }>;
}

/**
 * Escalation info for an error.
 */
export interface EscalationInfo {
  /** Error that was escalated */
  error: ClassifiedError;
  /** Failed fix attempts */
  attempts: FixAttempt[];
  /** Reason for escalation */
  reason: string;
  /** Timestamp */
  timestamp: Date;
}
