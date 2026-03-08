/**
 * Complexity Gate — Assess task complexity for team mode gating.
 *
 * Sprint 90 (ADR-026): Pure, stateless function that determines whether
 * a task string is complex enough to justify team-mode launch (3x token cost).
 * Used by Telegram `/launch --as-team` to warn CEO about simple tasks.
 *
 * @module bridge/intelligence/complexity-gate
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Keywords indicating multi-step or complex work.
 * Presence of any keyword (case-insensitive, word boundary) → "complex".
 */
export const COMPLEXITY_KEYWORDS = [
  "and",
  "then",
  "also",
  "multiple",
  "all",
  "each",
  "refactor",
  "migrate",
  "integrate",
  "orchestrate",
] as const;

/** Minimum task length to be considered potentially complex. */
export const MIN_TASK_LENGTH = 50;

// ============================================================================
// Types
// ============================================================================

export interface ComplexityAssessment {
  /** Whether the task is simple or complex */
  level: "simple" | "complex";
  /** Human-readable reason for the assessment */
  reason: string;
}

// ============================================================================
// Assessment Function
// ============================================================================

/**
 * Assess whether a task description is complex enough for team mode.
 *
 * Rules:
 * 1. Empty or very short tasks (< MIN_TASK_LENGTH chars) → simple
 * 2. No complexity keywords found → simple
 * 3. Otherwise → complex
 *
 * This is a soft gate — CEO can override in either direction via inline keyboard.
 *
 * @param task - The task description string
 * @returns ComplexityAssessment with level and reason
 */
export function assessComplexity(task: string): ComplexityAssessment {
  const trimmed = task.trim();

  // Rule 1: Too short
  if (trimmed.length < MIN_TASK_LENGTH) {
    return {
      level: "simple",
      reason: "task too short for team mode",
    };
  }

  // Rule 2: Check for complexity keywords (case-insensitive, word boundary)
  const lower = trimmed.toLowerCase();
  const hasKeyword = COMPLEXITY_KEYWORDS.some((kw) => {
    const pattern = new RegExp(`\\b${kw}\\b`, "i");
    return pattern.test(lower);
  });

  if (!hasKeyword) {
    return {
      level: "simple",
      reason: "no complexity indicators found",
    };
  }

  // Rule 3: Has keywords and is long enough
  return {
    level: "complex",
    reason: "task appears multi-step",
  };
}
