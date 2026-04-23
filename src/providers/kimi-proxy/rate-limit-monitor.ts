/**
 * Kimi Proxy Rate-Limit Monitor — Sprint 141 P0-3
 *
 * Tracks 429 responses from the Kimi proxy, records fallback frequency
 * and latency. Exposes metrics for `endiorbot cost report --provider kimi`.
 *
 * Decision gate (Sprint 141 mid-point):
 *   If proxy 429 rate > 30% → promote kimi-api to co-primary
 *   If proxy 429 rate < 10% → keep current order, monitor only
 *
 * @module providers/kimi-proxy/rate-limit-monitor
 * @sprint 141
 */

import { createLogger } from "../../logging/logger.js";

const log = createLogger("kimi-rate-limit-monitor");

// ============================================================================
// Types
// ============================================================================

export interface RateLimitStats {
  /** Total calls routed through kimi-proxy */
  totalCalls: number;
  /** Calls that received 429 (rate limited) */
  rateLimitedCalls: number;
  /** 429 rate as percentage */
  rateLimitRate: number;
  /** Total calls that fell back to kimi-api */
  fallbackToApiCalls: number;
  /** Total calls that fell back to claude-code */
  fallbackToClaudeCalls: number;
  /** Average latency when proxy responds successfully (ms) */
  avgSuccessLatencyMs: number;
  /** Average latency for fallback path (ms) */
  avgFallbackLatencyMs: number;
  /** Monitor start time */
  startedAt: number;
  /** Time window covered (ms) */
  windowMs: number;
}

// ============================================================================
// In-memory monitor (singleton for the process lifetime)
// ============================================================================

let totalCalls = 0;
let rateLimitedCalls = 0;
let fallbackToApi = 0;
let fallbackToClaude = 0;
let successLatencySum = 0;
let successCount = 0;
let fallbackLatencySum = 0;
let fallbackCount = 0;
const startedAt = Date.now();

/**
 * Record a successful kimi-proxy call.
 */
export function recordProxySuccess(latencyMs: number): void {
  totalCalls++;
  successCount++;
  successLatencySum += latencyMs;
}

/**
 * Record a kimi-proxy 429 rate-limit hit.
 */
export function recordProxyRateLimit(): void {
  totalCalls++;
  rateLimitedCalls++;
  log.warn("Kimi proxy rate-limited (429)", {
    totalCalls,
    rateLimitedCalls,
    rate: totalCalls > 0 ? `${((rateLimitedCalls / totalCalls) * 100).toFixed(1)}%` : "N/A",
  });
}

/**
 * Record a fallback from kimi-proxy to kimi-api.
 */
export function recordFallbackToApi(latencyMs: number): void {
  fallbackToApi++;
  fallbackCount++;
  fallbackLatencySum += latencyMs;
}

/**
 * Record a fallback from kimi to claude-code.
 */
export function recordFallbackToClaude(latencyMs: number): void {
  fallbackToClaude++;
  fallbackCount++;
  fallbackLatencySum += latencyMs;
}

/**
 * Get current rate-limit statistics.
 */
export function getRateLimitStats(): RateLimitStats {
  return {
    totalCalls,
    rateLimitedCalls,
    rateLimitRate: totalCalls > 0 ? (rateLimitedCalls / totalCalls) * 100 : 0,
    fallbackToApiCalls: fallbackToApi,
    fallbackToClaudeCalls: fallbackToClaude,
    avgSuccessLatencyMs: successCount > 0 ? Math.round(successLatencySum / successCount) : 0,
    avgFallbackLatencyMs: fallbackCount > 0 ? Math.round(fallbackLatencySum / fallbackCount) : 0,
    startedAt,
    windowMs: Date.now() - startedAt,
  };
}

/**
 * Check the mid-sprint decision gate.
 *
 * @returns "promote" if 429 rate > 30%, "monitor" if < 10%, "review" otherwise
 */
export function checkDecisionGate(): "promote" | "monitor" | "review" {
  const stats = getRateLimitStats();
  if (stats.totalCalls < 10) return "monitor"; // not enough data
  if (stats.rateLimitRate > 30) return "promote";
  if (stats.rateLimitRate < 10) return "monitor";
  return "review";
}

/**
 * Reset counters (for testing).
 */
export function resetRateLimitMonitor(): void {
  totalCalls = 0;
  rateLimitedCalls = 0;
  fallbackToApi = 0;
  fallbackToClaude = 0;
  successLatencySum = 0;
  successCount = 0;
  fallbackLatencySum = 0;
  fallbackCount = 0;
}
