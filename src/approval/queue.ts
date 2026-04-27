/**
 * Approval Queue — neutral module
 *
 * Extracted from gateway/methods/approval.ts to break the agents → gateway
 * architectural inversion (CSO audit finding).
 *
 * Both agents/ and gateway/ can import from here without creating a circular
 * dependency. Gateway keeps only the JSON-RPC method registration.
 *
 * @module approval/queue
 */

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

// ============================================================================
// Queue (in-memory singleton)
// ============================================================================

/**
 * Approval queue (in-memory).
 * Single instance shared across the process — both agents and gateway
 * operate on the same Map without either layer owning it.
 */
export const approvalQueue: Map<string, ApprovalRequest> = new Map();

/** Default expiration: 1 hour */
const DEFAULT_EXPIRATION_MS = 60 * 60 * 1000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Scan queue and mark pending requests whose deadline has passed as expired.
 */
export function updateExpiredRequests(): void {
  const now = Date.now();
  for (const request of approvalQueue.values()) {
    if (request.status === "pending" && now > request.expiresAt) {
      request.status = "expired";
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create an approval request and add it to the queue.
 *
 * @param type       - Category of the approval (gate, budget, action, …)
 * @param message    - Human-readable description shown to the approver
 * @param options    - Optional details, expiry override, and session context
 * @returns The newly created {@link ApprovalRequest}
 */
export function createApprovalRequest(
  type: ApprovalType,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    expiresInMs?: number;
    sessionId?: string;
  },
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
 * Wait (poll) until the request is no longer pending, then resolve.
 *
 * Resolves with status `"expired"` when the timeout fires before the CEO
 * acts. Never rejects — callers should inspect `result.status`.
 *
 * @param approvalId - ID returned by {@link createApprovalRequest}
 * @param timeoutMs  - How long to wait before auto-expiring (default 1 h)
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs?: number,
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
 * Get approval queue reference (for testing / gateway read access).
 */
export function getApprovalQueue(): Map<string, ApprovalRequest> {
  return approvalQueue;
}
