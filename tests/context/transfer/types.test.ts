/**
 * Cross-Session Context Transfer Types Tests — Sprint 96
 *
 * Validates type definitions, defaults, ADR-002 compliance,
 * and quality weights invariant (sum = 1.0).
 *
 * @module tests/context/transfer/types
 * @sprint 96
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_TRANSFER_CONFIG,
  ALL_TRANSFER_CONTEXT_TYPES,
  type ContextQualityScore,
  type TransferableContext,
  type QualityWeights,
  type TransferContextType,
  type ContextTransferConfig,
  type ContextSelectionResult,
  type ContextQualityGateResult,
  type QualityViolation,
  type TransferStoreStats,
} from "../../../src/context/transfer/types.js";

describe("Cross-Session Context Transfer Types", () => {
  // --------------------------------------------------------------------------
  // ADR-002 compliance
  // --------------------------------------------------------------------------

  describe("ADR-002 compliance", () => {
    it("types.ts should have ZERO imports from src/ (ADR-002)", () => {
      const typesPath = path.resolve(
        __dirname,
        "../../../src/context/transfer/types.ts",
      );
      const content = fs.readFileSync(typesPath, "utf-8");

      // Should not import from any src/ modules
      const importLines = content
        .split("\n")
        .filter((line) => line.trim().startsWith("import"));

      for (const line of importLines) {
        expect(line).not.toMatch(/from\s+["']\.\.\/\.\.\//);
        expect(line).not.toMatch(/from\s+["']@/);
      }
    });
  });

  // --------------------------------------------------------------------------
  // DEFAULT_QUALITY_WEIGHTS
  // --------------------------------------------------------------------------

  describe("DEFAULT_QUALITY_WEIGHTS", () => {
    it("should have all 4 dimensions", () => {
      expect(DEFAULT_QUALITY_WEIGHTS).toHaveProperty("relevance");
      expect(DEFAULT_QUALITY_WEIGHTS).toHaveProperty("recency");
      expect(DEFAULT_QUALITY_WEIGHTS).toHaveProperty("confidence");
      expect(DEFAULT_QUALITY_WEIGHTS).toHaveProperty("completeness");
    });

    it("weights must sum to 1.0 (CTO C4)", () => {
      const sum =
        DEFAULT_QUALITY_WEIGHTS.relevance +
        DEFAULT_QUALITY_WEIGHTS.recency +
        DEFAULT_QUALITY_WEIGHTS.confidence +
        DEFAULT_QUALITY_WEIGHTS.completeness;

      expect(sum).toBeCloseTo(1.0, 10);
    });

    it("all weights should be positive", () => {
      expect(DEFAULT_QUALITY_WEIGHTS.relevance).toBeGreaterThan(0);
      expect(DEFAULT_QUALITY_WEIGHTS.recency).toBeGreaterThan(0);
      expect(DEFAULT_QUALITY_WEIGHTS.confidence).toBeGreaterThan(0);
      expect(DEFAULT_QUALITY_WEIGHTS.completeness).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // ALL_TRANSFER_CONTEXT_TYPES (CTO F3)
  // --------------------------------------------------------------------------

  describe("ALL_TRANSFER_CONTEXT_TYPES", () => {
    it("should contain exactly 6 types (CTO F3)", () => {
      expect(ALL_TRANSFER_CONTEXT_TYPES).toHaveLength(6);
    });

    it("should include all expected types", () => {
      const expected: TransferContextType[] = [
        "goal_result",
        "decision",
        "architecture",
        "error_pattern",
        "task_output",
        "blocker_resolution",
      ];

      for (const type of expected) {
        expect(ALL_TRANSFER_CONTEXT_TYPES).toContain(type);
      }
    });
  });

  // --------------------------------------------------------------------------
  // DEFAULT_TRANSFER_CONFIG
  // --------------------------------------------------------------------------

  describe("DEFAULT_TRANSFER_CONFIG", () => {
    it("should use DEFAULT_QUALITY_WEIGHTS", () => {
      expect(DEFAULT_TRANSFER_CONFIG.weights).toEqual(DEFAULT_QUALITY_WEIGHTS);
    });

    it("maxInjectionTokens should be 600 (CTO F1: shares 2K with AnchorBudget 800)", () => {
      expect(DEFAULT_TRANSFER_CONFIG.maxInjectionTokens).toBe(600);
    });

    it("should have thresholds for all 6 context types", () => {
      for (const type of ALL_TRANSFER_CONTEXT_TYPES) {
        expect(DEFAULT_TRANSFER_CONFIG.thresholds[type]).toBeDefined();
        expect(DEFAULT_TRANSFER_CONFIG.thresholds[type]).toBeGreaterThan(0);
        expect(DEFAULT_TRANSFER_CONFIG.thresholds[type]).toBeLessThanOrEqual(1);
      }
    });

    it("decision/architecture thresholds should be stricter than task_output/error_pattern", () => {
      expect(DEFAULT_TRANSFER_CONFIG.thresholds.decision).toBeGreaterThan(
        DEFAULT_TRANSFER_CONFIG.thresholds.task_output,
      );
      expect(DEFAULT_TRANSFER_CONFIG.thresholds.architecture).toBeGreaterThan(
        DEFAULT_TRANSFER_CONFIG.thresholds.error_pattern,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Type construction
  // --------------------------------------------------------------------------

  describe("type construction", () => {
    it("should construct a valid TransferableContext", () => {
      const ctx: TransferableContext = {
        id: "ctx-1",
        projectId: "proj-1",
        sourceSessionId: "session-1",
        type: "decision",
        content: "Use REST API for payment integration",
        tokenCount: 12,
        quality: {
          relevance: 0.9,
          recency: 0.8,
          confidence: 0.7,
          completeness: 1.0,
          composite: 0.85,
        },
        tags: ["payment", "api", "architecture"],
        createdAt: new Date().toISOString(),
        metadata: {},
      };

      expect(ctx.id).toBe("ctx-1");
      expect(ctx.type).toBe("decision");
      expect(ctx.quality.composite).toBe(0.85);
    });

    it("should construct TransferableContext with optional fields", () => {
      const ctx: TransferableContext = {
        id: "ctx-2",
        projectId: "proj-1",
        sourceSessionId: "session-2",
        type: "goal_result",
        content: "Auth system designed and implemented",
        tokenCount: 8,
        quality: {
          relevance: 0.7,
          recency: 1.0,
          confidence: 0.9,
          completeness: 0.8,
          composite: 0.83,
        },
        tags: ["auth"],
        createdAt: new Date().toISOString(),
        metadata: { agentCount: 2 },
      };

      // Optional fields not set — should be valid
      expect(ctx.sourceGoalId).toBeUndefined();
      expect(ctx.agentSource).toBeUndefined();
      expect(ctx.sdlcStage).toBeUndefined();
      expect(ctx.expiresAt).toBeUndefined();

      // Set optional fields
      ctx.sourceGoalId = "goal-1";
      ctx.agentSource = "architect";
      ctx.sdlcStage = "04-BUILD";
      ctx.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      expect(ctx.sourceGoalId).toBe("goal-1");
      expect(ctx.agentSource).toBe("architect");
    });
  });
});
