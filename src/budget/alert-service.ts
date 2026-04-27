/**
 * Budget Alert Service
 *
 * Threshold checks, warning message generation, and limit-reached action
 * construction for the BudgetTracker.
 *
 * @module budget/alert-service
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import type {
  BudgetConfig,
  BudgetState,
  BudgetAction,
  BudgetEvent,
} from "./types.js";
import {
  calculateBudgetPercentage,
  isAtWarningThreshold,
  isLimitReached,
} from "./types.js";
import type { CircuitBreaker } from "./circuit-breaker.js";

// ============================================================================
// AlertService
// ============================================================================

/** Emitter interface used by AlertService to fire budget events. */
export interface BudgetEventEmitter {
  emit(event: BudgetEvent): void;
}

/**
 * Evaluates budget thresholds and constructs limit-reached actions.
 *
 * Extracted from BudgetTracker to keep that class below 900 lines.
 */
export class AlertService {
  private readonly config: BudgetConfig;
  private readonly sessionBreaker: CircuitBreaker;
  private readonly dailyBreaker: CircuitBreaker;
  private readonly emitter: BudgetEventEmitter;

  constructor(
    config: BudgetConfig,
    sessionBreaker: CircuitBreaker,
    dailyBreaker: CircuitBreaker,
    emitter: BudgetEventEmitter,
  ) {
    this.config = config;
    this.sessionBreaker = sessionBreaker;
    this.dailyBreaker = dailyBreaker;
    this.emitter = emitter;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Evaluate current budget state and return the appropriate action.
   * Trips circuit breakers and emits events as needed.
   */
  evaluate(state: BudgetState): BudgetAction {
    // Check session limit
    if (isLimitReached(state.session.costSoFar, state.session.limit)) {
      this.sessionBreaker.trip("max_cost_exceeded");
      this.emitter.emit({
        type: "limit_reached",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 100 },
      });
      return this.buildLimitAction("session", state);
    }

    // Check daily limit
    if (isLimitReached(state.daily.costSoFar, state.daily.limit)) {
      this.dailyBreaker.trip("max_cost_exceeded");
      this.emitter.emit({
        type: "limit_reached",
        timestamp: new Date(),
        data: { budgetType: "daily", percentUsed: 100 },
      });
      return this.buildLimitAction("daily", state);
    }

    // Check warning thresholds
    const sessionWarning = isAtWarningThreshold(
      state.session.costSoFar,
      state.session.limit,
      this.config.warning_threshold,
    );
    const dailyWarning = isAtWarningThreshold(
      state.daily.costSoFar,
      state.daily.limit,
      this.config.warning_threshold,
    );

    if (sessionWarning || dailyWarning) {
      const budgetType = sessionWarning ? "session" : "daily";
      const percentUsed = sessionWarning
        ? calculateBudgetPercentage(state.session.costSoFar, state.session.limit)
        : calculateBudgetPercentage(state.daily.costSoFar, state.daily.limit);

      this.emitter.emit({
        type: "warning_triggered",
        timestamp: new Date(),
        data: { budgetType, percentUsed },
      });
    }

    return {
      action: "continue",
      remainingBudget: {
        session: state.session.limit - state.session.costSoFar,
        daily: state.daily.limit - state.daily.costSoFar,
      },
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildLimitAction(
    budgetType: "session" | "daily" | "track",
    state: BudgetState,
  ): BudgetAction {
    const onLimit = this.config.on_limit_reached;
    const remainingBudget = {
      session: Math.max(0, state.session.limit - state.session.costSoFar),
      daily: Math.max(0, state.daily.limit - state.daily.costSoFar),
    };

    switch (onLimit.action) {
      case "pause_and_notify":
        return { action: "pause", reason: `${budgetType}_limit_reached`, remainingBudget };

      case "switch_to_self_hosted":
        return {
          action: "switch_model",
          model: onLimit.fallback_model ?? "self-hosted/qwen3-coder",
          reason: `${budgetType}_limit_reached`,
          remainingBudget,
        };

      case "fail_fast":
        return { action: "fail", reason: `${budgetType}_limit_reached` };
    }
  }
}
