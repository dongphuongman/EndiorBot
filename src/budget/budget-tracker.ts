/**
 * Budget Tracker Implementation
 *
 * Tracks costs across sessions, days, and tracks.
 * Enforces budget limits and triggers circuit breakers.
 *
 * Based on ADR-007 Autonomous Execution Budget specification.
 *
 * Per CTO guidance:
 * - Calls needsDailyReset() on every cost record (not just startup)
 * - Integrates with circuit breaker state machine
 */

import type {
  BudgetConfig,
  BudgetState,
  TokenUsageRecord,
  BudgetAction,
  CostEstimate,
  TaskContext,
  TaskType,
  TaskMetrics,
  ConfidenceLevel,
  ModelPricing,
  BudgetEvent,
} from "./types.js";
import type { CostState } from "../sessions/checkpoint/types.js";
import {
  DEFAULT_BUDGET_CONFIG,
  createInitialBudgetState,
  needsDailyReset,
  calculateBudgetPercentage,
  isAtWarningThreshold,
  isLimitReached,
  createEmptyTaskMetrics,
} from "./types.js";
import {
  CircuitBreaker,
  NotificationRateLimiter,
} from "./circuit-breaker.js";

// ============================================================================
// Constants
// ============================================================================

/** Base token estimates by task type */
const BASE_OUTPUT_ESTIMATES: Record<TaskType, number> = {
  code_implementation: 2000,
  code_review: 1000,
  test_writing: 1500,
  bug_fix: 800,
  refactoring: 1200,
  documentation: 1000,
  architecture: 3000,
  research: 2500,
  general: 1000,
};

/** Fallback pricing (Sonnet 4) for unknown models */
const FALLBACK_PRICING: ModelPricing = {
  provider: "anthropic",
  model: "claude-sonnet-4",
  input_per_1k: 0.003,
  output_per_1k: 0.015,
  updatedAt: new Date(),
};

/** Default model pricing (per 1K tokens) */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4": {
    provider: "anthropic",
    model: "claude-opus-4",
    input_per_1k: 0.015,
    output_per_1k: 0.075,
    updatedAt: new Date(),
  },
  "claude-sonnet-4": FALLBACK_PRICING,
  "claude-haiku-3.5": {
    provider: "anthropic",
    model: "claude-haiku-3.5",
    input_per_1k: 0.001,
    output_per_1k: 0.005,
    updatedAt: new Date(),
  },
  "gpt-4-turbo": {
    provider: "openai",
    model: "gpt-4-turbo",
    input_per_1k: 0.01,
    output_per_1k: 0.03,
    updatedAt: new Date(),
  },
  "gpt-4o": {
    provider: "openai",
    model: "gpt-4o",
    input_per_1k: 0.005,
    output_per_1k: 0.015,
    updatedAt: new Date(),
  },
  "nqh/qwen3-coder": {
    provider: "nqh", // remote Ollama server
    model: "qwen3-coder",
    input_per_1k: 0, // Free via company infrastructure
    output_per_1k: 0,
    updatedAt: new Date(),
  },
};

// ============================================================================
// Budget Status
// ============================================================================

/**
 * Budget status for a single scope (session, daily, track).
 */
export interface BudgetScope {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  thresholdLevel: "normal" | "warning" | "critical" | "limit";
}

/**
 * Complete budget status.
 */
export interface BudgetStatus {
  session: BudgetScope;
  daily: BudgetScope;
  tracks: Record<string, BudgetScope>;
  canProceed: boolean;
  warnings: string[];
}

// ============================================================================
// Budget Tracker
// ============================================================================

/**
 * BudgetTracker - Main budget tracking and enforcement.
 *
 * Responsibilities:
 * - Track costs across sessions, days, and tracks
 * - Enforce budget limits (session, daily, track)
 * - Trigger circuit breakers when limits approached
 * - Integrate with provider cost data
 * - Persist budget state to checkpoint
 */
export class BudgetTracker {
  private state: BudgetState;
  private config: BudgetConfig;
  private sessionCircuitBreaker: CircuitBreaker;
  private dailyCircuitBreaker: CircuitBreaker;
  private taskCircuitBreaker: CircuitBreaker;
  private notificationRateLimiter: NotificationRateLimiter;
  private pricing: Map<string, ModelPricing>;
  private eventListeners: Array<(event: BudgetEvent) => void> = [];
  private taskMetrics: Map<string, TaskMetrics> = new Map();

  constructor(config: BudgetConfig = DEFAULT_BUDGET_CONFIG) {
    this.config = config;
    this.state = createInitialBudgetState(config);
    this.pricing = new Map(Object.entries(DEFAULT_PRICING));

    // Create shared notification rate limiter
    this.notificationRateLimiter = new NotificationRateLimiter(
      config.notification.rate_limit,
    );

    // Create circuit breakers with shared rate limiter
    this.sessionCircuitBreaker = new CircuitBreaker(
      config.circuit_breakers,
      undefined,
      this.notificationRateLimiter,
    );
    this.dailyCircuitBreaker = new CircuitBreaker(
      config.circuit_breakers,
      undefined,
      this.notificationRateLimiter,
    );
    this.taskCircuitBreaker = new CircuitBreaker(
      config.circuit_breakers,
      undefined,
      this.notificationRateLimiter,
    );
  }

  // ==========================================================================
  // Core Tracking
  // ==========================================================================

  /**
   * Record token usage and update budget state.
   *
   * Per CTO guidance: Calls needsDailyReset() on every cost record.
   */
  async recordUsage(usage: TokenUsageRecord): Promise<BudgetAction> {
    // Check for daily reset FIRST (per CTO guidance)
    if (needsDailyReset(this.state)) {
      this.resetDaily();
    }

    // Calculate cost if not provided
    const cost =
      usage.cost > 0
        ? usage.cost
        : this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens);

    // Update usage record with calculated cost
    const recordWithCost: TokenUsageRecord = {
      ...usage,
      cost,
    };

    // Update session budget
    this.state.session.costSoFar += cost;

    // Update daily budget
    this.state.daily.costSoFar += cost;

    // Update track budget if applicable
    if (usage.trackId && this.state.tracks) {
      const track = this.state.tracks[usage.trackId];
      if (track) {
        track.costSoFar += cost;
      }
    }

    // Record in token usage history
    this.state.tokenUsage.push(recordWithCost);

    // Update historical data
    this.updateHistoricalData(recordWithCost);

    // Emit event
    const eventData: BudgetEvent["data"] = {
      cost,
      budgetType: "session",
      percentUsed: calculateBudgetPercentage(
        this.state.session.costSoFar,
        this.state.session.limit,
      ),
    };
    if (usage.taskId !== undefined) {
      eventData.sessionId = usage.taskId;
      eventData.taskId = usage.taskId;
    }
    this.emitEvent({
      type: "cost_recorded",
      timestamp: new Date(),
      data: eventData,
    });

    // Check limits and return action
    return this.evaluateBudgetAction();
  }

  /**
   * Estimate cost for a task before execution.
   */
  async estimateCost(
    context: TaskContext,
    model: string = "claude-sonnet-4",
  ): Promise<CostEstimate> {
    // Estimate input tokens
    const inputTokens = this.estimateInputTokens(context);

    // Estimate output tokens based on task type
    const taskType = context.taskType ?? "general";
    const outputTokens = await this.estimateOutputTokens(taskType, model);

    // Get model pricing
    const pricing = this.pricing.get(model) ?? FALLBACK_PRICING;

    // Calculate estimated cost
    const estimatedCost =
      (inputTokens / 1000) * pricing.input_per_1k +
      (outputTokens / 1000) * pricing.output_per_1k;

    // Calculate confidence based on historical data
    const historicalAvg = this.state.historical.avgCostPerTask[taskType];
    const confidence = this.calculateConfidence(estimatedCost, historicalAvg);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      taskType,
      estimatedCost,
      model,
    );

    const estimate: CostEstimate = {
      estimated_cost: estimatedCost,
      estimated_tokens: { input: inputTokens, output: outputTokens },
      confidence: confidence.level,
      confidence_score: confidence.score,
      breakdown: {
        model_cost: estimatedCost,
        tool_cost: 0,
        api_overhead: 0,
      },
    };
    if (historicalAvg !== undefined) {
      estimate.historical_avg = historicalAvg;
    }
    if (recommendation !== undefined) {
      estimate.recommendation = recommendation;
    }
    return estimate;
  }

  // ==========================================================================
  // Limit Checking
  // ==========================================================================

  /**
   * Check if a request can proceed based on budget and circuit breakers.
   */
  async canProceed(estimatedCost: number = 0): Promise<boolean> {
    // Check daily reset
    if (needsDailyReset(this.state)) {
      this.resetDaily();
    }

    // Check circuit breakers
    if (!this.sessionCircuitBreaker.canProceed()) {
      return false;
    }
    if (!this.dailyCircuitBreaker.canProceed()) {
      return false;
    }

    // Check if estimated cost would exceed limits
    const projectedSession = this.state.session.costSoFar + estimatedCost;
    const projectedDaily = this.state.daily.costSoFar + estimatedCost;

    if (projectedSession >= this.state.session.limit) {
      return false;
    }
    if (projectedDaily >= this.state.daily.limit) {
      return false;
    }

    return true;
  }

  /**
   * Get current budget status.
   */
  async getStatus(): Promise<BudgetStatus> {
    // Check daily reset
    if (needsDailyReset(this.state)) {
      this.resetDaily();
    }

    const sessionScope = this.createBudgetScope(
      this.state.session.costSoFar,
      this.state.session.limit,
    );
    const dailyScope = this.createBudgetScope(
      this.state.daily.costSoFar,
      this.state.daily.limit,
    );

    const tracks: Record<string, BudgetScope> = {};
    if (this.state.tracks) {
      for (const [trackId, track] of Object.entries(this.state.tracks)) {
        tracks[trackId] = this.createBudgetScope(track.costSoFar, track.limit);
      }
    }

    // Collect warnings
    const warnings: string[] = [];
    if (sessionScope.thresholdLevel === "warning") {
      warnings.push(
        `Session budget at ${sessionScope.percentage.toFixed(0)}%`,
      );
    } else if (sessionScope.thresholdLevel === "critical") {
      warnings.push(
        `Session budget at ${sessionScope.percentage.toFixed(0)}% (critical)`,
      );
    }
    if (dailyScope.thresholdLevel === "warning") {
      warnings.push(`Daily budget at ${dailyScope.percentage.toFixed(0)}%`);
    } else if (dailyScope.thresholdLevel === "critical") {
      warnings.push(
        `Daily budget at ${dailyScope.percentage.toFixed(0)}% (critical)`,
      );
    }

    const canProceed =
      sessionScope.thresholdLevel !== "limit" &&
      dailyScope.thresholdLevel !== "limit" &&
      this.sessionCircuitBreaker.canProceed() &&
      this.dailyCircuitBreaker.canProceed();

    return {
      session: sessionScope,
      daily: dailyScope,
      tracks,
      canProceed,
      warnings,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current budget state.
   */
  getState(): BudgetState {
    return { ...this.state };
  }

  /**
   * Restore budget state (e.g., from checkpoint).
   */
  async restoreState(state: BudgetState): Promise<void> {
    this.state = { ...state };

    // Check if daily reset is needed after restore
    if (needsDailyReset(this.state)) {
      this.resetDaily();
    }
  }

  /**
   * Restore from checkpoint CostState.
   *
   * Per CTO Day 5 guidance:
   * - Session costs must carry over on resume, not reset to zero
   * - A session that spent $1.80 cannot spend another $2.00 after resume
   */
  restoreFromCheckpoint(costState: CostState): void {
    // Restore session cost from checkpoint
    this.state.session.costSoFar = costState.sessionCostSoFar;

    // Restore token usage records if available
    if (costState.tokenUsage && costState.tokenUsage.length > 0) {
      // Convert checkpoint TokenUsageRecord to budget TokenUsageRecord
      for (const usage of costState.tokenUsage) {
        this.state.tokenUsage.push({
          timestamp: new Date(),
          model: usage.model,
          provider: this.getProviderForModel(usage.model),
          inputTokens: usage.input,
          outputTokens: usage.output,
          cost: usage.cost ?? 0,
        });
      }
    }

    // Emit restore event
    this.emitEvent({
      type: "budget_restored",
      timestamp: new Date(),
      data: {
        cost: costState.sessionCostSoFar,
        budgetType: "session",
        percentUsed: calculateBudgetPercentage(
          this.state.session.costSoFar,
          this.state.session.limit,
        ),
      },
    });

    // Check thresholds after restore
    if (
      isAtWarningThreshold(
        this.state.session.costSoFar,
        this.state.session.limit,
        this.config.warning_threshold,
      )
    ) {
      this.emitEvent({
        type: "threshold_warning",
        timestamp: new Date(),
        data: {
          budgetType: "session",
          percentUsed: calculateBudgetPercentage(
            this.state.session.costSoFar,
            this.state.session.limit,
          ),
        },
      });
    }
  }

  /**
   * Export current state to checkpoint CostState format.
   */
  toCostState(): CostState {
    const costState: CostState = {
      sessionCostSoFar: this.state.session.costSoFar,
      tokenUsage: this.state.tokenUsage.map((usage) => ({
        model: usage.model,
        input: usage.inputTokens,
        output: usage.outputTokens,
        cost: usage.cost,
      })),
    };
    // timeBudgetRemaining not tracked yet - omit from result
    return costState;
  }

  /**
   * Get provider for a model.
   */
  private getProviderForModel(model: string): string {
    const pricing = this.pricing.get(model);
    return pricing?.provider ?? "unknown";
  }

  /**
   * Get budget config.
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /**
   * Update budget config.
   */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };

    // Update limits in state
    if (config.per_session_limit !== undefined) {
      this.state.session.limit = config.per_session_limit;
    }
    if (config.daily_limit !== undefined) {
      this.state.daily.limit = config.daily_limit;
    }
  }

  // ==========================================================================
  // Task Metrics
  // ==========================================================================

  /**
   * Start tracking a task.
   */
  startTask(taskId: string): void {
    this.taskMetrics.set(taskId, createEmptyTaskMetrics());
  }

  /**
   * Record task retry.
   */
  recordTaskRetry(taskId: string): void {
    const metrics = this.taskMetrics.get(taskId);
    if (metrics) {
      metrics.retryCount++;
    }
  }

  /**
   * Record task cost.
   */
  recordTaskCost(taskId: string, cost: number): void {
    const metrics = this.taskMetrics.get(taskId);
    if (metrics) {
      metrics.costSoFar += cost;
    }
  }

  /**
   * Get task metrics.
   */
  getTaskMetrics(taskId: string): TaskMetrics | undefined {
    const metrics = this.taskMetrics.get(taskId);
    if (metrics) {
      // Update duration
      return {
        ...metrics,
        durationMs: Date.now() - metrics.startTime.getTime(),
      };
    }
    return undefined;
  }

  /**
   * Evaluate task against circuit breaker.
   */
  evaluateTask(taskId: string): { tripped: boolean; reason?: string } {
    const metrics = this.getTaskMetrics(taskId);
    if (!metrics) {
      return { tripped: false };
    }

    const result = this.taskCircuitBreaker.evaluate(metrics);
    if (result.status === "open" && result.reason) {
      return { tripped: true, reason: result.reason };
    }
    return { tripped: false };
  }

  /**
   * End task tracking.
   */
  endTask(taskId: string, success: boolean): void {
    if (success) {
      this.taskCircuitBreaker.recordSuccess();
    } else {
      this.taskCircuitBreaker.recordFailure();
    }
    this.taskMetrics.delete(taskId);
  }

  // ==========================================================================
  // Model Switching
  // ==========================================================================

  /**
   * Get fallback model when budget is low.
   */
  getFallbackModel(): string | undefined {
    const action = this.config.on_limit_reached;
    if (action.action === "switch_to_nqh" && action.fallback_model) {
      return action.fallback_model;
    }
    return undefined;
  }

  /**
   * Check if should switch to fallback model.
   */
  shouldSwitchToFallback(): boolean {
    const sessionPercent = calculateBudgetPercentage(
      this.state.session.costSoFar,
      this.state.session.limit,
    );
    const dailyPercent = calculateBudgetPercentage(
      this.state.daily.costSoFar,
      this.state.daily.limit,
    );

    // Switch if at or above critical threshold (80%)
    return sessionPercent >= 80 || dailyPercent >= 80;
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  /**
   * Check if notification can be sent.
   */
  canNotify(): boolean {
    return this.notificationRateLimiter.canSend();
  }

  /**
   * Record notification sent.
   */
  recordNotification(): void {
    this.notificationRateLimiter.recordSent();
  }

  /**
   * Get notification rate limiter.
   */
  getRateLimiter(): NotificationRateLimiter {
    return this.notificationRateLimiter;
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to budget events.
   */
  onEvent(listener: (event: BudgetEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index >= 0) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  // ==========================================================================
  // Circuit Breakers
  // ==========================================================================

  /**
   * Get session circuit breaker.
   */
  getSessionCircuitBreaker(): CircuitBreaker {
    return this.sessionCircuitBreaker;
  }

  /**
   * Get daily circuit breaker.
   */
  getDailyCircuitBreaker(): CircuitBreaker {
    return this.dailyCircuitBreaker;
  }

  /**
   * Get task circuit breaker.
   */
  getTaskCircuitBreaker(): CircuitBreaker {
    return this.taskCircuitBreaker;
  }

  /**
   * Reset all circuit breakers.
   */
  resetCircuitBreakers(): void {
    this.sessionCircuitBreaker.reset();
    this.dailyCircuitBreaker.reset();
    this.taskCircuitBreaker.reset();
  }

  // ==========================================================================
  // Pricing
  // ==========================================================================

  /**
   * Set model pricing.
   */
  setPricing(model: string, pricing: ModelPricing): void {
    this.pricing.set(model, pricing);
  }

  /**
   * Get model pricing.
   */
  getPricing(model: string): ModelPricing | undefined {
    return this.pricing.get(model);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Calculate cost based on model and tokens.
   */
  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const pricing = this.pricing.get(model);
    if (!pricing) {
      // Default to sonnet pricing if unknown model
      return (
        (inputTokens / 1000) * FALLBACK_PRICING.input_per_1k +
        (outputTokens / 1000) * FALLBACK_PRICING.output_per_1k
      );
    }

    return (
      (inputTokens / 1000) * pricing.input_per_1k +
      (outputTokens / 1000) * pricing.output_per_1k
    );
  }

  /**
   * Estimate input tokens from context.
   */
  private estimateInputTokens(context: TaskContext): number {
    let tokens = 0;

    // Base system prompt
    tokens += 500;

    // User prompt
    tokens += this.countTokens(context.prompt);

    // File context
    for (const file of context.files ?? []) {
      tokens += this.countTokens(file.content);
    }

    // Conversation history
    tokens += this.countTokens(context.conversationHistory ?? "");

    // Add 10% buffer
    return Math.ceil(tokens * 1.1);
  }

  /**
   * Estimate output tokens based on task type.
   */
  private async estimateOutputTokens(
    taskType: TaskType,
    model: string,
  ): Promise<number> {
    const base = BASE_OUTPUT_ESTIMATES[taskType] ?? 1000;

    // Adjust by historical data if available
    const historicalAvg =
      this.state.historical.avgCostPerModel[model];
    if (historicalAvg !== undefined) {
      // Use average of base and historical
      return Math.ceil((base + historicalAvg) / 2);
    }

    return base;
  }

  /**
   * Count tokens in text (simple estimation: ~4 chars per token).
   */
  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate confidence based on historical data.
   */
  private calculateConfidence(
    estimated: number,
    historical?: number,
  ): { level: ConfidenceLevel; score: number } {
    if (historical === undefined) {
      return { level: "low", score: 0.3 };
    }

    const variance = Math.abs(estimated - historical) / historical;

    if (variance < 0.2) {
      return { level: "high", score: 0.9 };
    } else if (variance < 0.5) {
      return { level: "medium", score: 0.7 };
    } else {
      return { level: "low", score: 0.4 };
    }
  }

  /**
   * Generate recommendation for cost savings.
   */
  private generateRecommendation(
    taskType: TaskType,
    cost: number,
    model: string,
  ): string | undefined {
    // Suggest cheaper alternatives for expensive tasks
    if (cost > 0.1 && model.includes("opus")) {
      return `Consider using Sonnet for this task (potentially 80% cheaper)`;
    }

    // Suggest Ollama for simple tasks
    if (taskType === "documentation" || taskType === "general") {
      return "Consider using NQH API (free) for this simple task";
    }

    return undefined;
  }

  /**
   * Update historical data with new usage.
   */
  private updateHistoricalData(usage: TokenUsageRecord): void {
    const taskType = usage.taskType ?? "general";

    // Update average cost per task type
    const currentAvg = this.state.historical.avgCostPerTask[taskType] ?? usage.cost;
    this.state.historical.avgCostPerTask[taskType] =
      (currentAvg + usage.cost) / 2;

    // Update average cost per model
    const modelAvg =
      this.state.historical.avgCostPerModel[usage.model] ?? usage.cost;
    this.state.historical.avgCostPerModel[usage.model] =
      (modelAvg + usage.cost) / 2;

    // Update total spent
    this.state.historical.totalSpent += usage.cost;
  }

  /**
   * Reset daily budget.
   */
  private resetDaily(): void {
    const now = new Date();
    const isoStr = now.toISOString();
    const todayStr = isoStr.substring(0, 10);
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);

    this.state.daily.costSoFar = 0;
    this.state.daily.date = todayStr;
    this.state.daily.resetAt = midnight;

    // Reset daily circuit breaker
    this.dailyCircuitBreaker.reset();

    // Emit event
    this.emitEvent({
      type: "daily_reset",
      timestamp: now,
      data: {},
    });
  }

  /**
   * Evaluate current budget and return appropriate action.
   */
  private evaluateBudgetAction(): BudgetAction {
    // Check session limit
    if (isLimitReached(this.state.session.costSoFar, this.state.session.limit)) {
      this.sessionCircuitBreaker.trip("max_cost_exceeded");

      this.emitEvent({
        type: "limit_reached",
        timestamp: new Date(),
        data: {
          budgetType: "session",
          percentUsed: 100,
        },
      });

      return this.createLimitReachedAction("session");
    }

    // Check daily limit
    if (isLimitReached(this.state.daily.costSoFar, this.state.daily.limit)) {
      this.dailyCircuitBreaker.trip("max_cost_exceeded");

      this.emitEvent({
        type: "limit_reached",
        timestamp: new Date(),
        data: {
          budgetType: "daily",
          percentUsed: 100,
        },
      });

      return this.createLimitReachedAction("daily");
    }

    // Check warning thresholds
    const sessionWarning = isAtWarningThreshold(
      this.state.session.costSoFar,
      this.state.session.limit,
      this.config.warning_threshold,
    );
    const dailyWarning = isAtWarningThreshold(
      this.state.daily.costSoFar,
      this.state.daily.limit,
      this.config.warning_threshold,
    );

    if (sessionWarning || dailyWarning) {
      const budgetType = sessionWarning ? "session" : "daily";
      const percentUsed = sessionWarning
        ? calculateBudgetPercentage(
            this.state.session.costSoFar,
            this.state.session.limit,
          )
        : calculateBudgetPercentage(
            this.state.daily.costSoFar,
            this.state.daily.limit,
          );

      this.emitEvent({
        type: "warning_triggered",
        timestamp: new Date(),
        data: {
          budgetType,
          percentUsed,
        },
      });
    }

    // Normal operation
    return {
      action: "continue",
      remainingBudget: {
        session: this.state.session.limit - this.state.session.costSoFar,
        daily: this.state.daily.limit - this.state.daily.costSoFar,
      },
    };
  }

  /**
   * Create action for limit reached.
   */
  private createLimitReachedAction(
    budgetType: "session" | "daily" | "track",
  ): BudgetAction {
    const action = this.config.on_limit_reached;

    switch (action.action) {
      case "pause_and_notify":
        return {
          action: "pause",
          reason: `${budgetType}_limit_reached`,
          remainingBudget: {
            session: Math.max(
              0,
              this.state.session.limit - this.state.session.costSoFar,
            ),
            daily: Math.max(
              0,
              this.state.daily.limit - this.state.daily.costSoFar,
            ),
          },
        };

      case "switch_to_nqh":
        return {
          action: "switch_model",
          model: action.fallback_model ?? "nqh/qwen3-coder",
          reason: `${budgetType}_limit_reached`,
          remainingBudget: {
            session: Math.max(
              0,
              this.state.session.limit - this.state.session.costSoFar,
            ),
            daily: Math.max(
              0,
              this.state.daily.limit - this.state.daily.costSoFar,
            ),
          },
        };

      case "fail_fast":
        return {
          action: "fail",
          reason: `${budgetType}_limit_reached`,
        };
    }
  }

  /**
   * Create budget scope from cost and limit.
   */
  private createBudgetScope(used: number, limit: number): BudgetScope {
    const percentage = calculateBudgetPercentage(used, limit);
    const remaining = Math.max(0, limit - used);

    let thresholdLevel: "normal" | "warning" | "critical" | "limit";
    if (percentage >= 100) {
      thresholdLevel = "limit";
    } else if (percentage >= 80) {
      thresholdLevel = "critical";
    } else if (percentage >= 50) {
      thresholdLevel = "warning";
    } else {
      thresholdLevel = "normal";
    }

    return { used, limit, remaining, percentage, thresholdLevel };
  }

  /**
   * Emit a budget event.
   */
  private emitEvent(event: BudgetEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a budget tracker with default config.
 */
export function createBudgetTracker(
  config?: Partial<BudgetConfig>,
): BudgetTracker {
  const fullConfig: BudgetConfig = {
    ...DEFAULT_BUDGET_CONFIG,
    ...config,
  };

  return new BudgetTracker(fullConfig);
}

/**
 * Get budget status from tracker.
 */
export async function getBudgetStatus(
  tracker: BudgetTracker,
): Promise<BudgetStatus> {
  return tracker.getStatus();
}

/**
 * Estimate cost using tracker.
 */
export async function estimateCost(
  tracker: BudgetTracker,
  context: TaskContext,
  model?: string,
): Promise<CostEstimate> {
  return tracker.estimateCost(context, model);
}
