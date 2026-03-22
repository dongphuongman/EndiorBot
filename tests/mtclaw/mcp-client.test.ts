/**
 * MCP Client Tests
 *
 * Tests for McpToolClient: handshake, tool discovery, tool calls,
 * response parsing (CPO C6 — 7 cases), timeout, session management.
 *
 * All tests mock HTTP — no real MTClaw dependency.
 *
 * @module tests/mtclaw/mcp-client
 * @sprint 113
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { McpToolClient, parseToolResult } from "../../src/mtclaw/mcp-client.js";
import type { MTClawConfig, McpToolResult } from "../../src/mtclaw/types.js";

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

function jsonRpcError(id: number, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ============================================================================
// parseToolResult (CPO C6 — 7 test cases)
// ============================================================================

describe("parseToolResult", () => {
  it("C6-1: normal text → extracted text", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "Hello from MTClaw" }],
    };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("Hello from MTClaw");
    expect(parsed.isError).toBe(false);
  });

  it("C6-2: multiple text parts → newline-joined", () => {
    const result: McpToolResult = {
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
        { type: "text", text: "Line 3" },
      ],
    };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("Line 1\nLine 2\nLine 3");
    expect(parsed.isError).toBe(false);
  });

  it("C6-3: isError flag → user-friendly message", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "internal stack trace here" }],
      isError: true,
    };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("MTClaw service encountered an error. Please try again.");
    expect(parsed.isError).toBe(true);
    // CPO C5: Never expose stack trace
    expect(parsed.text).not.toContain("stack trace");
  });

  it("C6-4: empty content array → 'No response' fallback", () => {
    const result: McpToolResult = { content: [] };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("No response from MTClaw.");
    expect(parsed.isError).toBe(false);
  });

  it("C6-5: missing content field → graceful error", () => {
    // Simulate malformed response
    const result = {} as McpToolResult;
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("No response from MTClaw.");
    expect(parsed.isError).toBe(false);
  });

  it("C6-6: non-text types (image, resource) → skip", () => {
    const result: McpToolResult = {
      content: [
        { type: "image" },
        { type: "resource" },
      ],
    };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("No response from MTClaw.");
  });

  it("C6-7: mixed types → extract text only", () => {
    const result: McpToolResult = {
      content: [
        { type: "image" },
        { type: "text", text: "Useful data" },
        { type: "resource" },
        { type: "text", text: "More data" },
      ],
    };
    const parsed = parseToolResult(result);
    expect(parsed.text).toBe("Useful data\nMore data");
    expect(parsed.isError).toBe(false);
  });
});

// ============================================================================
// McpToolClient
// ============================================================================

describe("McpToolClient", () => {
  let client: McpToolClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new McpToolClient(createTestConfig());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // initialize()
  // --------------------------------------------------------------------------

  describe("initialize()", () => {
    it("performs MCP handshake and captures session ID", async () => {
      // Mock initialize response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Mcp-Session-Id": "session-abc-123" }),
        json: async () => jsonRpcSuccess(1, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "mtclaw", version: "1.0.0" },
        }),
      });

      // Mock notifications/initialized (fire-and-forget)
      fetchMock.mockResolvedValueOnce({ ok: true });

      await client.initialize();

      expect(client.isInitialized()).toBe(true);
      expect(client.getSessionId()).toBe("session-abc-123");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify auth headers
      const initCall = fetchMock.mock.calls[0]!;
      const headers = (initCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token-123");
      expect(headers["X-Tenant-ID"]).toBe("test-tenant");
    });

    it("throws on HTTP 401", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
      });

      await expect(client.initialize()).rejects.toThrow("MTClaw authentication failed (401)");
    });

    it("throws on HTTP 429", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
      });

      await expect(client.initialize()).rejects.toThrow("MTClaw rate limit reached");
    });
  });

  // --------------------------------------------------------------------------
  // listTools()
  // --------------------------------------------------------------------------

  describe("listTools()", () => {
    beforeEach(async () => {
      // Initialize first
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Mcp-Session-Id": "sess-1" }),
        json: async () => jsonRpcSuccess(1, { protocolVersion: "2025-03-26" }),
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await client.initialize();
    });

    it("returns tool list from server", async () => {
      const tools = [
        { name: "agent_chat", description: "Chat with agent", inputSchema: {} },
        { name: "knowledge_search", description: "Search knowledge", inputSchema: {} },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, { tools }),
      });

      const result = await client.listTools();
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe("agent_chat");
    });

    it("caches tools for 5 minutes", async () => {
      const tools = [{ name: "agent_chat", description: "Chat", inputSchema: {} }];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, { tools }),
      });

      const first = await client.listTools();
      const second = await client.listTools();

      // Only 3 fetch calls total: init + notification + listTools (cached for second call)
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(first).toEqual(second);
    });

    it("throws if not initialized", async () => {
      const uninitClient = new McpToolClient(createTestConfig());
      await expect(uninitClient.listTools()).rejects.toThrow("not initialized");
    });
  });

  // --------------------------------------------------------------------------
  // callTool()
  // --------------------------------------------------------------------------

  describe("callTool()", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Mcp-Session-Id": "sess-1" }),
        json: async () => jsonRpcSuccess(1, { protocolVersion: "2025-03-26" }),
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await client.initialize();
    });

    it("calls tool and returns McpToolResult", async () => {
      const toolResult: McpToolResult = {
        content: [{ type: "text", text: "Agent response here" }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, toolResult),
      });

      const result = await client.callTool("agent_chat", { agent: "researcher", message: "hello" });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.text).toBe("Agent response here");
    });

    it("returns isError on malformed response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, { unexpected: "format" }),
      });

      const result = await client.callTool("agent_chat", { agent: "pm", message: "test" });
      expect(result.isError).toBe(true);
    });

    it("throws on JSON-RPC error response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcError(3, -32600, "Invalid Request"),
      });

      await expect(
        client.callTool("bad_tool", {}),
      ).rejects.toThrow("MTClaw RPC error: Invalid Request");
    });

    it("propagates session ID in subsequent calls", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, { content: [{ type: "text", text: "ok" }] }),
      });

      await client.callTool("ping", {});

      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
      const headers = (lastCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Mcp-Session-Id"]).toBe("sess-1");
    });
  });

  // --------------------------------------------------------------------------
  // ping()
  // --------------------------------------------------------------------------

  describe("ping()", () => {
    it("returns true on successful ping", async () => {
      // Initialize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(1, { protocolVersion: "2025-03-26" }),
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await client.initialize();

      // Ping
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(3, {}),
      });

      expect(await client.ping()).toBe(true);
    });

    it("returns false on network error", async () => {
      // Initialize
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => jsonRpcSuccess(1, { protocolVersion: "2025-03-26" }),
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await client.initialize();

      // Ping fails
      fetchMock.mockRejectedValueOnce(new Error("network error"));

      expect(await client.ping()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // SSE response handling
  // --------------------------------------------------------------------------

  describe("SSE response", () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Mcp-Session-Id": "sess-1" }),
        json: async () => jsonRpcSuccess(1, { protocolVersion: "2025-03-26" }),
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await client.initialize();
    });

    it("parses SSE event stream response", async () => {
      // Capture the request ID from the fetch call body, then return matching SSE
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { id: number };
        const sseBody = [
          `data: ${JSON.stringify(jsonRpcSuccess(body.id, { content: [{ type: "text", text: "SSE result" }] }))}`,
          "",
          "data: [DONE]",
        ].join("\n");
        return {
          ok: true,
          headers: new Headers({ "Content-Type": "text/event-stream" }),
          text: async () => sseBody,
        };
      });

      const result = await client.callTool("agent_chat", { agent: "researcher", message: "test" });
      expect(result.content[0]!.text).toBe("SSE result");
    });
  });
});
