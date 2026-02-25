/**
 * Gateway Event Emitter
 *
 * Wires internal systems (BudgetTracker, ApprovalQueue) to WebSocket broadcasts.
 *
 * @module gateway/events
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 44 Day 5
 */

import type { GatewayServer } from "./server.js";
import type {
  GatewayEvent,
  GatewayEventType,
  BudgetUpdateData,
  BudgetWarningData,
  ApprovalPendingData,
  ApprovalResolvedData,
} from "./types.js";
import { recordCost as internalRecordCost } from "./methods/budget.js";
import type { BudgetHistoryEntry, BudgetStatus } from "./methods/budget.js";
import {
  createApprovalRequest as internalCreateApprovalRequest,
  type ApprovalRequest,
  type ApprovalType,
} from "./methods/approval.js";

// ============================================================================
// Event Emitter State
// ============================================================================

/**
 * Active gateway server reference.
 * Set via `setGatewayServer()` during initialization.
 */
let gatewayServer: GatewayServer | null = null;

/**
 * Warning thresholds for budget alerts.
 */
const WARNING_THRESHOLDS = {
  session: 80, // 80% of session budget
  daily: 90, // 90% of daily budget
  monthly: 95, // 95% of monthly budget
};

/**
 * Track which warnings have been sent to avoid spamming.
 */
const sentWarnings = new Set<string>();

// ============================================================================
// Gateway Server Management
// ============================================================================

/**
 * Set the active gateway server for event broadcasting.
 */
export function setGatewayServer(server: GatewayServer | null): void {
  gatewayServer = server;
  // Reset warnings when server changes
  sentWarnings.clear();
}

/**
 * Get the active gateway server.
 */
export function getGatewayServer(): GatewayServer | null {
  return gatewayServer;
}

/**
 * Check if gateway server is available.
 */
export function hasGatewayServer(): boolean {
  return gatewayServer !== null && gatewayServer.isRunning;
}

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit a gateway event to all subscribed clients.
 */
export function emitEvent<T>(
  type: GatewayEventType,
  data: T,
  sessionId?: string
): void {
  if (!hasGatewayServer()) {
    return; // No server to broadcast to
  }

  const event: GatewayEvent<T> = {
    type,
    timestamp: Date.now(),
    data,
  };

  if (sessionId !== undefined) {
    event.sessionId = sessionId;
  }

  gatewayServer!.broadcast(event);
}

// ============================================================================
// Budget Event Wiring
// ============================================================================

/**
 * Record a cost and emit budget events.
 * Wrapper around internal recordCost that adds event emission.
 */
export function recordCostWithEvents(
  entry: Omit<BudgetHistoryEntry, "timestamp">,
  sessionId?: string
): void {
  // Record the cost
  const budgetStatus = internalRecordCost(entry);

  // Emit budget.updated event
  const updateData: BudgetUpdateData = {
    sessionCost: budgetStatus.session.costSoFar,
    sessionLimit: budgetStatus.session.limit,
    dailyCost: budgetStatus.daily.costSoFar,
    dailyLimit: budgetStatus.daily.limit,
    sessionPercentage: budgetStatus.session.percentage,
    dailyPercentage: budgetStatus.daily.percentage,
  };

  emitEvent("budget.updated", updateData, sessionId);

  // Check for warnings
  checkBudgetWarnings(budgetStatus, sessionId);

  // Check for limits
  checkBudgetLimits(budgetStatus, sessionId);
}

/**
 * Check and emit budget warning events.
 */
function checkBudgetWarnings(
  status: BudgetStatus,
  sessionId?: string
): void {
  const warnings: BudgetWarningData[] = [];

  // Session warning
  if (
    status.session.percentage >= WARNING_THRESHOLDS.session &&
    !sentWarnings.has("session")
  ) {
    warnings.push({
      level: "warning",
      scope: "session",
      percentage: status.session.percentage,
      remaining: Math.max(0, status.session.limit - status.session.costSoFar),
      message: `Session budget ${status.session.percentage.toFixed(1)}% used`,
    });
    sentWarnings.add("session");
  }

  // Daily warning
  if (
    status.daily.percentage >= WARNING_THRESHOLDS.daily &&
    !sentWarnings.has("daily")
  ) {
    warnings.push({
      level: "warning",
      scope: "daily",
      percentage: status.daily.percentage,
      remaining: Math.max(0, status.daily.limit - status.daily.costSoFar),
      message: `Daily budget ${status.daily.percentage.toFixed(1)}% used`,
    });
    sentWarnings.add("daily");
  }

  // Monthly warning
  if (
    status.monthly.percentage >= WARNING_THRESHOLDS.monthly &&
    !sentWarnings.has("monthly")
  ) {
    warnings.push({
      level: "warning",
      scope: "monthly",
      percentage: status.monthly.percentage,
      remaining: Math.max(0, status.monthly.limit - status.monthly.costSoFar),
      message: `Monthly budget ${status.monthly.percentage.toFixed(1)}% used`,
    });
    sentWarnings.add("monthly");
  }

  // Emit warnings
  for (const warning of warnings) {
    emitEvent("budget.warning", warning, sessionId);
  }
}

/**
 * Check and emit budget limit events.
 */
function checkBudgetLimits(
  status: BudgetStatus,
  sessionId?: string
): void {
  // Session limit reached
  if (status.session.percentage >= 100 && !sentWarnings.has("session_limit")) {
    emitEvent(
      "budget.limit",
      {
        scope: "session",
        limit: status.session.limit,
        current: status.session.costSoFar,
        message: "Session budget limit reached",
      },
      sessionId
    );
    sentWarnings.add("session_limit");
  }

  // Daily limit reached
  if (status.daily.percentage >= 100 && !sentWarnings.has("daily_limit")) {
    emitEvent(
      "budget.limit",
      {
        scope: "daily",
        limit: status.daily.limit,
        current: status.daily.costSoFar,
        message: "Daily budget limit reached",
      },
      sessionId
    );
    sentWarnings.add("daily_limit");
  }

  // Monthly limit reached
  if (status.monthly.percentage >= 100 && !sentWarnings.has("monthly_limit")) {
    emitEvent(
      "budget.limit",
      {
        scope: "monthly",
        limit: status.monthly.limit,
        current: status.monthly.costSoFar,
        message: "Monthly budget limit reached",
      },
      sessionId
    );
    sentWarnings.add("monthly_limit");
  }
}

/**
 * Reset budget warnings (call when session resets).
 */
export function resetBudgetWarnings(): void {
  sentWarnings.delete("session");
  sentWarnings.delete("session_limit");
}

/**
 * Reset all budget warnings (call on daily/monthly reset).
 */
export function resetAllBudgetWarnings(): void {
  sentWarnings.clear();
}

// ============================================================================
// Approval Event Wiring
// ============================================================================

/**
 * Create an approval request and emit pending event.
 * Wrapper around internal createApprovalRequest that adds event emission.
 */
export function createApprovalRequestWithEvents(
  type: ApprovalType,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    expiresInMs?: number;
    sessionId?: string;
  }
): ApprovalRequest {
  const request = internalCreateApprovalRequest(type, message, options);

  // Emit approval.pending event
  const pendingData: ApprovalPendingData = {
    id: request.id,
    type: request.type,
    message: request.message,
    expiresAt: request.expiresAt,
  };

  if (request.details !== undefined) {
    pendingData.details = request.details;
  }

  emitEvent("approval.pending", pendingData, options?.sessionId);

  return request;
}

/**
 * Emit approval resolved event.
 * Call this after approval.approve or approval.reject.
 */
export function emitApprovalResolved(
  request: ApprovalRequest,
  sessionId?: string
): void {
  const resolvedData: ApprovalResolvedData = {
    id: request.id,
    type: request.type,
    status: request.status,
    resolvedAt: request.respondedAt ?? Date.now(),
  };

  if (request.respondedBy !== undefined) {
    resolvedData.resolvedBy = request.respondedBy;
  }
  if (request.notes !== undefined) {
    resolvedData.notes = request.notes;
  }

  emitEvent("approval.resolved", resolvedData, sessionId);
}

// ============================================================================
// Session Event Helpers
// ============================================================================

/**
 * Emit session started event.
 */
export function emitSessionStarted(
  sessionId: string,
  projectName?: string
): void {
  emitEvent(
    "session.started",
    {
      sessionId,
      projectName,
      startedAt: Date.now(),
    },
    sessionId
  );
}

/**
 * Emit session ended event.
 */
export function emitSessionEnded(
  sessionId: string,
  reason: "completed" | "paused" | "timeout" | "error"
): void {
  emitEvent(
    "session.ended",
    {
      sessionId,
      reason,
      endedAt: Date.now(),
    },
    sessionId
  );
}

// ============================================================================
// Agent Event Helpers
// ============================================================================

/**
 * Emit agent status event.
 */
export function emitAgentStatus(
  agentId: string,
  status: "working" | "idle" | "error",
  currentTask?: string,
  sessionId?: string
): void {
  const data: Record<string, unknown> = {
    agentId,
    status,
    timestamp: Date.now(),
  };

  if (currentTask !== undefined) {
    data.currentTask = currentTask;
  }

  emitEvent("agent.status", data, sessionId);
}

// ============================================================================
// Gate Event Helpers
// ============================================================================

/**
 * Emit gate status event.
 */
export function emitGateStatus(
  gateId: string,
  status: "pending" | "passed" | "failed",
  featureId?: string,
  sessionId?: string
): void {
  const data: Record<string, unknown> = {
    gateId,
    status,
    timestamp: Date.now(),
  };

  if (featureId !== undefined) {
    data.featureId = featureId;
  }

  emitEvent("gate.status", data, sessionId);
}

// ============================================================================
// Notification Helpers
// ============================================================================

/**
 * Emit a notification event.
 */
export function emitNotification(
  title: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
  sessionId?: string
): void {
  emitEvent(
    "notification",
    {
      title,
      message,
      level,
      timestamp: Date.now(),
    },
    sessionId
  );
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear all event state (for testing).
 */
export function clearEventState(): void {
  gatewayServer = null;
  sentWarnings.clear();
}
