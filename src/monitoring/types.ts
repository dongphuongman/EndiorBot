/**
 * Monitoring Types
 *
 * Type definitions for health monitoring and metrics.
 *
 * @module monitoring/types
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 5
 */

// ============================================================================
// Health Status
// ============================================================================

/**
 * Overall system health status.
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

// ============================================================================
// Component Health
// ============================================================================

/**
 * Provider health information.
 */
export interface ProviderHealthInfo {
  /** Whether the provider is healthy */
  healthy: boolean;
  /** Latency from last health check (ms) */
  latencyMs?: number;
  /** Rate limit remaining (if tracked) */
  rateLimitRemaining?: number;
  /** Last error message if any */
  lastError?: string;
}

/**
 * Brain layer counts.
 */
export interface BrainLayerCounts {
  events: number;
  patterns: number;
  structures: number;
  mentalModels: number;
}

/**
 * Brain health information.
 */
export interface BrainHealthInfo {
  /** Whether the brain is initialized */
  initialized: boolean;
  /** Layer counts */
  layerCounts: BrainLayerCounts;
  /** Brain version if available */
  version?: string;
}

/**
 * Gateway health information.
 */
export interface GatewayHealthInfo {
  /** Number of active WebSocket connections */
  activeConnections: number;
  /** Number of registered methods */
  methodCount: number;
  /** Messages processed */
  messagesReceived: number;
  /** Messages sent */
  messagesSent: number;
}

/**
 * Memory usage information.
 */
export interface MemoryInfo {
  /** Heap used in bytes */
  heapUsed: number;
  /** Total heap size in bytes */
  heapTotal: number;
  /** Resident set size in bytes */
  rss: number;
  /** External memory in bytes */
  external: number;
}

// ============================================================================
// Health Report
// ============================================================================

/**
 * Complete health report returned by system.health gateway method.
 */
export interface HealthReport {
  /** Overall system status */
  status: HealthStatus;
  /** System uptime in seconds */
  uptime: number;
  /** Timestamp of this report */
  timestamp: string;
  /** Provider health by ID */
  providers: Record<string, ProviderHealthInfo>;
  /** Brain health info */
  brain: BrainHealthInfo;
  /** Gateway health info */
  gateway: GatewayHealthInfo;
  /** Memory usage */
  memory: MemoryInfo;
}

// ============================================================================
// Metrics Collector Options
// ============================================================================

/**
 * Options for metrics collection.
 */
export interface MetricsCollectorOptions {
  /** Whether to run provider health checks (can be slow) */
  checkProviders?: boolean;
  /** Timeout for provider health checks (ms) */
  providerCheckTimeout?: number;
}
