/**
 * Graceful Degradation Tests
 *
 * @module tests/resilience/graceful-degradation
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withRetry,
  withTimeout,
  withFallback,
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  safeExecute,
  safeJsonParse,
  isRetriableError,
} from "../../src/resilience/graceful-degradation.js";

describe("withRetry", () => {
  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      jitter: false,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw after max retries exceeded", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelayMs: 10, jitter: false })
    ).rejects.toThrow("always fails");

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should apply exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const start = Date.now();
    await withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 50,
      jitter: false,
    });
    const elapsed = Date.now() - start;

    // Should have waited ~50ms (with some tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("withTimeout", () => {
  it("should resolve before timeout", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withTimeout(fn, { timeoutMs: 1000 });

    expect(result).toBe("success");
  });

  it("should reject on timeout", async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );

    await expect(
      withTimeout(fn, { timeoutMs: 50, timeoutMessage: "Too slow" })
    ).rejects.toThrow(TimeoutError);
  });

  it("should use custom timeout message", async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );

    await expect(
      withTimeout(fn, { timeoutMs: 50, timeoutMessage: "Custom timeout" })
    ).rejects.toThrow("Custom timeout");
  });

  it("should propagate errors from function", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Function error"));

    await expect(withTimeout(fn, { timeoutMs: 1000 })).rejects.toThrow(
      "Function error"
    );
  });
});

describe("withFallback", () => {
  it("should return result on success", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withFallback(fn, { fallbackValue: "fallback" });

    expect(result).toBe("success");
  });

  it("should use fallback value on failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const result = await withFallback(fn, {
      fallbackValue: "fallback",
      logFailures: false,
    });

    expect(result).toBe("fallback");
  });

  it("should call fallback function on failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const fallbackFn = vi.fn().mockResolvedValue("from function");

    const result = await withFallback(fn, {
      fallbackFn,
      logFailures: false,
    });

    expect(result).toBe("from function");
    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should throw if no fallback provided", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(withFallback(fn, { logFailures: false })).rejects.toThrow(
      "fail"
    );
  });
});

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", {
      failureThreshold: 3,
      recoveryTimeout: 100,
      successThreshold: 2,
    });
  });

  it("should start in closed state", () => {
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should execute function when closed", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await breaker.execute(fn);

    expect(result).toBe("success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should open after failure threshold", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    // Fail 3 times (threshold)
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }

    expect(breaker.getState()).toBe("OPEN");
  });

  it("should reject immediately when open", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }

    // Now should throw CircuitOpenError
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
  });

  it("should transition to half-open after recovery timeout", async () => {
    const failFn = vi.fn().mockRejectedValue(new Error("fail"));
    const successFn = vi.fn().mockResolvedValue("success");

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 110));

    // Should be half-open now
    const result = await breaker.execute(successFn);
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("HALF_OPEN");
  });

  it("should close after success threshold in half-open", async () => {
    const failFn = vi.fn().mockRejectedValue(new Error("fail"));
    const successFn = vi.fn().mockResolvedValue("success");

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow();
    }

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 110));

    // 2 successes in half-open should close
    await breaker.execute(successFn);
    expect(breaker.getState()).toBe("HALF_OPEN");

    await breaker.execute(successFn);
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should reopen on failure in half-open", async () => {
    const failFn = vi.fn().mockRejectedValue(new Error("fail"));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow();
    }

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 110));

    // Fail in half-open should reopen
    await expect(breaker.execute(failFn)).rejects.toThrow();
    expect(breaker.getState()).toBe("OPEN");
  });

  it("should reset to closed state", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("OPEN");

    // Reset
    breaker.reset();
    expect(breaker.getState()).toBe("CLOSED");
  });
});

describe("safeExecute", () => {
  it("should return result on success", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await safeExecute(fn, { logErrors: false });

    expect(result).toBe("success");
  });

  it("should return undefined on failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const result = await safeExecute(fn, { logErrors: false });

    expect(result).toBeUndefined();
  });
});

describe("safeJsonParse", () => {
  it("should parse valid JSON", () => {
    const result = safeJsonParse<{ key: string }>('{"key": "value"}');

    expect(result).toEqual({ key: "value" });
  });

  it("should return undefined for invalid JSON", () => {
    const result = safeJsonParse("not json");

    expect(result).toBeUndefined();
  });

  it("should return undefined for empty string", () => {
    const result = safeJsonParse("");

    expect(result).toBeUndefined();
  });
});

describe("isRetriableError", () => {
  it("should identify network errors", () => {
    expect(isRetriableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetriableError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isRetriableError(new Error("network error"))).toBe(true);
  });

  it("should identify timeout errors", () => {
    expect(isRetriableError(new Error("Request timeout"))).toBe(true);
    expect(isRetriableError(new Error("timeout reached"))).toBe(true);
  });

  it("should identify rate limit errors", () => {
    expect(isRetriableError(new Error("Rate limit exceeded"))).toBe(true);
    expect(isRetriableError(new Error("429 Too Many Requests"))).toBe(true);
  });

  it("should identify server errors", () => {
    expect(isRetriableError(new Error("500 Internal Server Error"))).toBe(true);
    expect(isRetriableError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetriableError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("should not identify client errors", () => {
    expect(isRetriableError(new Error("400 Bad Request"))).toBe(false);
    expect(isRetriableError(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetriableError(new Error("404 Not Found"))).toBe(false);
  });

  it("should return false for non-Error objects", () => {
    expect(isRetriableError("string error")).toBe(false);
    expect(isRetriableError(null)).toBe(false);
    expect(isRetriableError(undefined)).toBe(false);
  });
});
