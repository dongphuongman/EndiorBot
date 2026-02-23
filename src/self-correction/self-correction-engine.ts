/**
 * Self-Correction Engine Orchestrator
 *
 * Orchestrates the self-correction loop:
 * 1. Classify errors from verification output
 * 2. Attempt deterministic fixes (up to 3 strikes)
 * 3. Verify each fix
 * 4. Log all attempts
 * 5. Escalate after 3 failures
 *
 * Per Sprint 37 Day 2 requirements:
 * - Integration with ErrorClassifier, DeterministicFixer, FixLogger, Verifier
 * - Integration with BudgetTracker (cost tracking)
 * - Integration with EscalationRouter (3-strike escalation)
 *
 * @module src/self-correction/self-correction-engine
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 2
 * @authority ADR-007 Budget Control, Phase 3
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type {
  ErrorCategory,
  ClassifiedError,
  FixAttempt,
  CorrectionResult,
  SelfCorrectionConfig,
  EscalationInfo,
  SelfCorrectionStats,
  TestError,
} from "./types.js";
import { DEFAULT_SELF_CORRECTION_CONFIG } from "./types.js";
import { ErrorClassifier } from "./error-classifier.js";
import { DeterministicFixer } from "./deterministic-fixer.js";
import { FixLogger } from "./fix-logger.js";
import { Verifier } from "./verifier.js";
import type { AIAssistedFixer } from "./ai-assisted-fixer.js";
import type { BudgetTracker } from "../budget/budget-tracker.js";
import type { EscalationRouter } from "../budget/escalation-router.js";

// ============================================================================
// Constants - CTO Day 2 Requirements
// ============================================================================

/**
 * Verification costs per category (in USD).
 * Per CTO Day 2: Track cost of each VERIFICATION run.
 *
 * Note: EXPERIMENTAL fixes count DOUBLE (CTO Day 3-4 #3).
 */
export const VERIFICATION_COSTS: Record<ErrorCategory, number> = {
  BUILD: 0.10, // Running tsc build
  LINT: 0.05, // Running eslint
  TYPE: 0.10, // Running tsc --noEmit
  TEST: 0.30, // Running vitest
};

// ============================================================================
// Types
// ============================================================================

/**
 * Listener for correction events.
 */
export type CorrectionEventListener = (event: CorrectionEvent) => void;

/**
 * Correction event.
 */
export interface CorrectionEvent {
  type: "fix_attempt" | "fix_success" | "fix_failed" | "escalation" | "complete";
  timestamp: Date;
  data: {
    error?: ClassifiedError;
    attempt?: FixAttempt;
    result?: CorrectionResult;
    escalation?: EscalationInfo;
  };
}

// ============================================================================
// SelfCorrectionEngine
// ============================================================================

/**
 * SelfCorrectionEngine - Orchestrates the self-correction loop.
 *
 * Features:
 * - Automatic error detection and classification
 * - Deterministic fix application with retry
 * - Verification after each fix
 * - 3-strike escalation system
 * - Budget tracking integration
 * - Comprehensive logging
 */
export class SelfCorrectionEngine {
  private classifier: ErrorClassifier;
  private fixer: DeterministicFixer;
  private logger: FixLogger;
  private verifier: Verifier;
  private config: SelfCorrectionConfig;
  private budgetTracker: BudgetTracker | null = null;
  private escalationRouter: EscalationRouter | null = null;
  private aiAssistedFixer: AIAssistedFixer | null = null;
  private listeners: CorrectionEventListener[] = [];
  private escalations: EscalationInfo[] = [];

  constructor(config: Partial<SelfCorrectionConfig> = {}) {
    this.config = { ...DEFAULT_SELF_CORRECTION_CONFIG, ...config };
    this.classifier = new ErrorClassifier();
    this.fixer = new DeterministicFixer();
    this.logger = new FixLogger({
      logPath: `${this.config.workingDirectory}/fix-log.json`,
    });
    this.verifier = new Verifier({ cwd: this.config.workingDirectory });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Main self-correction loop.
   *
   * @param verificationOutput - Output from build/test/lint command
   * @param category - Error category to focus on (optional, auto-detect if not provided)
   * @returns Correction result
   */
  async correct(
    verificationOutput: string,
    category?: ErrorCategory
  ): Promise<CorrectionResult> {
    const startTime = Date.now();
    const attempts: FixAttempt[] = [];

    // Initialize category stats
    const categoryStats: CorrectionResult["byCategory"] = {
      BUILD: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
      LINT: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
      TYPE: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
      TEST: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
    };

    try {
      // Step 1: Classify errors
      const errors = this.classifier.parseOutput(verificationOutput, category);

      if (errors.length === 0) {
        return this.createSuccessResult(startTime, categoryStats);
      }

      // Update category stats
      for (const error of errors) {
        categoryStats[error.category].total++;
        categoryStats[error.category].remaining++;
      }

      // Step 2: Process each error
      for (const error of errors) {
        const errorAttempts = await this.processError(error, categoryStats);
        attempts.push(...errorAttempts);
      }

      // Calculate results
      const totalErrors = errors.length;
      const fixedErrors = Object.values(categoryStats).reduce(
        (sum, cat) => sum + cat.fixed,
        0
      );
      const remainingErrors = totalErrors - fixedErrors;
      const escalatedCount = Object.values(categoryStats).reduce(
        (sum, cat) => sum + cat.escalated,
        0
      );

      const successRate = totalErrors > 0 ? fixedErrors / totalErrors : 1;
      const targetRate = category
        ? this.config.targetRates[category]
        : this.calculateAverageTargetRate(errors);

      const result: CorrectionResult = {
        success: remainingErrors === 0,
        totalErrors,
        fixedErrors,
        remainingErrors,
        attempts,
        duration: Date.now() - startTime,
        escalated: escalatedCount > 0,
        successRate,
        targetRate,
        metTarget: successRate >= targetRate,
        byCategory: categoryStats,
      };

      // Emit complete event
      this.emitEvent({
        type: "complete",
        timestamp: new Date(),
        data: { result },
      });

      return result;
    } catch {
      // Return error result
      return {
        success: false,
        totalErrors: 0,
        fixedErrors: 0,
        remainingErrors: 0,
        attempts,
        duration: Date.now() - startTime,
        escalated: false,
        successRate: 0,
        targetRate: 0,
        metTarget: false,
        byCategory: categoryStats,
      };
    }
  }

  /**
   * Fix a single file with detected errors.
   */
  async fixFile(filePath: string, category?: ErrorCategory): Promise<CorrectionResult> {
    // Read file content
    if (!existsSync(filePath)) {
      return this.createErrorResult(`File not found: ${filePath}`);
    }

    // Run verification to get errors
    const verifyResult = await this.verifier.verifyTypeScript(filePath, []);
    return this.correct(verifyResult.output, category);
  }

  /**
   * Set budget tracker for cost tracking.
   */
  setBudgetTracker(tracker: BudgetTracker): void {
    this.budgetTracker = tracker;
    // Share budget tracker with AI fixer if available
    if (this.aiAssistedFixer) {
      this.aiAssistedFixer.setBudgetTracker(tracker);
    }
  }

  /**
   * Set escalation router for 3-strike escalation.
   */
  setEscalationRouter(router: EscalationRouter): void {
    this.escalationRouter = router;
  }

  /**
   * Set AI-assisted fixer for TEST category (EXPERIMENTAL).
   * Per Sprint 37 Day 3-4: AI-assisted fixes for TEST failures.
   */
  setAIAssistedFixer(fixer: AIAssistedFixer): void {
    this.aiAssistedFixer = fixer;
    // Share budget tracker with AI fixer
    if (this.budgetTracker) {
      fixer.setBudgetTracker(this.budgetTracker);
    }
  }

  /**
   * Subscribe to correction events.
   */
  onEvent(listener: CorrectionEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get escalation history.
   */
  getEscalations(): EscalationInfo[] {
    return [...this.escalations];
  }

  /**
   * Get fix statistics from logger.
   */
  getStats(): SelfCorrectionStats {
    return this.logger.getStats();
  }

  /**
   * Get success rate analysis from logger.
   */
  getSuccessRateAnalysis(): {
    overall: number;
    byCategory: Record<ErrorCategory, number>;
    vsTargets: Record<ErrorCategory, { actual: number; target: number; met: boolean }>;
  } {
    return this.logger.getSuccessRateAnalysis();
  }

  /**
   * Export fix log to CSV.
   */
  exportLog(): string {
    return this.logger.exportCsv();
  }

  /**
   * Get configuration.
   */
  getConfig(): SelfCorrectionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<SelfCorrectionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset engine state (strikes, history).
   */
  reset(): void {
    this.fixer.resetStrikes();
    this.logger.clear();
    this.escalations = [];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Process a single error with retry logic.
   */
  private async processError(
    error: ClassifiedError,
    categoryStats: CorrectionResult["byCategory"]
  ): Promise<FixAttempt[]> {
    const attempts: FixAttempt[] = [];
    let attemptCount = 0;
    let fixed = false;

    // Check if already escalated
    if (this.fixer.isEscalated(error)) {
      categoryStats[error.category].escalated++;
      return attempts;
    }

    // Retry loop
    while (attemptCount < this.config.maxAttempts && !fixed) {
      attemptCount++;

      // Read current file content
      const fileContent = this.readFile(error.filePath);
      if (fileContent === null) {
        break; // File not found, skip
      }

      // Propose fix
      let proposedFix = this.fixer.proposeFix(error, fileContent);

      // Sprint 37 Day 3-4: Try AI-assisted fixer for TEST category
      if (!proposedFix && error.category === "TEST" && this.aiAssistedFixer) {
        proposedFix = await this.aiAssistedFixer.proposeFix(
          error as TestError,
          fileContent
        );
      }

      if (!proposedFix) {
        // No fix available, escalate
        await this.escalateError(error, attempts, "No fix available");
        categoryStats[error.category].escalated++;
        break;
      }

      // Apply fix - use AI fixer for experimental fixes
      const fixResult =
        proposedFix.confidence === "experimental" && this.aiAssistedFixer
          ? this.aiAssistedFixer.applyFix(proposedFix, fileContent)
          : this.fixer.applyFix(proposedFix, fileContent);

      // Write file if successful (and not dry-run)
      if (fixResult.status === "success" && !this.config.dryRun) {
        const newContent = fileContent.replace(
          proposedFix.originalCode,
          proposedFix.fixedCode
        );
        this.writeFile(error.filePath, newContent);
      }

      // Create attempt record
      const attempt: FixAttempt = {
        error,
        fixResult,
        attemptNumber: attemptCount,
        timestamp: new Date(),
      };

      // Emit event
      this.emitEvent({
        type: "fix_attempt",
        timestamp: new Date(),
        data: { error, attempt },
      });

      // Track budget
      await this.trackBudget(error);

      // Log fix attempt
      if (this.config.logFixes) {
        this.logger.logFix(fixResult);
      }

      // Verify fix
      if (this.config.verifyAfterFix && fixResult.status === "success") {
        // CTO Day 3-4 #3: EXPERIMENTAL fixes require FULL verification
        // Not quick verify - run the entire test suite
        const isExperimental = proposedFix.confidence === "experimental";

        // CTO Day 2 #1: Loop Prevention - pass current error count
        const verification = await this.verifyFix(error, 1, isExperimental);
        attempt.verification = {
          success: verification.success,
          output: verification.output,
          remainingErrors: verification.remainingErrors,
        };

        // CTO Day 2 #1: If fix introduced NEW errors, count as failed
        if (verification.introducedNewErrors) {
          // Fix made things worse - count as failed attempt
          this.emitEvent({
            type: "fix_failed",
            timestamp: new Date(),
            data: { error, attempt },
          });
          // Continue to next attempt
        } else if (verification.success) {
          fixed = true;
          categoryStats[error.category].fixed++;
          categoryStats[error.category].remaining--;

          this.emitEvent({
            type: "fix_success",
            timestamp: new Date(),
            data: { error, attempt },
          });
        }
      } else if (fixResult.status === "success") {
        // Assume fixed if verification disabled
        fixed = true;
        categoryStats[error.category].fixed++;
        categoryStats[error.category].remaining--;

        this.emitEvent({
          type: "fix_success",
          timestamp: new Date(),
          data: { error, attempt },
        });
      } else {
        this.emitEvent({
          type: "fix_failed",
          timestamp: new Date(),
          data: { error, attempt },
        });
      }

      attempts.push(attempt);
    }

    // Escalate after max failures
    if (!fixed && attemptCount >= this.config.maxAttempts) {
      await this.escalateError(
        error,
        attempts,
        `Failed after ${attemptCount} attempts`
      );
      categoryStats[error.category].escalated++;
    }

    return attempts;
  }

  /**
   * Verify a fix was successful.
   *
   * Per CTO Day 2 Requirements:
   * 1. Loop Prevention: Check if errorsAfterFix.length > errorsBeforeFix.length
   * 2. Verification Cost Tracking: Record cost after each verify
   *
   * Per CTO Day 3-4 Constraint #3:
   * - EXPERIMENTAL fixes require FULL test suite verification (double cost)
   */
  private async verifyFix(
    error: ClassifiedError,
    errorsBeforeCount: number = 1,
    isExperimental: boolean = false
  ): Promise<{
    success: boolean;
    output: string;
    remainingErrors: number;
    introducedNewErrors: boolean;
  }> {
    try {
      const result = await this.verifier.verifyFix(
        {
          fix: {
            id: "verify",
            error,
            type: "fix_lint_rule",
            confidence: "high",
            description: "Verification",
            filePath: error.filePath,
            line: error.line,
            originalCode: "",
            fixedCode: "",
            isMultiLine: false,
          },
          status: "success",
          duration: 0,
          verified: false,
          strikes: 0,
        },
        [error]
      );

      // CTO Day 2 #2: Track verification cost
      // CTO Day 3-4 #3: EXPERIMENTAL fixes count DOUBLE for verification
      await this.trackVerificationCost(error.category, isExperimental);

      // CTO Day 2 #1: Loop Prevention
      // Check if fix introduced NEW errors
      const errorsAfterCount =
        result.remainingErrors.length + result.newErrors.length;
      const introducedNewErrors = errorsAfterCount > errorsBeforeCount;

      // If new errors were introduced, the fix failed
      const success = result.success && !introducedNewErrors;

      return {
        success,
        output: result.output,
        remainingErrors: result.remainingErrors.length,
        introducedNewErrors,
      };
    } catch {
      return {
        success: false,
        output: "Verification failed",
        remainingErrors: 1,
        introducedNewErrors: false,
      };
    }
  }

  /**
   * Track verification cost in budget.
   * Per CTO Day 2: Track cost of each VERIFICATION run.
   * Per CTO Day 3-4 #3: EXPERIMENTAL fixes count DOUBLE for verification.
   */
  private async trackVerificationCost(
    category: ErrorCategory,
    isExperimental: boolean = false
  ): Promise<void> {
    if (!this.budgetTracker) return;

    try {
      // CTO Day 3-4 #3: EXPERIMENTAL fixes count DOUBLE
      const costMultiplier = isExperimental ? 2 : 1;
      const cost = VERIFICATION_COSTS[category] * costMultiplier;

      await this.budgetTracker.recordUsage({
        timestamp: new Date(),
        model: isExperimental
          ? `${category.toLowerCase()}_verify_experimental`
          : `${category.toLowerCase()}_verify`,
        provider: "verification",
        inputTokens: 0,
        outputTokens: 0,
        cost,
      });
    } catch {
      // Ignore verification cost tracking errors
    }
  }

  /**
   * Escalate an error after 3 failed attempts.
   */
  private async escalateError(
    error: ClassifiedError,
    attempts: FixAttempt[],
    reason: string
  ): Promise<void> {
    const escalation: EscalationInfo = {
      error,
      attempts,
      reason,
      timestamp: new Date(),
    };

    this.escalations.push(escalation);

    this.emitEvent({
      type: "escalation",
      timestamp: new Date(),
      data: { error, escalation },
    });

    // Route through escalation router if available
    if (this.escalationRouter && this.config.escalateOnFailure) {
      try {
        await this.escalationRouter.route({
          type: "bug_fix",
          description: `Self-correction failed: ${error.message}`,
          metadata: {
            errorCategory: error.category,
            errorCode: error.code,
            filePath: error.filePath,
            line: error.line,
            attempts: attempts.length,
            reason,
          },
        });
      } catch {
        // Ignore escalation errors
      }
    }
  }

  /**
   * Track budget for fix attempt.
   */
  private async trackBudget(_error: ClassifiedError): Promise<void> {
    if (!this.budgetTracker) return;

    try {
      await this.budgetTracker.recordUsage({
        timestamp: new Date(),
        model: "deterministic-fixer",
        provider: "self-correction",
        inputTokens: 0,
        outputTokens: 0,
        cost: 0.001, // Nominal cost for tracking
      });
    } catch {
      // Ignore budget tracking errors
    }
  }

  /**
   * Read file content.
   */
  private readFile(filePath: string): string | null {
    try {
      const fullPath = filePath.startsWith("/")
        ? filePath
        : `${this.config.workingDirectory}/${filePath}`;
      return readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Write file content.
   */
  private writeFile(filePath: string, content: string): boolean {
    if (this.config.dryRun) return true;

    try {
      const fullPath = filePath.startsWith("/")
        ? filePath
        : `${this.config.workingDirectory}/${filePath}`;
      writeFileSync(fullPath, content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Emit event to listeners.
   */
  private emitEvent(event: CorrectionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Calculate average target rate for mixed errors.
   */
  private calculateAverageTargetRate(errors: ClassifiedError[]): number {
    if (errors.length === 0) return 1;

    const categoryCounts: Record<ErrorCategory, number> = {
      BUILD: 0,
      LINT: 0,
      TYPE: 0,
      TEST: 0,
    };

    for (const error of errors) {
      categoryCounts[error.category]++;
    }

    let weightedSum = 0;
    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count > 0) {
        weightedSum +=
          this.config.targetRates[category as ErrorCategory] * count;
      }
    }

    return weightedSum / errors.length;
  }

  /**
   * Create success result (no errors).
   */
  private createSuccessResult(
    startTime: number,
    categoryStats: CorrectionResult["byCategory"]
  ): CorrectionResult {
    return {
      success: true,
      totalErrors: 0,
      fixedErrors: 0,
      remainingErrors: 0,
      attempts: [],
      duration: Date.now() - startTime,
      escalated: false,
      successRate: 1,
      targetRate: 1,
      metTarget: true,
      byCategory: categoryStats,
    };
  }

  /**
   * Create error result.
   */
  private createErrorResult(_message: string): CorrectionResult {
    return {
      success: false,
      totalErrors: 0,
      fixedErrors: 0,
      remainingErrors: 0,
      attempts: [],
      duration: 0,
      escalated: false,
      successRate: 0,
      targetRate: 0,
      metTarget: false,
      byCategory: {
        BUILD: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
        LINT: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
        TYPE: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
        TEST: { total: 0, fixed: 0, remaining: 0, escalated: 0 },
      },
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a self-correction engine instance.
 */
export function createSelfCorrectionEngine(
  config?: Partial<SelfCorrectionConfig>
): SelfCorrectionEngine {
  return new SelfCorrectionEngine(config);
}

/**
 * Quick correction helper.
 */
export async function correctErrors(
  verificationOutput: string,
  category?: ErrorCategory
): Promise<CorrectionResult> {
  const engine = createSelfCorrectionEngine();
  return engine.correct(verificationOutput, category);
}

/**
 * Quick file fix helper.
 */
export async function fixFileErrors(
  filePath: string,
  category?: ErrorCategory
): Promise<CorrectionResult> {
  const engine = createSelfCorrectionEngine();
  return engine.fixFile(filePath, category);
}
