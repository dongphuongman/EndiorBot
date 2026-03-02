/**
 * Graceful Degradation
 *
 * Handles edge cases with fallback behavior instead of hard failures.
 * Provides retry logic, timeout handling, and fallback strategies.
 *
 * @module resilience/graceful-degradation
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { createLogger, type Logger } from "../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay between retries in ms */
  initialDelayMs: number;
  /** Maximum delay between retries in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to add jitter to delays */
  jitter: boolean;
}

/**
 * Timeout configuration.
 */
export interface TimeoutConfig {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Error message on timeout */
  timeoutMessage?: string;
}

/**
 * Fallback options.
 */
export interface FallbackOptions<T> {
  /** Fallback value if operation fails */
  fallbackValue?: T;
  /** Fallback function if operation fails */
  fallbackFn?: (error: Error) => T | Promise<T>;
  /** Whether to log failures */
  logFailures?: boolean;
  /** Operation name for logging */
  operationName?: string;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  timeoutMs: 30000,
  timeoutMessage: "Operation timed out",
};

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitter,
  } = { ...DEFAULT_RETRY_CONFIG, ...config };

  const logger = createLogger("retry");
  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const actualDelay = jitter
          ? delay * (0.5 + Math.random())
          : delay;

        logger.debug(`Retry attempt ${attempt + 1}/${maxRetries}`, {
          error: lastError.message,
          delayMs: Math.round(actualDelay),
        });

        await sleep(actualDelay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError ?? new Error("Unknown error");
}

// ============================================================================
// Timeout Logic
// ============================================================================

/**
 * Execute a function with timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  config: Partial<TimeoutConfig> = {}
): Promise<T> {
  const { timeoutMs, timeoutMessage } = { ...DEFAULT_TIMEOUT_CONFIG, ...config };

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(timeoutMessage ?? "Operation timed out"));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Timeout error.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

// ============================================================================
// Fallback Logic
// ============================================================================

/**
 * Execute a function with fallback on failure.
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  options: FallbackOptions<T>
): Promise<T> {
  const logger = createLogger("fallback");
  const { fallbackValue, fallbackFn, logFailures = true, operationName = "operation" } = options;

  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (logFailures) {
      logger.warn(`${operationName} failed, using fallback`, {
        error: err.message,
      });
    }

    if (fallbackFn) {
      return await fallbackFn(err);
    }

    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    throw err;
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker state.
 */
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening */
  failureThreshold: number;
  /** Time to wait before attempting recovery (ms) */
  recoveryTimeout: number;
  /** Number of successful calls to close circuit */
  successThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  successThreshold: 2,
};

/**
 * Circuit breaker for protecting against cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: Logger;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this.logger = createLogger(`circuit:${name}`);
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeout) {
        this.state = "HALF_OPEN";
        this.logger.info("Circuit half-open, attempting recovery");
      } else {
        throw new CircuitOpenError(`Circuit ${this.name} is open`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution.
   */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = "CLOSED";
        this.failures = 0;
        this.successes = 0;
        this.logger.info("Circuit closed after recovery");
      }
    } else {
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution.
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.successes = 0;
      this.logger.warn("Circuit reopened after half-open failure");
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.logger.warn("Circuit opened due to failures", {
        failures: this.failures,
        threshold: this.config.failureThreshold,
      });
    }
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Circuit open error.
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// ============================================================================
// Safe Operations
// ============================================================================

/**
 * Safely execute a function that might fail, returning undefined on error.
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  options: { logErrors?: boolean; operationName?: string } = {}
): Promise<T | undefined> {
  const { logErrors = true, operationName = "operation" } = options;

  try {
    return await fn();
  } catch (error) {
    if (logErrors) {
      const logger = createLogger("safe-execute");
      logger.debug(`${operationName} failed safely`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return undefined;
  }
}

/**
 * Safely parse JSON, returning undefined on error.
 */
export function safeJsonParse<T>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * Check if an error is retriable.
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const retriablePatterns = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /ECONNREFUSED/i,
    /network/i,
    /timeout/i,
    /rate limit/i,
    /429/,
    /500/,
    /502/,
    /503/,
    /504/,
  ];

  return retriablePatterns.some((pattern) => pattern.test(error.message));
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
