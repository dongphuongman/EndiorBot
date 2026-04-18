/**
 * Channel Router — shared agent routing for all channels.
 * Sprint 121 T3: Decomposed into router/ submodules (agent-constants, providers, patch-flow).
 *
 * @module agents/channel-router
 */

import { getClaudeCodeBridge, type ClaudeCodeBridge } from "./invoke/index.js";
import { initializeProvidersFromEnv } from "../providers/init.js";
import { parseMention } from "./orchestrator/mention-parser.js";
import type { ChannelSendFn } from "../bus/types.js";
import type { MTClawBridge } from "../mtclaw/bridge.js";
import { type CrossSystemRoute, RAG_COLLECTIONS, AI_PLATFORM_DOCS_URL } from "../mtclaw/types.js";
import { TIMEOUTS } from "../config/timeouts.js";

// Sprint 121 T3: Import from extracted submodules
import {
  VALID_AGENTS as VALID_AGENTS_LIST,
} from "./router/agent-constants.js";
import {
  callClaudeBridgeClassified,
  callCloudFallback,
  callRemoteOllama,
} from "./router/providers.js";

// Re-export constants from agent-constants (preserve public API)
export {
  VALID_AGENTS,
  type AgentName,
  TIER_AGENT_MODEL_MAP,
  AGENT_MODEL_MAP,
  getAgentModel,
  getAgentSoul,
  AGENT_SOULS,
} from "./router/agent-constants.js";

// Types

export interface ChannelRouterConfig {
  ollamaLocalUrl: string;
  ollamaRouterModel: string;
  ollamaRouterTimeout: number;
  ollamaRemoteUrl: string;
  ollamaRemoteApiKey: string;
  ollamaRemoteModel: string;
  ollamaRemoteTimeout: number;
  projectRoot: string;
  claudeTimeout: number;
  claudeMaxTokens: number;
  verbose: boolean;
  mtclawBridge?: MTClawBridge;
}

export interface RouteResult {
  agents: string[];
  task: string;
  crossSystem?: CrossSystemRoute;
}

export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIResult {
  content: string;
  provider: string;
  durationMs: number;
  tokenUsage?: AITokenUsage;
}

export interface RouterStatus {
  router: string;
  primary: string;
  fallback: string;
  last: string;
  providerCount: number;
}

// Default Config

export const DEFAULT_ROUTER_CONFIG: ChannelRouterConfig = {
  ollamaLocalUrl:
    process.env["OLLAMA_URL"] ??
    process.env["OLLAMA_HOST"] ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://localhost:11434",
  ollamaRouterModel: "qwen3.5:9b",
  ollamaRouterTimeout: 30000,
  ollamaRemoteUrl: process.env["OLLAMA_REMOTE_URL"] ?? "",
  ollamaRemoteApiKey: process.env["OLLAMA_REMOTE_API_KEY"] ?? "",
  ollamaRemoteModel: process.env["OLLAMA_REMOTE_MODEL"] ?? "qwen3-coder:30b",
  ollamaRemoteTimeout: 120000,
  projectRoot: process.cwd(),
  // Sprint 136 B3 fix (2026-04-18): was hardcoded `300` seconds, disconnected from
  // ENDIORBOT_CLAUDE_TIMEOUT_MS env var. Now sourced from TIMEOUTS SSOT (ms → s).
  // See src/config/timeouts.ts.
  claudeTimeout: Math.max(1, Math.round(TIMEOUTS.claudeCode / 1000)),
  claudeMaxTokens: 4000,
  verbose: false,
};

export class ChannelRouter {
  readonly config: ChannelRouterConfig;
  private ollamaRouterReady = false;
  private claudeAvailable = false;
  private bridge: ClaudeCodeBridge | null = null;
  private providerCount = 0;

  constructor(config?: Partial<ChannelRouterConfig>) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
  }

  /** Initialize all AI providers and check availability. */
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
      console.warn(`[Router] Claude Code Bridge check failed: ${e instanceof Error ? e.message : String(e)}`);
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
      console.warn(`[Router] Local Ollama not available: ${e instanceof Error ? e.message : String(e)}`);
    }

    return this.getStatus();
  }

  /** Route a message: extract agent mentions and task. */
  async routeMessage(text: string): Promise<RouteResult | null> {
    // Step 1: Regex parseMention — fast, deterministic when @agent is explicit
    const parseResult = parseMention(text);
    if (parseResult.success) {
      const result: RouteResult = { agents: parseResult.data.agents, task: parseResult.data.message };
      // Sprint 113 (ADR-034): Propagate cross-system route (CTO C4: exactOptionalPropertyTypes)
      if (parseResult.data.crossSystem) result.crossSystem = parseResult.data.crossSystem;
      return result;
    }

    // Step 2: Ollama inference — only when no explicit @agent mentioned
    const ollamaResult = await this.routeViaOllama(text);
    if (ollamaResult) return ollamaResult;

    return null;
  }

  /**
   * Call AI with a policy-driven fallback chain.
   *
   * Sprint 136 A11 (2026-04-18, CEO directive):
   *   "chúng ta chỉ fallback sang Gemini khi bị rate limit (5h, weekly) của CC"
   *
   * Policy:
   *   1. Claude Code Bridge is primary.
   *   2. On RATE_LIMITED (Max plan 5h / weekly limit) → fallback to cloud
   *      provider (Gemini/OpenAI) → then remote Ollama.
   *   3. On TIMEOUT / AUTH / OTHER failures → surface a clear error to user.
   *      Do NOT silently swap to a paid API (that would mask real Claude Code
   *      bugs and produce unexpected billing).
   */
  async callAI(
    agent: string,
    task: string,
    history?: Array<{ role: string; content: string }>,
    workspace?: string,
    /** Sprint 115 (T3): Optional notification function for approval messages */
    notifyFn?: ChannelSendFn,
  ): Promise<AIResult> {
    const ws = workspace ?? this.config.projectRoot;
    const deps = { bridge: this.bridge, claudeAvailable: this.claudeAvailable, config: this.config };

    // 1. PRIMARY: Claude Code Bridge (with failure classification)
    const { result: bridgeResult, failure } = await callClaudeBridgeClassified(
      deps,
      agent,
      task,
      history,
      ws,
      notifyFn,
    );
    if (bridgeResult) return bridgeResult;

    // Claude Code failed — decide fallback policy based on WHY it failed.
    if (!failure) {
      // Defensive: no classification — treat as OTHER failure.
      throw new Error(
        "Claude Code request failed without a classification. Please retry; if the problem persists, run `claude --version` to verify the CLI is healthy.",
      );
    }

    switch (failure.kind) {
      case "RATE_LIMITED": {
        // Only case where we silently fallback to a billed API.
        console.log(
          `[Router] Claude Code rate-limited (${failure.matchedToken ?? "unknown"}) — falling back to cloud provider for @${agent}...`,
        );
        const cloudResult = await callCloudFallback(deps, agent, task, history, ws);
        if (cloudResult) return cloudResult;

        console.log(`[Router] Cloud fallback unavailable — trying remote Ollama for @${agent}...`);
        const remoteResult = await callRemoteOllama(deps, agent, task, history, ws);
        if (remoteResult) return remoteResult;

        throw new Error(
          `Claude Code is rate-limited (${failure.reason}) and no fallback provider responded. Please wait for the rate-limit window to reset, or check GEMINI/OPENAI keys in .env.local.`,
        );
      }
      case "TIMEOUT":
        throw new Error(
          `⚠️ Claude Code timed out — the CLI did not respond in time. This is NOT a rate-limit (we detected no limit signal). Please retry; if it keeps happening, the Claude Code CLI process may be hung (try 'claude --version' to verify). Silent fallback is disabled so you can diagnose the root cause.`,
        );
      case "AUTH":
        throw new Error(
          `🔑 Claude Code authentication failed — your OAuth session may have expired. Please run 'claude login' and retry.`,
        );
      case "OTHER":
      default:
        throw new Error(
          `Claude Code failed: ${failure.reason}. Silent fallback is disabled for non-rate-limit failures — please fix the root cause or retry.`,
        );
    }
  }

  /** Format agent response for display. */
  formatResponse(agent: string, result: AIResult, maxLen = 3500): string {
    const truncated = result.content.length > maxLen
      ? result.content.slice(0, maxLen) + "\n\n[...truncated]"
      : result.content;
    const icons: Record<string, string> = { "claude-code": "⚡", "ai-platform": "🏢" };
    const icon = icons[result.provider] || "🔄";
    return `${icon} @${agent}\n\n${truncated}`;
  }

  /** Call MTClaw agent via cross-system route (Sprint 113, ADR-034). */
  async callMTClaw(route: CrossSystemRoute): Promise<AIResult> {
    const bridge = this.config.mtclawBridge;
    if (!bridge || !bridge.isAvailable()) {
      return { content: "MTClaw is currently unavailable.", provider: "mtclaw-mcp", durationMs: 0 };
    }

    const start = Date.now();
    try {
      let content: string;
      switch (route.agent) {
        case "datasource":
          content = (await bridge.callTool("datasource_query", { query: route.task })).text;
          break;
        case "knowledge":
          content = await bridge.searchKnowledge(route.task);
          content = this.appendDocViewerLinks(content);
          break;
        default: {
          // Sprint 115 T7: Check RAG collection routing for known agents
          const ragCol = RAG_COLLECTIONS[route.agent];
          if (ragCol) {
            content = await bridge.searchKnowledge(route.task, undefined, {
              collection_id: ragCol.id,
              search_mode: ragCol.mode,
            });
            // Append document viewer hint if response contains doc references
            content = this.appendDocViewerLinks(content);
          } else {
            content = await bridge.chatWithAgent(route.agent, route.task);
          }
          break;
        }
      }
      return { content, provider: "mtclaw-mcp", durationMs: Date.now() - start };
    } catch (e) {
      console.warn(`[Router] MTClaw call failed: ${e instanceof Error ? e.message : String(e)}`);
      return { content: "MTClaw request failed. Please try again later.", provider: "mtclaw-mcp", durationMs: Date.now() - start };
    }
  }

  private appendDocViewerLinks(content: string): string {
    const docIdPattern = /\bdoc_id["\s:=]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    const matches = [...content.matchAll(docIdPattern)];
    if (matches.length === 0) return content;

    const seen = new Set<string>();
    const links: string[] = [];
    for (const m of matches) {
      const docId = m[1] ?? "";
      if (docId && !seen.has(docId)) {
        seen.add(docId);
        links.push(`${AI_PLATFORM_DOCS_URL}/${docId}`);
      }
    }

    if (links.length > 0) {
      content += "\n\n📄 Tài liệu tham khảo:\n" + links.map(l => `- ${l}`).join("\n");
    }
    return content;
  }

  getUsageHint(): string {
    return (
      "Dùng @agent hoặc [@agent: task] để gọi agent.\n" +
      "Ví dụ: @pm plan next sprint\n\n" +
      "Agents: pm, architect, coder, reviewer, tester, devops, researcher, pjm, fullstack\n" +
      "Executive: ceo, cpo, cto, cso\n" +
      "Teams: planning, design, dev, qa, ops, executive\n\n" +
      `Router: ${this.ollamaRouterReady ? "🏠 Local Ollama" : "📝 Regex"} | ` +
      `AI: ${this.claudeAvailable ? "⚡ Claude Code" : "🔄 Fallback"}`
    );
  }

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

  getModeLabel(): string {
    return this.claudeAvailable ? "Claude Code ⚡" : "Fallback 🔄";
  }

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
              content: `You are a message router for EndiorBot. Route user messages to the best agent.
Valid agents: ${VALID_AGENTS_LIST.join(", ")}
Rules:
- If user mentions an agent explicitly (e.g. @cto, @pm), use it.
- If no agent mentioned, infer the best one from context:
  * code/build/fix/bug/test → coder
  * plan/sprint/feature/requirement → pm
  * design/architecture/system → architect
  * deploy/infra/CI/CD → devops
  * review/quality/audit → reviewer
  * research/compare/analyze → researcher
  * general question/status/repo/project → ceo
Reply ONLY with JSON (no markdown, no explanation): {"agents":["agent"], "task":"the task description"}
Never return empty agents[]. Always pick the best matching agent.`,
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
        (a) => (VALID_AGENTS_LIST as readonly string[]).includes(a),
      );

      if (validAgents.length === 0) return null;

      console.log(`[Router] Ollama parsed in ${durationMs}ms: agents=${validAgents.join(",")} task="${parsed.task.slice(0, 80)}"`);
      return { agents: validAgents, task: parsed.task };
    } catch (e) {
      console.warn(`[Router] Ollama failed: ${(e as Error).message}`);
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
