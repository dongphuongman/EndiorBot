/**
 * Active Memory — Per-Query Context Fetcher (Sprint 133 S1)
 *
 * Injects recent session context before the main agent reply.
 * Pattern: cache-first (≤50ms), local context-fetcher fallback (≤300ms),
 * circuit-breaker on failure (fail-open).
 *
 * Integration point: BusConsumer._process() pre-dispatch hook.
 * Kill switch: ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED env var (CEO-owned).
 *
 * Hard preconditions (abort feature if not met — CEO-locked 2026-04-11):
 *   1. Inject budget ≤ 500 tokens
 *   2. Cache-hit latency ≤ 50ms
 *   3. Cache-miss latency ≤ 300ms (local fetcher, no real model call)
 *   4. Circuit breaker fail-open
 *   5. Kill switch (ACTIVE_MEMORY_ENABLED=false reverts in one turn)
 *   6. Cache TTL default 15s, configurable 1–120s
 *
 * Token estimation: Math.ceil(content.length / 4) — conservative heuristic.
 * Tests assert against this same estimator (internally consistent).
 *
 * @module agents/intelligence/active-memory
 * @version 1.0.0
 * @authority Sprint 133 S1, PRD §3 S1
 * @sprint 133
 */

import { getFormattedRules } from "../../brain/layers/mental-models.js";
import { getFeatureFlagWithEnvOverride } from "../../config/feature-flags.js";
import type { ActiveMemoryPayload } from "../../bus/types.js";

// ============================================================================
// Config
// ============================================================================

/** Default cache TTL in milliseconds (15 seconds, ported from openclaw). */
export const DEFAULT_CACHE_TTL_MS = 15_000;

/** Default context-fetch timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Default maximum tokens to inject into the prompt. */
export const DEFAULT_MAX_INJECT_TOKENS = 500;

/** Default query mode for context fetching. */
export const DEFAULT_QUERY_MODE = "recent" as const;

/** Max turns to include in "recent" mode (per role). */
const RECENT_TURNS_PER_ROLE = 5;

/** Circuit breaker: failures before opening. */
const CB_FAILURE_THRESHOLD = 3;

/** Circuit breaker: cooldown before half-open (ms). */
const CB_HALFOPEN_COOLDOWN_MS = 30_000;

/**
 * Active Memory configuration.
 *
 * All fields optional — defaults apply when not provided.
 */
export interface ActiveMemoryConfig {
  /** Master switch (kill switch). Default: false. */
  enabled: boolean;
  /** Cache TTL in ms. Range: 1000–120000. Default: 15000. */
  cacheTtlMs: number;
  /** Context-fetch timeout in ms. Min: 250. Default: 15000. */
  timeoutMs: number;
  /** Max tokens to inject. Default: 500. */
  maxInjectTokens: number;
  /** Query mode. Default: "recent". */
  queryMode: "message" | "recent" | "full";
}

/**
 * Build a config object with defaults applied.
 * All fields optional — callers can pass partial config.
 */
export function buildActiveMemoryConfig(
  partial?: Partial<ActiveMemoryConfig>,
): ActiveMemoryConfig {
  const cacheTtlMs = partial?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const timeoutMs = partial?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxInjectTokens = partial?.maxInjectTokens ?? DEFAULT_MAX_INJECT_TOKENS;

  return {
    enabled: partial?.enabled ?? false,
    cacheTtlMs: Math.max(1000, Math.min(120_000, cacheTtlMs)),
    timeoutMs: Math.max(250, timeoutMs),
    maxInjectTokens: Math.max(1, maxInjectTokens),
    queryMode: partial?.queryMode ?? DEFAULT_QUERY_MODE,
  };
}

// ============================================================================
// Session turn types (minimal — we read from InboundMessage session history)
// ============================================================================

/** Minimal conversation turn shape for context fetching. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/** Session-like object consumed by the context fetcher. */
export interface SessionLike {
  /** Session ID for cache keying. */
  id: string;
  /** Conversation history. */
  history: ConversationTurn[];
}

// ============================================================================
// Cache layer (2b)
// ============================================================================

interface CacheEntry {
  content: string;
  tokenCount: number;
  timestamp: number;
}

/** Module-level in-memory cache keyed by sessionId. */
const _cache = new Map<string, CacheEntry>();

/**
 * Get a cached entry if it exists and is not stale.
 * Evicts stale entries on read.
 *
 * Cache-hit latency target: ≤ 50ms (trivial for in-memory Map).
 */
export function getFromCache(
  sessionId: string,
  ttlMs: number,
): { hit: true; payload: ActiveMemoryPayload } | { hit: false } {
  const entry = _cache.get(sessionId);
  if (!entry) return { hit: false };

  const age = Date.now() - entry.timestamp;
  if (age > ttlMs) {
    _cache.delete(sessionId);
    return { hit: false };
  }

  return {
    hit: true,
    payload: {
      content: entry.content,
      tokenCount: entry.tokenCount,
      source: "cache",
    },
  };
}

/**
 * Store a fetched result in the cache.
 */
export function setCache(
  sessionId: string,
  content: string,
  tokenCount: number,
): void {
  _cache.set(sessionId, { content, tokenCount, timestamp: Date.now() });
}

/**
 * Clear all cache entries (for tests).
 * @internal
 */
export function clearCache(): void {
  _cache.clear();
}

// ============================================================================
// Token estimation
// ============================================================================

/**
 * Estimate token count from string length.
 * Conservative character-to-token ratio (standard GPT/Claude approximation).
 * Heuristic — ±20% variance acceptable for a budget guard.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to stay within maxTokens budget.
 * Truncates at word boundary where possible.
 */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  // Try to truncate at a word boundary
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace);
  }
  return truncated;
}

// ============================================================================
// Context fetcher (2c)
// ============================================================================

/**
 * Fetch active memory context from session history and optionally Brain L4.
 *
 * Query modes:
 *   "message"  — latest user message only
 *   "recent"   — last N user + assistant turns (default 5 each)
 *   "full"     — entire conversation history, truncated to maxTokens
 *
 * Brain L4 enrichment is additive and optional — fails gracefully if L4 is
 * not loaded (no mental models stored).
 *
 * @param session     Session containing conversation history
 * @param queryMode   How much history to include
 * @param maxTokens   Token budget for injection
 */
export function fetchActiveMemoryContext(
  session: SessionLike,
  queryMode: "message" | "recent" | "full",
  maxTokens: number,
): { content: string; tokenCount: number } {
  const history = session.history;

  let lines: string[] = [];

  if (queryMode === "message") {
    // Latest user message only
    const last = [...history].reverse().find((t) => t.role === "user");
    if (last) {
      lines.push(`[User] ${last.content}`);
    }
  } else if (queryMode === "recent") {
    // Last N turns per role
    const userTurns = history.filter((t) => t.role === "user").slice(-RECENT_TURNS_PER_ROLE);
    const assistantTurns = history.filter((t) => t.role === "assistant").slice(-RECENT_TURNS_PER_ROLE);

    // Interleave in chronological order from the original history
    const recentTurnSet = new Set([...userTurns, ...assistantTurns]);
    const recent = history.filter((t) => recentTurnSet.has(t));

    for (const turn of recent) {
      const prefix = turn.role === "user" ? "[User]" : "[Assistant]";
      lines.push(`${prefix} ${turn.content}`);
    }
  } else {
    // full — entire history
    for (const turn of history) {
      const prefix = turn.role === "user" ? "[User]" : "[Assistant]";
      lines.push(`${prefix} ${turn.content}`);
    }
  }

  let content = lines.join("\n");

  // Optionally enrich with Brain L4 rules (fail gracefully if not available)
  try {
    const rules = getFormattedRules();
    if (rules) {
      const l4Prefix = "[Brain L4]\n";
      const l4Block = `${l4Prefix}${rules}`;
      // Only add if budget allows
      const historyTokens = estimateTokens(content);
      const l4Tokens = estimateTokens(l4Block);
      if (historyTokens + l4Tokens <= maxTokens) {
        content = content ? `${content}\n${l4Block}` : l4Block;
      }
    }
  } catch {
    // Brain L4 unavailable — continue without enrichment
  }

  // Truncate to budget
  content = truncateToTokenBudget(content, maxTokens);
  const tokenCount = estimateTokens(content);

  return { content, tokenCount };
}

// ============================================================================
// Circuit breaker (2d)
// ============================================================================

/** Circuit breaker states. */
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface BreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  openedAt: number | null;
}

/** Module-level circuit breaker state (one breaker per process). */
const _breaker: BreakerStatus = {
  state: "CLOSED",
  failureCount: 0,
  openedAt: null,
};

/**
 * Get current circuit breaker state (for tests / observability).
 */
export function getBreakerState(): CircuitBreakerState {
  return _breaker.state;
}

/**
 * Reset circuit breaker to CLOSED (for tests).
 * @internal
 */
export function resetBreaker(): void {
  _breaker.state = "CLOSED";
  _breaker.failureCount = 0;
  _breaker.openedAt = null;
}

/**
 * Wrap context fetcher with timeout + circuit breaker.
 *
 * CLOSED  → normal operation
 * OPEN    → skip fetch, return fail-open result (after CB_FAILURE_THRESHOLD consecutive failures)
 * HALF_OPEN → allow one attempt after CB_HALFOPEN_COOLDOWN_MS cooldown
 *
 * On timeout or error → fail-open: return { content: "", tokenCount: 0, source: "none" }.
 * Main reply is always delivered regardless of context fetch outcome.
 *
 * @param session     Session with conversation history
 * @param queryMode   Context fetch mode
 * @param maxTokens   Token budget
 * @param timeoutMs   Timeout in ms
 * @param _fetcherOverride  For testing only — inject a failing fetcher to force circuit breaker open
 */
export async function fetchWithCircuitBreaker(
  session: SessionLike,
  queryMode: "message" | "recent" | "full",
  maxTokens: number,
  timeoutMs: number,
  _fetcherOverride?: () => Promise<{ content: string; tokenCount: number }>,
): Promise<ActiveMemoryPayload> {
  // Transition OPEN → HALF_OPEN after cooldown
  if (_breaker.state === "OPEN") {
    const elapsed = _breaker.openedAt ? Date.now() - _breaker.openedAt : Infinity;
    if (elapsed >= CB_HALFOPEN_COOLDOWN_MS) {
      _breaker.state = "HALF_OPEN";
    } else {
      // Still open — fail-open immediately
      return { content: "", tokenCount: 0, source: "none" };
    }
  }

  // Attempt fetch with timeout
  try {
    const fetcher = _fetcherOverride
      ? _fetcherOverride
      : () => Promise.resolve(fetchActiveMemoryContext(session, queryMode, maxTokens));

    const result = await _withTimeout(fetcher, timeoutMs);

    // Success — close breaker
    _breaker.state = "CLOSED";
    _breaker.failureCount = 0;
    _breaker.openedAt = null;

    return {
      content: result.content,
      tokenCount: result.tokenCount,
      source: "sub-agent",
    };
  } catch (err) {
    // Failure — increment counter, possibly open breaker
    _breaker.failureCount++;
    if (_breaker.failureCount >= CB_FAILURE_THRESHOLD) {
      _breaker.state = "OPEN";
      _breaker.openedAt = Date.now();
      console.error(
        `[ActiveMemory] Circuit breaker OPENED after ${_breaker.failureCount} consecutive failures.`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // Fail-open: main reply still delivers without context
    return { content: "", tokenCount: 0, source: "none" };
  }
}

/**
 * Run an async factory with a timeout.
 * Rejects with a timeout error if the factory takes longer than `ms`.
 */
async function _withTimeout<T>(factory: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ActiveMemory fetch timed out after ${ms}ms`));
    }, ms);

    factory().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ============================================================================
// Pre-dispatch hook (2e)
// ============================================================================

/**
 * Pre-dispatch hook for BusConsumer._process().
 *
 * Insert BEFORE ingress.handleInbound() call. If ACTIVE_MEMORY_ENABLED:
 *   1. Try cache first (≤50ms)
 *   2. On miss → fetch via circuit breaker (≤300ms with local fetcher)
 *   3. Cache result on success
 *   4. Inject ActiveMemoryPayload into msg.metadata.activeMemoryContext
 *
 * If disabled: no-op, zero overhead.
 *
 * @param msg     The BusInboundMessage being processed
 * @param session Session object for history retrieval
 * @param config  Active memory config (optional, defaults applied)
 */
export async function applyActiveMemoryHook(
  msg: { metadata?: Record<string, unknown> },
  session: SessionLike,
  config?: Partial<ActiveMemoryConfig>,
): Promise<void> {
  // Kill switch: check env override first (CEO-owned)
  // Sprint 142 P0-3: Log latency data even when FF off — CEO needs data to decide enable.
  const ffEnabled = getFeatureFlagWithEnvOverride("ACTIVE_MEMORY_ENABLED");
  if (!ffEnabled) {
    // Dry-run: measure what latency WOULD be without actually injecting
    const dryStart = Date.now();
    const cacheCheck = getFromCache(session.id, buildActiveMemoryConfig(config).cacheTtlMs);
    const dryLatencyMs = Date.now() - dryStart;
    console.log(`[ActiveMemory] FF-off dry-run: ${cacheCheck.hit ? "cache-hit" : "cache-miss"} latency=${dryLatencyMs}ms session=${session.id}`);
    return;
  }

  const cfg = buildActiveMemoryConfig(config);
  if (!cfg.enabled) return;

  let payload: ActiveMemoryPayload;

  // 1. Cache-first
  const cacheResult = getFromCache(session.id, cfg.cacheTtlMs);
  if (cacheResult.hit) {
    payload = cacheResult.payload;
  } else {
    // 2. Fetch via circuit breaker
    payload = await fetchWithCircuitBreaker(
      session,
      cfg.queryMode,
      cfg.maxInjectTokens,
      cfg.timeoutMs,
    );

    // 3. Cache on success (non-empty result from sub-agent)
    if (payload.source === "sub-agent" && payload.content) {
      setCache(session.id, payload.content, payload.tokenCount);
    }
  }

  // 4. Inject into metadata
  if (msg.metadata === undefined) {
    msg.metadata = {};
  }
  msg.metadata["activeMemoryContext"] = payload;
}
