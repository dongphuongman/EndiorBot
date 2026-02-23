/**
 * Pattern Analytics Tests
 *
 * @module tests/agents/routing/pattern-analytics
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PatternAnalytics,
  createPatternAnalytics,
  resetPatternAnalytics,
} from "../../../src/agents/routing/pattern-analytics.js";
import {
  resetPatternManager,
} from "../../../src/agents/fix-logging/index.js";

describe("PatternAnalytics", () => {
  let analytics: PatternAnalytics;

  beforeEach(async () => {
    // Reset singletons
    resetPatternAnalytics();
    resetPatternManager();

    analytics = createPatternAnalytics();
  });

  afterEach(() => {
    resetPatternAnalytics();
    resetPatternManager();
  });

  describe("getAllPatternMetrics", () => {
    it("should return metrics for all patterns", async () => {
      const metrics = await analytics.getAllPatternMetrics();

      // Should have default patterns
      expect(metrics.length).toBeGreaterThan(0);

      // Each metric should have required fields
      for (const metric of metrics) {
        expect(metric.patternId).toBeDefined();
        expect(typeof metric.successRate).toBe("number");
        expect(typeof metric.appliedCount).toBe("number");
        expect(typeof metric.escalationRate).toBe("number");
        expect(metric.category).toBeDefined();
        expect(metric.errorCode).toBeDefined();
      }
    });

    it("should calculate escalation rate", async () => {
      const metrics = await analytics.getAllPatternMetrics();

      // All metrics should have valid escalation rate
      for (const metric of metrics) {
        expect(typeof metric.escalationRate).toBe("number");
        expect(metric.escalationRate).toBeGreaterThanOrEqual(0);
        expect(metric.escalationRate).toBeLessThanOrEqual(1);
      }
    });

    it("should include trend information", async () => {
      const metrics = await analytics.getAllPatternMetrics();

      for (const metric of metrics) {
        expect(["improving", "stable", "declining"]).toContain(metric.trend);
      }
    });
  });

  describe("getPatternMetricsByCategory", () => {
    it("should filter by TYPE category", async () => {
      const typeMetrics = await analytics.getPatternMetricsByCategory("TYPE");

      expect(typeMetrics.length).toBeGreaterThan(0);
      expect(typeMetrics.every((m) => m.category === "TYPE")).toBe(true);
    });

    it("should filter by LINT category", async () => {
      const lintMetrics = await analytics.getPatternMetricsByCategory("LINT");

      expect(lintMetrics.length).toBeGreaterThan(0);
      expect(lintMetrics.every((m) => m.category === "LINT")).toBe(true);
    });

    it("should return empty for unknown category", async () => {
      const metrics = await analytics.getPatternMetricsByCategory("UNKNOWN");
      expect(metrics.length).toBe(0);
    });
  });

  describe("getProblematicPatterns", () => {
    it("should return array of problematic patterns", async () => {
      const problematic = await analytics.getProblematicPatterns();

      expect(Array.isArray(problematic)).toBe(true);

      // Any problematic patterns should meet the criteria
      for (const pattern of problematic) {
        expect(pattern.appliedCount).toBeGreaterThanOrEqual(10);
        // Either low success rate or high escalation rate
        expect(
          pattern.successRate < 0.5 || pattern.escalationRate > 0.3
        ).toBe(true);
      }
    });
  });

  describe("getTopPatterns", () => {
    it("should return patterns sorted by success rate", async () => {
      const top = await analytics.getTopPatterns(5);

      // Should be sorted descending by success rate
      for (let i = 0; i < top.length - 1; i++) {
        expect(top[i]!.successRate).toBeGreaterThanOrEqual(top[i + 1]!.successRate);
      }
    });

    it("should respect limit parameter", async () => {
      const top = await analytics.getTopPatterns(3);
      expect(top.length).toBeLessThanOrEqual(3);
    });

    it("should default to 10 patterns", async () => {
      const top = await analytics.getTopPatterns();
      expect(top.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getTaskTypeAnalytics", () => {
    it("should return analytics for all task types", async () => {
      const result = await analytics.getTaskTypeAnalytics();

      expect(result.code_gen).toBeDefined();
      expect(result.bug_fix).toBeDefined();
      expect(result.architecture).toBeDefined();
      expect(result.security).toBeDefined();
      expect(result.research).toBeDefined();
      expect(result.general).toBeDefined();
    });

    it("should have valid analytics structure", async () => {
      const result = await analytics.getTaskTypeAnalytics();

      for (const taskType of ["code_gen", "bug_fix", "architecture", "security", "research", "general"] as const) {
        const analytics = result[taskType];
        expect(analytics.taskType).toBe(taskType);
        expect(typeof analytics.successRate).toBe("number");
        expect(typeof analytics.totalApplications).toBe("number");
        expect(typeof analytics.escalationRate).toBe("number");
        expect(typeof analytics.patternCount).toBe("number");
        expect(["improving", "stable", "declining"]).toContain(analytics.trend);
      }
    });

    it("should map TYPE/LINT/BUILD to code_gen", async () => {
      const result = await analytics.getTaskTypeAnalytics();

      // code_gen should have patterns (from TYPE, LINT, BUILD categories)
      expect(result.code_gen.patternCount).toBeGreaterThan(0);
    });
  });

  describe("getSummary", () => {
    it("should return complete analytics summary", async () => {
      const summary = await analytics.getSummary();

      expect(summary.totalPatterns).toBeGreaterThan(0);
      expect(typeof summary.avgSuccessRate).toBe("number");
      expect(typeof summary.totalApplications).toBe("number");
      expect(typeof summary.problematicCount).toBe("number");
      expect(summary.byTaskType).toBeDefined();
      expect(summary.generatedAt).toBeDefined();
    });

    it("should have valid timestamp", async () => {
      const summary = await analytics.getSummary();

      const timestamp = new Date(summary.generatedAt);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe("generateAdjustmentRecommendations", () => {
    it("should return array of recommendations", async () => {
      const recommendations = await analytics.generateAdjustmentRecommendations();

      expect(Array.isArray(recommendations)).toBe(true);

      for (const rec of recommendations) {
        expect(rec.taskType).toBeDefined();
        expect(typeof rec.adjustmentMagnitude).toBe("number");
        expect(["upgrade", "downgrade", "no_change"]).toContain(rec.recommendation);
        expect(typeof rec.reason).toBe("string");
        expect(Array.isArray(rec.affectedPatterns)).toBe(true);
      }
    });
  });

  describe("configuration", () => {
    it("should use default configuration", () => {
      const defaultAnalytics = createPatternAnalytics();
      expect(defaultAnalytics).toBeDefined();
    });

    it("should accept custom configuration", () => {
      const customAnalytics = createPatternAnalytics({
        lookbackDays: 14,
        minSamplesForTrend: 20,
      });
      expect(customAnalytics).toBeDefined();
    });
  });
});
