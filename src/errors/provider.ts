/**
 * Provider Error Types
 *
 * Errors related to AI model providers (Anthropic, OpenAI, GitHub Models, etc.)
 *
 * @module errors/provider
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError, type ErrorSeverity } from "./base.js";

// ============================================================================
// Provider Error Codes
// ============================================================================

/**
 * Provider-specific error codes.
 */
export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_INVALID_RESPONSE"
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_CONTEXT_TOO_LONG"
  | "PROVIDER_CONTENT_FILTERED"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_SERVICE_ERROR"
  | "PROVIDER_NETWORK_ERROR"
  | "PROVIDER_UNKNOWN";

// ============================================================================
// Provider Error Class
// ============================================================================

/**
 * Error from AI model providers.
 */
export class ProviderError extends EndiorBotError {
  /** Provider that generated the error */
  public readonly providerId: string;

  /** Provider-specific error code */
  public readonly providerCode: ProviderErrorCode;

  /** HTTP status code if applicable */
  public readonly statusCode?: number;

  /** Model that was being used */
  public readonly model?: string;

  constructor(
    message: string,
    options: {
      providerId: string;
      code: ProviderErrorCode;
      retryable?: boolean;
      statusCode?: number;
      model?: string;
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    const retryable = options.retryable ?? getDefaultRetryable(options.code);
    const severity = getSeverity(options.code);

    const metadata: Record<string, unknown> = {
      providerId: options.providerId,
      ...options.metadata,
    };
    if (options.statusCode !== undefined) {
      metadata.statusCode = options.statusCode;
    }
    if (options.model !== undefined) {
      metadata.model = options.model;
    }

    super(message, {
      code: options.code,
      category: "PROVIDER",
      retryable,
      severity,
      metadata,
      ...(options.cause ? { cause: options.cause } : {}),
    });

    this.name = "ProviderError";
    this.providerId = options.providerId;
    this.providerCode = options.code;
    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
    if (options.model !== undefined) {
      this.model = options.model;
    }
  }

  /**
   * Check if this is a rate limit error.
   */
  isRateLimited(): boolean {
    return this.providerCode === "PROVIDER_RATE_LIMITED";
  }

  /**
   * Check if this is an auth error.
   */
  isAuthError(): boolean {
    return this.providerCode === "PROVIDER_AUTH_FAILED";
  }

  /**
   * Check if this is a timeout error.
   */
  isTimeout(): boolean {
    return this.providerCode === "PROVIDER_TIMEOUT";
  }

  /**
   * Get retry delay suggestion in milliseconds.
   */
  getRetryDelay(): number {
    if (this.providerCode === "PROVIDER_RATE_LIMITED") {
      // Rate limited: wait longer
      return 60000; // 1 minute
    }
    if (this.providerCode === "PROVIDER_TIMEOUT") {
      return 5000; // 5 seconds
    }
    if (this.providerCode === "PROVIDER_SERVICE_ERROR") {
      return 10000; // 10 seconds
    }
    return 1000; // 1 second default
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get default retryable status based on error code.
 */
function getDefaultRetryable(code: ProviderErrorCode): boolean {
  switch (code) {
    case "PROVIDER_RATE_LIMITED":
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_SERVICE_ERROR":
    case "PROVIDER_NETWORK_ERROR":
    case "PROVIDER_UNAVAILABLE":
      return true;
    case "PROVIDER_AUTH_FAILED":
    case "PROVIDER_MODEL_NOT_FOUND":
    case "PROVIDER_CONTENT_FILTERED":
    case "PROVIDER_QUOTA_EXCEEDED":
    case "PROVIDER_INVALID_RESPONSE":
    case "PROVIDER_CONTEXT_TOO_LONG":
    case "PROVIDER_UNKNOWN":
      return false;
    default:
      return false;
  }
}

/**
 * Get severity based on error code.
 */
function getSeverity(code: ProviderErrorCode): ErrorSeverity {
  switch (code) {
    case "PROVIDER_AUTH_FAILED":
    case "PROVIDER_QUOTA_EXCEEDED":
      return "critical";
    case "PROVIDER_RATE_LIMITED":
    case "PROVIDER_TIMEOUT":
      return "warning";
    default:
      return "error";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a rate limit error.
 */
export function rateLimitError(
  providerId: string,
  options?: { retryAfter?: number; model?: string }
): ProviderError {
  const errOptions: {
    providerId: string;
    code: ProviderErrorCode;
    retryable: boolean;
    model?: string;
    metadata?: Record<string, unknown>;
  } = {
    providerId,
    code: "PROVIDER_RATE_LIMITED",
    retryable: true,
  };
  if (options?.model !== undefined) {
    errOptions.model = options.model;
  }
  if (options?.retryAfter !== undefined) {
    errOptions.metadata = { retryAfter: options.retryAfter };
  }
  return new ProviderError(
    `Rate limited by ${providerId}${options?.retryAfter ? ` (retry after ${options.retryAfter}s)` : ""}`,
    errOptions
  );
}

/**
 * Create an auth error.
 */
export function authError(
  providerId: string,
  message?: string
): ProviderError {
  return new ProviderError(
    message ?? `Authentication failed for ${providerId}`,
    {
      providerId,
      code: "PROVIDER_AUTH_FAILED",
      retryable: false,
    }
  );
}

/**
 * Create a timeout error.
 */
export function timeoutError(
  providerId: string,
  timeoutMs: number,
  model?: string
): ProviderError {
  const options: {
    providerId: string;
    code: ProviderErrorCode;
    retryable: boolean;
    model?: string;
    metadata: Record<string, unknown>;
  } = {
    providerId,
    code: "PROVIDER_TIMEOUT",
    retryable: true,
    metadata: { timeoutMs },
  };
  if (model !== undefined) {
    options.model = model;
  }
  return new ProviderError(
    `Request to ${providerId} timed out after ${timeoutMs}ms`,
    options
  );
}

/**
 * Create a context too long error.
 */
export function contextTooLongError(
  providerId: string,
  tokenCount: number,
  maxTokens: number,
  model?: string
): ProviderError {
  const options: {
    providerId: string;
    code: ProviderErrorCode;
    retryable: boolean;
    model?: string;
    metadata: Record<string, unknown>;
  } = {
    providerId,
    code: "PROVIDER_CONTEXT_TOO_LONG",
    retryable: false,
    metadata: { tokenCount, maxTokens },
  };
  if (model !== undefined) {
    options.model = model;
  }
  return new ProviderError(
    `Context too long for ${providerId}: ${tokenCount} tokens exceeds limit of ${maxTokens}`,
    options
  );
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a ProviderError.
 */
export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
