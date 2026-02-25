/**
 * Gateway Optimizer Methods
 *
 * JSON-RPC methods for optimizer loop status and control.
 *
 * @module gateway/methods/optimizer
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 48 Day 8
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";
import {
  createEvaluatorLoop,
  type LoopState,
} from "../../evaluator/loop.js";
import { clearFeedback } from "../../evaluator/brain-bridge.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Optimizer status information.
 */
export interface OptimizerStatus {
  state: LoopState;
  autoOptimize: boolean;
  thresholds: {
    minOverall: number;
    minPerDimension: number;
  };
  limits: {
    maxRetries: number;
    maxOptimizationTime: number;
  };
  startedAt?: string;
  pausedAt?: string;
}

/**
 * Optimizer metrics summary.
 */
export interface OptimizerMetrics {
  totalEvaluated: number;
  totalOptimized: number;
  totalFailed: number;
  totalSkipped: number;
  averageScore: number;
  averageOptimizationTime: number;
  optimizationSuccessRate: number;
  dimensionAverages: Record<string, number>;
}

/**
 * Result of optimizer.status method.
 */
export interface OptimizerStatusResult {
  status: OptimizerStatus;
  metrics: OptimizerMetrics;
  config: {
    enabled: boolean;
    autoOptimize: boolean;
    passThreshold: number;
  };
}

/**
 * Result of optimizer.reset method.
 */
export interface OptimizerResetResult {
  success: boolean;
  metricsCleared: boolean;
  feedbackCleared: boolean;
  previousMetrics: OptimizerMetrics;
}

// ============================================================================
// Module State
// ============================================================================

// Single shared loop instance for the gateway
const loop = createEvaluatorLoop();

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get optimizer loop status and metrics.
 */
function handleOptimizerStatus(
  _params: unknown,
  _client: ClientInfo
): OptimizerStatusResult {
  const loopStatus = loop.getStatus();
  const loopMetrics = loop.getMetrics();
  const loopConfig = loop.getConfig();

  const status: OptimizerStatus = {
    state: loopStatus.state,
    autoOptimize: loopStatus.autoOptimize,
    thresholds: loopStatus.thresholds,
    limits: loopStatus.limits,
  };

  if (loopStatus.startedAt) {
    status.startedAt = loopStatus.startedAt;
  }
  if (loopStatus.pausedAt) {
    status.pausedAt = loopStatus.pausedAt;
  }

  return {
    status,
    metrics: loopMetrics,
    config: {
      enabled: loopConfig.enabled,
      autoOptimize: loopConfig.autoOptimize,
      passThreshold: loopConfig.thresholds.minOverall,
    },
  };
}

/**
 * Reset optimizer metrics and optionally feedback history.
 */
function handleOptimizerReset(
  params: unknown,
  _client: ClientInfo
): OptimizerResetResult {
  const { clearHistory = false } = (params ?? {}) as { clearHistory?: boolean };

  // Capture previous metrics
  const previousMetrics = loop.getMetrics();

  // Reset loop metrics
  loop.resetMetrics();

  // Optionally clear feedback history
  if (clearHistory) {
    clearFeedback();
  }

  return {
    success: true,
    metricsCleared: true,
    feedbackCleared: clearHistory,
    previousMetrics,
  };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register optimizer methods with the gateway server.
 */
export function registerOptimizerMethods(server: GatewayServer): void {
  server.registerMethod("optimizer.status", handleOptimizerStatus);
  server.registerMethod("optimizer.reset", handleOptimizerReset);
}

// ============================================================================
// Internal API
// ============================================================================

/**
 * Get the shared loop instance (for internal use).
 */
export function getLoop() {
  return loop;
}

/**
 * Start the optimizer loop.
 */
export function startLoop(): void {
  loop.start();
}

/**
 * Stop the optimizer loop.
 */
export function stopLoop(): void {
  loop.stop();
}

/**
 * Pause the optimizer loop.
 */
export function pauseLoop(): void {
  loop.pause();
}

/**
 * Resume the optimizer loop.
 */
export function resumeLoop(): void {
  loop.resume();
}
