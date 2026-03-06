/**
 * Zalo Agent Handler Tests
 *
 * Tests for Zalo agent mention parsing, invocation, and handoff.
 * Covers the full flow: message → mention parse → agent route → invoke → format response.
 *
 * @module tests/channels/zalo/zalo-agent-handler
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 76 (Zalo Channel Testing)
 * @authority CTO Code Review, @tester
 * @stage 05 - TEST
 * @sdlc SDLC Framework 6.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleZaloAgentMention,
  handleZaloHandoff,
  createZaloAgentHandler,
  type ZaloSendFn,
} from "../../../src/channels/zalo/agent-handler.js";
import type { SanitizedChannelMessage } from "../../../src/channels/ott/message-router.js";

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock mention-parser
vi.mock("../../../src/agents/orchestrator/mention-parser.js", () => ({
  hasMention: vi.fn(),
  parseMention: vi.fn(),
}));

// Mock team-registry
vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: vi.fn(() => ({
    getTeam: vi.fn(),
    getAllTeams: vi.fn(() => []),
    getTeamForAgent: vi.fn(),
  })),
}));

// Mock agent-router
vi.mock("../../../src/agents/orchestrator/agent-router.js", () => ({
  getAgentRouter: vi.fn(() => ({
    route: vi.fn(),
  })),
}));

// Mock workflow-engine
vi.mock("../../../src/agents/orchestrator/workflow-engine.js", () => ({
  getWorkflowEngine: vi.fn(() => ({
    start: vi.fn(() => ({ id: "wf-test-001" })),
    startStep: vi.fn(),
    completeStep: vi.fn(),
  })),
}));

// Mock claude-code-bridge
vi.mock("../../../src/agents/invoke/claude-code-bridge.js", () => ({
  getClaudeCodeBridge: vi.fn(() => ({
    invoke: vi.fn(),
  })),
}));

// Mock response-parser
vi.mock("../../../src/agents/invoke/response-parser.js", () => ({
  parseResponse: vi.fn(() => ({ content: "Agent response content" })),
  extractFirstHandoff: vi.fn(() => null),
}));

// Mock response-formatter
vi.mock("../../../src/channels/ott/response-formatter.js", () => ({
  formatForZalo: vi.fn((resp) => ({
    text: `@${resp.agent}: ${resp.output}`,
  })),
  formatProcessing: vi.fn((agent, task) => `⏳ Processing @${agent}: ${task}...`),
  formatAgentNotFound: vi.fn((content) => `❓ Unknown agent in: ${content.slice(0, 30)}`),
  formatError: vi.fn((msg) => `❌ Error: ${msg}`),
}));

// Mock zalo-commands
vi.mock("../../../src/channels/zalo/zalo-commands.js", () => ({
  handleZaloCommand: vi.fn(),
}));

// Import mocked modules for assertions
import { hasMention, parseMention } from "../../../src/agents/orchestrator/mention-parser.js";
import { getAgentRouter } from "../../../src/agents/orchestrator/agent-router.js";
import { getClaudeCodeBridge } from "../../../src/agents/invoke/claude-code-bridge.js";
import { extractFirstHandoff } from "../../../src/agents/invoke/response-parser.js";
import { handleZaloCommand } from "../../../src/channels/zalo/zalo-commands.js";

// ============================================================================
// Helpers
// ============================================================================

function createTestMessage(
  content: string,
  allowed = true,
): SanitizedChannelMessage {
  // P0-1: original must be ChannelIncomingMessage (object with .content)
  // sanitized is wrapped in [EXTERNAL_INPUT] tags by InputSanitizer in production
  const sanitized = `[EXTERNAL_INPUT channel=zalo-bot]\n${content}\n[/EXTERNAL_INPUT]`;
  const msg: SanitizedChannelMessage = {
    original: {
      messageId: "test-msg-001",
      senderId: "test-sender",
      content,
      receivedAt: new Date(),
    },
    sanitized,
    allowed,
    violations: [],
  };
  if (!allowed) msg.blockReason = "test-block";
  return msg;
}

function createMockSendFn(): ZaloSendFn {
  return vi.fn(async (_msg: string) => true);
}

function setupMocksForSuccess(agent = "researcher", task = "analyze codebase"): void {
  vi.mocked(hasMention).mockReturnValue(true);
  vi.mocked(parseMention).mockReturnValue({
    success: true,
    data: {
      agents: [agent as any],
      message: task,
    },
  } as any);

  const mockRouter = {
    route: vi.fn().mockResolvedValue({
      success: true,
      decision: {
        agent,
        message: task,
        classification: { taskType: "analysis" },
        soul: { content: "You are a researcher." },
      },
    }),
  };
  vi.mocked(getAgentRouter).mockReturnValue(mockRouter as any);

  const mockBridge = {
    invoke: vi.fn().mockResolvedValue({
      output: "Analysis complete: the codebase uses TypeScript.",
      exitCode: 0,
    }),
  };
  vi.mocked(getClaudeCodeBridge).mockReturnValue(mockBridge as any);
}

// ============================================================================
// Tests
// ============================================================================

describe("Zalo Agent Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // handleZaloAgentMention
  // --------------------------------------------------------------------------

  describe("handleZaloAgentMention", () => {
    it("should return empty result when no mention found", async () => {
      vi.mocked(hasMention).mockReturnValue(false);

      const result = await handleZaloAgentMention(
        createTestMessage("hello world"),
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("No agent mention found");
      expect(result.formattedMessage).toBe("");
    });

    it("should return error when mention parse fails", async () => {
      vi.mocked(hasMention).mockReturnValue(true);
      vi.mocked(parseMention).mockReturnValue({
        success: false,
        error: { message: "Invalid mention format" },
      } as any);

      const result = await handleZaloAgentMention(
        createTestMessage("@invalid agent"),
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid mention format");
      expect(result.formattedMessage).toContain("Unknown agent");
    });

    it("should return error when no valid agent found", async () => {
      vi.mocked(hasMention).mockReturnValue(true);
      vi.mocked(parseMention).mockReturnValue({
        success: true,
        data: { agents: [], message: "do something" },
      } as any);

      const result = await handleZaloAgentMention(
        createTestMessage("@: do something"),
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("No valid agent found");
    });

    it("should send processing indicator before invocation", async () => {
      setupMocksForSuccess();
      const sendFn = createMockSendFn();

      await handleZaloAgentMention(
        createTestMessage("@researcher: analyze codebase"),
        sendFn,
      );

      expect(sendFn).toHaveBeenCalledWith(
        expect.stringContaining("Processing @researcher"),
      );
    });

    it("should invoke agent and return formatted response", async () => {
      setupMocksForSuccess("researcher", "analyze codebase");

      const result = await handleZaloAgentMention(
        createTestMessage("@researcher: analyze codebase"),
        createMockSendFn(),
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response?.agent).toBe("researcher");
      expect(result.formattedMessage).toContain("@researcher");
    });

    it("should handle router failure", async () => {
      vi.mocked(hasMention).mockReturnValue(true);
      vi.mocked(parseMention).mockReturnValue({
        success: true,
        data: { agents: ["researcher"], message: "test" },
      } as any);

      const mockRouter = {
        route: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Agent not available" },
        }),
      };
      vi.mocked(getAgentRouter).mockReturnValue(mockRouter as any);

      const result = await handleZaloAgentMention(
        createTestMessage("@researcher: test"),
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.formattedMessage).toContain("Error");
    });

    it("should handle bridge invocation failure", async () => {
      vi.mocked(hasMention).mockReturnValue(true);
      vi.mocked(parseMention).mockReturnValue({
        success: true,
        data: { agents: ["coder"], message: "fix bug" },
      } as any);

      const mockRouter = {
        route: vi.fn().mockResolvedValue({
          success: true,
          decision: {
            agent: "coder",
            message: "fix bug",
            classification: { taskType: "code_fix" },
            soul: { content: "You are a coder." },
          },
        }),
      };
      vi.mocked(getAgentRouter).mockReturnValue(mockRouter as any);

      const mockBridge = {
        invoke: vi.fn().mockRejectedValue(new Error("Bridge timeout")),
      };
      vi.mocked(getClaudeCodeBridge).mockReturnValue(mockBridge as any);

      const result = await handleZaloAgentMention(
        createTestMessage("@coder: fix bug"),
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Bridge timeout");
    });

    it("should include handoff suggestion when present", async () => {
      setupMocksForSuccess("pm", "create requirements");

      vi.mocked(extractFirstHandoff).mockReturnValue({
        to: "architect",
        intent: "design architecture",
        priority: "NORMAL",
        from: "pm",
        depth: 0,
      } as any);

      const result = await handleZaloAgentMention(
        createTestMessage("@pm: create requirements"),
        createMockSendFn(),
      );

      expect(result.success).toBe(true);
      expect(result.suggestedAction).toBeDefined();
      expect(result.suggestedAction?.agent).toBe("architect");
      expect(result.suggestedAction?.intent).toBe("design architecture");
    });

    it("should use READ mode (no PATCH for Zalo)", async () => {
      setupMocksForSuccess("coder", "review code");

      await handleZaloAgentMention(
        createTestMessage("@coder: review code"),
        createMockSendFn(),
      );

      const bridge = getClaudeCodeBridge();
      const invokeCall = vi.mocked(bridge.invoke).mock.calls[0][0];
      expect(invokeCall.mode).toBe("READ");
    });

    it("should use OTT timeout from env or default 300s", async () => {
      setupMocksForSuccess("tester", "run tests");

      await handleZaloAgentMention(
        createTestMessage("@tester: run tests"),
        createMockSendFn(),
      );

      const bridge = getClaudeCodeBridge();
      const invokeCall = vi.mocked(bridge.invoke).mock.calls[0][0];
      expect(invokeCall.timeout).toBe(300);
    });
  });

  // --------------------------------------------------------------------------
  // handleZaloHandoff
  // --------------------------------------------------------------------------

  describe("handleZaloHandoff", () => {
    it("should send processing indicator and invoke agent", async () => {
      setupMocksForSuccess("architect", "design system");
      const sendFn = createMockSendFn();

      const result = await handleZaloHandoff(
        "architect" as any,
        "design system",
        sendFn,
      );

      expect(sendFn).toHaveBeenCalledWith(
        expect.stringContaining("Processing @architect"),
      );
      expect(result.success).toBe(true);
    });

    it("should handle handoff failure gracefully", async () => {
      vi.mocked(hasMention).mockReturnValue(true);

      const mockRouter = {
        route: vi.fn().mockRejectedValue(new Error("Route failed")),
      };
      vi.mocked(getAgentRouter).mockReturnValue(mockRouter as any);

      const result = await handleZaloHandoff(
        "architect" as any,
        "design system",
        createMockSendFn(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Route failed");
      expect(result.formattedMessage).toContain("Error");
    });
  });

  // --------------------------------------------------------------------------
  // createZaloAgentHandler
  // --------------------------------------------------------------------------

  describe("createZaloAgentHandler", () => {
    it("should return a handler function", () => {
      const handler = createZaloAgentHandler(createMockSendFn());
      expect(typeof handler).toBe("function");
    });

    it("should skip blocked messages", async () => {
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("@researcher: test", false));

      expect(hasMention).not.toHaveBeenCalled();
      expect(sendFn).not.toHaveBeenCalled();
    });

    it("should skip messages without agent mention", async () => {
      vi.mocked(hasMention).mockReturnValue(false);
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("just a normal message"));

      expect(sendFn).not.toHaveBeenCalled();
    });

    it("should process mention and send response", async () => {
      setupMocksForSuccess("pm", "list tasks");
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("@pm: list tasks"));

      // Should send: 1) processing, 2) response
      expect(sendFn).toHaveBeenCalledTimes(2);
    });

    it("should send handoff hint when suggested action exists", async () => {
      setupMocksForSuccess("pm", "plan sprint");

      vi.mocked(extractFirstHandoff).mockReturnValue({
        to: "pjm",
        intent: "create sprint backlog",
        priority: "NORMAL",
        from: "pm",
        depth: 0,
      } as any);

      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("@pm: plan sprint"));

      // Should send: 1) processing, 2) response, 3) handoff hint
      expect(sendFn).toHaveBeenCalledTimes(3);
      const lastCall = vi.mocked(sendFn).mock.calls[2][0];
      expect(lastCall).toContain("@pjm");
      expect(lastCall).toContain("continue");
    });
  });

  // --------------------------------------------------------------------------
  // Security: Zalo READ-only enforcement
  // --------------------------------------------------------------------------

  describe("Security", () => {
    it("should never use PATCH mode for Zalo invocations", async () => {
      // Test with multiple agents
      for (const agent of ["researcher", "coder", "architect", "tester"]) {
        vi.clearAllMocks();
        setupMocksForSuccess(agent, "test task");

        await handleZaloAgentMention(
          createTestMessage(`@${agent}: test task`),
          createMockSendFn(),
        );

        const bridge = getClaudeCodeBridge();
        const calls = vi.mocked(bridge.invoke).mock.calls;
        if (calls.length > 0) {
          expect(calls[0][0].mode).toBe("READ");
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Sprint 77 P1-4: Command dispatch priority integration test
  // --------------------------------------------------------------------------

  describe("Command dispatch priority (Sprint 77)", () => {
    it("should route /help to handleZaloCommand, not hasMention", async () => {
      vi.mocked(handleZaloCommand).mockResolvedValue(true);
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("/help"));

      // handleZaloCommand should be called with raw content
      expect(handleZaloCommand).toHaveBeenCalledWith("/help", sendFn, "test-sender");
      // hasMention should NOT be called (command was handled)
      expect(hasMention).not.toHaveBeenCalled();
    });

    it("should fall through to mention handler for unknown commands", async () => {
      vi.mocked(handleZaloCommand).mockResolvedValue(false);
      vi.mocked(hasMention).mockReturnValue(false);
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("/unknown"));

      // handleZaloCommand called but returns false
      expect(handleZaloCommand).toHaveBeenCalledWith("/unknown", sendFn, "test-sender");
      // hasMention should be called as fallback
      expect(hasMention).toHaveBeenCalled();
    });

    it("should use original content, not sanitized (P0-1)", async () => {
      vi.mocked(handleZaloCommand).mockResolvedValue(true);
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      // createTestMessage wraps sanitized in [EXTERNAL_INPUT] tags
      // but original.content is the raw "/help"
      await handler(createTestMessage("/help"));

      // Should be called with raw content, not [EXTERNAL_INPUT]-wrapped
      expect(handleZaloCommand).toHaveBeenCalledWith("/help", sendFn, "test-sender");
      const callArg = vi.mocked(handleZaloCommand).mock.calls[0][0];
      expect(callArg).not.toContain("[EXTERNAL_INPUT]");
      expect(callArg).toBe("/help");
    });

    it("should not dispatch commands for non-slash messages", async () => {
      vi.mocked(hasMention).mockReturnValue(false);
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("hello world"));

      // handleZaloCommand should NOT be called (no /)
      expect(handleZaloCommand).not.toHaveBeenCalled();
    });

    it("should process agent mentions when not a command", async () => {
      setupMocksForSuccess("researcher", "analyze");
      const sendFn = createMockSendFn();
      const handler = createZaloAgentHandler(sendFn);

      await handler(createTestMessage("@researcher: analyze"));

      // handleZaloCommand should NOT be called (not starting with /)
      expect(handleZaloCommand).not.toHaveBeenCalled();
      // But hasMention should be called
      expect(hasMention).toHaveBeenCalled();
    });
  });
});
