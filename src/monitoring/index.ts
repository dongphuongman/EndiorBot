/**
 * Monitoring Module - Barrel Export
 *
 * Health monitoring and metrics collection for EndiorBot.
 *
 * @module monitoring
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 5
 */

// Types
export type {
  HealthStatus,
  ProviderHealthInfo,
  BrainLayerCounts,
  BrainHealthInfo,
  GatewayHealthInfo,
  MemoryInfo,
  HealthReport,
  MetricsCollectorOptions,
} from "./types.js";

// Metrics collection
export {
  getMemoryMetrics,
  getProviderMetrics,
  getBrainMetrics,
  getGatewayMetrics,
  calculateOverallStatus,
  collectHealthReport,
  PROCESS_START_TIME,
} from "./metrics.js";
