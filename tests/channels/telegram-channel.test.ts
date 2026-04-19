/**
 * Telegram Channel Tests
 *
 * Tests for TelegramChannel OTT notification integration.
 *
 * @module tests/channels/telegram-channel
 * @date 2026-02-23
 * @status Sprint 38 Week 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TelegramChannel,
  createTelegramChannel,
  loadTelegramConfig,
  isValidBotToken,
  isValidChatId,
  isTelegramConfigured,
  formatAlert,
  formatAlertMarkdown,
  getAlertEmoji,
  getPriorityIndicator,
  isBidirectionalChannel,
  type EscalationAlert,
  type TelegramChannelConfig,
  type ApprovalQueueLike,
  type IncomingMessage,
} from "../../src/channels/index.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(ok: boolean, result?: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve({ ok, result }),
  } as unknown as Response;
}

function createTestConfig(): TelegramChannelConfig {
  return {
    botToken: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890",
    chatId: "987654321",
    parseMode: "Markdown",
    disableNotification: false,
    enablePolling: false,
    pollingInterval: 3000,
  };
}

function createTestAlert(overrides?: Partial<EscalationAlert>): EscalationAlert {
  return {
    type: "approval_needed",
    title: "Approval Required",
    body: "Architecture change requires CEO approval",
    approvalId: "apr-abc123",
    projectId: "test-project",
    timestamp: new Date(),
    priority: "high",
    actions: ["/approve apr-abc123", "/reject apr-abc123"],
    ...overrides,
  };
}

function createMockApprovalQueue(): ApprovalQueueLike {
  return {
    approve: vi.fn(async () => true),
    reject: vi.fn(async () => true),
    listPending: vi.fn(async () => [
      { id: "apr-123", description: "Budget approval" },
      { id: "apr-456", description: "Gate G2 approval" },
    ]),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("TelegramChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.ENDIORBOT_TELEGRAM_BOT_TOKEN;
    delete process.env.ENDIORBOT_TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe("Configuration", () => {
    it("should validate correct bot token format", () => {
      expect(isValidBotToken("123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890")).toBe(true);
      expect(isValidBotToken("987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZ_-abcdef")).toBe(true);
    });

    it("should reject invalid bot token formats", () => {
      expect(isValidBotToken("")).toBe(false);
      expect(isValidBotToken("invalid")).toBe(false);
      expect(isValidBotToken("abc:def")).toBe(false); // Non-numeric bot ID
      expect(isValidBotToken("123:short")).toBe(false); // Token too short
      expect(isValidBotToken("123456789")).toBe(false); // Missing token part
    });

    it("should validate correct chat ID format", () => {
      expect(isValidChatId("123456789")).toBe(true);
      expect(isValidChatId("-100123456789")).toBe(true); // Group chat
    });

    it("should reject invalid chat ID formats", () => {
      expect(isValidChatId("")).toBe(false);
      expect(isValidChatId("abc")).toBe(false);
      expect(isValidChatId("12.34")).toBe(false);
    });

    it("should load config from environment variables", () => {
      process.env.ENDIORBOT_TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890";
      process.env.ENDIORBOT_TELEGRAM_CHAT_ID = "987654321";

      const config = loadTelegramConfig();

      expect(config).not.toBeNull();
      expect(config?.botToken).toBe("123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890");
      expect(config?.chatId).toBe("987654321");
    });

    it("should return null when env vars not set", () => {
      const config = loadTelegramConfig();
      expect(config).toBeNull();
    });

    it("should return null when only token is set", () => {
      process.env.ENDIORBOT_TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890";

      const config = loadTelegramConfig();
      expect(config).toBeNull();
    });

    it("should check if Telegram is configured", () => {
      expect(isTelegramConfigured()).toBe(false);

      process.env.ENDIORBOT_TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ1234567890";
      process.env.ENDIORBOT_TELEGRAM_CHAT_ID = "987654321";

      expect(isTelegramConfigured()).toBe(true);
    });
  });

  // ==========================================================================
  // Channel Creation Tests
  // ==========================================================================

  describe("Creation", () => {
    it("should create channel with config", () => {
      const channel = createTelegramChannel(createTestConfig());
      expect(channel).toBeInstanceOf(TelegramChannel);
      expect(channel.name).toBe("telegram");
    });

    it("should create channel without config", () => {
      const channel = createTelegramChannel();
      expect(channel).toBeInstanceOf(TelegramChannel);
    });
  });

  // ==========================================================================
  // isAvailable Tests
  // ==========================================================================

  describe("isAvailable", () => {
    it("should return false when not configured", async () => {
      const channel = createTelegramChannel();
      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return true when API responds", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(
        createMockResponse(true, { id: 123, username: "test_bot" })
      );

      const available = await channel.isAvailable();
      expect(available).toBe(true);
    });

    it("should return false when API fails", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(createMockResponse(false));

      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return false on network error", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });
  });

  // ==========================================================================
  // Send Message Tests
  // ==========================================================================

  describe("send", () => {
    it("should send plain text message", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(createMockResponse(true, { message_id: 1 }));

      const result = await channel.send("Hello, CEO!");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sendMessage"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Hello, CEO!"),
        })
      );
    });

    it("should return false when not configured", async () => {
      const channel = createTelegramChannel();
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should return false on API error", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(createMockResponse(false));

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Send Alert Tests
  // ==========================================================================

  describe("sendAlert", () => {
    it("should send formatted alert", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const alert = createTestAlert();

      mockFetch.mockResolvedValueOnce(createMockResponse(true, { message_id: 1 }));

      const result = await channel.sendAlert(alert);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sendMessage"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Approval Required"),
        })
      );
    });

    it("should include approval ID in alert", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const alert = createTestAlert({ approvalId: "test-123" });

      mockFetch.mockResolvedValueOnce(createMockResponse(true, { message_id: 1 }));

      await channel.sendAlert(alert);

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain("test-123");
    });

    it("should return false when not configured", async () => {
      const channel = createTelegramChannel();
      const alert = createTestAlert();

      const result = await channel.sendAlert(alert);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Alert Formatting Tests
  // ==========================================================================

  describe("Alert Formatting", () => {
    it("should format alert with emoji", () => {
      expect(getAlertEmoji("budget_warning")).toBe("⚠️");
      expect(getAlertEmoji("budget_limit")).toBe("🔴");
      expect(getAlertEmoji("approval_needed")).toBe("⏳");
      expect(getAlertEmoji("escalation_3strike")).toBe("🚨");
      expect(getAlertEmoji("gate_failed")).toBe("❌");
    });

    it("should format priority indicator", () => {
      expect(getPriorityIndicator("critical")).toBe("[CRITICAL]");
      expect(getPriorityIndicator("high")).toBe("[HIGH]");
      expect(getPriorityIndicator("medium")).toBe("");
      expect(getPriorityIndicator("low")).toBe("[LOW]");
    });

    it("should format plain text alert", () => {
      const alert = createTestAlert();
      const formatted = formatAlert(alert);

      expect(formatted).toContain("⏳");
      expect(formatted).toContain("[HIGH]");
      expect(formatted).toContain("Approval Required");
      expect(formatted).toContain("apr-abc123");
    });

    it("should format markdown alert", () => {
      const alert = createTestAlert();
      const formatted = formatAlertMarkdown(alert);

      expect(formatted).toContain("*Approval Required*");
      expect(formatted).toContain("`apr-abc123`");
      expect(formatted).toContain("/approve apr-abc123");
    });

    it("should handle alert without optional fields", () => {
      const alert: EscalationAlert = {
        type: "budget_warning",
        title: "Budget Warning",
        body: "At 80% of budget",
        timestamp: new Date(),
        priority: "medium",
      };

      const formatted = formatAlert(alert);
      expect(formatted).toContain("Budget Warning");
      expect(formatted).not.toContain("ID:");
    });
  });

  // ==========================================================================
  // Command Handling Tests
  // ==========================================================================

  describe("Command Handling", () => {
    it("should handle /approve command", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/approve apr-123");

      expect(result?.success).toBe(true);
      expect(result?.response).toContain("Approved");
      expect(queue.approve).toHaveBeenCalledWith("apr-123");
    });

    it("should handle /reject command", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/reject apr-123 Not needed");

      expect(result?.success).toBe(true);
      expect(result?.response).toContain("Rejected");
      expect(queue.reject).toHaveBeenCalledWith("apr-123", "Not needed");
    });

    it("should handle /status command", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/status");

      expect(result?.success).toBe(true);
      expect(result?.response).toContain("Pending: 2");
      expect(result?.response).toContain("apr-123");
      expect(result?.response).toContain("apr-456");
    });

    it("should handle /help command", async () => {
      const channel = createTelegramChannel(createTestConfig());

      const result = await channel.handleCommand("/help");

      expect(result?.success).toBe(true);
      expect(result?.response).toContain("Commands");
      expect(result?.response).toContain("/approve");
      expect(result?.response).toContain("/reject");
      expect(result?.response).toContain("/status");
    });

    it("should return null for unknown commands (forwarded to onMessage handler)", async () => {
      const channel = createTelegramChannel(createTestConfig());

      const result = await channel.handleCommand("/unknown");

      expect(result).toBeNull();
    });

    it("should strip @botname suffix from commands", async () => {
      const channel = createTelegramChannel(createTestConfig());

      const result = await channel.handleCommand("/help@Endior_bot");

      expect(result?.success).toBe(true);
      expect(result?.response).toContain("Commands");
    });

    it("should require approval ID for /approve", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/approve");

      expect(result?.success).toBe(false);
      expect(result?.response).toContain("Usage");
    });

    it("should handle approval failure", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue: ApprovalQueueLike = {
        approve: vi.fn(async () => false),
        reject: vi.fn(async () => false),
        listPending: vi.fn(async () => []),
      };
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/approve invalid-id");

      expect(result?.success).toBe(false);
      expect(result?.response).toContain("failed");
    });

    it("should handle missing approval queue", async () => {
      const channel = createTelegramChannel(createTestConfig());

      const result = await channel.handleCommand("/approve apr-123");

      expect(result?.success).toBe(false);
      expect(result?.response).toContain("not available");
    });
  });

  // ==========================================================================
  // Update Handling Tests
  // ==========================================================================

  describe("Update Handling", () => {
    it("should process update from authorized chat", async () => {
      const config = createTestConfig();
      const channel = createTelegramChannel(config);
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      // Mock sendMessage for the response
      mockFetch.mockResolvedValueOnce(createMockResponse(true, { message_id: 1 }));

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: parseInt(config.chatId), type: "private" },
          date: Date.now(),
          text: "/status",
        },
      });

      expect(queue.listPending).toHaveBeenCalled();
    });

    it("should ignore update from unauthorized chat", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 999999, type: "private" }, // Different chat ID
          date: Date.now(),
          text: "/status",
        },
      });

      expect(queue.listPending).not.toHaveBeenCalled();
    });

    it("should ignore non-command messages", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 987654321, type: "private" },
          date: Date.now(),
          text: "Hello",
        },
      });

      expect(queue.listPending).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Polling Tests
  // ==========================================================================

  describe("Polling", () => {
    it("should not start polling when disabled", () => {
      const config = createTestConfig();
      config.enablePolling = false;
      const channel = createTelegramChannel(config);

      channel.startPolling();

      // No fetch calls should be made for getUpdates
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should stop polling cleanly", () => {
      const channel = createTelegramChannel(createTestConfig());
      channel.stopPolling();

      // Should not throw
      expect(() => channel.stopPolling()).not.toThrow();
    });

    it("should dispose resources", () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue = createMockApprovalQueue();
      channel.setApprovalQueue(queue);

      channel.dispose();

      // Should be able to dispose again without error
      expect(() => channel.dispose()).not.toThrow();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockRejectedValueOnce(new Error("Network failed"));

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      const channel = createTelegramChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          error_code: 400,
          description: "Bad Request",
        }),
      } as Response);

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle queue errors in commands", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const queue: ApprovalQueueLike = {
        approve: vi.fn(async () => { throw new Error("Queue error"); }),
        reject: vi.fn(async () => false),
        listPending: vi.fn(async () => []),
      };
      channel.setApprovalQueue(queue);

      const result = await channel.handleCommand("/approve apr-123");

      expect(result?.success).toBe(false);
      expect(result?.response).toContain("Error");
    });
  });

  // ==========================================================================
  // BidirectionalChannel Tests (Sprint 46)
  // ==========================================================================

  describe("BidirectionalChannel", () => {
    it("should implement BidirectionalChannel interface", () => {
      const channel = createTelegramChannel(createTestConfig());
      expect(isBidirectionalChannel(channel)).toBe(true);
    });

    it("should have receive method", async () => {
      const channel = createTelegramChannel(createTestConfig());
      const messages = await channel.receive();
      expect(messages).toEqual([]);
    });

    it("should register and unregister message handler", () => {
      const channel = createTelegramChannel(createTestConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});

      channel.onMessage(handler);
      channel.offMessage();
      // Should not throw
    });

    it("should start and stop receiving", async () => {
      const config = createTestConfig();
      config.enablePolling = true;
      const channel = createTelegramChannel(config);

      expect(channel.isReceiving()).toBe(false);

      // Note: startPolling is async but we test state
      await channel.start();
      expect(channel.isReceiving()).toBe(true);

      await channel.stop();
      expect(channel.isReceiving()).toBe(false);
    });

    it("should queue messages for receive()", async () => {
      const config = createTestConfig();
      const channel = createTelegramChannel(config);

      // Simulate update handling
      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 123,
          chat: { id: parseInt(config.chatId), type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "Hello from CEO",
          from: {
            id: 12345,
            is_bot: false,
            first_name: "CEO",
            username: "ceo_user",
          },
        },
      });

      const messages = await channel.receive();
      expect(messages).toHaveLength(1);
      // Content is wrapped with [EXTERNAL_INPUT] tags for security (non-command messages)
      expect(messages[0].content).toContain("Hello from CEO");
      expect(messages[0].messageId).toBe("123");

      // Second receive should be empty
      const empty = await channel.receive();
      expect(empty).toHaveLength(0);
    });

    it("should call message handler for non-command messages", async () => {
      const config = createTestConfig();
      const channel = createTelegramChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 456,
          chat: { id: parseInt(config.chatId), type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "Not a command",
        },
      });

      expect(handler).toHaveBeenCalled();
      // Content is wrapped with [EXTERNAL_INPUT] tags for security (defense-in-depth)
      expect(handler.mock.calls[0][0].content).toContain("Not a command");
    });

    it("should NOT call message handler for commands", async () => {
      const config = createTestConfig();
      const channel = createTelegramChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);

      // Mock the sendMessage response for command reply
      mockFetch.mockResolvedValueOnce(createMockResponse(true, { message_id: 1 }));

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 789,
          chat: { id: parseInt(config.chatId), type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/help",
        },
      });

      // Commands still get queued (raw text for command processing)
      const messages = await channel.receive();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain("/help");

      // Handler is NOT called for commands - they're processed by command handler
      expect(handler).not.toHaveBeenCalled();
    });

    it("should clear pending messages on dispose", async () => {
      const config = createTestConfig();
      const channel = createTelegramChannel(config);

      await channel.handleUpdate({
        update_id: 1,
        message: {
          message_id: 111,
          chat: { id: parseInt(config.chatId), type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "Test message",
        },
      });

      channel.dispose();

      const messages = await channel.receive();
      expect(messages).toHaveLength(0);
    });
  });
});
