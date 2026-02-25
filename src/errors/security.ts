/**
 * Security Error Types
 *
 * Errors related to security violations and OTT channel protection.
 *
 * @module errors/security
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError } from "./base.js";

// ============================================================================
// Security Error Codes
// ============================================================================

/**
 * Security-specific error codes.
 */
export type SecurityErrorCode =
  | "SECURITY_INPUT_SANITIZED"
  | "SECURITY_OUTPUT_SCRUBBED"
  | "SECURITY_INJECTION_DETECTED"
  | "SECURITY_XSS_DETECTED"
  | "SECURITY_SQL_INJECTION_DETECTED"
  | "SECURITY_COMMAND_INJECTION_DETECTED"
  | "SECURITY_PATH_TRAVERSAL_DETECTED"
  | "SECURITY_RATE_LIMIT_EXCEEDED"
  | "SECURITY_CREDENTIAL_EXPOSED"
  | "SECURITY_UNAUTHORIZED"
  | "SECURITY_FORBIDDEN"
  | "SECURITY_TOKEN_INVALID"
  | "SECURITY_TOKEN_EXPIRED";

// ============================================================================
// Security Error Class
// ============================================================================

/**
 * Error from security violations.
 */
export class SecurityError extends EndiorBotError {
  /** Security error code */
  public readonly securityCode: SecurityErrorCode;

  /** Channel where violation occurred */
  public readonly channel?: string;

  /** User who triggered the violation */
  public readonly userId?: string;

  /** Pattern that was detected */
  public readonly detectedPattern?: string;

  constructor(
    message: string,
    options: {
      code: SecurityErrorCode;
      channel?: string;
      userId?: string;
      detectedPattern?: string;
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    const metadata: Record<string, unknown> = { ...options.metadata };
    if (options.channel !== undefined) {
      metadata.channel = options.channel;
    }
    if (options.userId !== undefined) {
      metadata.userId = options.userId;
    }
    // Don't include detected pattern in metadata for security

    super(message, {
      code: options.code,
      category: "SECURITY",
      retryable: false, // Security errors should never be retried
      severity: getSeverity(options.code),
      metadata,
      ...(options.cause ? { cause: options.cause } : {}),
    });

    this.name = "SecurityError";
    this.securityCode = options.code;
    if (options.channel !== undefined) {
      this.channel = options.channel;
    }
    if (options.userId !== undefined) {
      this.userId = options.userId;
    }
    if (options.detectedPattern !== undefined) {
      this.detectedPattern = options.detectedPattern;
    }
  }

  /**
   * Check if this is an injection attack.
   */
  isInjectionAttack(): boolean {
    return (
      this.securityCode === "SECURITY_INJECTION_DETECTED" ||
      this.securityCode === "SECURITY_SQL_INJECTION_DETECTED" ||
      this.securityCode === "SECURITY_COMMAND_INJECTION_DETECTED" ||
      this.securityCode === "SECURITY_XSS_DETECTED"
    );
  }

  /**
   * Check if this is an auth error.
   */
  isAuthError(): boolean {
    return (
      this.securityCode === "SECURITY_UNAUTHORIZED" ||
      this.securityCode === "SECURITY_FORBIDDEN" ||
      this.securityCode === "SECURITY_TOKEN_INVALID" ||
      this.securityCode === "SECURITY_TOKEN_EXPIRED"
    );
  }

  /**
   * Override toJSON to exclude sensitive patterns.
   */
  override toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    // Remove detected pattern from serialization for security
    delete json.detectedPattern;
    return json;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getSeverity(code: SecurityErrorCode): "critical" | "error" | "warning" {
  switch (code) {
    case "SECURITY_INJECTION_DETECTED":
    case "SECURITY_SQL_INJECTION_DETECTED":
    case "SECURITY_COMMAND_INJECTION_DETECTED":
    case "SECURITY_CREDENTIAL_EXPOSED":
      return "critical";
    case "SECURITY_XSS_DETECTED":
    case "SECURITY_PATH_TRAVERSAL_DETECTED":
    case "SECURITY_UNAUTHORIZED":
    case "SECURITY_FORBIDDEN":
      return "error";
    case "SECURITY_INPUT_SANITIZED":
    case "SECURITY_OUTPUT_SCRUBBED":
    case "SECURITY_RATE_LIMIT_EXCEEDED":
      return "warning";
    default:
      return "error";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an injection detected error.
 */
export function injectionDetectedError(
  type: "sql" | "command" | "xss" | "generic",
  channel?: string,
  userId?: string
): SecurityError {
  const codeMap = {
    sql: "SECURITY_SQL_INJECTION_DETECTED" as const,
    command: "SECURITY_COMMAND_INJECTION_DETECTED" as const,
    xss: "SECURITY_XSS_DETECTED" as const,
    generic: "SECURITY_INJECTION_DETECTED" as const,
  };

  const options: {
    code: SecurityErrorCode;
    channel?: string;
    userId?: string;
  } = {
    code: codeMap[type],
  };
  if (channel !== undefined) {
    options.channel = channel;
  }
  if (userId !== undefined) {
    options.userId = userId;
  }

  return new SecurityError(`${type.toUpperCase()} injection detected`, options);
}

/**
 * Create an unauthorized error.
 */
export function unauthorizedError(message?: string): SecurityError {
  return new SecurityError(message ?? "Unauthorized access", {
    code: "SECURITY_UNAUTHORIZED",
  });
}

/**
 * Create a forbidden error.
 */
export function forbiddenError(message?: string): SecurityError {
  return new SecurityError(message ?? "Access forbidden", {
    code: "SECURITY_FORBIDDEN",
  });
}

/**
 * Create a token expired error.
 */
export function tokenExpiredError(): SecurityError {
  return new SecurityError("Authentication token has expired", {
    code: "SECURITY_TOKEN_EXPIRED",
  });
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a SecurityError.
 */
export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError;
}
