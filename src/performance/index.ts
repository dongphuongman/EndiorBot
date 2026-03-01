/**
 * Performance Module
 *
 * Provides caching, timing, and performance monitoring utilities.
 *
 * @module performance
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// Cache
export {
  PerformanceCache,
  contextCache,
  gateCache,
  projectCache,
  tierConfigCache,
  type CacheConfig,
  type CacheStats,
} from "./cache.js";

// Timing
export {
  Timer,
  PerformanceMonitor,
  getPerformanceMonitor,
  resetPerformanceMonitor,
  timeAsync,
  timeSync,
  withTiming,
  DEFAULT_THRESHOLDS,
  type TimingResult,
  type PerformanceThresholds,
} from "./timing.js";
