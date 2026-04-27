/**
 * Budget Types Tests
 *
 * Unit tests for budget type definitions and utility functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Types
  type BudgetConfig,
  type BudgetState,
  type TokenUsageRecord,
  type CostEstimate,
  type BudgetAction,
  type CircuitBreakerResult,
  type TaskMetrics,
  type Notification,
  type ApprovalRequest,
  type ModelPricing,
  type BudgetEvent,
  // Constants
  DEFAULT_BUDGET_CONFIG,
  // Functions
  createInitialBudgetState,
  createEmptyTaskMetrics,
  needsDailyReset,
  calculateBudgetPercentage,
  isAtWarningThreshold,
  isLimitReached,
} from "../../src/budget/index.js";

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe("DEFAULT_BUDGET_CONFIG", () => {
  it("should have correct default budget limits", () => {
    expect(DEFAULT_BUDGET_CONFIG.daily_limit).toBe(10.0);
    expect(DEFAULT_BUDGET_CONFIG.per_session_limit).toBe(2.0);
    expect(DEFAULT_BUDGET_CONFIG.per_track_limit).toBe(0.5);
    expect(DEFAULT_BUDGET_CONFIG.warning_threshold).toBe(80);
  });

  it("should have correct limit action settings", () => {
    expect(DEFAULT_BUDGET_CONFIG.on_limit_reached.action).toBe(
      "pause_and_notify",
    );
    expect(DEFAULT_BUDGET_CONFIG.on_limit_reached.fallback_model).toBe(
      "self-hosted/qwen3-coder",
    );
    expect(DEFAULT_BUDGET_CONFIG.on_limit_reached.pause_duration).toBe(60000);
  });

  it("should have correct notification settings", () => {
    expect(DEFAULT_BUDGET_CONFIG.notification.channels).toEqual(["console"]);
    expect(DEFAULT_BUDGET_CONFIG.notification.rate_limit).toBe(4);
    expect(DEFAULT_BUDGET_CONFIG.notification.batch_window).toBe(300000);
    expect(DEFAULT_BUDGET_CONFIG.notification.priority_levels.warning).toBe(
      true,
    );
    expect(DEFAULT_BUDGET_CONFIG.notification.priority_levels.limit).toBe(true);
    expect(DEFAULT_BUDGET_CONFIG.notification.priority_levels.breach).toBe(
      true,
    );
  });

  it("should have correct circuit breaker settings", () => {
    expect(DEFAULT_BUDGET_CONFIG.circuit_breakers.enabled).toBe(true);
    expect(DEFAULT_BUDGET_CONFIG.circuit_breakers.max_retry_per_task).toBe(3);
    expect(DEFAULT_BUDGET_CONFIG.circuit_breakers.max_cost_per_task).toBe(0.5);
    expect(DEFAULT_BUDGET_CONFIG.circuit_breakers.max_duration_per_task).toBe(
      300000,
    );
    expect(DEFAULT_BUDGET_CONFIG.circuit_breakers.escalate_on_breach).toBe(
      true,
    );
  });

  it("should have correct estimation settings", () => {
    expect(DEFAULT_BUDGET_CONFIG.estimation.enabled).toBe(true);
    expect(DEFAULT_BUDGET_CONFIG.estimation.require_approval_above).toBe(1.0);
    expect(DEFAULT_BUDGET_CONFIG.estimation.confidence_threshold).toBe(0.7);
  });
});

// ============================================================================
// createInitialBudgetState Tests
// ============================================================================

describe("createInitialBudgetState", () => {
  it("should create initial budget state with correct session settings", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(state.session.costSoFar).toBe(0);
    expect(state.session.limit).toBe(2.0);
    expect(state.session.startTime).toBeInstanceOf(Date);
  });

  it("should create initial budget state with correct daily settings", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(state.daily.costSoFar).toBe(0);
    expect(state.daily.limit).toBe(10.0);
    expect(state.daily.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.daily.resetAt).toBeInstanceOf(Date);
  });

  it("should create initial budget state with empty token usage", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(state.tokenUsage).toEqual([]);
  });

  it("should create initial budget state with empty historical data", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(state.historical.avgCostPerTask).toEqual({});
    expect(state.historical.avgCostPerModel).toEqual({});
    expect(state.historical.totalSpent).toBe(0);
  });

  it("should use custom config limits", () => {
    const customConfig: BudgetConfig = {
      ...DEFAULT_BUDGET_CONFIG,
      daily_limit: 20.0,
      per_session_limit: 5.0,
    };

    const state = createInitialBudgetState(customConfig);

    expect(state.session.limit).toBe(5.0);
    expect(state.daily.limit).toBe(20.0);
  });

  it("should set tracks to undefined initially", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(state.tracks).toBeUndefined();
  });

  it("should set daily resetAt to next midnight UTC", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    // Reset time should be after now
    expect(state.daily.resetAt.getTime()).toBeGreaterThan(Date.now());
    // Reset time should be at midnight (hours = 0)
    expect(state.daily.resetAt.getUTCHours()).toBe(0);
    expect(state.daily.resetAt.getUTCMinutes()).toBe(0);
    expect(state.daily.resetAt.getUTCSeconds()).toBe(0);
  });
});

// ============================================================================
// createEmptyTaskMetrics Tests
// ============================================================================

describe("createEmptyTaskMetrics", () => {
  it("should create empty task metrics with zero values", () => {
    const metrics = createEmptyTaskMetrics();

    expect(metrics.retryCount).toBe(0);
    expect(metrics.costSoFar).toBe(0);
    expect(metrics.durationMs).toBe(0);
  });

  it("should set startTime to current time", () => {
    const before = Date.now();
    const metrics = createEmptyTaskMetrics();
    const after = Date.now();

    expect(metrics.startTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(metrics.startTime.getTime()).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// needsDailyReset Tests
// ============================================================================

describe("needsDailyReset", () => {
  it("should return false when date matches today", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);

    expect(needsDailyReset(state)).toBe(false);
  });

  it("should return true when date is yesterday", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.daily.date = yesterday.toISOString().split("T")[0];

    expect(needsDailyReset(state)).toBe(true);
  });

  it("should return true when date is last week", () => {
    const state = createInitialBudgetState(DEFAULT_BUDGET_CONFIG);
    state.daily.date = "2020-01-01";

    expect(needsDailyReset(state)).toBe(true);
  });
});

// ============================================================================
// calculateBudgetPercentage Tests
// ============================================================================

describe("calculateBudgetPercentage", () => {
  it("should return 0% when no cost incurred", () => {
    expect(calculateBudgetPercentage(0, 10)).toBe(0);
  });

  it("should return 50% when half budget used", () => {
    expect(calculateBudgetPercentage(5, 10)).toBe(50);
  });

  it("should return 100% when budget fully used", () => {
    expect(calculateBudgetPercentage(10, 10)).toBe(100);
  });

  it("should cap at 100% when over budget", () => {
    expect(calculateBudgetPercentage(15, 10)).toBe(100);
  });

  it("should return 100% when limit is zero", () => {
    expect(calculateBudgetPercentage(5, 0)).toBe(100);
  });

  it("should return 100% when limit is negative", () => {
    expect(calculateBudgetPercentage(5, -1)).toBe(100);
  });

  it("should handle fractional percentages", () => {
    expect(calculateBudgetPercentage(1, 3)).toBeCloseTo(33.33, 1);
  });
});

// ============================================================================
// isAtWarningThreshold Tests
// ============================================================================

describe("isAtWarningThreshold", () => {
  it("should return false when below warning threshold", () => {
    expect(isAtWarningThreshold(7, 10, 80)).toBe(false);
  });

  it("should return true at exactly warning threshold", () => {
    expect(isAtWarningThreshold(8, 10, 80)).toBe(true);
  });

  it("should return true when above warning but below limit", () => {
    expect(isAtWarningThreshold(9, 10, 80)).toBe(true);
  });

  it("should return false when at limit", () => {
    expect(isAtWarningThreshold(10, 10, 80)).toBe(false);
  });

  it("should return false when over limit", () => {
    expect(isAtWarningThreshold(15, 10, 80)).toBe(false);
  });

  it("should work with custom warning thresholds", () => {
    expect(isAtWarningThreshold(5, 10, 50)).toBe(true);
    expect(isAtWarningThreshold(4, 10, 50)).toBe(false);
  });
});

// ============================================================================
// isLimitReached Tests
// ============================================================================

describe("isLimitReached", () => {
  it("should return false when below limit", () => {
    expect(isLimitReached(9, 10)).toBe(false);
  });

  it("should return true at exactly limit", () => {
    expect(isLimitReached(10, 10)).toBe(true);
  });

  it("should return true when over limit", () => {
    expect(isLimitReached(15, 10)).toBe(true);
  });

  it("should return false when zero cost", () => {
    expect(isLimitReached(0, 10)).toBe(false);
  });
});

// ============================================================================
// Type Structure Tests
// ============================================================================

describe("TokenUsageRecord type", () => {
  it("should accept valid token usage record", () => {
    const record: TokenUsageRecord = {
      timestamp: new Date(),
      model: "claude-opus-4",
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.05,
      taskType: "code_implementation",
      taskId: "task-001",
      trackId: "track-001",
    };

    expect(record.model).toBe("claude-opus-4");
    expect(record.cost).toBe(0.05);
  });

  it("should allow optional fields to be undefined", () => {
    const record: TokenUsageRecord = {
      timestamp: new Date(),
      model: "gpt-4",
      provider: "openai",
      inputTokens: 500,
      outputTokens: 250,
      cost: 0.03,
    };

    expect(record.taskType).toBeUndefined();
    expect(record.taskId).toBeUndefined();
    expect(record.trackId).toBeUndefined();
  });
});

describe("CostEstimate type", () => {
  it("should accept valid cost estimate", () => {
    const estimate: CostEstimate = {
      estimated_cost: 0.15,
      estimated_tokens: { input: 2000, output: 1000 },
      confidence: "high",
      confidence_score: 0.9,
      historical_avg: 0.12,
      breakdown: {
        model_cost: 0.15,
        tool_cost: 0,
        api_overhead: 0,
      },
      recommendation: "Consider using Haiku for lower cost",
    };

    expect(estimate.confidence).toBe("high");
    expect(estimate.estimated_tokens.input).toBe(2000);
  });

  it("should accept minimal cost estimate", () => {
    const estimate: CostEstimate = {
      estimated_cost: 0.05,
      estimated_tokens: { input: 500, output: 200 },
      confidence: "low",
      confidence_score: 0.3,
    };

    expect(estimate.historical_avg).toBeUndefined();
    expect(estimate.breakdown).toBeUndefined();
    expect(estimate.recommendation).toBeUndefined();
  });
});

describe("BudgetAction type", () => {
  it("should accept continue action", () => {
    const action: BudgetAction = {
      action: "continue",
      remainingBudget: { session: 1.5, daily: 8.0 },
    };

    expect(action.action).toBe("continue");
  });

  it("should accept pause action with reason", () => {
    const action: BudgetAction = {
      action: "pause",
      reason: "session_limit_reached",
    };

    expect(action.action).toBe("pause");
    expect(action.reason).toBe("session_limit_reached");
  });

  it("should accept switch_model action with model", () => {
    const action: BudgetAction = {
      action: "switch_model",
      model: "self-hosted/qwen3-coder",
      reason: "budget_exhausted",
    };

    expect(action.model).toBe("self-hosted/qwen3-coder");
  });

  it("should accept escalate action with approval ID", () => {
    const action: BudgetAction = {
      action: "escalate",
      approvalId: "approval-001",
      reason: "expensive_task",
    };

    expect(action.approvalId).toBe("approval-001");
  });
});

describe("CircuitBreakerResult type", () => {
  it("should accept closed circuit breaker", () => {
    const result: CircuitBreakerResult = {
      status: "closed",
      escalate: false,
      metrics: {
        retryCount: 1,
        costSoFar: 0.02,
        durationMs: 5000,
        startTime: new Date(),
      },
    };

    expect(result.status).toBe("closed");
    expect(result.reason).toBeUndefined();
  });

  it("should accept open circuit breaker with reason", () => {
    const result: CircuitBreakerResult = {
      status: "open",
      reason: "max_retry_exceeded",
      escalate: true,
      metrics: {
        retryCount: 3,
        costSoFar: 0.10,
        durationMs: 30000,
        startTime: new Date(),
      },
    };

    expect(result.status).toBe("open");
    expect(result.reason).toBe("max_retry_exceeded");
    expect(result.escalate).toBe(true);
  });
});

describe("Notification type", () => {
  it("should accept budget warning notification", () => {
    const notification: Notification = {
      type: "budget_warning",
      priority: "medium",
      message: "Budget warning: 80% of session limit reached",
      details: {
        current: "$1.60",
        limit: "$2.00",
        remaining: "$0.40",
        percent: "80%",
      },
    };

    expect(notification.type).toBe("budget_warning");
    expect(notification.priority).toBe("medium");
  });

  it("should accept budget limit notification with options", () => {
    const notification: Notification = {
      type: "budget_limit",
      priority: "high",
      message: "Session budget limit reached: $2.00",
      options: {
        continue_with_approval: "Increase budget and continue",
        switch_to_self_hosted: "Switch to free local model",
        stop: "Stop execution and review",
      },
    };

    expect(notification.options).toBeDefined();
    expect(Object.keys(notification.options!)).toHaveLength(3);
  });
});

describe("ApprovalRequest type", () => {
  it("should accept pending approval request", () => {
    const request: ApprovalRequest = {
      id: "approval-001",
      type: "expensive_task",
      message: "Task estimated to cost $1.50, exceeds $1.00 threshold",
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      costEstimate: {
        estimated_cost: 1.5,
        estimated_tokens: { input: 5000, output: 3000 },
        confidence: "medium",
        confidence_score: 0.7,
      },
    };

    expect(request.status).toBe("pending");
    expect(request.resolvedAt).toBeUndefined();
  });

  it("should accept approved request with resolution", () => {
    const request: ApprovalRequest = {
      id: "approval-002",
      type: "budget_increase",
      message: "Request to increase session budget to $5.00",
      status: "approved",
      createdAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() + 3600000),
      resolvedAt: new Date(),
      notes: "Approved for this sprint",
      requestedAmount: 5.0,
    };

    expect(request.status).toBe("approved");
    expect(request.resolvedAt).toBeDefined();
    expect(request.notes).toBe("Approved for this sprint");
  });
});

describe("ModelPricing type", () => {
  it("should accept Anthropic pricing", () => {
    const pricing: ModelPricing = {
      provider: "anthropic",
      model: "claude-opus-4",
      input_per_1k: 0.015,
      output_per_1k: 0.075,
      updatedAt: new Date(),
    };

    expect(pricing.input_per_1k).toBe(0.015);
    expect(pricing.output_per_1k).toBe(0.075);
  });

  it("should accept OpenAI pricing", () => {
    const pricing: ModelPricing = {
      provider: "openai",
      model: "gpt-4-turbo",
      input_per_1k: 0.01,
      output_per_1k: 0.03,
      updatedAt: new Date(),
    };

    expect(pricing.provider).toBe("openai");
  });
});

describe("BudgetEvent type", () => {
  it("should accept cost_recorded event", () => {
    const event: BudgetEvent = {
      type: "cost_recorded",
      timestamp: new Date(),
      data: {
        sessionId: "session-001",
        taskId: "task-001",
        cost: 0.05,
        budgetType: "session",
        percentUsed: 25,
      },
    };

    expect(event.type).toBe("cost_recorded");
    expect(event.data.cost).toBe(0.05);
  });

  it("should accept circuit_breaker_tripped event", () => {
    const event: BudgetEvent = {
      type: "circuit_breaker_tripped",
      timestamp: new Date(),
      data: {
        taskId: "task-001",
        action: "escalate",
        details: {
          reason: "max_retry_exceeded",
          retryCount: 3,
        },
      },
    };

    expect(event.type).toBe("circuit_breaker_tripped");
    expect(event.data.action).toBe("escalate");
  });
});
