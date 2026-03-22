/**
 * GatewayIngress Multi-Agent Tests — Sprint 95
 *
 * Tests multi-agent routing integration in GatewayIngress.
 * Verifies backward compatibility with single-agent path.
 *
 * @module tests/gateway/ingress-multiagent
 * @sprint 95
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayIngress } from "../../src/gateway/ingress.js";
import type { InboundMessage } from "../../src/gateway/ingress.js";
import { GoalDecomposer } from "../../src/autonomy/goal-decomposer.js";
import { MultiAgentDispatcher } from "../../src/autonomy/multi-agent-dispatcher.js";
import type { ChannelRouter, RouteResult, AIResult } from "../../src/agents/channel-router.js";
import type { CommandDispatcher } from "../../src/commands/command-dispatcher.js";

// ============================================================================
// Mocks
// ============================================================================

function createMockDispatcher(): CommandDispatcher {
  return {
    has: vi.fn(() => false),
    dispatch: vi.fn(),
    getRegisteredCommands: vi.fn(() => []),
  } as unknown as CommandDispatcher;
}

function createMockRouter(routeResult: RouteResult | null): ChannelRouter {
  return {
    routeMessage: vi.fn(async (): Promise<RouteResult | null> => routeResult),
    callAI: vi.fn(async (agent: string): Promise<AIResult> => ({
      content: `Response from @${agent}.`,
      provider: "claude-bridge",
      durationMs: 1000,
    })),
    getUsageHint: vi.fn(() => "Usage: @agent message"),
    formatResponse: vi.fn((agent: string, result: AIResult) => `[@${agent}] ${result.content}`),
    getStatus: vi.fn(),
    config: { projectRoot: "/mock/project" },
  } as unknown as ChannelRouter;
}

function makeMsg(content: string): InboundMessage {
  return {
    channel: "telegram",
    senderId: "user-1",
    content,
  };
}

describe("GatewayIngress — Multi-Agent", () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    dispatcher = createMockDispatcher();
  });

  // --------------------------------------------------------------------------
  // Multi-agent routing
  // --------------------------------------------------------------------------

  it("should use autonomy pipeline when multiple agents detected", async () => {
    const router = createMockRouter({
      agents: ["architect", "coder"],
      task: "design and implement payment",
    });
    const decomposer = new GoalDecomposer();
    const multiDispatcher = new MultiAgentDispatcher();

    const ingress = new GatewayIngress(dispatcher, router, undefined, decomposer, multiDispatcher);
    const result = await ingress.handleInbound(makeMsg("@architect,coder design and implement payment"));

    // Multi-agent response should contain both agents
    expect(result.text).toContain("architect");
    expect(result.text).toContain("coder");
  });

  it("should use autonomy pipeline when shouldDecompose returns true", async () => {
    const router = createMockRouter({
      agents: ["assistant"],
      task: "design and implement authentication",
    });
    const decomposer = new GoalDecomposer();
    const multiDispatcher = new MultiAgentDispatcher();

    const ingress = new GatewayIngress(dispatcher, router, undefined, decomposer, multiDispatcher);
    const result = await ingress.handleInbound(makeMsg("design and implement authentication"));

    // GoalDecomposer detects "design and implement" → architect + coder
    expect(result.text).toContain("architect");
    expect(result.text).toContain("coder");
  });

  // --------------------------------------------------------------------------
  // Backward compatibility
  // --------------------------------------------------------------------------

  it("should use single-agent path for single-agent message", async () => {
    const router = createMockRouter({
      agents: ["coder"],
      task: "fix bug in login",
    });
    const decomposer = new GoalDecomposer();
    const multiDispatcher = new MultiAgentDispatcher();

    const ingress = new GatewayIngress(dispatcher, router, undefined, decomposer, multiDispatcher);
    const result = await ingress.handleInbound(makeMsg("@coder fix bug in login"));

    // Single agent → uses formatResponse, not aggregator
    expect(result.text).toContain("@coder");
  });

  it("should use single-agent path when no autonomy modules provided", async () => {
    const router = createMockRouter({
      agents: ["coder"],
      task: "fix the bug",
    });

    // No GoalDecomposer or MultiAgentDispatcher
    const ingress = new GatewayIngress(dispatcher, router);
    const result = await ingress.handleInbound(makeMsg("@coder fix the bug"));

    expect(result.text).toContain("@coder");
  });

  it("should return usage hint when no route result", async () => {
    const router = createMockRouter(null);
    const ingress = new GatewayIngress(dispatcher, router);
    const result = await ingress.handleInbound(makeMsg("random text"));

    expect(result.text).toContain("Usage");
  });

  it("should still use command dispatcher for /commands", async () => {
    const cmdDispatcher = createMockDispatcher();
    (cmdDispatcher.has as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (cmdDispatcher.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      response: "Help text here",
    });

    const router = createMockRouter(null);
    const ingress = new GatewayIngress(cmdDispatcher, router);
    const result = await ingress.handleInbound(makeMsg("/help"));

    expect(result.text).toBe("Help text here");
  });
});
