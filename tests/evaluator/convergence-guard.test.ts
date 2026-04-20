/**
 * Sprint 139 P0-1: Convergence Guard tests (OpenMythos ACT analog).
 *
 * Validates the robust convergence detection pattern (CPO: patience +
 * minDelta + warmup) in the evaluator loop. Each test mocks the Evaluator
 * to return predetermined score sequences and verifies the loop exits at
 * the correct iteration.
 *
 * CTO condition: uses <= (flat score after decline counts as non-convergence).
 * Rollback criterion: if guard triggers on >40% of runs, threshold too aggressive.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluatorLoop } from "../../src/evaluator/loop.js";
import type {
  AgentResponse,
  EvaluationResult,
  LoopConfig,
  ConvergenceGuardConfig,
} from "../../src/evaluator/types.js";
import {
  DEFAULT_LOOP_CONFIG,
  DEFAULT_CONVERGENCE_GUARD,
} from "../../src/evaluator/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(id = "test-1"): AgentResponse {
  return {
    id,
    task: "test question",
    content: "test answer",
    model: "sonnet",
    timestamp: new Date().toISOString(),
  };
}

function makeEvalResult(overall: number, responseId = "test-1"): EvaluationResult {
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

function makeLoop(
  scoreSequence: number[],
  configOverrides?: Partial<LoopConfig>,
  convergenceGuard?: Partial<ConvergenceGuardConfig>,
): { loop: EvaluatorLoop; evalSpy: ReturnType<typeof vi.fn> } {
  const evalSpy = vi.fn();
  let callIndex = 0;
  evalSpy.mockImplementation(async () => {
    const score = scoreSequence[callIndex] ?? scoreSequence[scoreSequence.length - 1]!;
    callIndex++;
    return makeEvalResult(score);
  });

  const mockEvaluator = { evaluate: evalSpy } as never;
  const mockOptimizer = {
    selectStrategy: vi.fn(() => ({ name: "rephrase", priority: 1, maxAttempts: 10, cooldownMs: 0, action: "rephrase" })),
    optimize: vi.fn(async (resp: AgentResponse) => {
      const optimized: AgentResponse = {
        id: `${resp.id}-opt-${Date.now()}`,
        task: resp.task,
        content: resp.content + " [optimized]",
        model: resp.model,
        timestamp: new Date().toISOString(),
      };
      return {
        originalResponseId: resp.id,
        optimizedResponse: optimized,
        strategyUsed: "rephrase",
        beforeScore: { overall: 0, dimensions: {}, confidence: 0 },
        afterScore: { overall: 0, dimensions: {}, confidence: 0 },
        attemptNumber: 1,
        durationMs: 5,
      };
    }),
  } as never;

  const config: Partial<LoopConfig> = {
    ...configOverrides,
    thresholds: {
      minOverall: 95, // High threshold so test scores (60-90) don't trigger PASS exit
      minPerDimension: 40,
      excellentThreshold: 95,
      goodThreshold: 80,
      ...(configOverrides?.thresholds ?? {}),
    },
    limits: {
      maxRetries: Math.max(scoreSequence.length + 2, 10), // room for all scores
      maxOptimizationTime: 30000,
      ...(configOverrides?.limits ?? {}),
    },
  };
  if (convergenceGuard) {
    config.convergenceGuard = { ...DEFAULT_CONVERGENCE_GUARD, ...convergenceGuard };
  }

  // Constructor: (evaluator, optimizer, config?)
  const loop = new EvaluatorLoop(mockEvaluator, mockOptimizer, config);
  loop.start(); // processResponse requires state === 'running'
  return { loop, evalSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Convergence guard — declining scores", () => {
  it("halts after 2 consecutive declines (default patience=2, minDelta=1)", async () => {
    // Scores: 70, 65, 60 → decline at iter 1, decline at iter 2 → halt
    const { loop, evalSpy } = makeLoop([70, 65, 60, 55, 50]);
    const result = await loop.processResponse(makeResponse());

    // Should have evaluated 3 times (iter 0, 1, 2) then halted at iter 2
    expect(evalSpy).toHaveBeenCalledTimes(3);
    expect(result.finalScore).toBe(70); // bestScore
    expect(result.iterations).toBe(3);
  });

  it("flat score after decline counts as non-improving (CTO <= condition)", async () => {
    // Scores: 70, 65, 65 → decline at iter 1, plateau at iter 2 → halt
    const { loop, evalSpy } = makeLoop([70, 65, 65, 60]);
    const result = await loop.processResponse(makeResponse());

    expect(evalSpy).toHaveBeenCalledTimes(3);
    expect(result.finalScore).toBe(70);
  });

  it("uptick resets non-improving streak", async () => {
    // Scores: 70, 65, 72, 68, 63 → decline, uptick(reset), decline, decline → halt
    const { loop, evalSpy } = makeLoop([70, 65, 72, 68, 63, 60]);
    const result = await loop.processResponse(makeResponse());

    // iter 0: 70 (baseline), iter 1: 65 (streak=1), iter 2: 72 (reset, new best),
    // iter 3: 68 (streak=1), iter 4: 63 (streak=2) → halt
    expect(evalSpy).toHaveBeenCalledTimes(5);
    expect(result.finalScore).toBe(72);
  });
});

describe("Convergence guard — warmup", () => {
  it("does not arm during warmup iterations", async () => {
    // Scores: 70, 65, 60, 55 → with warmup=2, guard only arms from iter 2
    // iter 0: 70 (warmup), iter 1: 65 (warmup), iter 2: 60 (streak=1),
    // iter 3: 55 (streak=2) → halt
    const { loop, evalSpy } = makeLoop(
      [70, 65, 60, 55, 50],
      undefined,
      { warmup: 2, patience: 2, minDelta: 1 },
    );
    const result = await loop.processResponse(makeResponse());

    expect(evalSpy).toHaveBeenCalledTimes(4);
    expect(result.finalScore).toBe(70);
  });
});

describe("Convergence guard — patience", () => {
  it("patience=3 tolerates 2 non-improving before halting on 3rd", async () => {
    // Scores: 70, 65, 60, 55, 50 → with patience=3
    // iter 0: baseline, iter 1: streak=1, iter 2: streak=2, iter 3: streak=3 → halt
    const { loop, evalSpy } = makeLoop(
      [70, 65, 60, 55, 50],
      undefined,
      { patience: 3, minDelta: 1 },
    );
    const result = await loop.processResponse(makeResponse());

    expect(evalSpy).toHaveBeenCalledTimes(4);
    expect(result.finalScore).toBe(70);
  });
});

describe("Convergence guard — minDelta", () => {
  it("minDelta=5 requires score > bestScore-5 to count as improvement", async () => {
    // W1 fix: use correct score sequence.
    // Scores: 70, 72, 66, 65 → iter 0: 70 (baseline), iter 1: 72 (new best=72, 72>70-5=65 ✓ reset),
    // iter 2: 66, check 66 > 72-5=67 → NO (66 ≤ 67) → streak=1,
    // iter 3: 65, check 65 > 72-5=67 → NO → streak=2 → HALT
    const { loop, evalSpy } = makeLoop(
      [70, 72, 66, 65, 60],
      undefined,
      { patience: 2, minDelta: 5 },
    );
    const result = await loop.processResponse(makeResponse());

    expect(evalSpy).toHaveBeenCalledTimes(4);
    expect(result.finalScore).toBe(72); // best was at iter 1
  });
});

describe("Convergence guard — pass threshold takes priority", () => {
  it("loop exits on PASS even if score declined from best", async () => {
    // Scores: 90, 85, 80 → declining, but all above threshold=50
    // The PASS exit (score >= threshold) fires BEFORE convergence check
    // Use a LOW threshold override for this test so 90 passes immediately
    const { loop, evalSpy } = makeLoop(
      [90, 85, 80],
      { thresholds: { minOverall: 50, minPerDimension: 40, excellentThreshold: 95, goodThreshold: 80 } },
    );
    const result = await loop.processResponse(makeResponse(), 50);

    // First eval (90) >= 50 → PASS exit immediately
    expect(evalSpy).toHaveBeenCalledTimes(1);
    expect(result.finalScore).toBe(90);
  });
});

describe("Convergence guard — event emission", () => {
  it("emits convergence_halted event when guard triggers", async () => {
    const { loop } = makeLoop([70, 65, 60]);
    const events: Array<{ type: string }> = [];
    loop.on("convergence_halted", (data) => events.push(data));

    await loop.processResponse(makeResponse());

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("convergence_halted");
  });

  it("does NOT emit convergence_halted when loop exits normally", async () => {
    const { loop } = makeLoop([90]); // immediate PASS
    const events: Array<{ type: string }> = [];
    loop.on("convergence_halted", (data) => events.push(data));

    await loop.processResponse(makeResponse(), 50);

    expect(events).toHaveLength(0);
  });
});

describe("Convergence guard — effectively disabled via high patience", () => {
  it("runs full loop when patience exceeds maxRetries", async () => {
    // Scores: 70, 65, 60, 55, 50 → declining, but patience=100 → never halts
    const { loop, evalSpy } = makeLoop(
      [70, 65, 60, 55, 50],
      { limits: { maxRetries: 5, maxOptimizationTime: 30000 } },
      { patience: 100 },
    );
    await loop.processResponse(makeResponse());

    expect(evalSpy).toHaveBeenCalledTimes(5);
  });
});
