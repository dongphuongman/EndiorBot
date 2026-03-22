/**
 * BusDedup Tests — Sprint 107
 *
 * Tests TTL-based deduplication cache for inbound messages.
 * Uses fake timers to control TTL expiry deterministically.
 *
 * @module tests/bus/dedup
 * @sprint 107
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BusDedup } from "../../src/bus/dedup.js";

// ============================================================================
// Tests
// ============================================================================

describe("BusDedup", () => {
  it("T9: first isDuplicate → false; after markSeen → true", () => {
    const dedup = new BusDedup();
    const key = "telegram-12345";

    expect(dedup.isDuplicate(key)).toBe(false);
    dedup.markSeen(key);
    expect(dedup.isDuplicate(key)).toBe(true);
  });

  it("T10: different keys are independent", () => {
    const dedup = new BusDedup();

    dedup.markSeen("telegram-111");
    expect(dedup.isDuplicate("telegram-111")).toBe(true);
    expect(dedup.isDuplicate("telegram-999")).toBe(false);
  });

  it("T11: expired entry returns false from isDuplicate", () => {
    vi.useFakeTimers();
    try {
      const ttlMs = 1000;
      const dedup = new BusDedup(ttlMs);

      dedup.markSeen("telegram-expired");
      expect(dedup.isDuplicate("telegram-expired")).toBe(true);

      vi.advanceTimersByTime(ttlMs + 1); // TTL expired
      expect(dedup.isDuplicate("telegram-expired")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T12: size returns current cache entry count", () => {
    const dedup = new BusDedup();

    expect(dedup.size).toBe(0);
    dedup.markSeen("k1");
    dedup.markSeen("k2");
    expect(dedup.size).toBe(2);
    dedup.markSeen("k1"); // re-mark same key — still 2 entries
    expect(dedup.size).toBe(2);
  });

  it("T13: LRU eviction — oldest entry removed when maxEntries reached", () => {
    const dedup = new BusDedup(60_000, 3); // max 3 entries

    dedup.markSeen("oldest");
    dedup.markSeen("middle");
    dedup.markSeen("newest");
    expect(dedup.size).toBe(3);

    // Adding a 4th entry evicts "oldest" (first inserted)
    dedup.markSeen("fourth");
    expect(dedup.size).toBe(3);

    expect(dedup.isDuplicate("oldest")).toBe(false); // evicted
    expect(dedup.isDuplicate("middle")).toBe(true);
    expect(dedup.isDuplicate("newest")).toBe(true);
    expect(dedup.isDuplicate("fourth")).toBe(true);
  });

  it("T14: markSeen on existing key updates TTL without growing cache", () => {
    vi.useFakeTimers();
    try {
      const ttlMs = 1000;
      const dedup = new BusDedup(ttlMs, 10);

      dedup.markSeen("key-a");
      vi.advanceTimersByTime(800); // 800ms in — about to expire

      // Re-mark extends TTL
      dedup.markSeen("key-a");
      vi.advanceTimersByTime(800); // another 800ms — if not re-marked, would have expired
      expect(dedup.isDuplicate("key-a")).toBe(true); // still valid (TTL reset)
    } finally {
      vi.useRealTimers();
    }
  });

  it("T15: evictExpired removes multiple expired entries on next isDuplicate call", () => {
    vi.useFakeTimers();
    try {
      const dedup = new BusDedup(500, 100);

      dedup.markSeen("k1");
      dedup.markSeen("k2");
      dedup.markSeen("k3");
      expect(dedup.size).toBe(3);

      vi.advanceTimersByTime(501); // all 3 expired

      // isDuplicate triggers _evictExpired internally
      expect(dedup.isDuplicate("k1")).toBe(false);
      expect(dedup.size).toBe(0); // all evicted
    } finally {
      vi.useRealTimers();
    }
  });

  it("T16: default constructor values (20min TTL, 1000 max)", () => {
    const dedup = new BusDedup();
    expect(dedup.ttlMs).toBe(20 * 60 * 1000);
    expect(dedup.maxEntries).toBe(1000);
  });

  it("T17: isDuplicate returns false for unknown key without side effects", () => {
    const dedup = new BusDedup();

    const result = dedup.isDuplicate("never-seen");
    expect(result).toBe(false);
    expect(dedup.size).toBe(0); // isDuplicate alone does NOT mark as seen
  });
});
