/**
 * Metrics Collector Tests
 *
 * @module tests/analytics/metrics-collector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  type AgentMetric,
} from "../../src/analytics/metrics-collector.js";

describe("MetricsCollector", () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  describe("Singleton", () => {
    it("should return singleton instance", () => {
      const collector1 = getMetricsCollector();
      const collector2 = getMetricsCollector();
      expect(collector1).toBe(collector2);
    });

    it("should reset singleton", () => {
      const collector1 = getMetricsCollector();
      resetMetricsCollector();
      const collector2 = getMetricsCollector();
      expect(collector1).not.toBe(collector2);
    });
  });

  describe("Session Management", () => {
    it("should start a session", () => {
      const collector = getMetricsCollector();
      const sessionId = collector.startSession();
      expect(sessionId).toContain("session-");
    });

    it("should start a session with custom ID", () => {
      const collector = getMetricsCollector();
      const sessionId = collector.startSession("custom-session");
      expect(sessionId).toBe("custom-session");
    });

    it("should end a session", () => {
      const collector = getMetricsCollector();
      collector.startSession("test-session");
      const session = collector.endSession();
      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe("test-session");
      expect(session?.endTime).toBeDefined();
    });

    it("should return null when ending non-existent session", () => {
      const collector = getMetricsCollector();
      const session = collector.endSession();
      expect(session).toBeNull();
    });
  });

  describe("Recording Invocations", () => {
    it("should record an invocation", () => {
      const collector = getMetricsCollector();
      collector.startSession();

      const metric: AgentMetric = {
        agent: "pm",
        task: "test task",
        mode: "READ",
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        success: true,
        tokenUsage: { input: 100, output: 50 },
        cost: 0.001,
      };

      collector.recordInvocation(metric);
      const session = collector.endSession();

      expect(session?.invocations).toHaveLength(1);
      expect(session?.totalCost).toBe(0.001);
      expect(session?.totalTokens).toBe(150);
    });

    it("should calculate duration if not set", () => {
      const collector = getMetricsCollector();
      collector.startSession();

      const startTime = Date.now() - 1000;
      const endTime = Date.now();
      const metric: AgentMetric = {
        agent: "coder",
        task: "implement feature",
        mode: "PATCH",
        startTime,
        endTime,
        success: true,
      };

      collector.recordInvocation(metric);
      const session = collector.endSession();

      expect(session?.invocations[0].durationMs).toBe(endTime - startTime);
    });
  });

  describe("Analytics Summary", () => {
    it("should return summary for today", () => {
      const collector = getMetricsCollector();
      const summary = collector.getSummary("today");

      expect(summary.period).toBe("today");
      expect(summary.totalInvocations).toBeGreaterThanOrEqual(0);
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
      expect(summary.successRate).toBeLessThanOrEqual(100);
    });

    it("should return summary for week", () => {
      const collector = getMetricsCollector();
      const summary = collector.getSummary("week");

      expect(summary.period).toBe("week");
    });

    it("should return summary for month", () => {
      const collector = getMetricsCollector();
      const summary = collector.getSummary("month");

      expect(summary.period).toBe("month");
    });

    it("should have cost and usage trends", () => {
      const collector = getMetricsCollector();
      const summary = collector.getSummary("week");

      expect(summary.costTrend).toBeDefined();
      expect(summary.usageTrend).toBeDefined();
      expect(Array.isArray(summary.costTrend)).toBe(true);
      expect(Array.isArray(summary.usageTrend)).toBe(true);
    });
  });

  describe("Format Summary", () => {
    it("should format summary for display", () => {
      const collector = getMetricsCollector();
      const summary = collector.getSummary("today");
      const formatted = collector.formatSummary(summary);

      expect(formatted).toContain("Analytics Summary");
      expect(formatted).toContain("Usage:");
      expect(formatted).toContain("Cost:");
    });
  });
});
