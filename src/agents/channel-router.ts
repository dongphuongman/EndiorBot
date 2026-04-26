/**
 * Channel Router — shared agent routing for all channels.
 * Sprint 121 T3: Decomposed into router/ submodules (agent-constants, providers, patch-flow).
 *
 * @module agents/channel-router
 */

import { getClaudeCodeBridge, type ClaudeCodeBridge } from "./invoke/index.js";
import { initializeProvidersFromEnv } from "../providers/init.js";
import { registerKimiProxyCleanup } from "../providers/kimi-proxy/index.js";
import { parseMention } from "./orchestrator/mention-parser.js";
import type { ChannelSendFn } from "../bus/types.js";
import type { MTClawBridge } from "../mtclaw/bridge.js";
import { type CrossSystemRoute, RAG_COLLECTIONS, AI_PLATFORM_DOCS_URL } from "../mtclaw/types.js";
import { TIMEOUTS } from "../config/timeouts.js";
import { getMetricsCollector, type AgentMetric } from "../analytics/index.js";
import { createPricingRegistry } from "../budget/pricing-registry.js";
import { recordRoutingOutcome, getRecommendation } from "../providers/expert-routing.js";

// Sprint 121 T3: Import from extracted submodules
import {
  VALID_AGENTS as VALID_AGENTS_LIST,
  getAgentProviderModel,
} from "./router/agent-constants.js";
import {
  callClaudeBridgeClassified,
  dispatchAgentPrimary,
  dispatchAgentFallback,
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
    // Register Kimi proxy process cleanup (ADR-051)
    registerKimiProxyCleanup();

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
    /**
     * Sprint 136 A7 (2026-04-18): optional progress callback invoked on fallback
     * transitions. Wire from BusConsumer so CEO gets a heartbeat when the router
     * moves off Claude Code to a cloud provider. Text is CEO-facing (emoji-
     * prefixed so channel adapters can recognize it as user-facing).
     */
    progressFn?: (text: string) => void,
  ): Promise<AIResult> {
    const ws = workspace ?? this.config.projectRoot;
    const deps = { bridge: this.bridge, claudeAvailable: this.claudeAvailable, config: this.config };
    const callStartTime = Date.now();

    // ADR-052 (Sprint 140): Agent-aware provider dispatch.
    // Tier 1 (Claude primary) retains failure-classification behavior.
    // Tier 2/3 (Kimi/Ollama primary) use fallback chain on any failure.
    const agentConfig = getAgentProviderModel(agent);
    const isClaudePrimary = !agentConfig || agentConfig.provider === "claude-code";

    if (isClaudePrimary) {
      // ─── Tier 1: Claude Code Bridge (legacy behavior with failure classification) ───
      const { result: bridgeResult, failure } = await callClaudeBridgeClassified(
        deps,
        agent,
        task,
        history,
        ws,
        notifyFn,
      );
      if (bridgeResult) {
        this.recordTelemetry(agent, task, callStartTime, true, bridgeResult.provider ?? "claude-code", false, bridgeResult);
        return bridgeResult;
      }

      if (!failure) {
        throw new Error(
          "Claude Code request failed without a classification. Please retry; if the problem persists, run `claude --version` to verify the CLI is healthy.",
        );
      }

      switch (failure.kind) {
        case "RATE_LIMITED": {
          console.log(
            `[Router] Claude Code rate-limited (${failure.matchedToken ?? "unknown"}) — falling back for @${agent}...`,
          );
          progressFn?.(
            `⚡ Claude Code rate-limited (${failure.matchedToken ?? "Max plan window"}) — switching to fallback for @${agent}…`,
          );
          const fallbackResult = await dispatchAgentFallback(deps, agent, task, history, ws, notifyFn);
          if (fallbackResult) {
            this.recordTelemetry(agent, task, callStartTime, true, fallbackResult.provider ?? "fallback", true, fallbackResult);
            return fallbackResult;
          }

          throw new Error(
            `Claude Code is rate-limited (${failure.reason}) and no fallback provider responded. Please wait for the rate-limit window to reset.`,
          );
        }
        case "TIMEOUT": {
          // Sprint 143: Timeout → try cloud fallback (same as RATE_LIMITED).
          // CEO observed @cto hung on Telegram — CC CLI waited for permission
          // input that can't arrive from OTT. Fallback to Kimi/cloud ensures
          // CEO gets a response instead of silent timeout.
          console.log(
            `[Router] Claude Code timed out — falling back for @${agent}...`,
          );
          progressFn?.(
            `⏱️ Claude Code timed out — switching to fallback for @${agent}…`,
          );
          const timeoutFallback = await dispatchAgentFallback(deps, agent, task, history, ws, notifyFn);
          if (timeoutFallback) {
            this.recordTelemetry(agent, task, callStartTime, true, timeoutFallback.provider ?? "fallback", true, timeoutFallback);
            return timeoutFallback;
          }

          throw new Error(
            `⚠️ Claude Code timed out and no fallback provider responded. The CLI did not respond in time — it may be waiting for permission input. Try 'claude --version' to verify the CLI is healthy.`,
          );
        }
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

    // ─── Tier 2/3: Kimi or Ollama primary ───
    console.log(`[Router] ADR-052: @${agent} primary = ${agentConfig!.provider}`);
    const primaryResult = await dispatchAgentPrimary(deps, agent, task, history, ws, notifyFn);
    if (primaryResult) {
      this.recordTelemetry(agent, task, callStartTime, true, primaryResult.provider ?? agentConfig!.provider, false, primaryResult);
      return primaryResult;
    }

    // Primary failed — try tier-specific fallback chain
    console.log(`[Router] Primary provider failed for @${agent} — trying fallback chain...`);
    progressFn?.(`⚡ ${agentConfig!.provider} unavailable — trying fallback for @${agent}…`);
    const fallbackResult = await dispatchAgentFallback(deps, agent, task, history, ws, notifyFn);
    if (fallbackResult) {
      this.recordTelemetry(agent, task, callStartTime, true, fallbackResult.provider ?? "fallback", true, fallbackResult);
      return fallbackResult;
    }

    throw new Error(
      `All providers failed for @${agent}. Primary (${agentConfig!.provider}) and fallback chain exhausted.`,
    );
  }

  /**
   * Sprint 141 P0-1: record invocation telemetry for the cost dashboard.
   * Called at every successful return path in callAI().
   * CPO blocker fix: connects runtime to MetricsCollector.recordInvocation().
   */
  private recordTelemetry(
    agent: string,
    task: string,
    startTime: number,
    success: boolean,
    provider: string,
    fallbackUsed: boolean,
    result?: AIResult,
  ): void {
    try {
      const metric: AgentMetric = {
        agent,
        task: task.slice(0, 200),
        mode: "READ",
        startTime,
        endTime: Date.now(),
        durationMs: Date.now() - startTime,
        success,
        provider,
        fallbackUsed,
      };
      if (result?.tokenUsage) {
        metric.tokenUsage = {
          input: result.tokenUsage.inputTokens,
          output: result.tokenUsage.outputTokens,
        };
        // CPO blocker fix: derive cost from tokenUsage × pricing-registry
        // so cost.byAgent/byProvider in DailyMetrics are non-zero.
        try {
          const model = getAgentProviderModel(agent)?.model ?? "sonnet";
          const pricing = createPricingRegistry();
          metric.cost = pricing.calculateCost(
            model,
            result.tokenUsage.inputTokens,
            result.tokenUsage.outputTokens,
          );
        } catch {
          // pricing lookup failed — leave cost undefined
        }
      }
      getMetricsCollector().recordInvocation(metric);

      // OpenMythos #7: Expert routing — record outcome for historical scoring.
      // Always records regardless of FF state (Phase 1 data collection).
      // CPO fix: use actual runtime provider (from result or telemetry param),
      // not the agent's configured model — fallback scenarios change the
      // actual provider/model and the scoring must reflect reality.
      const configuredModel = getAgentProviderModel(agent);
      recordRoutingOutcome({
        agent,
        provider, // actual provider that served this call (from recordTelemetry param)
        model: configuredModel?.provider === provider
          ? (configuredModel.model ?? "unknown") // primary matched → use config model
          : `${provider}-fallback`,              // fallback → mark explicitly
        taskType: "chat",
        success,
        durationMs: metric.durationMs ?? 0,
        tokenCount: (result?.tokenUsage?.inputTokens ?? 0) + (result?.tokenUsage?.outputTokens ?? 0),
        timestamp: Date.now(),
      });

      // Phase 1: log recommendation (read-only, doesn't change routing)
      getRecommendation(agent, "chat");
    } catch {
      // Best-effort telemetry — never block the response path
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
