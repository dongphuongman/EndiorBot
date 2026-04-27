/**
 * MCP Gateway Cross-System Agent Communication
 *
 * Barrel exports for EndiorBot ↔ MCP Gateway protocol.
 *
 * @module mcp-gateway
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034-CrossSystem-Agent-Protocol
 */

export { loadMcpGatewayConfig, loadMTClawConfig } from "./config.js";
export { McpToolClient, parseToolResult, AGENT_CHAT_TIMEOUT_MS } from "./mcp-client.js";
export { McpGatewayBridge, MTClawBridge } from "./bridge.js";
export type {
  McpGatewayConfig,
  MTClawConfig,
  CrossSystemRoute,
  KnowledgeSearchOptions,
  McpToolDef,
  McpToolResult,
  McpContentItem,
  ToolResult,
  McpGatewayAgentInfo,
  MTClawAgentInfo,
} from "./types.js";
export { RAG_COLLECTIONS, AI_PLATFORM_DOCS_URL } from "./types.js";
