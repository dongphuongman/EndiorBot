/**
 * Pattern Feedback Loop Tests
 *
 * @module tests/agents/routing/pattern-feedback-loop
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  PatternFeedbackLoop,
  createPatternFeedbackLoop,
  resetPatternFeedbackLoop,
} from "../../../src/agents/routing/pattern-feedback-loop.js";
import {
  resetAdaptiveGatesManager,
} from "../../../src/agents/routing/adaptive-gates-manager.js";
import {
  resetPatternAnalytics,
} from "../../../src/agents/routing/pattern-analytics.js";
import {
  createPatternManager,
  resetPatternManager,
} from "../../../src/agents/fix-logging/index.js";
import type { PatternModelOutcome } from "../../../src/agents/routing/adaptive-types.js";

describe("PatternFeedbackLoop", () => {
  let feedbackLoop: PatternFeedbackLoop;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-loop-test-"));

    // Reset all singletons
    resetPatternFeedbackLoop();
    resetAdaptiveGatesManager();
    resetPatternAnalytics();
    resetPatternManager();

    // Initialize pattern manager
    const patternManager = createPatternManager({ storageDir: tempDir });
    await patternManager.initialize();

    feedbackLoop = createPatternFeedbackLoop();
  });

  afterEach(async () => {
    resetPatternFeedbackLoop();
    resetAdaptiveGatesManager();
    resetPatternAnalytics();
    resetPatternManager();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("recordOutcome", () => {
    it("should record successful outcome", async () => {
      const outcome: PatternModelOutcome = {
        patternId: "TYPE:TS2304:add_import",
        modelUsed: {
          providerId: "anthropic",
          modelId: "claude-opus-4",
          tier: "expert",
        },
        success: true,
        durationMs: 150,
        timestamp: new Date().toISOString(),
      };

      await feedbackLoop.recordOutcome(outcome);

      // Check affinity was created
      const affinities = feedbackLoop.getPatternAffinities("TYPE:TS2304:add_import");
      expect(affinities.length).toBeGreaterThan(0);
    });

    it("should record failed outcome", async () => {
      const outcome: PatternModelOutcome = {
        patternId: "TYPE:TS2304:add_import",
        modelUsed: {
          providerId: "openai",
          modelId: "gpt-5.2",
          tier: "powerful",
        },
        success: false,
        durationMs: 500,
        timestamp: new Date().toISOString(),
      };

      await feedbackLoop.recordOutcome(outcome);

      const affinities = feedbackLoop.getPatternAffinities("TYPE:TS2304:add_import");
      const openaiAffinity = affinities.find((a) => a.providerId === "openai");

      expect(openaiAffinity).toBeDefined();
      expect(openaiAffinity!.successRate).toBe(0);
    });

    it("should update affinity on multiple outcomes", async () => {
      const baseOutcome: PatternModelOutcome = {
        patternId: "TYPE:TS2304:add_import",
        modelUsed: {
          providerId: "anthropic",
          modelId: "claude-opus-4",
          tier: "expert",
        },
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      // Record multiple outcomes
      await feedbackLoop.recordOutcome({ ...baseOutcome, success: true, durationMs: 100 });
      await feedbackLoop.recordOutcome({ ...baseOutcome, success: true, durationMs: 200 });
      await feedbackLoop.recordOutcome({ ...baseOutcome, success: false, durationMs: 150 });

      const affinities = feedbackLoop.getPatternAffinities("TYPE:TS2304:add_import");
      const anthropicAffinity = affinities.find((a) => a.providerId === "anthropic");

      expect(anthropicAffinity!.sampleCount).toBe(3);
      expect(anthropicAffinity!.successRate).toBeCloseTo(0.667, 2);
      expect(anthropicAffinity!.avgDurationMs).toBe(150);
    });
  });

  describe("getBestModelForPattern", () => {
    it("should return null with insufficient samples", () => {
      const best = feedbackLoop.getBestModelForPattern("TYPE:TS2304:add_import");
      expect(best).toBeNull();
    });

    it("should return best model after sufficient samples", async () => {
      const baseOutcome: PatternModelOutcome = {
        patternId: "TYPE:TS2304:add_import",
        modelUsed: {
          providerId: "anthropic",
          modelId: "claude-opus-4",
          tier: "expert",
        },
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      // Record 3+ successful outcomes for anthropic
      for (let i = 0; i < 3; i++) {
        await feedbackLoop.recordOutcome(baseOutcome);
      }

      const best = feedbackLoop.getBestModelForPattern("TYPE:TS2304:add_import");
      expect(best).not.toBeNull();
      expect(best!.providerId).toBe("anthropic");
    });

    it("should prefer higher success rate model", async () => {
      // Anthropic: 3 successes
      for (let i = 0; i < 3; i++) {
        await feedbackLoop.recordOutcome({
          patternId: "TYPE:TS2304:add_import",
          modelUsed: { providerId: "anthropic", modelId: "claude-opus-4", tier: "expert" },
          success: true,
          durationMs: 100,
          timestamp: new Date().toISOString(),
        });
      }

      // OpenAI: 3 failures
      for (let i = 0; i < 3; i++) {
        await feedbackLoop.recordOutcome({
          patternId: "TYPE:TS2304:add_import",
          modelUsed: { providerId: "openai", modelId: "gpt-5.2", tier: "powerful" },
          success: false,
          durationMs: 200,
          timestamp: new Date().toISOString(),
        });
      }

      const best = feedbackLoop.getBestModelForPattern("TYPE:TS2304:add_import");
      expect(best!.providerId).toBe("anthropic");
    });
  });

  describe("shouldConsult", () => {
    it("should not consult for non-existent pattern", async () => {
      const decision = await feedbackLoop.shouldConsult("NONEXISTENT:PATTERN:id");

      expect(decision.shouldConsult).toBe(false);
      expect(decision.reason).toContain("not found");
    });

    it("should not consult for high success rate pattern", async () => {
      // Pattern with default success rate (0) should not trigger consultation
      // because it doesn't have enough samples
      const decision = await feedbackLoop.shouldConsult("TYPE:TS2304:add_import");

      expect(decision.shouldConsult).toBe(false);
    });
  });

  describe("runLearningCycle", () => {
    it("should complete learning cycle", async () => {
      const summary = await feedbackLoop.runLearningCycle();

      expect(summary.cycleId).toBeDefined();
      expect(summary.startedAt).toBeDefined();
      expect(summary.status).toBe("completed");
      expect(summary.patternsAnalyzed).toBeGreaterThanOrEqual(0);
      expect(typeof summary.thresholdsAdjusted).toBe("number");
      expect(typeof summary.flaggedForConsultation).toBe("number");
    });

    it("should track cycle in history", async () => {
      await feedbackLoop.runLearningCycle();
      await feedbackLoop.runLearningCycle();

      const summaries = feedbackLoop.getCycleSummaries();
      expect(summaries.length).toBe(2);
    });
  });

  describe("getLastCycle", () => {
    it("should return null when no cycles run", () => {
      const last = feedbackLoop.getLastCycle();
      expect(last).toBeNull();
    });

    it("should return last cycle after run", async () => {
      await feedbackLoop.runLearningCycle();
      const last = feedbackLoop.getLastCycle();

      expect(last).not.toBeNull();
      expect(last!.status).toBe("completed");
    });
  });

  describe("getAllAffinities", () => {
    it("should return empty array initially", () => {
      const affinities = feedbackLoop.getAllAffinities();
      expect(affinities).toEqual([]);
    });

    it("should return all recorded affinities", async () => {
      await feedbackLoop.recordOutcome({
        patternId: "TYPE:TS2304:add_import",
        modelUsed: { providerId: "anthropic", modelId: "claude-opus-4", tier: "expert" },
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
      });

      await feedbackLoop.recordOutcome({
        patternId: "LINT:no-unused-vars:remove_var",
        modelUsed: { providerId: "openai", modelId: "gpt-5.2", tier: "powerful" },
        success: true,
        durationMs: 150,
        timestamp: new Date().toISOString(),
      });

      const affinities = feedbackLoop.getAllAffinities();
      expect(affinities.length).toBe(2);
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      await feedbackLoop.recordOutcome({
        patternId: "TYPE:TS2304:add_import",
        modelUsed: { providerId: "anthropic", modelId: "claude-opus-4", tier: "expert" },
        success: true,
        durationMs: 100,
        timestamp: new Date().toISOString(),
      });

      await feedbackLoop.runLearningCycle();

      feedbackLoop.clear();

      expect(feedbackLoop.getAllAffinities()).toEqual([]);
      expect(feedbackLoop.getCycleSummaries()).toEqual([]);
      expect(feedbackLoop.getLastCycle()).toBeNull();
    });
  });
});
