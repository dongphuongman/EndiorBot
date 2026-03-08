/**
 * Turn-time Context Builder
 *
 * Builds a context prefix for /send commands.
 * Reads project state to compose sprint/blockers/task context
 * that gets prepended to CEO messages sent to agent sessions.
 *
 * Sprint 87: Adds per-session turn counter for context refresh triggers.
 * Note: turn-context.ts stays standalone (CTO MF-2 — no brain dependency).
 * Refresh orchestration happens in handleSendCommand() in telegram-commands.ts.
 *
 * @module bridge/intelligence/turn-context
 * @version 1.1.0
 * @date 2026-03-07
 * @authority ADR-024 §8.5, ADR-025 (Turn-time layer)
 * @stage 04 - BUILD (Sprint 86, 87)
 */

import { loadActiveProject } from "../../config/paths.js";

// ============================================================================
// Constants
// ============================================================================

/** Maximum character length for the context prefix */
export const TURN_CONTEXT_MAX_CHARS = 2048;

/** Context refresh interval (every N turns) — Sprint 87 */
export const REFRESH_INTERVAL = 10;

const CONTEXT_HEADER = "[EndiorBot Context]";
const CONTEXT_FOOTER = "[End Context]";

// ============================================================================
// Turn Counter (Sprint 87)
// ============================================================================

/**
 * In-memory turn counter per session.
 * Lost on restart (W1: acceptable — heuristic, not critical state).
 */
const turnCounters = new Map<string, number>();

/**
 * Increment turn count for a session and return the new count.
 */
export function incrementTurnCount(sessionId: string): number {
  const current = turnCounters.get(sessionId) ?? 0;
  const next = current + 1;
  turnCounters.set(sessionId, next);
  return next;
}

/**
 * Check if this session's turn count triggers a context refresh.
 * Returns true every REFRESH_INTERVAL turns (10, 20, 30, ...).
 */
export function shouldRefreshContext(sessionId: string): boolean {
  const count = turnCounters.get(sessionId) ?? 0;
  return count > 0 && count % REFRESH_INTERVAL === 0;
}

/**
 * Get current turn count for a session without incrementing.
 */
export function getTurnCount(sessionId: string): number {
  return turnCounters.get(sessionId) ?? 0;
}

/**
 * Reset turn counter for a session (on kill/cleanup).
 */
export function resetTurnCount(sessionId: string): void {
  turnCounters.delete(sessionId);
}

/**
 * Reset all turn counters (for testing).
 * @internal
 */
export function resetAllTurnCounts(): void {
  turnCounters.clear();
}

// ============================================================================
// Types
// ============================================================================

export interface TurnContextData {
  sprint?: string;
  blockers?: string;
  task?: string;
}

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Build a turn-time context prefix from structured data.
 *
 * Returns a formatted context block capped at TURN_CONTEXT_MAX_CHARS.
 * Returns empty string if no data is available.
 */
export function buildTurnContext(data?: TurnContextData): string {
  if (!data) return "";

  const sprint = data.sprint ?? "unknown";
  const blockers = data.blockers ?? "none";
  const task = data.task ?? "none";

  let prefix = `${CONTEXT_HEADER}
Sprint: ${sprint}
Blockers: ${blockers}
Task: ${task}
${CONTEXT_FOOTER}
`;

  // Cap to TURN_CONTEXT_MAX_CHARS
  if (prefix.length > TURN_CONTEXT_MAX_CHARS) {
    // Truncate task first (most expendable), then blockers
    const overhead = prefix.length - TURN_CONTEXT_MAX_CHARS;
    const taskTruncated = task.length > overhead
      ? task.slice(0, task.length - overhead - 3) + "..."
      : "...";
    prefix = `${CONTEXT_HEADER}
Sprint: ${sprint}
Blockers: ${blockers}
Task: ${taskTruncated}
${CONTEXT_FOOTER}
`;
  }

  if (prefix.length > TURN_CONTEXT_MAX_CHARS) {
    prefix = prefix.slice(0, TURN_CONTEXT_MAX_CHARS);
  }

  return prefix;
}

/**
 * Load turn context from the active project state.
 *
 * Maps ActiveProjectState fields to TurnContextData.
 * Returns empty object if active project not available.
 *
 * Note: sprint/blockers/task fields are not yet in ActiveProjectState.
 * Sprint 87 (ContextEnvelope) will add richer turn-time context.
 * For now, we derive what we can from existing data.
 */
export function loadTurnContextFromActive(): TurnContextData {
  try {
    const active = loadActiveProject();
    if (!active) return {};

    const result: TurnContextData = {};
    // ActiveProjectState has: name, path, tier, startedAt
    // Map name as sprint context (best available)
    if (active.name) result.sprint = active.name;

    return result;
  } catch {
    // File missing or parse error — return empty context
    return {};
  }
}
