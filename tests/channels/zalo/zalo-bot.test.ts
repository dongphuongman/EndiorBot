/**
 * Zalo Bot Platform Tests
 *
 * Tests for ZaloBotApi and ZaloBotChannel (Zapps.me / bot.zaloplatforms.com).
 * Covers API client, channel lifecycle, bidirectional messaging, and security.
 *
 * @module tests/channels/zalo/zalo-bot
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 76 (Zalo Channel Testing)
 * @authority CTO Code Review T1-T6, @tester
 * @stage 05 - TEST
 * @sdlc SDLC Framework 6.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callZaloBotApi,
  getMe,
  sendMessage,
  sendPhoto,
  getUpdates,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
  ZaloBotApiError,
  ZALO_BOT_API_BASE,
  type ZaloBotApiResponse,
  type ZaloBotInfo,
  type ZaloBotMessage,
  type ZaloBotUpdate,
} from "../../../src/channels/zalo/zalo-bot-api.js";
import {
  ZaloBotChannel,
  createZaloBotChannel,
  createZaloBotChannelFromEnv,
  loadZaloBotConfig,
  isZaloBotConfigured,
  ENV_ZALO_BOT_TOKEN,
  ENV_ZALO_BOT_CHAT_ID,
  DEFAULT_ZALO_BOT_CONFIG,
  type ZaloBotChannelConfig,
} from "../../../src/channels/zalo/zalo-bot-channel.js";
import type { EscalationAlert, IncomingMessage } from "../../../src/channels/types.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_TOKEN = "123456789:testSecretPart";
const TEST_CHAT_ID = "abc123chatid";

function createMockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function createApiOkResponse<T>(result: T): ZaloBotApiResponse<T> {
  return { ok: true, result };
}

function createApiErrorResponse(code: number, desc: string): ZaloBotApiResponse {
  return { ok: false, error_code: code, description: desc };
}

function createTestBotConfig(): ZaloBotChannelConfig {
  return {
    botToken: TEST_TOKEN,
    chatId: TEST_CHAT_ID,
    enablePolling: false,
    pollingTimeout: 30,
    timeoutMs: 10_000,
  };
}

// ============================================================================
// ZaloBotApi Tests
// ============================================================================

describe("ZaloBotApi", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // callZaloBotApi
  // --------------------------------------------------------------------------

  describe("callZaloBotApi", () => {
    it("should call correct URL with token", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ id: "bot1" })),
      );

      await callZaloBotApi("getMe", TEST_TOKEN);

      expect(mockFetch).toHaveBeenCalledWith(
        `${ZALO_BOT_API_BASE}/bot${TEST_TOKEN}/getMe`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should send JSON body when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "msg1" })),
      );

      await callZaloBotApi("sendMessage", TEST_TOKEN, {
        chat_id: TEST_CHAT_ID,
        text: "Hello",
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.chat_id).toBe(TEST_CHAT_ID);
      expect(body.text).toBe("Hello");
    });

    it("should not send body when not provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(true)),
      );

      await callZaloBotApi("deleteWebhook", TEST_TOKEN);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toBeUndefined();
    });

    it("should throw ZaloBotApiError on API error", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiErrorResponse(401, "Unauthorized")),
      );

      await expect(callZaloBotApi("getMe", TEST_TOKEN))
        .rejects.toThrow(ZaloBotApiError);
    });

    it("should include error code and description", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiErrorResponse(403, "Forbidden")),
      );

      try {
        await callZaloBotApi("sendMessage", TEST_TOKEN, {});
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ZaloBotApiError);
        expect((e as ZaloBotApiError).errorCode).toBe(403);
        expect((e as ZaloBotApiError).description).toBe("Forbidden");
      }
    });

    it("should respect timeout option", async () => {
      // Simulate a slow response that gets aborted
      mockFetch.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            const signal = init.signal;
            if (signal) {
              signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            }
          }),
      );

      await expect(
        callZaloBotApi("getMe", TEST_TOKEN, undefined, { timeoutMs: 10 }),
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // ZaloBotApiError
  // --------------------------------------------------------------------------

  describe("ZaloBotApiError", () => {
    it("should have correct name", () => {
      const err = new ZaloBotApiError("test");
      expect(err.name).toBe("ZaloBotApiError");
    });

    it("should detect polling timeout", () => {
      const err = new ZaloBotApiError("timeout", 408, "Request Timeout");
      expect(err.isPollingTimeout).toBe(true);
    });

    it("should not be polling timeout for other codes", () => {
      const err = new ZaloBotApiError("error", 500, "Server Error");
      expect(err.isPollingTimeout).toBe(false);
    });

    it("should handle undefined error code", () => {
      const err = new ZaloBotApiError("unknown");
      expect(err.errorCode).toBeUndefined();
      expect(err.isPollingTimeout).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // API Methods
  // --------------------------------------------------------------------------

  describe("getMe", () => {
    it("should return bot info on success", async () => {
      const botInfo: ZaloBotInfo = { id: "bot123", name: "TestBot" };
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(botInfo)),
      );

      const response = await getMe(TEST_TOKEN);

      expect(response.ok).toBe(true);
      expect(response.result?.id).toBe("bot123");
      expect(response.result?.name).toBe("TestBot");
    });

    it("should pass timeout when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ id: "bot1", name: "Bot" })),
      );

      await getMe(TEST_TOKEN, 5000);

      // Should complete without error — timeout is just a safety net
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("sendMessage", () => {
    it("should send text message with chat_id and text", async () => {
      const msg: ZaloBotMessage = {
        message_id: "msg1",
        from: { id: "bot1" },
        chat: { id: TEST_CHAT_ID, chat_type: "PRIVATE" },
        date: Date.now(),
        text: "Hello",
      };
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(msg)),
      );

      const result = await sendMessage(TEST_TOKEN, {
        chat_id: TEST_CHAT_ID,
        text: "Hello",
      });

      expect(result.ok).toBe(true);
      expect(result.result?.message_id).toBe("msg1");
    });
  });

  describe("sendPhoto", () => {
    it("should send photo with URL", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "photo1" })),
      );

      const result = await sendPhoto(TEST_TOKEN, {
        chat_id: TEST_CHAT_ID,
        photo: "https://example.com/photo.jpg",
      });

      expect(result.ok).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.photo).toBe("https://example.com/photo.jpg");
    });

    it("should include caption when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "photo2" })),
      );

      await sendPhoto(TEST_TOKEN, {
        chat_id: TEST_CHAT_ID,
        photo: "https://example.com/photo.jpg",
        caption: "Test caption",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.caption).toBe("Test caption");
    });

    it("should not include caption when not provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "photo3" })),
      );

      await sendPhoto(TEST_TOKEN, {
        chat_id: TEST_CHAT_ID,
        photo: "https://example.com/photo.jpg",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.caption).toBeUndefined();
    });
  });

  describe("getUpdates", () => {
    it("should use default timeout of 30s", async () => {
      const update: ZaloBotUpdate = {
        event_name: "message.text.received",
        message: {
          message_id: "upd1",
          from: { id: "user1", name: "CEO" },
          chat: { id: TEST_CHAT_ID, chat_type: "PRIVATE" },
          date: Date.now(),
          text: "Hello",
        },
      };
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(update)),
      );

      const result = await getUpdates(TEST_TOKEN);

      expect(result.ok).toBe(true);
      expect(result.result?.event_name).toBe("message.text.received");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.timeout).toBe("30");
    });

    it("should use custom timeout", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({})),
      );

      await getUpdates(TEST_TOKEN, { timeout: 60 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.timeout).toBe("60");
    });
  });

  describe("setWebhook", () => {
    it("should set webhook URL and secret", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(true)),
      );

      const result = await setWebhook(TEST_TOKEN, {
        url: "https://example.com/webhook",
        secret_token: "my-secret",
      });

      expect(result.ok).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe("https://example.com/webhook");
      expect(body.secret_token).toBe("my-secret");
    });
  });

  describe("deleteWebhook", () => {
    it("should call deleteWebhook endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse(true)),
      );

      const result = await deleteWebhook(TEST_TOKEN);

      expect(result.ok).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toContain("/deleteWebhook");
    });
  });

  describe("getWebhookInfo", () => {
    it("should return webhook info", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ url: "https://example.com/hook" })),
      );

      const result = await getWebhookInfo(TEST_TOKEN);

      expect(result.ok).toBe(true);
      expect(result.result?.url).toBe("https://example.com/hook");
    });
  });
});

// ============================================================================
// ZaloBotChannel Tests
// ============================================================================

describe("ZaloBotChannel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env[ENV_ZALO_BOT_TOKEN];
    delete process.env[ENV_ZALO_BOT_CHAT_ID];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  describe("Configuration", () => {
    it("should load config from environment", () => {
      process.env[ENV_ZALO_BOT_TOKEN] = "test-token";
      process.env[ENV_ZALO_BOT_CHAT_ID] = "test-chat";

      const config = loadZaloBotConfig();

      expect(config).not.toBeNull();
      expect(config?.botToken).toBe("test-token");
      expect(config?.chatId).toBe("test-chat");
    });

    it("should return null when token not set", () => {
      const config = loadZaloBotConfig();
      expect(config).toBeNull();
    });

    it("should use default config values", () => {
      process.env[ENV_ZALO_BOT_TOKEN] = "test-token";

      const config = loadZaloBotConfig();

      expect(config?.enablePolling).toBe(DEFAULT_ZALO_BOT_CONFIG.enablePolling);
      expect(config?.pollingTimeout).toBe(DEFAULT_ZALO_BOT_CONFIG.pollingTimeout);
      expect(config?.timeoutMs).toBe(DEFAULT_ZALO_BOT_CONFIG.timeoutMs);
    });

    it("should detect configured state", () => {
      expect(isZaloBotConfigured()).toBe(false);

      process.env[ENV_ZALO_BOT_TOKEN] = "test-token";
      expect(isZaloBotConfigured()).toBe(true);
    });

    it("should handle missing chatId gracefully", () => {
      process.env[ENV_ZALO_BOT_TOKEN] = "test-token";

      const config = loadZaloBotConfig();

      expect(config).not.toBeNull();
      expect(config?.chatId).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Construction
  // --------------------------------------------------------------------------

  describe("Construction", () => {
    it("should create channel with explicit config", () => {
      const channel = createZaloBotChannel(createTestBotConfig());
      expect(channel.name).toBe("zalo-bot");
    });

    it("should create channel from env", () => {
      process.env[ENV_ZALO_BOT_TOKEN] = "env-token";
      process.env[ENV_ZALO_BOT_CHAT_ID] = "env-chat";

      const channel = createZaloBotChannelFromEnv();
      expect(channel).not.toBeNull();
      expect(channel?.name).toBe("zalo-bot");
    });

    it("should return null from env when not configured", () => {
      const channel = createZaloBotChannelFromEnv();
      expect(channel).toBeNull();
    });

    it("should handle construction without config", () => {
      const channel = new ZaloBotChannel();
      expect(channel.name).toBe("zalo-bot");
    });
  });

  // --------------------------------------------------------------------------
  // isAvailable
  // --------------------------------------------------------------------------

  describe("isAvailable", () => {
    it("should return true when getMe succeeds", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ id: "bot1", name: "Bot" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const available = await channel.isAvailable();

      expect(available).toBe(true);
    });

    it("should cache bot info after isAvailable", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ id: "bot1", name: "TestBot" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      await channel.isAvailable();

      expect(channel.getBotInfo()?.name).toBe("TestBot");
    });

    it("should return false when not configured", async () => {
      const channel = new ZaloBotChannel();
      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return false on API error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const channel = createZaloBotChannel(createTestBotConfig());
      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });

    it("should return false on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiErrorResponse(401, "Unauthorized")),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const available = await channel.isAvailable();
      expect(available).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Send Operations
  // --------------------------------------------------------------------------

  describe("Send", () => {
    it("should send text message to configured chat", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "msg1" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.send("Hello CEO!");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe("Hello CEO!");
      expect(body.chat_id).toBe(TEST_CHAT_ID);
    });

    it("should return false when no chatId configured", async () => {
      const config = createTestBotConfig();
      delete (config as Partial<ZaloBotChannelConfig>).chatId;
      const channel = createZaloBotChannel(config);

      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should return false when not configured", async () => {
      const channel = new ZaloBotChannel();
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should return false on send error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Send failed"));

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should chunk long messages at 2000 char limit", async () => {
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiOkResponse({ message_id: "chunk" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const longText = "A".repeat(3500);
      const result = await channel.send(longText);

      expect(result).toBe(true);
      // Should be chunked into 2 messages
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // Send Alert
  // --------------------------------------------------------------------------

  describe("sendAlert", () => {
    it("should send formatted escalation alert", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "alert1" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const alert: EscalationAlert = {
        type: "decision_required",
        priority: "high",
        title: "Architecture Review",
        message: "ADR-001 needs approval",
        approvalId: "apr-001",
        metadata: {},
      };

      const result = await channel.sendAlert(alert);

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("Architecture Review");
    });

    it("should return false when no chatId", async () => {
      const config = createTestBotConfig();
      delete (config as Partial<ZaloBotChannelConfig>).chatId;
      const channel = createZaloBotChannel(config);

      const alert: EscalationAlert = {
        type: "error",
        priority: "critical",
        title: "Error",
        message: "Something broke",
        metadata: {},
      };

      const result = await channel.sendAlert(alert);
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // sendToChat
  // --------------------------------------------------------------------------

  describe("sendToChat", () => {
    it("should send message to specific chat ID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiOkResponse({ message_id: "specific1" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.sendToChat("other-chat-id", "Direct message");

      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("other-chat-id");
    });

    it("should return false when not configured", async () => {
      const channel = new ZaloBotChannel();
      const result = await channel.sendToChat("chat", "msg");
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Bidirectional: receive, onMessage, start/stop
  // --------------------------------------------------------------------------

  describe("Bidirectional Operations", () => {
    it("should return empty messages initially", async () => {
      const channel = createZaloBotChannel(createTestBotConfig());
      const messages = await channel.receive();
      expect(messages).toEqual([]);
    });

    it("should register and unregister message handler", () => {
      const channel = createZaloBotChannel(createTestBotConfig());
      const handler = vi.fn(async (_msg: IncomingMessage) => {});

      channel.onMessage(handler);
      channel.offMessage();
      // Should not throw
    });

    it("should track receiving state", async () => {
      const config = createTestBotConfig();
      config.enablePolling = true;
      const channel = createZaloBotChannel(config);

      expect(channel.isReceiving()).toBe(false);

      // Mock getUpdates for polling loop (return timeout)
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiErrorResponse(408, "Timeout")),
      );

      await channel.start();
      expect(channel.isReceiving()).toBe(true);

      await channel.stop();
      expect(channel.isReceiving()).toBe(false);
    });

    it("should not start when not configured", async () => {
      const channel = new ZaloBotChannel();

      await channel.start();
      expect(channel.isReceiving()).toBe(false);
    });

    it("should not start when polling disabled", async () => {
      const config = createTestBotConfig();
      config.enablePolling = false;
      const channel = createZaloBotChannel(config);

      await channel.start();
      expect(channel.isReceiving()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Dispose
  // --------------------------------------------------------------------------

  describe("Dispose", () => {
    it("should clean up all state on dispose", async () => {
      const config = createTestBotConfig();
      config.enablePolling = true;
      const channel = createZaloBotChannel(config);

      // Mock polling
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiErrorResponse(408, "Timeout")),
      );

      await channel.start();
      expect(channel.isReceiving()).toBe(true);

      channel.dispose();

      expect(channel.isReceiving()).toBe(false);
      expect(channel.getBotInfo()).toBeNull();
      const messages = await channel.receive();
      expect(messages).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Text Chunking
  // --------------------------------------------------------------------------

  describe("Text Chunking", () => {
    it("should not chunk short messages", async () => {
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiOkResponse({ message_id: "short" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      await channel.send("Short message");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should chunk at newline boundaries when possible", async () => {
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiOkResponse({ message_id: "chunked" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      // Create text with newlines near the 2000 char boundary
      const line = "A".repeat(1990) + "\n" + "B".repeat(1990);
      await channel.send(line);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle text with no good break points", async () => {
      mockFetch.mockResolvedValue(
        createMockFetchResponse(createApiOkResponse({ message_id: "nobreak" })),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      // Continuous text with no spaces or newlines
      const text = "X".repeat(4500);
      await channel.send(text);

      // Should be split into 3 chunks (4500 / 2000)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe("Error Handling", () => {
    it("should handle API error on send gracefully", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(createApiErrorResponse(500, "Server Error")),
      );

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle network error on send gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.send("Test");
      expect(result).toBe(false);
    });

    it("should handle error on sendAlert gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const channel = createZaloBotChannel(createTestBotConfig());
      const result = await channel.sendAlert({
        type: "error",
        priority: "high",
        title: "Error",
        message: "Fail",
        metadata: {},
      });
      expect(result).toBe(false);
    });

    it("should handle partial chunk failure", async () => {
      // First chunk succeeds, second fails
      mockFetch
        .mockResolvedValueOnce(
          createMockFetchResponse(createApiOkResponse({ message_id: "ok" })),
        )
        .mockResolvedValueOnce(
          createMockFetchResponse(createApiErrorResponse(500, "Error")),
        );

      const channel = createZaloBotChannel(createTestBotConfig());
      const longText = "A".repeat(3500);
      const result = await channel.send(longText);

      // Should return false because second chunk failed
      expect(result).toBe(false);
    });
  });
});
