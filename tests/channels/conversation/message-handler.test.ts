/**
 * Message Handler Tests
 *
 * Tests for ConversationMessageHandler with intents and actions.
 *
 * @module tests/channels/conversation/message-handler
 * @date 2026-02-24
 * @status Sprint 46 Days 6-7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ConversationMessageHandler,
  createMessageHandler,
  SimpleErrorStore,
  executeAction,
  parseIntent,
  type ActionContext,
  type HandleResult,
} from "../../../src/channels/index.js";
import type { BidirectionalChannel, IncomingMessage } from "../../../src/channels/types.js";

// ============================================================================
// Mock Channel
// ============================================================================

function createMockChannel(name = "test"): BidirectionalChannel & {
  sentMessages: string[];
  handlers: Array<(msg: IncomingMessage) => Promise<void>>;
} {
  const sentMessages: string[] = [];
  const handlers: Array<(msg: IncomingMessage) => Promise<void>> = [];

  return {
    name,
    sentMessages,
    handlers,
    send: vi.fn(async (message: string) => {
      sentMessages.push(message);
      return true;
    }),
    sendAlert: vi.fn(async () => true),
    isAvailable: vi.fn(async () => true),
    receive: vi.fn(async () => []),
    onMessage: vi.fn((handler) => {
      handlers.push(handler);
    }),
    offMessage: vi.fn(() => {
      handlers.length = 0;
    }),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    isReceiving: vi.fn(() => false),
  };
}

function createMockApprovalQueue() {
  const pending = [
    {
      id: "apr-123",
      type: "block" as const,
      decisionType: "budget_exceeded",
      status: "pending" as const,
      riskLevel: "high" as const,
      urgency: "high" as const,
      description: "Budget approval needed",
      reason: "Cost exceeds threshold",
      context: { type: "budget_exceeded" } as unknown as import("../../../src/budget/decision-classifier.js").DecisionContext,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];

  return {
    getPending: vi.fn(() => pending),
    getById: vi.fn((id: string) => pending.find((p) => p.id === id)),
    approve: vi.fn((id: string) => {
      const item = pending.find((p) => p.id === id);
      if (item) {
        item.status = "approved" as const;
        return true;
      }
      return false;
    }),
    reject: vi.fn((id: string) => {
      const item = pending.find((p) => p.id === id);
      if (item) {
        item.status = "rejected" as const;
        return true;
      }
      return false;
    }),
    getStats: vi.fn(() => ({
      pending: pending.filter((p) => p.status === "pending").length,
      approved: 0,
      rejected: 0,
      expired: 0,
      total: pending.length,
      oldestPendingAgeMs: 0,
    })),
  };
}

function createMockSessionManager() {
  return {
    getActiveSession: vi.fn(() => ({
      id: "session-123",
      projectId: "test-project",
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messages: [{ role: "user", content: "test" }],
      tokenCount: 1000,
      maxTokens: 100000,
      sdlcStage: "04-BUILD",
      activeGates: [],
      compactionCount: 0,
    })),
  };
}

function createTestMessage(content: string): IncomingMessage {
  return {
    messageId: `msg-${Date.now()}`,
    senderId: "ceo-123",
    content,
    receivedAt: new Date(),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("ConversationMessageHandler", () => {
  let handler: ConversationMessageHandler;
  let channel: ReturnType<typeof createMockChannel>;
  let approvalQueue: ReturnType<typeof createMockApprovalQueue>;
  let sessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    approvalQueue = createMockApprovalQueue();
    sessionManager = createMockSessionManager();

    handler = createMessageHandler({
      approvalQueue: approvalQueue as unknown as import("../../../src/budget/approval-queue.js").ApprovalQueue,
      sessionManager: sessionManager as unknown as import("../../../src/sessions/session-manager.js").SessionManager,
    });

    channel = createMockChannel("telegram");
  });

  afterEach(() => {
    handler.dispose();
  });

  // ==========================================================================
  // Channel Management
  // ==========================================================================

  describe("Channel Management", () => {
    it("should register a channel", () => {
      handler.registerChannel(channel);

      expect(handler.getChannels()).toContain("telegram");
      expect(channel.onMessage).toHaveBeenCalled();
    });

    it("should unregister a channel", () => {
      handler.registerChannel(channel);

      const result = handler.unregisterChannel("telegram");

      expect(result).toBe(true);
      expect(handler.getChannels()).not.toContain("telegram");
      expect(channel.offMessage).toHaveBeenCalled();
    });

    it("should return false when unregistering unknown channel", () => {
      const result = handler.unregisterChannel("unknown");

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Intent Processing
  // ==========================================================================

  describe("Intent Processing", () => {
    it("should process /approve command", async () => {
      const { intent, result } = await handler.processMessage("/approve apr-123");

      expect(intent.intent).toBe("APPROVE");
      expect(result.success).toBe(true);
      expect(approvalQueue.approve).toHaveBeenCalledWith("apr-123", "CEO", undefined);
    });

    it("should process /reject command", async () => {
      const { intent, result } = await handler.processMessage("/reject apr-123 Not needed");

      expect(intent.intent).toBe("REJECT");
      expect(result.success).toBe(true);
      expect(approvalQueue.reject).toHaveBeenCalledWith("apr-123", "CEO", "Not needed");
    });

    it("should process /status command", async () => {
      const { intent, result } = await handler.processMessage("/status");

      expect(intent.intent).toBe("STATUS");
      expect(result.success).toBe(true);
      expect(result.message).toContain("Status Report");
      expect(result.message).toContain("session-123");
    });

    it("should process /error command", async () => {
      handler.setLastError(new Error("Test error message"));

      const { intent, result } = await handler.processMessage("/error");

      expect(intent.intent).toBe("SHOW_ERROR");
      expect(result.success).toBe(true);
      expect(result.message).toContain("Test error message");
    });

    it("should process /retry command with callback", async () => {
      const onRetry = vi.fn(async () => {});
      handler.updateConfig({ onRetry });

      const { intent, result } = await handler.processMessage("/retry claude");

      expect(intent.intent).toBe("TRY_DIFFERENT");
      expect(result.success).toBe(true);
      expect(onRetry).toHaveBeenCalledWith("claude");
    });

    it("should handle unknown intent", async () => {
      const { intent, result } = await handler.processMessage("random message");

      expect(intent.intent).toBe("UNKNOWN");
      expect(result.success).toBe(false);
      expect(result.message).toContain("didn't understand");
    });
  });

  // ==========================================================================
  // Reply on Same Channel
  // ==========================================================================

  describe("Reply on Same Channel", () => {
    it("should send reply back on the same channel", async () => {
      handler.registerChannel(channel);
      const message = createTestMessage("/status");

      const result = await handler.handleMessage(message, channel);

      expect(result.replySent).toBe(true);
      expect(channel.send).toHaveBeenCalled();
      expect(channel.sentMessages.length).toBe(1);
      expect(channel.sentMessages[0]).toContain("Status Report");
    });

    it("should include debug info when enabled", async () => {
      handler.updateConfig({ debugMode: true });
      handler.registerChannel(channel);
      const message = createTestMessage("/status");

      await handler.handleMessage(message, channel);

      expect(channel.sentMessages[0]).toContain("STATUS");
      expect(channel.sentMessages[0]).toContain("command");
    });
  });

  // ==========================================================================
  // Error Store
  // ==========================================================================

  describe("Error Store", () => {
    it("should set and get last error", () => {
      const error = new Error("Test error");
      handler.setLastError(error);

      expect(handler.getLastError()).toBe(error);
    });

    it("should clear error", () => {
      handler.setLastError("Test error");
      handler.clearError();

      expect(handler.getLastError()).toBeUndefined();
    });

    it("should return 'No recent errors' when no error set", async () => {
      handler.clearError();

      const { result } = await handler.processMessage("/error");

      expect(result.message).toContain("No recent errors");
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle missing approval queue", async () => {
      const minimalHandler = createMessageHandler({});

      const { result } = await minimalHandler.processMessage("/approve apr-123");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not available");

      minimalHandler.dispose();
    });

    it("should handle missing retry callback", async () => {
      const { result } = await handler.processMessage("/retry");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not available");
    });

    it("should auto-select single pending approval", async () => {
      // The mock has one pending item
      const { result } = await handler.processMessage("yes");

      expect(result.success).toBe(true);
      expect(approvalQueue.approve).toHaveBeenCalledWith("apr-123", "CEO", undefined);
    });

    it("should clean up on dispose", () => {
      handler.registerChannel(channel);
      handler.setLastError("test");

      handler.dispose();

      expect(handler.getChannels()).toHaveLength(0);
      expect(handler.getLastError()).toBeUndefined();
    });
  });
});

// ============================================================================
// SimpleErrorStore Tests
// ============================================================================

describe("SimpleErrorStore", () => {
  it("should store and retrieve error", () => {
    const store = new SimpleErrorStore();
    const error = new Error("Test");

    store.setLastError(error);

    expect(store.getLastError()).toBe(error);
  });

  it("should store string error", () => {
    const store = new SimpleErrorStore();

    store.setLastError("String error");

    expect(store.getLastError()).toBe("String error");
  });

  it("should clear error", () => {
    const store = new SimpleErrorStore();
    store.setLastError("Error");

    store.clearError();

    expect(store.getLastError()).toBeUndefined();
  });
});

// ============================================================================
// Action Execution Tests
// ============================================================================

describe("Action Execution", () => {
  it("should execute APPROVE action", async () => {
    const approvalQueue = createMockApprovalQueue();
    const context: ActionContext = {
      approvalQueue: approvalQueue as unknown as import("../../../src/budget/approval-queue.js").ApprovalQueue,
    };
    const intent = parseIntent("/approve apr-123");

    const result = await executeAction(intent, context);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Approved");
  });

  it("should execute STATUS action with session info", async () => {
    const sessionManager = createMockSessionManager();
    const context: ActionContext = {
      sessionManager: sessionManager as unknown as import("../../../src/sessions/session-manager.js").SessionManager,
    };
    const intent = parseIntent("/status");

    const result = await executeAction(intent, context);

    expect(result.success).toBe(true);
    expect(result.message).toContain("session-123");
    expect(result.message).toContain("test-project");
  });
});
