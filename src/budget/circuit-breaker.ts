/**
 * Circuit Breaker Implementation
 *
 * Budget protection mechanism with state machine:
 * closed → open → half_open → closed
 *
 * Based on ADR-007 Autonomous Execution Budget specification.
 * Implements CTO guidance for proper state transitions.
 */

import type {
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  CircuitBreakerReason,
  CircuitBreakerResult,
  TaskMetrics,
  BudgetConfig,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default thresholds for budget warnings */
export const DEFAULT_THRESHOLDS = {
  warning: 0.5, // 50% - warn
  critical: 0.8, // 80% - notify + prepare fallback
  limit: 1.0, // 100% - pause/switch to remote Ollama fallback
} as const;

/** Default cool-down period in milliseconds (30 seconds) */
export const DEFAULT_COOLDOWN_MS = 30000;

/** Default max notifications per hour (CPO requirement: 4) */
export const DEFAULT_MAX_NOTIFICATIONS_PER_HOUR = 4;

// ============================================================================
// Notification Rate Limiter
// ============================================================================

/**
 * Notification rate limiter (CPO requirement: max 4/hour).
 *
 * Tracks notifications sent within the last hour and enforces the rate limit.
 */
export class NotificationRateLimiter {
  private notifications: Date[] = [];
  private readonly maxPerHour: number;

  constructor(maxPerHour: number = DEFAULT_MAX_NOTIFICATIONS_PER_HOUR) {
    this.maxPerHour = maxPerHour;
  }

  /**
   * Check if a notification can be sent.
   */
  canSend(): boolean {
    this.pruneExpiredNotifications();
    return this.notifications.length < this.maxPerHour;
  }

  /**
   * Record that a notification was sent.
   */
  recordSent(): void {
    this.notifications.push(new Date());
  }

  /**
   * Get current notification count in the last hour.
   */
  getCount(): number {
    this.pruneExpiredNotifications();
    return this.notifications.length;
  }

  /**
   * Get remaining notifications allowed in the current hour.
   */
  getRemaining(): number {
    this.pruneExpiredNotifications();
    return Math.max(0, this.maxPerHour - this.notifications.length);
  }

  /**
   * Get time until next notification is allowed (in ms).
   * Returns 0 if can send now.
   */
  getTimeUntilNextAllowed(): number {
    if (this.canSend()) {
      return 0;
    }

    // Find oldest notification - when it expires, we can send again
    const oldest = this.notifications[0];
    if (!oldest) {
      return 0;
    }

    const oneHourMs = 60 * 60 * 1000;
    const expiresAt = oldest.getTime() + oneHourMs;
    const now = Date.now();

    return Math.max(0, expiresAt - now);
  }

  /**
   * Reset the rate limiter (e.g., for testing or manual override).
   */
  reset(): void {
    this.notifications = [];
  }

  /**
   * Remove notifications older than 1 hour.
   */
  private pruneExpiredNotifications(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.notifications = this.notifications.filter(
      (time) => time.getTime() > oneHourAgo,
    );
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Threshold level for circuit breaker evaluation.
 */
export type ThresholdLevel = "normal" | "warning" | "critical" | "limit";

/**
 * Circuit breaker action to take.
 */
export type CircuitBreakerAction = "none" | "warn" | "notify" | "pause";

/**
 * Circuit breaker evaluation with threshold info.
 */
export interface ThresholdEvaluation {
  level: ThresholdLevel;
  percentage: number;
  remaining: number;
  action: CircuitBreakerAction;
}

/**
 * Circuit breaker state with timing info.
 */
export interface CircuitBreakerState {
  status: CircuitBreakerStatus;
  openedAt?: Date;
  halfOpenAt?: Date;
  closedAt?: Date;
  lastBreachReason?: CircuitBreakerReason;
  consecutiveSuccesses: number;
  probeRequestAllowed: boolean;
}

/**
 * CircuitBreaker - Budget protection mechanism.
 *
 * State machine:
 * - CLOSED: Normal operation, requests allowed
 * - OPEN: Circuit tripped, requests blocked (except probe after cool-down)
 * - HALF_OPEN: Testing recovery, one probe request allowed
 *
 * Per CTO guidance:
 * - Opens when budget limit breached or task exceeds limits
 * - Enters half_open after cool-down period
 * - Allows one probe request in half_open
 * - If probe succeeds, closes circuit
 * - If probe fails, re-opens circuit
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private cooldownMs: number;
  private notificationRateLimiter: NotificationRateLimiter;

  constructor(
    config: CircuitBreakerConfig,
    cooldownMs: number = DEFAULT_COOLDOWN_MS,
    rateLimiter?: NotificationRateLimiter,
  ) {
    this.config = config;
    this.cooldownMs = cooldownMs;
    this.notificationRateLimiter =
      rateLimiter ?? new NotificationRateLimiter();
    this.state = this.createInitialState();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Evaluate task metrics against circuit breaker limits.
   */
  evaluate(metrics: TaskMetrics): CircuitBreakerResult {
    if (!this.config.enabled) {
      return {
        status: "closed",
        escalate: false,
        metrics,
      };
    }

    // Check each limit type
    const reasons: CircuitBreakerReason[] = [];

    // Check retry count
    if (metrics.retryCount >= this.config.max_retry_per_task) {
      reasons.push("max_retry_exceeded");
    }

    // Check cost per task
    if (metrics.costSoFar >= this.config.max_cost_per_task) {
      reasons.push("max_cost_exceeded");
    }

    // Check duration
    if (metrics.durationMs >= this.config.max_duration_per_task) {
      reasons.push("max_duration_exceeded");
    }

    // If any limit exceeded, open circuit
    const firstReason = reasons[0];
    if (firstReason) {
      const reason = firstReason;
      this.trip(reason);
      return {
        status: "open",
        reason,
        escalate: this.config.escalate_on_breach,
        metrics,
      };
    }

    // Check if we should transition from open to half_open
    this.checkCooldown();

    // Return current state
    return {
      status: this.state.status,
      escalate: false,
      metrics,
    };
  }

  /**
   * Evaluate budget threshold (percentage of limit used).
   */
  evaluateThreshold(current: number, limit: number): ThresholdEvaluation {
    if (limit <= 0) {
      return {
        level: "limit",
        percentage: 100,
        remaining: 0,
        action: "pause",
      };
    }

    const percentage = (current / limit) * 100;
    const remaining = Math.max(0, limit - current);

    // Determine level and action
    if (percentage >= 100) {
      return { level: "limit", percentage, remaining, action: "pause" };
    } else if (percentage >= DEFAULT_THRESHOLDS.critical * 100) {
      return { level: "critical", percentage, remaining, action: "notify" };
    } else if (percentage >= DEFAULT_THRESHOLDS.warning * 100) {
      return { level: "warning", percentage, remaining, action: "warn" };
    } else {
      return { level: "normal", percentage, remaining, action: "none" };
    }
  }

  /**
   * Check if a request can proceed based on circuit state.
   */
  canProceed(): boolean {
    // Check for cooldown transition
    this.checkCooldown();

    switch (this.state.status) {
      case "closed":
        return true;

      case "half_open":
        // Allow one probe request
        if (this.state.probeRequestAllowed) {
          this.state.probeRequestAllowed = false;
          return true;
        }
        return false;

      case "open":
        return false;
    }
  }

  /**
   * Record a successful request (for half_open → closed transition).
   */
  recordSuccess(): void {
    if (this.state.status === "half_open") {
      this.state.consecutiveSuccesses++;
      // Single success in half_open closes the circuit
      this.close();
    }
  }

  /**
   * Record a failed request (for half_open → open transition).
   */
  recordFailure(): void {
    if (this.state.status === "half_open") {
      // Failed probe, re-open circuit
      this.trip(this.state.lastBreachReason ?? "max_retry_exceeded");
    }
  }

  /**
   * Trip the circuit breaker (closed → open).
   */
  trip(reason: CircuitBreakerReason): void {
    this.state.status = "open";
    this.state.openedAt = new Date();
    this.state.lastBreachReason = reason;
    delete this.state.halfOpenAt;
    this.state.probeRequestAllowed = false;
    this.state.consecutiveSuccesses = 0;
  }

  /**
   * Close the circuit breaker (any → closed).
   */
  close(): void {
    this.state.status = "closed";
    this.state.closedAt = new Date();
    delete this.state.openedAt;
    delete this.state.halfOpenAt;
    delete this.state.lastBreachReason;
    this.state.probeRequestAllowed = false;
    this.state.consecutiveSuccesses = 0;
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    this.state = this.createInitialState();
    this.notificationRateLimiter.reset();
  }

  /**
   * Get current circuit breaker state.
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Get current status.
   */
  getStatus(): CircuitBreakerStatus {
    this.checkCooldown();
    return this.state.status;
  }

  /**
   * Check if notification can be sent (rate limit).
   */
  canNotify(): boolean {
    return this.notificationRateLimiter.canSend();
  }

  /**
   * Record notification sent.
   */
  recordNotification(): void {
    this.notificationRateLimiter.recordSent();
  }

  /**
   * Get notification rate limiter.
   */
  getRateLimiter(): NotificationRateLimiter {
    return this.notificationRateLimiter;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create initial circuit breaker state.
   */
  private createInitialState(): CircuitBreakerState {
    return {
      status: "closed",
      consecutiveSuccesses: 0,
      probeRequestAllowed: false,
    };
  }

  /**
   * Check if cooldown period has elapsed and transition to half_open.
   */
  private checkCooldown(): void {
    if (this.state.status !== "open" || !this.state.openedAt) {
      return;
    }

    const now = Date.now();
    const openedAt = this.state.openedAt.getTime();
    const elapsed = now - openedAt;

    if (elapsed >= this.cooldownMs) {
      this.transitionToHalfOpen();
    }
  }

  /**
   * Transition from open to half_open state.
   */
  private transitionToHalfOpen(): void {
    this.state.status = "half_open";
    this.state.halfOpenAt = new Date();
    this.state.probeRequestAllowed = true;
    this.state.consecutiveSuccesses = 0;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create circuit breakers for budget configuration.
 */
export function createCircuitBreakers(
  config: BudgetConfig,
): Map<string, CircuitBreaker> {
  const breakers = new Map<string, CircuitBreaker>();

  // Create a shared rate limiter for all breakers
  const sharedRateLimiter = new NotificationRateLimiter(
    config.notification.rate_limit,
  );

  // Session circuit breaker
  breakers.set(
    "session",
    new CircuitBreaker(config.circuit_breakers, DEFAULT_COOLDOWN_MS, sharedRateLimiter),
  );

  // Daily circuit breaker
  breakers.set(
    "daily",
    new CircuitBreaker(config.circuit_breakers, DEFAULT_COOLDOWN_MS, sharedRateLimiter),
  );

  // Per-task circuit breaker
  breakers.set(
    "task",
    new CircuitBreaker(config.circuit_breakers, DEFAULT_COOLDOWN_MS, sharedRateLimiter),
  );

  return breakers;
}

/**
 * Create a single circuit breaker with default config.
 */
export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>,
  cooldownMs?: number,
): CircuitBreaker {
  const fullConfig: CircuitBreakerConfig = {
    enabled: true,
    max_retry_per_task: 3,
    max_cost_per_task: 0.5,
    max_duration_per_task: 300000, // 5 minutes
    escalate_on_breach: true,
    ...config,
  };

  return new CircuitBreaker(fullConfig, cooldownMs);
}
