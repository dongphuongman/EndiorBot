/**
 * Rate Limiter Tests
 *
 * Tests for sliding-window rate limiting behaviour.
 *
 * @module tests/security/rate-limiter
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  RateLimiter,
  createRateLimiter,
} from "../../src/security/rate-limiter.js";

// ============================================================================
// RateLimiter
// ============================================================================

describe("RateLimiter", () => {
  // --------------------------------------------------------------------------
  // Default limits
  // --------------------------------------------------------------------------

  describe("default constructor (100 req / 60s)", () => {
    it("should allow first request", () => {
      const limiter = new RateLimiter();
      const result = limiter.check("user-1");
      expect(result.allowed).toBe(true);
    });

    it("should return remaining = 99 after first request", () => {
      const limiter = new RateLimiter();
      const result = limiter.check("user-1");
      expect(result.remaining).toBe(99);
    });
  });

  // --------------------------------------------------------------------------
  // Under limit: all allowed
  // --------------------------------------------------------------------------

  describe("under limit", () => {
    it("should allow all requests up to maxRequests", () => {
      const limiter = new RateLimiter(60000, 5);

      for (let i = 0; i < 5; i++) {
        const result = limiter.check("key-a");
        expect(result.allowed).toBe(true);
      }
    });

    it("should decrement remaining with each request", () => {
      const limiter = new RateLimiter(60000, 3);
      expect(limiter.check("k").remaining).toBe(2);
      expect(limiter.check("k").remaining).toBe(1);
      expect(limiter.check("k").remaining).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // At limit: N+1 blocked
  // --------------------------------------------------------------------------

  describe("at limit", () => {
    it("should block the N+1 request", () => {
      const limiter = new RateLimiter(60000, 3);

      limiter.check("blocked-key");
      limiter.check("blocked-key");
      limiter.check("blocked-key");

      const fourth = limiter.check("blocked-key");
      expect(fourth.allowed).toBe(false);
      expect(fourth.remaining).toBe(0);
    });

    it("should continue blocking after hitting the limit", () => {
      const limiter = new RateLimiter(60000, 2);
      limiter.check("k");
      limiter.check("k");

      expect(limiter.check("k").allowed).toBe(false);
      expect(limiter.check("k").allowed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Different keys are independent
  // --------------------------------------------------------------------------

  describe("key isolation", () => {
    it("should track different keys independently", () => {
      const limiter = new RateLimiter(60000, 2);

      limiter.check("alice");
      limiter.check("alice");
      // alice is now at limit

      const bobResult = limiter.check("bob");
      expect(bobResult.allowed).toBe(true);
    });

    it("should not share counters between keys", () => {
      const limiter = new RateLimiter(60000, 1);
      const r1 = limiter.check("key-x");
      const r2 = limiter.check("key-y");
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // peek() does not increment counter
  // --------------------------------------------------------------------------

  describe("peek()", () => {
    it("should not increment counter", () => {
      const limiter = new RateLimiter(60000, 3);
      limiter.check("pk");  // count = 1

      limiter.peek("pk");  // should not change count
      limiter.peek("pk");  // should not change count

      // Next check should report count = 1, remaining = 2
      const result = limiter.check("pk");  // count = 2
      expect(result.remaining).toBe(1);
    });

    it("should return full quota for unknown key", () => {
      const limiter = new RateLimiter(60000, 10);
      const result = limiter.peek("unknown-key");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
      expect(result.resetIn).toBe(0);
    });

    it("should report allowed=false when at limit without incrementing", () => {
      const limiter = new RateLimiter(60000, 2);
      limiter.check("pk2");
      limiter.check("pk2");

      const peek = limiter.peek("pk2");
      expect(peek.allowed).toBe(false);
      expect(peek.remaining).toBe(0);

      // And the counter is still exactly 2 (not 3)
      const after = limiter.peek("pk2");
      expect(after.remaining).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // reset() clears specific key
  // --------------------------------------------------------------------------

  describe("reset()", () => {
    it("should clear counter for the specified key", () => {
      const limiter = new RateLimiter(60000, 2);
      limiter.check("r-key");
      limiter.check("r-key");
      // At limit

      limiter.reset("r-key");

      const result = limiter.check("r-key");
      expect(result.allowed).toBe(true);
    });

    it("should not affect other keys", () => {
      const limiter = new RateLimiter(60000, 1);
      limiter.check("a");
      limiter.check("b");

      limiter.reset("a");

      expect(limiter.check("a").allowed).toBe(true);
      expect(limiter.check("b").allowed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // clear() clears all keys
  // --------------------------------------------------------------------------

  describe("clear()", () => {
    it("should clear counters for all keys", () => {
      const limiter = new RateLimiter(60000, 1);
      limiter.check("x");
      limiter.check("y");
      // Both at limit

      limiter.clear();

      expect(limiter.check("x").allowed).toBe(true);
      expect(limiter.check("y").allowed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Window expiration resets count (fake timers)
  // --------------------------------------------------------------------------

  describe("window expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should reset counter after window expires", () => {
      const windowMs = 1000; // 1 second window
      const limiter = new RateLimiter(windowMs, 2);

      limiter.check("w");
      limiter.check("w");
      // At limit
      expect(limiter.check("w").allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 1);

      // Counter should reset
      const result = limiter.check("w");
      expect(result.allowed).toBe(true);
    });

    it("should not reset before window expires", () => {
      const windowMs = 2000;
      const limiter = new RateLimiter(windowMs, 1);

      limiter.check("w2");
      // At limit

      // Only advance halfway
      vi.advanceTimersByTime(windowMs / 2);

      expect(limiter.check("w2").allowed).toBe(false);
    });

    it("should report resetIn > 0 within active window", () => {
      const windowMs = 5000;
      const limiter = new RateLimiter(windowMs, 3);

      limiter.check("time-key");

      vi.advanceTimersByTime(1000);

      const result = limiter.peek("time-key");
      // resetIn should be approximately windowMs - 1000 = 4000
      expect(result.resetIn).toBeGreaterThan(0);
      expect(result.resetIn).toBeLessThanOrEqual(windowMs);
    });
  });

  // --------------------------------------------------------------------------
  // Custom window / max via constructor
  // --------------------------------------------------------------------------

  describe("custom config", () => {
    it("should respect custom maxRequests", () => {
      const limiter = new RateLimiter(60000, 3);
      limiter.check("c");
      limiter.check("c");
      limiter.check("c");
      expect(limiter.check("c").allowed).toBe(false);
    });

    it("should respect custom windowMs", () => {
      vi.useFakeTimers();
      try {
        const limiter = new RateLimiter(500, 1); // 500ms window
        limiter.check("w");
        expect(limiter.check("w").allowed).toBe(false);

        vi.advanceTimersByTime(501);
        expect(limiter.check("w").allowed).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // --------------------------------------------------------------------------
  // createRateLimiter() factory
  // --------------------------------------------------------------------------

  describe("createRateLimiter() factory", () => {
    it("should return a RateLimiter instance", () => {
      const limiter = createRateLimiter();
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it("should accept custom window and max", () => {
      const limiter = createRateLimiter(5000, 10);
      for (let i = 0; i < 10; i++) {
        expect(limiter.check("f").allowed).toBe(true);
      }
      expect(limiter.check("f").allowed).toBe(false);
    });
  });
});
