/**
 * Performance Timing
 *
 * Utilities for measuring and tracking operation timing.
 * Helps identify performance bottlenecks and verify targets.
 *
 * Performance Targets (Sprint 60):
 * - Context inject: < 1s
 * - Agent invocation start: < 2s
 * - Gate status: < 500ms
 * - Project switch: < 1s
 *
 * @module performance/timing
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { createLogger, type Logger } from "../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Timing result.
 */
export interface TimingResult {
  operation: string;
  durationMs: number;
  startTime: number;
  endTime: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Performance thresholds.
 */
export interface PerformanceThresholds {
  contextInjectMs: number;
  agentStartMs: number;
  gateStatusMs: number;
  projectSwitchMs: number;
}

// ============================================================================
// Default Thresholds
// ============================================================================

export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  contextInjectMs: 1000,   // < 1 second
  agentStartMs: 2000,      // < 2 seconds
  gateStatusMs: 500,       // < 500ms
  projectSwitchMs: 1000,   // < 1 second
};

// ============================================================================
// Timer Class
// ============================================================================

/**
 * High-precision timer for operation timing.
 */
export class Timer {
  private startTime: number = 0;
  private endTime: number = 0;
  private readonly operation: string;
  private readonly logger: Logger;

  constructor(operation: string) {
    this.operation = operation;
    this.logger = createLogger("timer");
  }

  /**
   * Start the timer.
   */
  start(): this {
    this.startTime = performance.now();
    return this;
  }

  /**
   * Stop the timer and return duration.
   */
  stop(): number {
    this.endTime = performance.now();
    return this.getDuration();
  }

  /**
   * Get current duration (even if not stopped).
   */
  getDuration(): number {
    const end = this.endTime || performance.now();
    return Math.round(end - this.startTime);
  }

  /**
   * Get timing result.
   */
  getResult(success = true, metadata?: Record<string, unknown>): TimingResult {
    const result: TimingResult = {
      operation: this.operation,
      durationMs: this.getDuration(),
      startTime: this.startTime,
      endTime: this.endTime || performance.now(),
      success,
    };
    if (metadata) {
      result.metadata = metadata;
    }
    return result;
  }

  /**
   * Log timing result.
   */
  log(threshold?: number): void {
    const duration = this.getDuration();
    const status = threshold && duration > threshold ? "⚠️ SLOW" : "✅";

    this.logger.info(`${status} ${this.operation}: ${duration}ms`, {
      operation: this.operation,
      durationMs: duration,
      threshold,
    });
  }
}

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Time an async operation.
 */
export async function timeAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  threshold?: number
): Promise<{ result: T; timing: TimingResult }> {
  const timer = new Timer(operation).start();

  try {
    const result = await fn();
    timer.stop();

    const timing = timer.getResult(true);

    if (threshold && timing.durationMs > threshold) {
      const logger = createLogger("timing");
      logger.warn(`Slow operation: ${operation}`, {
        durationMs: timing.durationMs,
        threshold,
      });
    }

    return { result, timing };
  } catch (error) {
    timer.stop();
    throw error;
  }
}

/**
 * Time a sync operation.
 */
export function timeSync<T>(
  operation: string,
  fn: () => T,
  threshold?: number
): { result: T; timing: TimingResult } {
  const timer = new Timer(operation).start();

  try {
    const result = fn();
    timer.stop();

    const timing = timer.getResult(true);

    if (threshold && timing.durationMs > threshold) {
      const logger = createLogger("timing");
      logger.warn(`Slow operation: ${operation}`, {
        durationMs: timing.durationMs,
        threshold,
      });
    }

    return { result, timing };
  } catch (error) {
    timer.stop();
    throw error;
  }
}

/**
 * Create a timed wrapper for a function.
 */
export function withTiming<TArgs extends unknown[], TResult>(
  operation: string,
  fn: (...args: TArgs) => Promise<TResult>,
  threshold?: number
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const { result } = await timeAsync(operation, () => fn(...args), threshold);
    return result;
  };
}

// ============================================================================
// Performance Monitor
// ============================================================================

/**
 * Track and report performance metrics.
 */
export class PerformanceMonitor {
  private readonly timings: TimingResult[] = [];
  private readonly maxHistory = 1000;
  private readonly thresholds: PerformanceThresholds;

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Record a timing result.
   */
  record(timing: TimingResult): void {
    this.timings.push(timing);

    // Trim history
    if (this.timings.length > this.maxHistory) {
      this.timings.shift();
    }
  }

  /**
   * Get average duration for an operation.
   */
  getAverage(operation: string): number {
    const ops = this.timings.filter((t) => t.operation === operation);
    if (ops.length === 0) return 0;
    return ops.reduce((sum, t) => sum + t.durationMs, 0) / ops.length;
  }

  /**
   * Get P95 duration for an operation.
   */
  getP95(operation: string): number {
    const ops = this.timings
      .filter((t) => t.operation === operation)
      .map((t) => t.durationMs)
      .sort((a, b) => a - b);

    if (ops.length === 0) return 0;

    const index = Math.floor(ops.length * 0.95);
    return ops[index] ?? ops[ops.length - 1] ?? 0;
  }

  /**
   * Check if operations meet performance targets.
   */
  checkTargets(): { passed: boolean; results: Record<string, { avg: number; target: number; passed: boolean }> } {
    const results: Record<string, { avg: number; target: number; passed: boolean }> = {};
    let allPassed = true;

    const checks = [
      { op: "context-inject", target: this.thresholds.contextInjectMs },
      { op: "agent-start", target: this.thresholds.agentStartMs },
      { op: "gate-status", target: this.thresholds.gateStatusMs },
      { op: "project-switch", target: this.thresholds.projectSwitchMs },
    ];

    for (const { op, target } of checks) {
      const avg = this.getAverage(op);
      const passed = avg <= target || avg === 0;
      results[op] = { avg: Math.round(avg), target, passed };
      if (!passed) allPassed = false;
    }

    return { passed: allPassed, results };
  }

  /**
   * Format performance report.
   */
  formatReport(): string {
    const { passed, results } = this.checkTargets();

    const lines = [
      `⚡ Performance Report`,
      "",
      `Overall: ${passed ? "✅ All targets met" : "⚠️ Some targets missed"}`,
      "",
      "Operation                Avg (ms)    Target    Status",
      "─".repeat(55),
    ];

    for (const [op, { avg, target, passed: p }] of Object.entries(results)) {
      const status = p ? "✅" : "⚠️";
      lines.push(
        `${op.padEnd(24)} ${String(avg).padStart(8)}    ${String(target).padStart(6)}    ${status}`
      );
    }

    return lines.join("\n");
  }

  /**
   * Clear timing history.
   */
  clear(): void {
    this.timings.length = 0;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let monitor: PerformanceMonitor | undefined;

/**
 * Get the performance monitor singleton.
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitor) {
    monitor = new PerformanceMonitor();
  }
  return monitor;
}

/**
 * Reset the singleton (for testing).
 */
export function resetPerformanceMonitor(): void {
  monitor = undefined;
}
