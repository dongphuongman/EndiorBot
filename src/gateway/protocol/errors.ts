/**
 * JSON-RPC 2.0 Error Codes
 *
 * Standard and custom error codes for gateway protocol.
 * https://www.jsonrpc.org/specification#error_object
 *
 * @module gateway/protocol/errors
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 */

import { createErrorResponse, type JsonRpcId, type JsonRpcErrorResponse } from "./schema.js";

// ============================================================================
// Standard JSON-RPC Error Codes
// ============================================================================

/**
 * Standard JSON-RPC 2.0 error codes.
 * Reserved range: -32700 to -32600
 */
export const JsonRpcErrorCode = {
  /** Invalid JSON received by server */
  PARSE_ERROR: -32700,
  /** Invalid Request object */
  INVALID_REQUEST: -32600,
  /** Method not found */
  METHOD_NOT_FOUND: -32601,
  /** Invalid method parameters */
  INVALID_PARAMS: -32602,
  /** Internal server error */
  INTERNAL_ERROR: -32603,
} as const;

export type JsonRpcErrorCode =
  (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// ============================================================================
// Custom Gateway Error Codes
// ============================================================================

/**
 * Custom gateway error codes.
 * Application-specific range: -32000 to -32099
 */
export const GatewayErrorCode = {
  /** Authentication required */
  UNAUTHORIZED: -32001,
  /** Permission denied */
  FORBIDDEN: -32002,
  /** Resource not found */
  NOT_FOUND: -32003,
  /** Rate limit exceeded */
  RATE_LIMITED: -32004,
  /** Request timeout */
  TIMEOUT: -32005,
  /** Service unavailable */
  SERVICE_UNAVAILABLE: -32006,
  /** Invalid session */
  INVALID_SESSION: -32010,
  /** Session expired */
  SESSION_EXPIRED: -32011,
  /** Invalid checkpoint */
  INVALID_CHECKPOINT: -32012,
  /** Invalid approval request */
  INVALID_APPROVAL: -32013,
  /** Approval expired */
  APPROVAL_EXPIRED: -32014,
  /** Already subscribed */
  ALREADY_SUBSCRIBED: -32020,
  /** Not subscribed */
  NOT_SUBSCRIBED: -32021,
} as const;

export type GatewayErrorCode =
  (typeof GatewayErrorCode)[keyof typeof GatewayErrorCode];

// ============================================================================
// Error Messages
// ============================================================================

/**
 * Default error messages.
 */
export const ErrorMessages: Record<number, string> = {
  // JSON-RPC standard
  [JsonRpcErrorCode.PARSE_ERROR]: "Parse error: Invalid JSON",
  [JsonRpcErrorCode.INVALID_REQUEST]: "Invalid Request",
  [JsonRpcErrorCode.METHOD_NOT_FOUND]: "Method not found",
  [JsonRpcErrorCode.INVALID_PARAMS]: "Invalid params",
  [JsonRpcErrorCode.INTERNAL_ERROR]: "Internal error",
  // Gateway custom
  [GatewayErrorCode.UNAUTHORIZED]: "Unauthorized: Authentication required",
  [GatewayErrorCode.FORBIDDEN]: "Forbidden: Permission denied",
  [GatewayErrorCode.NOT_FOUND]: "Not found",
  [GatewayErrorCode.RATE_LIMITED]: "Rate limit exceeded",
  [GatewayErrorCode.TIMEOUT]: "Request timeout",
  [GatewayErrorCode.SERVICE_UNAVAILABLE]: "Service unavailable",
  [GatewayErrorCode.INVALID_SESSION]: "Invalid session ID",
  [GatewayErrorCode.SESSION_EXPIRED]: "Session has expired",
  [GatewayErrorCode.INVALID_CHECKPOINT]: "Invalid checkpoint ID",
  [GatewayErrorCode.INVALID_APPROVAL]: "Invalid approval request ID",
  [GatewayErrorCode.APPROVAL_EXPIRED]: "Approval request has expired",
  [GatewayErrorCode.ALREADY_SUBSCRIBED]: "Already subscribed to event",
  [GatewayErrorCode.NOT_SUBSCRIBED]: "Not subscribed to event",
};

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a parse error response.
 */
export function parseError(id: JsonRpcId = null): JsonRpcErrorResponse {
  return createErrorResponse(
    JsonRpcErrorCode.PARSE_ERROR,
    ErrorMessages[JsonRpcErrorCode.PARSE_ERROR] ?? "Parse error",
    id
  );
}

/**
 * Create an invalid request error response.
 */
export function invalidRequest(
  id: JsonRpcId = null,
  detail?: string
): JsonRpcErrorResponse {
  const message = detail
    ? `${ErrorMessages[JsonRpcErrorCode.INVALID_REQUEST]}: ${detail}`
    : ErrorMessages[JsonRpcErrorCode.INVALID_REQUEST] ?? "Invalid request";
  return createErrorResponse(JsonRpcErrorCode.INVALID_REQUEST, message, id);
}

/**
 * Create a method not found error response.
 */
export function methodNotFound(
  id: JsonRpcId,
  method?: string
): JsonRpcErrorResponse {
  const message = method
    ? `Method not found: ${method}`
    : ErrorMessages[JsonRpcErrorCode.METHOD_NOT_FOUND] ?? "Method not found";
  return createErrorResponse(JsonRpcErrorCode.METHOD_NOT_FOUND, message, id);
}

/**
 * Create an invalid params error response.
 */
export function invalidParams(
  id: JsonRpcId,
  detail?: string
): JsonRpcErrorResponse {
  const message = detail
    ? `${ErrorMessages[JsonRpcErrorCode.INVALID_PARAMS]}: ${detail}`
    : ErrorMessages[JsonRpcErrorCode.INVALID_PARAMS] ?? "Invalid params";
  return createErrorResponse(JsonRpcErrorCode.INVALID_PARAMS, message, id);
}

/**
 * Create an internal error response.
 */
export function internalError(
  id: JsonRpcId,
  detail?: string
): JsonRpcErrorResponse {
  const message = detail
    ? `${ErrorMessages[JsonRpcErrorCode.INTERNAL_ERROR]}: ${detail}`
    : ErrorMessages[JsonRpcErrorCode.INTERNAL_ERROR] ?? "Internal error";
  return createErrorResponse(JsonRpcErrorCode.INTERNAL_ERROR, message, id);
}

/**
 * Create an unauthorized error response.
 */
export function unauthorized(id: JsonRpcId): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.UNAUTHORIZED,
    ErrorMessages[GatewayErrorCode.UNAUTHORIZED] ?? "Unauthorized",
    id
  );
}

/**
 * Create a forbidden error response.
 */
export function forbidden(id: JsonRpcId, detail?: string): JsonRpcErrorResponse {
  const message = detail
    ? `${ErrorMessages[GatewayErrorCode.FORBIDDEN]}: ${detail}`
    : ErrorMessages[GatewayErrorCode.FORBIDDEN] ?? "Forbidden";
  return createErrorResponse(GatewayErrorCode.FORBIDDEN, message, id);
}

/**
 * Create a not found error response.
 */
export function notFound(
  id: JsonRpcId,
  resource?: string
): JsonRpcErrorResponse {
  const message = resource
    ? `Not found: ${resource}`
    : ErrorMessages[GatewayErrorCode.NOT_FOUND] ?? "Not found";
  return createErrorResponse(GatewayErrorCode.NOT_FOUND, message, id);
}

/**
 * Create a rate limited error response.
 */
export function rateLimited(
  id: JsonRpcId,
  retryAfterMs?: number
): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.RATE_LIMITED,
    ErrorMessages[GatewayErrorCode.RATE_LIMITED] ?? "Rate limited",
    id,
    retryAfterMs !== undefined ? { retryAfterMs } : undefined
  );
}

/**
 * Create a timeout error response.
 */
export function timeout(id: JsonRpcId): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.TIMEOUT,
    ErrorMessages[GatewayErrorCode.TIMEOUT] ?? "Timeout",
    id
  );
}

/**
 * Create a service unavailable error response.
 */
export function serviceUnavailable(
  id: JsonRpcId,
  detail?: string
): JsonRpcErrorResponse {
  const message = detail
    ? `${ErrorMessages[GatewayErrorCode.SERVICE_UNAVAILABLE]}: ${detail}`
    : ErrorMessages[GatewayErrorCode.SERVICE_UNAVAILABLE] ?? "Service unavailable";
  return createErrorResponse(GatewayErrorCode.SERVICE_UNAVAILABLE, message, id);
}

/**
 * Create an invalid session error response.
 */
export function invalidSession(id: JsonRpcId): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.INVALID_SESSION,
    ErrorMessages[GatewayErrorCode.INVALID_SESSION] ?? "Invalid session",
    id
  );
}

/**
 * Create an invalid approval error response.
 */
export function invalidApproval(id: JsonRpcId): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.INVALID_APPROVAL,
    ErrorMessages[GatewayErrorCode.INVALID_APPROVAL] ?? "Invalid approval",
    id
  );
}

/**
 * Create an approval expired error response.
 */
export function approvalExpired(id: JsonRpcId): JsonRpcErrorResponse {
  return createErrorResponse(
    GatewayErrorCode.APPROVAL_EXPIRED,
    ErrorMessages[GatewayErrorCode.APPROVAL_EXPIRED] ?? "Approval expired",
    id
  );
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if error code is a standard JSON-RPC error.
 */
export function isStandardError(code: number): boolean {
  return code >= -32700 && code <= -32600;
}

/**
 * Check if error code is a gateway custom error.
 */
export function isGatewayError(code: number): boolean {
  return code >= -32099 && code <= -32000;
}

/**
 * Get error message for code.
 */
export function getErrorMessage(code: number): string {
  return ErrorMessages[code] ?? `Unknown error (${code})`;
}
