/**
 * Performance Cache
 *
 * In-memory caching with TTL for frequently accessed data.
 * Improves response times for repeated operations.
 *
 * Features:
 * - TTL-based expiration
 * - LRU eviction when max size reached
 * - Cache statistics tracking
 *
 * @module performance/cache
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import { createLogger, type Logger } from "../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Cache entry with metadata.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccess: number;
}

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Maximum number of entries */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Enable statistics tracking */
  trackStats: boolean;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  trackStats: true,
};

// ============================================================================
// Performance Cache
// ============================================================================

/**
 * Generic cache with TTL and LRU eviction.
 */
export class PerformanceCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly config: CacheConfig;
  private readonly logger: Logger;
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(name: string, config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger(`cache:${name}`);
  }

  /**
   * Get a value from cache.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.trackStats) this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      if (this.config.trackStats) this.stats.misses++;
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccess = Date.now();

    if (this.config.trackStats) this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache.
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Evict if at max size
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.config.defaultTtlMs),
      accessCount: 1,
      lastAccess: Date.now(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists (and is not expired).
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key from cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get or set with factory function.
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
    };
  }

  /**
   * Evict least recently used entry.
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.config.trackStats) this.stats.evictions++;
    }
  }

  /**
   * Remove expired entries.
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.logger.debug(`Pruned ${pruned} expired entries`);
    }

    return pruned;
  }
}

// ============================================================================
// Singleton Caches
// ============================================================================

/** Cache for context injection results */
export const contextCache = new PerformanceCache<string>("context", {
  maxSize: 50,
  defaultTtlMs: 2 * 60 * 1000, // 2 minutes
});

/** Cache for gate evaluation results */
export const gateCache = new PerformanceCache<unknown>("gate", {
  maxSize: 100,
  defaultTtlMs: 30 * 1000, // 30 seconds
});

/** Cache for project verification results */
export const projectCache = new PerformanceCache<unknown>("project", {
  maxSize: 20,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
});

/** Cache for tier configuration */
export const tierConfigCache = new PerformanceCache<unknown>("tier-config", {
  maxSize: 10,
  defaultTtlMs: 10 * 60 * 1000, // 10 minutes
});
