/**
 * Gateway Approval Methods
 *
 * JSON-RPC methods for approval queue management.
 *
 * @module gateway/methods/approval
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 3
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Approval request types.
 */
export type ApprovalType =
  | "gate"           // SDLC gate approval
  | "budget"         // Budget limit increase
  | "action"         // Risky action (file delete, deploy, etc.)
  | "escalation"     // Agent escalation to CEO
  | "checkpoint";    // Checkpoint restore

/**
 * Approval request status.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * Approval request.
 */
export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  message: string;
  details?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  respondedAt?: number;
  respondedBy?: string;
  notes?: string;
  sessionId?: string;
}

/**
 * Approval queue (in-memory for now).
 * TODO: Wire to actual ApprovalQueue in Sprint 44 Day 5+
 */
const approvalQueue: Map<string, ApprovalRequest> = new Map();

// Default expiration: 1 hour
const DEFAULT_EXPIRATION_MS = 60 * 60 * 1000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check and update expired requests.
 */
function updateExpiredRequests(): void {
  const now = Date.now();
  for (const request of approvalQueue.values()) {
    if (request.status === "pending" && now > request.expiresAt) {
      request.status = "expired";
    }
  }
}

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get list of approval requests.
 */
function handleApprovalList(
  params: unknown,
  _client: ClientInfo
): { requests: ApprovalRequest[]; pendingCount: number } {
  updateExpiredRequests();

  const { status, type, limit = 50, offset = 0 } = (params ?? {}) as {
    status?: ApprovalStatus;
    type?: ApprovalType;
    limit?: number;
    offset?: number;
  };

  let requests = Array.from(approvalQueue.values());

  // Filter by status
  if (status) {
    requests = requests.filter((r) => r.status === status);
  }

  // Filter by type
  if (type) {
    requests = requests.filter((r) => r.type === type);
  }

  // Sort by creation time (newest first)
  requests.sort((a, b) => b.createdAt - a.createdAt);

  const pendingCount = Array.from(approvalQueue.values()).filter(
    (r) => r.status === "pending"
  ).length;

  // Apply pagination
  requests = requests.slice(offset, offset + limit);

  return { requests, pendingCount };
}

/**
 * Get a specific approval request.
 */
function handleApprovalGet(
  params: unknown,
  _client: ClientInfo
): ApprovalRequest {
  updateExpiredRequests();

  const { approvalId } = (params ?? {}) as { approvalId?: string };

  if (!approvalId) {
    throw new Error("approvalId is required");
  }

  const request = approvalQueue.get(approvalId);
  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  return request;
}

/**
 * Approve a request.
 */
function handleApprovalApprove(
  params: unknown,
  client: ClientInfo
): { success: boolean; request: ApprovalRequest } {
  updateExpiredRequests();

  const { approvalId, notes } = (params ?? {}) as {
    approvalId?: string;
    notes?: string;
  };

  if (!approvalId) {
    throw new Error("approvalId is required");
  }

  const request = approvalQueue.get(approvalId);
  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  if (request.status !== "pending") {
    throw new Error(`Request is not pending: ${request.status}`);
  }

  request.status = "approved";
  request.respondedAt = Date.now();
  request.respondedBy = client.id;
  if (notes) {
    request.notes = notes;
  }

  return { success: true, request };
}

/**
 * Reject a request.
 */
function handleApprovalReject(
  params: unknown,
  client: ClientInfo
): { success: boolean; request: ApprovalRequest } {
  updateExpiredRequests();

  const { approvalId, reason } = (params ?? {}) as {
    approvalId?: string;
    reason?: string;
  };

  if (!approvalId) {
    throw new Error("approvalId is required");
  }

  const request = approvalQueue.get(approvalId);
  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  if (request.status !== "pending") {
    throw new Error(`Request is not pending: ${request.status}`);
  }

  request.status = "rejected";
  request.respondedAt = Date.now();
  request.respondedBy = client.id;
  if (reason) {
    request.notes = reason;
  }

  return { success: true, request };
}

/**
 * Get pending count (quick status check).
 */
function handleApprovalPendingCount(
  _params: unknown,
  _client: ClientInfo
): { count: number; byType: Record<ApprovalType, number> } {
  updateExpiredRequests();

  const pending = Array.from(approvalQueue.values()).filter(
    (r) => r.status === "pending"
  );

  const byType: Record<ApprovalType, number> = {
    gate: 0,
    budget: 0,
    action: 0,
    escalation: 0,
    checkpoint: 0,
  };

  for (const request of pending) {
    byType[request.type]++;
  }

  return { count: pending.length, byType };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register approval methods with the gateway server.
 */
export function registerApprovalMethods(server: GatewayServer): void {
  server.registerMethod("approval.list", handleApprovalList);
  server.registerMethod("approval.get", handleApprovalGet);
  server.registerMethod("approval.approve", handleApprovalApprove);
  server.registerMethod("approval.reject", handleApprovalReject);
  server.registerMethod("approval.pendingCount", handleApprovalPendingCount);
}

// ============================================================================
// Internal API (for approval queue push)
// ============================================================================

/**
 * Create an approval request (called by ApprovalQueue).
 */
export function createApprovalRequest(
  type: ApprovalType,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    expiresInMs?: number;
    sessionId?: string;
  }
): ApprovalRequest {
  const expiresInMs = options?.expiresInMs ?? DEFAULT_EXPIRATION_MS;

  const request: ApprovalRequest = {
    id: crypto.randomUUID(),
    type,
    status: "pending",
    message,
    createdAt: Date.now(),
    expiresAt: Date.now() + expiresInMs,
  };

  if (options?.details !== undefined) {
    request.details = options.details;
  }
  if (options?.sessionId !== undefined) {
    request.sessionId = options.sessionId;
  }

  approvalQueue.set(request.id, request);

  return request;
}

/**
 * Wait for approval (promise-based).
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs?: number
): Promise<ApprovalRequest> {
  const timeout = timeoutMs ?? DEFAULT_EXPIRATION_MS;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = (): void => {
      const request = approvalQueue.get(approvalId);
      if (!request) {
        reject(new Error(`Approval request not found: ${approvalId}`));
        return;
      }

      if (request.status !== "pending") {
        resolve(request);
        return;
      }

      if (Date.now() - startTime > timeout) {
        request.status = "expired";
        resolve(request);
        return;
      }

      setTimeout(check, 500);
    };

    check();
  });
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear approval queue (for testing).
 */
export function clearApprovalQueue(): void {
  approvalQueue.clear();
}

/**
 * Get approval queue (for testing).
 */
export function getApprovalQueue(): Map<string, ApprovalRequest> {
  return approvalQueue;
}
