/**
 * MTClaw Cross-System Agent Communication
 *
 * Barrel exports for EndiorBot ↔ MTClaw MCP protocol.
 *
 * @module mtclaw
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034-CrossSystem-Agent-Protocol
 */

export { loadMTClawConfig } from "./config.js";
export { McpToolClient, parseToolResult, AGENT_CHAT_TIMEOUT_MS } from "./mcp-client.js";
export { MTClawBridge } from "./bridge.js";
export type {
  MTClawConfig,
  CrossSystemRoute,
  McpToolDef,
  McpToolResult,
  McpContentItem,
  ToolResult,
  MTClawAgentInfo,
} from "./types.js";
