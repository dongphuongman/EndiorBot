/**
 * Protocol Converters Tests — Sprint 94
 *
 * Tests bidirectional conversion between old and canonical types.
 *
 * @module tests/protocol/converters
 * @sprint 94
 */

import { describe, it, expect } from "vitest";
import {
  fromInboundMessage,
  toInboundMessage,
  fromOTTMessage,
  fromIncomingMessage,
  toInboundResponse,
} from "../../src/protocol/converters.js";
import type { InboundMessage } from "../../src/gateway/ingress.js";
import type { OTTMessage } from "../../src/channels/ott/message-router.js";
import type { IncomingMessage } from "../../src/channels/types.js";
import type { EndiorResponse } from "../../src/protocol/types.js";

// ============================================================================
// InboundMessage → EndiorMessage
// ============================================================================

describe("fromInboundMessage", () => {
  it("should convert InboundMessage to EndiorMessage", () => {
    const inbound: InboundMessage = {
      channel: "telegram",
      senderId: "user-42",
      content: "Hello bot",
    };

    const msg = fromInboundMessage(inbound, "msg-123");
    expect(msg.id).toBe("telegram-msg-123");
    expect(msg.channel).toBe("telegram");
    expect(msg.senderId).toBe("user-42");
    expect(msg.content).toBe("Hello bot");
    expect(msg.receivedAt).toBeTruthy();
  });

  it("should carry metadata as vendorMeta", () => {
    const inbound: InboundMessage = {
      channel: "web",
      senderId: "user-1",
      content: "Test",
      metadata: { chatId: 999 },
    };

    const msg = fromInboundMessage(inbound);
    expect(msg.vendorMeta).toEqual({ chatId: 999 });
  });
});

// ============================================================================
// EndiorMessage → InboundMessage
// ============================================================================

describe("toInboundMessage", () => {
  it("should convert EndiorMessage back to InboundMessage", () => {
    const inbound: InboundMessage = {
      channel: "telegram",
      senderId: "user-42",
      content: "Hello",
    };
    const canonical = fromInboundMessage(inbound, "v-1");
    const back = toInboundMessage(canonical);

    expect(back.channel).toBe("telegram");
    expect(back.senderId).toBe("user-42");
    expect(back.content).toBe("Hello");
  });

  it("should round-trip preserve data", () => {
    const inbound: InboundMessage = {
      channel: "zalo",
      senderId: "u-99",
      content: "Xin chào",
      metadata: { platform: "zalo" },
    };
    const canonical = fromInboundMessage(inbound, "z-55");
    const back = toInboundMessage(canonical);

    expect(back.channel).toBe(inbound.channel);
    expect(back.senderId).toBe(inbound.senderId);
    expect(back.content).toBe(inbound.content);
    expect(back.metadata).toEqual(inbound.metadata);
  });
});

// ============================================================================
// OTTMessage → EndiorMessage
// ============================================================================

describe("fromOTTMessage", () => {
  it("should map OTTMessage source to canonical channel", () => {
    const ottMsg: OTTMessage = {
      messageId: "ott-1",
      source: "telegram",
      senderId: "tg-user",
      content: "Test OTT",
      receivedAt: new Date("2026-03-08T12:00:00Z"),
    };

    const msg = fromOTTMessage(ottMsg);
    expect(msg.channel).toBe("telegram");
    expect(msg.id).toBe("telegram-ott-1");
    expect(msg.content).toBe("Test OTT");
    expect(msg.receivedAt).toBe("2026-03-08T12:00:00.000Z");
  });

  it("should carry replyTo and metadata", () => {
    const ottMsg: OTTMessage = {
      messageId: "ott-2",
      source: "zalo",
      senderId: "zalo-user",
      content: "Reply",
      receivedAt: new Date("2026-03-08T12:00:00Z"),
      replyTo: "ott-1",
      metadata: { zaloPlatform: true },
    };

    const msg = fromOTTMessage(ottMsg);
    expect(msg.replyToId).toBe("ott-1");
    expect(msg.vendorMeta).toEqual({ zaloPlatform: true });
  });
});

// ============================================================================
// IncomingMessage → EndiorMessage
// ============================================================================

describe("fromIncomingMessage", () => {
  it("should convert with explicit channel parameter", () => {
    const incoming: IncomingMessage = {
      messageId: "inc-1",
      senderId: "sender-1",
      content: "Incoming test",
      receivedAt: new Date("2026-03-08T10:00:00Z"),
    };

    const msg = fromIncomingMessage(incoming, "web");
    expect(msg.channel).toBe("web");
    expect(msg.id).toBe("web-inc-1");
    expect(msg.senderId).toBe("sender-1");
    expect(msg.receivedAt).toBe("2026-03-08T10:00:00.000Z");
  });

  it("should carry senderName and metadata", () => {
    const incoming: IncomingMessage = {
      messageId: "inc-2",
      senderId: "s-2",
      content: "With name",
      receivedAt: new Date("2026-03-08T10:00:00Z"),
      senderName: "Bob",
      metadata: { extra: true },
    };

    const msg = fromIncomingMessage(incoming, "cli");
    expect(msg.senderName).toBe("Bob");
    expect(msg.vendorMeta).toEqual({ extra: true });
  });
});

// ============================================================================
// EndiorResponse → InboundResponse
// ============================================================================

describe("toInboundResponse", () => {
  it("should convert EndiorResponse to InboundResponse", () => {
    const resp: EndiorResponse = {
      text: "Hello!",
      format: "markdown",
    };

    const result = toInboundResponse(resp);
    expect(result.text).toBe("Hello!");
    expect(result.format).toBe("markdown");
  });

  it("should handle minimal response", () => {
    const resp: EndiorResponse = { text: "OK" };
    const result = toInboundResponse(resp);
    expect(result.text).toBe("OK");
    expect(result.format).toBeUndefined();
  });
});
