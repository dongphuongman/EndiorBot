/**
 * Rate Limiter — Shared Module
 *
 * Sprint 116 T7: Extracted from gateway/auth.ts to shared security module.
 * Providers and gateway both import from here (no layer violations).
 *
 * @module security/rate-limiter
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ============================================================================
// RateLimiter
// ============================================================================

/**
 * Simple sliding-window rate limiter.
 */
export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request should be allowed (increments counter).
   */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    let entry = this.limits.get(key);

    // Reset if window expired
    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
      this.limits.set(key, entry);
    }

    const resetIn = Math.max(0, this.windowMs - (now - entry.windowStart));
    const remaining = Math.max(0, this.maxRequests - entry.count);

    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetIn };
    }

    entry.count++;
    return { allowed: true, remaining: remaining - 1, resetIn };
  }

  /**
   * Peek at rate limit status without incrementing counter.
   */
  peek(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.limits.get(key);

    // No entry or window expired = full quota available
    if (!entry || now - entry.windowStart >= this.windowMs) {
      return { allowed: true, remaining: this.maxRequests, resetIn: 0 };
    }

    const resetIn = Math.max(0, this.windowMs - (now - entry.windowStart));
    const remaining = Math.max(0, this.maxRequests - entry.count);

    return {
      allowed: entry.count < this.maxRequests,
      remaining,
      resetIn,
    };
  }

  /**
   * Reset rate limit for key.
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits.
   */
  clear(): void {
    this.limits.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a rate limiter instance.
 */
export function createRateLimiter(windowMs?: number, maxRequests?: number): RateLimiter {
  return new RateLimiter(windowMs, maxRequests);
}
