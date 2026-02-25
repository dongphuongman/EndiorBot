/**
 * Gateway Budget Methods
 *
 * JSON-RPC methods for budget tracking and management.
 *
 * @module gateway/methods/budget
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
 * Budget status information.
 */
export interface BudgetStatus {
  session: {
    costSoFar: number;
    limit: number;
    percentage: number;
  };
  daily: {
    costSoFar: number;
    limit: number;
    percentage: number;
    resetAt: number; // Unix timestamp
  };
  monthly: {
    costSoFar: number;
    limit: number;
    percentage: number;
    resetAt: number;
  };
}

/**
 * Budget history entry.
 */
export interface BudgetHistoryEntry {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessionId?: string;
}

/**
 * Budget state (in-memory for now).
 * TODO: Wire to actual BudgetTracker in Sprint 44 Day 5+
 */
let budgetState: BudgetStatus = {
  session: { costSoFar: 0, limit: 2.0, percentage: 0 },
  daily: {
    costSoFar: 0,
    limit: 10.0,
    percentage: 0,
    resetAt: getNextMidnight(),
  },
  monthly: {
    costSoFar: 0,
    limit: 100.0,
    percentage: 0,
    resetAt: getNextMonthStart(),
  },
};

const budgetHistory: BudgetHistoryEntry[] = [];

// ============================================================================
// Helpers
// ============================================================================

function getNextMidnight(): number {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

function getNextMonthStart(): number {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);
  return nextMonth.getTime();
}

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get current budget status.
 */
function handleBudgetGet(
  _params: unknown,
  _client: ClientInfo
): BudgetStatus {
  // Recalculate percentages
  budgetState.session.percentage = budgetState.session.limit > 0
    ? (budgetState.session.costSoFar / budgetState.session.limit) * 100
    : 0;
  budgetState.daily.percentage = budgetState.daily.limit > 0
    ? (budgetState.daily.costSoFar / budgetState.daily.limit) * 100
    : 0;
  budgetState.monthly.percentage = budgetState.monthly.limit > 0
    ? (budgetState.monthly.costSoFar / budgetState.monthly.limit) * 100
    : 0;

  return budgetState;
}

/**
 * Get remaining budget.
 */
function handleBudgetRemaining(
  _params: unknown,
  _client: ClientInfo
): {
  session: number;
  daily: number;
  monthly: number;
} {
  return {
    session: Math.max(0, budgetState.session.limit - budgetState.session.costSoFar),
    daily: Math.max(0, budgetState.daily.limit - budgetState.daily.costSoFar),
    monthly: Math.max(0, budgetState.monthly.limit - budgetState.monthly.costSoFar),
  };
}

/**
 * Get budget history.
 */
function handleBudgetHistory(
  params: unknown,
  _client: ClientInfo
): { entries: BudgetHistoryEntry[]; total: number } {
  const { limit = 50, offset = 0, startDate, endDate } = (params ?? {}) as {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  };

  let entries = [...budgetHistory];

  // Filter by date range
  if (startDate) {
    const start = new Date(startDate).getTime();
    entries = entries.filter((e) => e.timestamp >= start);
  }
  if (endDate) {
    const end = new Date(endDate).getTime();
    entries = entries.filter((e) => e.timestamp <= end);
  }

  // Sort by timestamp descending
  entries.sort((a, b) => b.timestamp - a.timestamp);

  const total = entries.length;
  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * Update budget limits.
 */
function handleBudgetSetLimits(
  params: unknown,
  _client: ClientInfo
): { success: boolean; budget: BudgetStatus } {
  const { session, daily, monthly } = (params ?? {}) as {
    session?: number;
    daily?: number;
    monthly?: number;
  };

  if (session !== undefined && session >= 0) {
    budgetState.session.limit = session;
  }
  if (daily !== undefined && daily >= 0) {
    budgetState.daily.limit = daily;
  }
  if (monthly !== undefined && monthly >= 0) {
    budgetState.monthly.limit = monthly;
  }

  return { success: true, budget: handleBudgetGet(null, _client) };
}

/**
 * Reset session budget (for new session).
 */
function handleBudgetResetSession(
  _params: unknown,
  _client: ClientInfo
): { success: boolean; budget: BudgetStatus } {
  budgetState.session.costSoFar = 0;
  budgetState.session.percentage = 0;

  return { success: true, budget: handleBudgetGet(null, _client) };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register budget methods with the gateway server.
 */
export function registerBudgetMethods(server: GatewayServer): void {
  server.registerMethod("budget.get", handleBudgetGet);
  server.registerMethod("budget.remaining", handleBudgetRemaining);
  server.registerMethod("budget.history", handleBudgetHistory);
  server.registerMethod("budget.setLimits", handleBudgetSetLimits);
  server.registerMethod("budget.resetSession", handleBudgetResetSession);
}

// ============================================================================
// Internal API (for event emission from BudgetTracker)
// ============================================================================

/**
 * Record a cost event (called by BudgetTracker).
 */
export function recordCost(entry: Omit<BudgetHistoryEntry, "timestamp">): BudgetStatus {
  const fullEntry: BudgetHistoryEntry = {
    ...entry,
    timestamp: Date.now(),
  };

  budgetHistory.push(fullEntry);

  // Update state
  budgetState.session.costSoFar += entry.cost;
  budgetState.daily.costSoFar += entry.cost;
  budgetState.monthly.costSoFar += entry.cost;

  // Check for resets
  const now = Date.now();
  if (now >= budgetState.daily.resetAt) {
    budgetState.daily.costSoFar = entry.cost;
    budgetState.daily.resetAt = getNextMidnight();
  }
  if (now >= budgetState.monthly.resetAt) {
    budgetState.monthly.costSoFar = entry.cost;
    budgetState.monthly.resetAt = getNextMonthStart();
  }

  return handleBudgetGet(null, {} as ClientInfo);
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Reset budget state (for testing).
 */
export function resetBudgetState(): void {
  budgetState = {
    session: { costSoFar: 0, limit: 2.0, percentage: 0 },
    daily: {
      costSoFar: 0,
      limit: 10.0,
      percentage: 0,
      resetAt: getNextMidnight(),
    },
    monthly: {
      costSoFar: 0,
      limit: 100.0,
      percentage: 0,
      resetAt: getNextMonthStart(),
    },
  };
  budgetHistory.length = 0;
}

/**
 * Get current budget state (for testing).
 */
export function getBudgetState(): BudgetStatus {
  return budgetState;
}
