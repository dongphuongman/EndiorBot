/**
 * /approve + /reject Command Tests — Sprint 94
 *
 * Tests the approval commands migrated from telegram-poll.mjs.
 *
 * @module tests/commands/approve-reject
 * @sprint 94
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCommandDispatcher } from "../../src/commands/index.js";
import type { CommandDispatcher } from "../../src/commands/command-dispatcher.js";

// Mock the identity linkage so withLinkedActor succeeds
vi.mock("../../src/channels/telegram/telegram-commands.js", async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>;
  return {
    ...orig,
    getLinkedActorId: (userId: string) => {
      if (userId === "linked-user") return "ceo@endiorbot";
      return null;
    },
  };
});

// Mock the approval queue
const mockQueue = new Map<string, { id: string; status: string; message: string; respondedAt?: number; respondedBy?: string; details?: Record<string, unknown> }>();

vi.mock("../../src/gateway/methods/approval.js", () => ({
  getApprovalQueue: () => mockQueue,
}));

// Mock executeApprovedRun
vi.mock("../../src/channels/telegram/remote-commands.js", async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>;
  return {
    ...orig,
    executeApprovedRun: vi.fn().mockResolvedValue({
      success: true,
      response: "Executed approved command.",
    }),
  };
});

describe("/approve and /reject commands", () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    mockQueue.clear();
    dispatcher = createCommandDispatcher();
  });

  // --------------------------------------------------------------------------
  // /approve
  // --------------------------------------------------------------------------

  it("/approve — valid pending approval marks approved", async () => {
    mockQueue.set("req-1", {
      id: "req-1",
      status: "pending",
      message: "Run tests",
    });

    const result = await dispatcher.dispatch("approve", {
      userId: "linked-user",
      args: ["req-1"],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(mockQueue.get("req-1")?.status).toBe("approved");
  });

  it("/approve — non-existent returns error", async () => {
    const result = await dispatcher.dispatch("approve", {
      userId: "linked-user",
      args: ["nonexistent"],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    expect(result!.response).toContain("not found");
  });

  it("/approve — already resolved returns error", async () => {
    mockQueue.set("req-2", {
      id: "req-2",
      status: "approved",
      message: "Already done",
    });

    const result = await dispatcher.dispatch("approve", {
      userId: "linked-user",
      args: ["req-2"],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    expect(result!.response).toContain("already");
  });

  it("/approve — no arg returns usage", async () => {
    const result = await dispatcher.dispatch("approve", {
      userId: "linked-user",
      args: [],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    expect(result!.response).toContain("Usage");
  });

  // --------------------------------------------------------------------------
  // /reject
  // --------------------------------------------------------------------------

  it("/reject — valid pending marks rejected", async () => {
    mockQueue.set("req-3", {
      id: "req-3",
      status: "pending",
      message: "Deploy to prod",
    });

    const result = await dispatcher.dispatch("reject", {
      userId: "linked-user",
      args: ["req-3"],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(result!.response).toContain("Rejected");
    expect(mockQueue.get("req-3")?.status).toBe("rejected");
  });

  it("/reject — no ID arg returns usage message", async () => {
    const result = await dispatcher.dispatch("reject", {
      userId: "linked-user",
      args: [],
      channel: "telegram",
    });

    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    expect(result!.response).toContain("Usage");
  });
});
