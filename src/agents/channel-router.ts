/**
 * Channel Router
 *
 * Shared agent routing logic for all channels (OTT, Web, etc.).
 * Extracts the routing flow from telegram-poll.mjs into reusable TypeScript:
 *   Router (Local Ollama) → Claude Bridge → Cloud Fallback → Remote Ollama
 *
 * @module agents/channel-router
 * @version 1.0.0
 * @date 2026-03-07
 * @status ACTIVE
 */

import { getClaudeCodeBridge, type ClaudeCodeBridge } from "./invoke/index.js";
import { initializeProvidersFromEnv } from "../providers/init.js";
import { getProviderRegistry } from "../providers/provider-registry.js";
import { parseMention } from "./orchestrator/mention-parser.js";
import type { AgentRole } from "./types/handoff.js";
import { getSoulLoader } from "../bridge/intelligence/soul-loader.js";

// ============================================================================
// Constants
// ============================================================================

export const VALID_AGENTS = [
  "pm", "architect", "coder", "reviewer", "tester", "researcher",
  "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
] as const;

export type AgentName = (typeof VALID_AGENTS)[number];

/**
 * Get SOUL content for an agent.
 * Uses SoulLoader (SSOT) — loads from filesystem first, falls back to inline.
 * @deprecated Use getSoulLoader().load(agent) directly for full SoulLoadResult.
 */
export function getAgentSoul(agent: string): string {
  const result = getSoulLoader().load(agent);
  return result.content;
}

/**
 * @deprecated Use getAgentSoul() or getSoulLoader().load() instead.
 * Kept as computed property for backward compatibility with existing imports.
 */
export const AGENT_SOULS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_target, prop: string): string {
      return getAgentSoul(prop);
    },
    has(_target, prop: string): boolean {
      return VALID_AGENTS.includes(prop as AgentName);
    },
  },
);

// ============================================================================
// Types
// ============================================================================

export interface ChannelRouterConfig {
  /** Local Ollama URL for router agent */
  ollamaLocalUrl: string;
  /** Local Ollama router model */
  ollamaRouterModel: string;
  /** Router timeout in ms */
  ollamaRouterTimeout: number;
  /** Remote Ollama URL (last fallback) */
  ollamaRemoteUrl: string;
  /** Remote Ollama API key */
  ollamaRemoteApiKey: string;
  /** Remote Ollama model */
  ollamaRemoteModel: string;
  /** Remote Ollama timeout in ms */
  ollamaRemoteTimeout: number;
  /** Project root directory */
  projectRoot: string;
  /** Claude Bridge timeout in seconds */
  claudeTimeout: number;
  /** Claude Bridge max tokens */
  claudeMaxTokens: number;
  /** Verbose logging */
  verbose: boolean;
}

export interface RouteResult {
  agents: string[];
  task: string;
}

export interface AIResult {
  content: string;
  provider: string;
  durationMs: number;
}

export interface RouterStatus {
  router: string;
  primary: string;
  fallback: string;
  last: string;
  providerCount: number;
}

// ============================================================================
// Default Config
// ============================================================================

export const DEFAULT_ROUTER_CONFIG: ChannelRouterConfig = {
  ollamaLocalUrl: process.env.OLLAMA_LOCAL_URL || "http://localhost:11434",
  ollamaRouterModel: "qwen3.5:9b",
  ollamaRouterTimeout: 30000,
  ollamaRemoteUrl: process.env.OLLAMA_REMOTE_URL || "https://api.nqh-internal.example",
  ollamaRemoteApiKey: process.env.OLLAMA_REMOTE_API_KEY || "",
  ollamaRemoteModel: process.env.OLLAMA_REMOTE_MODEL || "qwen3-coder:30b",
  ollamaRemoteTimeout: 120000,
  projectRoot: process.cwd(),
  claudeTimeout: 120,
  claudeMaxTokens: 4000,
  verbose: false,
};

// ============================================================================
// Channel Router
// ============================================================================

export class ChannelRouter {
  private config: ChannelRouterConfig;
  private ollamaRouterReady = false;
  private claudeAvailable = false;
  private bridge: ClaudeCodeBridge | null = null;
  private providerCount = 0;

  constructor(config?: Partial<ChannelRouterConfig>) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
  }

  /**
   * Initialize all AI providers and check availability.
   */
  async initialize(): Promise<RouterStatus> {
    // Init cloud providers (fallback)
    this.providerCount = await initializeProvidersFromEnv();
    console.log(`[Router] ${this.providerCount} fallback providers ready`);

    // Init Claude Code Bridge (primary)
    this.bridge = getClaudeCodeBridge({
      defaultTimeout: this.config.claudeTimeout,
      verbose: this.config.verbose,
    });

    try {
      this.claudeAvailable = await this.bridge.isAvailable();
      console.log(`[Router] Claude Code Bridge: ${this.claudeAvailable ? "✓ READY" : "✗ NOT AVAILABLE"}`);
    } catch (e) {
      console.warn(`[Router] Claude Code Bridge check failed: ${(e as Error).message}`);
    }

    // Check local Ollama router
    try {
      const res = await fetch(`${this.config.ollamaLocalUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        this.ollamaRouterReady = data.models?.some(
          (m) => m.name === this.config.ollamaRouterModel,
        ) ?? false;
        console.log(`[Router] Local Ollama (${this.config.ollamaRouterModel}): ${this.ollamaRouterReady ? "✓ READY" : "✗ model not found"}`);
      }
    } catch (e) {
      console.warn(`[Router] Local Ollama not available: ${(e as Error).message}`);
    }

    return this.getStatus();
  }

  /**
   * Route a message: extract agent mentions and task.
   * Uses local Ollama first, falls back to regex parseMention.
   */
  async routeMessage(text: string): Promise<RouteResult | null> {
    // Step 1: Route via local Ollama (fast, ~2s)
    const ollamaResult = await this.routeViaOllama(text);
    if (ollamaResult) return ollamaResult;

    // Step 2: Fallback to regex parseMention
    const parseResult = parseMention(text);
    if (parseResult.success) {
      return { agents: parseResult.data.agents, task: parseResult.data.message };
    }

    return null;
  }

  /**
   * Call AI with full fallback chain:
   * Claude Code Bridge → Cloud Provider → Remote Ollama
   */
  async callAI(agent: string, task: string): Promise<AIResult> {
    // 1. PRIMARY: Claude Code Bridge
    const bridgeResult = await this.callClaudeBridge(agent, task);
    if (bridgeResult) return bridgeResult;

    // 2. FALLBACK: Cloud provider (Gemini/OpenAI/Anthropic)
    console.log(`[Router] Trying cloud fallback for @${agent}...`);
    const cloudResult = await this.callCloudFallback(agent, task);
    if (cloudResult) return cloudResult;

    // 3. LAST FALLBACK: Remote Ollama
    console.log(`[Router] Trying remote Ollama for @${agent}...`);
    const remoteResult = await this.callRemoteOllama(agent, task);
    if (remoteResult) return remoteResult;

    throw new Error("All providers failed (Claude Code, Cloud APIs, Remote Ollama)");
  }

  /**
   * Format agent response for display.
   */
  formatResponse(agent: string, result: AIResult, maxLen = 3500): string {
    const truncated = result.content.length > maxLen
      ? result.content.slice(0, maxLen) + "\n\n[...truncated]"
      : result.content;
    const icons: Record<string, string> = { "claude-code": "⚡", "ai-platform": "🏢" };
    const icon = icons[result.provider] || "🔄";
    return `${icon} @${agent}\n\n${truncated}`;
  }

  /**
   * Get usage hint text for when no agent is mentioned.
   */
  getUsageHint(): string {
    return (
      "Dùng @agent hoặc [@agent: task] để gọi agent.\n" +
      "Ví dụ: @pm plan next sprint\n\n" +
      "Agents: pm, architect, coder, reviewer, tester, devops, researcher, pjm, fullstack\n" +
      "Executive: ceo, cpo, cto\n" +
      "Teams: planning, design, dev, qa, ops, executive\n\n" +
      `Router: ${this.ollamaRouterReady ? "🏠 Local Ollama" : "📝 Regex"} | ` +
      `AI: ${this.claudeAvailable ? "⚡ Claude Code" : "🔄 Fallback"}`
    );
  }

  /**
   * Get current status.
   */
  getStatus(): RouterStatus {
    return {
      router: this.ollamaRouterReady
        ? `🏠 Local Ollama (${this.config.ollamaRouterModel})`
        : "📝 Regex fallback",
      primary: this.claudeAvailable
        ? "⚡ Claude Code Bridge (Max 200)"
        : "UNAVAILABLE",
      fallback: `🔄 Cloud providers (${this.providerCount} registered)`,
      last: this.config.ollamaRemoteUrl
        ? `🏢 Remote Ollama (${this.config.ollamaRemoteModel})`
        : "UNAVAILABLE",
      providerCount: this.providerCount,
    };
  }

  /**
   * Get mode label for processing indicator.
   */
  getModeLabel(): string {
    return this.claudeAvailable ? "Claude Code ⚡" : "Fallback 🔄";
  }

  // ==========================================================================
  // Private: Router
  // ==========================================================================

  private async routeViaOllama(text: string): Promise<RouteResult | null> {
    if (!this.ollamaRouterReady) return null;

    try {
      const startTime = Date.now();
      const res = await fetch(`${this.config.ollamaLocalUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.ollamaRouterModel,
          messages: [
            {
              role: "system",
              content: `You are a message router for EndiorBot. Extract agent mentions and the task from user messages.
Valid agents: ${VALID_AGENTS.join(", ")}
Reply ONLY with JSON (no explanation): {"agents":["agent1","agent2"], "task":"the task description"}
If no valid agent is mentioned, reply: {"agents":[], "task":""}`,
            },
            { role: "user", content: text },
          ],
          stream: false,
          think: false,
          options: { temperature: 0.1, num_predict: 256 },
        }),
        signal: AbortSignal.timeout(this.config.ollamaRouterTimeout),
      });

      if (!res.ok) return null;

      const data = await res.json() as { message?: { content?: string } };
      const content = data.message?.content?.trim();
      const durationMs = Date.now() - startTime;

      if (!content) return null;

      // Parse JSON from response (handle markdown code blocks)
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(jsonStr) as { agents?: unknown[]; task?: string };

      if (!Array.isArray(parsed.agents) || typeof parsed.task !== "string") return null;
      const validAgents = (parsed.agents as string[]).filter(
        (a) => (VALID_AGENTS as readonly string[]).includes(a),
      );

      if (validAgents.length === 0) return null;

      console.log(`[Router] Ollama parsed in ${durationMs}ms: agents=${validAgents.join(",")} task="${parsed.task.slice(0, 80)}"`);
      return { agents: validAgents, task: parsed.task };
    } catch (e) {
      console.warn(`[Router] Ollama failed: ${(e as Error).message}`);
      return null;
    }
  }

  // ==========================================================================
  // Private: AI Providers
  // ==========================================================================

  private async callClaudeBridge(agent: string, task: string): Promise<AIResult | null> {
    if (!this.claudeAvailable || !this.bridge) return null;

    const systemPrompt = getAgentSoul(agent);

    try {
      const response = await this.bridge.invokeRead({
        systemPrompt,
        userPrompt: task,
        workspace: this.config.projectRoot,
        agent: agent as AgentRole,
        timeout: this.config.claudeTimeout,
        maxTokens: this.config.claudeMaxTokens,
      });

      if (response.success && response.output) {
        return { content: response.output, provider: "claude-code", durationMs: response.durationMs };
      }

      console.warn(`[Router] Claude Bridge error: ${response.error}`);
      return null;
    } catch (e) {
      console.warn(`[Router] Claude Bridge failed: ${(e as Error).message}`);
      this.claudeAvailable = false;
      console.warn("[Router] Claude Bridge marked unavailable — switching to fallback");
      return null;
    }
  }

  private async callCloudFallback(agent: string, task: string): Promise<AIResult | null> {
    const registry = getProviderRegistry();
    const provider = registry.getDefault();
    if (!provider) return null;

    const systemPrompt = getAgentSoul(agent);
    const modelId = provider.models[0]?.id;
    if (!modelId) return null;

    try {
      const startTime = Date.now();
      const response = await provider.chat({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: task },
        ],
        temperature: 0.7,
        maxTokens: 2000,
      });
      return { content: response.content, provider: provider.name || "cloud", durationMs: Date.now() - startTime };
    } catch (e) {
      console.warn(`[Router] Cloud fallback failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async callRemoteOllama(agent: string, task: string): Promise<AIResult | null> {
    if (!this.config.ollamaRemoteUrl) return null;

    const systemPrompt = getAgentSoul(agent);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.ollamaRemoteApiKey) {
      headers["Authorization"] = `Bearer ${this.config.ollamaRemoteApiKey}`;
    }

    try {
      const startTime = Date.now();
      const res = await fetch(`${this.config.ollamaRemoteUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.ollamaRemoteModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: task },
          ],
          stream: false,
          options: { temperature: 0.7, num_predict: 2048 },
        }),
        signal: AbortSignal.timeout(this.config.ollamaRemoteTimeout),
      });

      if (!res.ok) return null;

      const data = await res.json() as { message?: { content?: string } };
      const content = data.message?.content?.trim();
      if (!content) return null;

      return { content, provider: "ai-platform", durationMs: Date.now() - startTime };
    } catch (e) {
      console.warn(`[Router] Remote Ollama failed: ${(e as Error).message}`);
      return null;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a ChannelRouter with default config from environment.
 */
export function createChannelRouter(config?: Partial<ChannelRouterConfig>): ChannelRouter {
  return new ChannelRouter(config);
}
