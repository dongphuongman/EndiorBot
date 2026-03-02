/**
 * Failure Classifier
 *
 * Classifies failures into categories for appropriate recovery actions.
 * Implements CTO P0-6: Require ≥2 evidence types for DESIGN_ISSUE escalation.
 *
 * @module sessions/failure/classifier
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @authority Master Plan v4.3, Sprint 69-71 T9.5
 * @sprint 69-71
 */

import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Failure types for recovery classification.
 */
export enum FailureType {
  /** Network, rate limit, timeout → retry */
  TRANSIENT = "TRANSIENT",
  /** Lint, test fail, type error → fix loop */
  FIXABLE = "FIXABLE",
  /** Spec mismatch, breaking change → escalate */
  DESIGN_ISSUE = "DESIGN_ISSUE",
}

/**
 * Evidence types for design issue detection.
 */
export type EvidenceType =
  | "repeated_failure"
  | "spec_mismatch"
  | "breaking_change"
  | "cross_module_ripple"
  | "type_system_conflict"
  | "integration_failure"
  | "performance_regression";

/**
 * Failure evidence for classification.
 */
export interface FailureEvidence {
  /** Error type identifier */
  type: string;
  /** Error message */
  message: string;
  /** Stack trace (if available) */
  stackTrace?: string;
  /** Number of attempts for this failure */
  attempts: number;
  /** Timestamp of failure */
  timestamp: string;
  /** Source file (if applicable) */
  sourceFile?: string;
  /** Related files */
  relatedFiles?: string[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Classification result.
 */
export interface ClassificationResult {
  /** Classified failure type */
  type: FailureType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Evidence types detected */
  evidenceTypes: EvidenceType[];
  /** Recommended action */
  recommendedAction: "retry" | "fix" | "escalate";
  /** Explanation */
  explanation: string;
}

/**
 * Classifier configuration.
 */
export interface FailureClassifierConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom transient patterns */
  transientPatterns?: RegExp[];
  /** Custom fixable patterns */
  fixablePatterns?: RegExp[];
  /** Custom design issue patterns */
  designIssuePatterns?: RegExp[];
  /** Minimum evidence types for DESIGN_ISSUE (default: 2) */
  minDesignIssueEvidence?: number;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Default patterns for transient errors.
 */
const DEFAULT_TRANSIENT_PATTERNS: RegExp[] = [
  /network timeout/i,
  /rate limit/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /429 Too Many Requests/i,
  /503 Service Unavailable/i,
  /504 Gateway Timeout/i,
  /temporary.*failure/i,
  /connection.*reset/i,
  /socket hang up/i,
  /fetch failed/i,
  /dns.*lookup.*failed/i,
];

/**
 * Default patterns for fixable errors.
 */
const DEFAULT_FIXABLE_PATTERNS: RegExp[] = [
  /lint error/i,
  /eslint/i,
  /prettier/i,
  /test failed/i,
  /test.*failure/i,
  /assertion.*failed/i,
  /expect.*received/i,
  /type error/i,
  /typescript.*error/i,
  /TS\d{4}:/,
  /tsc.*check.*failed/i,
  /missing import/i,
  /cannot find module/i,
  /undefined variable/i,
  /is not defined/i,
  /syntax error/i,
  /unexpected token/i,
  /compilation.*failed/i,
  /build.*error/i,
  /missing.*dependency/i,
  /cannot.*resolve/i,
];

/**
 * Default patterns for design issues.
 */
const DEFAULT_DESIGN_ISSUE_PATTERNS: RegExp[] = [
  /spec.*mismatch/i,
  /breaking.*change/i,
  /contract.*violation/i,
  /api.*incompatible/i,
  /schema.*mismatch/i,
  /circular.*dependency/i,
  /architectural.*issue/i,
  /design.*flaw/i,
  /fundamental.*issue/i,
  /requires.*redesign/i,
];

// ============================================================================
// Failure Classifier
// ============================================================================

/**
 * Failure Classifier.
 *
 * Classifies errors into actionable categories:
 * - TRANSIENT: Retry with backoff
 * - FIXABLE: Attempt automated fix
 * - DESIGN_ISSUE: Escalate to human (requires ≥2 evidence types)
 *
 * @example
 * ```typescript
 * const classifier = new FailureClassifier();
 *
 * const error = new Error('Type error: TS2322');
 * const result = classifier.classify(error, { stage: 'BUILD' });
 *
 * console.log(result.type); // FIXABLE
 * console.log(result.recommendedAction); // 'fix'
 * ```
 */
export class FailureClassifier {
  private readonly log: Logger;
  private readonly config: Required<FailureClassifierConfig>;
  private readonly transientPatterns: RegExp[];
  private readonly fixablePatterns: RegExp[];
  private readonly designIssuePatterns: RegExp[];

  constructor(config: FailureClassifierConfig = {}) {
    this.log = createLogger("FailureClassifier");
    this.config = {
      debug: false,
      transientPatterns: [],
      fixablePatterns: [],
      designIssuePatterns: [],
      minDesignIssueEvidence: 2,
      ...config,
    };

    // Merge patterns
    this.transientPatterns = [
      ...DEFAULT_TRANSIENT_PATTERNS,
      ...this.config.transientPatterns,
    ];
    this.fixablePatterns = [
      ...DEFAULT_FIXABLE_PATTERNS,
      ...this.config.fixablePatterns,
    ];
    this.designIssuePatterns = [
      ...DEFAULT_DESIGN_ISSUE_PATTERNS,
      ...this.config.designIssuePatterns,
    ];
  }

  // ============================================================================
  // Classification
  // ============================================================================

  /**
   * Classify a failure.
   */
  classify(
    error: Error,
    context: Record<string, unknown> = {}
  ): ClassificationResult {
    const evidence = this.gatherEvidence(error, context);
    return this.classifyEvidence(evidence);
  }

  /**
   * Classify from failure evidence.
   */
  classifyEvidence(evidence: FailureEvidence): ClassificationResult {
    // Check for transient first (highest priority for retry)
    if (this.isTransient(evidence)) {
      return {
        type: FailureType.TRANSIENT,
        confidence: this.calculateConfidence(evidence, FailureType.TRANSIENT),
        evidenceTypes: [],
        recommendedAction: "retry",
        explanation: "Network or temporary failure detected. Retry recommended.",
      };
    }

    // Check for fixable
    if (this.isFixable(evidence)) {
      return {
        type: FailureType.FIXABLE,
        confidence: this.calculateConfidence(evidence, FailureType.FIXABLE),
        evidenceTypes: [],
        recommendedAction: "fix",
        explanation: "Code or test error detected. Automated fix recommended.",
      };
    }

    // Default to DESIGN_ISSUE
    const evidenceTypes = this.detectEvidenceTypes(evidence);
    return {
      type: FailureType.DESIGN_ISSUE,
      confidence: this.calculateConfidence(evidence, FailureType.DESIGN_ISSUE),
      evidenceTypes,
      recommendedAction: "escalate",
      explanation: "Potential design issue detected. Escalation may be required.",
    };
  }

  /**
   * Check if we have enough evidence for DESIGN_ISSUE escalation.
   * Per CTO P0-6: Need ≥2 evidence types.
   */
  hasDesignIssueEvidence(failures: FailureEvidence[]): boolean {
    const evidenceTypes = new Set<EvidenceType>();

    for (const failure of failures) {
      // Check for repeated failure pattern
      if (failure.attempts >= 3) {
        evidenceTypes.add("repeated_failure");
      }

      // Check for spec mismatch
      if (/spec.*mismatch/i.test(failure.message)) {
        evidenceTypes.add("spec_mismatch");
      }

      // Check for breaking change
      if (/breaking.*change/i.test(failure.message)) {
        evidenceTypes.add("breaking_change");
      }

      // Check for cross-module issues
      if (
        /cross.*module/i.test(failure.message) ||
        (failure.relatedFiles && failure.relatedFiles.length >= 3)
      ) {
        evidenceTypes.add("cross_module_ripple");
      }

      // Check for type system conflicts
      if (/type.*system|incompatible.*types/i.test(failure.message)) {
        evidenceTypes.add("type_system_conflict");
      }

      // Check for integration failure
      if (/integration.*fail/i.test(failure.message)) {
        evidenceTypes.add("integration_failure");
      }

      // Check for performance regression
      if (/performance.*regression|too.*slow/i.test(failure.message)) {
        evidenceTypes.add("performance_regression");
      }
    }

    const hasEnoughEvidence =
      evidenceTypes.size >= this.config.minDesignIssueEvidence;

    if (this.config.debug) {
      this.log.debug("Design issue evidence check", {
        evidenceTypes: Array.from(evidenceTypes),
        count: evidenceTypes.size,
        required: this.config.minDesignIssueEvidence,
        hasEnough: hasEnoughEvidence,
      });
    }

    return hasEnoughEvidence;
  }

  /**
   * Get evidence types from multiple failures.
   */
  getEvidenceTypes(failures: FailureEvidence[]): EvidenceType[] {
    const evidenceTypes = new Set<EvidenceType>();

    for (const failure of failures) {
      const types = this.detectEvidenceTypes(failure);
      types.forEach((t) => evidenceTypes.add(t));
    }

    return Array.from(evidenceTypes);
  }

  // ============================================================================
  // Pattern Matching
  // ============================================================================

  /**
   * Check if error is transient.
   */
  isTransient(evidence: FailureEvidence): boolean {
    return this.transientPatterns.some((pattern) =>
      pattern.test(evidence.message)
    );
  }

  /**
   * Check if error is fixable.
   */
  isFixable(evidence: FailureEvidence): boolean {
    return this.fixablePatterns.some((pattern) =>
      pattern.test(evidence.message)
    );
  }

  /**
   * Check if error indicates design issue.
   */
  isDesignIssue(evidence: FailureEvidence): boolean {
    return this.designIssuePatterns.some((pattern) =>
      pattern.test(evidence.message)
    );
  }

  // ============================================================================
  // Evidence Gathering
  // ============================================================================

  /**
   * Gather evidence from error and context.
   */
  gatherEvidence(
    error: Error,
    context: Record<string, unknown> = {}
  ): FailureEvidence {
    const evidence: FailureEvidence = {
      type: error.name,
      message: error.message,
      attempts: (context.attempts as number) ?? 1,
      timestamp: new Date().toISOString(),
      context,
    };
    if (error.stack) evidence.stackTrace = error.stack;
    if (context.sourceFile) evidence.sourceFile = context.sourceFile as string;
    if (context.relatedFiles) evidence.relatedFiles = context.relatedFiles as string[];
    return evidence;
  }

  /**
   * Detect evidence types from a single failure.
   */
  private detectEvidenceTypes(evidence: FailureEvidence): EvidenceType[] {
    const types: EvidenceType[] = [];

    if (evidence.attempts >= 3) {
      types.push("repeated_failure");
    }

    if (/spec.*mismatch/i.test(evidence.message)) {
      types.push("spec_mismatch");
    }

    if (/breaking.*change/i.test(evidence.message)) {
      types.push("breaking_change");
    }

    if (
      /cross.*module/i.test(evidence.message) ||
      (evidence.relatedFiles && evidence.relatedFiles.length >= 3)
    ) {
      types.push("cross_module_ripple");
    }

    if (/type.*system|incompatible.*types/i.test(evidence.message)) {
      types.push("type_system_conflict");
    }

    if (/integration.*fail/i.test(evidence.message)) {
      types.push("integration_failure");
    }

    if (/performance.*regression|too.*slow/i.test(evidence.message)) {
      types.push("performance_regression");
    }

    return types;
  }

  /**
   * Calculate confidence score.
   */
  private calculateConfidence(
    evidence: FailureEvidence,
    type: FailureType
  ): number {
    let confidence = 0.5;

    switch (type) {
      case FailureType.TRANSIENT:
        // Higher confidence for clear network errors
        if (/ECONNREFUSED|ETIMEDOUT|429/i.test(evidence.message)) {
          confidence = 0.95;
        } else if (/network|timeout|rate.*limit/i.test(evidence.message)) {
          confidence = 0.85;
        }
        break;

      case FailureType.FIXABLE:
        // Higher confidence for clear type/lint errors
        if (/TS\d{4}:|eslint|jest/i.test(evidence.message)) {
          confidence = 0.9;
        } else if (/type.*error|lint|test.*fail/i.test(evidence.message)) {
          confidence = 0.8;
        }
        break;

      case FailureType.DESIGN_ISSUE:
        // Confidence based on evidence count
        const evidenceCount = this.detectEvidenceTypes(evidence).length;
        confidence = Math.min(0.5 + evidenceCount * 0.2, 0.95);
        break;
    }

    // Lower confidence for repeated failures that haven't been fixed
    if (evidence.attempts >= 3) {
      confidence *= 0.9;
    }

    return confidence;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let defaultClassifier: FailureClassifier | null = null;

/**
 * Get the default failure classifier.
 */
export function getFailureClassifier(): FailureClassifier {
  if (!defaultClassifier) {
    defaultClassifier = new FailureClassifier();
  }
  return defaultClassifier;
}

/**
 * Reset the default failure classifier (for testing).
 */
export function resetFailureClassifier(): void {
  defaultClassifier = null;
}

/**
 * Create a new failure classifier.
 */
export function createFailureClassifier(
  config?: FailureClassifierConfig
): FailureClassifier {
  return new FailureClassifier(config);
}
