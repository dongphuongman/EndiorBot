/**
 * RetentionTracker Tests — Sprint 97
 *
 * Tests retention rate calculation, validation against ≥95% target,
 * session history, aggregate metrics, and mid-session refresh.
 *
 * CTO F2: retention = selectedTokens / gatedTokens.
 *
 * @module tests/context/transfer/retention-tracker
 * @sprint 97
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RetentionTracker,
  getRetentionTracker,
  resetRetentionTracker,
} from "../../../src/context/transfer/retention-tracker.js";
import type {
  ContextSelectionResult,
  TransferableContext,
  TransferContextType,
} from "../../../src/context/transfer/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeContext(
  id: string,
  type: TransferContextType,
  tokenCount: number,
): TransferableContext {
  return {
    id,
    projectId: "test-project",
    sourceSessionId: "session-0",
    type,
    content: "x".repeat(tokenCount * 4),
    tokenCount,
    quality: {
      relevance: 0.8,
      recency: 0.9,
      confidence: 0.7,
      completeness: 1.0,
      composite: 0.8,
    },
    tags: ["test"],
    createdAt: new Date().toISOString(),
    metadata: {},
  };
}

function makeResult(
  selectedTokens: number,
  gatedTokens: number,
  selectedCount: number,
  droppedCount: number,
): ContextSelectionResult {
  const selected: TransferableContext[] = [];
  const dropped: TransferableContext[] = [];

  // Build selected contexts
  const perCtxTokens = selectedCount > 0 ? Math.floor(selectedTokens / selectedCount) : 0;
  for (let i = 0; i < selectedCount; i++) {
    selected.push(makeContext(`sel-${i}`, "decision", perCtxTokens));
  }

  // Build dropped contexts
  const droppedTokens = gatedTokens - selectedTokens;
  const perDropTokens = droppedCount > 0 ? Math.floor(droppedTokens / droppedCount) : 0;
  for (let i = 0; i < droppedCount; i++) {
    dropped.push(makeContext(`drop-${i}`, "task_output", perDropTokens));
  }

  return {
    selected,
    dropped,
    totalTokens: selectedTokens,
    budgetUtilization: selectedTokens / 600,
    retentionRate: gatedTokens > 0 ? selectedTokens / gatedTokens : 0,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RetentionTracker", () => {
  let tracker: RetentionTracker;

  beforeEach(() => {
    resetRetentionTracker();
    tracker = new RetentionTracker();
  });

  // --------------------------------------------------------------------------
  // Record injection
  // --------------------------------------------------------------------------

  describe("recordInjection", () => {
    it("should calculate retention rate from selection result", () => {
      // 480 selected of 500 gated → 96% retention
      const result = makeResult(480, 500, 3, 1);
      const metrics = tracker.recordInjection("session-1", "project-1", result);

      expect(metrics.retentionRate).toBeCloseTo(0.96, 2);
      expect(metrics.level).toBe("pass");
      expect(metrics.passed).toBe(true);
    });

    it("should report 100% retention when all gated selected", () => {
      const result = makeResult(400, 400, 2, 0);
      const metrics = tracker.recordInjection("session-1", "project-1", result);

      expect(metrics.retentionRate).toBeCloseTo(1.0, 2);
      expect(metrics.passed).toBe(true);
    });

    it("should report partial retention when over budget", () => {
      // 500 selected of 800 gated → 62.5% retention
      const result = makeResult(500, 800, 3, 2);
      const metrics = tracker.recordInjection("session-1", "project-1", result);

      expect(metrics.retentionRate).toBeCloseTo(0.625, 2);
      expect(metrics.level).toBe("critical");
      expect(metrics.passed).toBe(false);
    });

    it("should handle zero contexts", () => {
      const result = makeResult(0, 0, 0, 0);
      const metrics = tracker.recordInjection("session-1", "project-1", result);

      expect(metrics.retentionRate).toBe(0);
      expect(metrics.level).toBe("critical");
      expect(metrics.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Validate retention
  // --------------------------------------------------------------------------

  describe("validateRetention", () => {
    it("should pass at 95%", () => {
      const result = makeResult(570, 600, 3, 0);
      tracker.recordInjection("session-1", "project-1", result);

      const validation = tracker.validateRetention();
      expect(validation.passed).toBe(true);
      expect(validation.level).toBe("pass");
    });

    it("should fail below 95%", () => {
      const result = makeResult(400, 600, 2, 1);
      tracker.recordInjection("session-1", "project-1", result);

      const validation = tracker.validateRetention();
      expect(validation.passed).toBe(false);
    });

    it("should classify as warning between 80-90%", () => {
      // 540 of 600 = 90%
      const result = makeResult(540, 600, 3, 0);
      tracker.recordInjection("session-1", "project-1", result);

      const validation = tracker.validateRetention();
      expect(validation.level).toBe("warning");
    });

    it("should classify as critical below 80%", () => {
      const result = makeResult(300, 600, 2, 2);
      tracker.recordInjection("session-1", "project-1", result);

      const validation = tracker.validateRetention();
      expect(validation.level).toBe("critical");
    });
  });

  // --------------------------------------------------------------------------
  // Session metrics
  // --------------------------------------------------------------------------

  describe("getSessionMetrics", () => {
    it("should return current session metrics", () => {
      const result = makeResult(480, 500, 3, 1);
      tracker.recordInjection("session-1", "project-1", result);

      const metrics = tracker.getSessionMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.sessionId).toBe("session-1");
      expect(metrics!.selectedTokens).toBe(480);
    });

    it("should return undefined before injection", () => {
      expect(tracker.getSessionMetrics()).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Mid-session refresh
  // --------------------------------------------------------------------------

  describe("recordRefresh", () => {
    it("should update retention rate on refresh", () => {
      const initial = makeResult(400, 500, 2, 1);
      tracker.recordInjection("session-1", "project-1", initial);

      const refreshed = makeResult(480, 500, 3, 0);
      tracker.recordRefresh(refreshed);

      const metrics = tracker.getSessionMetrics();
      expect(metrics!.retentionRate).toBeCloseTo(0.96, 2);
      expect(metrics!.refreshCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Session end + history
  // --------------------------------------------------------------------------

  describe("recordSessionEnd", () => {
    it("should persist metrics to history", () => {
      const result = makeResult(480, 500, 3, 1);
      tracker.recordInjection("session-1", "project-1", result);

      const final = tracker.recordSessionEnd();

      expect(final).toBeDefined();
      expect(final!.sessionId).toBe("session-1");
      expect(tracker.getSessionMetrics()).toBeUndefined();
    });

    it("should return undefined if no current session", () => {
      expect(tracker.recordSessionEnd()).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Aggregate metrics
  // --------------------------------------------------------------------------

  describe("getAggregateMetrics", () => {
    it("should calculate average retention across sessions", () => {
      // Session 1: 96% (pass)
      tracker.recordInjection("s1", "p1", makeResult(480, 500, 3, 1));
      tracker.recordSessionEnd();

      // Session 2: 100% (pass)
      tracker.recordInjection("s2", "p1", makeResult(400, 400, 2, 0));
      tracker.recordSessionEnd();

      const agg = tracker.getAggregateMetrics();
      expect(agg.sessionsTracked).toBe(2);
      expect(agg.sessionsPassed).toBe(2);
      expect(agg.averageRetention).toBeGreaterThan(0.95);
    });

    it("should return defaults for empty history", () => {
      const agg = tracker.getAggregateMetrics();
      expect(agg.sessionsTracked).toBe(0);
      expect(agg.averageRetention).toBe(0);
      expect(agg.sessionsPassed).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Retention history
  // --------------------------------------------------------------------------

  describe("getRetentionHistory", () => {
    it("should return last N sessions", () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordInjection(`s${i}`, "p1", makeResult(480, 500, 3, 1));
        tracker.recordSessionEnd();
      }

      expect(tracker.getRetentionHistory()).toHaveLength(5);
      expect(tracker.getRetentionHistory(3)).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getRetentionTracker should return consistent instance", () => {
      resetRetentionTracker();
      const a = getRetentionTracker();
      const b = getRetentionTracker();
      expect(a).toBe(b);
    });
  });
});
