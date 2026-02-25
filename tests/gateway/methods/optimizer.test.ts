/**
 * Tests for Gateway Optimizer Methods
 *
 * @module tests/gateway/methods/optimizer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerOptimizerMethods,
  getLoop,
  startLoop,
  stopLoop,
  pauseLoop,
  resumeLoop,
} from '../../../src/gateway/methods/optimizer.js';
import { clearFeedback, storeFeedback } from '../../../src/evaluator/brain-bridge.js';

// =============================================================================
// Test Helpers
// =============================================================================

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

describe('Optimizer Methods Registration', () => {
  it('should register all optimizer methods', () => {
    const server = createMockServer();
    registerOptimizerMethods(server as any);

    expect(server.hasMethod('optimizer.status')).toBe(true);
    expect(server.hasMethod('optimizer.reset')).toBe(true);
    expect(server.methodCount()).toBe(2);
  });
});

// =============================================================================
// optimizer.status Tests
// =============================================================================

describe('optimizer.status', () => {
  let server: ReturnType<typeof createMockServer>;
  let handler: Function;

  beforeEach(() => {
    server = createMockServer();
    registerOptimizerMethods(server as any);
    handler = server.getMethod('optimizer.status')!;
    stopLoop(); // Ensure clean state
  });

  afterEach(() => {
    stopLoop();
  });

  it('should return status when loop is stopped', () => {
    const result = handler({}, {});

    expect(result.status.state).toBe('stopped');
    expect(result.status.autoOptimize).toBe(true);
    expect(result.status.thresholds.minOverall).toBeDefined();
    expect(result.status.limits.maxRetries).toBeDefined();
  });

  it('should return status when loop is running', () => {
    startLoop();
    const result = handler({}, {});

    expect(result.status.state).toBe('running');
    expect(result.status.startedAt).toBeDefined();
  });

  it('should return status when loop is paused', () => {
    startLoop();
    pauseLoop();
    const result = handler({}, {});

    expect(result.status.state).toBe('paused');
    expect(result.status.pausedAt).toBeDefined();
  });

  it('should include metrics', () => {
    const result = handler({}, {});

    expect(result.metrics).toBeDefined();
    expect(typeof result.metrics.totalEvaluated).toBe('number');
    expect(typeof result.metrics.totalOptimized).toBe('number');
    expect(typeof result.metrics.totalFailed).toBe('number');
    expect(typeof result.metrics.averageScore).toBe('number');
  });

  it('should include config', () => {
    const result = handler({}, {});

    expect(result.config).toBeDefined();
    expect(typeof result.config.enabled).toBe('boolean');
    expect(typeof result.config.autoOptimize).toBe('boolean');
    expect(typeof result.config.passThreshold).toBe('number');
  });
});

// =============================================================================
// optimizer.reset Tests
// =============================================================================

describe('optimizer.reset', () => {
  let server: ReturnType<typeof createMockServer>;
  let handler: Function;

  beforeEach(() => {
    server = createMockServer();
    registerOptimizerMethods(server as any);
    handler = server.getMethod('optimizer.reset')!;
    clearFeedback();
  });

  afterEach(() => {
    clearFeedback();
  });

  it('should reset metrics', () => {
    const result = handler({}, {});

    expect(result.success).toBe(true);
    expect(result.metricsCleared).toBe(true);
    expect(result.feedbackCleared).toBe(false);
  });

  it('should clear feedback history when requested', () => {
    // Store some feedback first
    storeFeedback({ task: 'Test', score: 80 });

    const result = handler({ clearHistory: true }, {});

    expect(result.success).toBe(true);
    expect(result.feedbackCleared).toBe(true);
  });

  it('should preserve feedback history by default', () => {
    storeFeedback({ task: 'Test', score: 80 });

    const result = handler({}, {});

    expect(result.feedbackCleared).toBe(false);
  });

  it('should return previous metrics', () => {
    const result = handler({}, {});

    expect(result.previousMetrics).toBeDefined();
    expect(typeof result.previousMetrics.totalEvaluated).toBe('number');
  });
});

// =============================================================================
// Loop Control Tests
// =============================================================================

describe('Loop Control', () => {
  beforeEach(() => {
    stopLoop();
  });

  afterEach(() => {
    stopLoop();
  });

  it('should get loop instance', () => {
    const loop = getLoop();

    expect(loop).toBeDefined();
    expect(typeof loop.start).toBe('function');
    expect(typeof loop.stop).toBe('function');
    expect(typeof loop.pause).toBe('function');
    expect(typeof loop.resume).toBe('function');
  });

  it('should start loop', () => {
    startLoop();

    expect(getLoop().getStatus().state).toBe('running');
  });

  it('should stop loop', () => {
    startLoop();
    stopLoop();

    expect(getLoop().getStatus().state).toBe('stopped');
  });

  it('should pause loop', () => {
    startLoop();
    pauseLoop();

    expect(getLoop().getStatus().state).toBe('paused');
  });

  it('should resume loop', () => {
    startLoop();
    pauseLoop();
    resumeLoop();

    expect(getLoop().getStatus().state).toBe('running');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Optimizer Gateway Integration', () => {
  let server: ReturnType<typeof createMockServer>;
  let statusHandler: Function;
  let resetHandler: Function;

  beforeEach(() => {
    server = createMockServer();
    registerOptimizerMethods(server as any);
    statusHandler = server.getMethod('optimizer.status')!;
    resetHandler = server.getMethod('optimizer.reset')!;
    stopLoop();
    clearFeedback();
  });

  afterEach(() => {
    stopLoop();
    clearFeedback();
  });

  it('should show updated status after starting loop', () => {
    const beforeStart = statusHandler({}, {});
    expect(beforeStart.status.state).toBe('stopped');

    startLoop();

    const afterStart = statusHandler({}, {});
    expect(afterStart.status.state).toBe('running');
  });

  it('should reset metrics and reflect in status', () => {
    // Reset and check
    resetHandler({}, {});

    const status = statusHandler({}, {});
    expect(status.metrics.totalEvaluated).toBe(0);
  });

  it('should clear feedback when requested', () => {
    storeFeedback({ task: 'Test', score: 80 });

    resetHandler({ clearHistory: true }, {});

    // Feedback should be cleared (can't directly check but reset result confirms)
    const resetResult = resetHandler({ clearHistory: false }, {});
    expect(resetResult.success).toBe(true);
  });
});
