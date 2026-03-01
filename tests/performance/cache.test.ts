/**
 * Performance Cache Tests
 *
 * @module tests/performance/cache
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PerformanceCache } from "../../src/performance/cache.js";

describe("PerformanceCache", () => {
  let cache: PerformanceCache<string>;

  beforeEach(() => {
    cache = new PerformanceCache<string>("test");
  });

  describe("Basic Operations", () => {
    it("should set and get values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return undefined for missing keys", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("should check if key exists", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });

    it("should delete keys", () => {
      cache.set("key1", "value1");
      expect(cache.delete("key1")).toBe(true);
      expect(cache.has("key1")).toBe(false);
    });

    it("should clear all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(false);
    });
  });

  describe("TTL", () => {
    it("should expire entries after TTL", async () => {
      const shortCache = new PerformanceCache<string>("short", {
        defaultTtlMs: 50,
      });

      shortCache.set("key1", "value1");
      expect(shortCache.get("key1")).toBe("value1");

      await new Promise((r) => setTimeout(r, 60));
      expect(shortCache.get("key1")).toBeUndefined();
    });

    it("should use custom TTL when provided", async () => {
      cache.set("key1", "value1", 50); // 50ms TTL

      expect(cache.get("key1")).toBe("value1");

      await new Promise((r) => setTimeout(r, 60));
      expect(cache.get("key1")).toBeUndefined();
    });
  });

  describe("LRU Eviction", () => {
    it("should evict oldest entry when max size reached", () => {
      const smallCache = new PerformanceCache<string>("small", {
        maxSize: 3,
      });

      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");

      // All three should exist
      expect(smallCache.has("key1")).toBe(true);
      expect(smallCache.has("key2")).toBe(true);
      expect(smallCache.has("key3")).toBe(true);

      // Add key4 - should evict one entry (oldest by lastAccess)
      smallCache.set("key4", "value4");

      // key4 should exist
      expect(smallCache.has("key4")).toBe(true);

      // Should only have 3 entries
      const stats = smallCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
      expect(stats.evictions).toBe(1);
    });
  });

  describe("Statistics", () => {
    it("should track hits and misses", () => {
      cache.set("key1", "value1");

      cache.get("key1"); // Hit
      cache.get("key1"); // Hit
      cache.get("missing"); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it("should track size", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe("getOrSet", () => {
    it("should return cached value if exists", async () => {
      cache.set("key1", "cached");

      const factory = vi.fn().mockResolvedValue("new");
      const result = await cache.getOrSet("key1", factory);

      expect(result).toBe("cached");
      expect(factory).not.toHaveBeenCalled();
    });

    it("should call factory if not cached", async () => {
      const factory = vi.fn().mockResolvedValue("new");
      const result = await cache.getOrSet("key1", factory);

      expect(result).toBe("new");
      expect(factory).toHaveBeenCalled();
      expect(cache.get("key1")).toBe("new");
    });
  });

  describe("Prune", () => {
    it("should remove expired entries", async () => {
      const shortCache = new PerformanceCache<string>("short", {
        defaultTtlMs: 50,
      });

      shortCache.set("key1", "value1");
      shortCache.set("key2", "value2");

      await new Promise((r) => setTimeout(r, 60));

      const pruned = shortCache.prune();
      expect(pruned).toBe(2);
      expect(shortCache.getStats().size).toBe(0);
    });
  });
});
