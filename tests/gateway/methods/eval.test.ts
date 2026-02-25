/**
 * Tests for Gateway Evaluator Methods
 *
 * @module tests/gateway/methods/eval
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  registerEvalMethods,
  clearEvalHistory,
  getEvaluator,
  type EvalScoreParams,
  type EvalHistoryParams,
  type EvalCompareParams,
} from '../../../src/gateway/methods/eval.js';
import { clearFeedback, storeFeedback } from '../../../src/evaluator/brain-bridge.js';
import type { AgentResponse } from '../../../src/evaluator/types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    id: `test-${Date.now()}`,
    task: 'Test task',
    content: 'Test response content',
    model: 'test-model',
    timestamp: new Date().toISOString(),
    tokens: { input: 20, output: 50 },
    ...overrides,
  };
}

function createMockServer() {
  const methods = new Map<string, Function>();
  return {
    registerMethod: (name: string, handler: Function) => {
      methods.set(name, handler);
    },
    getMethod: (name: string) => methods.get(name),
    hasMethod: (name: string) => methods.has(name),
    methodCount: () => methods.size,
  };
}

// =============================================================================
// Registration Tests
// =============================================================================

describe('Eval Methods Registration', () => {
  it('should register all eval methods', () => {
    const server = createMockServer();
    registerEvalMethods(server as any);

    expect(server.hasMethod('eval.score')).toBe(true);
    expect(server.hasMethod('eval.history')).toBe(true);
    expect(server.hasMethod('eval.compare')).toBe(true);
    expect(server.methodCount()).toBe(3);
  });
});

// =============================================================================
// eval.history Tests
// =============================================================================

describe('eval.history', () => {
  let server: ReturnType<typeof createMockServer>;
  let handler: Function;

  beforeEach(() => {
    clearFeedback();
    server = createMockServer();
    registerEvalMethods(server as any);
    handler = server.getMethod('eval.history')!;
  });

  afterEach(() => {
    clearFeedback();
  });

  it('should return empty history initially', () => {
    const result = handler({}, {});

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.averageScore).toBe(0);
  });

  it('should return stored feedback', () => {
    // Store some feedback
    storeFeedback({
      task: 'Test task 1',
      score: 80,
    });
    storeFeedback({
      task: 'Test task 2',
      score: 90,
    });

    const result = handler({}, {});

    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('should respect limit parameter', () => {
    // Store multiple feedback entries
    for (let i = 0; i < 10; i++) {
      storeFeedback({
        task: `Task ${i}`,
        score: 70 + i,
      });
    }

    const result = handler({ limit: 5 }, {});

    expect(result.entries.length).toBeLessThanOrEqual(5);
  });

  it('should filter by task', () => {
    storeFeedback({
      task: 'Coding task',
      score: 85,
    });
    storeFeedback({
      task: 'Writing task',
      score: 75,
    });

    const result = handler({ task: 'Coding' }, {});

    expect(result.entries.every(e => e.task.includes('Coding'))).toBe(true);
  });
});

// =============================================================================
// eval.score Tests (using mocked evaluator)
// =============================================================================

describe('eval.score', () => {
  let server: ReturnType<typeof createMockServer>;
  let handler: Function;

  beforeEach(() => {
    server = createMockServer();
    registerEvalMethods(server as any);
    handler = server.getMethod('eval.score')!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate response parameter', async () => {
    await expect(handler({}, {})).rejects.toThrow('Invalid response');
    await expect(handler({ response: {} }, {})).rejects.toThrow('Invalid response');
    await expect(handler({ response: { id: 'x' } }, {})).rejects.toThrow('Invalid response');
  });

  it('should return score result with mocked evaluator', async () => {
    const evaluator = getEvaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue({
      responseId: 'test-1',
      scores: {
        overall: 85,
        dimensions: {
          correctness: 90,
          efficiency: 80,
          clarity: 85,
          safety: 90,
          ceoAlignment: 80,
        },
        confidence: 0.9,
      },
      suggestions: [],
      evaluatedAt: new Date().toISOString(),
      evaluationModel: 'test-model',
      durationMs: 100,
    });

    const response = createMockResponse();
    const result = await handler({ response }, {});

    expect(result.overall).toBe(85);
    expect(result.dimensions.correctness).toBe(90);
    expect(result.confidence).toBe(0.9);
    expect(result.level).toBe('good');
  });
});

// =============================================================================
// eval.compare Tests (using mocked evaluator)
// =============================================================================

describe('eval.compare', () => {
  let server: ReturnType<typeof createMockServer>;
  let handler: Function;

  beforeEach(() => {
    server = createMockServer();
    registerEvalMethods(server as any);
    handler = server.getMethod('eval.compare')!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate responseA parameter', async () => {
    const responseB = createMockResponse({ id: 'b' });
    await expect(handler({ responseB }, {})).rejects.toThrow('Invalid responseA');
  });

  it('should validate responseB parameter', async () => {
    const responseA = createMockResponse({ id: 'a' });
    await expect(handler({ responseA }, {})).rejects.toThrow('Invalid responseB');
  });

  it('should return comparison result with mocked evaluator', async () => {
    const evaluator = getEvaluator();
    vi.spyOn(evaluator, 'compareResponses').mockResolvedValue({
      responseIdA: 'a',
      responseIdB: 'b',
      comparison: {
        winner: 'a',
        overallDiff: 10,
        dimensionDiffs: {
          correctness: 15,
          efficiency: 5,
          clarity: 10,
          safety: 5,
          ceoAlignment: 15,
        },
        improvementPercent: 12.5,
      },
      recommendation: 'use_a',
      reasoning: 'Response A is better overall',
    });

    const responseA = createMockResponse({ id: 'a' });
    const responseB = createMockResponse({ id: 'b' });
    const result = await handler({ responseA, responseB }, {});

    expect(result.winner).toBe('a');
    expect(result.delta).toBe(10);
    expect(result.dimensions.correctness).toBe(15);
    expect(result.recommendation).toBe('use_a');
  });
});

// =============================================================================
// Test Helpers
// =============================================================================

describe('Eval Test Helpers', () => {
  it('should clear eval history', () => {
    storeFeedback({ task: 'Test', score: 80 });

    clearEvalHistory();

    const server = createMockServer();
    registerEvalMethods(server as any);
    const handler = server.getMethod('eval.history')!;
    const result = handler({}, {});

    expect(result.entries).toHaveLength(0);
  });

  it('should provide evaluator instance', () => {
    const evaluator = getEvaluator();

    expect(evaluator).toBeDefined();
    expect(typeof evaluator.evaluate).toBe('function');
    expect(typeof evaluator.compareResponses).toBe('function');
  });
});
