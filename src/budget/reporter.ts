/**
 * Budget Reporter
 *
 * Cost summaries, scope formatting, and warning message generation
 * for the BudgetTracker.
 *
 * @module budget/reporter
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import type { BudgetState } from "./types.js";
import { calculateBudgetPercentage } from "./types.js";
import type { CircuitBreaker } from "./circuit-breaker.js";

// ============================================================================
// Exported Types
// ============================================================================

/**
 * Budget status for a single scope (session, daily, track).
 */
export interface BudgetScope {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  thresholdLevel: "normal" | "warning" | "critical" | "limit";
}

/**
 * Complete budget status.
 */
export interface BudgetStatus {
  session: BudgetScope;
  daily: BudgetScope;
  tracks: Record<string, BudgetScope>;
  canProceed: boolean;
  warnings: string[];
}

// ============================================================================
// BudgetReporter
// ============================================================================

/**
 * Generates human-readable budget status snapshots.
 *
 * Extracted from BudgetTracker to keep that class below 900 lines.
 */
export class BudgetReporter {
  private readonly sessionBreaker: CircuitBreaker;
  private readonly dailyBreaker: CircuitBreaker;

  constructor(sessionBreaker: CircuitBreaker, dailyBreaker: CircuitBreaker) {
    this.sessionBreaker = sessionBreaker;
    this.dailyBreaker = dailyBreaker;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Build a full BudgetStatus snapshot from the current state.
   */
  buildStatus(state: BudgetState): BudgetStatus {
    const sessionScope = this.buildScope(state.session.costSoFar, state.session.limit);
    const dailyScope = this.buildScope(state.daily.costSoFar, state.daily.limit);

    const tracks: Record<string, BudgetScope> = {};
    if (state.tracks) {
      for (const [trackId, track] of Object.entries(state.tracks)) {
        tracks[trackId] = this.buildScope(track.costSoFar, track.limit);
      }
    }

    const warnings = this.collectWarnings(sessionScope, dailyScope);

    const canProceed =
      sessionScope.thresholdLevel !== "limit" &&
      dailyScope.thresholdLevel !== "limit" &&
      this.sessionBreaker.canProceed() &&
      this.dailyBreaker.canProceed();

    return { session: sessionScope, daily: dailyScope, tracks, canProceed, warnings };
  }

  /**
   * Build a BudgetScope from a used/limit pair.
   */
  buildScope(used: number, limit: number): BudgetScope {
    const percentage = calculateBudgetPercentage(used, limit);
    const remaining = Math.max(0, limit - used);

    let thresholdLevel: "normal" | "warning" | "critical" | "limit";
    if (percentage >= 100) {
      thresholdLevel = "limit";
    } else if (percentage >= 80) {
      thresholdLevel = "critical";
    } else if (percentage >= 50) {
      thresholdLevel = "warning";
    } else {
      thresholdLevel = "normal";
    }

    return { used, limit, remaining, percentage, thresholdLevel };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private collectWarnings(session: BudgetScope, daily: BudgetScope): string[] {
    const warnings: string[] = [];

    if (session.thresholdLevel === "warning") {
      warnings.push(`Session budget at ${session.percentage.toFixed(0)}%`);
    } else if (session.thresholdLevel === "critical") {
      warnings.push(`Session budget at ${session.percentage.toFixed(0)}% (critical)`);
    }

    if (daily.thresholdLevel === "warning") {
      warnings.push(`Daily budget at ${daily.percentage.toFixed(0)}%`);
    } else if (daily.thresholdLevel === "critical") {
      warnings.push(`Daily budget at ${daily.percentage.toFixed(0)}% (critical)`);
    }

    return warnings;
  }
}
