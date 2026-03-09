/**
 * ContextQualityScorer Tests — Sprint 96
 *
 * Tests 4-dimensional quality scoring: relevance, recency,
 * confidence, completeness, and composite calculation.
 *
 * @module tests/context/transfer/quality-scorer
 * @sprint 96
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextQualityScorer,
  getContextQualityScorer,
  resetContextQualityScorer,
} from "../../../src/context/transfer/quality-scorer.js";
import type { TransferableContext } from "../../../src/context/transfer/types.js";
import { DEFAULT_QUALITY_WEIGHTS } from "../../../src/context/transfer/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides: Partial<TransferableContext> = {}): TransferableContext {
  const base: TransferableContext = {
    id: "ctx-test",
    projectId: "proj-1",
    sourceSessionId: "session-1",
    type: "decision",
    content: "Use REST API for payment integration with Stripe gateway",
    tokenCount: 12,
    quality: {
      relevance: 0,
      recency: 0,
      confidence: 0,
      completeness: 0,
      composite: 0,
    },
    tags: ["payment", "api", "architecture"],
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  return { ...base, ...overrides };
}

// ============================================================================
// Tests
// ============================================================================

describe("ContextQualityScorer", () => {
  let scorer: ContextQualityScorer;

  beforeEach(() => {
    resetContextQualityScorer();
    scorer = new ContextQualityScorer();
  });

  // --------------------------------------------------------------------------
  // Relevance scoring
  // --------------------------------------------------------------------------

  describe("scoreRelevance", () => {
    it("should score high relevance when tags overlap", () => {
      const ctx = makeContext({ tags: ["payment", "api", "security"] });
      const score = scorer.scoreRelevance(ctx, undefined, ["payment", "api", "billing"]);
      // 2 out of 3 tags match
      expect(score).toBeGreaterThan(0.5);
    });

    it("should score low relevance when no tags overlap", () => {
      const ctx = makeContext({ tags: ["payment", "api"] });
      const score = scorer.scoreRelevance(ctx, undefined, ["testing", "ci"]);
      expect(score).toBeLessThan(0.3);
    });

    it("should return baseline relevance when no comparison signals", () => {
      const ctx = makeContext({ type: "decision" });
      const score = scorer.scoreRelevance(ctx);
      // decision baseline = 0.6
      expect(score).toBe(0.6);
    });

    it("should return lower baseline for task_output", () => {
      const ctx = makeContext({ type: "task_output" });
      const score = scorer.scoreRelevance(ctx);
      // task_output baseline = 0.4
      expect(score).toBe(0.4);
    });

    it("should score stage proximity — same stage = 1.0 (CTO F4)", () => {
      const ctx = makeContext({ sdlcStage: "04-BUILD" });
      const score = scorer.scoreRelevance(ctx, undefined, undefined, "04-BUILD");
      expect(score).toBe(1.0);
    });

    it("should score stage proximity — adjacent stage = 0.7", () => {
      const ctx = makeContext({ sdlcStage: "04-BUILD" });
      const score = scorer.scoreRelevance(ctx, undefined, undefined, "05-TEST");
      expect(score).toBe(0.7);
    });

    it("should score stage proximity — distant stage = 0.1", () => {
      const ctx = makeContext({ sdlcStage: "00-FOUNDATION" });
      const score = scorer.scoreRelevance(ctx, undefined, undefined, "07-OPERATE");
      expect(score).toBe(0.1);
    });

    it("should score goal keyword overlap", () => {
      const ctx = makeContext({
        content: "Implemented REST API with authentication and rate limiting",
      });
      const score = scorer.scoreRelevance(ctx, "Design REST API with authentication", undefined);
      expect(score).toBeGreaterThan(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // Recency scoring
  // --------------------------------------------------------------------------

  describe("scoreRecency", () => {
    it("should return ~1.0 for fresh context", () => {
      const ctx = makeContext({ createdAt: new Date().toISOString() });
      const score = scorer.scoreRecency(ctx);
      expect(score).toBeGreaterThan(0.99);
    });

    it("should return ~0.5 at half-life (decision = 24h)", () => {
      const halfLifeAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const ctx = makeContext({
        type: "decision",
        createdAt: halfLifeAgo.toISOString(),
      });
      const score = scorer.scoreRecency(ctx);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it("should return ~0.5 at half-life (task_output = 4h)", () => {
      const halfLifeAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const ctx = makeContext({
        type: "task_output",
        createdAt: halfLifeAgo.toISOString(),
      });
      const score = scorer.scoreRecency(ctx);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it("should return very low score for old context", () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const ctx = makeContext({
        type: "task_output", // 4h half-life
        createdAt: weekAgo.toISOString(),
      });
      const score = scorer.scoreRecency(ctx);
      expect(score).toBeLessThan(0.01);
    });

    it("should return 1.0 for future timestamps", () => {
      const future = new Date(Date.now() + 60000);
      const ctx = makeContext({ createdAt: future.toISOString() });
      const score = scorer.scoreRecency(ctx);
      expect(score).toBe(1.0);
    });
  });

  // --------------------------------------------------------------------------
  // Confidence scoring
  // --------------------------------------------------------------------------

  describe("scoreConfidence", () => {
    it("should score high confidence for high-tier provider + success", () => {
      const ctx = makeContext({
        metadata: { provider: "claude-opus", success: true, qualityGatePassed: true },
      });
      const score = scorer.scoreConfidence(ctx);
      expect(score).toBeCloseTo(1.0, 5);
    });

    it("should score baseline for unknown provider", () => {
      const ctx = makeContext({ metadata: {} });
      const score = scorer.scoreConfidence(ctx);
      expect(score).toBe(0.5);
    });

    it("should reduce score on failure", () => {
      const ctx = makeContext({
        metadata: { success: false },
      });
      const score = scorer.scoreConfidence(ctx);
      expect(score).toBe(0.3); // 0.5 - 0.2
    });

    it("should increase score for success without provider", () => {
      const ctx = makeContext({
        metadata: { success: true },
      });
      const score = scorer.scoreConfidence(ctx);
      expect(score).toBe(0.7); // 0.5 + 0.2
    });
  });

  // --------------------------------------------------------------------------
  // Completeness scoring
  // --------------------------------------------------------------------------

  describe("scoreCompleteness", () => {
    it("should score 1.0 for content above minimum length", () => {
      const ctx = makeContext({
        type: "decision",
        content: "Use REST API with OAuth2 for authentication and JWT for session management",
      });
      const score = scorer.scoreCompleteness(ctx);
      expect(score).toBe(1.0);
    });

    it("should score 0.5 for truncated content", () => {
      const ctx = makeContext({
        content: "Partial implementation of the payment...",
      });
      const score = scorer.scoreCompleteness(ctx);
      expect(score).toBe(0.5);
    });

    it("should score proportionally for short content", () => {
      const ctx = makeContext({
        type: "decision", // min 40 chars
        content: "Use REST API", // 12 chars
      });
      const score = scorer.scoreCompleteness(ctx);
      expect(score).toBeGreaterThan(0.2);
      expect(score).toBeLessThan(1.0);
    });

    it("should detect [truncated] marker", () => {
      const ctx = makeContext({
        content: "Some content here [truncated]",
      });
      const score = scorer.scoreCompleteness(ctx);
      expect(score).toBe(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Composite scoring
  // --------------------------------------------------------------------------

  describe("composite score", () => {
    it("should compute weighted composite correctly", () => {
      const ctx = makeContext({
        type: "decision",
        content: "Use REST API for payment integration with Stripe gateway and webhook handling",
        tags: ["payment", "api"],
        metadata: { provider: "claude-opus", success: true, qualityGatePassed: true },
      });

      const result = scorer.score(ctx, undefined, ["payment", "api"]);

      // Verify composite = weighted sum
      const expected =
        result.relevance * DEFAULT_QUALITY_WEIGHTS.relevance +
        result.recency * DEFAULT_QUALITY_WEIGHTS.recency +
        result.confidence * DEFAULT_QUALITY_WEIGHTS.confidence +
        result.completeness * DEFAULT_QUALITY_WEIGHTS.completeness;

      expect(result.composite).toBeCloseTo(expected, 10);
    });

    it("should return all dimensions between 0 and 1", () => {
      const ctx = makeContext();
      const result = scorer.score(ctx);

      expect(result.relevance).toBeGreaterThanOrEqual(0);
      expect(result.relevance).toBeLessThanOrEqual(1);
      expect(result.recency).toBeGreaterThanOrEqual(0);
      expect(result.recency).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.completeness).toBeGreaterThanOrEqual(0);
      expect(result.completeness).toBeLessThanOrEqual(1);
      expect(result.composite).toBeGreaterThanOrEqual(0);
      expect(result.composite).toBeLessThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Decay application
  // --------------------------------------------------------------------------

  describe("applyDecay", () => {
    it("should reduce recency and composite after decay", () => {
      const original: import("../../../src/context/transfer/types.js").ContextQualityScore = {
        relevance: 0.8,
        recency: 1.0,
        confidence: 0.9,
        completeness: 1.0,
        composite: 0.9,
      };

      const decayed = scorer.applyDecay(original, 24 * 60 * 60 * 1000, "decision");

      expect(decayed.recency).toBeCloseTo(0.5, 1); // half-life = 24h
      expect(decayed.composite).toBeLessThan(original.composite);
      // Other dimensions unchanged
      expect(decayed.relevance).toBe(original.relevance);
      expect(decayed.confidence).toBe(original.confidence);
      expect(decayed.completeness).toBe(original.completeness);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getContextQualityScorer should return consistent instance", () => {
      resetContextQualityScorer();
      const a = getContextQualityScorer();
      const b = getContextQualityScorer();
      expect(a).toBe(b);
    });
  });
});
