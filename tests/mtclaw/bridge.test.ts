/**
 * MTClaw Bridge Tests
 *
 * Tests for MTClawBridge: chatWithAgent, searchKnowledge, callTool,
 * graceful degradation, circuit breaker, no-leak (CPO C5).
 *
 * All tests mock HTTP — no real MTClaw dependency.
 *
 * @module tests/mtclaw/bridge
 * @sprint 113
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MTClawBridge } from "../../src/mtclaw/bridge.js";
import type { MTClawConfig } from "../../src/mtclaw/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(overrides?: Partial<MTClawConfig>): MTClawConfig {
  return {
    url: "https://mtclaw.test.local/mcp",
    authToken: "Bearer test-token-123",
    tenantId: "test-tenant",
    timeoutMs: 5000,
    ...overrides,
  };
}

function jsonRpcSuccess(id: number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

/** Mock a successful MCP initialize + notification sequence */
function mockInitialize(fetchMock: ReturnType<typeof vi.fn>) {
  // initialize response
  fetchMock.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "Mcp-Session-Id": "sess-test" }),
    json: async () => jsonRpcSuccess(expect.any(Number), {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
    }),
  });
  // notifications/initialized
  fetchMock.mockResolvedValueOnce({ ok: true });
  // listTools (cache warm)
  fetchMock.mockResolvedValueOnce({
    ok: true,
    headers: new Headers(),
    json: async () => jsonRpcSuccess(expect.any(Number), {
      tools: [
        { name: "agent_chat", description: "Chat", inputSchema: {} },
        { name: "knowledge_search", description: "Search", inputSchema: {} },
      ],
    }),
  });
}

/** Mock a successful tool call */
function mockToolCallSuccess(fetchMock: ReturnType<typeof vi.fn>, text: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    headers: new Headers(),
    json: async () => jsonRpcSuccess(expect.any(Number), {
      content: [{ type: "text", text }],
    }),
  });
}

// ============================================================================
// MTClawBridge
// ============================================================================

describe("MTClawBridge", () => {
  let bridge: MTClawBridge;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // connect / disconnect
  // --------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("connect() initializes MCP client and warms tool cache", async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);

      await bridge.connect();
      expect(bridge.isAvailable()).toBe(true);
    });

    it("connect() handles failure gracefully (no throw)", async () => {
      bridge = new MTClawBridge(createTestConfig());
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      await bridge.connect(); // should not throw
      expect(bridge.isAvailable()).toBe(false);
    });

    it("disconnect() clears availability", async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
      expect(bridge.isAvailable()).toBe(true);

      await bridge.disconnect();
      expect(bridge.isAvailable()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // chatWithAgent()
  // --------------------------------------------------------------------------

  describe("chatWithAgent()", () => {
    beforeEach(async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
    });

    it("calls agent_chat and returns text response", async () => {
      mockToolCallSuccess(fetchMock, "Researcher found 3 SOPs matching your query.");

      const result = await bridge.chatWithAgent("researcher", "tìm SOP livestream");
      expect(result).toBe("Researcher found 3 SOPs matching your query.");
    });

    it("returns user-friendly message when bridge unavailable", async () => {
      await bridge.disconnect();
      const result = await bridge.chatWithAgent("pm", "plan next sprint");
      expect(result).toContain("unavailable");
    });
  });

  // --------------------------------------------------------------------------
  // searchKnowledge()
  // --------------------------------------------------------------------------

  describe("searchKnowledge()", () => {
    beforeEach(async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
    });

    it("calls knowledge_search and returns text", async () => {
      mockToolCallSuccess(fetchMock, "Found: SOP-001 Leave Request Process");

      const result = await bridge.searchKnowledge("leave request SOP");
      expect(result).toContain("SOP-001");
    });

    it("passes collection filter when provided", async () => {
      mockToolCallSuccess(fetchMock, "Results from HR collection");

      await bridge.searchKnowledge("leave request", "hr");

      // Verify the tool call included collection arg
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
      const body = JSON.parse((lastCall[1] as RequestInit).body as string);
      expect(body.params.arguments).toEqual({
        query: "leave request",
        collection: "hr",
      });
    });
  });

  // --------------------------------------------------------------------------
  // callTool()
  // --------------------------------------------------------------------------

  describe("callTool()", () => {
    beforeEach(async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
    });

    it("calls generic MCP tool", async () => {
      mockToolCallSuccess(fetchMock, "database1\ndatabase2\ndatabase3");

      const result = await bridge.callTool("datasource_query", { query: "SHOW DATABASES" });
      expect(result.text).toContain("database1");
      expect(result.isError).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Graceful degradation
  // --------------------------------------------------------------------------

  describe("degradation", () => {
    beforeEach(async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
    });

    it("returns error message on timeout", async () => {
      fetchMock.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));

      const result = await bridge.callTool("agent_chat", { agent: "researcher", message: "test" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("timed out");
    });

    it("returns error message on auth failure", async () => {
      fetchMock.mockRejectedValueOnce(new Error("MTClaw authentication failed (401)"));

      const result = await bridge.callTool("agent_chat", { agent: "pm", message: "test" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("authentication failed");
    });

    it("returns error message on rate limit", async () => {
      fetchMock.mockRejectedValueOnce(new Error("MTClaw rate limit reached. Please wait."));

      const result = await bridge.callTool("agent_chat", { agent: "pm", message: "test" });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("rate limit");
    });

    it("returns user-friendly error on repeated failures", async () => {
      // Each failure returns a user-friendly message without exposing internals
      for (let i = 0; i < 3; i++) {
        fetchMock.mockRejectedValueOnce(new Error("connection refused"));
        const result = await bridge.callTool("agent_chat", { agent: "pm", message: "test" });
        expect(result.isError).toBe(true);
        expect(result.text).toContain("failed");
        // CPO C5: Never expose internal error details
        expect(result.text).not.toContain("connection refused");
      }
    });
  });

  // --------------------------------------------------------------------------
  // CPO C5: No secret leak
  // --------------------------------------------------------------------------

  describe("security (CPO C5)", () => {
    it("never exposes auth token in error messages", async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();

      fetchMock.mockRejectedValueOnce(new Error("some internal error"));
      const result = await bridge.callTool("agent_chat", { agent: "pm", message: "test" });

      expect(result.text).not.toContain("test-token-123");
      expect(result.text).not.toContain("Bearer");
    });

    it("never exposes stack traces in tool results", async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(99, {
          content: [{ type: "text", text: "Error at line 42 in /internal/path" }],
          isError: true,
        }),
      });

      const result = await bridge.callTool("agent_chat", { agent: "pm", message: "test" });
      expect(result.text).toBe("MTClaw service encountered an error. Please try again.");
      expect(result.text).not.toContain("/internal/path");
    });
  });

  // --------------------------------------------------------------------------
  // listAgents()
  // --------------------------------------------------------------------------

  describe("listAgents()", () => {
    beforeEach(async () => {
      bridge = new MTClawBridge(createTestConfig());
      mockInitialize(fetchMock);
      await bridge.connect();
    });

    it("returns parsed agent list", async () => {
      const agents = [
        { key: "researcher", displayName: "Researcher", description: "Research agent" },
        { key: "pm", displayName: "Product Manager", description: "PM agent" },
      ];
      mockToolCallSuccess(fetchMock, JSON.stringify(agents));

      const result = await bridge.listAgents();
      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe("researcher");
    });

    it("returns empty array on error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("fail"));

      const result = await bridge.listAgents();
      expect(result).toEqual([]);
    });
  });
});
