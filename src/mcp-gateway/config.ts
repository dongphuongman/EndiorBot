/**
 * MCP Gateway Configuration Loader
 *
 * Reads MCP Gateway server config from `.mcp.json` and env vars.
 * Token resolution: MCP_GATEWAY_API_KEY env → MTCLAW_API_KEY (backward compat) → fallback .mcp.json Authorization header.
 * Token is NEVER logged (CPO C5).
 *
 * @module mcp-gateway/config
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034 (CTO C2: token from env)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpGatewayConfig } from "./types.js";
import { TIMEOUTS } from "../config/timeouts.js";

/** Default timeout for standard MCP tool calls — see TIMEOUTS.mtclawTool */
const DEFAULT_TIMEOUT_MS = TIMEOUTS.mtclawTool;

/**
 * Load MCP Gateway configuration from `.mcp.json` + environment.
 *
 * @param projectRoot - Project root directory (defaults to cwd)
 * @returns McpGatewayConfig or undefined if `.mcp.json` missing/invalid
 */
export function loadMcpGatewayConfig(
  projectRoot?: string,
): McpGatewayConfig | undefined {
  const root = projectRoot ?? process.cwd();
  const mcpPath = join(root, ".mcp.json");

  let raw: string;
  try {
    raw = readFileSync(mcpPath, "utf-8");
  } catch {
    // .mcp.json not found — bridge disabled, not an error
    return undefined;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn("[MCP Gateway] Invalid JSON in .mcp.json — bridge disabled");
    return undefined;
  }

  const servers = parsed.mcpServers as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!servers?.mtclaw) {
    return undefined;
  }

  const mtclaw = servers.mtclaw;
  const url = mtclaw.url as string | undefined;
  if (!url) {
    console.warn("[MCP Gateway] No URL in .mcp.json mcpServers.mtclaw — bridge disabled");
    return undefined;
  }

  const headers = mtclaw.headers as Record<string, string> | undefined;
  const tenantId = headers?.["X-Tenant-ID"] ?? "";

  // CTO C2: Token from env var first (new name), backward compat with MTCLAW_API_KEY, fallback to .mcp.json
  const envToken = process.env.MCP_GATEWAY_API_KEY || process.env.MTCLAW_API_KEY;
  const fileToken = headers?.Authorization;
  const authToken = envToken
    ? `Bearer ${envToken}`
    : fileToken ?? "";

  if (!authToken) {
    console.warn("[MCP Gateway] No auth token (set MCP_GATEWAY_API_KEY env or Authorization in .mcp.json)");
    return undefined;
  }

  return {
    url,
    authToken,
    tenantId,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/** @deprecated Use loadMcpGatewayConfig instead */
export const loadMTClawConfig = loadMcpGatewayConfig;
