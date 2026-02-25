/**
 * Metrics Collector
 *
 * Collects health metrics from all system components.
 *
 * @module monitoring/metrics
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 5
 */

import type {
  HealthReport,
  HealthStatus,
  ProviderHealthInfo,
  BrainHealthInfo,
  GatewayHealthInfo,
  MemoryInfo,
  MetricsCollectorOptions,
} from "./types.js";
import { getProviderRegistry } from "../providers/provider-registry.js";
import {
  brainExists,
  readEvents,
  readPatterns,
  readStructures,
  readMentalModels,
  readBrainVersion,
} from "../brain/index.js";
import type { ConnectionStats } from "../gateway/types.js";

// ============================================================================
// Process Start Time
// ============================================================================

const PROCESS_START_TIME = Date.now();

// ============================================================================
// Memory Metrics
// ============================================================================

/**
 * Get current memory usage.
 */
export function getMemoryMetrics(): MemoryInfo {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
  };
}

// ============================================================================
// Provider Metrics
// ============================================================================

/**
 * Get provider health info.
 * If checkHealth is true, performs actual health checks (can be slow).
 */
export async function getProviderMetrics(
  checkHealth: boolean = false,
  timeout: number = 5000
): Promise<Record<string, ProviderHealthInfo>> {
  const registry = getProviderRegistry();
  const providers = registry.list();
  const result: Record<string, ProviderHealthInfo> = {};

  for (const provider of providers) {
    if (checkHealth) {
      try {
        // Use Promise.race for timeout
        const healthPromise = provider.healthCheck();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), timeout)
        );

        const health = await Promise.race([healthPromise, timeoutPromise]);

        const info: ProviderHealthInfo = {
          healthy: health.status === "healthy",
        };
        if (health.latencyMs !== undefined) {
          info.latencyMs = health.latencyMs;
        }
        if (health.status !== "healthy" && health.message) {
          info.lastError = health.message;
        }
        result[provider.id] = info;
      } catch (error) {
        result[provider.id] = {
          healthy: false,
          lastError: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      // Without health check, assume healthy if registered
      result[provider.id] = {
        healthy: true,
      };
    }
  }

  return result;
}

// ============================================================================
// Brain Metrics
// ============================================================================

/**
 * Get brain health info.
 */
export function getBrainMetrics(): BrainHealthInfo {
  const initialized = brainExists();

  if (!initialized) {
    return {
      initialized: false,
      layerCounts: {
        events: 0,
        patterns: 0,
        structures: 0,
        mentalModels: 0,
      },
    };
  }

  try {
    const events = readEvents();
    const patterns = readPatterns();
    const structures = readStructures();
    const mentalModels = readMentalModels();
    const version = readBrainVersion();

    return {
      initialized: true,
      layerCounts: {
        events: events.length,
        patterns: patterns.length,
        structures: structures.length,
        mentalModels: mentalModels.length,
      },
      version: version.version,
    };
  } catch {
    // Brain exists but couldn't read - return initialized but empty
    return {
      initialized: true,
      layerCounts: {
        events: 0,
        patterns: 0,
        structures: 0,
        mentalModels: 0,
      },
    };
  }
}

// ============================================================================
// Gateway Metrics
// ============================================================================

/**
 * Get gateway health info from connection stats.
 */
export function getGatewayMetrics(
  stats: ConnectionStats,
  methodCount: number
): GatewayHealthInfo {
  return {
    activeConnections: stats.activeConnections,
    methodCount,
    messagesReceived: stats.messagesReceived,
    messagesSent: stats.messagesSent,
  };
}

// ============================================================================
// Status Calculation
// ============================================================================

/**
 * Calculate overall health status based on component health.
 */
export function calculateOverallStatus(
  providers: Record<string, ProviderHealthInfo>,
  brain: BrainHealthInfo,
  _gateway: GatewayHealthInfo,
  memory: MemoryInfo
): HealthStatus {
  // Check critical failures
  const providerIds = Object.keys(providers);
  const unhealthyProviders = providerIds.filter((id) => !providers[id]?.healthy);

  // All providers unhealthy = unhealthy
  if (providerIds.length > 0 && unhealthyProviders.length === providerIds.length) {
    return "unhealthy";
  }

  // Check memory pressure (heap > 90% = degraded, > 95% = unhealthy)
  const heapUsage = memory.heapUsed / memory.heapTotal;
  if (heapUsage > 0.95) {
    return "unhealthy";
  }
  if (heapUsage > 0.9) {
    return "degraded";
  }

  // Some providers unhealthy = degraded
  if (unhealthyProviders.length > 0) {
    return "degraded";
  }

  // Brain not initialized with no providers = degraded
  if (!brain.initialized && providerIds.length === 0) {
    return "degraded";
  }

  return "healthy";
}

// ============================================================================
// Health Report
// ============================================================================

/**
 * Collect full health report.
 *
 * @param gatewayStats - Gateway connection stats
 * @param methodCount - Number of registered gateway methods
 * @param options - Collection options
 */
export async function collectHealthReport(
  gatewayStats: ConnectionStats,
  methodCount: number,
  options: MetricsCollectorOptions = {}
): Promise<HealthReport> {
  const { checkProviders = false, providerCheckTimeout = 5000 } = options;

  // Collect metrics from all components
  const [providers, brain, gateway, memory] = await Promise.all([
    getProviderMetrics(checkProviders, providerCheckTimeout),
    Promise.resolve(getBrainMetrics()),
    Promise.resolve(getGatewayMetrics(gatewayStats, methodCount)),
    Promise.resolve(getMemoryMetrics()),
  ]);

  // Calculate overall status
  const status = calculateOverallStatus(providers, brain, gateway, memory);

  // Calculate uptime
  const uptime = Math.floor((Date.now() - PROCESS_START_TIME) / 1000);

  return {
    status,
    uptime,
    timestamp: new Date().toISOString(),
    providers,
    brain,
    gateway,
    memory,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { PROCESS_START_TIME };
