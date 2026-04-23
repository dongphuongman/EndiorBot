/**
 * Sprint 141 P0-3: Kimi Rate-Limit Monitor tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordProxySuccess,
  recordProxyRateLimit,
  recordFallbackToApi,
  recordFallbackToClaude,
  getRateLimitStats,
  checkDecisionGate,
  resetRateLimitMonitor,
} from "../../../src/providers/kimi-proxy/rate-limit-monitor.js";

beforeEach(() => {
  resetRateLimitMonitor();
});

describe("rate-limit monitor — basic counters", () => {
  it("starts with zero counters", () => {
    const stats = getRateLimitStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.rateLimitedCalls).toBe(0);
    expect(stats.rateLimitRate).toBe(0);
    expect(stats.fallbackToApiCalls).toBe(0);
    expect(stats.fallbackToClaudeCalls).toBe(0);
  });

  it("recordProxySuccess increments totalCalls + success latency", () => {
    recordProxySuccess(100);
    recordProxySuccess(200);
    const stats = getRateLimitStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.rateLimitedCalls).toBe(0);
    expect(stats.avgSuccessLatencyMs).toBe(150);
  });

  it("recordProxyRateLimit increments both totalCalls and rateLimitedCalls", () => {
    recordProxyRateLimit();
    recordProxyRateLimit();
    const stats = getRateLimitStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.rateLimitedCalls).toBe(2);
    expect(stats.rateLimitRate).toBe(100);
  });

  it("recordFallbackToApi tracks fallback count + latency", () => {
    recordFallbackToApi(300);
    const stats = getRateLimitStats();
    expect(stats.fallbackToApiCalls).toBe(1);
    expect(stats.avgFallbackLatencyMs).toBe(300);
  });

  it("recordFallbackToClaude tracks fallback count", () => {
    recordFallbackToClaude(500);
    const stats = getRateLimitStats();
    expect(stats.fallbackToClaudeCalls).toBe(1);
    expect(stats.avgFallbackLatencyMs).toBe(500);
  });
});

describe("rate-limit monitor — rateLimitRate calculation", () => {
  it("mixed success + rate-limit gives correct percentage", () => {
    // 7 success + 3 rate-limited = 30%
    for (let i = 0; i < 7; i++) recordProxySuccess(100);
    for (let i = 0; i < 3; i++) recordProxyRateLimit();
    const stats = getRateLimitStats();
    expect(stats.rateLimitRate).toBe(30);
  });
});

describe("checkDecisionGate — mid-sprint decision", () => {
  it("returns 'monitor' when fewer than 10 calls (insufficient data)", () => {
    recordProxySuccess(100);
    expect(checkDecisionGate()).toBe("monitor");
  });

  it("returns 'monitor' when 429 rate < 10%", () => {
    for (let i = 0; i < 19; i++) recordProxySuccess(100);
    recordProxyRateLimit(); // 1/20 = 5%
    expect(checkDecisionGate()).toBe("monitor");
  });

  it("returns 'promote' when 429 rate > 30%", () => {
    for (let i = 0; i < 6; i++) recordProxySuccess(100);
    for (let i = 0; i < 4; i++) recordProxyRateLimit(); // 4/10 = 40%
    expect(checkDecisionGate()).toBe("promote");
  });

  it("returns 'review' when 429 rate between 10-30%", () => {
    for (let i = 0; i < 8; i++) recordProxySuccess(100);
    for (let i = 0; i < 2; i++) recordProxyRateLimit(); // 2/10 = 20%
    expect(checkDecisionGate()).toBe("review");
  });
});

describe("resetRateLimitMonitor", () => {
  it("resets all counters to zero", () => {
    recordProxySuccess(100);
    recordProxyRateLimit();
    recordFallbackToApi(200);
    resetRateLimitMonitor();
    const stats = getRateLimitStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.rateLimitedCalls).toBe(0);
    expect(stats.fallbackToApiCalls).toBe(0);
  });
});
