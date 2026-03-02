/**
 * Resilience Module
 *
 * Handles edge cases with retry, timeout, fallback, and circuit breaker patterns.
 *
 * @module resilience
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// Graceful degradation utilities
export {
  // Retry
  withRetry,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  // Timeout
  withTimeout,
  TimeoutError,
  DEFAULT_TIMEOUT_CONFIG,
  type TimeoutConfig,
  // Fallback
  withFallback,
  type FallbackOptions,
  // Circuit breaker
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  // Safe operations
  safeExecute,
  safeJsonParse,
  isRetriableError,
} from "./graceful-degradation.js";
