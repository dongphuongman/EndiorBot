/**
 * SessionContextExtractor Tests — Sprint 96
 *
 * Tests extraction from goal results, relays,
 * summarization with token cap, and scoring.
 *
 * @module tests/context/transfer/session-context-extractor
 * @sprint 96
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SessionContextExtractor } from "../../../src/context/transfer/session-context-extractor.js";
import { ContextQualityScorer, resetContextQualityScorer } from "../../../src/context/transfer/quality-scorer.js";
import type { SubtaskResult, SessionRelayContext } from "../../../src/autonomy/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSubtaskResult(
  agent: string,
  output: string,
  success = true,
): SubtaskResult {
  const result: SubtaskResult = {
    subtaskId: `st-${agent}`,
    agent,
    success,
    output,
    durationMs: 2000,
    estimatedCostUsd: 0.10,
  };
  if (!success) result.error = `Failed for @${agent}`;
  result.provider = "claude-bridge";
  return result;
}

function makeRelay(subtasks: SubtaskResult[]): SessionRelayContext {
  return {
    goalId: "goal-test",
    sessionId: "session-test",
    completedSubtasks: subtasks,
    handoffChain: subtasks.map((s) => s.agent),
    accumulatedTokens: 500,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("SessionContextExtractor", () => {
  let extractor: SessionContextExtractor;

  beforeEach(() => {
    resetContextQualityScorer();
    extractor = new SessionContextExtractor(new ContextQualityScorer());
  });

  // --------------------------------------------------------------------------
  // Goal result extraction
  // --------------------------------------------------------------------------

  describe("extractFromGoalResult", () => {
    it("should extract context from successful subtask results", () => {
      const results = [
        makeSubtaskResult("architect", "Design: Use microservices architecture with REST API"),
        makeSubtaskResult("coder", "Implemented: REST endpoints for /api/payments"),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-1", "proj-1", "session-1", results,
        ["payment", "api"],
      );

      // Should extract task_outputs + 1 goal_result (2 agents → aggregate)
      expect(contexts.length).toBeGreaterThanOrEqual(3);

      // Check individual agent extractions exist
      const architectCtx = contexts.find((c) => c.agentSource === "architect");
      expect(architectCtx).toBeDefined();
      expect(architectCtx!.content).toContain("microservices");

      // Check goal_result aggregate
      const goalResult = contexts.find((c) => c.type === "goal_result");
      expect(goalResult).toBeDefined();
      expect(goalResult!.content).toContain("@architect");
      expect(goalResult!.content).toContain("@coder");
    });

    it("should skip failed subtask results", () => {
      const results = [
        makeSubtaskResult("architect", "Design ready", true),
        makeSubtaskResult("coder", "", false),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-2", "proj-1", "session-1", results,
      );

      // Only architect's output + no goal_result (only 1 successful)
      const coderCtx = contexts.find((c) => c.agentSource === "coder");
      expect(coderCtx).toBeUndefined();
    });

    it("should set sourceGoalId on extracted contexts", () => {
      const results = [
        makeSubtaskResult("architect", "Architecture decision made"),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-3", "proj-1", "session-1", results,
      );

      for (const ctx of contexts) {
        expect(ctx.sourceGoalId).toBe("goal-3");
      }
    });

    it("should set sdlcStage when provided", () => {
      const results = [
        makeSubtaskResult("coder", "Code implemented"),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-4", "proj-1", "session-1", results,
        ["test"],
        "04-BUILD",
      );

      for (const ctx of contexts) {
        expect(ctx.sdlcStage).toBe("04-BUILD");
      }
    });

    it("should handle empty results", () => {
      const contexts = extractor.extractFromGoalResult(
        "goal-5", "proj-1", "session-1", [],
      );
      expect(contexts).toHaveLength(0);
    });

    it("should classify architect output as 'architecture'", () => {
      const results = [
        makeSubtaskResult("architect", "The system should use event-driven architecture"),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-6", "proj-1", "session-1", results,
      );

      const architectCtx = contexts.find((c) => c.agentSource === "architect");
      expect(architectCtx!.type).toBe("architecture");
    });
  });

  // --------------------------------------------------------------------------
  // Relay extraction
  // --------------------------------------------------------------------------

  describe("extractFromRelay", () => {
    it("should extract from SessionRelayContext", () => {
      const relay = makeRelay([
        makeSubtaskResult("architect", "Design: REST API with pagination"),
        makeSubtaskResult("coder", "Implemented pagination endpoints"),
      ]);

      const contexts = extractor.extractFromRelay(relay, "proj-1", ["api"]);

      expect(contexts.length).toBeGreaterThanOrEqual(2);
      expect(contexts[0]!.sourceSessionId).toBe("session-test");
    });

    it("should handle empty relay", () => {
      const relay = makeRelay([]);
      const contexts = extractor.extractFromRelay(relay, "proj-1");
      expect(contexts).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Summarize and score
  // --------------------------------------------------------------------------

  describe("summarizeAndScore", () => {
    it("should create a scored transferable context", () => {
      const ctx = extractor.summarizeAndScore(
        "This is a key decision: use PostgreSQL for the primary database due to ACID compliance",
        "decision",
        "proj-1",
        "session-1",
        ["database", "postgres"],
        "02-DESIGN",
      );

      expect(ctx.type).toBe("decision");
      expect(ctx.content).toContain("PostgreSQL");
      expect(ctx.quality.composite).toBeGreaterThan(0);
      expect(ctx.tags).toContain("database");
      expect(ctx.sdlcStage).toBe("02-DESIGN");
    });

    it("should set expiry date based on type", () => {
      const ctx = extractor.summarizeAndScore(
        "Task output content here",
        "task_output",
        "proj-1",
        "session-1",
      );

      // task_output should have 7-day expiry
      expect(ctx.expiresAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Quality scoring
  // --------------------------------------------------------------------------

  describe("quality scoring", () => {
    it("should score extracted contexts with valid quality", () => {
      const results = [
        makeSubtaskResult("coder", "Implemented the payment endpoint with error handling"),
      ];

      const contexts = extractor.extractFromGoalResult(
        "goal-7", "proj-1", "session-1", results,
        ["payment"],
      );

      for (const ctx of contexts) {
        expect(ctx.quality.relevance).toBeGreaterThanOrEqual(0);
        expect(ctx.quality.recency).toBeGreaterThanOrEqual(0);
        expect(ctx.quality.confidence).toBeGreaterThanOrEqual(0);
        expect(ctx.quality.completeness).toBeGreaterThanOrEqual(0);
        expect(ctx.quality.composite).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
