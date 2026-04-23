/**
 * Ollama Confidence Scorer — Sprint 141 P0-2
 *
 * Heuristic confidence scorer for Tier-3 (Ollama/AI-Platform) responses.
 * When confidence is below threshold AND FF_OLLAMA_AUTO_ESCALATE is enabled,
 * the response is rejected and the agent falls back to the next provider
 * in the tier fallback chain (typically Kimi).
 *
 * CTO conditions:
 *   C1: Ship with FF_OLLAMA_AUTO_ESCALATE = false; enable after 3-day data
 *   C2: English-only heuristic v1; Vietnamese keywords deferred to Sprint 142
 *   C4: Rollback if false-positive rate > 30%
 *
 * Exported for unit testing — pure function, no side effects.
 *
 * @module agents/router/ollama-confidence
 * @sprint 141
 */

import { createLogger } from "../../logging/logger.js";

const log = createLogger("ollama-confidence");

// ============================================================================
// Types
// ============================================================================

export interface ConfidenceResult {
  /** Confidence score 0.0–1.0 */
  score: number;
  /** Human-readable reason for the score */
  reason: string;
  /** Whether auto-escalation should trigger (score < threshold AND FF enabled) */
  shouldEscalate: boolean;
}

// ============================================================================
// Uncertainty markers (English v1 — Vietnamese deferred to Sprint 142 per CTO C2)
// ============================================================================

const UNCERTAINTY_MARKERS_EN = [
  "i don't know",
  "i'm not sure",
  "i cannot",
  "i can't",
  "unsure",
  "uncertain",
  "i'm unable",
  "not confident",
  "beyond my",
  "i lack",
  "i do not have",
];

// ============================================================================
// Confidence scorer
// ============================================================================

/**
 * Score the confidence of an Ollama/AI-Platform response.
 *
 * Heuristic rules (v1):
 *   - Response length < 50 chars → 0.3 (too short to be useful)
 *   - Response length < 100 chars → 0.5 (marginal)
 *   - Contains uncertainty marker → -0.2 per marker (max -0.4)
 *   - Empty/whitespace-only → 0.0
 *   - Otherwise → 0.8 (default healthy)
 *
 * @param content — the raw response text from Ollama
 * @param agent — the agent name (for context-specific rules)
 * @returns ConfidenceResult with score, reason, and escalation recommendation
 */
export function scoreOllamaConfidence(
  content: string,
  agent: string,
  options?: {
    escalationThreshold?: number;
    featureFlagEnabled?: boolean;
  },
): ConfidenceResult {
  const threshold = options?.escalationThreshold ?? 0.5;
  const ffEnabled = options?.featureFlagEnabled
    ?? (process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE === "true");

  const trimmed = content.trim();

  // Empty response
  if (trimmed.length === 0) {
    const result: ConfidenceResult = {
      score: 0.0,
      reason: "empty response",
      shouldEscalate: ffEnabled,
    };
    log.info("Ollama confidence scored", { agent, ...result });
    return result;
  }

  let score = 0.8; // default healthy
  const reasons: string[] = [];

  // Length check
  if (trimmed.length < 50) {
    score = 0.3;
    reasons.push(`very short (${trimmed.length} chars)`);
  } else if (trimmed.length < 100) {
    score = 0.5;
    reasons.push(`short (${trimmed.length} chars)`);
  }

  // Uncertainty marker check (English v1)
  const lower = trimmed.toLowerCase();
  let uncertaintyPenalty = 0;
  for (const marker of UNCERTAINTY_MARKERS_EN) {
    if (lower.includes(marker)) {
      uncertaintyPenalty += 0.2;
      reasons.push(`uncertainty: "${marker}"`);
      if (uncertaintyPenalty >= 0.4) break; // cap penalty
    }
  }
  score = Math.max(0, score - uncertaintyPenalty);

  const reason = reasons.length > 0 ? reasons.join("; ") : "healthy response";
  const shouldEscalate = ffEnabled && score < threshold;

  const result: ConfidenceResult = { score, reason, shouldEscalate };

  // CTO C1: always log confidence scores regardless of FF state (data collection)
  log.info("Ollama confidence scored", {
    agent,
    score: result.score,
    reason: result.reason,
    shouldEscalate: result.shouldEscalate,
    ffEnabled,
    threshold,
    contentLength: trimmed.length,
  });

  return result;
}
