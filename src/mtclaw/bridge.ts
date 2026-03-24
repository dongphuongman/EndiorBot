/**
 * MTClaw Bridge Facade
 *
 * High-level API wrapping McpToolClient + CircuitBreaker.
 * Reuses CircuitBreaker from src/budget/circuit-breaker.ts (CTO C5).
 *
 * Methods:
 * - chatWithAgent(agent, message): Invoke MTClaw SOUL agent via agent_chat
 * - listAgents(): Discover available MTClaw agents via agent_list
 * - searchKnowledge(query): RAG search via knowledge_search
 * - callTool(name, args): Generic MCP tool call
 * - isAvailable(): Circuit breaker health check
 *
 * Graceful degradation:
 * - Circuit open → isAvailable() = false → local agents unaffected
 * - Errors → user-friendly messages, never stack traces (CPO C5)
 *
 * @module mtclaw/bridge
 * @version 1.0.0
 * @date 2026-03-20
 * @status ACTIVE — Sprint 113
 * @authority ADR-034-CrossSystem-Agent-Protocol
 */

import type { MTClawConfig, MTClawAgentInfo, ToolResult, KnowledgeSearchOptions } from "./types.js";
import { McpToolClient, parseToolResult, AGENT_CHAT_TIMEOUT_MS } from "./mcp-client.js";
import { createCircuitBreaker, type CircuitBreaker } from "../budget/circuit-breaker.js";

// ============================================================================
// Constants
// ============================================================================

/** Circuit breaker config for MTClaw bridge */
const MTCLAW_BREAKER_CONFIG = {
  max_retry_per_task: 5,         // 5 consecutive failures → open
  max_cost_per_task: 999,        // no cost limit for MTClaw calls
  max_duration_per_task: 130000, // 130s max (agent_chat timeout)
  escalate_on_breach: false,     // MTClaw degradation is silent
} as const;

/** Circuit breaker cooldown (30s) */
const MTCLAW_COOLDOWN_MS = 30_000;

// ============================================================================
// Bridge
// ============================================================================

export class MTClawBridge {
  private readonly client: McpToolClient;
  private readonly breaker: CircuitBreaker;
  private connected = false;

  constructor(config: MTClawConfig) {
    this.client = new McpToolClient(config);
    this.breaker = createCircuitBreaker(MTCLAW_BREAKER_CONFIG, MTCLAW_COOLDOWN_MS);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Connect to MTClaw MCP server.
   * Performs handshake and initial tool discovery.
   */
  async connect(): Promise<void> {
    try {
      await this.client.initialize();
      await this.client.listTools(); // warm cache
      this.connected = true;
      this.breaker.recordSuccess();
    } catch (e) {
      console.warn(`[MTClaw] Connection failed: ${e instanceof Error ? e.message : String(e)}`);
      this.breaker.recordFailure();
      // Don't throw — bridge is optional
    }
  }

  /**
   * Disconnect from MTClaw MCP server.
   * Clears state for clean shutdown.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.client.clearToolCache();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if MTClaw bridge is available.
   * Returns false if circuit breaker is open or not connected.
   */
  isAvailable(): boolean {
    return this.connected && this.breaker.canProceed();
  }

  /**
   * Chat with a MTClaw SOUL agent via agent_chat MCP tool.
   *
   * @param agent - Agent key (e.g., "researcher", "sop", "pm")
   * @param message - Message/task for the agent
   * @param timeoutMs - Optional timeout (default: 130s for agent_chat)
   */
  async chatWithAgent(
    agent: string,
    message: string,
    timeoutMs?: number,
  ): Promise<string> {
    const result = await this.callToolSafe("agent_chat", {
      agent,
      message,
    }, timeoutMs ?? AGENT_CHAT_TIMEOUT_MS);

    return result.text;
  }

  /**
   * List available MTClaw agents via agent_list tool.
   */
  async listAgents(): Promise<MTClawAgentInfo[]> {
    const result = await this.callToolSafe("agent_list", {});

    if (result.isError) return [];

    // Parse agent list from text response
    // MTClaw returns { agents: [...] } wrapper
    try {
      const parsed = JSON.parse(result.text) as
        | MTClawAgentInfo[]
        | { agents: MTClawAgentInfo[] };
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.agents)) return parsed.agents;
      return [];
    } catch {
      // agent_list may return formatted text instead of JSON
      return [];
    }
  }

  /**
   * Search MTClaw knowledge base via knowledge_search tool.
   *
   * @param query - Search query
   * @param collection - Optional collection filter (legacy, prefer options.collection_id)
   * @param options - RAG search options (Sprint 115 — AI-Platform Sprint 92-97)
   */
  async searchKnowledge(query: string, collection?: string, options?: KnowledgeSearchOptions): Promise<string> {
    const args: Record<string, unknown> = { query };

    // Collection: options.collection_id takes precedence over legacy param
    const collectionId = options?.collection_id ?? collection;
    if (collectionId) args.collection = collectionId;

    // Search mode: hybrid for SOP codes, vector for natural language
    if (options?.search_mode) args.search_mode = options.search_mode;

    // Top-k results (use !== undefined to avoid falsy-zero drop)
    if (options?.top_k !== undefined) args.top_k = options.top_k;

    const result = await this.callToolSafe("knowledge_search", args);
    return result.text;
  }

  /**
   * Generic MCP tool call with circuit breaker protection.
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param timeoutMs - Optional timeout override
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ToolResult> {
    return this.callToolSafe(name, args, timeoutMs);
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Call an MCP tool with circuit breaker + error handling.
   * Never throws — returns ToolResult with isError flag.
   */
  private async callToolSafe(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ToolResult> {
    if (!this.isAvailable()) {
      return {
        text: "MTClaw is currently unavailable. Please try again later.",
        isError: true,
      };
    }

    try {
      const mcpResult = await this.client.callTool(name, args, timeoutMs);
      const parsed = parseToolResult(mcpResult);

      // Record success/failure for circuit breaker
      if (parsed.isError) {
        this.breaker.recordFailure();
      } else {
        this.breaker.recordSuccess();
      }

      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.breaker.recordFailure();

      // CPO C5: User-friendly messages, never stack traces
      if (msg.includes("authentication")) {
        return { text: "MTClaw authentication failed. Please check credentials.", isError: true };
      }
      if (msg.includes("rate limit")) {
        return { text: "MTClaw rate limit reached. Please wait and try again.", isError: true };
      }
      if (msg.includes("timeout") || msg.includes("abort")) {
        return { text: "MTClaw request timed out. Please try again.", isError: true };
      }

      console.warn(`[MTClaw] Tool call failed (${name}): ${msg}`);
      return { text: "MTClaw request failed. Please try again later.", isError: true };
    }
  }
}
