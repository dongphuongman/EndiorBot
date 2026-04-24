/**
 * Stability Policy — OpenMythos #6 (LTI-stability analog)
 *
 * Composite runtime invariant guards for long autonomous sessions.
 * Checked atomically before each task execution to prevent:
 *   - Budget runaway (Opus cap exceeded)
 *   - Escalation storms (too many unresolved escalations)
 *   - Risky operation bursts (too many PATCH/INTERACTIVE ops in a window)
 *   - Checkpoint staleness (too many tasks without a checkpoint)
 *
 * OpenMythos analog: LTI-stable injection guarantees ρ(A) < 1 by
 * construction, preventing hidden state explosion across iterations.
 * Here we prevent session state explosion across tasks.
 *
 * CTO condition: StabilityPolicy as simple interface, not framework.
 *
 * @module sessions/autonomous/stability-policy
 * @sprint OpenMythos adoption (deferred from Sprint 141)
 */

import { createLogger } from "../../logging/logger.js";

const log = createLogger("stability-policy");

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a stability check. If `stable` is false, the session should
 * pause and surface the violation to the CEO.
 */
export interface StabilityCheckResult {
  stable: boolean;
  violations: StabilityViolation[];
}

export interface StabilityViolation {
  guard: string;
  message: string;
  severity: "warning" | "block";
}

/**
 * Configuration for stability guards.
 * All thresholds are optional — omit to disable a specific guard.
 */
export interface StabilityPolicyConfig {
  /** Max escalations before mandatory CEO pause (default: 3) */
  maxEscalations?: number;
  /** Max PATCH/INTERACTIVE ops per rolling window (default: 5) */
  maxRiskyOpsPerWindow?: number;
  /** Rolling window for risky ops in ms (default: 30 min) */
  riskyOpsWindowMs?: number;
  /** Max tasks between checkpoints (default: 10) */
  maxTasksBetweenCheckpoints?: number;
  /** Max time between checkpoints in ms (default: 15 min) */
  maxTimeBetweenCheckpointsMs?: number;
}

export const DEFAULT_STABILITY_POLICY: Required<StabilityPolicyConfig> = {
  maxEscalations: 3,
  maxRiskyOpsPerWindow: 5,
  riskyOpsWindowMs: 30 * 60_000, // 30 min
  maxTasksBetweenCheckpoints: 10,
  maxTimeBetweenCheckpointsMs: 15 * 60_000, // 15 min
};

// ============================================================================
// Stability Policy
// ============================================================================

/**
 * Check all stability invariants atomically.
 *
 * @param state — current session state snapshot
 * @param config — stability thresholds (defaults applied for omitted fields)
 * @returns StabilityCheckResult with violations list
 */
export function checkStability(
  state: SessionStabilityState,
  config?: Partial<StabilityPolicyConfig>,
): StabilityCheckResult {
  const cfg: Required<StabilityPolicyConfig> = {
    ...DEFAULT_STABILITY_POLICY,
    ...config,
  };

  const violations: StabilityViolation[] = [];

  // Guard 1: Escalation cap
  if (state.pendingEscalations >= cfg.maxEscalations) {
    violations.push({
      guard: "escalation_cap",
      message: `${state.pendingEscalations} pending escalations ≥ max ${cfg.maxEscalations} — CEO review required`,
      severity: "block",
    });
  }

  // Guard 2: Risky ops window
  const now = Date.now();
  const recentRiskyOps = state.riskyOpTimestamps.filter(
    (ts) => now - ts < cfg.riskyOpsWindowMs,
  );
  if (recentRiskyOps.length >= cfg.maxRiskyOpsPerWindow) {
    violations.push({
      guard: "risky_ops_window",
      message: `${recentRiskyOps.length} PATCH/INTERACTIVE ops in last ${cfg.riskyOpsWindowMs / 60_000}min ≥ max ${cfg.maxRiskyOpsPerWindow}`,
      severity: "block",
    });
  }

  // Guard 3: Checkpoint cadence (by task count)
  if (state.tasksSinceLastCheckpoint >= cfg.maxTasksBetweenCheckpoints) {
    violations.push({
      guard: "checkpoint_cadence_tasks",
      message: `${state.tasksSinceLastCheckpoint} tasks since last checkpoint ≥ max ${cfg.maxTasksBetweenCheckpoints}`,
      severity: "warning",
    });
  }

  // Guard 4: Checkpoint cadence (by time)
  if (state.lastCheckpointAt > 0) {
    const timeSinceCheckpoint = now - state.lastCheckpointAt;
    if (timeSinceCheckpoint >= cfg.maxTimeBetweenCheckpointsMs) {
      violations.push({
        guard: "checkpoint_cadence_time",
        message: `${Math.round(timeSinceCheckpoint / 60_000)}min since last checkpoint ≥ max ${cfg.maxTimeBetweenCheckpointsMs / 60_000}min`,
        severity: "warning",
      });
    }
  }

  const stable = !violations.some((v) => v.severity === "block");

  if (violations.length > 0) {
    log.warn("Stability check found violations", {
      stable,
      violationCount: violations.length,
      guards: violations.map((v) => v.guard),
    });
  }

  return { stable, violations };
}

/**
 * Session state snapshot consumed by the stability checker.
 * The AutonomousSessionManager populates this from its internal state.
 */
export interface SessionStabilityState {
  /** Number of unresolved escalation requests */
  pendingEscalations: number;
  /** Timestamps of PATCH/INTERACTIVE operations (for rolling window) */
  riskyOpTimestamps: number[];
  /** Tasks completed since the last checkpoint */
  tasksSinceLastCheckpoint: number;
  /** Timestamp of the most recent checkpoint (0 if never checkpointed) */
  lastCheckpointAt: number;
}
