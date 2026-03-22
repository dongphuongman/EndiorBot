/**
 * Observation Scorer
 *
 * Scores observation importance by type with configurable thresholds.
 * Adapted from ClawVault's observation-format.ts.
 *
 * @module memory/observation-scorer
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 * @origin ClawVault v3.2.0 (src/lib/observation-format.ts)
 */

import type { MemoryType, ScoredObservation } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Importance thresholds for observation retention.
 *
 * - structural: Must retain (decisions, architecture) — always included in context
 * - potential: Retain if budget allows — included when there's room
 *
 * Observations below `potential` are ephemeral and not persisted.
 */
export const IMPORTANCE_THRESHOLDS = {
  /** Must retain: decisions, commitments, lessons. */
  structural: 0.8,
  /** Retain if budget allows: facts, preferences. */
  potential: 0.4,
} as const;

/**
 * Default importance scores by memory type.
 * Higher = more important to retain across sessions.
 */
const TYPE_IMPORTANCE_DEFAULTS: Record<MemoryType, number> = {
  decision: 0.9,
  commitment: 0.85,
  lesson: 0.8,
  blocker: 0.75,
  fact: 0.6,
  preference: 0.5,
  project: 0.5,
};

/**
 * Default confidence scores by memory type.
 * Higher = more certain the observation is accurate.
 */
const TYPE_CONFIDENCE_DEFAULTS: Record<MemoryType, number> = {
  decision: 0.85,
  commitment: 0.9,
  lesson: 0.7,
  blocker: 0.8,
  fact: 0.75,
  preference: 0.6,
  project: 0.8,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Score an observation's importance and confidence by its type.
 * Returns type-based defaults — callers can override if needed.
 *
 * @param type - Memory type of the observation
 * @param _content - Observation content (reserved for future content-based scoring)
 * @returns Object with importance and confidence scores
 */
export function scoreObservation(
  type: MemoryType,
  _content: string,
): { importance: number; confidence: number } {
  return {
    importance: TYPE_IMPORTANCE_DEFAULTS[type],
    confidence: TYPE_CONFIDENCE_DEFAULTS[type],
  };
}

/**
 * Filter observations by minimum importance threshold.
 * Returns only observations at or above the threshold.
 *
 * @param observations - Array of scored observations
 * @param threshold - Minimum importance score (0-1)
 * @returns Filtered array of observations meeting the threshold
 */
export function filterByImportance(
  observations: ScoredObservation[],
  threshold: number,
): ScoredObservation[] {
  return observations.filter((obs) => obs.importance >= threshold);
}

/**
 * Get the default importance score for a memory type.
 * Exported for testing.
 */
export function getTypeImportance(type: MemoryType): number {
  return TYPE_IMPORTANCE_DEFAULTS[type];
}

/**
 * Get the default confidence score for a memory type.
 * Exported for testing.
 */
export function getTypeConfidence(type: MemoryType): number {
  return TYPE_CONFIDENCE_DEFAULTS[type];
}
