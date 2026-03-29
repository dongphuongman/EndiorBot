/**
 * Web UI Command Integration Tests — Sprint 121 T5-B
 *
 * Verifies that Web UI commands route through GatewayIngress → CommandDispatcher
 * the same way as Telegram/Zalo commands (ADR-035 AD-2).
 *
 * @module tests/gateway/web-commands
 * @sprint 121
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GatewayIngress } from "../../src/gateway/ingress.js";
import { CommandDispatcher } from "../../src/commands/command-dispatcher.js";

// ============================================================================
// Mock ChannelRouter (minimal — same pattern as ingress.test.ts)
// ============================================================================

function createMockRouter() {
  return {
    routeMessage: async (text: string) => {
      const match = text.match(/@(\w+)\s+(.*)/);
      if (match) return { agents: [match[1]], task: match[2] };
      return null;
    },
    callAI: async (agent: string, task: string) => ({
      content: `[${agent}] Response to: ${task}`,
      provider: "mock",
      durationMs: 50,
    }),
    formatResponse: (agent: string, result: { content: string }) =>
      `@${agent}: ${result.content}`,
    getUsageHint: () => "Use @agent to start a conversation.",
    config: { projectRoot: "/mock/project" },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Web UI Command Integration (ADR-035)", () => {
  let dispatcher: CommandDispatcher;
  let ingress: GatewayIngress;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();

    // Register commands that Web UI should support
    dispatcher.register("help", async () => ({
      success: true,
      response: "Available commands: /help, /sessions, /gate",
      format: "markdown" as const,
    }));

    dispatcher.register("sessions", async () => ({
      success: true,
      response: "Active sessions: 2",
    }));

    dispatcher.register("gate", async (ctx) => ({
      success: true,
      response: `Gate ${ctx.args[0] ?? "all"}: PASS`,
      format: "markdown" as const,
    }));

    ingress = new GatewayIngress(
      dispatcher,
      createMockRouter() as any,
    );
  });

  // ── Command routing via Web channel ──

  it("routes /help command from web channel to CommandDispatcher", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/help",
    });
    expect(result.text).toContain("Available commands");
    expect(result.format).toBe("markdown");
  });

  it("routes /sessions command from web channel", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/sessions",
    });
    expect(result.text).toContain("Active sessions");
  });

  it("routes /gate status command with args from web channel", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/gate status",
    });
    expect(result.text).toContain("Gate status: PASS");
  });

  // ── Error handling ──

  it("returns error for unknown command /xyz from web channel", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/xyz",
    });
    expect(result.text).toContain("Unknown command");
    expect(result.text).toContain("/xyz");
  });

  it("returns error for empty command / from web channel", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/",
    });
    expect(result.text).toContain("Empty command");
  });

  // ── Non-command routing ──

  it("routes @agent mention to AI (not command dispatcher)", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "@coder fix the bug",
    });
    // Should go through AI pipeline, not command dispatch
    expect(result.text).toContain("coder");
    expect(result.text).not.toContain("Unknown command");
  });

  it("routes plain text to AI (not command dispatcher)", async () => {
    const result = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "hello how are you",
    });
    // No @agent → routeMessage returns null → usage hint
    expect(result.text).toContain("@agent");
  });

  // ── Channel parity ──

  it("web and telegram get same command result for /help", async () => {
    const webResult = await ingress.handleInbound({
      channel: "web",
      senderId: "web-user-1",
      content: "/help",
    });
    const tgResult = await ingress.handleInbound({
      channel: "telegram",
      senderId: "tg-user-1",
      content: "/help",
    });
    expect(webResult.text).toBe(tgResult.text);
    expect(webResult.format).toBe(tgResult.format);
  });
});
