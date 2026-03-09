/**
 * Protocol Types Tests — Sprint 94
 *
 * Tests canonical types, validators, and ID generation.
 *
 * @module tests/protocol/types
 * @sprint 94
 */

import { describe, it, expect } from "vitest";
import {
  CHANNEL_SOURCES,
  type ChannelSource,
  type EndiorMessage,
  type EndiorRequest,
  type EndiorResponse,
} from "../../src/protocol/types.js";
import {
  isValidChannelSource,
  isValidEndiorMessage,
  validateMessageContent,
  generateMessageId,
} from "../../src/protocol/validators.js";

// ============================================================================
// EndiorMessage Creation
// ============================================================================

describe("EndiorMessage", () => {
  it("should have all required fields", () => {
    const msg: EndiorMessage = {
      id: "telegram-12345",
      channel: "telegram",
      senderId: "user-1",
      content: "Hello",
      receivedAt: new Date().toISOString(),
    };

    expect(msg.id).toBe("telegram-12345");
    expect(msg.channel).toBe("telegram");
    expect(msg.senderId).toBe("user-1");
    expect(msg.content).toBe("Hello");
    expect(msg.receivedAt).toBeTruthy();
  });

  it("should support optional fields", () => {
    const msg: EndiorMessage = {
      id: "web-99",
      channel: "web",
      senderId: "user-2",
      content: "Hi",
      receivedAt: new Date().toISOString(),
      replyToId: "web-98",
      senderName: "Alice",
      vendorMeta: { origin: "browser", userAgent: "Chrome/120" },
    };

    expect(msg.replyToId).toBe("web-98");
    expect(msg.senderName).toBe("Alice");
    expect(msg.vendorMeta).toEqual({ origin: "browser", userAgent: "Chrome/120" });
  });
});

// ============================================================================
// isValidEndiorMessage
// ============================================================================

describe("isValidEndiorMessage", () => {
  it("should return true for valid message", () => {
    const msg = {
      id: "telegram-1",
      channel: "telegram",
      senderId: "user-1",
      content: "Hello",
      receivedAt: "2026-03-08T00:00:00.000Z",
    };
    expect(isValidEndiorMessage(msg)).toBe(true);
  });

  it("should return false for missing required fields", () => {
    expect(isValidEndiorMessage(null)).toBe(false);
    expect(isValidEndiorMessage({})).toBe(false);
    expect(isValidEndiorMessage({ id: "a" })).toBe(false);
    expect(isValidEndiorMessage({ id: "a", channel: "telegram" })).toBe(false);
    expect(isValidEndiorMessage({
      id: "a",
      channel: "telegram",
      senderId: "u",
      content: "x",
      // missing receivedAt
    })).toBe(false);
  });

  it("should reject empty id", () => {
    expect(isValidEndiorMessage({
      id: "",
      channel: "telegram",
      senderId: "u",
      content: "x",
      receivedAt: "2026-03-08T00:00:00.000Z",
    })).toBe(false);
  });

  it("should reject invalid channel", () => {
    expect(isValidEndiorMessage({
      id: "a",
      channel: "fax",
      senderId: "u",
      content: "x",
      receivedAt: "2026-03-08T00:00:00.000Z",
    })).toBe(false);
  });
});

// ============================================================================
// isValidChannelSource
// ============================================================================

describe("isValidChannelSource", () => {
  it("should validate known channels", () => {
    for (const ch of CHANNEL_SOURCES) {
      expect(isValidChannelSource(ch)).toBe(true);
    }
  });

  it("should reject unknown channels", () => {
    expect(isValidChannelSource("fax")).toBe(false);
    expect(isValidChannelSource("")).toBe(false);
    expect(isValidChannelSource("TELEGRAM")).toBe(false);
  });
});

// ============================================================================
// validateMessageContent
// ============================================================================

describe("validateMessageContent", () => {
  it("should return null for valid content", () => {
    expect(validateMessageContent("Hello world", 4096)).toBeNull();
  });

  it("should reject empty content", () => {
    expect(validateMessageContent("", 4096)).toBe("Empty message content");
  });

  it("should reject content exceeding maxLength", () => {
    const long = "x".repeat(5000);
    const reason = validateMessageContent(long, 4096);
    expect(reason).toContain("exceeds");
    expect(reason).toContain("4096");
  });
});

// ============================================================================
// generateMessageId (CTO F4)
// ============================================================================

describe("generateMessageId", () => {
  it("should use channel-vendorId format", () => {
    const id = generateMessageId("telegram", "12345");
    expect(id).toBe("telegram-12345");
  });

  it("should fallback to channel-timestamp-counter when no vendorId", () => {
    const id = generateMessageId("web");
    expect(id).toMatch(/^web-\d+-\d+$/);
  });
});
