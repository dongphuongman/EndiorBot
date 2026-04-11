/**
 * JSON-RPC 2.0 Protocol Schema
 *
 * Type definitions for JSON-RPC 2.0 request/response protocol.
 * https://www.jsonrpc.org/specification
 *
 * @module gateway/protocol/schema
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 */

// ============================================================================
// JSON-RPC 2.0 Core Types
// ============================================================================

/**
 * JSON-RPC version.
 */
export const JSONRPC_VERSION = "2.0" as const;

/**
 * Valid JSON-RPC ID types.
 */
export type JsonRpcId = string | number | null;

/**
 * JSON-RPC request object.
 */
export interface JsonRpcRequest<TParams = unknown> {
  /** Protocol version (must be "2.0") */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method name */
  method: string;
  /** Method parameters (optional) */
  params?: TParams;
  /** Request ID (null for notifications) */
  id: JsonRpcId;
}

/**
 * JSON-RPC notification (request without ID).
 */
export interface JsonRpcNotification<TParams = unknown> {
  /** Protocol version (must be "2.0") */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method name */
  method: string;
  /** Method parameters (optional) */
  params?: TParams;
}

/**
 * JSON-RPC success response.
 */
export interface JsonRpcSuccessResponse<TResult = unknown> {
  /** Protocol version (must be "2.0") */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Result data */
  result: TResult;
  /** Request ID */
  id: JsonRpcId;
}

/**
 * JSON-RPC error object.
 */
export interface JsonRpcErrorObject {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Additional data (optional) */
  data?: unknown;
}

/**
 * JSON-RPC error response.
 */
export interface JsonRpcErrorResponse {
  /** Protocol version (must be "2.0") */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Error object */
  error: JsonRpcErrorObject;
  /** Request ID (null if request couldn't be parsed) */
  id: JsonRpcId;
}

/**
 * JSON-RPC response (success or error).
 */
export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

/**
 * JSON-RPC batch request.
 */
export type JsonRpcBatchRequest = Array<JsonRpcRequest | JsonRpcNotification>;

/**
 * JSON-RPC batch response.
 */
export type JsonRpcBatchResponse = JsonRpcResponse[];

// ============================================================================
// Gateway Methods
// ============================================================================

/**
 * Available gateway methods.
 */
export type GatewayMethod =
  // Session methods
  | "sessions.list"
  | "sessions.get"
  | "sessions.status"
  // Agent methods
  | "agents.status"
  // Budget methods
  | "budget.get"
  | "budget.history"
  // Checkpoint methods
  | "checkpoints.list"
  | "checkpoints.get"
  | "checkpoints.create"
  // Approval methods
  | "approval.list"
  | "approval.get"
  | "approval.approve"
  | "approval.reject"
  // Subscription methods
  | "subscribe"
  | "unsubscribe"
  // System methods
  | "system.ping"
  | "system.version"
  | "system.stats"
  // Sprint 93: Bridge commands (dynamic cmd.* namespace)
  | `cmd.${string}`
  // Sprint 93: Router chat methods
  | "router.chat"
  | "router.status";

// ============================================================================
// Method Parameters
// ============================================================================

/**
 * Parameters for sessions.get method.
 */
export interface SessionsGetParams {
  /** Session ID */
  sessionId: string;
}

/**
 * Parameters for checkpoints.list method.
 */
export interface CheckpointsListParams {
  /** Session ID (optional, filter by session) */
  sessionId?: string;
  /** Maximum number of checkpoints to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Parameters for checkpoints.get method.
 */
export interface CheckpointsGetParams {
  /** Checkpoint ID */
  checkpointId: string;
}

/**
 * Parameters for checkpoints.create method.
 */
export interface CheckpointsCreateParams {
  /** Session ID */
  sessionId: string;
  /** Optional label */
  label?: string;
}

/**
 * Parameters for approval.get method.
 */
export interface ApprovalGetParams {
  /** Approval request ID */
  approvalId: string;
}

/**
 * Parameters for approval.approve method.
 */
export interface ApprovalApproveParams {
  /** Approval request ID */
  approvalId: string;
  /** Optional notes */
  notes?: string;
}

/**
 * Parameters for approval.reject method.
 */
export interface ApprovalRejectParams {
  /** Approval request ID */
  approvalId: string;
  /** Optional reason */
  reason?: string;
}

/**
 * Parameters for subscribe method.
 */
export interface SubscribeParams {
  /** Event types to subscribe to */
  events: string[];
}

/**
 * Parameters for unsubscribe method.
 */
export interface UnsubscribeParams {
  /** Event types to unsubscribe from */
  events: string[];
}

/**
 * Parameters for cmd.list method (M0, Sprint 132).
 *
 * cmd.list is the canonical discovery method for all EndiorBot surfaces.
 * It is NON-SENSITIVE — no auth (userId) required.
 * A bare {"method":"cmd.list"} call returns the full catalog for all surfaces.
 */
export interface CmdListParams {
  /** Optional surface filter. */
  surface?: "web" | "telegram" | "zalo" | "cli";
  /** Include per-command parameter schema in each entry. Default: true. */
  includeArgs?: boolean;
  /** Include sensitivity flag. Default: true. */
  includeSensitivity?: boolean;
}

/**
 * Single command entry in a cmd.list response.
 */
export interface CmdEntry {
  name: string;
  description: string;
  category: string;
  surfaceAvailability: "all" | Array<"web" | "telegram" | "zalo" | "cli">;
  parameters: CmdParamSpec[];
  sensitive: boolean;
  requiresLink: boolean;
  sdlcStage?: string;
}

/**
 * Parameter spec for a single command argument.
 */
export interface CmdParamSpec {
  name: string;
  description: string;
  type: "string" | "number" | "enum" | "flag";
  required: boolean;
  choices?: string[];
}

/**
 * Envelope result for cmd.list (M0, Sprint 132).
 * Wrapped from day one to avoid the openclaw bare-array mistake.
 */
export interface CmdListResult {
  commands: CmdEntry[];
  meta: {
    /** Total BEFORE surface filter — drives five-equal-numbers PoL. */
    total: number;
    /** Count AFTER filter — equals commands.length. */
    filteredCount: number;
    /** Requested surface (null when no filter). */
    surface: string | null;
    /** SHA-1 of sorted command names for cache invalidation. */
    dispatcherVersion: string;
    /** ISO-8601 generation timestamp. */
    generatedAt: string;
  };
}

/**
 * Parameters for budget.history method.
 */
export interface BudgetHistoryParams {
  /** Start date (ISO string) */
  startDate?: string;
  /** End date (ISO string) */
  endDate?: string;
  /** Maximum number of records */
  limit?: number;
}

// ============================================================================
// Method Results
// ============================================================================

/**
 * Result for sessions.list method.
 */
export interface SessionsListResult {
  /** List of sessions */
  sessions: Array<{
    id: string;
    status: string;
    startedAt: number;
    projectId?: string;
  }>;
}

/**
 * Result for sessions.get method.
 */
export interface SessionsGetResult {
  /** Session ID */
  id: string;
  /** Session status */
  status: string;
  /** Start timestamp */
  startedAt: number;
  /** Project ID */
  projectId?: string;
  /** Token usage */
  tokenUsage: {
    input: number;
    output: number;
  };
  /** Message count */
  messageCount: number;
}

/**
 * Result for budget.get method.
 */
export interface BudgetGetResult {
  /** Session budget */
  session: {
    costSoFar: number;
    limit: number;
    percentage: number;
  };
  /** Daily budget */
  daily: {
    costSoFar: number;
    limit: number;
    percentage: number;
    resetAt: number;
  };
}

/**
 * Result for agents.status method.
 */
export interface AgentsStatusResult {
  /** Active agents */
  agents: Array<{
    id: string;
    type: string;
    status: string;
    currentTask?: string;
  }>;
}

/**
 * Result for approval.list method.
 */
export interface ApprovalListResult {
  /** List of approval requests */
  requests: Array<{
    id: string;
    type: string;
    status: string;
    message: string;
    createdAt: number;
    expiresAt: number;
  }>;
}

/**
 * Result for system.version method.
 */
export interface SystemVersionResult {
  /** Gateway version */
  gateway: string;
  /** EndiorBot version */
  endiorbot: string;
  /** Protocol version */
  protocol: string;
}

/**
 * Result for system.stats method.
 */
export interface SystemStatsResult {
  /** Uptime in seconds */
  uptime: number;
  /** Active connections */
  connections: number;
  /** Messages received */
  messagesReceived: number;
  /** Messages sent */
  messagesSent: number;
}

/**
 * Result for subscribe/unsubscribe methods.
 */
export interface SubscriptionResult {
  /** Currently subscribed events */
  subscribed: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if message is a valid JSON-RPC request.
 */
export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === JSONRPC_VERSION &&
    typeof obj.method === "string" &&
    "id" in obj
  );
}

/**
 * Check if message is a JSON-RPC notification.
 */
export function isJsonRpcNotification(
  msg: unknown
): msg is JsonRpcNotification {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === JSONRPC_VERSION &&
    typeof obj.method === "string" &&
    !("id" in obj)
  );
}

/**
 * Check if response is an error response.
 */
export function isJsonRpcError(
  response: JsonRpcResponse
): response is JsonRpcErrorResponse {
  return "error" in response;
}

/**
 * Check if response is a success response.
 */
export function isJsonRpcSuccess<T>(
  response: JsonRpcResponse<T>
): response is JsonRpcSuccessResponse<T> {
  return "result" in response;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a JSON-RPC request.
 */
export function createRequest<TParams>(
  method: string,
  params?: TParams,
  id?: JsonRpcId
): JsonRpcRequest<TParams> {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params !== undefined && { params }),
    id: id ?? Date.now(),
  };
}

/**
 * Create a JSON-RPC notification.
 */
export function createNotification<TParams>(
  method: string,
  params?: TParams
): JsonRpcNotification<TParams> {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params !== undefined && { params }),
  };
}

/**
 * Create a JSON-RPC success response.
 */
export function createSuccessResponse<TResult>(
  result: TResult,
  id: JsonRpcId
): JsonRpcSuccessResponse<TResult> {
  return {
    jsonrpc: JSONRPC_VERSION,
    result,
    id,
  };
}

/**
 * Create a JSON-RPC error response.
 */
export function createErrorResponse(
  code: number,
  message: string,
  id: JsonRpcId,
  data?: unknown
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    error: {
      code,
      message,
      ...(data !== undefined && { data }),
    },
    id,
  };
}
