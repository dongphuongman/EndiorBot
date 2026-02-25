/**
 * Tests for Evaluator Loop Orchestrator
 *
 * @module tests/evaluator/loop
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EvaluatorLoop,
  createEvaluatorLoop,
  createEvaluatorLoopWithComponents,
  DEFAULT_LOOP_CONFIG,
  type LoopEventData,
  type ProcessedResponse,
} from '../../src/evaluator/loop.js';
import { Evaluator } from '../../src/evaluator/evaluator.js';
import { Optimizer } from '../../src/evaluator/optimizer.js';
// Note: ScoreCardCalculator is not used by EvaluatorLoop directly
import type { AgentResponse, EvaluationResult, ScoreCard } from '../../src/evaluator/types.js';
import { clearFeedback, getRecentFeedback } from '../../src/evaluator/brain-bridge.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    id: 'test-response-1',
    task: 'Test task',
    content: 'Test response content',
    model: 'test-model',
    timestamp: new Date().toISOString(),
    tokens: { input: 20, output: 50 },
    ...overrides,
  };
}

function createMockScoreCard(overall: number): ScoreCard {
  return {
    overall,
    dimensions: {
      correctness: overall,
      efficiency: overall,
      clarity: overall,
      safety: overall,
      ceoAlignment: overall,
    },
    confidence: 0.8,
    level: overall >= 90 ? 'excellent' : overall >= 70 ? 'good' : overall >= 50 ? 'needs_improvement' : 'poor',
    evaluatedAt: new Date().toISOString(),
  };
}

function createMockEvaluation(overall: number): EvaluationResult {
  return {
    responseId: 'test-response-1',
    scores: createMockScoreCard(overall),
    suggestions: [],
    evaluatedAt: new Date().toISOString(),
    evaluationModel: 'test-model',
    durationMs: 10,
  };
}

// =============================================================================
// Loop Creation Tests
// =============================================================================

describe('EvaluatorLoop Creation', () => {
  it('should create with default config', () => {
    const loop = createEvaluatorLoop();
    const status = loop.getStatus();

    expect(status.state).toBe('stopped');
    expect(status.autoOptimize).toBe(true);
    expect(status.thresholds.minOverall).toBe(50);
    expect(status.limits.maxRetries).toBe(3);
  });

  it('should create with custom config', () => {
    const loop = createEvaluatorLoop({
      autoOptimize: false,
      thresholds: { minOverall: 60, minPerDimension: 50 },
      limits: { maxRetries: 5, maxOptimizationTime: 60000 },
    });

    const status = loop.getStatus();

    expect(status.autoOptimize).toBe(false);
    expect(status.thresholds.minOverall).toBe(60);
    expect(status.limits.maxRetries).toBe(5);
  });

  it('should create with custom components', () => {
    const evaluator = new Evaluator();
    const optimizer = new Optimizer();
    const loop = createEvaluatorLoopWithComponents(evaluator, optimizer);

    expect(loop.getStatus().state).toBe('stopped');
  });
});

// =============================================================================
// Control Methods Tests
// =============================================================================

describe('EvaluatorLoop Control', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
  });

  describe('start()', () => {
    it('should start the loop', () => {
      loop.start();
      const status = loop.getStatus();

      expect(status.state).toBe('running');
      expect(status.startedAt).toBeDefined();
    });

    it('should not change state if already running', () => {
      loop.start();
      const firstStart = loop.getStatus().startedAt;

      loop.start(); // Should warn but not change
      const secondStart = loop.getStatus().startedAt;

      expect(firstStart).toBe(secondStart);
    });
  });

  describe('stop()', () => {
    it('should stop the loop', () => {
      loop.start();
      loop.stop();

      const status = loop.getStatus();
      expect(status.state).toBe('stopped');
      expect(status.startedAt).toBeUndefined();
    });
  });

  describe('pause()', () => {
    it('should pause running loop', () => {
      loop.start();
      loop.pause();

      const status = loop.getStatus();
      expect(status.state).toBe('paused');
      expect(status.pausedAt).toBeDefined();
    });

    it('should not pause if not running', () => {
      loop.pause(); // Should warn

      expect(loop.getStatus().state).toBe('stopped');
    });
  });

  describe('resume()', () => {
    it('should resume paused loop', () => {
      loop.start();
      loop.pause();
      loop.resume();

      const status = loop.getStatus();
      expect(status.state).toBe('running');
      expect(status.pausedAt).toBeUndefined();
    });

    it('should not resume if not paused', () => {
      loop.start();
      loop.resume(); // Should warn

      expect(loop.getStatus().state).toBe('running');
    });
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('EvaluatorLoop Configuration', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
  });

  it('should update thresholds', () => {
    loop.setThresholds({ minOverall: 70, minPerDimension: 60 });

    const status = loop.getStatus();
    expect(status.thresholds.minOverall).toBe(70);
    expect(status.thresholds.minPerDimension).toBe(60);
  });

  it('should update max retries', () => {
    loop.setMaxRetries(5);

    expect(loop.getStatus().limits.maxRetries).toBe(5);
  });

  it('should update auto-optimize', () => {
    loop.setAutoOptimize(false);

    expect(loop.getStatus().autoOptimize).toBe(false);
  });

  it('should get config', () => {
    const config = loop.getConfig();

    expect(config.enabled).toBe(true);
    expect(config.autoOptimize).toBe(true);
    expect(config.thresholds).toBeDefined();
  });
});

// =============================================================================
// Event Handling Tests
// =============================================================================

describe('EvaluatorLoop Events', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
    clearFeedback();
  });

  it('should emit evaluated event', async () => {
    const events: LoopEventData[] = [];
    loop.on('evaluated', (data) => events.push(data));

    // Mock evaluator
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(80));

    const loopWithMock = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    loopWithMock.on('evaluated', (data) => events.push(data));
    loopWithMock.start();

    await loopWithMock.processResponse(createMockResponse());

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('evaluated');
    expect(events[0]?.score).toBe(80);

    vi.restoreAllMocks();
  });

  it('should emit skipped event when not running', async () => {
    const events: LoopEventData[] = [];
    loop.on('skipped', (data) => events.push(data));

    // Don't start the loop
    await loop.processResponse(createMockResponse());

    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('skipped');
  });

  it('should remove event handler with off()', async () => {
    const events: LoopEventData[] = [];
    const handler = (data: LoopEventData) => events.push(data);

    loop.on('skipped', handler);
    loop.off('skipped', handler);

    await loop.processResponse(createMockResponse());

    expect(events.length).toBe(0);
  });
});

// =============================================================================
// Process Response Tests
// =============================================================================

describe('EvaluatorLoop processResponse', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
    clearFeedback();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip processing when loop is stopped', async () => {
    const result = await loop.processResponse(createMockResponse());

    expect(result.iterations).toBe(0);
    expect(result.finalScore).toBeDefined();
  });

  it('should evaluate when loop is running', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(85));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    const result = await testLoop.processResponse(createMockResponse());

    expect(result.iterations).toBeGreaterThan(0);
    expect(result.finalScore).toBe(85);
  });

  it('should exit early on PASS (score >= threshold)', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(90));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer(),
      { thresholds: { minOverall: 80, minPerDimension: 70 } }
    );
    testLoop.start();

    const result = await testLoop.processResponse(createMockResponse());

    // Should exit on first iteration since 90 >= 80
    expect(result.iterations).toBe(1);
    expect(result.finalScore).toBe(90);
  });

  it('should store feedback on every iteration', async () => {
    const evaluator = new Evaluator();
    // First evaluation: 40 (below threshold), second: 60 (still below), third: 80 (pass)
    vi.spyOn(evaluator, 'evaluate')
      .mockResolvedValueOnce(createMockEvaluation(40))
      .mockResolvedValueOnce(createMockEvaluation(60))
      .mockResolvedValueOnce(createMockEvaluation(80));

    const optimizer = new Optimizer();
    vi.spyOn(optimizer, 'selectStrategy').mockReturnValue({
      name: 'test-strategy',
      description: 'Test',
      trigger: { dimension: 'overall', operator: '<', value: 70 },
      action: { type: 'modify', params: {} },
      priority: 5,
      maxAttempts: 2,
      cooldownMs: 1000,
      enabled: true,
    });
    vi.spyOn(optimizer, 'optimize').mockResolvedValue({
      originalResponseId: 'test-response-1',
      optimizedResponse: createMockResponse({ content: 'Improved content' }),
      strategyUsed: 'test-strategy',
      beforeScore: createMockScoreCard(40),
      afterScore: createMockScoreCard(60),
      attemptNumber: 1,
      durationMs: 10,
    });

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer,
      { thresholds: { minOverall: 70, minPerDimension: 50 } }
    );
    testLoop.start();

    await testLoop.processResponse(createMockResponse());

    // Should have stored feedback for each iteration
    const feedback = getRecentFeedback(10);
    expect(feedback.length).toBeGreaterThanOrEqual(2);
  });

  it('should track best response across iterations', async () => {
    const evaluator = new Evaluator();
    // Oscillating scores: 50 -> 70 -> 60 (best is 70)
    vi.spyOn(evaluator, 'evaluate')
      .mockResolvedValueOnce(createMockEvaluation(50))
      .mockResolvedValueOnce(createMockEvaluation(70))
      .mockResolvedValueOnce(createMockEvaluation(60));

    const optimizer = new Optimizer();
    vi.spyOn(optimizer, 'selectStrategy').mockReturnValue({
      name: 'test-strategy',
      description: 'Test',
      trigger: { dimension: 'overall', operator: '<', value: 80 },
      action: { type: 'modify', params: {} },
      priority: 5,
      maxAttempts: 2,
      cooldownMs: 1000,
      enabled: true,
    });
    vi.spyOn(optimizer, 'optimize').mockResolvedValue({
      originalResponseId: 'test-response-1',
      optimizedResponse: createMockResponse({ content: 'Improved content' }),
      strategyUsed: 'test-strategy',
      beforeScore: createMockScoreCard(40),
      afterScore: createMockScoreCard(60),
      attemptNumber: 1,
      durationMs: 10,
    });

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer,
      {
        thresholds: { minOverall: 75, minPerDimension: 50 },
        limits: { maxRetries: 3, maxOptimizationTime: 30000 },
      }
    );
    testLoop.start();

    const result = await testLoop.processResponse(createMockResponse());

    // Best score should be 70 (not the last 60)
    expect(result.finalScore).toBe(70);
  });

  it('should exit when no strategy available', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(40));

    const optimizer = new Optimizer();
    vi.spyOn(optimizer, 'selectStrategy').mockReturnValue(null); // No strategy

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer,
      { thresholds: { minOverall: 70, minPerDimension: 50 } }
    );
    testLoop.start();

    const result = await testLoop.processResponse(createMockResponse());

    // Should exit after first iteration (no strategy to apply)
    expect(result.iterations).toBe(1);
    expect(result.optimizationApplied).toBeUndefined();
  });
});

// =============================================================================
// OptimizeLoop Tests
// =============================================================================

describe('EvaluatorLoop optimizeLoop', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
    clearFeedback();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run with default 3-iter cap', async () => {
    const evaluator = new Evaluator();
    // All evaluations below threshold
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(40));

    const optimizer = new Optimizer();
    vi.spyOn(optimizer, 'selectStrategy').mockReturnValue({
      name: 'test-strategy',
      description: 'Test',
      trigger: { dimension: 'overall', operator: '<', value: 70 },
      action: { type: 'modify', params: {} },
      priority: 5,
      maxAttempts: 3,
      cooldownMs: 1000,
      enabled: true,
    });
    vi.spyOn(optimizer, 'optimize').mockResolvedValue({
      originalResponseId: 'test-response-1',
      optimizedResponse: createMockResponse({ content: 'Improved' }),
      strategyUsed: 'test-strategy',
      beforeScore: createMockScoreCard(40),
      afterScore: createMockScoreCard(60),
      attemptNumber: 1,
      durationMs: 10,
    });

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer
    );
    testLoop.start();

    const result = await testLoop.optimizeLoop('Test prompt', 'Test rubric');

    // Should cap at 3 iterations
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it('should respect custom maxIter', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(40));

    const optimizer = new Optimizer();
    vi.spyOn(optimizer, 'selectStrategy').mockReturnValue({
      name: 'test-strategy',
      description: 'Test',
      trigger: { dimension: 'overall', operator: '<', value: 70 },
      action: { type: 'modify', params: {} },
      priority: 5,
      maxAttempts: 5,
      cooldownMs: 1000,
      enabled: true,
    });
    vi.spyOn(optimizer, 'optimize').mockResolvedValue({
      originalResponseId: 'test-response-1',
      optimizedResponse: createMockResponse({ content: 'Improved' }),
      strategyUsed: 'test-strategy',
      beforeScore: createMockScoreCard(40),
      afterScore: createMockScoreCard(60),
      attemptNumber: 1,
      durationMs: 10,
    });

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer
    );
    testLoop.start();

    const result = await testLoop.optimizeLoop('Test prompt', 'Test rubric', 5);

    expect(result.iterations).toBeLessThanOrEqual(5);
  });

  it('should restore maxRetries after completion', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(90));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    const originalMaxRetries = testLoop.getConfig().limits.maxRetries;

    await testLoop.optimizeLoop('Test', 'Rubric', 10);

    // Should restore original
    expect(testLoop.getConfig().limits.maxRetries).toBe(originalMaxRetries);
  });
});

// =============================================================================
// EvaluateOnly Tests
// =============================================================================

describe('EvaluatorLoop evaluateOnly', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should evaluate without optimization', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(40));

    const optimizer = new Optimizer();
    const selectSpy = vi.spyOn(optimizer, 'selectStrategy');

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      optimizer
    );
    testLoop.start();

    const result = await testLoop.evaluateOnly(createMockResponse());

    expect(result.scores.overall).toBe(40);
    // Strategy should not be selected since auto-optimize is disabled
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('should restore auto-optimize setting', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(80));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    const originalAutoOptimize = testLoop.getConfig().autoOptimize;

    await testLoop.evaluateOnly(createMockResponse());

    expect(testLoop.getConfig().autoOptimize).toBe(originalAutoOptimize);
  });
});

// =============================================================================
// Metrics Tests
// =============================================================================

describe('EvaluatorLoop Metrics', () => {
  let loop: EvaluatorLoop;

  beforeEach(() => {
    loop = createEvaluatorLoop();
    clearFeedback();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should track evaluation count', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(80));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    await testLoop.processResponse(createMockResponse());
    await testLoop.processResponse(createMockResponse({ id: 'test-2' }));

    const metrics = testLoop.getMetrics();
    expect(metrics.totalEvaluated).toBe(2);
  });

  it('should track skipped count', async () => {
    // Loop not started
    await loop.processResponse(createMockResponse());
    await loop.processResponse(createMockResponse({ id: 'test-2' }));

    const metrics = loop.getMetrics();
    expect(metrics.totalSkipped).toBe(2);
  });

  it('should calculate average score', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate')
      .mockResolvedValueOnce(createMockEvaluation(80))
      .mockResolvedValueOnce(createMockEvaluation(90));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    await testLoop.processResponse(createMockResponse());
    await testLoop.processResponse(createMockResponse({ id: 'test-2' }));

    const metrics = testLoop.getMetrics();
    expect(metrics.averageScore).toBe(85); // (80 + 90) / 2
  });

  it('should reset metrics', async () => {
    const evaluator = new Evaluator();
    vi.spyOn(evaluator, 'evaluate').mockResolvedValue(createMockEvaluation(80));

    const testLoop = createEvaluatorLoopWithComponents(
      evaluator,
      new Optimizer()
    );
    testLoop.start();

    await testLoop.processResponse(createMockResponse());

    testLoop.resetMetrics();

    const metrics = testLoop.getMetrics();
    expect(metrics.totalEvaluated).toBe(0);
    expect(metrics.averageScore).toBe(0);
  });
});

// =============================================================================
// DEFAULT_LOOP_CONFIG Tests
// =============================================================================

describe('DEFAULT_LOOP_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_LOOP_CONFIG.enabled).toBe(true);
    expect(DEFAULT_LOOP_CONFIG.autoOptimize).toBe(true);
    expect(DEFAULT_LOOP_CONFIG.thresholds.minOverall).toBe(50);
    expect(DEFAULT_LOOP_CONFIG.thresholds.minPerDimension).toBe(40);
    expect(DEFAULT_LOOP_CONFIG.limits.maxRetries).toBe(3);
    expect(DEFAULT_LOOP_CONFIG.limits.maxOptimizationTime).toBe(30000);
    expect(DEFAULT_LOOP_CONFIG.notifications.notifyOnLowScore).toBe(true);
    expect(DEFAULT_LOOP_CONFIG.notifications.lowScoreThreshold).toBe(40);
  });
});
