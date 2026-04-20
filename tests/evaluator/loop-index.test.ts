/**
 * Sprint 139 P1-4: Loop-Index Aware Optimization tests.
 * OpenMythos loop-index embedding analog.
 *
 * Validates:
 *   - Iteration guidance text varies by tier (early/middle/late)
 *   - Strategy selection priority shifts by iteration index
 *   - iterationIndex + totalIterations are threaded to optimizer
 */

import { describe, it, expect, vi } from "vitest";
import { Optimizer } from "../../src/evaluator/optimizer.js";
import type { ScoreCard, OptimizationStrategy } from "../../src/evaluator/types.js";

// ---------------------------------------------------------------------------
// Iteration guidance text
// ---------------------------------------------------------------------------

describe("Loop-index — iteration guidance text", () => {
  const optimizer = new Optimizer();

  it("returns empty string when iterationIndex is undefined", () => {
    expect(optimizer.buildIterationGuidance(undefined)).toBe("");
  });

  it("early iteration (0) mentions 'first refinement' and 'targeted'", () => {
    const text = optimizer.buildIterationGuidance(0, 5);
    expect(text).toContain("first refinement");
    expect(text).toContain("1/5");
    expect(text).toContain("targeted");
  });

  it("middle iteration (1) mentions 'different approach'", () => {
    const text = optimizer.buildIterationGuidance(1, 5);
    expect(text).toContain("different approach");
    expect(text).toContain("2/5");
  });

  it("late iteration (2+) mentions 'restructuring entirely'", () => {
    const text = optimizer.buildIterationGuidance(2, 5);
    expect(text).toContain("restructuring");
    expect(text).toContain("3/5");

    const text3 = optimizer.buildIterationGuidance(4, 5);
    expect(text3).toContain("5/5");
  });

  it("all three tiers produce distinct text", () => {
    const early = optimizer.buildIterationGuidance(0, 3);
    const mid = optimizer.buildIterationGuidance(1, 3);
    const late = optimizer.buildIterationGuidance(2, 3);
    expect(early).not.toBe(mid);
    expect(mid).not.toBe(late);
    expect(early).not.toBe(late);
  });
});

// ---------------------------------------------------------------------------
// Iteration-aware strategy selection
// ---------------------------------------------------------------------------

describe("Loop-index — iterationAdjustedPriority", () => {
  // Access private method for direct testing
  const optimizer = new Optimizer();
  const adjustPriority = (strategy: { name: string; priority: number }, iterationIndex: number): number =>
    (optimizer as unknown as { iterationAdjustedPriority(s: { name: string; priority: number }, i: number): number })
      .iterationAdjustedPriority(strategy as OptimizationStrategy, iterationIndex);

  it("early iteration (0) boosts rephrase (+20) and penalizes escalate (-10)", () => {
    expect(adjustPriority({ name: "rephrase", priority: 50 }, 0)).toBe(70);
    expect(adjustPriority({ name: "add-context", priority: 50 }, 0)).toBe(70);
    expect(adjustPriority({ name: "escalate-model", priority: 50 }, 0)).toBe(40);
    expect(adjustPriority({ name: "decompose", priority: 50 }, 0)).toBe(40);
  });

  it("middle iteration (1) uses base priority unchanged", () => {
    expect(adjustPriority({ name: "rephrase", priority: 50 }, 1)).toBe(50);
    expect(adjustPriority({ name: "escalate-model", priority: 50 }, 1)).toBe(50);
  });

  it("late iteration (2+) boosts escalate/decompose (+20) and penalizes rephrase (-10)", () => {
    expect(adjustPriority({ name: "escalate-model", priority: 50 }, 2)).toBe(70);
    expect(adjustPriority({ name: "decompose", priority: 50 }, 2)).toBe(70);
    expect(adjustPriority({ name: "rephrase", priority: 50 }, 2)).toBe(40);
    expect(adjustPriority({ name: "add-context", priority: 50 }, 3)).toBe(40);
  });

  it("unknown strategy name gets base priority at all tiers", () => {
    expect(adjustPriority({ name: "reduce-scope", priority: 50 }, 0)).toBe(50);
    expect(adjustPriority({ name: "reduce-scope", priority: 50 }, 2)).toBe(50);
  });
});
