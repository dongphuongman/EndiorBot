/**
 * MTClaw Cross-System Agent Communication Types
 *
 * Types for EndiorBot ↔ MTClaw MCP communication protocol.
 * See ADR-034 for architecture decision.
 *
 * @module mtclaw/types
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034-CrossSystem-Agent-Protocol
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * MTClaw bridge configuration.
 * Loaded from `.mcp.json` + `MTCLAW_API_KEY` env var.
 */
export interface MTClawConfig {
  /** MCP server URL (from .mcp.json mcpServers.mtclaw.url) */
  url: string;
  /** Bearer token — from MTCLAW_API_KEY env, fallback .mcp.json (CTO C2) */
  authToken: string;
  /** Tenant ID (from .mcp.json headers.X-Tenant-ID) */
  tenantId: string;
  /** Default timeout in ms (30s for tools, 130s for agent_chat) */
  timeoutMs: number;
}

// ============================================================================
// Cross-System Routing
// ============================================================================

/**
 * Cross-system route result.
 * Carried on ParsedMention when `@mtclaw.*` is detected.
 * When set, `ParsedMention.agents` is empty — cross-system bypasses local pipeline.
 */
export interface CrossSystemRoute {
  /** Target system identifier */
  system: "mtclaw";
  /** Remote agent key (e.g., "researcher", "sop", "datasource") */
  agent: string;
  /** Task/message to send */
  task: string;
}

// ============================================================================
// MCP Protocol Types
// ============================================================================

/**
 * MCP tool definition from tools/list response.
 */
export interface McpToolDef {
  /** Tool name (e.g., "agent_chat", "datasource_query") */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * MCP tool result content item.
 */
export interface McpContentItem {
  /** Content type — we only process "text" */
  type: "text" | "image" | "resource";
  /** Text content (only present when type === "text") */
  text?: string;
}

/**
 * MCP tool call result.
 */
export interface McpToolResult {
  /** Content array — may contain text, image, or resource items */
  content: McpContentItem[];
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/**
 * JSON-RPC 2.0 request envelope.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 success response.
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

/**
 * JSON-RPC 2.0 error response.
 */
export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC 2.0 response (union).
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ============================================================================
// Bridge Result Types
// ============================================================================

/**
 * Simplified tool result after parsing MCP response.
 */
export interface ToolResult {
  /** Extracted text content */
  text: string;
  /** Whether the original MCP call reported an error */
  isError: boolean;
}

/**
 * MTClaw agent info from agent_list tool.
 */
export interface MTClawAgentInfo {
  /** Agent key (e.g., "pm", "researcher") */
  key: string;
  /** Display name (e.g., "Product Manager") */
  displayName: string;
  /** Agent description */
  description: string;
}
