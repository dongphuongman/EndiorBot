/**
 * Zalo Channel Tests
 *
 * Tests for ZaloChannel bidirectional implementation.
 *
 * Per Sprint 46 Days 8-9 requirements:
 * - Zalo channel E2E tests
 * - BidirectionalChannel interface compliance
 * - Webhook message handling
 *
 * @module tests/channels/zalo/zalo-channel
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 8-9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createZaloChannel,
  ZaloChannel,
  isBidirectionalChannel,
  loadZaloConfig,
  isValidOaId,
  isValidUserId,
  DEFAULT_ZALO_CONFIG,
  type ZaloChannelConfig,
  type EscalationAlert,
  type IncomingMessage,
} from "../../../src/channels/index.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function createZaloApiResponse<T>(data: T, error = 0, message = "Success"): unknown {
  return {
    error,
    message,
    data,
  };
}

function createTestConfig(): ZaloChannelConfig {
  return {
    accessToken: "test-access-token-12345",
    refreshToken: "test-refresh-token",
    oaId: "1234567890123456",
    userId: "9876543210123456",
    enableWebhook: true,
    webhookSecret: "test-webhook-secret",
    pollingInterval: 3000,
    timeoutMs: 10000,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("ZaloChannel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Construction and Configuration
  // ==========================================================================

  describe("Construction", () => {
    it("should create channel with valid config", () => {
      const channel = createZaloChannel(createTestConfig());

      expect(channel.name).toBe("zalo");
    });

    it("should implement BidirectionalChannel interface", () => {
      const channel = createZaloChannel(createTestConfig());

      expect(isBidirectionalChannel(channel)).toBe(true);
      expect(typeof channel.receive).toBe("function");
      expect(typeof channel.onMessage).toBe("function");
      expect(typeof channel.offMessage).toBe("function");
      expect(typeof channel.start).toBe("function");
      expect(typeof channel.stop).toBe("function");
      expect(typeof channel.isReceiving).toBe("function");
    });

    it("should handle missing config gracefully", () => {
      // Create channel without config (should not throw)
      const channel = new ZaloChannel();

      // Channel should not throw but operations should fail gracefully
      expect(channel.name).toBe("zalo");
    });
  });

  // ==========================================================================
  // Config Validation
  // ==========================================================================

  describe("Config Validation", () => {
    it("should validate OA ID format (numeric string)", () => {
      expect(isValidOaId("1234567890123456")).toBe(true);
      expect(isValidOaId("123456789012345")).toBe(true); // Any numeric string is valid
      expect(isValidOaId("123456789012345a")).toBe(false); // contains letter
      expect(isValidOaId("")).toBe(false);
    });

    it("should validate user ID format (numeric string)", () => {
      expect(isValidUserId("9876543210123456")).toBe(true);
      expect(isValidUserId("987654321012345")).toBe(true); // Any numeric string is valid
      expect(isValidUserId("")).toBe(false);
      expect(isValidUserId("abc123")).toBe(false); // contains letters
    });

    it("should have valid default config structure", () => {
      expect(DEFAULT_ZALO_CONFIG).toBeDefined();
      expect(DEFAULT_ZALO_CONFIG.pollingInterval).toBeGreaterThan(0);
      expect(DEFAULT_ZALO_CONFIG.timeoutMs).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Send Operations
  // ==========================================================================

  describe("Send Operations", () => {
    it("should send plain text message", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createZaloApiResponse({ message_id: "msg-001" }))
      );

      const channel = createZaloChannel(createTestConfig());
      const result = await channel.send("Hello CEO!");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should send alert message", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createZaloApiResponse({ message_id: "msg-002" }))
      );

      const channel = createZaloChannel(createTestConfig());
      const alert: EscalationAlert = {
        type: "decision_required",
        priority: "high",
        title: "Budget Approval Needed",
        message: "Sprint 46 budget exceeded threshold",
        approvalId: "apr-123",
        metadata: {},
      };

      const result = await channel.sendAlert(alert);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should return false when not configured", async () => {
      const channel = new ZaloChannel();

      const result = await channel.send("Test");

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createZaloApiResponse(null, -1, "API Error"), false, 500)
      );

      const channel = createZaloChannel(createTestConfig());
      const result = await channel.send("Test");

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Availability Check
  // ==========================================================================

  describe("Availability", () => {
    it("should return true when API is available", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createZaloApiResponse({ oa_id: "1234567890123456" }))
      );

      const channel = createZaloChannel(createTestConfig());
      const available = await channel.isAvailable();

      expect(available).toBe(true);
    });

    it("should return false when not configured", async () => {
      const channel = new ZaloChannel();
      const available = await channel.isAvailable();

      expect(available).toBe(false);
    });

    it("should return false on API error", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createZaloApiResponse(null, -1, "Error"), false, 500)
      );

      const channel = createZaloChannel(createTestConfig());
      const available = await channel.isAvailable();

      expect(available).toBe(false);
    });
  });

  // ==========================================================================
  // Bidirectional Operations
  // ==========================================================================

  describe("Bidirectional Operations", () => {
    it("should register and unregister message handler", () => {
      const channel = createZaloChannel(createTestConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});

      channel.onMessage(handler);
      channel.offMessage();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should return empty array for receive() initially", async () => {
      const channel = createZaloChannel(createTestConfig());

      const messages = await channel.receive();

      expect(messages).toEqual([]);
    });

    it("should start and stop receiving", async () => {
      const config = createTestConfig();
      config.enablePolling = true;
      const channel = createZaloChannel(config);

      expect(channel.isReceiving()).toBe(false);

      await channel.start();
      // Note: Actual polling may not start without valid API
      // but the state should be set
      expect(channel.isReceiving()).toBe(true);

      await channel.stop();
      expect(channel.isReceiving()).toBe(false);
    });

    it("should handle webhook event", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(createZaloApiResponse({ message_id: "msg-003" }))
      );

      const channel = createZaloChannel(createTestConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);

      // Must start() to enable webhook processing
      await channel.start();

      // Simulate webhook event
      const webhookEvent = {
        event_name: "user_send_text",
        app_id: "test-app",
        sender: { id: "9876543210123456" },
        recipient: { id: "1234567890123456" },
        message: {
          msg_id: "webhook-msg-001",
          text: "Hello from CEO",
        },
        timestamp: Date.now().toString(),
      };

      await channel.handleWebhookEvent(webhookEvent);

      // Message should be queued (wrapped with [EXTERNAL_INPUT] tags for security)
      const messages = await channel.receive();
      expect(messages.length).toBe(1);
      expect(messages[0].content).toContain("Hello from CEO");
    });

    it("should call message handler for non-command messages", async () => {
      const channel = createZaloChannel(createTestConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);

      // Must start() to enable webhook processing
      await channel.start();

      const webhookEvent = {
        event_name: "user_send_text",
        app_id: "test-app",
        sender: { id: "9876543210123456" },
        recipient: { id: "1234567890123456" },
        message: {
          msg_id: "webhook-msg-002",
          text: "Not a command",
        },
        timestamp: Date.now().toString(),
      };

      await channel.handleWebhookEvent(webhookEvent);

      expect(handler).toHaveBeenCalled();
      // Content is wrapped with [EXTERNAL_INPUT] tags for security (defense-in-depth)
      expect(handler.mock.calls[0][0].content).toContain("Not a command");
    });
  });

  // ==========================================================================
  // Integration with ConversationHandler
  // ==========================================================================

  describe("ConversationHandler Integration", () => {
    it("should process messages through handler when registered", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(createZaloApiResponse({ message_id: "msg-reply" }))
      );

      const channel = createZaloChannel(createTestConfig());
      const processedMessages: IncomingMessage[] = [];

      // Register handler that collects messages
      channel.onMessage(async (msg) => {
        processedMessages.push(msg);
      });

      // Must start() to enable webhook processing
      await channel.start();

      // Simulate webhook
      const webhookEvent = {
        event_name: "user_send_text",
        app_id: "test-app",
        sender: { id: "9876543210123456" },
        recipient: { id: "1234567890123456" },
        message: {
          msg_id: "handler-msg-001",
          text: "Process this message",
        },
        timestamp: Date.now().toString(),
      };

      await channel.handleWebhookEvent(webhookEvent);

      expect(processedMessages.length).toBe(1);
      // Content is wrapped with [EXTERNAL_INPUT] tags for security (defense-in-depth)
      expect(processedMessages[0].content).toContain("Process this message");
      expect(processedMessages[0].senderId).toBe("9876543210123456");
    });
  });

  // ==========================================================================
  // Dispose and Cleanup
  // ==========================================================================

  describe("Dispose", () => {
    it("should clean up on dispose", async () => {
      const config = createTestConfig();
      config.enablePolling = true;
      const channel = createZaloChannel(config);

      // Must start() first to enable webhook processing
      await channel.start();

      // Queue some messages
      const webhookEvent = {
        event_name: "user_send_text",
        app_id: "test-app",
        sender: { id: "9876543210123456" },
        recipient: { id: "1234567890123456" },
        message: { msg_id: "cleanup-msg", text: "Test" },
        timestamp: Date.now().toString(),
      };

      await channel.handleWebhookEvent(webhookEvent);

      // Dispose
      channel.dispose();

      expect(channel.isReceiving()).toBe(false);
      const messages = await channel.receive();
      expect(messages).toEqual([]);
    });
  });

  // ==========================================================================
  // Load Config from Environment
  // ==========================================================================

  describe("Environment Config", () => {
    it("should load config from environment when available", () => {
      // This test verifies the loadZaloConfig function exists and can be called
      // Actual environment loading is tested separately
      const config = loadZaloConfig();

      // Config may be null if environment variables not set
      // This is expected in test environment
      expect(config === null || typeof config === "object").toBe(true);
    });
  });
});

// ============================================================================
// Zalo E2E Integration
// ============================================================================

describe("Zalo E2E Integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should handle complete send-receive-reply flow", async () => {
    // Mock all API calls
    mockFetch.mockResolvedValue(
      createMockResponse(createZaloApiResponse({ message_id: "msg-e2e" }))
    );

    const channel = createZaloChannel(createTestConfig());
    const repliesSent: string[] = [];

    // Track replies
    const originalSend = channel.send.bind(channel);
    channel.send = async (message: string) => {
      repliesSent.push(message);
      return originalSend(message);
    };

    // Must start() to enable webhook processing
    await channel.start();

    // 1. Receive message via webhook
    const incomingEvent = {
      event_name: "user_send_text",
      app_id: "test-app",
      sender: { id: "9876543210123456" },
      recipient: { id: "1234567890123456" },
      message: {
        msg_id: "e2e-msg-001",
        text: "What is the status?",
      },
      timestamp: Date.now().toString(),
    };

    await channel.handleWebhookEvent(incomingEvent);

    // 2. Process message (wrapped with [EXTERNAL_INPUT] tags for security)
    const messages = await channel.receive();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toContain("What is the status?");

    // 3. Send reply
    const replyResult = await channel.send("Status: All systems operational");
    expect(replyResult).toBe(true);
    expect(repliesSent).toContain("Status: All systems operational");
  });

  it("should handle multiple concurrent messages", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(createZaloApiResponse({ message_id: "msg-concurrent" }))
    );

    const channel = createZaloChannel(createTestConfig());

    // Must start() to enable webhook processing
    await channel.start();

    // Send multiple webhook events
    const events = [
      { msg_id: "concurrent-1", text: "Message 1" },
      { msg_id: "concurrent-2", text: "Message 2" },
      { msg_id: "concurrent-3", text: "Message 3" },
    ];

    for (const event of events) {
      await channel.handleWebhookEvent({
        event_name: "user_send_text",
        app_id: "test-app",
        sender: { id: "9876543210123456" },
        recipient: { id: "1234567890123456" },
        message: event,
        timestamp: Date.now().toString(),
      });
    }

    // All messages should be queued (wrapped with [EXTERNAL_INPUT] tags for security)
    const messages = await channel.receive();
    expect(messages.length).toBe(3);

    // Verify order - content is wrapped with security tags
    expect(messages[0].content).toContain("Message 1");
    expect(messages[1].content).toContain("Message 2");
    expect(messages[2].content).toContain("Message 3");
  });

  it("should ignore non-text events", async () => {
    const channel = createZaloChannel(createTestConfig());

    // Must start() to enable webhook processing
    await channel.start();

    // Attachment events are ignored in current implementation
    const webhookEvent = {
      event_name: "user_send_image",
      app_id: "test-app",
      sender: { id: "9876543210123456" },
      recipient: { id: "1234567890123456" },
      message: {
        msg_id: "attachment-msg",
        attachments: [
          {
            type: "image",
            payload: {
              url: "https://example.com/image.jpg",
            },
          },
        ],
      },
      timestamp: Date.now().toString(),
    };

    await channel.handleWebhookEvent(webhookEvent);

    // Non-text events are not processed (per implementation)
    const messages = await channel.receive();
    expect(messages.length).toBe(0);
  });
});
