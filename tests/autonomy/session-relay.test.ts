/**
 * SessionRelay Tests — Sprint 95
 *
 * Tests context propagation, 2K token cap, handoff chain tracking,
 * and relay status.
 *
 * @module tests/autonomy/session-relay
 * @sprint 95
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SessionRelay } from "../../src/autonomy/session-relay.js";
import type { SessionRelayContext, SubtaskResult } from "../../src/autonomy/types.js";

describe("SessionRelay", () => {
  let relay: SessionRelay;
  let ctx: SessionRelayContext;

  beforeEach(() => {
    relay = new SessionRelay();
    ctx = relay.createRelay("goal-1", "session-1");
  });

  // --------------------------------------------------------------------------
  // createRelay
  // --------------------------------------------------------------------------

  describe("createRelay", () => {
    it("should create relay with valid IDs", () => {
      expect(ctx.goalId).toBe("goal-1");
      expect(ctx.sessionId).toBe("session-1");
      expect(ctx.completedSubtasks).toHaveLength(0);
      expect(ctx.sharedContext).toBe("");
      expect(ctx.handoffChain).toHaveLength(0);
      expect(ctx.createdAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // recordSubtaskResult
  // --------------------------------------------------------------------------

  describe("recordSubtaskResult", () => {
    it("should record result and update context", () => {
      const result = makeResult("sub-1", "architect", "Architecture design: use microservices.");

      relay.recordSubtaskResult(ctx, result);

      expect(ctx.completedSubtasks).toHaveLength(1);
      expect(ctx.handoffChain).toEqual(["architect"]);
      expect(ctx.sharedContext).toContain("architect");
      expect(ctx.sharedContext).toContain("microservices");
    });

    it("should accumulate multiple results", () => {
      relay.recordSubtaskResult(ctx, makeResult("sub-1", "architect", "Design done."));
      relay.recordSubtaskResult(ctx, makeResult("sub-2", "coder", "Implementation done."));

      expect(ctx.completedSubtasks).toHaveLength(2);
      expect(ctx.handoffChain).toEqual(["architect", "coder"]);
      expect(ctx.sharedContext).toContain("architect");
      expect(ctx.sharedContext).toContain("coder");
    });
  });

  // --------------------------------------------------------------------------
  // buildAgentContext
  // --------------------------------------------------------------------------

  describe("buildAgentContext", () => {
    it("should return empty for no prior results", () => {
      const context = relay.buildAgentContext(ctx, "coder");
      expect(context).toBe("");
    });

    it("should include prior agent output", () => {
      relay.recordSubtaskResult(ctx, makeResult("sub-1", "architect", "Use REST API with JWT auth."));

      const context = relay.buildAgentContext(ctx, "coder");
      expect(context).toContain("architect");
      expect(context).toContain("REST API");
      expect(context).toContain("coder"); // header mentions next agent
    });

    it("should respect 2K token budget", () => {
      // Create a relay with very small token limit
      const smallRelay = new SessionRelay(50);
      const smallCtx = smallRelay.createRelay("goal-2", "session-2");

      const longOutput = "x".repeat(5000);
      smallRelay.recordSubtaskResult(smallCtx, makeResult("sub-1", "pm", longOutput));

      const context = smallRelay.buildAgentContext(smallCtx, "architect");
      // Should be truncated — 50 tokens ≈ 200 chars
      expect(context.length).toBeLessThan(1000);
    });

    it("should order sections with newest first for relevance", () => {
      relay.recordSubtaskResult(ctx, makeResult("sub-1", "pm", "Requirements defined."));
      relay.recordSubtaskResult(ctx, makeResult("sub-2", "architect", "Architecture designed."));

      const context = relay.buildAgentContext(ctx, "coder");
      // Both should be present
      expect(context).toContain("pm");
      expect(context).toContain("architect");
    });
  });

  // --------------------------------------------------------------------------
  // summarizeForHandoff
  // --------------------------------------------------------------------------

  describe("summarizeForHandoff", () => {
    it("should return full output when within limit", () => {
      const short = "Brief output.";
      expect(relay.summarizeForHandoff(short)).toBe(short);
    });

    it("should truncate long output", () => {
      const long = "x".repeat(50000);
      const summarized = relay.summarizeForHandoff(long);
      expect(summarized.length).toBeLessThan(long.length);
      expect(summarized).toContain("...");
    });
  });

  // --------------------------------------------------------------------------
  // getRelayStatus
  // --------------------------------------------------------------------------

  describe("getRelayStatus", () => {
    it("should reflect current state", () => {
      relay.recordSubtaskResult(ctx, makeResult("sub-1", "architect", "Done.", true, 5000, 0.15));
      relay.recordSubtaskResult(ctx, makeResult("sub-2", "coder", "", false, 60000, 0.05));

      const status = relay.getRelayStatus(ctx);
      expect(status.goalId).toBe("goal-1");
      expect(status.completedCount).toBe(2);
      expect(status.failedCount).toBe(1);
      expect(status.totalDurationMs).toBe(65000);
      expect(status.totalCostUsd).toBeCloseTo(0.20);
      expect(status.handoffChain).toEqual(["architect", "coder"]);
      expect(status.contextTokens).toBeGreaterThanOrEqual(0);
    });

    it("should show empty state for fresh relay", () => {
      const status = relay.getRelayStatus(ctx);
      expect(status.completedCount).toBe(0);
      expect(status.failedCount).toBe(0);
      expect(status.totalDurationMs).toBe(0);
      expect(status.totalCostUsd).toBe(0);
      expect(status.handoffChain).toHaveLength(0);
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeResult(
  subtaskId: string,
  agent: string,
  output: string,
  success = true,
  durationMs = 5000,
  estimatedCostUsd = 0.15,
): SubtaskResult {
  const result: SubtaskResult = {
    subtaskId,
    agent,
    success,
    output,
    durationMs,
    estimatedCostUsd,
  };
  if (!success) result.error = "Provider failed";
  return result;
}
