/**
 * Sprint 139 P0-2: Dynamic Iteration Budget tests (OpenMythos variable-depth analog).
 *
 * Validates that TaskComplexity controls evaluator loop depth:
 *   simple   → 0 optimize iterations, 1 lightweight eval
 *   moderate → 1 iteration, passThreshold=50
 *   complex  → 3 iterations, passThreshold=65
 *   critical → 5 iterations, passThreshold=75
 */

import { describe, it, expect, vi } from "vitest";
import { EvaluatorLoop } from "../../src/evaluator/loop.js";
import type {
  AgentResponse,
  EvaluationResult,
  TaskComplexity,
} from "../../src/evaluator/types.js";

// ---------------------------------------------------------------------------
// Helpers (same pattern as convergence-guard.test.ts)
// ---------------------------------------------------------------------------

function makeResponse(id = "budget-test"): AgentResponse {
  return {
    id,
    task: "test question",
    content: "test answer",
    model: "sonnet",
    timestamp: new Date().toISOString(),
  };
}

function makeEvalResult(overall: number, responseId = "budget-test"): EvaluationResult {
  return {
    responseId,
    scores: {
      overall,
      dimensions: {
        correctness: overall,
        efficiency: overall,
        clarity: overall,
        safety: overall,
        ceoAlignment: overall,
      },
      confidence: 0.8,
      level: overall >= 90 ? "excellent" as const : overall >= 70 ? "good" as const : "needs_improvement" as const,
      evaluatedAt: new Date().toISOString(),
    },
    suggestions: [],
    evaluatedAt: new Date().toISOString(),
    evaluationModel: "test",
    durationMs: 5,
  };
}

function makeLoop(scoreSequence: number[]) {
  const evalSpy = vi.fn();
  let callIndex = 0;
  evalSpy.mockImplementation(async () => {
    const score = scoreSequence[callIndex] ?? scoreSequence[scoreSequence.length - 1]!;
    callIndex++;
    return makeEvalResult(score);
  });

  const optimizeSpy = vi.fn(async (resp: AgentResponse) => ({
    originalResponseId: resp.id,
    optimizedResponse: {
      id: `${resp.id}-opt-${Date.now()}`,
      task: resp.task,
      content: resp.content + " [optimized]",
      model: resp.model,
      timestamp: new Date().toISOString(),
    },
    strategyUsed: "rephrase",
    beforeScore: { overall: 0, dimensions: {}, confidence: 0 },
    afterScore: { overall: 0, dimensions: {}, confidence: 0 },
    attemptNumber: 1,
    durationMs: 5,
  }));

  const mockEvaluator = { evaluate: evalSpy } as never;
  const mockOptimizer = {
    selectStrategy: vi.fn(() => ({
      name: "rephrase",
      priority: 1,
      maxAttempts: 10,
      cooldownMs: 0,
      action: "rephrase",
    })),
    optimize: optimizeSpy,
  } as never;

  // High threshold so scores don't auto-PASS (except when we test that)
  const loop = new EvaluatorLoop(mockEvaluator, mockOptimizer, {
    thresholds: { minOverall: 95, minPerDimension: 40, excellentThreshold: 95, goodThreshold: 80 },
    limits: { maxRetries: 10, maxOptimizationTime: 30000 },
    convergenceGuard: { warmup: 0, patience: 100, minDelta: 1 }, // disable convergence guard
  });
  loop.start();

  return { loop, evalSpy, optimizeSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dynamic Iteration Budget — complexity → iteration count", () => {
  it("simple → 0 optimize iterations, 1 eval (fast path)", async () => {
    const { loop, evalSpy, optimizeSpy } = makeLoop([60, 55, 50]);
    const result = await loop.processResponse(makeResponse(), undefined, "simple");

    expect(evalSpy).toHaveBeenCalledTimes(1); // 1 lightweight eval
    expect(optimizeSpy).not.toHaveBeenCalled(); // 0 optimize iterations
    expect(result.iterations).toBe(1);
    expect(result.finalScore).toBe(60); // records the score
  });

  it("moderate → max 1 iteration", async () => {
    // Score 40 < threshold 50 → evaluates once, optimizes once, evaluates again
    // But maxRetries=1 means only 1 iteration total
    const { loop, evalSpy } = makeLoop([40, 45, 50]);
    const result = await loop.processResponse(makeResponse(), undefined, "moderate");

    // 1 iteration = 1 eval. With threshold 50 and score 40, it doesn't PASS.
    // maxRetries=1 limits the loop to 1 eval.
    expect(evalSpy).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
  });

  it("complex → max 3 iterations", async () => {
    // All scores below threshold (65) → runs full 3 iterations
    const { loop, evalSpy } = makeLoop([40, 42, 44, 46, 48]);
    const result = await loop.processResponse(makeResponse(), undefined, "complex");

    expect(evalSpy).toHaveBeenCalledTimes(3);
    expect(result.iterations).toBe(3);
  });

  it("critical → max 5 iterations", async () => {
    // All scores below threshold (75) → runs full 5 iterations
    const { loop, evalSpy } = makeLoop([50, 52, 54, 56, 58, 60, 62]);
    const result = await loop.processResponse(makeResponse(), undefined, "critical");

    expect(evalSpy).toHaveBeenCalledTimes(5);
    expect(result.iterations).toBe(5);
  });
});

describe("Dynamic Iteration Budget — threshold override", () => {
  it("complex threshold (65) allows PASS at 70", async () => {
    const { loop, evalSpy } = makeLoop([70]);
    const result = await loop.processResponse(makeResponse(), undefined, "complex");

    // 70 >= 65 (complex threshold) → PASS on first eval
    expect(evalSpy).toHaveBeenCalledTimes(1);
    expect(result.finalScore).toBe(70);
  });

  it("critical threshold (75) rejects score 70, accepts 80", async () => {
    const { loop, evalSpy } = makeLoop([70, 80]);
    const result = await loop.processResponse(makeResponse(), undefined, "critical");

    // 70 < 75 → optimize → 80 >= 75 → PASS on second eval
    expect(evalSpy).toHaveBeenCalledTimes(2);
    expect(result.finalScore).toBe(80);
  });
});

describe("Dynamic Iteration Budget — no complexity (backward compat)", () => {
  it("without complexity, uses static config (maxRetries=10, threshold=95)", async () => {
    const { loop, evalSpy } = makeLoop([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]);
    const result = await loop.processResponse(makeResponse());

    // No complexity → static maxRetries=10 from config
    expect(evalSpy).toHaveBeenCalledTimes(10);
    expect(result.iterations).toBe(10);
  });
});

describe("Dynamic Iteration Budget — event emission", () => {
  it("emits iteration_budget_applied when complexity is provided", async () => {
    const { loop } = makeLoop([60]);
    const events: Array<{ type: string }> = [];
    loop.on("iteration_budget_applied" as never, (data: { type: string }) => events.push(data));

    await loop.processResponse(makeResponse(), undefined, "simple");

    expect(events).toHaveLength(1);
  });

  it("does NOT emit iteration_budget_applied when complexity is omitted", async () => {
    const { loop } = makeLoop([96]); // above threshold → immediate PASS
    const events: Array<{ type: string }> = [];
    loop.on("iteration_budget_applied" as never, (data: { type: string }) => events.push(data));

    await loop.processResponse(makeResponse());

    expect(events).toHaveLength(0);
  });
});
