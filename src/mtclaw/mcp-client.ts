/**
 * MTClaw MCP Client
 *
 * Raw fetch() JSON-RPC 2.0 over Streamable-HTTP transport.
 * 0 new dependencies — thin-client invariant (ADR-034).
 *
 * Methods:
 * - initialize(): MCP handshake → session ID
 * - listTools(): Discover tools (cached 5min TTL)
 * - callTool(name, args): Execute MCP tool
 * - ping(): Health check
 *
 * Response parsing contract (CPO C6):
 * - isError → user-friendly message (never stack traces — CPO C5)
 * - empty content → "No response" fallback
 * - non-text types → skip, extract text only
 *
 * @module mtclaw/mcp-client
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034-CrossSystem-Agent-Protocol
 */

import type {
  MTClawConfig,
  McpToolDef,
  McpToolResult,
  McpContentItem,
  JsonRpcRequest,
  JsonRpcResponse,
  ToolResult,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** JSON-RPC 2.0 version constant */
const JSONRPC_VERSION = "2.0" as const;

// Request ID counter moved to McpToolClient instance (audit fix: no shared module state)

/** Tool list cache TTL (5 minutes) */
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

/** MCP protocol version we support */
const MCP_PROTOCOL_VERSION = "2025-03-26";

/** agent_chat timeout override (120s for long-running agent calls) */
export const AGENT_CHAT_TIMEOUT_MS = 130_000;

// ============================================================================
// Response Parsing (CPO C6)
// ============================================================================

/**
 * Parse MCP tool result into a plain text string.
 *
 * Contract (CPO C6 — 7 test cases):
 * 1. Normal text → joined text
 * 2. Multiple text parts → newline-joined
 * 3. isError: true → user-friendly message
 * 4. Empty content array → "No response" fallback
 * 5. Missing content field → graceful error
 * 6. Non-text types (image, resource) → skip
 * 7. Mixed types → extract text only
 */
export function parseToolResult(result: McpToolResult): ToolResult {
  // Case 3: isError flag
  if (result.isError) {
    return {
      text: "MTClaw service encountered an error. Please try again.",
      isError: true,
    };
  }

  // Case 5: Missing content
  if (!result.content) {
    return {
      text: "No response from MTClaw.",
      isError: false,
    };
  }

  // Case 6/7: Filter to text-only, skip image/resource
  const textParts = result.content.filter(
    (c: McpContentItem) => c.type === "text" && c.text,
  );

  // Case 4: Empty after filtering
  if (textParts.length === 0) {
    return {
      text: "No response from MTClaw.",
      isError: false,
    };
  }

  // Case 1/2: Join text parts
  return {
    text: textParts.map((c) => c.text!).join("\n"),
    isError: false,
  };
}

// ============================================================================
// MCP Client
// ============================================================================

/**
 * Raw MCP client using fetch() + JSON-RPC 2.0.
 *
 * Stateful: tracks session ID from MCP initialize handshake.
 * Caches tool list for 5 minutes.
 */
export class McpToolClient {
  private readonly config: MTClawConfig;
  private sessionId: string | undefined;
  private toolCache: McpToolDef[] | undefined;
  private toolCacheExpiry = 0;
  private initialized = false;
  private nextRequestId = 1;

  constructor(config: MTClawConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * MCP handshake — initialize session.
   * Must be called before listTools/callTool.
   */
  async initialize(): Promise<void> {
    const response = await this.sendRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "EndiorBot",
        version: "2.0.0",
      },
    });

    // Extract session ID from response headers (stored by sendRequest)
    // Server may return capabilities we don't use
    if (response) {
      this.initialized = true;

      // Send initialized notification (no response expected)
      await this.sendNotification("notifications/initialized");
    }
  }

  /**
   * Discover available MCP tools.
   * Cached for 5 minutes (TOOL_CACHE_TTL_MS).
   */
  async listTools(): Promise<McpToolDef[]> {
    this.ensureInitialized();

    // Return cache if fresh
    if (this.toolCache && Date.now() < this.toolCacheExpiry) {
      return this.toolCache;
    }

    const result = await this.sendRequest("tools/list", {});
    const tools = (result as { tools?: McpToolDef[] })?.tools ?? [];

    // Update cache
    this.toolCache = tools;
    this.toolCacheExpiry = Date.now() + TOOL_CACHE_TTL_MS;

    return tools;
  }

  /**
   * Execute an MCP tool by name.
   *
   * @param name - Tool name (e.g., "agent_chat", "knowledge_search")
   * @param args - Tool arguments
   * @param timeoutMs - Optional timeout override (default: config.timeoutMs)
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<McpToolResult> {
    this.ensureInitialized();

    const timeout = timeoutMs ?? this.config.timeoutMs;

    const result = await this.sendRequest(
      "tools/call",
      { name, arguments: args },
      timeout,
    );

    // Validate response shape
    const toolResult = result as McpToolResult | undefined;
    if (!toolResult || !Array.isArray(toolResult.content)) {
      return { content: [], isError: true };
    }

    return toolResult;
  }

  /**
   * Health check — ping the MCP server.
   * Returns true if server responds, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      await this.sendRequest("ping", {}, 5000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if client has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current session ID (if any).
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Clear tool cache (for testing or force refresh).
   */
  clearToolCache(): void {
    this.toolCache = undefined;
    this.toolCacheExpiry = 0;
  }

  // ==========================================================================
  // Private: JSON-RPC Transport
  // ==========================================================================

  /**
   * Send a JSON-RPC 2.0 request and return the result.
   */
  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const id = this.nextRequestId++;
    const request: JsonRpcRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: this.config.authToken,
    };

    if (this.config.tenantId) {
      headers["X-Tenant-ID"] = this.config.tenantId;
    }

    // Propagate session ID if we have one
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const timeout = timeoutMs ?? this.config.timeoutMs;

    const response = await fetch(this.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeout),
    });

    // Capture session ID from response headers
    const newSessionId = response.headers.get("Mcp-Session-Id");
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      const status = response.status;
      // CPO C5: Never expose raw error body — just status code
      if (status === 401 || status === 403) {
        throw new Error(`MTClaw authentication failed (${status})`);
      }
      if (status === 429) {
        throw new Error("MTClaw rate limit reached. Please wait.");
      }
      throw new Error(`MTClaw request failed (HTTP ${status})`);
    }

    // Handle SSE response (Streamable HTTP may return text/event-stream)
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return this.parseSSEResponse(response, id);
    }

    // Standard JSON response
    const json = (await response.json()) as JsonRpcResponse;
    if ("error" in json) {
      throw new Error(
        `MTClaw RPC error: ${json.error.message} (code: ${json.error.code})`,
      );
    }

    return json.result;
  }

  /**
   * Send a JSON-RPC 2.0 notification (no id, no response expected).
   */
  private async sendNotification(method: string): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: this.config.authToken,
    };

    if (this.config.tenantId) {
      headers["X-Tenant-ID"] = this.config.tenantId;
    }

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const body = JSON.stringify({ jsonrpc: JSONRPC_VERSION, method });

    // Fire-and-forget — we don't care about the response
    try {
      await fetch(this.config.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Notifications are best-effort
    }
  }

  /**
   * Parse SSE (Server-Sent Events) response for Streamable HTTP transport.
   * Extracts the JSON-RPC result from the event stream.
   */
  private async parseSSEResponse(
    response: Response,
    expectedId: number,
  ): Promise<unknown> {
    const text = await response.text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data) as JsonRpcResponse;
        if ("error" in json) {
          throw new Error(
            `MTClaw RPC error: ${json.error.message} (code: ${json.error.code})`,
          );
        }
        if (json.id === expectedId) {
          return json.result;
        }
      } catch (e) {
        if ((e as Error).message.startsWith("MTClaw")) throw e;
        // Skip non-JSON lines in SSE stream
      }
    }

    throw new Error("No matching response in SSE stream");
  }

  /**
   * Ensure client has been initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "McpToolClient not initialized. Call initialize() first.",
      );
    }
  }
}
