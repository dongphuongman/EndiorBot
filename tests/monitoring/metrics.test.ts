/**
 * Metrics Collector Tests
 *
 * Tests for health monitoring and metrics collection.
 *
 * @module tests/monitoring/metrics.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMemoryMetrics,
  getBrainMetrics,
  getGatewayMetrics,
  calculateOverallStatus,
  collectHealthReport,
} from "../../src/monitoring/index.js";
import type { ConnectionStats } from "../../src/gateway/types.js";

// ============================================================================
// Memory Metrics Tests
// ============================================================================

describe("getMemoryMetrics", () => {
  it("should return memory usage information", () => {
    const metrics = getMemoryMetrics();

    expect(metrics).toHaveProperty("heapUsed");
    expect(metrics).toHaveProperty("heapTotal");
    expect(metrics).toHaveProperty("rss");
    expect(metrics).toHaveProperty("external");

    expect(typeof metrics.heapUsed).toBe("number");
    expect(typeof metrics.heapTotal).toBe("number");
    expect(typeof metrics.rss).toBe("number");
    expect(typeof metrics.external).toBe("number");

    expect(metrics.heapUsed).toBeGreaterThan(0);
    expect(metrics.heapTotal).toBeGreaterThan(0);
    expect(metrics.rss).toBeGreaterThan(0);
  });
});

// ============================================================================
// Brain Metrics Tests
// ============================================================================

describe("getBrainMetrics", () => {
  it("should return brain health info", () => {
    const metrics = getBrainMetrics();

    expect(metrics).toHaveProperty("initialized");
    expect(metrics).toHaveProperty("layerCounts");
    expect(typeof metrics.initialized).toBe("boolean");

    expect(metrics.layerCounts).toHaveProperty("events");
    expect(metrics.layerCounts).toHaveProperty("patterns");
    expect(metrics.layerCounts).toHaveProperty("structures");
    expect(metrics.layerCounts).toHaveProperty("mentalModels");
  });
});

// ============================================================================
// Gateway Metrics Tests
// ============================================================================

describe("getGatewayMetrics", () => {
  it("should return gateway health info from stats", () => {
    const stats: ConnectionStats = {
      totalConnections: 10,
      activeConnections: 3,
      messagesReceived: 100,
      messagesSent: 150,
      startedAt: new Date(),
    };

    const metrics = getGatewayMetrics(stats, 42);

    expect(metrics.activeConnections).toBe(3);
    expect(metrics.methodCount).toBe(42);
    expect(metrics.messagesReceived).toBe(100);
    expect(metrics.messagesSent).toBe(150);
  });
});

// ============================================================================
// Status Calculation Tests
// ============================================================================

describe("calculateOverallStatus", () => {
  const healthyProviders = {
    anthropic: { healthy: true },
    openai: { healthy: true },
  };

  const degradedProviders = {
    anthropic: { healthy: true },
    openai: { healthy: false, lastError: "Rate limited" },
  };

  const unhealthyProviders = {
    anthropic: { healthy: false, lastError: "Auth failed" },
    openai: { healthy: false, lastError: "Rate limited" },
  };

  const normalBrain = {
    initialized: true,
    layerCounts: { events: 10, patterns: 5, structures: 3, mentalModels: 2 },
  };

  const uninitializedBrain = {
    initialized: false,
    layerCounts: { events: 0, patterns: 0, structures: 0, mentalModels: 0 },
  };

  const normalGateway = {
    activeConnections: 5,
    methodCount: 42,
    messagesReceived: 100,
    messagesSent: 150,
  };

  const normalMemory = {
    heapUsed: 50 * 1024 * 1024,
    heapTotal: 100 * 1024 * 1024,
    rss: 150 * 1024 * 1024,
    external: 5 * 1024 * 1024,
  };

  const highMemory = {
    heapUsed: 92 * 1024 * 1024,
    heapTotal: 100 * 1024 * 1024,
    rss: 150 * 1024 * 1024,
    external: 5 * 1024 * 1024,
  };

  const criticalMemory = {
    heapUsed: 96 * 1024 * 1024,
    heapTotal: 100 * 1024 * 1024,
    rss: 150 * 1024 * 1024,
    external: 5 * 1024 * 1024,
  };

  it("should return healthy when all components are healthy", () => {
    const status = calculateOverallStatus(
      healthyProviders,
      normalBrain,
      normalGateway,
      normalMemory
    );
    expect(status).toBe("healthy");
  });

  it("should return degraded when some providers are unhealthy", () => {
    const status = calculateOverallStatus(
      degradedProviders,
      normalBrain,
      normalGateway,
      normalMemory
    );
    expect(status).toBe("degraded");
  });

  it("should return unhealthy when all providers are unhealthy", () => {
    const status = calculateOverallStatus(
      unhealthyProviders,
      normalBrain,
      normalGateway,
      normalMemory
    );
    expect(status).toBe("unhealthy");
  });

  it("should return degraded when memory usage is high (>90%)", () => {
    const status = calculateOverallStatus(
      healthyProviders,
      normalBrain,
      normalGateway,
      highMemory
    );
    expect(status).toBe("degraded");
  });

  it("should return unhealthy when memory usage is critical (>95%)", () => {
    const status = calculateOverallStatus(
      healthyProviders,
      normalBrain,
      normalGateway,
      criticalMemory
    );
    expect(status).toBe("unhealthy");
  });

  it("should return degraded when brain is uninitialized and no providers", () => {
    const status = calculateOverallStatus(
      {},
      uninitializedBrain,
      normalGateway,
      normalMemory
    );
    expect(status).toBe("degraded");
  });

  it("should return healthy with no providers but initialized brain", () => {
    const status = calculateOverallStatus(
      {},
      normalBrain,
      normalGateway,
      normalMemory
    );
    expect(status).toBe("healthy");
  });
});

// ============================================================================
// Health Report Tests
// ============================================================================

describe("collectHealthReport", () => {
  const mockStats: ConnectionStats = {
    totalConnections: 5,
    activeConnections: 2,
    messagesReceived: 50,
    messagesSent: 75,
    startedAt: new Date(),
  };

  it("should return complete health report", async () => {
    const report = await collectHealthReport(mockStats, 43);

    expect(report).toHaveProperty("status");
    expect(report).toHaveProperty("uptime");
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("providers");
    expect(report).toHaveProperty("brain");
    expect(report).toHaveProperty("gateway");
    expect(report).toHaveProperty("memory");

    // Verify status is valid
    expect(["healthy", "degraded", "unhealthy"]).toContain(report.status);

    // Verify uptime is non-negative
    expect(report.uptime).toBeGreaterThanOrEqual(0);

    // Verify timestamp is valid ISO string
    expect(() => new Date(report.timestamp)).not.toThrow();

    // Verify gateway info reflects input
    expect(report.gateway.methodCount).toBe(43);
    expect(report.gateway.activeConnections).toBe(2);
  });

  it("should include memory metrics", async () => {
    const report = await collectHealthReport(mockStats, 43);

    expect(report.memory.heapUsed).toBeGreaterThan(0);
    expect(report.memory.heapTotal).toBeGreaterThan(0);
    expect(report.memory.rss).toBeGreaterThan(0);
  });

  it("should include brain metrics", async () => {
    const report = await collectHealthReport(mockStats, 43);

    expect(typeof report.brain.initialized).toBe("boolean");
    expect(report.brain.layerCounts).toHaveProperty("events");
    expect(report.brain.layerCounts).toHaveProperty("patterns");
    expect(report.brain.layerCounts).toHaveProperty("structures");
    expect(report.brain.layerCounts).toHaveProperty("mentalModels");
  });
});
