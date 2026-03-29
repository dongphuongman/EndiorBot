/**
 * Tests for ConversationLimits — 8 loop guard limits.
 *
 * @module tests/agents/resilience/conversation-limits
 * @sprint 121 — Track 1
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ConversationLimits,
  DEFAULT_MAX_MESSAGES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_TIMEOUT_MINUTES,
  DEFAULT_MAX_DIFF_SIZE,
  DEFAULT_MAX_RETRIES_PER_STEP,
  DEFAULT_MAX_DELEGATION_DEPTH,
  DEFAULT_MAX_BUDGET_CENTS,
  getConversationLimits,
  resetConversationLimits,
  type ConversationLimitsConfig,
  type ConversationState,
  type LimitViolation,
} from "../../../src/agents/resilience/conversation-limits.js";

// ============================================================================
// Constants
// ============================================================================

describe("default constants", () => {
  it("DEFAULT_MAX_MESSAGES is 50", () => {
    expect(DEFAULT_MAX_MESSAGES).toBe(50);
  });

  it("DEFAULT_MAX_TOKENS is 100_000", () => {
    expect(DEFAULT_MAX_TOKENS).toBe(100_000);
  });

  it("DEFAULT_MAX_TOOL_CALLS is 20", () => {
    expect(DEFAULT_MAX_TOOL_CALLS).toBe(20);
  });

  it("DEFAULT_TIMEOUT_MINUTES is 30", () => {
    expect(DEFAULT_TIMEOUT_MINUTES).toBe(30);
  });

  it("DEFAULT_MAX_DIFF_SIZE is 10_000", () => {
    expect(DEFAULT_MAX_DIFF_SIZE).toBe(10_000);
  });

  it("DEFAULT_MAX_RETRIES_PER_STEP is 3", () => {
    expect(DEFAULT_MAX_RETRIES_PER_STEP).toBe(3);
  });

  it("DEFAULT_MAX_DELEGATION_DEPTH is 1", () => {
    expect(DEFAULT_MAX_DELEGATION_DEPTH).toBe(1);
  });

  it("DEFAULT_MAX_BUDGET_CENTS is 1000", () => {
    expect(DEFAULT_MAX_BUDGET_CENTS).toBe(1000);
  });
});

// ============================================================================
// Constructor
// ============================================================================

describe("ConversationLimits constructor", () => {
  it("uses defaults when no config provided", () => {
    const limits = new ConversationLimits();
    expect(limits.maxMessages).toBe(DEFAULT_MAX_MESSAGES);
    expect(limits.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    expect(limits.maxToolCalls).toBe(DEFAULT_MAX_TOOL_CALLS);
    expect(limits.timeoutMinutes).toBe(DEFAULT_TIMEOUT_MINUTES);
    expect(limits.maxDiffSize).toBe(DEFAULT_MAX_DIFF_SIZE);
    expect(limits.maxRetriesPerStep).toBe(DEFAULT_MAX_RETRIES_PER_STEP);
    expect(limits.maxDelegationDepth).toBe(DEFAULT_MAX_DELEGATION_DEPTH);
    expect(limits.maxBudgetCents).toBe(DEFAULT_MAX_BUDGET_CENTS);
  });

  it("overrides specific values from config", () => {
    const limits = new ConversationLimits({
      maxMessages: 10,
      maxBudgetCents: 500,
    });
    expect(limits.maxMessages).toBe(10);
    expect(limits.maxBudgetCents).toBe(500);
    // Others remain default
    expect(limits.maxTokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("accepts empty config object", () => {
    const limits = new ConversationLimits({});
    expect(limits.maxMessages).toBe(DEFAULT_MAX_MESSAGES);
  });
});

// ============================================================================
// Individual Check Methods
// ============================================================================

describe("checkMessages", () => {
  const limits = new ConversationLimits({ maxMessages: 10 });

  it("returns undefined when under limit", () => {
    expect(limits.checkMessages(5)).toBeUndefined();
  });

  it("returns undefined at limit - 1", () => {
    expect(limits.checkMessages(9)).toBeUndefined();
  });

  it("returns 'max_messages' at exact limit", () => {
    expect(limits.checkMessages(10)).toBe("max_messages");
  });

  it("returns 'max_messages' when over limit", () => {
    expect(limits.checkMessages(15)).toBe("max_messages");
  });

  it("returns undefined for 0 messages", () => {
    expect(limits.checkMessages(0)).toBeUndefined();
  });
});

describe("checkTokens", () => {
  const limits = new ConversationLimits({ maxTokens: 1000 });

  it("returns undefined when under limit", () => {
    expect(limits.checkTokens(500)).toBeUndefined();
  });

  it("returns 'max_tokens' at exact limit", () => {
    expect(limits.checkTokens(1000)).toBe("max_tokens");
  });
});

describe("checkToolCalls", () => {
  const limits = new ConversationLimits({ maxToolCalls: 5 });

  it("returns undefined when under limit", () => {
    expect(limits.checkToolCalls(3)).toBeUndefined();
  });

  it("returns 'max_tool_calls' at exact limit", () => {
    expect(limits.checkToolCalls(5)).toBe("max_tool_calls");
  });
});

describe("checkDiffSize", () => {
  const limits = new ConversationLimits({ maxDiffSize: 100 });

  it("returns undefined when under limit", () => {
    expect(limits.checkDiffSize(50)).toBeUndefined();
  });

  it("returns 'max_diff_size' at exact limit", () => {
    expect(limits.checkDiffSize(100)).toBe("max_diff_size");
  });
});

describe("checkRetries", () => {
  const limits = new ConversationLimits({ maxRetriesPerStep: 3 });

  it("returns undefined when under limit", () => {
    expect(limits.checkRetries(2)).toBeUndefined();
  });

  it("returns 'max_retries_per_step' at exact limit", () => {
    expect(limits.checkRetries(3)).toBe("max_retries_per_step");
  });
});

describe("checkDelegationDepth", () => {
  const limits = new ConversationLimits({ maxDelegationDepth: 2 });

  it("returns undefined when under limit", () => {
    expect(limits.checkDelegationDepth(1)).toBeUndefined();
  });

  it("returns 'max_delegation_depth' at exact limit", () => {
    expect(limits.checkDelegationDepth(2)).toBe("max_delegation_depth");
  });

  it("uses agentMaxDepth override when provided", () => {
    expect(limits.checkDelegationDepth(1, 1)).toBe("max_delegation_depth");
  });

  it("agentMaxDepth=3 allows depth 2", () => {
    expect(limits.checkDelegationDepth(2, 3)).toBeUndefined();
  });

  it("falls back to instance maxDelegationDepth when no override", () => {
    expect(limits.checkDelegationDepth(2)).toBe("max_delegation_depth");
    expect(limits.checkDelegationDepth(1)).toBeUndefined();
  });
});

describe("checkBudget", () => {
  const limits = new ConversationLimits({ maxBudgetCents: 100 });

  it("returns undefined when under budget", () => {
    expect(limits.checkBudget(50)).toBeUndefined();
  });

  it("returns 'budget_exceeded' at exact limit", () => {
    expect(limits.checkBudget(100)).toBe("budget_exceeded");
  });

  it("returns 'budget_exceeded' when over budget", () => {
    expect(limits.checkBudget(200)).toBe("budget_exceeded");
  });
});

// ============================================================================
// checkAll
// ============================================================================

describe("checkAll", () => {
  it("returns undefined when all within limits", () => {
    const limits = new ConversationLimits();
    const state: ConversationState = {
      totalMessages: 5,
      totalTokens: 1000,
      toolCallCount: 2,
      diffLines: 50,
      failedCount: 0,
      delegationDepth: 0,
      currentCostCents: 10,
    };
    expect(limits.checkAll(state)).toBeUndefined();
  });

  it("returns undefined for empty state (all defaults to 0)", () => {
    const limits = new ConversationLimits();
    expect(limits.checkAll({})).toBeUndefined();
    expect(limits.checkAll()).toBeUndefined();
  });

  it("returns first violation in priority order (budget first)", () => {
    const limits = new ConversationLimits({
      maxMessages: 5,
      maxBudgetCents: 10,
    });
    const state: ConversationState = {
      totalMessages: 10, // exceeded
      currentCostCents: 20, // exceeded
    };
    // Budget is checked before messages in priority order
    expect(limits.checkAll(state)).toBe("budget_exceeded");
  });

  it("returns message violation when only messages exceeded", () => {
    const limits = new ConversationLimits({ maxMessages: 5 });
    expect(limits.checkAll({ totalMessages: 5 })).toBe("max_messages");
  });

  it("returns token violation when only tokens exceeded", () => {
    const limits = new ConversationLimits({ maxTokens: 100 });
    expect(limits.checkAll({ totalTokens: 100 })).toBe("max_tokens");
  });

  it("returns retry violation when only retries exceeded", () => {
    const limits = new ConversationLimits({ maxRetriesPerStep: 2 });
    expect(limits.checkAll({ failedCount: 2 })).toBe("max_retries_per_step");
  });
});

// ============================================================================
// describeViolation
// ============================================================================

describe("describeViolation", () => {
  it.each<[LimitViolation, string]>([
    ["max_messages", "Message limit reached: 50/50"],
    ["max_tokens", "Token limit reached: 100000/100000"],
    ["max_tool_calls", "Tool call limit reached: 20/20"],
    ["timeout_minutes", "Session timeout: 30 minutes"],
    ["max_diff_size", "Diff size limit: 10000/10000 lines"],
    ["max_retries_per_step", "Retry limit reached: 3/3 (dead-letter)"],
    ["max_delegation_depth", "Delegation depth exceeded: 2/2"],
    ["budget_exceeded", "Budget exceeded: 1000/1000 cents"],
  ])("describes %s correctly", (violation, expected) => {
    const current = parseInt(expected.match(/(\d+)/)?.[1] ?? "0");
    const max = parseInt(expected.match(/\/(\d+)/)?.[1] ?? expected.match(/(\d+)/)?.[1] ?? "0");
    const result = ConversationLimits.describeViolation(violation, current, max);
    expect(result).toBe(expected);
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe("singleton", () => {
  beforeEach(() => {
    resetConversationLimits();
  });

  it("getConversationLimits returns same instance on repeated calls", () => {
    const a = getConversationLimits();
    const b = getConversationLimits();
    expect(a).toBe(b);
  });

  it("getConversationLimits accepts config on first call", () => {
    const limits = getConversationLimits({ maxMessages: 99 });
    expect(limits.maxMessages).toBe(99);
  });

  it("resetConversationLimits clears the singleton", () => {
    const a = getConversationLimits({ maxMessages: 99 });
    resetConversationLimits();
    const b = getConversationLimits({ maxMessages: 42 });
    expect(a).not.toBe(b);
    expect(b.maxMessages).toBe(42);
  });

  it("second call ignores config (singleton already created)", () => {
    const a = getConversationLimits({ maxMessages: 99 });
    const b = getConversationLimits({ maxMessages: 42 });
    expect(b.maxMessages).toBe(99);
  });
});
