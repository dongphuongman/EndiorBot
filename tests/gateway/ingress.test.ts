/**
 * GatewayIngress Tests — Sprint 93
 *
 * Tests the single entry point for all inbound messages (B3 fix).
 *
 * @module tests/gateway/ingress
 * @sprint 93
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GatewayIngress } from "../../src/gateway/ingress.js";
import {
  CommandDispatcher,
  type CommandContext,
  type CommandResult,
} from "../../src/commands/command-dispatcher.js";

// ============================================================================
// Mock ChannelRouter
// ============================================================================

function createMockRouter() {
  return {
    routeMessage: async (text: string) => {
      // Simple mock: detect @agent mentions
      const match = text.match(/@(\w+)\s+(.*)/);
      if (match) {
        return { agents: [match[1]], task: match[2] };
      }
      return null;
    },
    callAI: async (agent: string, task: string) => ({
      content: `[${agent}] Response to: ${task}`,
      provider: "mock",
    }),
    formatResponse: (agent: string, result: { content: string }) =>
      `@${agent}: ${result.content}`,
    getUsageHint: () => "Use @agent to start a conversation.",
    getStatus: async () => ({ status: "ok" }),
    initialize: async () => {},
    config: { projectRoot: "/mock/project" },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("GatewayIngress", () => {
  let dispatcher: CommandDispatcher;
  let mockRouter: ReturnType<typeof createMockRouter>;
  let ingress: GatewayIngress;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
    mockRouter = createMockRouter();

    // Register some test commands
    dispatcher.register("help", async () => ({
      success: true,
      response: "Help message",
    }));
    dispatcher.register("link", async (ctx: CommandContext) => ({
      success: true,
      response: `Linked: ${ctx.userId}`,
    }));

    // Cast mock router — it satisfies the interface for our tests
    ingress = new GatewayIngress(
      dispatcher,
      mockRouter as never,
    );
  });

  it("routes /help to CommandDispatcher", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "/help",
    });

    expect(response.text).toBe("Help message");
  });

  it("routes /link with args to CommandDispatcher", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-42",
      content: "/link",
    });

    expect(response.text).toBe("Linked: user-42");
  });

  it("routes @agent text to ChannelRouter (AI chat)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "@pm plan next sprint",
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("plan next sprint");
    expect(response.format).toBe("markdown");
  });

  it("returns usage hint when no agent detected", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "just a plain message",
    });

    expect(response.text).toBe("Use @agent to start a conversation.");
  });

  it("returns error for unknown command (Fix #1: no fall-through)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "/launchh", // Typo
    });

    expect(response.text).toContain("Unknown command");
    expect(response.text).toContain("/launchh");
    expect(response.text).toContain("/help");
  });

  it("returns error for empty command", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "/",
    });

    expect(response.text).toContain("Empty command");
  });

  it("strips @botname suffix from commands", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "/help@Endior_bot",
    });

    expect(response.text).toBe("Help message");
  });

  it("passes chatId from metadata to command context", async () => {
    let capturedCtx: CommandContext | null = null;
    dispatcher.register("test", async (ctx) => {
      capturedCtx = ctx;
      return { success: true, response: "ok" };
    });

    await ingress.handleInbound({
      channel: "telegram",
      senderId: "user-1",
      content: "/test arg1 arg2",
      metadata: { chatId: "chat-999" },
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.chatId).toBe("chat-999");
    expect(capturedCtx!.args).toEqual(["arg1", "arg2"]);
  });
});
