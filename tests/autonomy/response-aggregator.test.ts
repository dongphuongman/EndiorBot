/**
 * ResponseAggregator Tests — Sprint 95
 *
 * Tests template-based aggregation of multi-agent results.
 *
 * @module tests/autonomy/response-aggregator
 * @sprint 95
 */

import { describe, it, expect } from "vitest";
import { ResponseAggregator } from "../../src/autonomy/response-aggregator.js";
import type { SubtaskResult } from "../../src/autonomy/types.js";

describe("ResponseAggregator", () => {
  const aggregator = new ResponseAggregator();

  // --------------------------------------------------------------------------
  // Empty / single
  // --------------------------------------------------------------------------

  it("should return empty response for no results", () => {
    const result = aggregator.aggregate([]);
    expect(result.text).toContain("No results");
    expect(result.agents).toHaveLength(0);
    expect(result.totalDurationMs).toBe(0);
  });

  it("should passthrough single successful result", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "architect", "Use REST API.", true, 5000, 0.15),
    ]);

    expect(result.text).toBe("Use REST API.");
    expect(result.agents).toEqual(["architect"]);
    expect(result.totalDurationMs).toBe(5000);
    expect(result.format).toBe("markdown");
  });

  it("should format single failed result with error", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "coder", "", false, 60000, 0.05),
    ]);

    expect(result.text).toContain("Error");
    expect(result.agents).toEqual(["coder"]);
  });

  // --------------------------------------------------------------------------
  // Multi-agent
  // --------------------------------------------------------------------------

  it("should aggregate multiple sequential results", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "architect", "Design: microservices pattern."),
      makeResult("sub-2", "coder", "Implementation: 3 new files."),
    ]);

    expect(result.text).toContain("@architect");
    expect(result.text).toContain("@coder");
    expect(result.text).toContain("microservices");
    expect(result.text).toContain("3 new files");
    expect(result.text).toContain("Multi-agent response");
    expect(result.agents).toEqual(["architect", "coder"]);
    expect(result.totalDurationMs).toBe(10000);
    expect(result.totalCostUsd).toBeCloseTo(0.30);
  });

  it("should include metadata header with stats", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "pm", "Plan done.", true, 3000, 0.10),
      makeResult("sub-2", "architect", "Design done.", true, 7000, 0.20),
    ]);

    expect(result.text).toContain("2/2 completed");
    expect(result.text).toContain("@pm");
    expect(result.text).toContain("@architect");
  });

  it("should handle partial failure gracefully", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "architect", "Design complete.", true, 5000, 0.15),
      makeResult("sub-2", "coder", "", false, 60000, 0.05),
    ]);

    expect(result.text).toContain("1/2 completed");
    expect(result.text).toContain("Design complete");
    expect(result.text).toContain("Errors");
    expect(result.text).toContain("@coder");
    expect(result.subtaskResults).toHaveLength(2);
  });

  it("should handle all-failed results", () => {
    const result = aggregator.aggregate([
      makeResult("sub-1", "architect", "", false, 60000, 0.05),
      makeResult("sub-2", "coder", "", false, 60000, 0.05),
    ]);

    expect(result.text).toContain("0/2 completed");
    expect(result.text).toContain("Errors");
  });

  // --------------------------------------------------------------------------
  // Truncation
  // --------------------------------------------------------------------------

  it("should truncate output exceeding max length", () => {
    const small = new ResponseAggregator(200);
    const result = small.aggregate([
      makeResult("sub-1", "architect", "x".repeat(300)),
      makeResult("sub-2", "coder", "y".repeat(300)),
    ]);

    expect(result.text.length).toBeLessThanOrEqual(200);
    expect(result.text).toContain("truncated");
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
