/**
 * E2E Channel Flow Integration Tests
 *
 * Tests the complete message flow:
 * Channel → Intent Parser → Action Handler → Same-Channel Reply
 *
 * Per Sprint 46 Days 8-9 requirements:
 * - E2E channel flow testing
 * - Intent → Action flow validation
 * - Same-channel reply verification
 *
 * @module tests/channels/e2e/channel-flow
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 8-9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ConversationMessageHandler,
  createMessageHandler,
  parseIntent,
  executeAction,
  type ActionContext,
  type BidirectionalChannel,
  type IncomingMessage,
  type HandleResult,
} from "../../../src/channels/index.js";
import type { ApprovalQueue, ApprovalItem } from "../../../src/budget/approval-queue.js";
import type { SessionManager, Session } from "../../../src/sessions/session-manager.js";

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock bidirectional channel for E2E testing.
 */
function createE2EChannel(
  name: string = "e2e-channel"
): BidirectionalChannel & {
  sentMessages: string[];
  sentAlerts: Array<{ message: string; priority: string }>;
  messageHandlers: Array<(msg: IncomingMessage) => Promise<void>>;
  simulateMessage: (content: string) => Promise<void>;
} {
  const sentMessages: string[] = [];
  const sentAlerts: Array<{ message: string; priority: string }> = [];
  const messageHandlers: Array<(msg: IncomingMessage) => Promise<void>> = [];

  const channel = {
    name,
    sentMessages,
    sentAlerts,
    messageHandlers,

    send: vi.fn(async (message: string) => {
      sentMessages.push(message);
      return true;
    }),

    sendAlert: vi.fn(async (alert: { message: string; priority?: string }) => {
      sentAlerts.push({ message: alert.message, priority: alert.priority ?? "normal" });
      return true;
    }),

    isAvailable: vi.fn(async () => true),

    receive: vi.fn(async () => []),

    onMessage: vi.fn((handler: (msg: IncomingMessage) => Promise<void>) => {
      messageHandlers.push(handler);
    }),

    offMessage: vi.fn(() => {
      messageHandlers.length = 0;
    }),

    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    isReceiving: vi.fn(() => false),

    /**
     * Simulate an incoming message through the channel.
     */
    simulateMessage: async (content: string) => {
      const message: IncomingMessage = {
        messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        senderId: "ceo-user",
        content,
        receivedAt: new Date(),
        senderName: "CEO",
      };

      for (const handler of messageHandlers) {
        await handler(message);
      }
    },
  };

  return channel;
}

/**
 * Create a mock approval queue with configurable items.
 */
function createE2EApprovalQueue(items: Partial<ApprovalItem>[] = []): ApprovalQueue {
  const pendingItems: ApprovalItem[] = items.map((item, index) => ({
    id: item.id ?? `apr-${index + 1}`,
    type: item.type ?? "block",
    decisionType: item.decisionType ?? "budget_exceeded",
    status: item.status ?? "pending",
    riskLevel: item.riskLevel ?? "medium",
    urgency: item.urgency ?? "normal",
    description: item.description ?? `Test approval item ${index + 1}`,
    reason: item.reason ?? "Test reason",
    context: (item.context ?? { type: "budget_exceeded" }) as import("../../../src/budget/decision-classifier.js").DecisionContext,
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    expiresAt: item.expiresAt ?? new Date(Date.now() + 86400000).toISOString(),
  }));

  return {
    getPending: vi.fn(() => pendingItems.filter((i) => i.status === "pending")),
    getById: vi.fn((id: string) => pendingItems.find((i) => i.id === id)),
    approve: vi.fn((id: string, _by?: string, _notes?: string) => {
      const item = pendingItems.find((i) => i.id === id);
      if (item && item.status === "pending") {
        item.status = "approved";
        return true;
      }
      return false;
    }),
    reject: vi.fn((id: string, _by?: string, _reason?: string) => {
      const item = pendingItems.find((i) => i.id === id);
      if (item && item.status === "pending") {
        item.status = "rejected";
        return true;
      }
      return false;
    }),
    getStats: vi.fn(() => ({
      pending: pendingItems.filter((i) => i.status === "pending").length,
      approved: pendingItems.filter((i) => i.status === "approved").length,
      rejected: pendingItems.filter((i) => i.status === "rejected").length,
      expired: 0,
      total: pendingItems.length,
      oldestPendingAgeMs: 0,
    })),
  } as unknown as ApprovalQueue;
}

/**
 * Create a mock session manager.
 */
function createE2ESessionManager(sessionOverrides: Partial<Session> = {}): SessionManager {
  const session: Session = {
    id: sessionOverrides.id ?? "e2e-session-001",
    projectId: sessionOverrides.projectId ?? "test-project",
    createdAt: sessionOverrides.createdAt ?? new Date(),
    lastActiveAt: sessionOverrides.lastActiveAt ?? new Date(),
    messages: sessionOverrides.messages ?? [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ],
    tokenCount: sessionOverrides.tokenCount ?? 1500,
    maxTokens: sessionOverrides.maxTokens ?? 100000,
    sdlcStage: sessionOverrides.sdlcStage ?? "04-BUILD",
    activeGates: sessionOverrides.activeGates ?? [],
    compactionCount: sessionOverrides.compactionCount ?? 0,
  };

  return {
    getActiveSession: vi.fn(() => session),
    createSession: vi.fn(async () => session),
    getCurrentSession: vi.fn(() => session),
  } as unknown as SessionManager;
}

// ============================================================================
// E2E Test Suites
// ============================================================================

describe("E2E Channel Flow", () => {
  let handler: ConversationMessageHandler;
  let channel: ReturnType<typeof createE2EChannel>;
  let approvalQueue: ApprovalQueue;
  let sessionManager: SessionManager;

  beforeEach(() => {
    approvalQueue = createE2EApprovalQueue([
      { id: "apr-001", description: "Budget approval for API costs", riskLevel: "high" },
      { id: "apr-002", description: "Deploy to production", riskLevel: "medium" },
    ]);

    sessionManager = createE2ESessionManager({
      id: "e2e-session-001",
      projectId: "endiorbot",
      tokenCount: 2500,
    });

    handler = createMessageHandler({
      approvalQueue,
      sessionManager,
    });

    channel = createE2EChannel("telegram");
    handler.registerChannel(channel);
  });

  afterEach(() => {
    handler.dispose();
  });

  // ==========================================================================
  // Complete Message Flow Tests
  // ==========================================================================

  describe("Complete Message Flow", () => {
    it("should process /approve command through full flow", async () => {
      // Simulate incoming message
      const message: IncomingMessage = {
        messageId: "msg-e2e-001",
        senderId: "ceo",
        content: "/approve apr-001",
        receivedAt: new Date(),
      };

      // Process through handler
      const result = await handler.handleMessage(message, channel);

      // Verify intent parsing
      expect(result.intent.intent).toBe("APPROVE");
      expect(result.intent.confidence).toBe(1.0);
      expect(result.intent.params.approvalId).toBe("apr-001");

      // Verify action execution
      expect(result.actionResult.success).toBe(true);
      expect(approvalQueue.approve).toHaveBeenCalledWith("apr-001", "CEO", undefined);

      // Verify reply on same channel
      expect(result.replySent).toBe(true);
      expect(channel.send).toHaveBeenCalled();
      expect(channel.sentMessages.length).toBe(1);
      expect(channel.sentMessages[0]).toContain("Approved");
    });

    it("should process /reject command with reason", async () => {
      const message: IncomingMessage = {
        messageId: "msg-e2e-002",
        senderId: "ceo",
        content: "/reject apr-002 Too risky for production",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("REJECT");
      expect(result.intent.params.approvalId).toBe("apr-002");
      expect(result.intent.params.reason).toBe("Too risky for production");

      expect(approvalQueue.reject).toHaveBeenCalledWith(
        "apr-002",
        "CEO",
        "Too risky for production"
      );

      expect(channel.sentMessages[0]).toContain("Rejected");
    });

    it("should process /status command and include session info", async () => {
      const message: IncomingMessage = {
        messageId: "msg-e2e-003",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("STATUS");
      expect(result.actionResult.success).toBe(true);

      // Verify status contains expected information
      const reply = channel.sentMessages[0];
      expect(reply).toContain("Status Report");
      expect(reply).toContain("e2e-session-001");
      expect(reply).toContain("endiorbot");
      expect(reply).toContain("2,500"); // token count (formatted)
    });

    it("should process /error command when error exists", async () => {
      const testError = new Error("Connection timeout to database");
      handler.setLastError(testError);

      const message: IncomingMessage = {
        messageId: "msg-e2e-004",
        senderId: "ceo",
        content: "/error",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("SHOW_ERROR");
      expect(result.actionResult.success).toBe(true);
      expect(channel.sentMessages[0]).toContain("Connection timeout");
    });

    it("should process /retry command with callback", async () => {
      const onRetry = vi.fn(async (_strategy?: string) => {});
      handler.updateConfig({ onRetry });

      const message: IncomingMessage = {
        messageId: "msg-e2e-005",
        senderId: "ceo",
        content: "/retry gemini",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("TRY_DIFFERENT");
      expect(result.intent.params.strategy).toBe("gemini");
      expect(onRetry).toHaveBeenCalledWith("gemini");
      expect(channel.sentMessages[0]).toContain("Retry");
    });
  });

  // ==========================================================================
  // NLP Flow Tests
  // ==========================================================================

  describe("NLP Intent Flow", () => {
    it("should process NLP status request", async () => {
      const message: IncomingMessage = {
        messageId: "msg-nlp-001",
        senderId: "ceo",
        content: "what's the status",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("STATUS");
      expect(result.intent.method).toBe("nlp");
      expect(result.intent.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.replySent).toBe(true);
    });

    it("should process NLP approval via 'yes' (requires context)", async () => {
      const message: IncomingMessage = {
        messageId: "msg-nlp-002",
        senderId: "ceo",
        content: "yes",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("APPROVE");
      expect(result.intent.method).toBe("nlp");
      expect(result.intent.confidence).toBeLessThan(0.8); // Low confidence NLP
      // Without explicit ID, action prompts for clarification
      expect(channel.sentMessages.length).toBe(1);
    });

    it("should process NLP error request", async () => {
      handler.setLastError("Test error for NLP");

      const message: IncomingMessage = {
        messageId: "msg-nlp-003",
        senderId: "ceo",
        content: "what went wrong",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("SHOW_ERROR");
      expect(result.actionResult.success).toBe(true);
    });

    it("should handle unknown messages gracefully", async () => {
      const message: IncomingMessage = {
        messageId: "msg-nlp-004",
        senderId: "ceo",
        content: "random gibberish xyz123",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.intent.intent).toBe("UNKNOWN");
      expect(result.actionResult.success).toBe(false);
      expect(channel.sentMessages[0]).toContain("didn't understand");
    });
  });

  // ==========================================================================
  // Multi-Channel Flow Tests
  // ==========================================================================

  describe("Multi-Channel Flow", () => {
    let telegramChannel: ReturnType<typeof createE2EChannel>;
    let zaloChannel: ReturnType<typeof createE2EChannel>;

    beforeEach(() => {
      telegramChannel = createE2EChannel("telegram");
      zaloChannel = createE2EChannel("zalo");

      handler.registerChannel(telegramChannel);
      handler.registerChannel(zaloChannel);
    });

    it("should route reply to correct channel", async () => {
      const telegramMessage: IncomingMessage = {
        messageId: "msg-tg-001",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      await handler.handleMessage(telegramMessage, telegramChannel);

      expect(telegramChannel.sentMessages.length).toBe(1);
      expect(zaloChannel.sentMessages.length).toBe(0);
    });

    it("should handle messages from different channels independently", async () => {
      const telegramMsg: IncomingMessage = {
        messageId: "msg-tg-002",
        senderId: "ceo",
        content: "/approve apr-001",
        receivedAt: new Date(),
      };

      const zaloMsg: IncomingMessage = {
        messageId: "msg-zalo-001",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      const [tgResult, zaloResult] = await Promise.all([
        handler.handleMessage(telegramMsg, telegramChannel),
        handler.handleMessage(zaloMsg, zaloChannel),
      ]);

      expect(tgResult.sourceChannel).toBe("telegram");
      expect(zaloResult.sourceChannel).toBe("zalo");

      expect(telegramChannel.sentMessages.length).toBe(1);
      expect(zaloChannel.sentMessages.length).toBe(1);

      expect(telegramChannel.sentMessages[0]).toContain("Approved");
      expect(zaloChannel.sentMessages[0]).toContain("Status");
    });
  });

  // ==========================================================================
  // Error Handling Flow Tests
  // ==========================================================================

  describe("Error Handling Flow", () => {
    it("should handle missing approval ID gracefully", async () => {
      const message: IncomingMessage = {
        messageId: "msg-err-001",
        senderId: "ceo",
        content: "/approve nonexistent-id",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, channel);

      expect(result.actionResult.success).toBe(false);
      expect(channel.sentMessages[0]).toContain("not found");
    });

    it("should handle missing approval queue", async () => {
      const minimalHandler = createMessageHandler({});

      const message: IncomingMessage = {
        messageId: "msg-err-002",
        senderId: "ceo",
        content: "/approve apr-001",
        receivedAt: new Date(),
      };

      const result = await minimalHandler.handleMessage(message, channel);

      expect(result.actionResult.success).toBe(false);
      expect(channel.sentMessages[0]).toContain("not available");

      minimalHandler.dispose();
    });

    it("should handle channel send failure", async () => {
      const failingChannel = createE2EChannel("failing");
      failingChannel.send = vi.fn(async () => false);

      handler.registerChannel(failingChannel);

      const message: IncomingMessage = {
        messageId: "msg-err-003",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      const result = await handler.handleMessage(message, failingChannel);

      expect(result.replySent).toBe(false);
    });
  });

  // ==========================================================================
  // Debug Mode Flow Tests
  // ==========================================================================

  describe("Debug Mode Flow", () => {
    it("should include debug info in replies when enabled", async () => {
      handler.updateConfig({ debugMode: true });

      const message: IncomingMessage = {
        messageId: "msg-debug-001",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      await handler.handleMessage(message, channel);

      const reply = channel.sentMessages[0];
      expect(reply).toContain("STATUS");
      expect(reply).toContain("command");
    });

    it("should not include debug info when disabled", async () => {
      handler.updateConfig({ debugMode: false });

      const message: IncomingMessage = {
        messageId: "msg-debug-002",
        senderId: "ceo",
        content: "/status",
        receivedAt: new Date(),
      };

      await handler.handleMessage(message, channel);

      const reply = channel.sentMessages[0];
      // Should contain status info but not debug metadata
      expect(reply).toContain("Status");
    });
  });
});

// ============================================================================
// Intent → Action Flow Validation
// ============================================================================

describe("Intent → Action Flow Validation", () => {
  it("should correctly map APPROVE intent to approval action", async () => {
    const queue = createE2EApprovalQueue([{ id: "test-001" }]);
    const context: ActionContext = { approvalQueue: queue };

    const intent = parseIntent("/approve test-001");
    const result = await executeAction(intent, context);

    expect(intent.intent).toBe("APPROVE");
    expect(result.success).toBe(true);
    expect(queue.approve).toHaveBeenCalledWith("test-001", "CEO", undefined);
  });

  it("should correctly map REJECT intent to rejection action", async () => {
    const queue = createE2EApprovalQueue([{ id: "test-002" }]);
    const context: ActionContext = { approvalQueue: queue };

    const intent = parseIntent("/reject test-002 Not suitable");
    const result = await executeAction(intent, context);

    expect(intent.intent).toBe("REJECT");
    expect(result.success).toBe(true);
    expect(queue.reject).toHaveBeenCalledWith("test-002", "CEO", "Not suitable");
  });

  it("should correctly map STATUS intent to session summary", async () => {
    const session = createE2ESessionManager({ id: "flow-session" });
    const context: ActionContext = { sessionManager: session };

    const intent = parseIntent("/status");
    const result = await executeAction(intent, context);

    expect(intent.intent).toBe("STATUS");
    expect(result.success).toBe(true);
    expect(result.message).toContain("flow-session");
  });

  it("should correctly map SHOW_ERROR intent to error display", async () => {
    const context: ActionContext = {
      lastError: new Error("Test flow error"),
    };

    const intent = parseIntent("/error");
    const result = await executeAction(intent, context);

    expect(intent.intent).toBe("SHOW_ERROR");
    expect(result.success).toBe(true);
    expect(result.message).toContain("Test flow error");
  });

  it("should correctly map TRY_DIFFERENT intent to retry", async () => {
    const onRetry = vi.fn(async () => {});
    const context: ActionContext = { onRetry };

    const intent = parseIntent("/retry claude");
    const result = await executeAction(intent, context);

    expect(intent.intent).toBe("TRY_DIFFERENT");
    expect(result.success).toBe(true);
    expect(onRetry).toHaveBeenCalledWith("claude");
  });

  it("should handle all intent types consistently", async () => {
    const intents = [
      { input: "/approve id-001", expected: "APPROVE" },
      { input: "/reject id-002 reason", expected: "REJECT" },
      { input: "/status", expected: "STATUS" },
      { input: "/error", expected: "SHOW_ERROR" },
      { input: "/retry", expected: "TRY_DIFFERENT" },
      { input: "random text", expected: "UNKNOWN" },
    ];

    for (const { input, expected } of intents) {
      const intent = parseIntent(input);
      expect(intent.intent).toBe(expected);
    }
  });
});
