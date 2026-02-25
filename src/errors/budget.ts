/**
 * Budget Error Types
 *
 * Errors related to token budget management and cost tracking.
 *
 * @module errors/budget
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError } from "./base.js";

// ============================================================================
// Budget Error Codes
// ============================================================================

/**
 * Budget-specific error codes.
 */
export type BudgetErrorCode =
  | "BUDGET_EXCEEDED"
  | "BUDGET_THRESHOLD_WARNING"
  | "BUDGET_NOT_INITIALIZED"
  | "BUDGET_INVALID_LIMIT"
  | "BUDGET_TRACKING_ERROR"
  | "BUDGET_APPROVAL_REQUIRED"
  | "BUDGET_APPROVAL_DENIED"
  | "BUDGET_RESET_FAILED";

// ============================================================================
// Budget Error Class
// ============================================================================

/**
 * Error from budget management.
 */
export class BudgetError extends EndiorBotError {
  /** Budget error code */
  public readonly budgetCode: BudgetErrorCode;

  /** Current token count */
  public readonly currentTokens?: number;

  /** Token limit */
  public readonly limit?: number;

  /** Percentage used */
  public readonly percentUsed?: number;

  /** Session ID */
  public readonly sessionId?: string;

  constructor(
    message: string,
    options: {
      code: BudgetErrorCode;
      currentTokens?: number;
      limit?: number;
      sessionId?: string;
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    const percentUsed =
      options.currentTokens !== undefined && options.limit !== undefined
        ? Math.round((options.currentTokens / options.limit) * 100)
        : undefined;

    const metadata: Record<string, unknown> = { ...options.metadata };
    if (options.currentTokens !== undefined) {
      metadata.currentTokens = options.currentTokens;
    }
    if (options.limit !== undefined) {
      metadata.limit = options.limit;
    }
    if (percentUsed !== undefined) {
      metadata.percentUsed = percentUsed;
    }
    if (options.sessionId !== undefined) {
      metadata.sessionId = options.sessionId;
    }

    super(message, {
      code: options.code,
      category: "BUDGET",
      retryable: options.code === "BUDGET_APPROVAL_REQUIRED",
      severity: getSeverity(options.code),
      metadata,
      ...(options.cause ? { cause: options.cause } : {}),
    });

    this.name = "BudgetError";
    this.budgetCode = options.code;
    if (options.currentTokens !== undefined) {
      this.currentTokens = options.currentTokens;
    }
    if (options.limit !== undefined) {
      this.limit = options.limit;
    }
    if (percentUsed !== undefined) {
      this.percentUsed = percentUsed;
    }
    if (options.sessionId !== undefined) {
      this.sessionId = options.sessionId;
    }
  }

  /**
   * Check if approval can resolve this error.
   */
  requiresApproval(): boolean {
    return this.budgetCode === "BUDGET_APPROVAL_REQUIRED";
  }

  /**
   * Get remaining tokens.
   */
  getRemainingTokens(): number {
    if (this.currentTokens === undefined || this.limit === undefined) {
      return 0;
    }
    return Math.max(0, this.limit - this.currentTokens);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getSeverity(code: BudgetErrorCode): "critical" | "error" | "warning" {
  switch (code) {
    case "BUDGET_EXCEEDED":
    case "BUDGET_APPROVAL_DENIED":
      return "critical";
    case "BUDGET_THRESHOLD_WARNING":
      return "warning";
    default:
      return "error";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a budget exceeded error.
 */
export function budgetExceededError(
  currentTokens: number,
  limit: number,
  sessionId?: string
): BudgetError {
  const options: {
    code: BudgetErrorCode;
    currentTokens: number;
    limit: number;
    sessionId?: string;
  } = {
    code: "BUDGET_EXCEEDED",
    currentTokens,
    limit,
  };
  if (sessionId !== undefined) {
    options.sessionId = sessionId;
  }
  return new BudgetError(
    `Token budget exceeded: ${currentTokens.toLocaleString()} / ${limit.toLocaleString()} tokens`,
    options
  );
}

/**
 * Create a budget threshold warning.
 */
export function budgetThresholdWarning(
  currentTokens: number,
  limit: number,
  thresholdPercent: number
): BudgetError {
  const percentUsed = Math.round((currentTokens / limit) * 100);
  return new BudgetError(
    `Token budget at ${percentUsed}% (threshold: ${thresholdPercent}%)`,
    {
      code: "BUDGET_THRESHOLD_WARNING",
      currentTokens,
      limit,
      metadata: { thresholdPercent },
    }
  );
}

/**
 * Create an approval required error.
 */
export function approvalRequiredError(
  currentTokens: number,
  limit: number,
  sessionId?: string
): BudgetError {
  const options: {
    code: BudgetErrorCode;
    currentTokens: number;
    limit: number;
    sessionId?: string;
  } = {
    code: "BUDGET_APPROVAL_REQUIRED",
    currentTokens,
    limit,
  };
  if (sessionId !== undefined) {
    options.sessionId = sessionId;
  }
  return new BudgetError(
    "Token budget would be exceeded. Approval required to continue.",
    options
  );
}

/**
 * Create an approval denied error.
 */
export function approvalDeniedError(sessionId?: string): BudgetError {
  const options: {
    code: BudgetErrorCode;
    sessionId?: string;
  } = {
    code: "BUDGET_APPROVAL_DENIED",
  };
  if (sessionId !== undefined) {
    options.sessionId = sessionId;
  }
  return new BudgetError("Budget extension was denied", options);
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a BudgetError.
 */
export function isBudgetError(error: unknown): error is BudgetError {
  return error instanceof BudgetError;
}
