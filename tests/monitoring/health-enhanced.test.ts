/**
 * Health Enhancement Tests — Sprint 94 D5
 *
 * Tests OTT adapter metrics, channel router metrics,
 * and enhanced collectHealthReport.
 *
 * @module tests/monitoring/health-enhanced
 * @sprint 94
 */

import { describe, it, expect } from "vitest";
import {
  getOttAdapterMetrics,
  getChannelRouterMetrics,
  collectHealthReport,
} from "../../src/monitoring/metrics.js";

// ============================================================================
// OTT Adapter Metrics
// ============================================================================

describe("getOttAdapterMetrics", () => {
  it("should return adapter status array", () => {
    const metrics = getOttAdapterMetrics(["telegram"]);

    expect(metrics.length).toBe(2); // telegram + zalo (defaults)
    const tg = metrics.find((m) => m.name === "telegram");
    expect(tg?.status).toBe("running");

    const zalo = metrics.find((m) => m.name === "zalo");
    expect(zalo?.status).toBe("stopped");
  });

  it("should mark all as running when all listed", () => {
    const metrics = getOttAdapterMetrics(["telegram", "zalo"]);
    expect(metrics.every((m) => m.status === "running")).toBe(true);
  });

  it("should mark all as stopped when none running", () => {
    const metrics = getOttAdapterMetrics([]);
    expect(metrics.every((m) => m.status === "stopped")).toBe(true);
  });
});

// ============================================================================
// Channel Router Metrics
// ============================================================================

describe("getChannelRouterMetrics", () => {
  it("should return router readiness and provider count", () => {
    const metrics = getChannelRouterMetrics(true, 3);
    expect(metrics.routerReady).toBe(true);
    expect(metrics.providerCount).toBe(3);
  });

  it("should report not ready with zero providers", () => {
    const metrics = getChannelRouterMetrics(false, 0);
    expect(metrics.routerReady).toBe(false);
    expect(metrics.providerCount).toBe(0);
  });
});

// ============================================================================
// Enhanced collectHealthReport
// ============================================================================

describe("collectHealthReport — enhanced", () => {
  it("should include ottAdapters and channelRouter when options provided", async () => {
    const stats = {
      totalConnections: 5,
      activeConnections: 2,
      messagesReceived: 100,
      messagesSent: 80,
    };

    const report = await collectHealthReport(stats, 10, {
      ottAdapterNames: ["telegram"],
      channelRouterInfo: { routerReady: true, providerCount: 2 },
    });

    expect(report.status).toBeDefined();
    expect(report.ottAdapters).toBeDefined();
    expect(report.ottAdapters?.length).toBe(2);
    expect(report.channelRouter).toBeDefined();
    expect(report.channelRouter?.routerReady).toBe(true);
    expect(report.channelRouter?.providerCount).toBe(2);
  });

  it("should not include optional fields when not provided", async () => {
    const stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
    };

    const report = await collectHealthReport(stats, 5);
    expect(report.ottAdapters).toBeUndefined();
    expect(report.channelRouter).toBeUndefined();
  });
});
