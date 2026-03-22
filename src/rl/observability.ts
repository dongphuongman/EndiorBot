/**
 * RL Observability — Sprint 110 (ADR-033)
 *
 * Stats interface for monitoring RL feedback pipeline health.
 * Used for kill-criteria measurement and /api/status integration.
 *
 * @module rl/observability
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 110
 * @authority ADR-033
 * @sprint 110
 */

/**
 * RL pipeline statistics.
 *
 * Kill criteria (from ADR-033):
 * - feedbackRate < 0.15 after 4 weeks → kill
 * - positiveRate(trained) < 0.50 after 200 samples → kill
 */
export interface RLStats {
  /** Total turns tracked (main + side) */
  totalTurns: number;
  /** Turns eligible for RL training (isTrainableTurn=true) */
  trainableTurns: number;
  /** Turns where CEO provided feedback (good/partial/bad) */
  feedbackReceived: number;
  /** feedbackReceived / trainableTurns — kill if <0.15 after 4 weeks */
  feedbackRate: number;
  /** 👍 Good responses */
  positives: number;
  /** 🔄 Partial responses (event log only in Sprint 110) */
  partials: number;
  /** 👎 Bad responses */
  negatives: number;
  /** Hint texts received (always 0 in Sprint 110 — OPD deferred to Sprint 112) */
  hintsReceived: number;
  /** JSONL records written to training file (good/bad only) */
  recordsWritten: number;
  /** Failed writes (disk full, permission error) */
  writeFailures: number;
  /** Turns that expired without feedback (2h window) */
  expiredWithoutFeedback: number;
}
