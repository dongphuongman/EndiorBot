/**
 * Approval Queue for Budget Escalation
 *
 * File-backed queue for decisions requiring CEO approval.
 *
 * Per CTO Day 6-7 guidance:
 * - File-backed persistence at ~/.endiorbot/approval-queue.json
 * - Queue persists across sessions
 * - Approval workflow: enqueue → approve/reject → dequeue
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { DecisionContext, DecisionBucket, RiskLevel } from "./decision-classifier.js";

// ============================================================================
// Constants
// ============================================================================

/** Default approval queue file path */
export const DEFAULT_APPROVAL_QUEUE_PATH = join(
  homedir(),
  ".endiorbot",
  "approval-queue.json",
);

/** Max items in queue */
export const MAX_QUEUE_SIZE = 100;

/** Default expiry time for requests (24 hours in ms) */
export const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

/**
 * Approval request status.
 */
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

/**
 * Approval request urgency.
 */
export type ApprovalUrgency = "low" | "medium" | "high" | "critical";

/**
 * Approval request in the queue.
 */
export interface ApprovalRequest {
  /** Unique request ID */
  id: string;
  /** Request type (matches DecisionBucket) */
  type: "block" | "consult";
  /** Decision type that triggered this */
  decisionType: string;
  /** Request status */
  status: ApprovalStatus;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Urgency */
  urgency: ApprovalUrgency;
  /** Human-readable description */
  description: string;
  /** Reason for blocking/consultation */
  reason: string;
  /** Original decision context */
  context: DecisionContext;
  /** Created timestamp (ISO string) */
  createdAt: string;
  /** Updated timestamp (ISO string) */
  updatedAt: string;
  /** Expires at (ISO string) */
  expiresAt: string;
  /** Resolved by (if approved/rejected) */
  resolvedBy?: string;
  /** Resolution notes */
  resolutionNotes?: string;
  /** Resolved at (ISO string) */
  resolvedAt?: string;
}

/**
 * Persisted queue data.
 */
export interface PersistedQueueData {
  /** Schema version */
  version: string;
  /** Queue items */
  items: ApprovalRequest[];
  /** Last updated (ISO string) */
  lastUpdated: string;
  /** Statistics */
  stats: {
    totalApproved: number;
    totalRejected: number;
    totalExpired: number;
    totalCancelled: number;
  };
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  /** Pending requests */
  pending: number;
  /** Approved requests (historical) */
  approved: number;
  /** Rejected requests (historical) */
  rejected: number;
  /** Expired requests (historical) */
  expired: number;
  /** Total requests ever */
  total: number;
  /** Oldest pending request age (ms) */
  oldestPendingAgeMs: number;
}

// ============================================================================
// Approval Queue
// ============================================================================

/**
 * ApprovalQueue - File-backed queue for CEO approvals.
 *
 * Per CTO Day 6-7 guidance:
 * - Persists to ~/.endiorbot/approval-queue.json
 * - Survives app restarts
 * - Auto-expires stale requests
 */
export class ApprovalQueue {
  private filePath: string;
  private data: PersistedQueueData;
  private expiryMs: number;

  constructor(filePath?: string, expiryMs?: number) {
    this.filePath = filePath ?? DEFAULT_APPROVAL_QUEUE_PATH;
    this.expiryMs = expiryMs ?? DEFAULT_EXPIRY_MS;
    this.data = this.load();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Add an approval request to the queue.
   */
  enqueue(
    context: DecisionContext,
    bucket: DecisionBucket,
    reason: string,
    urgency?: ApprovalUrgency,
  ): string {
    // Prune expired first
    this.pruneExpired();

    // Check queue size
    const pendingCount = this.data.items.filter((i) => i.status === "pending").length;
    if (pendingCount >= MAX_QUEUE_SIZE) {
      throw new Error(`Queue full (max ${MAX_QUEUE_SIZE} pending requests)`);
    }

    const now = new Date();
    const id = `apr-${now.getTime()}-${Math.random().toString(36).substring(2, 8)}`;

    const request: ApprovalRequest = {
      id,
      type: bucket === "consult" ? "consult" : "block",
      decisionType: context.type,
      status: "pending",
      riskLevel: this.inferRiskLevel(context),
      urgency: urgency ?? this.inferUrgency(context),
      description: this.generateDescription(context),
      reason,
      context,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.expiryMs).toISOString(),
    };

    this.data.items.push(request);
    this.save();

    return id;
  }

  /**
   * Get pending approval requests.
   */
  getPending(): ApprovalRequest[] {
    this.pruneExpired();
    return this.data.items
      .filter((item) => item.status === "pending")
      .sort((a, b) => {
        // Sort by urgency (critical first), then by creation time
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }

  /**
   * Get a specific request by ID.
   */
  getById(id: string): ApprovalRequest | undefined {
    return this.data.items.find((item) => item.id === id);
  }

  /**
   * Approve a request.
   */
  approve(id: string, resolvedBy?: string, notes?: string): boolean {
    const request = this.data.items.find(
      (item) => item.id === id && item.status === "pending",
    );
    if (!request) {
      return false;
    }

    const now = new Date().toISOString();
    request.status = "approved";
    request.resolvedBy = resolvedBy ?? "CEO";
    if (notes !== undefined) {
      request.resolutionNotes = notes;
    }
    request.resolvedAt = now;
    request.updatedAt = now;

    this.data.stats.totalApproved++;
    this.save();

    return true;
  }

  /**
   * Reject a request.
   */
  reject(id: string, resolvedBy?: string, reason?: string): boolean {
    const request = this.data.items.find(
      (item) => item.id === id && item.status === "pending",
    );
    if (!request) {
      return false;
    }

    const now = new Date().toISOString();
    request.status = "rejected";
    request.resolvedBy = resolvedBy ?? "CEO";
    if (reason !== undefined) {
      request.resolutionNotes = reason;
    }
    request.resolvedAt = now;
    request.updatedAt = now;

    this.data.stats.totalRejected++;
    this.save();

    return true;
  }

  /**
   * Cancel a request.
   */
  cancel(id: string, reason?: string): boolean {
    const request = this.data.items.find(
      (item) => item.id === id && item.status === "pending",
    );
    if (!request) {
      return false;
    }

    const now = new Date().toISOString();
    request.status = "cancelled";
    request.resolutionNotes = reason ?? "Cancelled by system";
    request.resolvedAt = now;
    request.updatedAt = now;

    this.data.stats.totalCancelled++;
    this.save();

    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    this.pruneExpired();

    const pending = this.data.items.filter((i) => i.status === "pending");
    const oldestPending = pending.reduce((oldest, item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return createdAt < oldest ? createdAt : oldest;
    }, Date.now());

    return {
      pending: pending.length,
      approved: this.data.stats.totalApproved,
      rejected: this.data.stats.totalRejected,
      expired: this.data.stats.totalExpired,
      total: this.data.items.length,
      oldestPendingAgeMs: pending.length > 0 ? Date.now() - oldestPending : 0,
    };
  }

  /**
   * Get all items (including resolved).
   */
  getAll(): ApprovalRequest[] {
    return [...this.data.items];
  }

  /**
   * Clear all resolved items (keep pending).
   */
  clearResolved(): number {
    const before = this.data.items.length;
    this.data.items = this.data.items.filter((item) => item.status === "pending");
    this.save();
    return before - this.data.items.length;
  }

  /**
   * Clear all items.
   */
  clearAll(): void {
    this.data.items = [];
    this.save();
  }

  /**
   * Force save to file.
   */
  forceSave(): void {
    this.save();
  }

  /**
   * Reload from file.
   */
  reload(): void {
    this.data = this.load();
  }

  /**
   * Get persisted data (for debugging).
   */
  getPersistedData(): PersistedQueueData {
    return { ...this.data, items: [...this.data.items] };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Load queue from file.
   */
  private load(): PersistedQueueData {
    if (existsSync(this.filePath)) {
      try {
        const content = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(content) as PersistedQueueData;

        // Validate required fields
        if (Array.isArray(parsed.items) && parsed.stats) {
          return parsed;
        }
      } catch {
        // Invalid file, create new
      }
    }

    return this.createDefault();
  }

  /**
   * Save queue to file.
   */
  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.data.lastUpdated = new Date().toISOString();
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  /**
   * Create default queue data.
   */
  private createDefault(): PersistedQueueData {
    return {
      version: "1.0.0",
      items: [],
      lastUpdated: new Date().toISOString(),
      stats: {
        totalApproved: 0,
        totalRejected: 0,
        totalExpired: 0,
        totalCancelled: 0,
      },
    };
  }

  /**
   * Prune expired requests.
   */
  private pruneExpired(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const item of this.data.items) {
      if (item.status === "pending") {
        const expiresAt = new Date(item.expiresAt).getTime();
        if (now > expiresAt) {
          item.status = "expired";
          item.updatedAt = new Date().toISOString();
          item.resolutionNotes = "Auto-expired after 24 hours";
          expiredCount++;
        }
      }
    }

    if (expiredCount > 0) {
      this.data.stats.totalExpired += expiredCount;
      this.save();
    }
  }

  /**
   * Infer risk level from context.
   */
  private inferRiskLevel(context: DecisionContext): RiskLevel {
    if (context.securitySensitive || context.irreversible) {
      return "critical";
    }
    if (context.affectsExternal || (context.costImpact && context.costImpact > 0.5)) {
      return "high";
    }
    if (context.budgetPercentage && context.budgetPercentage > 80) {
      return "high";
    }
    return "medium";
  }

  /**
   * Infer urgency from context.
   */
  private inferUrgency(context: DecisionContext): ApprovalUrgency {
    if (context.irreversible || context.securitySensitive) {
      return "critical";
    }
    if (context.affectsExternal) {
      return "high";
    }
    if (context.budgetPercentage && context.budgetPercentage > 90) {
      return "high";
    }
    return "medium";
  }

  /**
   * Generate human-readable description.
   */
  private generateDescription(context: DecisionContext): string {
    const typeLabel = context.type.replace(/_/g, " ");
    const parts: string[] = [`Request to ${typeLabel}`];

    if (context.description) {
      parts.push(`- ${context.description}`);
    }

    if (context.filesAffected && context.filesAffected.length > 0) {
      parts.push(`- Affects ${context.filesAffected.length} file(s)`);
    }

    if (context.costImpact) {
      parts.push(`- Est. cost: $${context.costImpact.toFixed(2)}`);
    }

    if (context.budgetPercentage) {
      parts.push(`- Budget: ${context.budgetPercentage.toFixed(0)}%`);
    }

    return parts.join("\n");
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an approval queue with default path.
 */
export function createApprovalQueue(
  filePath?: string,
  expiryMs?: number,
): ApprovalQueue {
  return new ApprovalQueue(filePath, expiryMs);
}

/**
 * Check if a request is actionable (pending and not expired).
 */
export function isActionable(request: ApprovalRequest): boolean {
  if (request.status !== "pending") {
    return false;
  }
  const expiresAt = new Date(request.expiresAt).getTime();
  return Date.now() < expiresAt;
}

/**
 * Get time remaining until expiry (ms).
 */
export function getTimeUntilExpiry(request: ApprovalRequest): number {
  const expiresAt = new Date(request.expiresAt).getTime();
  return Math.max(0, expiresAt - Date.now());
}

/**
 * Format request for display.
 */
export function formatRequest(request: ApprovalRequest): string {
  const lines: string[] = [
    `[${request.id}] ${request.urgency.toUpperCase()} - ${request.decisionType}`,
    `Status: ${request.status}`,
    `Risk: ${request.riskLevel}`,
    `Reason: ${request.reason}`,
    `Created: ${request.createdAt}`,
  ];

  if (request.status !== "pending") {
    lines.push(`Resolved by: ${request.resolvedBy}`);
    if (request.resolutionNotes) {
      lines.push(`Notes: ${request.resolutionNotes}`);
    }
  } else {
    const remaining = getTimeUntilExpiry(request);
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    lines.push(`Expires in: ${hours}h ${minutes}m`);
  }

  return lines.join("\n");
}
