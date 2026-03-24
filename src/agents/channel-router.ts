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
import { resolveWorkspaceTier } from "./workspace-tier-resolver.js";
import { classifyPatchIntent } from "./intelligence/patch-intent-classifier.js";
import { PATCH_CONFIRMATION_TTL_MS, PATCH_SCOPE_SYSTEM_PROMPT, MAX_PATCH_FILES } from "./intelligence/patch-budget.js";
import { createApprovalRequest, waitForApproval } from "../gateway/methods/approval.js";
import { getBridgeAuditLogger } from "../bridge/security/bridge-audit.js";
import type { ChannelSendFn } from "../bus/types.js";
import type { MTClawBridge } from "../mtclaw/bridge.js";
import { type CrossSystemRoute, RAG_COLLECTIONS, AI_PLATFORM_DOCS_URL } from "../mtclaw/types.js";
// Sprint 115 (T1): RL prompt enrichment injection
import { getPromptEnrichment, formatEnrichmentForPrompt } from "../rl/prompt-enrichment.js";
// Sprint 115 (T2): Workspace context injection (mode-aware)
import { getWorkspaceContext, formatWorkspaceContext } from "./intelligence/workspace-context.js";

// ============================================================================
// Constants
// ============================================================================

export const VALID_AGENTS = [
  "pm", "architect", "coder", "reviewer", "tester", "researcher",
  "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
] as const;

export type AgentName = (typeof VALID_AGENTS)[number];

/**
 * Tier-aware per-agent model routing map.
 * Each tier defines agents available at that level with their model.
 * Higher tiers inherit all agents from lower tiers.
 *
 * LITE: assistant, coder, tester
 * STANDARD: + pm, architect, reviewer
 * PROFESSIONAL: + devops, fullstack, pjm, researcher
 * ENTERPRISE: + ceo, cto, cpo
 *
 * @see docs/03-design/model-routing-strategy.md
 * @since Sprint 100 — SASE 6.1.2 alignment
 */
export const TIER_AGENT_MODEL_MAP: Record<string, Record<string, string>> = {
  LITE: { assistant: "sonnet", coder: "sonnet", tester: "sonnet" },
  STANDARD: { pm: "sonnet", architect: "opus", reviewer: "opus" },
  PROFESSIONAL: { devops: "haiku", fullstack: "sonnet", pjm: "haiku", researcher: "sonnet" },
  ENTERPRISE: { ceo: "opus", cto: "opus", cpo: "opus" },
};

/** Backward-compatible flat map — all agents (ENTERPRISE tier). */
export const AGENT_MODEL_MAP: Record<string, string> = Object.assign(
  {}, ...Object.values(TIER_AGENT_MODEL_MAP),
);

/**
 * Get model for an agent at a specific tier.
 * Returns undefined if agent is not available at the requested tier (strict enforcement).
 * Callers should decide fallback behavior (e.g., use "sonnet" default or reject).
 *
 * @param agent - Agent name (e.g., "pm", "coder")
 * @param tier - Project tier (defaults to ENTERPRISE = all agents available)
 * @returns Model name or undefined if agent not available at tier
 */
export function getAgentModel(agent: string, tier?: string): string | undefined {
  const tierOrder = ["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"];
  const targetTier = tier ?? "ENTERPRISE";
  const tierIdx = tierOrder.indexOf(targetTier);
  if (tierIdx < 0) return AGENT_MODEL_MAP[agent]; // unknown tier → fallback to flat map

  for (let i = 0; i <= tierIdx; i++) {
    const tierKey = tierOrder[i]!;
    const tierAgents = TIER_AGENT_MODEL_MAP[tierKey];
    if (tierAgents && agent in tierAgents) return tierAgents[agent];
  }
  return undefined; // agent not available at requested tier
}

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
// Conversation History
// ============================================================================

/**
 * Max tokens for conversation history injection.
 * Budget: 2K total per turn (CLAUDE.md) = soul (~300) + history (800) + context transfer (600) + overhead.
 */
const MAX_HISTORY_TOKENS = 800;

/** Rough token estimate: ~4 chars per token */
const CHARS_PER_TOKEN = 4;

/**
 * Format conversation history as context prefix for system prompt.
 * Truncates oldest turns first to fit within MAX_HISTORY_TOKENS.
 */
function formatHistoryContext(
  history: Array<{ role: string; content: string }>,
): string {
  if (!history || history.length === 0) return "";

  const maxChars = MAX_HISTORY_TOKENS * CHARS_PER_TOKEN;
  const lines: string[] = [];
  let totalChars = 0;

  // Include newest turns first (reverse), then reverse back for chronological order
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn) continue;
    const line = `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`;
    if (totalChars + line.length > maxChars) break;
    lines.unshift(line);
    totalChars += line.length;
  }

  if (lines.length === 0) return "";

  return `\n\n[Conversation History]\n${lines.join("\n")}\n[/Conversation History]`;
}

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
  /** MTClaw bridge — cross-system agent communication (Sprint 113, ADR-034, CPO C2) */
  mtclawBridge?: MTClawBridge;
}

export interface RouteResult {
  agents: string[];
  task: string;
  /** Cross-system route (Sprint 113, ADR-034). When set, agents is empty. */
  crossSystem?: CrossSystemRoute;
}

/** Token usage from an AI call (Sprint 114). */
export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIResult {
  content: string;
  provider: string;
  durationMs: number;
  /** Token usage parsed from provider response (Sprint 114). */
  tokenUsage?: AITokenUsage;
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
  ollamaRemoteUrl: process.env.OLLAMA_REMOTE_URL || "https://ai.nqh-internal.example",
  ollamaRemoteApiKey: process.env.OLLAMA_REMOTE_API_KEY || "",
  ollamaRemoteModel: process.env.OLLAMA_REMOTE_MODEL || "qwen3-coder:30b",
  ollamaRemoteTimeout: 120000,
  projectRoot: process.cwd(),
  claudeTimeout: 300,
  claudeMaxTokens: 4000,
  verbose: false,
};

// ============================================================================
// Channel Router
// ============================================================================

export class ChannelRouter {
  readonly config: ChannelRouterConfig;
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

  /**
   * Route a message: extract agent mentions and task.
   * Uses local Ollama first, falls back to regex parseMention.
   */
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
   * Call AI with full fallback chain:
   * Claude Code Bridge → Cloud Provider → Remote Ollama
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

    // 1. PRIMARY: Claude Code Bridge
    const bridgeResult = await this.callClaudeBridge(agent, task, history, ws, notifyFn);
    if (bridgeResult) return bridgeResult;

    // 2. FALLBACK: Cloud provider (Gemini/OpenAI/Anthropic)
    console.log(`[Router] Trying cloud fallback for @${agent}...`);
    const cloudResult = await this.callCloudFallback(agent, task, history, ws);
    if (cloudResult) return cloudResult;

    // 3. LAST FALLBACK: Remote Ollama
    console.log(`[Router] Trying remote Ollama for @${agent}...`);
    const remoteResult = await this.callRemoteOllama(agent, task, history, ws);
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
   * Call MTClaw agent via cross-system route (Sprint 113, ADR-034).
   * This is a routing DESTINATION, NOT part of callAI() fallback chain (CTO C6).
   *
   * Sprint 115 T7: Agents with known RAG collections route to knowledge_search
   * with hybrid/vector mode instead of agent_chat (faster, collection-scoped).
   */
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

  /**
   * Append document viewer URLs for any doc_id references in MTClaw response.
   * Pattern: UUIDs that look like doc references get linked to AI-Platform viewer.
   */
  private appendDocViewerLinks(content: string): string {
    // Match UUID-like doc_id patterns in content (common in RAG responses)
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
              content: `You are a message router for EndiorBot. Route user messages to the best agent.
Valid agents: ${VALID_AGENTS.join(", ")}
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

  private async callClaudeBridge(
    agent: string,
    task: string,
    history?: Array<{ role: string; content: string }>,
    workspace?: string,
    /** Sprint 115 (T3): Optional notification function for approval messages */
    notifyFn?: ChannelSendFn,
  ): Promise<AIResult | null> {
    if (!this.claudeAvailable || !this.bridge) return null;

    const ws = workspace ?? this.config.projectRoot;

    // Sprint 105 (ADR-031 GAP-003): Classify intent — PATCH for explicit write requests
    const intent = classifyPatchIntent(task);

    // Sprint 115 (T1+T2): Build system prompt with optional enrichment + workspace context
    const contextParts: string[] = [];
    // T2: Workspace context — PATCH/INTERACTIVE only (skip READ to avoid noise)
    if (intent.intent === "PATCH" && intent.confidence >= 0.8
        && !process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT) {
      const wsCtx = formatWorkspaceContext(getWorkspaceContext(ws));
      if (wsCtx) contextParts.push(wsCtx);
    }
    // T1: RL enrichment (confidence-gated)
    const enrichment = formatEnrichmentForPrompt(getPromptEnrichment(agent));
    if (enrichment) contextParts.push(enrichment);
    const contextSuffix = contextParts.length > 0 ? "\n" + contextParts.join("\n") : "";
    const systemPrompt = getAgentSoul(agent) + formatHistoryContext(history ?? []) + contextSuffix;
    const tier = resolveWorkspaceTier(ws);
    const resolvedModel = getAgentModel(agent, tier);
    if (!resolvedModel) {
      console.warn(`[Router] Agent @${agent} not available at tier ${tier} — using sonnet fallback`);
    }
    const model = resolvedModel ?? "sonnet";

    // Audit all classifications (CPO C7)
    getBridgeAuditLogger().log({
      event: "patch_intent_classification",
      actorId: "system",
      actor: "system",
      details: {
        agent,
        message: task.slice(0, 100),
        intent: intent.intent,
        confidence: intent.confidence,
        reason: intent.reason,
        matchedPattern: intent.matchedPattern,
      },
    });

    // High-confidence PATCH intent → request CEO confirmation before executing
    if (intent.intent === "PATCH" && intent.confidence >= 0.8) {
      const confirmed = await this.requestPatchConfirmation(agent, task, intent, workspace, notifyFn);
      if (confirmed) {
        return this.executePatch(agent, task, systemPrompt, workspace, model);
      }
      // CEO declined or TTL expired → fall through to READ
      console.log(`[Router] PATCH intent declined/expired for @${agent} — falling back to READ`);
    }

    // Default: invokeRead (READ mode — safe, no file changes)
    try {
      const response = await this.bridge.invokeRead({
        systemPrompt,
        userPrompt: task,
        workspace: workspace ?? this.config.projectRoot,
        agent: agent as AgentRole,
        timeout: this.config.claudeTimeout,
        maxTokens: this.config.claudeMaxTokens,
        model,
      });

      if (response.success && response.output) {
        const aiResult: AIResult = { content: response.output, provider: "claude-code", durationMs: response.durationMs };
        // Sprint 114 (CTO C1): Capture bridge tokenUsage
        if (response.tokenUsage) {
          aiResult.tokenUsage = {
            inputTokens: response.tokenUsage.input,
            outputTokens: response.tokenUsage.output,
            totalTokens: response.tokenUsage.input + response.tokenUsage.output,
          };
        }
        return aiResult;
      }

      console.warn(`[Router] Claude Bridge error: ${response.error}`);
      return null;
    } catch (e) {
      console.warn(`[Router] Claude Bridge failed: ${(e as Error).message}`);
      // F2: Don't permanently disable — allow retry on next request
      console.warn("[Router] Claude Bridge error (will retry next request)");
      return null;
    }
  }

  /**
   * Request CEO confirmation for a PATCH operation.
   * TTL: 5 minutes. On expiry → auto-decline → READ fallback. (CTO C1)
   */
  private async requestPatchConfirmation(
    agent: string,
    task: string,
    intent: { confidence: number; reason: string },
    workspace?: string,
    /** Sprint 115 (T3): Optional notification function for approval messages */
    notifyFn?: ChannelSendFn,
  ): Promise<boolean> {
    const approvalRequest = createApprovalRequest("action", `@${agent} wants to modify files`, {
      details: {
        agent,
        task: task.slice(0, 200),
        intent: "PATCH",
        confidence: intent.confidence,
        reason: intent.reason,
        workspace: workspace ?? this.config.projectRoot,
        instructions: `Use /approve ${"{id}"} to allow or /reject ${"{id}"} to keep as read-only suggestion.`,
      },
      expiresInMs: PATCH_CONFIRMATION_TTL_MS, // 5 minutes (CTO C1)
    });

    getBridgeAuditLogger().log({
      event: "patch_confirmation_requested",
      actorId: "system",
      actor: "system",
      details: { approvalId: approvalRequest.id, agent, task: task.slice(0, 100) },
    });

    // Sprint 115 (T3): Immediately notify CEO about pending approval — before waitForApproval blocks
    if (notifyFn) {
      const approvalMsg = `🔐 *PATCH approval required*\n@${agent} wants to modify files.\n\nApproval ID: \`${approvalRequest.id}\`\nUse /approve ${approvalRequest.id} to allow or /reject ${approvalRequest.id} to cancel.\nExpires in 5 min.`;
      notifyFn(approvalMsg).catch(() => {}); // best-effort, non-blocking
    }

    try {
      const result = await waitForApproval(approvalRequest.id, PATCH_CONFIRMATION_TTL_MS);

      if (result.status === "approved") {
        getBridgeAuditLogger().log({
          event: "patch_confirmation_approved",
          actorId: result.respondedBy ?? "ceo",
          actor: "system",
          details: { approvalId: approvalRequest.id, agent },
        });
        return true;
      }

      if (result.status === "expired") {
        getBridgeAuditLogger().log({
          event: "patch_confirmation_expired",
          actorId: "system",
          actor: "system",
          details: { approvalId: approvalRequest.id, agent, task: task.slice(0, 100) },
        });
      } else {
        getBridgeAuditLogger().log({
          event: "patch_confirmation_rejected",
          actorId: result.respondedBy ?? "ceo",
          actor: "system",
          details: { approvalId: approvalRequest.id, agent, notes: result.notes },
        });
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Execute @agent in PATCH mode (confirmed by CEO).
   * Injects scope system prompt (max 5 files). (CPO C9, CTO C2)
   */
  private async executePatch(
    agent: string,
    task: string,
    soulPrompt: string,
    workspace?: string,
    model?: string,
  ): Promise<AIResult | null> {
    if (!this.bridge) return null;

    const ws = workspace ?? this.config.projectRoot;
    // Inject scope cap system prompt (CTO C2: soft cap via prompt)
    const systemPrompt = soulPrompt + "\n\n" + PATCH_SCOPE_SYSTEM_PROMPT;

    try {
      const response = await this.bridge.invokePatch({
        systemPrompt,
        userPrompt: task,
        workspace: ws,
        agent: agent as AgentRole,
        timeout: this.config.claudeTimeout,
        maxTokens: this.config.claudeMaxTokens,
        model: model ?? "sonnet",
      });

      if (!response.success) {
        console.warn(`[Router] PATCH execution failed: ${response.error}`);
        return null;
      }

      // Post-execution audit: check if file cap was exceeded (CTO C2 safety net)
      const fileCount = response.affectedFiles?.length ?? 0;
      if (fileCount > MAX_PATCH_FILES) {
        getBridgeAuditLogger().log({
          event: "patch_scope_exceeded",
          actorId: "system",
          actor: "system",
          details: { agent, fileCount, limit: MAX_PATCH_FILES, workspace: ws },
        });
        const exceeded = `\n\n⚠️ Note: ${fileCount} files modified (limit ${MAX_PATCH_FILES}). Review git diff.`;
        return {
          content: (response.output ?? "") + exceeded,
          provider: "claude-code-patch",
          durationMs: response.durationMs,
        };
      }

      return {
        content: response.output ?? "",
        provider: "claude-code-patch",
        durationMs: response.durationMs,
      };
    } catch (e) {
      console.warn(`[Router] PATCH execution failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async callCloudFallback(
    agent: string,
    task: string,
    history?: Array<{ role: string; content: string }>,
    workspace?: string,
  ): Promise<AIResult | null> {
    const registry = getProviderRegistry();
    const provider = registry.getDefault();
    if (!provider) return null;

    const ws = workspace ?? this.config.projectRoot;
    // CTO F2: Log tier for cloud fallback observability
    const tier = resolveWorkspaceTier(ws);
    console.log(`[Router] Cloud fallback for @${agent} (workspace tier: ${tier}, model: ${provider.models[0]?.id ?? "unknown"})`);
    // Sprint 115 (T1+T2): Enrich cloud fallback prompt (mirrors callClaudeBridge pattern)
    const cloudParts: string[] = [`[Workspace: ${ws}]`];
    const cloudIntent = classifyPatchIntent(task);
    if (cloudIntent.intent === "PATCH" && cloudIntent.confidence >= 0.8
        && !process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT) {
      const wsCtx = formatWorkspaceContext(getWorkspaceContext(ws));
      if (wsCtx) cloudParts.push(wsCtx);
    }
    const cloudEnrichment = formatEnrichmentForPrompt(getPromptEnrichment(agent));
    if (cloudEnrichment) cloudParts.push(cloudEnrichment);
    const systemPrompt = getAgentSoul(agent) + formatHistoryContext(history ?? [])
      + "\n\n" + cloudParts.join("\n");
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
      const result: AIResult = { content: response.content, provider: provider.name || "cloud", durationMs: Date.now() - startTime };
      // Sprint 114: Parse token usage from provider ChatResponse
      if (response.usage) {
        result.tokenUsage = {
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        };
      }
      return result;
    } catch (e) {
      console.warn(`[Router] Cloud fallback failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async callRemoteOllama(
    agent: string,
    task: string,
    history?: Array<{ role: string; content: string }>,
    workspace?: string,
  ): Promise<AIResult | null> {
    if (!this.config.ollamaRemoteUrl) return null;

    const ws = workspace ?? this.config.projectRoot;
    // Sprint 115 (T1+T2): Enrich remote Ollama prompt (mirrors callClaudeBridge pattern)
    const ollamaParts: string[] = [`[Workspace: ${ws}]`];
    const ollamaIntent = classifyPatchIntent(task);
    if (ollamaIntent.intent === "PATCH" && ollamaIntent.confidence >= 0.8
        && !process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT) {
      const wsCtx = formatWorkspaceContext(getWorkspaceContext(ws));
      if (wsCtx) ollamaParts.push(wsCtx);
    }
    const ollamaEnrichment = formatEnrichmentForPrompt(getPromptEnrichment(agent));
    if (ollamaEnrichment) ollamaParts.push(ollamaEnrichment);
    const systemPrompt = getAgentSoul(agent) + formatHistoryContext(history ?? [])
      + "\n\n" + ollamaParts.join("\n");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.ollamaRemoteApiKey) {
      headers["X-API-Key"] = this.config.ollamaRemoteApiKey;
    }

    try {
      const startTime = Date.now();
      // AI-Platform uses OpenAI-compatible API (not native Ollama)
      const res = await fetch(`${this.config.ollamaRemoteUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.ollamaRemoteModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: task },
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(this.config.ollamaRemoteTimeout),
      });

      if (!res.ok) return null;

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      const result: AIResult = { content, provider: "ai-platform", durationMs: Date.now() - startTime };
      // Sprint 114: Parse token usage from OpenAI-compatible response
      if (data.usage) {
        result.tokenUsage = {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        };
      }
      return result;
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
