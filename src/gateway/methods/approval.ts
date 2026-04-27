/**
 * Gateway Approval Methods
 *
 * JSON-RPC methods for approval queue management.
 * Queue state and shared types now live in src/approval/queue.ts to
 * prevent agents/ → gateway/ architectural inversion (CSO audit).
 *
 * @module gateway/methods/approval
 * @version 1.1.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";
import {
  approvalQueue,
  updateExpiredRequests,
} from "../../approval/queue.js";
import type { ApprovalRequest, ApprovalStatus, ApprovalType } from "../../approval/queue.js";

// Re-export everything consumers depended on from this path (backward compat).
export {
  createApprovalRequest,
  waitForApproval,
  clearApprovalQueue,
  getApprovalQueue,
} from "../../approval/queue.js";

export type {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
} from "../../approval/queue.js";

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get list of approval requests.
 */
function handleApprovalList(
  params: unknown,
  _client: ClientInfo,
): { requests: ApprovalRequest[]; pendingCount: number } {
  updateExpiredRequests();

  const { status, type, limit = 50, offset = 0 } = (params ?? {}) as {
    status?: ApprovalStatus;
    type?: ApprovalType;
    limit?: number;
    offset?: number;
  };

  let requests = Array.from(approvalQueue.values());

  if (status) {
    requests = requests.filter((r) => r.status === status);
  }

  if (type) {
    requests = requests.filter((r) => r.type === type);
  }

  // Sort by creation time (newest first)
  requests.sort((a, b) => b.createdAt - a.createdAt);

  const pendingCount = Array.from(approvalQueue.values()).filter(
    (r) => r.status === "pending",
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
  _client: ClientInfo,
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
  client: ClientInfo,
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
  client: ClientInfo,
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
  _client: ClientInfo,
): { count: number; byType: Record<ApprovalType, number> } {
  updateExpiredRequests();

  const pending = Array.from(approvalQueue.values()).filter(
    (r) => r.status === "pending",
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
