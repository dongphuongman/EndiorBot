/**
 * T3 Types Tests — Sprint 97
 *
 * Validates T3-specific types: RetentionMetrics, ContextCheckpointState,
 * ContextRefreshConfig, retention thresholds, and ADR-002 compliance.
 *
 * CTO F2: Retention = selectedTokens / gatedTokens (not total available).
 *
 * @module tests/context/transfer/t3-types
 * @sprint 97
 */

import { describe, it, expect } from "vitest";
import {
  RETENTION_THRESHOLDS,
  DEFAULT_REFRESH_CONFIG,
  type RetentionLevel,
  type RetentionMetrics,
  type ContextCheckpointState,
  type ContextRefreshConfig,
} from "../../../src/context/transfer/types.js";

describe("T3 Types — Sprint 97", () => {
  // --------------------------------------------------------------------------
  // Retention thresholds
  // --------------------------------------------------------------------------

  describe("RETENTION_THRESHOLDS", () => {
    it("should have pass = 0.95 (T3 target)", () => {
      expect(RETENTION_THRESHOLDS.pass).toBe(0.95);
    });

    it("should have warning = 0.90", () => {
      expect(RETENTION_THRESHOLDS.warning).toBe(0.90);
    });

    it("should have critical = 0.80", () => {
      expect(RETENTION_THRESHOLDS.critical).toBe(0.80);
    });

    it("should have pass > warning > critical ordering", () => {
      expect(RETENTION_THRESHOLDS.pass).toBeGreaterThan(RETENTION_THRESHOLDS.warning);
      expect(RETENTION_THRESHOLDS.warning).toBeGreaterThan(RETENTION_THRESHOLDS.critical);
    });
  });

  // --------------------------------------------------------------------------
  // Default refresh config
  // --------------------------------------------------------------------------

  describe("DEFAULT_REFRESH_CONFIG", () => {
    it("should have turnInterval = 30", () => {
      expect(DEFAULT_REFRESH_CONFIG.turnInterval).toBe(30);
    });

    it("should have timeIntervalMs = 30 min", () => {
      expect(DEFAULT_REFRESH_CONFIG.timeIntervalMs).toBe(30 * 60 * 1000);
    });

    it("should have minRefreshIntervalMs = 5 min", () => {
      expect(DEFAULT_REFRESH_CONFIG.minRefreshIntervalMs).toBe(5 * 60 * 1000);
    });

    it("should have swapThreshold = 0.1 (CTO F3)", () => {
      expect(DEFAULT_REFRESH_CONFIG.swapThreshold).toBe(0.1);
    });

    it("should have minRefreshInterval < timeInterval", () => {
      expect(DEFAULT_REFRESH_CONFIG.minRefreshIntervalMs)
        .toBeLessThan(DEFAULT_REFRESH_CONFIG.timeIntervalMs);
    });
  });

  // --------------------------------------------------------------------------
  // RetentionMetrics construction
  // --------------------------------------------------------------------------

  describe("RetentionMetrics", () => {
    it("should construct with all required fields", () => {
      const metrics: RetentionMetrics = {
        sessionId: "session-1",
        projectId: "project-1",
        retentionRate: 0.96,
        level: "pass",
        target: 0.95,
        passed: true,
        totalAvailableTokens: 1000,
        gatedTokens: 500,
        selectedTokens: 480,
        refreshCount: 2,
        timestamp: new Date().toISOString(),
      };

      expect(metrics.retentionRate).toBe(0.96);
      expect(metrics.level).toBe("pass");
      expect(metrics.passed).toBe(true);
      expect(metrics.gatedTokens).toBe(500);
      expect(metrics.selectedTokens).toBe(480);
    });

    it("should support all retention levels", () => {
      const levels: RetentionLevel[] = ["pass", "warning", "critical"];
      expect(levels).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // ContextCheckpointState construction
  // --------------------------------------------------------------------------

  describe("ContextCheckpointState", () => {
    it("should construct with all required fields", () => {
      const state: ContextCheckpointState = {
        injectedContextIds: ["ctx-1", "ctx-2"],
        injectedTokens: 450,
        retentionRate: 0.97,
        refreshCount: 1,
        lastRefreshAt: new Date().toISOString(),
        turnCount: 15,
      };

      expect(state.injectedContextIds).toHaveLength(2);
      expect(state.injectedTokens).toBe(450);
      expect(state.retentionRate).toBe(0.97);
      expect(state.refreshCount).toBe(1);
      expect(state.turnCount).toBe(15);
    });
  });

  // --------------------------------------------------------------------------
  // ContextRefreshConfig construction
  // --------------------------------------------------------------------------

  describe("ContextRefreshConfig", () => {
    it("should construct with custom values", () => {
      const config: ContextRefreshConfig = {
        turnInterval: 20,
        timeIntervalMs: 20 * 60 * 1000,
        minRefreshIntervalMs: 3 * 60 * 1000,
        swapThreshold: 0.15,
      };

      expect(config.turnInterval).toBe(20);
      expect(config.swapThreshold).toBe(0.15);
    });
  });
});
