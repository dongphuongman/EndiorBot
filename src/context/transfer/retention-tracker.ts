/**
 * Retention Tracker — Sprint 97
 *
 * Tracks per-session context retention rate and validates against
 * the T3 target (≥95%).
 *
 * CTO F2: retention = selectedTokens / gatedTokens (not total available).
 * This makes ≥95% achievable — quality gate filters stale entries first,
 * retention measures "of the good stuff, how much did we keep?"
 *
 * @module context/transfer/retention-tracker
 * @version 1.0.0
 * @sprint 97
 */

import type {
  RetentionMetrics,
  RetentionLevel,
  ContextSelectionResult,
} from "./types.js";
import { RETENTION_THRESHOLDS } from "./types.js";

// ============================================================================
// RetentionTracker
// ============================================================================

export interface RetentionTrackerOptions {
  /** Target retention rate (default: 0.95) */
  target?: number;
  /** Max history entries to keep */
  maxHistory?: number;
}

export class RetentionTracker {
  private readonly target: number;
  private readonly maxHistory: number;
  private currentMetrics: RetentionMetrics | undefined;
  private history: RetentionMetrics[];

  constructor(options?: RetentionTrackerOptions) {
    this.target = options?.target ?? RETENTION_THRESHOLDS.pass;
    this.maxHistory = options?.maxHistory ?? 50;
    this.history = [];
  }

  /**
   * Record injection result and calculate retention rate.
   *
   * CTO F2: retention = selectedTokens / gatedTokens.
   * gatedTokens = selected + dropped-by-budget (excludes gate-failed).
   */
  recordInjection(
    sessionId: string,
    projectId: string,
    result: ContextSelectionResult,
  ): RetentionMetrics {
    // CTO F2: retentionRate is already calculated correctly in ContextSelector
    // (selectedTokens / gatedTokens after Sprint 97 fix)
    const retentionRate = result.retentionRate;
    const level = this.classifyLevel(retentionRate);

    const metrics: RetentionMetrics = {
      sessionId,
      projectId,
      retentionRate,
      level,
      target: this.target,
      passed: retentionRate >= this.target,
      totalAvailableTokens: result.selected.reduce((s, c) => s + c.tokenCount, 0)
        + result.dropped.reduce((s, c) => s + c.tokenCount, 0),
      gatedTokens: this.calculateGatedTokens(result),
      selectedTokens: result.totalTokens,
      refreshCount: 0,
      timestamp: new Date().toISOString(),
    };

    this.currentMetrics = metrics;
    return metrics;
  }

  /**
   * Validate current retention against target.
   */
  validateRetention(): { passed: boolean; level: RetentionLevel; rate: number } {
    const rate = this.currentMetrics?.retentionRate ?? 0;
    const level = this.classifyLevel(rate);
    return {
      passed: rate >= this.target,
      level,
      rate,
    };
  }

  /**
   * Record a mid-session refresh update.
   */
  recordRefresh(updatedResult: ContextSelectionResult): void {
    if (this.currentMetrics) {
      this.currentMetrics.retentionRate = updatedResult.retentionRate;
      this.currentMetrics.level = this.classifyLevel(updatedResult.retentionRate);
      this.currentMetrics.passed = updatedResult.retentionRate >= this.target;
      this.currentMetrics.selectedTokens = updatedResult.totalTokens;
      this.currentMetrics.gatedTokens = this.calculateGatedTokens(updatedResult);
      this.currentMetrics.refreshCount += 1;
    }
  }

  /**
   * Record session end — persist metrics to history.
   */
  recordSessionEnd(): RetentionMetrics | undefined {
    if (!this.currentMetrics) return undefined;

    const finalMetrics = { ...this.currentMetrics };
    this.history.push(finalMetrics);

    // Trim history to max
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.currentMetrics = undefined;
    return finalMetrics;
  }

  /**
   * Get current session metrics.
   */
  getSessionMetrics(): RetentionMetrics | undefined {
    return this.currentMetrics;
  }

  /**
   * Get aggregate metrics across session history.
   */
  getAggregateMetrics(): {
    averageRetention: number;
    sessionsTracked: number;
    sessionsPassed: number;
    sessionsWarning: number;
    sessionsCritical: number;
  } {
    if (this.history.length === 0) {
      return {
        averageRetention: 0,
        sessionsTracked: 0,
        sessionsPassed: 0,
        sessionsWarning: 0,
        sessionsCritical: 0,
      };
    }

    const total = this.history.reduce((sum, m) => sum + m.retentionRate, 0);

    return {
      averageRetention: total / this.history.length,
      sessionsTracked: this.history.length,
      sessionsPassed: this.history.filter((m) => m.level === "pass").length,
      sessionsWarning: this.history.filter((m) => m.level === "warning").length,
      sessionsCritical: this.history.filter((m) => m.level === "critical").length,
    };
  }

  /**
   * Get retention history for last N sessions.
   */
  getRetentionHistory(limit?: number): RetentionMetrics[] {
    const n = limit ?? this.history.length;
    return this.history.slice(-n);
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private classifyLevel(rate: number): RetentionLevel {
    if (rate >= RETENTION_THRESHOLDS.pass) return "pass";
    if (rate >= RETENTION_THRESHOLDS.warning) return "warning";
    return "critical";
  }

  /**
   * Calculate gated tokens from selection result.
   * Gated = selected + dropped-by-budget (quality gate already filtered out bad ones).
   * The ContextSelector puts gate-failed in dropped too, but retentionRate
   * is already calculated as selectedTokens / gatedTokens in the selector.
   */
  private calculateGatedTokens(result: ContextSelectionResult): number {
    // retentionRate = selectedTokens / gatedTokens
    // So gatedTokens = selectedTokens / retentionRate (if retentionRate > 0)
    if (result.retentionRate > 0) {
      return Math.round(result.totalTokens / result.retentionRate);
    }
    return 0;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalTracker: RetentionTracker | undefined;

export function getRetentionTracker(): RetentionTracker {
  if (!globalTracker) {
    globalTracker = new RetentionTracker();
  }
  return globalTracker;
}

export function resetRetentionTracker(): void {
  globalTracker = undefined;
}
