/**
 * Tests for ConversationTracker — lifecycle, limits, budget, parent-child.
 *
 * @module tests/agents/resilience/conversation-tracker
 * @sprint 121 — Track 1
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ConversationTracker,
  ConversationNotFoundError,
  ConversationInactiveError,
  LimitExceededError,
  DelegationDepthError,
  getConversationTracker,
  resetConversationTracker,
  type ConversationRecord,
  type ConversationStatus,
} from "../../../src/agents/resilience/conversation-tracker.js";

let tracker: ConversationTracker;

beforeEach(() => {
  tracker = new ConversationTracker();
  resetConversationTracker();
});

// ============================================================================
// create
// ============================================================================

describe("create", () => {
  it("creates conversation with active status", () => {
    const record = tracker.create();
    expect(record.status).toBe("active");
    expect(record.id).toMatch(/^conv_/);
  });

  it("initializes all counters to zero", () => {
    const record = tracker.create();
    expect(record.totalMessages).toBe(0);
    expect(record.totalTokens).toBe(0);
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.currentCostCents).toBe(0);
  });

  it("sets startedAt timestamp", () => {
    const record = tracker.create();
    expect(record.startedAt).toBeDefined();
    expect(() => new Date(record.startedAt)).not.toThrow();
  });

  it("completedAt is undefined on creation", () => {
    const record = tracker.create();
    expect(record.completedAt).toBeUndefined();
  });

  it("delegationDepth is 0 for root conversation", () => {
    const record = tracker.create();
    expect(record.delegationDepth).toBe(0);
  });

  it("stores limits from config", () => {
    const record = tracker.create({ limits: { maxMessages: 10 } });
    expect(record.limits.maxMessages).toBe(10);
  });

  it("stores metadata", () => {
    const record = tracker.create({ metadata: { agent: "coder" } });
    expect(record.metadata["agent"]).toBe("coder");
  });

  it("defaults metadata to empty object", () => {
    const record = tracker.create();
    expect(record.metadata).toEqual({});
  });
});

// ============================================================================
// Parent-child delegation
// ============================================================================

describe("parent-child delegation", () => {
  it("child inherits delegation depth + 1", () => {
    const parent = tracker.create();
    const child = tracker.create({
      parentId: parent.id,
      limits: { maxDelegationDepth: 2 },
    });
    expect(child.delegationDepth).toBe(1);
    expect(child.parentId).toBe(parent.id);
  });

  it("throws DelegationDepthError when exceeding max depth", () => {
    const parent = tracker.create();
    const child = tracker.create({
      parentId: parent.id,
      limits: { maxDelegationDepth: 3 },
    });
    const grandchild = tracker.create({
      parentId: child.id,
      limits: { maxDelegationDepth: 3 },
    });
    // grandchild depth=2, great-grandchild would be depth=3 > maxDepth=2
    expect(() =>
      tracker.create({
        parentId: grandchild.id,
        limits: { maxDelegationDepth: 2 },
      }),
    ).toThrow(DelegationDepthError);
  });

  it("throws DelegationDepthError when child depth > maxDelegationDepth", () => {
    const parent = tracker.create();
    const child = tracker.create({
      parentId: parent.id,
      limits: { maxDelegationDepth: 2 },
    });
    // child depth=1, grandchild depth=2, 2 > 1 → throws
    expect(() =>
      tracker.create({
        parentId: child.id,
        limits: { maxDelegationDepth: 1 },
      }),
    ).toThrow(DelegationDepthError);
  });

  it("throws ConversationNotFoundError for invalid parentId", () => {
    expect(() =>
      tracker.create({ parentId: "nonexistent" }),
    ).toThrow(ConversationNotFoundError);
  });
});

// ============================================================================
// get / getActive
// ============================================================================

describe("get", () => {
  it("returns the created conversation", () => {
    const created = tracker.create();
    const fetched = tracker.get(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it("throws ConversationNotFoundError for unknown id", () => {
    expect(() => tracker.get("unknown-id")).toThrow(ConversationNotFoundError);
  });
});

describe("getActive", () => {
  it("returns active conversation", () => {
    const record = tracker.create();
    const active = tracker.getActive(record.id);
    expect(active.status).toBe("active");
  });

  it("throws ConversationInactiveError for completed conversation", () => {
    const record = tracker.create();
    tracker.complete(record.id);
    expect(() => tracker.getActive(record.id)).toThrow(ConversationInactiveError);
  });

  it("throws ConversationInactiveError for errored conversation", () => {
    const record = tracker.create();
    tracker.error(record.id);
    expect(() => tracker.getActive(record.id)).toThrow(ConversationInactiveError);
  });
});

// ============================================================================
// checkLimits
// ============================================================================

describe("checkLimits", () => {
  it("does not throw when within limits", () => {
    const record = tracker.create({ limits: { maxMessages: 10 } });
    expect(() => tracker.checkLimits(record.id)).not.toThrow();
  });

  it("throws LimitExceededError when messages exceeded", () => {
    const record = tracker.create({ limits: { maxMessages: 2 } });
    tracker.incrementMessageCount(record.id);
    tracker.incrementMessageCount(record.id);
    expect(() => tracker.checkLimits(record.id)).toThrow(LimitExceededError);
  });

  it("sets status to max_reached on message violation", () => {
    const record = tracker.create({ limits: { maxMessages: 1 } });
    tracker.incrementMessageCount(record.id);
    try {
      tracker.checkLimits(record.id);
    } catch {
      // expected
    }
    expect(tracker.get(record.id).status).toBe("max_reached");
  });

  it("throws LimitExceededError when budget exceeded", () => {
    const record = tracker.create({ limits: { maxBudgetCents: 10 } });
    tracker.recordTokenUsage(record.id, {
      inputTokens: 100,
      outputTokens: 50,
      costCents: 15,
    });
    expect(() => tracker.checkLimits(record.id)).toThrow(LimitExceededError);
  });

  it("throws LimitExceededError when tokens exceeded", () => {
    const record = tracker.create({ limits: { maxTokens: 100 } });
    tracker.recordTokenUsage(record.id, {
      inputTokens: 60,
      outputTokens: 50,
      costCents: 0,
    });
    expect(() => tracker.checkLimits(record.id)).toThrow(LimitExceededError);
  });

  it("LimitExceededError has violation property", () => {
    const record = tracker.create({ limits: { maxMessages: 1 } });
    tracker.incrementMessageCount(record.id);
    try {
      tracker.checkLimits(record.id);
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LimitExceededError);
      expect((e as LimitExceededError).violation).toBe("max_messages");
    }
  });
});

// ============================================================================
// incrementMessageCount / recordTokenUsage
// ============================================================================

describe("incrementMessageCount", () => {
  it("increments by 1 and returns new count", () => {
    const record = tracker.create();
    expect(tracker.incrementMessageCount(record.id)).toBe(1);
    expect(tracker.incrementMessageCount(record.id)).toBe(2);
    expect(tracker.incrementMessageCount(record.id)).toBe(3);
  });
});

describe("recordTokenUsage", () => {
  it("accumulates token counts and cost", () => {
    const record = tracker.create();
    tracker.recordTokenUsage(record.id, {
      inputTokens: 100,
      outputTokens: 50,
      costCents: 5,
    });
    tracker.recordTokenUsage(record.id, {
      inputTokens: 200,
      outputTokens: 100,
      costCents: 10,
    });
    const updated = tracker.get(record.id);
    expect(updated.inputTokens).toBe(300);
    expect(updated.outputTokens).toBe(150);
    expect(updated.totalTokens).toBe(450);
    expect(updated.currentCostCents).toBe(15);
  });
});

// ============================================================================
// Lifecycle: complete, error, pause, resume
// ============================================================================

describe("complete", () => {
  it("sets status to completed", () => {
    const record = tracker.create();
    const completed = tracker.complete(record.id);
    expect(completed.status).toBe("completed");
  });

  it("sets completedAt timestamp", () => {
    const record = tracker.create();
    tracker.complete(record.id);
    expect(tracker.get(record.id).completedAt).toBeDefined();
  });
});

describe("error", () => {
  it("sets status to error", () => {
    const record = tracker.create();
    const errored = tracker.error(record.id);
    expect(errored.status).toBe("error");
  });

  it("stores error detail in metadata (truncated to 2000 chars)", () => {
    const record = tracker.create();
    const longError = "x".repeat(3000);
    tracker.error(record.id, longError);
    const metadata = tracker.get(record.id).metadata;
    expect((metadata["last_error"] as string).length).toBe(2000);
  });

  it("sets completedAt on error", () => {
    const record = tracker.create();
    tracker.error(record.id);
    expect(tracker.get(record.id).completedAt).toBeDefined();
  });

  it("works without errorDetail", () => {
    const record = tracker.create();
    const errored = tracker.error(record.id);
    expect(errored.status).toBe("error");
    expect(errored.metadata["last_error"]).toBeUndefined();
  });
});

describe("pause", () => {
  it("sets status to paused_by_human", () => {
    const record = tracker.create();
    const paused = tracker.pause(record.id, "CEO review");
    expect(paused.status).toBe("paused_by_human");
  });

  it("stores pause reason in metadata (truncated to 500 chars)", () => {
    const record = tracker.create();
    const longReason = "r".repeat(600);
    tracker.pause(record.id, longReason);
    expect((tracker.get(record.id).metadata["pause_reason"] as string).length).toBe(500);
  });
});

describe("resume", () => {
  it("resumes a paused conversation", () => {
    const record = tracker.create();
    tracker.pause(record.id, "CEO review");
    const resumed = tracker.resume(record.id);
    expect(resumed.status).toBe("active");
  });

  it("throws ConversationInactiveError when not paused", () => {
    const record = tracker.create();
    expect(() => tracker.resume(record.id)).toThrow(ConversationInactiveError);
  });

  it("throws ConversationInactiveError for completed conversation", () => {
    const record = tracker.create();
    tracker.complete(record.id);
    expect(() => tracker.resume(record.id)).toThrow(ConversationInactiveError);
  });
});

// ============================================================================
// has / list / listActive / delete / clear
// ============================================================================

describe("has", () => {
  it("returns true for existing conversation", () => {
    const record = tracker.create();
    expect(tracker.has(record.id)).toBe(true);
  });

  it("returns false for nonexistent id", () => {
    expect(tracker.has("nonexistent")).toBe(false);
  });
});

describe("list", () => {
  it("returns all conversations", () => {
    tracker.create();
    tracker.create();
    tracker.create();
    expect(tracker.list()).toHaveLength(3);
  });

  it("returns empty array when no conversations", () => {
    expect(tracker.list()).toEqual([]);
  });
});

describe("listActive", () => {
  it("returns only active conversations", () => {
    const a = tracker.create();
    tracker.create();
    tracker.complete(a.id);
    expect(tracker.listActive()).toHaveLength(1);
  });
});

describe("delete", () => {
  it("removes conversation and returns true", () => {
    const record = tracker.create();
    expect(tracker.delete(record.id)).toBe(true);
    expect(tracker.has(record.id)).toBe(false);
  });

  it("returns false for nonexistent id", () => {
    expect(tracker.delete("nonexistent")).toBe(false);
  });
});

describe("clear", () => {
  it("removes all conversations", () => {
    tracker.create();
    tracker.create();
    tracker.clear();
    expect(tracker.list()).toEqual([]);
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe("singleton", () => {
  beforeEach(() => {
    resetConversationTracker();
  });

  it("getConversationTracker returns same instance", () => {
    const a = getConversationTracker();
    const b = getConversationTracker();
    expect(a).toBe(b);
  });

  it("resetConversationTracker clears the singleton", () => {
    const a = getConversationTracker();
    resetConversationTracker();
    const b = getConversationTracker();
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// Error classes
// ============================================================================

describe("error classes", () => {
  it("ConversationNotFoundError has correct name", () => {
    const err = new ConversationNotFoundError("conv-123");
    expect(err.name).toBe("ConversationNotFoundError");
    expect(err.message).toContain("conv-123");
  });

  it("ConversationInactiveError has correct name", () => {
    const err = new ConversationInactiveError("conv-123", "completed");
    expect(err.name).toBe("ConversationInactiveError");
    expect(err.message).toContain("completed");
  });

  it("LimitExceededError has violation property", () => {
    const err = new LimitExceededError("max_messages", "Message limit");
    expect(err.name).toBe("LimitExceededError");
    expect(err.violation).toBe("max_messages");
  });

  it("DelegationDepthError includes agent name", () => {
    const err = new DelegationDepthError(2, 1, "coder");
    expect(err.name).toBe("DelegationDepthError");
    expect(err.message).toContain("coder");
  });

  it("DelegationDepthError works without agent name", () => {
    const err = new DelegationDepthError(2, 1);
    expect(err.message).not.toContain("for agent");
  });
});
