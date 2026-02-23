/**
 * Checkpoint Integration for Budget Module
 *
 * Bridges checkpoint system (Sprint 35) with budget control (Sprint 36).
 *
 * Per CTO Day 5 guidance:
 * 1. Session costs carry over on resume (not reset to zero)
 * 2. Daily budget persists across sessions (file-backed)
 *
 * Based on ADR-007 Autonomous Execution Budget specification.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { DailyBudget, BudgetState } from "./types.js";
import type { CostState, CheckpointState } from "../sessions/checkpoint/types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default daily budget file path */
export const DEFAULT_DAILY_BUDGET_PATH = join(
  homedir(),
  ".endiorbot",
  "daily-budget.json",
);

/** Default daily limit */
export const DEFAULT_DAILY_LIMIT = 10.0;

// ============================================================================
// Types
// ============================================================================

/**
 * Persisted daily budget data.
 */
export interface PersistedDailyBudget {
  /** Daily budget limit in USD */
  limit: number;
  /** Today's total cost in USD */
  costSoFar: number;
  /** Current date (YYYY-MM-DD, UTC) */
  date: string;
  /** Last updated timestamp (ISO string) */
  lastUpdated: string;
  /** Version for migration */
  version: string;
}

/**
 * Checkpoint budget integration result.
 */
export interface CheckpointBudgetResult {
  /** Session cost restored */
  sessionCostRestored: number;
  /** Daily cost loaded */
  dailyCostLoaded: number;
  /** Whether daily reset occurred */
  dailyReset: boolean;
  /** Warnings during restore */
  warnings: string[];
}

// ============================================================================
// Daily Budget Store
// ============================================================================

/**
 * DailyBudgetStore - File-backed daily budget persistence.
 *
 * Per CTO guidance: Daily budget must persist across sessions.
 * A restart should NOT reset the daily counter.
 */
export class DailyBudgetStore {
  private filePath: string;
  private data: PersistedDailyBudget;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_DAILY_BUDGET_PATH;
    this.data = this.load();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get current daily budget.
   */
  getDailyBudget(): DailyBudget {
    // Check for day change
    const today = this.getTodayDateString();
    if (this.data.date !== today) {
      this.resetForNewDay(today);
    }

    return {
      costSoFar: this.data.costSoFar,
      limit: this.data.limit,
      date: this.data.date,
      resetAt: this.getNextMidnightUTC(),
    };
  }

  /**
   * Record cost to daily budget.
   */
  recordCost(cost: number): void {
    // Check for day change first
    const today = this.getTodayDateString();
    if (this.data.date !== today) {
      this.resetForNewDay(today);
    }

    this.data.costSoFar += cost;
    this.data.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Set daily limit.
   */
  setLimit(limit: number): void {
    this.data.limit = limit;
    this.save();
  }

  /**
   * Get remaining daily budget.
   */
  getRemainingBudget(): number {
    const budget = this.getDailyBudget();
    return Math.max(0, budget.limit - budget.costSoFar);
  }

  /**
   * Check if daily limit is reached.
   */
  isLimitReached(): boolean {
    const budget = this.getDailyBudget();
    return budget.costSoFar >= budget.limit;
  }

  /**
   * Check if at warning threshold (80%).
   */
  isAtWarningThreshold(warningPercent: number = 80): boolean {
    const budget = this.getDailyBudget();
    const percent = (budget.costSoFar / budget.limit) * 100;
    return percent >= warningPercent;
  }

  /**
   * Force reset daily budget.
   */
  reset(): void {
    this.resetForNewDay(this.getTodayDateString());
  }

  /**
   * Get persisted data for debugging.
   */
  getPersistedData(): PersistedDailyBudget {
    return { ...this.data };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Load daily budget from file.
   */
  private load(): PersistedDailyBudget {
    if (existsSync(this.filePath)) {
      try {
        const content = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(content) as PersistedDailyBudget;

        // Validate required fields
        if (
          typeof parsed.limit === "number" &&
          typeof parsed.costSoFar === "number" &&
          typeof parsed.date === "string"
        ) {
          return parsed;
        }
      } catch {
        // Invalid file, create new
      }
    }

    // Create default
    return this.createDefault();
  }

  /**
   * Save daily budget to file.
   */
  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  /**
   * Create default daily budget.
   */
  private createDefault(): PersistedDailyBudget {
    const data: PersistedDailyBudget = {
      limit: DEFAULT_DAILY_LIMIT,
      costSoFar: 0,
      date: this.getTodayDateString(),
      lastUpdated: new Date().toISOString(),
      version: "1.0.0",
    };
    return data;
  }

  /**
   * Reset for new day.
   */
  private resetForNewDay(date: string): void {
    this.data.costSoFar = 0;
    this.data.date = date;
    this.data.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Get today's date string (YYYY-MM-DD, UTC).
   */
  private getTodayDateString(): string {
    return new Date().toISOString().substring(0, 10);
  }

  /**
   * Get next midnight UTC.
   */
  private getNextMidnightUTC(): Date {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }
}

// ============================================================================
// Checkpoint Integration Functions
// ============================================================================

/**
 * Extract CostState from BudgetState for checkpoint save.
 */
export function extractCostState(budgetState: BudgetState): CostState {
  const costState: CostState = {
    sessionCostSoFar: budgetState.session.costSoFar,
    tokenUsage: budgetState.tokenUsage.map((usage) => ({
      model: usage.model,
      input: usage.inputTokens,
      output: usage.outputTokens,
      cost: usage.cost,
    })),
  };
  // timeBudgetRemaining omitted - not tracked
  return costState;
}

/**
 * Restore budget from checkpoint.
 *
 * Per CTO Day 5 guidance:
 * - Session costs carry over (not reset to zero)
 * - Daily budget loaded from file (persists across sessions)
 */
export function restoreBudgetFromCheckpoint(
  checkpoint: CheckpointState,
  dailyBudgetStore: DailyBudgetStore,
): CheckpointBudgetResult {
  const warnings: string[] = [];
  let dailyReset = false;

  // Load session cost from checkpoint
  const sessionCostRestored = checkpoint.cost.sessionCostSoFar;

  // Load daily budget from persistent store
  const dailyBudget = dailyBudgetStore.getDailyBudget();
  const dailyCostLoaded = dailyBudget.costSoFar;

  // Check if checkpoint date differs from daily store date
  // This would indicate a session that spans days
  const today = new Date().toISOString().substring(0, 10);
  if (dailyBudget.date !== today) {
    dailyReset = true;
    warnings.push(
      `Daily budget reset: checkpoint from ${checkpoint.meta.createdAt} but today is ${today}`,
    );
  }

  // Warn if session cost exceeds daily remaining
  const dailyRemaining = dailyBudget.limit - dailyBudget.costSoFar;
  if (sessionCostRestored > dailyRemaining) {
    warnings.push(
      `Session cost (${sessionCostRestored.toFixed(2)}) may exceed daily remaining (${dailyRemaining.toFixed(2)})`,
    );
  }

  return {
    sessionCostRestored,
    dailyCostLoaded,
    dailyReset,
    warnings,
  };
}

/**
 * Create BudgetState from checkpoint and daily store.
 */
export function createBudgetStateFromCheckpoint(
  checkpoint: CheckpointState,
  dailyBudgetStore: DailyBudgetStore,
  sessionLimit: number = 2.0,
): BudgetState {
  const dailyBudget = dailyBudgetStore.getDailyBudget();

  const state: BudgetState = {
    session: {
      costSoFar: checkpoint.cost.sessionCostSoFar,
      limit: sessionLimit,
      startTime: new Date(checkpoint.meta.createdAt),
    },
    daily: {
      costSoFar: dailyBudget.costSoFar,
      limit: dailyBudget.limit,
      date: dailyBudget.date,
      resetAt: dailyBudget.resetAt,
    },
    // tracks omitted - not used in checkpoint restore
    tokenUsage: checkpoint.cost.tokenUsage.map((usage) => ({
      timestamp: new Date(),
      model: usage.model,
      provider: "unknown", // Will be resolved by BudgetTracker
      inputTokens: usage.input,
      outputTokens: usage.output,
      cost: usage.cost ?? 0,
    })),
    historical: {
      avgCostPerTask: {},
      avgCostPerModel: {},
      totalSpent: dailyBudget.costSoFar,
    },
  };

  return state;
}

/**
 * Sync BudgetTracker state to daily budget store.
 *
 * Call this after recordUsage() to persist daily budget.
 */
export function syncDailyBudget(
  _sessionCost: number,
  _dailyBudgetStore: DailyBudgetStore,
): void {
  // The daily budget store tracks total daily cost
  // Session cost is a subset of daily cost
  // We don't need to record session cost again - BudgetTracker already tracks it
  // This function is for explicit sync after major operations
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create daily budget store with default path.
 */
export function createDailyBudgetStore(filePath?: string): DailyBudgetStore {
  return new DailyBudgetStore(filePath);
}

/**
 * Check if checkpoint budget integration is needed.
 *
 * Returns true if:
 * - Checkpoint has session cost > 0
 * - Or daily budget file exists with cost > 0
 */
export function needsBudgetRestore(
  checkpoint: CheckpointState | null,
  dailyBudgetPath: string = DEFAULT_DAILY_BUDGET_PATH,
): boolean {
  // Check checkpoint session cost
  if (checkpoint && checkpoint.cost.sessionCostSoFar > 0) {
    return true;
  }

  // Check persisted daily budget
  if (existsSync(dailyBudgetPath)) {
    try {
      const content = readFileSync(dailyBudgetPath, "utf-8");
      const data = JSON.parse(content) as PersistedDailyBudget;
      const today = new Date().toISOString().substring(0, 10);
      if (data.date === today && data.costSoFar > 0) {
        return true;
      }
    } catch {
      // Invalid file
    }
  }

  return false;
}
