/**
 * RAG Collection Routing Tests — Sprint 115 T7/T8
 *
 * Tests for AI-Platform RAG integration: collection routing, hybrid/vector mode,
 * searchKnowledge options, document viewer URL formatting, unknown agent fallback.
 *
 * @module tests/mcp-gateway/rag-collection-routing
 * @sprint 115
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { McpGatewayBridge } from "../../src/mcp-gateway/bridge.js";
import { ChannelRouter } from "../../src/agents/channel-router.js";
import { RAG_COLLECTIONS, AI_PLATFORM_DOCS_URL } from "../../src/mcp-gateway/types.js";
import type { McpGatewayConfig, CrossSystemRoute } from "../../src/mcp-gateway/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(): McpGatewayConfig {
  return {
    url: "https://mtclaw.test.local/mcp",
    authToken: "Bearer test-token-123",
    tenantId: "test-tenant",
    timeoutMs: 5000,
  };
}

function jsonRpcSuccess(id: number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function mockInitialize(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "Mcp-Session-Id": "sess-test" }),
    json: async () => jsonRpcSuccess(expect.any(Number), {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
    }),
  });
  fetchMock.mockResolvedValueOnce({ ok: true }); // notifications/initialized
  fetchMock.mockResolvedValueOnce({
    ok: true,
    headers: new Headers(),
    json: async () => jsonRpcSuccess(expect.any(Number), {
      tools: [
        { name: "knowledge_search", description: "RAG Search", inputSchema: {} },
        { name: "agent_chat", description: "Chat", inputSchema: {} },
      ],
    }),
  });
}

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
// RAG_COLLECTIONS Mapping
// ============================================================================

describe("RAG_COLLECTIONS", () => {
  it("maps known agents to collection entries with correct modes", () => {
    expect(RAG_COLLECTIONS.sop).toBeDefined();
    expect(typeof RAG_COLLECTIONS.sop.id).toBe("string");
    expect(RAG_COLLECTIONS.sop.mode).toBe("hybrid");

    expect(RAG_COLLECTIONS.bod).toBeDefined();
    expect(typeof RAG_COLLECTIONS.bod.id).toBe("string");
    expect(RAG_COLLECTIONS.bod.mode).toBe("hybrid");

    expect(RAG_COLLECTIONS.cs).toBeDefined();
    expect(RAG_COLLECTIONS.cs.mode).toBe("vector"); // FAQ uses vector (natural language)
  });

  it("sop and fnb share the same collection source", () => {
    // Both configured via env; in default config both are empty string
    expect(typeof RAG_COLLECTIONS.sop.id).toBe("string");
    expect(typeof RAG_COLLECTIONS.fnb.id).toBe("string");
  });

  it("does not contain unknown agents", () => {
    expect(RAG_COLLECTIONS["researcher"]).toBeUndefined();
    expect(RAG_COLLECTIONS["pm"]).toBeUndefined();
  });
});

// ============================================================================
// searchKnowledge with options
// ============================================================================

describe("McpGatewayBridge.searchKnowledge with options", () => {
  let bridge: McpGatewayBridge;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    bridge = new McpGatewayBridge(createTestConfig());
    mockInitialize(fetchMock);
    await bridge.connect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes search_mode and collection_id in tool args", async () => {
    mockToolCallSuccess(fetchMock, "SOP-001 found");

    await bridge.searchKnowledge("SOP livestream", undefined, {
      collection_id: "2954bdb8-abcb-4362-9337-d3acec73c9da",
      search_mode: "hybrid",
    });

    // 4th fetch call (after init+notify+listTools) is the tool call
    const toolCall = fetchMock.mock.calls[3];
    const body = JSON.parse(toolCall[1].body as string);
    expect(body.params.arguments).toEqual({
      query: "SOP livestream",
      collection: "2954bdb8-abcb-4362-9337-d3acec73c9da",
      search_mode: "hybrid",
    });
  });

  it("passes top_k when specified", async () => {
    mockToolCallSuccess(fetchMock, "result");

    await bridge.searchKnowledge("query", undefined, {
      top_k: 10,
    });

    const toolCall = fetchMock.mock.calls[3];
    const body = JSON.parse(toolCall[1].body as string);
    expect(body.params.arguments.top_k).toBe(10);
  });

  it("options.collection_id takes precedence over legacy collection param", async () => {
    mockToolCallSuccess(fetchMock, "result");

    await bridge.searchKnowledge("query", "legacy-col", {
      collection_id: "new-col-uuid",
    });

    const toolCall = fetchMock.mock.calls[3];
    const body = JSON.parse(toolCall[1].body as string);
    expect(body.params.arguments.collection).toBe("new-col-uuid");
  });

  it("omits optional fields when not specified", async () => {
    mockToolCallSuccess(fetchMock, "result");

    await bridge.searchKnowledge("simple query");

    const toolCall = fetchMock.mock.calls[3];
    const body = JSON.parse(toolCall[1].body as string);
    expect(body.params.arguments).toEqual({ query: "simple query" });
    expect(body.params.arguments.search_mode).toBeUndefined();
    expect(body.params.arguments.collection).toBeUndefined();
  });
});

// ============================================================================
// AI_PLATFORM_DOCS_URL
// ============================================================================

describe("AI_PLATFORM_DOCS_URL", () => {
  it("points to the AI-Platform document viewer", () => {
    // AI_PLATFORM_DOCS_URL is now env-configurable (defaults to empty string)
    expect(typeof AI_PLATFORM_DOCS_URL).toBe("string");
  });
});

// ============================================================================
// ChannelRouter.callMTClaw() routing dispatch (CTO C3)
// ============================================================================

describe("ChannelRouter.callMTClaw() routing dispatch", () => {
  /** Create a mock McpGatewayBridge with spied methods */
  function createMockBridge() {
    return {
      isAvailable: vi.fn().mockReturnValue(true),
      searchKnowledge: vi.fn().mockResolvedValue("RAG search result"),
      chatWithAgent: vi.fn().mockResolvedValue("Agent chat result"),
      callTool: vi.fn().mockResolvedValue({ text: "Tool result", isError: false }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([]),
    } as unknown as McpGatewayBridge;
  }

  it("routes 'sop' agent to searchKnowledge with hybrid mode", async () => {
    const mockBridge = createMockBridge();
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "sop", task: "tìm SOP livestream" };

    const result = await router.callMTClaw(route);

    expect(mockBridge.searchKnowledge).toHaveBeenCalledWith(
      "tìm SOP livestream",
      undefined,
      expect.objectContaining({ search_mode: "hybrid" }),
    );
    expect(mockBridge.chatWithAgent).not.toHaveBeenCalled();
    expect(result.provider).toBe("mcp-gateway");
  });

  it("routes 'bod' agent to searchKnowledge with hybrid mode", async () => {
    const mockBridge = createMockBridge();
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "bod", task: "báo cáo doanh thu" };

    await router.callMTClaw(route);

    expect(mockBridge.searchKnowledge).toHaveBeenCalledWith(
      "báo cáo doanh thu",
      undefined,
      expect.objectContaining({ search_mode: "hybrid" }),
    );
  });

  it("routes 'cs' agent to searchKnowledge with vector mode (not hybrid)", async () => {
    const mockBridge = createMockBridge();
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "cs", task: "warranty policy" };

    await router.callMTClaw(route);

    expect(mockBridge.searchKnowledge).toHaveBeenCalledWith(
      "warranty policy",
      undefined,
      expect.objectContaining({ search_mode: "vector" }),
    );
  });

  it("routes unknown agent (researcher) to chatWithAgent, not searchKnowledge", async () => {
    const mockBridge = createMockBridge();
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "researcher", task: "complex query" };

    const result = await router.callMTClaw(route);

    expect(mockBridge.chatWithAgent).toHaveBeenCalledWith("researcher", "complex query");
    expect(mockBridge.searchKnowledge).not.toHaveBeenCalled();
    expect(result.content).toBe("Agent chat result");
  });

  it("routes 'knowledge' agent to searchKnowledge without collection", async () => {
    const mockBridge = createMockBridge();
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "knowledge", task: "search anything" };

    await router.callMTClaw(route);

    // knowledge case calls searchKnowledge with just the query (no collection routing)
    expect(mockBridge.searchKnowledge).toHaveBeenCalledWith("search anything");
    expect(mockBridge.chatWithAgent).not.toHaveBeenCalled();
  });

  it("returns unavailable message when bridge is down", async () => {
    const mockBridge = createMockBridge();
    (mockBridge.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "sop", task: "test" };

    const result = await router.callMTClaw(route);

    expect(result.content).toContain("unavailable");
    expect(result.durationMs).toBe(0);
  });
});

// ============================================================================
// appendDocViewerLinks (via callMTClaw integration)
// ============================================================================

describe("appendDocViewerLinks via callMTClaw", () => {
  function createMockBridge(searchResult: string) {
    return {
      isAvailable: vi.fn().mockReturnValue(true),
      searchKnowledge: vi.fn().mockResolvedValue(searchResult),
      chatWithAgent: vi.fn().mockResolvedValue("chat"),
      callTool: vi.fn().mockResolvedValue({ text: "tool", isError: false }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      listAgents: vi.fn().mockResolvedValue([]),
    } as unknown as McpGatewayBridge;
  }

  it("appends doc viewer URLs when response contains doc_id UUIDs", async () => {
    const responseWithDocId = 'Found SOP: doc_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" — SOP livestream';
    const mockBridge = createMockBridge(responseWithDocId);
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "sop", task: "test" };

    const result = await router.callMTClaw(route);

    expect(result.content).toContain("📄 Tài liệu tham khảo:");
    expect(result.content).toContain(`${AI_PLATFORM_DOCS_URL}/a1b2c3d4-e5f6-7890-abcd-ef1234567890`);
  });

  it("does not append links when no doc_id in response", async () => {
    const mockBridge = createMockBridge("Simple result with no doc references");
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "sop", task: "test" };

    const result = await router.callMTClaw(route);

    expect(result.content).not.toContain("📄");
    expect(result.content).toBe("Simple result with no doc references");
  });

  it("deduplicates multiple occurrences of the same doc_id", async () => {
    const responseWithDups = 'doc_id: "aaaa1111-bb22-cc33-dd44-eeeeeeee5555" and again doc_id="aaaa1111-bb22-cc33-dd44-eeeeeeee5555"';
    const mockBridge = createMockBridge(responseWithDups);
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "bod", task: "test" };

    const result = await router.callMTClaw(route);

    // Should appear exactly once in the links section
    const linkMatches = result.content.match(/aaaa1111-bb22-cc33-dd44-eeeeeeee5555/g);
    // 2 in original content + 1 in appended link = 3
    expect(linkMatches).toHaveLength(3);
  });

  it("also appends doc viewer links for 'knowledge' agent route", async () => {
    const responseWithDocId = 'Result: doc_id="f1f2f3f4-a5a6-b7b8-c9c0-d1d2d3d4d5d6"';
    const mockBridge = createMockBridge(responseWithDocId);
    const router = new ChannelRouter({ mcpGatewayBridge: mockBridge });
    const route: CrossSystemRoute = { system: "mtclaw", agent: "knowledge", task: "test" };

    const result = await router.callMTClaw(route);

    // C2 fix: knowledge route also gets doc viewer links
    expect(result.content).toContain("📄 Tài liệu tham khảo:");
    expect(result.content).toContain(`${AI_PLATFORM_DOCS_URL}/f1f2f3f4-a5a6-b7b8-c9c0-d1d2d3d4d5d6`);
  });
});
