/**
 * Circuit Breaker Tests
 *
 * Tests for circuit breaker and notification rate limiter.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  CircuitBreaker,
  NotificationRateLimiter,
  createCircuitBreaker,
  createCircuitBreakers,
  DEFAULT_THRESHOLDS,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_MAX_NOTIFICATIONS_PER_HOUR,
  type CircuitBreakerState,
} from "../../src/budget/index.js";
import type {
  CircuitBreakerConfig,
  TaskMetrics,
  BudgetConfig,
} from "../../src/budget/index.js";
import { DEFAULT_BUDGET_CONFIG } from "../../src/budget/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(
  overrides?: Partial<CircuitBreakerConfig>,
): CircuitBreakerConfig {
  return {
    enabled: true,
    max_retry_per_task: 3,
    max_cost_per_task: 0.5,
    max_duration_per_task: 300000, // 5 minutes
    escalate_on_breach: true,
    ...overrides,
  };
}

function createTestMetrics(overrides?: Partial<TaskMetrics>): TaskMetrics {
  return {
    retryCount: 0,
    costSoFar: 0,
    durationMs: 0,
    startTime: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Notification Rate Limiter Tests
// ============================================================================

describe("NotificationRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("canSend", () => {
    it("should allow first notification", () => {
      const limiter = new NotificationRateLimiter();

      expect(limiter.canSend()).toBe(true);
    });

    it("should allow up to max notifications per hour", () => {
      const limiter = new NotificationRateLimiter(4);

      // Send 4 notifications
      for (let i = 0; i < 4; i++) {
        expect(limiter.canSend()).toBe(true);
        limiter.recordSent();
      }

      // 5th should be blocked
      expect(limiter.canSend()).toBe(false);
    });

    it("should block 5th notification in same hour", () => {
      const limiter = new NotificationRateLimiter(4);

      // Send 4 notifications
      for (let i = 0; i < 4; i++) {
        limiter.recordSent();
      }

      // 5th should be blocked
      expect(limiter.canSend()).toBe(false);
    });

    it("should allow notification after 1 hour", () => {
      const limiter = new NotificationRateLimiter(4);

      // Send 4 notifications
      for (let i = 0; i < 4; i++) {
        limiter.recordSent();
      }

      expect(limiter.canSend()).toBe(false);

      // Advance time by 1 hour + 1 second
      vi.advanceTimersByTime(3600001);

      // Should allow again
      expect(limiter.canSend()).toBe(true);
    });

    it("should expire old notifications", () => {
      const limiter = new NotificationRateLimiter(4);

      // Send 2 notifications
      limiter.recordSent();
      limiter.recordSent();

      // Advance 30 minutes
      vi.advanceTimersByTime(30 * 60 * 1000);

      // Send 2 more
      limiter.recordSent();
      limiter.recordSent();

      // Should be at limit (4 in last hour)
      expect(limiter.canSend()).toBe(false);

      // Advance 31 more minutes (first 2 expire)
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Should allow 2 more
      expect(limiter.canSend()).toBe(true);
      expect(limiter.getCount()).toBe(2);
    });
  });

  describe("getCount", () => {
    it("should return 0 initially", () => {
      const limiter = new NotificationRateLimiter();

      expect(limiter.getCount()).toBe(0);
    });

    it("should track notification count", () => {
      const limiter = new NotificationRateLimiter();

      limiter.recordSent();
      expect(limiter.getCount()).toBe(1);

      limiter.recordSent();
      expect(limiter.getCount()).toBe(2);
    });
  });

  describe("getRemaining", () => {
    it("should return max initially", () => {
      const limiter = new NotificationRateLimiter(4);

      expect(limiter.getRemaining()).toBe(4);
    });

    it("should decrease as notifications are sent", () => {
      const limiter = new NotificationRateLimiter(4);

      limiter.recordSent();
      expect(limiter.getRemaining()).toBe(3);

      limiter.recordSent();
      expect(limiter.getRemaining()).toBe(2);
    });

    it("should return 0 when at limit", () => {
      const limiter = new NotificationRateLimiter(2);

      limiter.recordSent();
      limiter.recordSent();

      expect(limiter.getRemaining()).toBe(0);
    });
  });

  describe("getTimeUntilNextAllowed", () => {
    it("should return 0 when can send", () => {
      const limiter = new NotificationRateLimiter(4);

      expect(limiter.getTimeUntilNextAllowed()).toBe(0);
    });

    it("should return time until oldest expires", () => {
      const limiter = new NotificationRateLimiter(2);

      limiter.recordSent();
      limiter.recordSent();

      // Should be close to 1 hour
      const timeUntil = limiter.getTimeUntilNextAllowed();
      expect(timeUntil).toBeGreaterThan(3599000); // ~1 hour
      expect(timeUntil).toBeLessThanOrEqual(3600000);
    });
  });

  describe("reset", () => {
    it("should clear all notifications", () => {
      const limiter = new NotificationRateLimiter(4);

      limiter.recordSent();
      limiter.recordSent();
      limiter.recordSent();
      limiter.recordSent();

      expect(limiter.canSend()).toBe(false);

      limiter.reset();

      expect(limiter.canSend()).toBe(true);
      expect(limiter.getCount()).toBe(0);
    });
  });
});

// ============================================================================
// Circuit Breaker Tests
// ============================================================================

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const breaker = createCircuitBreaker();

      expect(breaker.getStatus()).toBe("closed");
      expect(breaker.canProceed()).toBe(true);
    });

    it("should create with custom config", () => {
      const breaker = createCircuitBreaker({
        max_retry_per_task: 5,
        max_cost_per_task: 1.0,
      });

      expect(breaker.getStatus()).toBe("closed");
    });
  });

  describe("evaluate", () => {
    it("should return closed when metrics are within limits", () => {
      const breaker = createCircuitBreaker();
      const metrics = createTestMetrics({
        retryCount: 1,
        costSoFar: 0.1,
        durationMs: 10000,
      });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("closed");
      expect(result.escalate).toBe(false);
    });

    it("should trip on max_retry_exceeded", () => {
      const breaker = createCircuitBreaker({ max_retry_per_task: 3 });
      const metrics = createTestMetrics({ retryCount: 3 });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("open");
      expect(result.reason).toBe("max_retry_exceeded");
      expect(result.escalate).toBe(true);
    });

    it("should trip on max_cost_exceeded", () => {
      const breaker = createCircuitBreaker({ max_cost_per_task: 0.5 });
      const metrics = createTestMetrics({ costSoFar: 0.5 });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("open");
      expect(result.reason).toBe("max_cost_exceeded");
      expect(result.escalate).toBe(true);
    });

    it("should trip on max_duration_exceeded", () => {
      const breaker = createCircuitBreaker({ max_duration_per_task: 300000 });
      const metrics = createTestMetrics({ durationMs: 300000 });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("open");
      expect(result.reason).toBe("max_duration_exceeded");
      expect(result.escalate).toBe(true);
    });

    it("should not escalate when escalate_on_breach is false", () => {
      const breaker = createCircuitBreaker({ escalate_on_breach: false });
      const metrics = createTestMetrics({ retryCount: 5 });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("open");
      expect(result.escalate).toBe(false);
    });

    it("should not trip when disabled", () => {
      const breaker = createCircuitBreaker({ enabled: false });
      const metrics = createTestMetrics({ retryCount: 100 });

      const result = breaker.evaluate(metrics);

      expect(result.status).toBe("closed");
      expect(result.escalate).toBe(false);
    });
  });

  describe("evaluateThreshold", () => {
    it("should return normal for low percentage", () => {
      const breaker = createCircuitBreaker();

      const result = breaker.evaluateThreshold(1.0, 10.0);

      expect(result.level).toBe("normal");
      expect(result.percentage).toBe(10);
      expect(result.remaining).toBe(9);
      expect(result.action).toBe("none");
    });

    it("should return warning at 50%", () => {
      const breaker = createCircuitBreaker();

      const result = breaker.evaluateThreshold(5.0, 10.0);

      expect(result.level).toBe("warning");
      expect(result.percentage).toBe(50);
      expect(result.action).toBe("warn");
    });

    it("should return critical at 80%", () => {
      const breaker = createCircuitBreaker();

      const result = breaker.evaluateThreshold(8.0, 10.0);

      expect(result.level).toBe("critical");
      expect(result.percentage).toBe(80);
      expect(result.action).toBe("notify");
    });

    it("should return limit at 100%", () => {
      const breaker = createCircuitBreaker();

      const result = breaker.evaluateThreshold(10.0, 10.0);

      expect(result.level).toBe("limit");
      expect(result.percentage).toBe(100);
      expect(result.remaining).toBe(0);
      expect(result.action).toBe("pause");
    });

    it("should handle zero limit", () => {
      const breaker = createCircuitBreaker();

      const result = breaker.evaluateThreshold(5.0, 0);

      expect(result.level).toBe("limit");
      expect(result.percentage).toBe(100);
    });
  });

  describe("state transitions", () => {
    it("should transition from closed to open on trip", () => {
      const breaker = createCircuitBreaker();

      expect(breaker.getStatus()).toBe("closed");

      breaker.trip("max_retry_exceeded");

      expect(breaker.getStatus()).toBe("open");
    });

    it("should transition from open to half_open after cooldown", () => {
      const breaker = createCircuitBreaker({}, 1000); // 1 second cooldown

      breaker.trip("max_retry_exceeded");
      expect(breaker.getStatus()).toBe("open");

      // Advance past cooldown
      vi.advanceTimersByTime(1001);

      expect(breaker.getStatus()).toBe("half_open");
    });

    it("should transition from half_open to closed on success", () => {
      const breaker = createCircuitBreaker({}, 1000);

      breaker.trip("max_retry_exceeded");
      vi.advanceTimersByTime(1001);

      expect(breaker.getStatus()).toBe("half_open");

      breaker.recordSuccess();

      expect(breaker.getStatus()).toBe("closed");
    });

    it("should transition from half_open to open on failure", () => {
      const breaker = createCircuitBreaker({}, 1000);

      breaker.trip("max_retry_exceeded");
      vi.advanceTimersByTime(1001);

      expect(breaker.getStatus()).toBe("half_open");

      breaker.recordFailure();

      expect(breaker.getStatus()).toBe("open");
    });
  });

  describe("canProceed", () => {
    it("should allow when closed", () => {
      const breaker = createCircuitBreaker();

      expect(breaker.canProceed()).toBe(true);
    });

    it("should block when open", () => {
      const breaker = createCircuitBreaker();
      breaker.trip("max_retry_exceeded");

      expect(breaker.canProceed()).toBe(false);
    });

    it("should allow one probe in half_open", () => {
      const breaker = createCircuitBreaker({}, 1000);
      breaker.trip("max_retry_exceeded");
      vi.advanceTimersByTime(1001);

      // First request allowed (probe)
      expect(breaker.canProceed()).toBe(true);

      // Second request blocked (probe used)
      expect(breaker.canProceed()).toBe(false);
    });
  });

  describe("close", () => {
    it("should close from open state", () => {
      const breaker = createCircuitBreaker();
      breaker.trip("max_retry_exceeded");

      expect(breaker.getStatus()).toBe("open");

      breaker.close();

      expect(breaker.getStatus()).toBe("closed");
    });

    it("should clear breach reason", () => {
      const breaker = createCircuitBreaker();
      breaker.trip("max_retry_exceeded");

      const stateBefore = breaker.getState();
      expect(stateBefore.lastBreachReason).toBe("max_retry_exceeded");

      breaker.close();

      const stateAfter = breaker.getState();
      expect(stateAfter.lastBreachReason).toBeUndefined();
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const breaker = createCircuitBreaker();
      breaker.trip("max_cost_exceeded");

      breaker.reset();

      expect(breaker.getStatus()).toBe("closed");
      expect(breaker.canProceed()).toBe(true);
    });

    it("should reset notification rate limiter", () => {
      const breaker = createCircuitBreaker();
      const rateLimiter = breaker.getRateLimiter();

      // Send max notifications
      for (let i = 0; i < 4; i++) {
        rateLimiter.recordSent();
      }
      expect(rateLimiter.canSend()).toBe(false);

      breaker.reset();

      expect(breaker.getRateLimiter().canSend()).toBe(true);
    });
  });

  describe("notification rate limiting", () => {
    it("should respect rate limit", () => {
      const breaker = createCircuitBreaker();

      // Can send initially
      expect(breaker.canNotify()).toBe(true);

      // Send 4 notifications
      for (let i = 0; i < 4; i++) {
        breaker.recordNotification();
      }

      // Should be blocked
      expect(breaker.canNotify()).toBe(false);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createCircuitBreakers", () => {
  it("should create breakers for session, daily, and task", () => {
    const breakers = createCircuitBreakers(DEFAULT_BUDGET_CONFIG);

    expect(breakers.has("session")).toBe(true);
    expect(breakers.has("daily")).toBe(true);
    expect(breakers.has("task")).toBe(true);
    expect(breakers.size).toBe(3);
  });

  it("should use shared rate limiter", () => {
    const breakers = createCircuitBreakers(DEFAULT_BUDGET_CONFIG);

    const session = breakers.get("session")!;
    const daily = breakers.get("daily")!;

    // Send notification on session breaker
    session.recordNotification();
    session.recordNotification();
    session.recordNotification();
    session.recordNotification();

    // Daily breaker should also be at limit (shared rate limiter)
    expect(daily.canNotify()).toBe(false);
  });

  it("should use config notification rate limit", () => {
    const config: BudgetConfig = {
      ...DEFAULT_BUDGET_CONFIG,
      notification: {
        ...DEFAULT_BUDGET_CONFIG.notification,
        rate_limit: 2,
      },
    };

    const breakers = createCircuitBreakers(config);
    const session = breakers.get("session")!;

    // Send 2 notifications
    session.recordNotification();
    session.recordNotification();

    // Should be at limit
    expect(session.canNotify()).toBe(false);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("Constants", () => {
  it("should have correct default thresholds", () => {
    expect(DEFAULT_THRESHOLDS.warning).toBe(0.5);
    expect(DEFAULT_THRESHOLDS.critical).toBe(0.8);
    expect(DEFAULT_THRESHOLDS.limit).toBe(1.0);
  });

  it("should have correct default cooldown", () => {
    expect(DEFAULT_COOLDOWN_MS).toBe(30000); // 30 seconds
  });

  it("should have correct default max notifications", () => {
    expect(DEFAULT_MAX_NOTIFICATIONS_PER_HOUR).toBe(4);
  });
});
