/**
 * Integration: Canonical Flow — Sprint 94
 *
 * E2E test: OTTMessage → EndiorMessage → PolicyEngine → response.
 *
 * @module tests/integration/canonical-flow
 * @sprint 94
 */

import { describe, it, expect } from "vitest";
import { fromOTTMessage } from "../../src/protocol/converters.js";
import { isValidEndiorMessage } from "../../src/protocol/validators.js";
import { ChannelPolicyEngine } from "../../src/policy/channel-policy-engine.js";
import type { OTTMessage } from "../../src/channels/ott/message-router.js";

describe("Canonical Flow Integration", () => {
  it("should flow OTTMessage → EndiorMessage → policy check → allowed", () => {
    // 1. Raw OTT message from Telegram
    const ottMsg: OTTMessage = {
      messageId: "tg-12345",
      source: "telegram",
      senderId: "user-42",
      content: "Hello EndiorBot!",
      receivedAt: new Date("2026-03-08T12:00:00Z"),
    };

    // 2. Convert to canonical EndiorMessage
    const canonical = fromOTTMessage(ottMsg);
    expect(isValidEndiorMessage(canonical)).toBe(true);
    expect(canonical.id).toBe("telegram-tg-12345");
    expect(canonical.channel).toBe("telegram");

    // 3. Policy check
    const engine = new ChannelPolicyEngine();
    const result = engine.check(canonical.channel, canonical.senderId, "message");
    expect(result.allowed).toBe(true);

    // 4. Content check
    const contentResult = engine.checkContentLength(
      canonical.channel,
      canonical.content.length,
    );
    expect(contentResult.allowed).toBe(true);
  });

  it("should deny message exceeding channel limits", () => {
    // Zalo has 2000 char limit
    const longContent = "x".repeat(3000);

    const ottMsg: OTTMessage = {
      messageId: "zalo-99",
      source: "zalo",
      senderId: "z-user",
      content: longContent,
      receivedAt: new Date("2026-03-08T12:00:00Z"),
    };

    const canonical = fromOTTMessage(ottMsg);
    expect(isValidEndiorMessage(canonical)).toBe(true);

    const engine = new ChannelPolicyEngine();
    const contentResult = engine.checkContentLength(
      canonical.channel,
      canonical.content.length,
    );
    expect(contentResult.allowed).toBe(false);
    expect(contentResult.reason).toContain("2000");
  });
});
