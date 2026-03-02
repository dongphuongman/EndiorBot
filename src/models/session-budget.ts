/**
 * Session Budget
 *
 * Tracks and enforces budget constraints for autonomous sessions.
 *
 * @module models/session-budget
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.4
 * @sprint 72
 */

import { createLogger, type Logger } from "../logging/index.js";
import {
  ModelTier,
  type BudgetConfig,
  type BudgetState,
  type BudgetCheckResult,
  type BudgetEvent,
  type ModelCallRecord,
  type TierSpending,
  DEFAULT_BUDGET_CONFIG,
  createInitialBudgetState,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Budget event listener.
 */
export type BudgetEventListener = (event: BudgetEvent) => void;

// ============================================================================
// Session Budget
// ============================================================================

/**
 * Session Budget.
 *
 * Tracks spending per model tier and enforces budget constraints:
 * - Total session budget ($10 default)
 * - Opus cap ($3 max, 20 minutes max)
 * - Stage-based allocation
 *
 * @example
 * ```typescript
 * const budget = new SessionBudget({ totalUsd: 10, opusCapUsd: 3 });
 *
 * // Check if we can afford a call
 * const check = budget.checkBudget(ModelTier.ELITE, 0.50);
 * if (check.canAfford) {
 *   // Make the call
 *   budget.recordCall({
 *     tier: ModelTier.ELITE,
 *     model: 'claude-opus-4',
 *     cost: 0.45,
 *     durationSeconds: 30,
 *     inputTokens: 5000,
 *     outputTokens: 2000,
 *   });
 * }
 *
 * // Check remaining budget
 * const remaining = budget.getRemaining();
 * console.log(remaining.total); // $9.55
 * console.log(remaining.opus);  // $2.55
 * ```
 */
export class SessionBudget {
  private readonly log: Logger;
  private readonly config: BudgetConfig;
  private state: BudgetState;
  private listeners: BudgetEventListener[] = [];

  constructor(config: Partial<BudgetConfig> = {}) {
    this.log = createLogger("SessionBudget");
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.state = createInitialBudgetState();
  }

  // ==========================================================================
  // Budget Checking
  // ==========================================================================

  /**
   * Check if we can afford a model call.
   *
   * @param tier - Model tier
   * @param estimatedCost - Estimated cost in USD
   * @returns Budget check result
   */
  checkBudget(tier: ModelTier, estimatedCost: number): BudgetCheckResult {
    const totalSpent = this.getTotalSpent();
    const remainingTotal = this.config.totalUsd - totalSpent;

    // Get tier-specific remaining
    const opusSpent = this.state.spending[ModelTier.ELITE];
    const remainingOpus = this.config.opusCapUsd - opusSpent.usd;
    const remainingOpusMinutes = this.config.opusCapMin - (opusSpent.seconds / 60);

    const result: BudgetCheckResult = {
      canAfford: true,
      remainingTotal,
      remainingOpus,
      remainingOpusMinutes,
    };

    // Check total budget
    if (totalSpent + estimatedCost > this.config.totalUsd) {
      result.canAfford = false;
      result.warning = `Total budget exceeded: $${totalSpent.toFixed(2)}/$${this.config.totalUsd} spent`;
      const suggested = this.getSuggestedAlternative(tier);
      if (suggested) result.suggestedAlternative = suggested;
      return result;
    }

    // Check Opus cap for ELITE tier
    if (tier === ModelTier.ELITE) {
      if (opusSpent.usd >= this.config.opusCapUsd) {
        result.canAfford = false;
        result.warning = `Opus cost cap reached: $${opusSpent.usd.toFixed(2)}/$${this.config.opusCapUsd}`;
        result.suggestedAlternative = ModelTier.STANDARD;
        return result;
      }

      if (opusSpent.seconds / 60 >= this.config.opusCapMin) {
        result.canAfford = false;
        result.warning = `Opus time cap reached: ${(opusSpent.seconds / 60).toFixed(1)}/${this.config.opusCapMin} minutes`;
        result.suggestedAlternative = ModelTier.STANDARD;
        return result;
      }
    }

    // Check warning threshold
    if (this.config.enableWarnings) {
      const usedPercent = (totalSpent / this.config.totalUsd) * 100;
      if (usedPercent >= this.config.warningThreshold) {
        result.warning = `Budget warning: ${usedPercent.toFixed(1)}% used ($${totalSpent.toFixed(2)}/$${this.config.totalUsd})`;
      }
    }

    return result;
  }

  /**
   * Check if ELITE tier is available.
   */
  canUseElite(): boolean {
    const check = this.checkBudget(ModelTier.ELITE, 0.10);
    return check.canAfford;
  }

  // ==========================================================================
  // Recording Calls
  // ==========================================================================

  /**
   * Record a model call.
   *
   * @param record - Model call record
   */
  recordCall(record: ModelCallRecord): void {
    const tier = record.tier;
    const spending = this.state.spending[tier];

    // Update spending
    spending.usd += record.cost;
    spending.seconds += record.durationSeconds;
    spending.calls += 1;
    spending.tokens += record.inputTokens + record.outputTokens;

    // Update stage spending
    if (record.stage) {
      this.state.stageSpending[record.stage] =
        (this.state.stageSpending[record.stage] ?? 0) + record.cost;
    }

    // Update timestamp
    this.state.lastUpdate = new Date().toISOString();

    // Emit event
    this.emitEvent({
      type: "model_call_recorded",
      timestamp: this.state.lastUpdate,
      details: {
        tier,
        cost: record.cost,
        totalSpent: this.getTotalSpent(),
        remaining: this.config.totalUsd - this.getTotalSpent(),
      },
    });

    // Check for warnings
    this.checkAndEmitWarnings();

    this.log.debug("Model call recorded", {
      tier,
      cost: record.cost,
      totalSpent: this.getTotalSpent(),
    });
  }

  // ==========================================================================
  // Budget Queries
  // ==========================================================================

  /**
   * Get total spent across all tiers.
   */
  getTotalSpent(): number {
    return Object.values(this.state.spending).reduce((sum, s) => sum + s.usd, 0);
  }

  /**
   * Get remaining budget.
   */
  getRemaining(): { total: number; opus: number; opusMinutes: number } {
    const totalSpent = this.getTotalSpent();
    const opusSpent = this.state.spending[ModelTier.ELITE];

    return {
      total: this.config.totalUsd - totalSpent,
      opus: this.config.opusCapUsd - opusSpent.usd,
      opusMinutes: this.config.opusCapMin - (opusSpent.seconds / 60),
    };
  }

  /**
   * Get spending for a specific tier.
   */
  getTierSpending(tier: ModelTier): TierSpending {
    return { ...this.state.spending[tier] };
  }

  /**
   * Get spending for a specific stage.
   */
  getStageSpending(stage: string): number {
    return this.state.stageSpending[stage] ?? 0;
  }

  /**
   * Get budget utilization as percentage.
   */
  getUtilization(): {
    total: number;
    opus: number;
    opusTime: number;
    byTier: Record<ModelTier, number>;
  } {
    const totalSpent = this.getTotalSpent();
    const opusSpent = this.state.spending[ModelTier.ELITE];

    return {
      total: (totalSpent / this.config.totalUsd) * 100,
      opus: (opusSpent.usd / this.config.opusCapUsd) * 100,
      opusTime: ((opusSpent.seconds / 60) / this.config.opusCapMin) * 100,
      byTier: {
        [ModelTier.ELITE]: opusSpent.usd,
        [ModelTier.STANDARD]: this.state.spending[ModelTier.STANDARD].usd,
        [ModelTier.EFFICIENCY]: this.state.spending[ModelTier.EFFICIENCY].usd,
      },
    };
  }

  /**
   * Get current state (for serialization).
   */
  getState(): BudgetState {
    return { ...this.state };
  }

  /**
   * Get configuration.
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Stage Management
  // ==========================================================================

  /**
   * Set the current stage.
   */
  setCurrentStage(stage: string): void {
    this.state.currentStage = stage;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current stage.
   */
  getCurrentStage(): string {
    return this.state.currentStage;
  }

  /**
   * Get budget allocation for current stage.
   */
  getStageBudget(stage?: string): number {
    const stageKey = stage ?? this.state.currentStage;
    const allocation = this.config.perStage[stageKey as keyof typeof this.config.perStage];

    if (allocation === undefined) {
      return this.config.totalUsd * 0.25; // Default 25% if stage not found
    }

    return this.config.totalUsd * (allocation / 100);
  }

  /**
   * Check if stage budget is exceeded.
   */
  isStageBudgetExceeded(stage?: string): boolean {
    const stageKey = stage ?? this.state.currentStage;
    const spent = this.getStageSpending(stageKey);
    const budget = this.getStageBudget(stageKey);
    return spent > budget;
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  /**
   * Add an event listener.
   */
  addEventListener(listener: BudgetEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(listener: BudgetEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit a budget event.
   */
  private emitEvent(event: BudgetEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.log.warn("Budget event listener error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Check and emit warning events.
   */
  private checkAndEmitWarnings(): void {
    const totalSpent = this.getTotalSpent();
    const opusSpent = this.state.spending[ModelTier.ELITE];

    // Check total budget warning
    const usedPercent = (totalSpent / this.config.totalUsd) * 100;
    if (usedPercent >= this.config.warningThreshold) {
      this.emitEvent({
        type: "warning_threshold_reached",
        timestamp: new Date().toISOString(),
        details: {
          usedPercent,
          spent: totalSpent,
          budget: this.config.totalUsd,
        },
      });
    }

    // Check Opus cap
    if (opusSpent.usd >= this.config.opusCapUsd) {
      this.emitEvent({
        type: "opus_cap_reached",
        timestamp: new Date().toISOString(),
        details: {
          type: "cost",
          spent: opusSpent.usd,
          cap: this.config.opusCapUsd,
        },
      });
    }

    if (opusSpent.seconds / 60 >= this.config.opusCapMin) {
      this.emitEvent({
        type: "opus_cap_reached",
        timestamp: new Date().toISOString(),
        details: {
          type: "time",
          spent: opusSpent.seconds / 60,
          cap: this.config.opusCapMin,
        },
      });
    }

    // Check if budget exceeded
    if (totalSpent > this.config.totalUsd) {
      this.emitEvent({
        type: "budget_exceeded",
        timestamp: new Date().toISOString(),
        details: {
          spent: totalSpent,
          budget: this.config.totalUsd,
          overage: totalSpent - this.config.totalUsd,
        },
      });
    }
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Reset the budget state.
   */
  reset(): void {
    this.state = createInitialBudgetState();
    this.log.info("Budget state reset");
  }

  /**
   * Restore state from serialized data.
   */
  restoreState(state: BudgetState): void {
    this.state = { ...state };
    this.state.lastUpdate = new Date().toISOString();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get suggested alternative tier when budget exceeded.
   */
  private getSuggestedAlternative(currentTier: ModelTier): ModelTier | undefined {
    if (currentTier === ModelTier.ELITE) {
      return ModelTier.STANDARD;
    }
    if (currentTier === ModelTier.STANDARD) {
      return ModelTier.EFFICIENCY;
    }
    return undefined;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalBudget: SessionBudget | undefined;

/**
 * Get the global SessionBudget instance.
 */
export function getSessionBudget(config?: Partial<BudgetConfig>): SessionBudget {
  if (!globalBudget) {
    globalBudget = new SessionBudget(config);
  }
  return globalBudget;
}

/**
 * Set the global SessionBudget instance.
 */
export function setSessionBudget(budget: SessionBudget): void {
  globalBudget = budget;
}

/**
 * Reset the global SessionBudget (for testing).
 */
export function resetSessionBudget(): void {
  globalBudget = undefined;
}

/**
 * Create a new SessionBudget instance.
 */
export function createSessionBudget(
  config?: Partial<BudgetConfig>
): SessionBudget {
  return new SessionBudget(config);
}
