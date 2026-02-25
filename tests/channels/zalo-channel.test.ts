/**
 * Zalo Channel Tests
 *
 * Tests for ZaloChannel OTT notification integration.
 *
 * @module tests/channels/zalo-channel
 * @date 2026-02-24
 * @status Sprint 46 Days 4-5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ZaloChannel,
  createZaloChannel,
  createZaloChannelFromEnv,
  loadZaloConfig,
  isZaloConfigured,
  isValidOaId,
  isValidUserId,
  isBidirectionalChannel,
  type ZaloChannelConfig,
  type EscalationAlert,
  type IncomingMessage,
} from "../../src/channels/index.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(error: number, data?: unknown): Response {
  return {
    ok: error === 0,
    json: () => Promise.resolve({ error, message: error === 0 ? "Success" : "Error", data }),
  } as unknown as Response;
}

function createTestConfig(): ZaloChannelConfig {
  return {
    accessToken: "test-access-token-123",
    userId: "123456789",
    oaId: "987654321",
    enableWebhook: false,
    pollingInterval: 5000,
    timeoutMs: 10000,
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
    actions: ["Approve", "Reject"],
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("ZaloChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.ENDIORBOT_ZALO_ACCESS_TOKEN;
    delete process.env.ENDIORBOT_ZALO_USER_ID;
    delete process.env.ENDIORBOT_ZALO_OA_ID;
    delete process.env.ENDIORBOT_ZALO_REFRESH_TOKEN;
    delete process.env.ENDIORBOT_ZALO_WEBHOOK_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe("Configuration", () => {
    it("should validate correct OA ID format", () => {
      expect(isValidOaId("123456789")).toBe(true);
      expect(isValidOaId("987654321098765")).toBe(true);
    });

    it("should reject invalid OA ID formats", () => {
      expect(isValidOaId("")).toBe(false);
      expect(isValidOaId("abc")).toBe(false);
      expect(isValidOaId("12-34")).toBe(false);
      expect(isValidOaId("-123")).toBe(false);
    });

    it("should validate correct user ID format", () => {
      expect(isValidUserId("123456789")).toBe(true);
      expect(isValidUserId("1")).toBe(true);
    });

    it("should reject invalid user ID formats", () => {
      expect(isValidUserId("")).toBe(false);
      expect(isValidUserId("abc")).toBe(false);
    });

    it("should load config from environment variables", () => {
      process.env.ENDIORBOT_ZALO_ACCESS_TOKEN = "test-token";
      process.env.ENDIORBOT_ZALO_USER_ID = "123456";
      process.env.ENDIORBOT_ZALO_OA_ID = "789012";

      const config = loadZaloConfig();

      expect(config).not.toBeNull();
      expect(config?.accessToken).toBe("test-token");
      expect(config?.userId).toBe("123456");
      expect(config?.oaId).toBe("789012");
    });

    it("should return null when env vars not set", () => {
      const config = loadZaloConfig();
      expect(config).toBeNull();
    });

    it("should return null when only token is set", () => {
      process.env.ENDIORBOT_ZALO_ACCESS_TOKEN = "test-token";

      const config = loadZaloConfig();
      expect(config).toBeNull();
    });

    it("should check if Zalo is configured", () => {
      expect(isZaloConfigured()).toBe(false);

      process.env.ENDIORBOT_ZALO_ACCESS_TOKEN = "test-token";
      process.env.ENDIORBOT_ZALO_USER_ID = "123456";
      process.env.ENDIORBOT_ZALO_OA_ID = "789012";

      expect(isZaloConfigured()).toBe(true);
    });

    it("should include webhook config when secret is set", () => {
      process.env.ENDIORBOT_ZALO_ACCESS_TOKEN = "test-token";
      process.env.ENDIORBOT_ZALO_USER_ID = "123456";
      process.env.ENDIORBOT_ZALO_OA_ID = "789012";
      process.env.ENDIORBOT_ZALO_WEBHOOK_SECRET = "secret123";

      const config = loadZaloConfig();

      expect(config?.webhookSecret).toBe("secret123");
      expect(config?.enableWebhook).toBe(true);
    });
  });

  // ==========================================================================
  // Channel Creation Tests
  // ==========================================================================

  describe("Creation", () => {
    it("should create channel with config", () => {
      const channel = createZaloChannel(createTestConfig());
      expect(channel).toBeInstanceOf(ZaloChannel);
      expect(channel.name).toBe("zalo");
    });

    it("should create channel without config", () => {
      const channel = createZaloChannel();
      expect(channel).toBeInstanceOf(ZaloChannel);
    });

    it("should return null from createFromEnv when not configured", () => {
      const channel = createZaloChannelFromEnv();
      expect(channel).toBeNull();
    });

    it("should create from env when configured", () => {
      process.env.ENDIORBOT_ZALO_ACCESS_TOKEN = "test-token";
      process.env.ENDIORBOT_ZALO_USER_ID = "123456";
      process.env.ENDIORBOT_ZALO_OA_ID = "789012";

      const channel = createZaloChannelFromEnv();
      expect(channel).toBeInstanceOf(ZaloChannel);
    });
  });

  // ==========================================================================
  // BidirectionalChannel Tests
  // ==========================================================================

  describe("BidirectionalChannel", () => {
    it("should implement BidirectionalChannel interface", () => {
      const channel = createZaloChannel(createTestConfig());
      expect(isBidirectionalChannel(channel)).toBe(true);
    });

    it("should have receive method that returns empty array initially", async () => {
      const channel = createZaloChannel(createTestConfig());
      const messages = await channel.receive();
      expect(messages).toEqual([]);
    });

    it("should register and unregister message handler", () => {
      const channel = createZaloChannel(createTestConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});

      channel.onMessage(handler);
      channel.offMessage();
      // Should not throw
    });

    it("should start and stop receiving", async () => {
      const channel = createZaloChannel(createTestConfig());

      expect(channel.isReceiving()).toBe(false);

      await channel.start();
      expect(channel.isReceiving()).toBe(true);

      await channel.stop();
      expect(channel.isReceiving()).toBe(false);
    });

    it("should handle webhook events", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);
      await channel.start();

      await channel.handleWebhookEvent({
        event_name: "user_send_text",
        app_id: "app123",
        sender: { id: "sender123" },
        recipient: { id: config.oaId },
        message: {
          msg_id: "msg456",
          text: "Hello from CEO",
        },
        timestamp: String(Date.now()),
      });

      expect(handler).toHaveBeenCalled();
      // Content is wrapped with [EXTERNAL_INPUT] tags for security (defense-in-depth)
      expect(handler.mock.calls[0][0].content).toContain("Hello from CEO");

      const messages = await channel.receive();
      expect(messages).toHaveLength(1);
    });

    it("should ignore webhook events when not receiving", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);
      // Not started

      await channel.handleWebhookEvent({
        event_name: "user_send_text",
        app_id: "app123",
        sender: { id: "sender123" },
        recipient: { id: config.oaId },
        message: {
          msg_id: "msg456",
          text: "Should be ignored",
        },
        timestamp: String(Date.now()),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore events from different OA", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);
      await channel.start();

      await channel.handleWebhookEvent({
        event_name: "user_send_text",
        app_id: "app123",
        sender: { id: "sender123" },
        recipient: { id: "different_oa_id" },
        message: {
          msg_id: "msg456",
          text: "Should be ignored",
        },
        timestamp: String(Date.now()),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore non-text events", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      const handler = vi.fn(async (_msg: IncomingMessage) => {});
      channel.onMessage(handler);
      await channel.start();

      await channel.handleWebhookEvent({
        event_name: "user_send_image",
        app_id: "app123",
        sender: { id: "sender123" },
        recipient: { id: config.oaId },
        timestamp: String(Date.now()),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should clear pending messages on dispose", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      await channel.start();

      await channel.handleWebhookEvent({
        event_name: "user_send_text",
        app_id: "app123",
        sender: { id: "sender123" },
        recipient: { id: config.oaId },
        message: {
          msg_id: "msg456",
          text: "Test",
        },
        timestamp: String(Date.now()),
      });

      channel.dispose();

      const messages = await channel.receive();
      expect(messages).toHaveLength(0);
    });
  });

  // ==========================================================================
  // isAvailable Tests
  // ==========================================================================

  describe("isAvailable", () => {
    it("should return false when not configured", async () => {
      const channel = createZaloChannel();
      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return true when API responds", async () => {
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(
        createMockResponse(0, { oa_id: "987654321" })
      );

      const available = await channel.isAvailable();
      expect(available).toBe(true);
    });

    it("should return false when API fails", async () => {
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(createMockResponse(-1));

      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return false on network error", async () => {
      const channel = createZaloChannel(createTestConfig());

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
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(
        createMockResponse(0, { message_id: "msg123" })
      );

      const result = await channel.send("Hello, CEO!");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/oa/message/text"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            access_token: "test-access-token-123",
          }),
          body: expect.stringContaining("Hello, CEO!"),
        })
      );
    });

    it("should return false when not configured", async () => {
      const channel = createZaloChannel();
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should return false on API error", async () => {
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce(createMockResponse(-1));

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Send Alert Tests
  // ==========================================================================

  describe("sendAlert", () => {
    it("should send formatted alert", async () => {
      const channel = createZaloChannel(createTestConfig());
      const alert = createTestAlert();

      mockFetch.mockResolvedValueOnce(
        createMockResponse(0, { message_id: "msg123" })
      );

      const result = await channel.sendAlert(alert);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/oa/message/text"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Approval Required"),
        })
      );
    });

    it("should include approval ID in alert", async () => {
      const channel = createZaloChannel(createTestConfig());
      const alert = createTestAlert({ approvalId: "test-123" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse(0, { message_id: "msg123" })
      );

      await channel.sendAlert(alert);

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain("test-123");
    });

    it("should return false when not configured", async () => {
      const channel = createZaloChannel();
      const alert = createTestAlert();

      const result = await channel.sendAlert(alert);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockRejectedValueOnce(new Error("Network failed"));

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle API errors gracefully", async () => {
      const channel = createZaloChannel(createTestConfig());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          error: -201,
          message: "Invalid access token",
        }),
      } as Response);

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle message handler errors", async () => {
      const config = createTestConfig();
      const channel = createZaloChannel(config);
      const handler = vi.fn(async () => {
        throw new Error("Handler error");
      });
      channel.onMessage(handler);
      await channel.start();

      // Should not throw
      await expect(
        channel.handleWebhookEvent({
          event_name: "user_send_text",
          app_id: "app123",
          sender: { id: "sender123" },
          recipient: { id: config.oaId },
          message: {
            msg_id: "msg456",
            text: "Test",
          },
          timestamp: String(Date.now()),
        })
      ).resolves.not.toThrow();
    });
  });
});
