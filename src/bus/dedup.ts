/**
 * Bus Dedup — TTL-based deduplication cache for inbound messages.
 *
 * Sprint 107 (ADR-032 Phase 2):
 * Prevents double-processing of messages from Telegram webhook retries.
 * When the bot is slow to acknowledge, Telegram retries the same message
 * with the same messageId. Without dedup, CEO gets duplicate responses.
 *
 * MTClaw equivalent: internal/bus/dedupe.go
 *
 * Key format: "${channel}-${messageId}" — unique per message.
 * LRU eviction when maxEntries is reached (Map insertion order).
 *
 * @module bus/dedup
 * @version 1.0.0
 * @authority ADR-032
 * @sprint 107
 */

// ============================================================================
// BusDedup
// ============================================================================

/**
 * TTL-based deduplication cache for inbound bus messages.
 *
 * Usage (in BusConsumer._process()):
 *   const dedupKey = msg.metadata?.dedupKey as string | undefined;
 *   if (dedupKey) {
 *     if (dedup.isDuplicate(dedupKey)) return;  // silent skip
 *     dedup.markSeen(dedupKey);
 *   }
 *
 * The OTT adapter sets dedupKey in metadata:
 *   metadata.dedupKey = `telegram-${messageId}`;
 */
export class BusDedup {
  // Map key → expiry timestamp (ms). Insertion order maintained for LRU.
  private readonly cache = new Map<string, number>();

  /**
   * @param ttlMs TTL for cache entries in milliseconds (default: 20 min)
   * @param maxEntries Max cache size before LRU eviction (default: 1000)
   */
  constructor(
    readonly ttlMs = 20 * 60 * 1000,
    readonly maxEntries = 1000,
  ) {}

  /**
   * Check if this key was recently seen (within TTL).
   * Evicts expired entries before checking.
   *
   * @returns true if key is a duplicate (should be skipped)
   */
  isDuplicate(key: string): boolean {
    this._evictExpired();
    return this.cache.has(key);
  }

  /**
   * Mark a key as seen. Applies LRU eviction if at capacity.
   * Evicts expired entries before inserting.
   *
   * @param key The dedup key to record
   */
  markSeen(key: string): void {
    this._evictExpired();

    // LRU eviction: if at capacity, remove oldest entry (first in insertion order)
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, Date.now() + this.ttlMs);
  }

  /** Current number of cached entries */
  get size(): number {
    return this.cache.size;
  }

  // ============================================================================
  // Private
  // ============================================================================

  /** Evict all entries whose TTL has expired. */
  private _evictExpired(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.cache) {
      if (expiresAt <= now) this.cache.delete(key);
    }
  }
}
