/**
 * Recovery Engine
 *
 * Handles failure recovery through retry, fix, and escalation strategies.
 *
 * @module sessions/recovery/engine
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @authority Master Plan v4.3, Sprint 69-71 T9.6
 * @sprint 69-71
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { getPatternsByType } from "../../brain/layers/patterns.js";
import type { PatternEntry } from "../../brain/types.js";
import {
  FailureClassifier,
  FailureType,
  type FailureEvidence,
  type ClassificationResult,
} from "../failure/index.js";
import { getLatestCheckpoint } from "../checkpoint/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Recovery action type.
 */
export type RecoveryAction =
  | "RETRY"
  | "FIX"
  | "ROLLBACK"
  | "ESCALATE"
  | "ABORT";

/**
 * Recovery result.
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  recovered: boolean;
  /** Action taken */
  action: RecoveryAction;
  /** Reason for action */
  reason: string;
  /** Next attempt number (if retry/fix) */
  nextAttempt?: number;
  /** Checkpoint rolled back to */
  rolledBackTo?: string;
  /** Escalation details */
  escalation?: EscalationDetails;
  /**
   * Sprint 143 A1: Brain L2 pattern hint for retry/fix prompts.
   * When a matching error pattern is found in Brain L2, the fixHint is
   * included so the retry prompt can reference prior solutions.
   * Caller injects this into the agent's context for the next attempt.
   */
  patternHint?: string;
}

/**
 * Escalation details.
 */
export interface EscalationDetails {
  /** Escalation type */
  type: "DESIGN_ISSUE" | "MAX_RETRIES" | "MAX_FIX_ATTEMPTS" | "CRITICAL_ERROR";
  /** Error that triggered escalation */
  error: Error;
  /** Evidence collected */
  evidence: FailureEvidence[];
  /** Suggested actions for human */
  suggestions: string[];
  /** Context for human review */
  context: Record<string, unknown>;
}

/**
 * Recovery engine configuration.
 */
export interface RecoveryEngineConfig {
  /** Project root directory */
  projectRoot: string;
  /** Max retry attempts for transient failures */
  maxRetries?: number;
  /** Max fix attempts for fixable failures */
  maxFixAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay?: number;
  /** Max delay for backoff (ms) */
  maxDelay?: number;
  /** Enable auto-rollback on max attempts */
  autoRollback?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Recovery context for a task.
 */
export interface RecoveryContext {
  /** Task ID */
  taskId: string;
  /** Current stage */
  stage?: string;
  /** Files involved */
  files?: string[];
  /** Custom context */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Recovery Engine
// ============================================================================

/**
 * Recovery Engine.
 *
 * Handles failure recovery through:
 * - Retry: For transient failures (network, rate limit)
 * - Fix Loop: For fixable failures (lint, type, test)
 * - Escalation: For design issues (with ≥2 evidence types)
 * - Rollback: When max attempts reached
 *
 * @example
 * ```typescript
 * const engine = new RecoveryEngine({
 *   projectRoot: '/path/to/project',
 * });
 *
 * try {
 *   await doWork();
 * } catch (error) {
 *   const result = await engine.handleFailure(error, { taskId: 'task-1' });
 *
 *   if (result.recovered && result.action === 'RETRY') {
 *     await sleep(result.nextAttempt! * 1000);
 *     await doWork();
 *   }
 * }
 * ```
 */
export class RecoveryEngine {
  private readonly log: Logger;
  private readonly config: Required<RecoveryEngineConfig>;
  private readonly classifier: FailureClassifier;

  /** Failure history per task */
  private failureHistory: Map<string, FailureEvidence[]> = new Map();

  constructor(config: RecoveryEngineConfig) {
    this.log = createLogger("RecoveryEngine");
    this.config = {
      maxRetries: 3,
      maxFixAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      autoRollback: true,
      debug: false,
      ...config,
    };

    this.classifier = new FailureClassifier({ debug: this.config.debug });
  }

  // ============================================================================
  // Sprint 143 A1: Brain L2 Pattern Matching
  // ============================================================================

  /**
   * Find a matching Brain L2 error pattern for the given error.
   * Returns the pattern's fixHint if match found and count ≥ 2 (conservative).
   *
   * CTO condition: similarity threshold must be conservative to avoid
   * false-positive pattern injection into retry prompts.
   *
   * Match strategy: substring match on error message against pattern signatures.
   * Only returns patterns seen ≥ 2 times (not one-off errors).
   */
  private findMatchingPattern(error: Error): PatternEntry | null {
    try {
      const errorPatterns = getPatternsByType("error");
      const errorMsg = error.message.toLowerCase();

      for (const pattern of errorPatterns) {
        // Conservative match: pattern signature must appear in error message
        // AND pattern must have been seen ≥ 2 times (not a one-off)
        if (pattern.count >= 2 && errorMsg.includes(pattern.signature.toLowerCase())) {
          this.log.info("Brain L2 pattern match found", {
            patternId: pattern.id,
            signature: pattern.signature,
            count: pattern.count,
            fixHint: pattern.fixHint,
          });
          return pattern;
        }
      }
    } catch {
      // Brain L2 read failure is non-fatal — continue without pattern
    }
    return null;
  }

  // ============================================================================
  // Main Recovery Handler
  // ============================================================================

  /**
   * Handle a failure and attempt recovery.
   */
  async handleFailure(
    error: Error,
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    // Record failure
    const evidence = this.classifier.gatherEvidence(error, {
      ...context,
      attempts: this.getAttempts(context.taskId) + 1,
    });
    this.recordFailure(context.taskId, evidence);

    // Classify failure
    const classification = this.classifier.classifyEvidence(evidence);

    this.log.info("Handling failure", {
      taskId: context.taskId,
      type: classification.type,
      attempts: this.getAttempts(context.taskId),
    });

    // Handle based on type
    switch (classification.type) {
      case FailureType.TRANSIENT:
        return this.handleTransient(error, context, classification);

      case FailureType.FIXABLE:
        return this.handleFixable(error, context, classification);

      case FailureType.DESIGN_ISSUE:
        return this.handleDesignIssue(error, context, classification);

      default:
        return this.escalate(error, context, "CRITICAL_ERROR");
    }
  }

  // ============================================================================
  // Recovery Strategies
  // ============================================================================

  /**
   * Handle transient failures (retry with exponential backoff).
   */
  private async handleTransient(
    error: Error,
    context: RecoveryContext,
    _classification: ClassificationResult
  ): Promise<RecoveryResult> {
    const attempts = this.getAttempts(context.taskId);

    if (attempts >= this.config.maxRetries) {
      this.log.warn("Max retries reached for transient failure", {
        taskId: context.taskId,
        attempts,
      });

      // Try rollback if enabled
      if (this.config.autoRollback) {
        return this.rollback(context.taskId, "Max retry attempts reached");
      }

      return this.escalate(error, context, "MAX_RETRIES");
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.baseDelay * Math.pow(2, attempts),
      this.config.maxDelay
    );

    // Sprint 143 A1: Check Brain L2 for matching error pattern
    const matchedPattern = this.findMatchingPattern(error);

    this.log.info("Scheduling retry after transient failure", {
      taskId: context.taskId,
      attempt: attempts + 1,
      delayMs: delay,
      brainL2Match: matchedPattern?.signature,
    });

    const result: RecoveryResult = {
      recovered: true,
      action: "RETRY",
      reason: `Transient failure, retry ${attempts + 1}/${this.config.maxRetries} after ${delay}ms`,
      nextAttempt: attempts + 1,
    };
    if (matchedPattern?.fixHint) {
      result.patternHint = `[Brain L2] Prior pattern "${matchedPattern.signature}" (seen ${matchedPattern.count}×): ${matchedPattern.fixHint}`;
    }
    return result;
  }

  /**
   * Handle fixable failures (fix loop).
   */
  private async handleFixable(
    error: Error,
    context: RecoveryContext,
    _classification: ClassificationResult
  ): Promise<RecoveryResult> {
    const attempts = this.getAttempts(context.taskId);

    if (attempts >= this.config.maxFixAttempts) {
      this.log.warn("Max fix attempts reached", {
        taskId: context.taskId,
        attempts,
      });

      // Check if this might be a design issue
      const failures = this.getFailures(context.taskId);
      if (this.classifier.hasDesignIssueEvidence(failures)) {
        return this.escalate(error, context, "DESIGN_ISSUE");
      }

      // Try rollback
      if (this.config.autoRollback) {
        return this.rollback(context.taskId, "Max fix attempts reached");
      }

      return this.escalate(error, context, "MAX_FIX_ATTEMPTS");
    }

    // Sprint 143 A1: Check Brain L2 for matching error pattern
    const matchedPattern = this.findMatchingPattern(error);

    this.log.info("Attempting fix", {
      taskId: context.taskId,
      attempt: attempts + 1,
      brainL2Match: matchedPattern?.signature,
    });

    const result: RecoveryResult = {
      recovered: true,
      action: "FIX",
      reason: `Fixable error, fix attempt ${attempts + 1}/${this.config.maxFixAttempts}`,
      nextAttempt: attempts + 1,
    };
    if (matchedPattern?.fixHint) {
      result.patternHint = `[Brain L2] Prior pattern "${matchedPattern.signature}" (seen ${matchedPattern.count}×): ${matchedPattern.fixHint}`;
    }
    return result;
  }

  /**
   * Handle design issues (require ≥2 evidence types per CTO P0-6).
   */
  private async handleDesignIssue(
    error: Error,
    context: RecoveryContext,
    _classification: ClassificationResult
  ): Promise<RecoveryResult> {
    const failures = this.getFailures(context.taskId);
    const hasEvidence = this.classifier.hasDesignIssueEvidence(failures);

    if (!hasEvidence) {
      // Not enough evidence yet, treat as fixable
      this.log.info("Not enough evidence for design issue, treating as fixable", {
        taskId: context.taskId,
        evidenceCount: this.classifier.getEvidenceTypes(failures).length,
      });

      return this.handleFixable(error, context, _classification);
    }

    // Enough evidence → escalate to human
    return this.escalate(error, context, "DESIGN_ISSUE");
  }

  // ============================================================================
  // Rollback
  // ============================================================================

  /**
   * Rollback to last checkpoint.
   */
  private async rollback(taskId: string, reason: string): Promise<RecoveryResult> {
    this.log.info("Rolling back to last checkpoint", {
      taskId,
      reason,
    });

    try {
      const checkpoint = await getLatestCheckpoint();
      if (!checkpoint) {
        return {
          recovered: false,
          action: "ABORT",
          reason: "No checkpoint available for rollback",
        };
      }

      // Clear failure history for task
      this.failureHistory.delete(taskId);

      return {
        recovered: false,
        action: "ROLLBACK",
        reason: `Rolled back to checkpoint: ${reason}`,
        rolledBackTo: checkpoint.meta.id,
      };
    } catch (error) {
      this.log.error("Rollback failed", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        recovered: false,
        action: "ABORT",
        reason: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================================================
  // Escalation
  // ============================================================================

  /**
   * Escalate to human.
   */
  private async escalate(
    error: Error,
    context: RecoveryContext,
    type: EscalationDetails["type"]
  ): Promise<RecoveryResult> {
    const failures = this.getFailures(context.taskId);
    const evidenceTypes = this.classifier.getEvidenceTypes(failures);

    this.log.warn("Escalating to human", {
      taskId: context.taskId,
      type,
      evidenceTypes,
    });

    const escalation: EscalationDetails = {
      type,
      error,
      evidence: failures,
      suggestions: this.generateSuggestions(type, failures),
      context: {
        taskId: context.taskId,
        stage: context.stage,
        files: context.files,
        evidenceTypes,
      },
    };

    // Clear failure history after escalation
    this.failureHistory.delete(context.taskId);

    return {
      recovered: false,
      action: "ESCALATE",
      reason: `Escalated: ${type} (${evidenceTypes.length} evidence types)`,
      escalation,
    };
  }

  /**
   * Generate suggestions for human.
   */
  private generateSuggestions(
    type: EscalationDetails["type"],
    failures: FailureEvidence[]
  ): string[] {
    const suggestions: string[] = [];

    switch (type) {
      case "DESIGN_ISSUE":
        suggestions.push("Review the spec and design documents");
        suggestions.push("Check for breaking changes in dependencies");
        suggestions.push("Consider architectural refactoring");
        break;

      case "MAX_RETRIES":
        suggestions.push("Check network connectivity");
        suggestions.push("Review API rate limits");
        suggestions.push("Verify external service availability");
        break;

      case "MAX_FIX_ATTEMPTS":
        suggestions.push("Review error messages carefully");
        suggestions.push("Check test assertions and expectations");
        suggestions.push("Consider manual intervention");
        break;

      case "CRITICAL_ERROR":
        suggestions.push("Review stack traces");
        suggestions.push("Check system logs");
        suggestions.push("Consider rollback to stable version");
        break;
    }

    // Add file-specific suggestions
    const files = new Set<string>();
    for (const failure of failures) {
      if (failure.sourceFile) files.add(failure.sourceFile);
      if (failure.relatedFiles) failure.relatedFiles.forEach((f) => files.add(f));
    }

    if (files.size > 0) {
      suggestions.push(`Review affected files: ${Array.from(files).join(", ")}`);
    }

    return suggestions;
  }

  // ============================================================================
  // Failure History
  // ============================================================================

  /**
   * Record a failure.
   */
  private recordFailure(taskId: string, evidence: FailureEvidence): void {
    const failures = this.failureHistory.get(taskId) ?? [];
    failures.push(evidence);
    this.failureHistory.set(taskId, failures);
  }

  /**
   * Get failure count for a task.
   */
  getAttempts(taskId: string): number {
    return this.failureHistory.get(taskId)?.length ?? 0;
  }

  /**
   * Get failures for a task.
   */
  getFailures(taskId: string): FailureEvidence[] {
    return this.failureHistory.get(taskId) ?? [];
  }

  /**
   * Clear failure history for a task.
   */
  clearHistory(taskId: string): void {
    this.failureHistory.delete(taskId);
  }

  /**
   * Clear all failure history.
   */
  clearAllHistory(): void {
    this.failureHistory.clear();
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Wait for specified delay (for retry backoff).
   */
  async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate backoff delay.
   */
  calculateBackoff(attempt: number): number {
    return Math.min(
      this.config.baseDelay * Math.pow(2, attempt),
      this.config.maxDelay
    );
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let defaultEngine: RecoveryEngine | null = null;

/**
 * Get the default recovery engine.
 */
export function getRecoveryEngine(): RecoveryEngine | null {
  return defaultEngine;
}

/**
 * Set the default recovery engine.
 */
export function setRecoveryEngine(engine: RecoveryEngine | null): void {
  defaultEngine = engine;
}

/**
 * Create a new recovery engine.
 */
export function createRecoveryEngine(
  config: RecoveryEngineConfig
): RecoveryEngine {
  const engine = new RecoveryEngine(config);
  defaultEngine = engine;
  return engine;
}

/**
 * Reset the recovery engine (for testing).
 */
export function resetRecoveryEngine(): void {
  defaultEngine = null;
}
