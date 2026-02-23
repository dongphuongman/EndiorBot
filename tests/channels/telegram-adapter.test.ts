/**
 * Tests for TelegramChannelAdapter
 *
 * @module tests/channels/telegram-adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TelegramChannelAdapter, createTelegramAdapter, shouldSendToTelegram } from "../../src/channels/index.js";
import { TelegramChannel } from "../../src/channels/telegram/telegram-channel.js";
import type { NotificationEvent } from "../../src/budget/notification-system.js";
import type { EscalationAlert } from "../../src/channels/types.js";

// ============================================================================
// Mocks
// ============================================================================

// Mock global fetch for Telegram API
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
    status: ok ? 200 : 400,
    statusText: ok ? "OK" : "Bad Request",
  } as Response;
}

// ============================================================================
// Test Helper
// ============================================================================

// Valid bot token format: <numeric_id>:<35+ char alphanumeric>
const VALID_BOT_TOKEN = "***REMOVED-TELEGRAM-BOT-TOKEN***90";

function createTelegramChannel(): TelegramChannel {
  return new TelegramChannel({
    botToken: VALID_BOT_TOKEN,
    chatId: "987654321",
    parseMode: "Markdown",
    enablePolling: false,
    pollingInterval: 1000,
    disableNotification: false,
  });
}

function createNotificationEvent(
  type: NotificationEvent["type"],
  priority: NotificationEvent["priority"],
  metadata?: Record<string, unknown>
): NotificationEvent {
  return {
    type,
    priority,
    title: `Test ${type}`,
    message: `Test message for ${type}`,
    timestamp: new Date(),
    metadata,
  };
}

// ============================================================================
// TelegramChannelAdapter Tests
// ============================================================================

describe("TelegramChannelAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response for getMe
    mockFetch.mockResolvedValue(
      createMockResponse({
        ok: true,
        result: { id: 123456, username: "test_bot" },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create adapter with default enabled state", () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);

      expect(adapter.name).toBe("telegram");
      expect(adapter.isEnabled()).toBe(true);
    });

    it("should create adapter with custom enabled state", () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel, false);

      expect(adapter.isEnabled()).toBe(false);
    });
  });

  describe("isEnabled", () => {
    it("should return enabled state", () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel, true);

      expect(adapter.isEnabled()).toBe(true);
    });

    it("should allow toggling enabled state", () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);

      adapter.setEnabled(false);
      expect(adapter.isEnabled()).toBe(false);

      adapter.setEnabled(true);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe("send", () => {
    it("should not send when disabled", async () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel, false);
      const event = createNotificationEvent("budget_warning", "medium");

      await adapter.send(event);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should check availability on first send", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456, username: "test_bot" } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("budget_warning", "medium");

      await adapter.send(event);

      // First call is getMe (availability check), second is sendMessage
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should send budget_warning as EscalationAlert", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("budget_warning", "high");

      await adapter.send(event);

      // Verify sendMessage was called with Markdown
      const sendCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes("sendMessage")
      );
      expect(sendCall).toBeDefined();

      const body = JSON.parse(sendCall![1].body as string);
      expect(body.parse_mode).toBe("Markdown");
    });

    it("should send budget_limit as EscalationAlert", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("budget_limit", "critical");

      await adapter.send(event);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should send approval_needed with action hints", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("approval_needed", "high", {
        approvalId: "test-123",
        reason: "Budget exceeded",
      });

      await adapter.send(event);

      const sendCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes("sendMessage")
      );
      const body = JSON.parse(sendCall![1].body as string);

      // Should contain approval actions
      expect(body.text).toContain("/approve test-123");
      expect(body.text).toContain("/reject test-123");
    });

    it("should send escalation as EscalationAlert", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("escalation", "high");

      await adapter.send(event);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should send non-escalation events as plain message", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("daily_reset", "low");

      await adapter.send(event);

      // Should still send, but as plain message
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should send model_switched as plain message", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { message_id: 1 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("model_switched", "medium", {
        fromModel: "opus",
        toModel: "sonnet",
      });

      await adapter.send(event);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should disable adapter when channel unavailable", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: false, description: "Unauthorized" }, false)
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);
      const event = createNotificationEvent("budget_warning", "medium");

      await adapter.send(event);

      expect(adapter.isEnabled()).toBe(false);
    });
  });

  describe("checkAvailability", () => {
    it("should return false when disabled", async () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel, false);

      const available = await adapter.checkAvailability();

      expect(available).toBe(false);
    });

    it("should check Telegram API availability", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: true, result: { id: 123456 } })
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);

      const available = await adapter.checkAvailability();

      expect(available).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("getMe"),
        expect.any(Object)
      );
    });

    it("should return false when API unavailable", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ ok: false, description: "Invalid token" }, false)
      );

      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);

      const available = await adapter.checkAvailability();

      expect(available).toBe(false);
    });
  });

  describe("getChannel", () => {
    it("should return underlying TelegramChannel", () => {
      const channel = createTelegramChannel();
      const adapter = new TelegramChannelAdapter(channel);

      const underlying = adapter.getChannel();

      expect(underlying).toBe(channel);
      expect(underlying).toBeInstanceOf(TelegramChannel);
    });
  });
});

// ============================================================================
// createTelegramAdapter Tests
// ============================================================================

describe("createTelegramAdapter", () => {
  it("should create adapter with default enabled", () => {
    const channel = createTelegramChannel();
    const adapter = createTelegramAdapter(channel);

    expect(adapter).toBeInstanceOf(TelegramChannelAdapter);
    expect(adapter.isEnabled()).toBe(true);
  });

  it("should create adapter with custom enabled", () => {
    const channel = createTelegramChannel();
    const adapter = createTelegramAdapter(channel, false);

    expect(adapter.isEnabled()).toBe(false);
  });
});

// ============================================================================
// shouldSendToTelegram Tests
// ============================================================================

describe("shouldSendToTelegram", () => {
  it("should return true for critical events", () => {
    const event = createNotificationEvent("daily_reset", "critical");
    expect(shouldSendToTelegram(event)).toBe(true);
  });

  it("should return true for high priority escalation events", () => {
    const event = createNotificationEvent("budget_warning", "high");
    expect(shouldSendToTelegram(event)).toBe(true);
  });

  it("should return true for approval_needed regardless of priority", () => {
    const event = createNotificationEvent("approval_needed", "medium");
    expect(shouldSendToTelegram(event)).toBe(true);
  });

  it("should return false for low priority non-escalation events", () => {
    const event = createNotificationEvent("daily_reset", "low");
    expect(shouldSendToTelegram(event)).toBe(false);
  });

  it("should return false for medium priority non-escalation events", () => {
    const event = createNotificationEvent("model_switched", "medium");
    expect(shouldSendToTelegram(event)).toBe(false);
  });

  it("should return true for high priority budget_limit", () => {
    const event = createNotificationEvent("budget_limit", "high");
    expect(shouldSendToTelegram(event)).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("TelegramChannelAdapter Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should work with NotificationSystem pattern", async () => {
    // Simulate NotificationSystem flow
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ ok: true, result: { id: 123456 } })
    );
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ ok: true, result: { message_id: 1 } })
    );

    const channel = createTelegramChannel();
    const adapter = new TelegramChannelAdapter(channel);

    // This is how NotificationSystem calls channels
    if (adapter.isEnabled()) {
      const event: NotificationEvent = {
        type: "approval_needed",
        priority: "critical",
        title: "APPROVAL NEEDED",
        message: "Budget increase requires CEO approval",
        timestamp: new Date(),
        metadata: { approvalId: "apr-001", reason: "Budget exceeded" },
      };

      await adapter.send(event);
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the message format
    const sendCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes("sendMessage")
    );
    const body = JSON.parse(sendCall![1].body as string);
    expect(body.text).toContain("/approve apr-001");
  });

  it("should handle projectId in metadata", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ ok: true, result: { id: 123456 } })
    );
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ ok: true, result: { message_id: 1 } })
    );

    const channel = createTelegramChannel();
    const adapter = new TelegramChannelAdapter(channel);

    const event: NotificationEvent = {
      type: "budget_warning",
      priority: "high",
      title: "Budget Warning",
      message: "Session budget at 80%",
      timestamp: new Date(),
      metadata: { projectId: "bflow", percentUsed: 80 },
    };

    await adapter.send(event);

    const sendCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes("sendMessage")
    );
    const body = JSON.parse(sendCall![1].body as string);
    expect(body.text).toContain("bflow");
  });
});
