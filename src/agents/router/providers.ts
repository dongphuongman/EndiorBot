/**
 * Provider Functions — Claude Bridge, Cloud Fallback, Remote Ollama
 *
 * Standalone functions extracted from ChannelRouter (Sprint 121 T3).
 * CTO C1: Explicit params, not class delegation.
 *
 * @module agents/router/providers
 * @sprint 121 — Track 3
 */

import type { ClaudeCodeBridge } from "../invoke/index.js";
import { getProviderRegistry } from "../../providers/provider-registry.js";
import type { AgentRole } from "../types/handoff.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("agents.router.providers");
import { classifyPatchIntent } from "../intelligence/patch-intent-classifier.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import type { ChannelSendFn } from "../../bus/types.js";
import { getPromptEnrichment, formatEnrichmentForPrompt } from "../../rl/prompt-enrichment.js";
import { getWorkspaceContext, formatWorkspaceContext } from "../intelligence/workspace-context.js";
import {
  getAgentSoul,
  getAgentModel,
  formatHistoryContext,
  resolveWorkspaceTier,
} from "./agent-constants.js";
import { requestPatchConfirmation, executePatch } from "./patch-flow.js";
import type { ChannelRouterConfig, AIResult } from "../channel-router.js";

// ============================================================================
// Provider Dependencies (CTO C1: explicit params)
// ============================================================================

export interface ProviderDeps {
  bridge: ClaudeCodeBridge | null;
  claudeAvailable: boolean;
  config: ChannelRouterConfig;
}

// ============================================================================
// Claude Bridge Provider
// ============================================================================

/**
 * Call Claude Code Bridge with PATCH intent detection.
 * Returns null if bridge unavailable or call fails.
 */
export async function callClaudeBridge(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
  notifyFn?: ChannelSendFn,
): Promise<AIResult | null> {
  if (!deps.claudeAvailable || !deps.bridge) return null;

  const ws = workspace ?? deps.config.projectRoot;

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
    log.warn(`Agent @${agent} not available at tier ${tier} — using sonnet fallback`);
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
    const confirmed = await requestPatchConfirmation(deps, agent, task, intent, workspace, notifyFn);
    if (confirmed) {
      return executePatch(deps, agent, task, systemPrompt, workspace, model);
    }
    // CEO declined or TTL expired → fall through to READ
    log.info(`PATCH intent declined/expired for @${agent} — falling back to READ`);
  }

  // Default: invokeRead (READ mode — safe, no file changes)
  try {
    const response = await deps.bridge.invokeRead({
      systemPrompt,
      userPrompt: task,
      workspace: workspace ?? deps.config.projectRoot,
      agent: agent as AgentRole,
      timeout: deps.config.claudeTimeout,
      maxTokens: deps.config.claudeMaxTokens,
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

    log.warn(`Claude Bridge error: ${response.error}`);
    return null;
  } catch (e) {
    log.warn(`Claude Bridge failed: ${(e as Error).message}`);
    // F2: Don't permanently disable — allow retry on next request
    log.warn("Claude Bridge error (will retry next request)");
    return null;
  }
}

// ============================================================================
// Cloud Fallback Provider
// ============================================================================

/**
 * Call cloud provider (Gemini/OpenAI/Anthropic) as fallback.
 * Returns null if no provider available or call fails.
 */
export async function callCloudFallback(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
): Promise<AIResult | null> {
  const registry = getProviderRegistry();
  const provider = registry.getDefault();
  if (!provider) return null;

  const ws = workspace ?? deps.config.projectRoot;
  // CTO F2: Log tier for cloud fallback observability
  const tier = resolveWorkspaceTier(ws);
  log.info(`Cloud fallback for @${agent} (workspace tier: ${tier}, model: ${provider.models[0]?.id ?? "unknown"})`);
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
    log.warn(`Cloud fallback failed: ${(e as Error).message}`);
    return null;
  }
}

// ============================================================================
// Remote Ollama Provider
// ============================================================================

/**
 * Call remote Ollama (AI Platform) as last fallback.
 * Returns null if not configured or call fails.
 */
export async function callRemoteOllama(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
): Promise<AIResult | null> {
  if (!deps.config.ollamaRemoteUrl) return null;

  const ws = workspace ?? deps.config.projectRoot;
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
  if (deps.config.ollamaRemoteApiKey) {
    headers["X-API-Key"] = deps.config.ollamaRemoteApiKey;
  }

  try {
    const startTime = Date.now();
    // AI-Platform uses OpenAI-compatible API (not native Ollama)
    const res = await fetch(`${deps.config.ollamaRemoteUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: deps.config.ollamaRemoteModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: task },
        ],
        stream: false,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(deps.config.ollamaRemoteTimeout),
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
    log.warn(`Remote Ollama failed: ${(e as Error).message}`);
    return null;
  }
}
