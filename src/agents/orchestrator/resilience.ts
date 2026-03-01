/**
 * Resilience Module
 *
 * Provides retry logic, timeout handling, and circuit breaker
 * patterns for robust agent execution.
 *
 * Patterns:
 *   - Retry with exponential backoff
 *   - Timeout with graceful cancellation
 *   - Circuit breaker for failing services
 *
 * @module agents/orchestrator/resilience
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) */
  jitterFactor: number;
  /** Retryable error checker */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Timeout configuration.
 */
export interface TimeoutConfig {
  /** Timeout in ms */
  timeoutMs: number;
  /** Abort signal to use */
  signal?: AbortSignal;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit */
  successThreshold: number;
  /** Time to wait before half-open in ms */
  resetTimeoutMs: number;
  /** Sliding window size for failure counting */
  windowSize: number;
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  windowSize: 10,
};

/**
 * Circuit breaker state.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Retry result.
 */
export interface RetryResult<T> {
  /** Whether successful */
  success: boolean;
  /** Result value if successful */
  value?: T;
  /** Error if failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total duration in ms */
  durationMs: number;
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Execute with retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const log = createLogger("resilience:retry");

  let lastError: Error | undefined;
  let attempt = 0;
  const startTime = Date.now();

  while (attempt < cfg.maxAttempts) {
    attempt++;

    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts: attempt,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if retryable
      if (cfg.isRetryable && !cfg.isRetryable(lastError)) {
        log.debug("Error not retryable, giving up", { error: lastError.message });
        break;
      }

      if (attempt < cfg.maxAttempts) {
        const delay = calculateDelay(attempt, cfg);
        log.debug("Retry scheduled", { attempt, delay, maxAttempts: cfg.maxAttempts });
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    ...(lastError ? { error: lastError } : {}),
    attempts: attempt,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Cap at max
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter
  const jitter = delay * config.jitterFactor * (Math.random() * 2 - 1);
  delay += jitter;

  return Math.max(0, Math.round(delay));
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Timeout Logic
// ============================================================================

/**
 * Execute with timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  const { timeoutMs, signal } = config;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal if provided
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
        });
      }),
    ]);

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Timeout error class.
 */
export class TimeoutError extends Error {
  readonly isTimeout = true;

  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit Breaker implementation.
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = "CLOSED";
  private failures: number[] = [];
  private successes = 0;
  private lastFailureTime = 0;
  private log: Logger;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.log = createLogger(`circuit-breaker:${name}`);
  }

  /**
   * Execute through circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === "OPEN") {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.log.info("Transitioning to HALF_OPEN");
        this.state = "HALF_OPEN";
      } else {
        throw new CircuitOpenError(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Record success.
   */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.log.info("Transitioning to CLOSED");
        this.state = "CLOSED";
        this.successes = 0;
        this.failures = [];
      }
    } else {
      // Reset consecutive successes
      this.successes = 0;
    }
  }

  /**
   * Record failure.
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    // Add to sliding window
    this.failures.push(now);

    // Remove old failures outside window
    const windowStart = now - (this.config.windowSize * 1000);
    this.failures = this.failures.filter((t) => t >= windowStart);

    // Check threshold
    if (this.failures.length >= this.config.failureThreshold) {
      this.log.warn("Transitioning to OPEN", {
        failures: this.failures.length,
        threshold: this.config.failureThreshold,
      });
      this.state = "OPEN";
    }

    // Reset successes in half-open
    if (this.state === "HALF_OPEN") {
      this.successes = 0;
      this.state = "OPEN";
    }
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.successes = 0;
    this.lastFailureTime = 0;
    this.log.info("Circuit breaker reset");
  }

  /**
   * Force open circuit.
   */
  open(): void {
    this.state = "OPEN";
    this.lastFailureTime = Date.now();
    this.log.info("Circuit breaker forced open");
  }

  /**
   * Get statistics.
   */
  getStats(): {
    state: CircuitState;
    recentFailures: number;
    successStreak: number;
    lastFailure: Date | null;
  } {
    return {
      state: this.state,
      recentFailures: this.failures.length,
      successStreak: this.successes,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
    };
  }
}

/**
 * Circuit open error.
 */
export class CircuitOpenError extends Error {
  readonly isCircuitOpen = true;

  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// ============================================================================
// Combined Resilience
// ============================================================================

/**
 * Resilience configuration combining all patterns.
 */
export interface ResilienceConfig {
  retry?: Partial<RetryConfig>;
  timeout?: TimeoutConfig;
  circuitBreaker?: {
    name: string;
    config?: Partial<CircuitBreakerConfig>;
  };
}

/**
 * Execute with all resilience patterns.
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  config: ResilienceConfig
): Promise<RetryResult<T>> {
  const log = createLogger("resilience");

  // Get or create circuit breaker
  let breaker: CircuitBreaker | undefined;
  if (config.circuitBreaker) {
    breaker = getCircuitBreaker(
      config.circuitBreaker.name,
      config.circuitBreaker.config
    );
  }

  // Wrap with timeout
  const wrappedFn = config.timeout
    ? () => withTimeout(fn, config.timeout!)
    : fn;

  // Wrap with circuit breaker
  const protectedFn = breaker
    ? () => breaker!.execute(wrappedFn)
    : wrappedFn;

  // Execute with retry
  const result = await withRetry(protectedFn, {
    ...config.retry,
    isRetryable: (err) => {
      // Don't retry circuit open errors
      if (err instanceof CircuitOpenError) return false;
      // Don't retry timeout errors by default
      if (err instanceof TimeoutError) return false;
      // Use custom checker if provided
      if (config.retry?.isRetryable) {
        return config.retry.isRetryable(err);
      }
      // Retry by default
      return true;
    },
  });

  if (!result.success) {
    log.warn("Resilient execution failed", {
      attempts: result.attempts,
      durationMs: result.durationMs,
      error: result.error?.message,
    });
  }

  return result;
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create circuit breaker.
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, config);
    circuitBreakers.set(name, breaker);
  }
  return breaker;
}

/**
 * Reset all circuit breakers.
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

/**
 * Get all circuit breaker stats.
 */
export function getAllCircuitBreakerStats(): Record<string, ReturnType<CircuitBreaker["getStats"]>> {
  const stats: Record<string, ReturnType<CircuitBreaker["getStats"]>> = {};
  for (const [name, breaker] of circuitBreakers.entries()) {
    stats[name] = breaker.getStats();
  }
  return stats;
}
