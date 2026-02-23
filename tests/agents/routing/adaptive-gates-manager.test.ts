/**
 * Adaptive Gates Manager Tests
 *
 * @module tests/agents/routing/adaptive-gates-manager
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  AdaptiveGatesManager,
  createAdaptiveGatesManager,
  resetAdaptiveGatesManager,
} from "../../../src/agents/routing/adaptive-gates-manager.js";
import {
  resetPatternAnalytics,
} from "../../../src/agents/routing/pattern-analytics.js";
import {
  createPatternManager,
  resetPatternManager,
} from "../../../src/agents/fix-logging/index.js";

describe("AdaptiveGatesManager", () => {
  let manager: AdaptiveGatesManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-gates-test-"));

    // Reset singletons
    resetAdaptiveGatesManager();
    resetPatternAnalytics();
    resetPatternManager();

    // Initialize pattern manager
    const patternManager = createPatternManager({ storageDir: tempDir });
    await patternManager.initialize();

    manager = createAdaptiveGatesManager();
  });

  afterEach(async () => {
    resetAdaptiveGatesManager();
    resetPatternAnalytics();
    resetPatternManager();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize with default thresholds", () => {
      expect(manager.getThreshold("code_gen")).toBe(0.7);
      expect(manager.getThreshold("bug_fix")).toBe(0.8);
      expect(manager.getThreshold("architecture")).toBe(0.8);
      expect(manager.getThreshold("security")).toBe(0.9);
      expect(manager.getThreshold("research")).toBe(0.6);
      expect(manager.getThreshold("general")).toBe(0.5);
    });

    it("should have gate configs for all task types", () => {
      const gates = manager.getAllGates();

      expect(gates.length).toBe(6);

      const taskTypes = gates.map((g) => g.taskType);
      expect(taskTypes).toContain("code_gen");
      expect(taskTypes).toContain("bug_fix");
      expect(taskTypes).toContain("architecture");
      expect(taskTypes).toContain("security");
      expect(taskTypes).toContain("research");
      expect(taskTypes).toContain("general");
    });
  });

  describe("getGateConfig", () => {
    it("should return gate config with all fields", () => {
      const config = manager.getGateConfig("code_gen");

      expect(config).toBeDefined();
      expect(config!.taskType).toBe("code_gen");
      expect(config!.baseThreshold).toBe(0.7);
      expect(config!.currentThreshold).toBe(0.7);
      expect(config!.minThreshold).toBe(0.5);
      expect(config!.maxThreshold).toBe(0.95);
      expect(config!.adjustmentHistory).toEqual([]);
    });

    it("should return undefined for unknown task type", () => {
      const config = manager.getGateConfig("unknown" as any);
      expect(config).toBeUndefined();
    });
  });

  describe("applyAdjustment", () => {
    it("should apply positive adjustment", () => {
      const adjustment = manager.applyAdjustment(
        "code_gen",
        0.05,
        "Test adjustment",
        ["pattern1"]
      );

      expect(adjustment).not.toBeNull();
      expect(adjustment!.previousValue).toBeCloseTo(0.7, 5);
      expect(adjustment!.newValue).toBeCloseTo(0.75, 5);
      expect(adjustment!.adjustment).toBeCloseTo(0.05, 5);

      expect(manager.getThreshold("code_gen")).toBeCloseTo(0.75, 5);
    });

    it("should apply negative adjustment", () => {
      const adjustment = manager.applyAdjustment(
        "code_gen",
        -0.05,
        "Test adjustment",
        []
      );

      expect(adjustment).not.toBeNull();
      expect(adjustment!.newValue).toBeCloseTo(0.65, 5);
    });

    it("should respect maximum threshold", () => {
      // Apply large positive adjustment
      const adjustment = manager.applyAdjustment(
        "code_gen",
        0.5,
        "Test max bound",
        []
      );

      // Should be capped at max (0.95) and limited by maxAdjustmentPerCycle (0.1)
      expect(adjustment).not.toBeNull();
      expect(adjustment!.newValue).toBeLessThanOrEqual(0.95);
    });

    it("should respect minimum threshold", () => {
      // Apply large negative adjustment
      const adjustment = manager.applyAdjustment(
        "code_gen",
        -0.5,
        "Test min bound",
        []
      );

      // Should be capped at min (0.5) and limited by maxAdjustmentPerCycle (0.1)
      expect(adjustment).not.toBeNull();
      expect(adjustment!.newValue).toBeGreaterThanOrEqual(0.5);
    });

    it("should track adjustment history", () => {
      manager.applyAdjustment("code_gen", 0.05, "First", []);
      manager.applyAdjustment("code_gen", 0.05, "Second", []);

      const history = manager.getAdjustmentHistory("code_gen");
      expect(history.length).toBe(2);
      expect(history[0]!.reason).toBe("First");
      expect(history[1]!.reason).toBe("Second");
    });

    it("should return null for no-change adjustment", () => {
      const adjustment = manager.applyAdjustment(
        "code_gen",
        0.0001, // Too small
        "Tiny adjustment",
        []
      );

      expect(adjustment).toBeNull();
    });
  });

  describe("meetsThreshold", () => {
    it("should return true when confidence meets threshold", () => {
      expect(manager.meetsThreshold("code_gen", 0.7)).toBe(true);
      expect(manager.meetsThreshold("code_gen", 0.8)).toBe(true);
    });

    it("should return false when confidence is below threshold", () => {
      expect(manager.meetsThreshold("code_gen", 0.6)).toBe(false);
      expect(manager.meetsThreshold("code_gen", 0.5)).toBe(false);
    });
  });

  describe("getThresholdGap", () => {
    it("should return zero when confidence meets threshold", () => {
      expect(manager.getThresholdGap("code_gen", 0.8)).toBe(0);
    });

    it("should return gap when confidence is below threshold", () => {
      expect(manager.getThresholdGap("code_gen", 0.5)).toBeCloseTo(0.2, 2);
    });
  });

  describe("resetGate", () => {
    it("should reset single gate to base threshold", () => {
      manager.applyAdjustment("code_gen", 0.1, "Test", []);
      expect(manager.getThreshold("code_gen")).toBeCloseTo(0.8, 5);

      manager.resetGate("code_gen");
      expect(manager.getThreshold("code_gen")).toBeCloseTo(0.7, 5);
    });

    it("should clear adjustment history", () => {
      manager.applyAdjustment("code_gen", 0.05, "Test", []);
      manager.resetGate("code_gen");

      const history = manager.getAdjustmentHistory("code_gen");
      expect(history.length).toBe(0);
    });
  });

  describe("resetAllGates", () => {
    it("should reset all gates to base thresholds", () => {
      manager.applyAdjustment("code_gen", 0.1, "Test", []);
      manager.applyAdjustment("bug_fix", -0.1, "Test", []);

      manager.resetAllGates();

      expect(manager.getThreshold("code_gen")).toBe(0.7);
      expect(manager.getThreshold("bug_fix")).toBe(0.8);
    });
  });

  describe("getState", () => {
    it("should return current state snapshot", () => {
      manager.applyAdjustment("code_gen", 0.05, "Test", []);

      const state = manager.getState();

      expect(state.gates).toBeDefined();
      expect(state.gates.code_gen).toBeDefined();
      expect(state.gates.code_gen.currentThreshold).toBeCloseTo(0.75, 5);
      expect(state.totalAdjustments).toBe(1);
      expect(state.lastRecalculation).toBeDefined();
    });
  });

  describe("loadState", () => {
    it("should restore state from snapshot", () => {
      // Get initial state with adjustment
      manager.applyAdjustment("code_gen", 0.05, "Test", []);
      const state = manager.getState();

      // Create new manager and load state
      const newManager = createAdaptiveGatesManager();
      newManager.loadState(state);

      expect(newManager.getThreshold("code_gen")).toBeCloseTo(0.75, 5);
    });
  });

  describe("runRecalculationCycle", () => {
    it("should run recalculation without errors", async () => {
      const results = await manager.runRecalculationCycle();

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
