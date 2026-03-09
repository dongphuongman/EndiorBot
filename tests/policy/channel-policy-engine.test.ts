/**
 * Channel Policy Engine Tests — Sprint 94
 *
 * Tests per-channel rate limiting, override, and statistics.
 *
 * @module tests/policy/channel-policy-engine
 * @sprint 94
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ChannelPolicyEngine } from "../../src/policy/channel-policy-engine.js";

// ============================================================================
// Tests
// ============================================================================

describe("ChannelPolicyEngine", () => {
  let engine: ChannelPolicyEngine;

  beforeEach(() => {
    engine = new ChannelPolicyEngine();
  });

  // --------------------------------------------------------------------------
  // check — under limit
  // --------------------------------------------------------------------------

  it("should allow message under rate limit", () => {
    const result = engine.check("telegram", "user-1", "message");

    expect(result.allowed).toBe(true);
    expect(result.scope).toBe("message");
    expect(result.remaining).toBeDefined();
    expect(result.remaining!).toBe(29); // 30 - 1
  });

  // --------------------------------------------------------------------------
  // check — over limit
  // --------------------------------------------------------------------------

  it("should deny message when rate limit exceeded", () => {
    // Fill up the Telegram limit (30 msgs/min)
    for (let i = 0; i < 30; i++) {
      engine.check("telegram", "user-1", "message");
    }

    const result = engine.check("telegram", "user-1", "message");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit exceeded");
    expect(result.remaining).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Telegram policy (30 msgs/min)
  // --------------------------------------------------------------------------

  it("should enforce Telegram 30 msgs/min policy", () => {
    const policy = engine.getPolicy("telegram");
    expect(policy?.messagesPerMinute).toBe(30);
    expect(policy?.commandsPerMinute).toBe(20);
    expect(policy?.maxMessageLength).toBe(4096);
    expect(policy?.requireSanitization).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Zalo policy (20 msgs/min — stricter)
  // --------------------------------------------------------------------------

  it("should enforce Zalo 20 msgs/min policy (stricter)", () => {
    const policy = engine.getPolicy("zalo");
    expect(policy?.messagesPerMinute).toBe(20);
    expect(policy?.commandsPerMinute).toBe(15);

    // Fill up Zalo limit
    for (let i = 0; i < 20; i++) {
      engine.check("zalo", "z-user", "message");
    }

    const result = engine.check("zalo", "z-user", "message");
    expect(result.allowed).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Web policy (60 msgs/min — more lenient)
  // --------------------------------------------------------------------------

  it("should enforce Web 60 msgs/min policy", () => {
    const policy = engine.getPolicy("web");
    expect(policy?.messagesPerMinute).toBe(60);
    expect(policy?.commandsPerMinute).toBe(30);

    // 30 messages should still be under Web limit
    for (let i = 0; i < 30; i++) {
      engine.check("web", "web-user", "message");
    }

    const result = engine.check("web", "web-user", "message");
    expect(result.allowed).toBe(true);
  });

  // --------------------------------------------------------------------------
  // overridePolicy
  // --------------------------------------------------------------------------

  it("should override policy for a channel", () => {
    engine.overridePolicy("telegram", { messagesPerMinute: 5 });

    const policy = engine.getPolicy("telegram");
    expect(policy?.messagesPerMinute).toBe(5);

    // Fill the new limit
    for (let i = 0; i < 5; i++) {
      engine.check("telegram", "user-1", "message");
    }

    const result = engine.check("telegram", "user-1", "message");
    expect(result.allowed).toBe(false);
  });

  // --------------------------------------------------------------------------
  // resetLimits
  // --------------------------------------------------------------------------

  it("should reset rate limits for a sender", () => {
    // Fill up
    for (let i = 0; i < 30; i++) {
      engine.check("telegram", "user-1", "message");
    }

    // Verify blocked
    expect(engine.check("telegram", "user-1", "message").allowed).toBe(false);

    // Reset
    engine.resetLimits("telegram", "user-1");

    // Should be allowed again
    expect(engine.check("telegram", "user-1", "message").allowed).toBe(true);
  });

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------

  it("should return per-channel statistics", () => {
    engine.check("telegram", "user-1", "message");
    engine.check("telegram", "user-1", "message");
    engine.check("zalo", "z-user", "message");

    const stats = engine.getStats();
    expect(stats.length).toBeGreaterThan(0);

    const tgStats = stats.find((s) => s.channel === "telegram");
    expect(tgStats?.totalMessages).toBe(2);
    expect(tgStats?.totalDenied).toBe(0);
    expect(tgStats?.currentRate).toBe(2);

    const zaloStats = stats.find((s) => s.channel === "zalo");
    expect(zaloStats?.totalMessages).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Content length check
  // --------------------------------------------------------------------------

  it("should deny content exceeding channel max length", () => {
    const result = engine.checkContentLength("telegram", 5000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("4096");
  });

  it("should allow content within channel max length", () => {
    const result = engine.checkContentLength("telegram", 100);
    expect(result.allowed).toBe(true);
  });
});
