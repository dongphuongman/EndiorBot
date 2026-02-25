/**
 * Gateway Error Types
 *
 * Errors related to the WebSocket Gateway and JSON-RPC communication.
 *
 * @module errors/gateway
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError } from "./base.js";

// ============================================================================
// Gateway Error Codes
// ============================================================================

/**
 * Gateway-specific error codes.
 */
export type GatewayErrorCode =
  | "GATEWAY_CONNECTION_FAILED"
  | "GATEWAY_CONNECTION_CLOSED"
  | "GATEWAY_AUTH_REQUIRED"
  | "GATEWAY_AUTH_FAILED"
  | "GATEWAY_METHOD_NOT_FOUND"
  | "GATEWAY_INVALID_PARAMS"
  | "GATEWAY_INTERNAL_ERROR"
  | "GATEWAY_TIMEOUT"
  | "GATEWAY_RATE_LIMITED"
  | "GATEWAY_SESSION_EXPIRED"
  | "GATEWAY_SESSION_NOT_FOUND"
  | "GATEWAY_SUBSCRIPTION_ERROR";

// ============================================================================
// Gateway Error Class
// ============================================================================

/**
 * Error from the WebSocket Gateway.
 */
export class GatewayError extends EndiorBotError {
  /** Gateway error code */
  public readonly gatewayCode: GatewayErrorCode;

  /** JSON-RPC error code if applicable */
  public readonly rpcCode?: number;

  /** Method that failed */
  public readonly method?: string;

  /** Session ID if applicable */
  public readonly sessionId?: string;

  constructor(
    message: string,
    options: {
      code: GatewayErrorCode;
      rpcCode?: number;
      method?: string;
      sessionId?: string;
      retryable?: boolean;
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    const metadata: Record<string, unknown> = { ...options.metadata };
    if (options.rpcCode !== undefined) {
      metadata.rpcCode = options.rpcCode;
    }
    if (options.method !== undefined) {
      metadata.method = options.method;
    }
    if (options.sessionId !== undefined) {
      metadata.sessionId = options.sessionId;
    }

    super(message, {
      code: options.code,
      category: "GATEWAY",
      retryable: options.retryable ?? getDefaultRetryable(options.code),
      severity: getSeverity(options.code),
      metadata,
      ...(options.cause ? { cause: options.cause } : {}),
    });

    this.name = "GatewayError";
    this.gatewayCode = options.code;
    if (options.rpcCode !== undefined) {
      this.rpcCode = options.rpcCode;
    }
    if (options.method !== undefined) {
      this.method = options.method;
    }
    if (options.sessionId !== undefined) {
      this.sessionId = options.sessionId;
    }
  }

  /**
   * Check if this requires reconnection.
   */
  requiresReconnection(): boolean {
    return (
      this.gatewayCode === "GATEWAY_CONNECTION_CLOSED" ||
      this.gatewayCode === "GATEWAY_CONNECTION_FAILED"
    );
  }

  /**
   * Check if this is an auth error.
   */
  isAuthError(): boolean {
    return (
      this.gatewayCode === "GATEWAY_AUTH_REQUIRED" ||
      this.gatewayCode === "GATEWAY_AUTH_FAILED"
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultRetryable(code: GatewayErrorCode): boolean {
  switch (code) {
    case "GATEWAY_CONNECTION_FAILED":
    case "GATEWAY_CONNECTION_CLOSED":
    case "GATEWAY_TIMEOUT":
    case "GATEWAY_RATE_LIMITED":
    case "GATEWAY_INTERNAL_ERROR":
      return true;
    case "GATEWAY_AUTH_REQUIRED":
    case "GATEWAY_AUTH_FAILED":
    case "GATEWAY_METHOD_NOT_FOUND":
    case "GATEWAY_INVALID_PARAMS":
    case "GATEWAY_SESSION_EXPIRED":
    case "GATEWAY_SESSION_NOT_FOUND":
    case "GATEWAY_SUBSCRIPTION_ERROR":
      return false;
    default:
      return false;
  }
}

function getSeverity(code: GatewayErrorCode): "critical" | "error" | "warning" {
  switch (code) {
    case "GATEWAY_AUTH_FAILED":
    case "GATEWAY_SESSION_EXPIRED":
      return "critical";
    case "GATEWAY_RATE_LIMITED":
    case "GATEWAY_TIMEOUT":
      return "warning";
    default:
      return "error";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a method not found error.
 */
export function methodNotFoundError(method: string): GatewayError {
  return new GatewayError(`Method not found: ${method}`, {
    code: "GATEWAY_METHOD_NOT_FOUND",
    rpcCode: -32601,
    method,
  });
}

/**
 * Create an invalid params error.
 */
export function invalidParamsError(
  method: string,
  details?: string
): GatewayError {
  return new GatewayError(
    `Invalid parameters${details ? `: ${details}` : ""}`,
    {
      code: "GATEWAY_INVALID_PARAMS",
      rpcCode: -32602,
      method,
    }
  );
}

/**
 * Create an auth required error.
 */
export function authRequiredError(): GatewayError {
  return new GatewayError("Authentication required", {
    code: "GATEWAY_AUTH_REQUIRED",
    rpcCode: -32000,
  });
}

/**
 * Create a session not found error.
 */
export function sessionNotFoundError(sessionId: string): GatewayError {
  return new GatewayError(`Session not found: ${sessionId}`, {
    code: "GATEWAY_SESSION_NOT_FOUND",
    sessionId,
  });
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a GatewayError.
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}
