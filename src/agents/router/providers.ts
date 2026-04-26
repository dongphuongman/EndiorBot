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
import { classifyPatchIntent, type PatchIntentResult } from "../intelligence/patch-intent-classifier.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import type { ChannelSendFn } from "../../bus/types.js";
import { getPromptEnrichment, formatEnrichmentForPrompt } from "../../rl/prompt-enrichment.js";
import { getWorkspaceContext, formatWorkspaceContext } from "../intelligence/workspace-context.js";
import {
  getAgentSoul,
  getAgentModel,
  getAgentTimeoutMs,
  formatHistoryContext,
  resolveWorkspaceTier,
  getAgentProviderModel,
  TIER_FALLBACK_CHAIN,
} from "./agent-constants.js";
import { requestPatchConfirmation, executePatch } from "./patch-flow.js";
import type { ChannelRouterConfig, AIResult } from "../channel-router.js";
import {
  classifyClaudeCodeFailure,
  type ClaudeCodeFailureClassification,
  type ClaudeCodeFailureKind,
} from "../../providers/claude-code/rate-limit-detector.js";
export type { ClaudeCodeFailureKind, ClaudeCodeFailureClassification };

// ============================================================================
// Provider Dependencies (CTO C1: explicit params)
// ============================================================================

export interface ProviderDeps {
  bridge: ClaudeCodeBridge | null;
  claudeAvailable: boolean;
  config: ChannelRouterConfig;
}

// ============================================================================
// Enriched Prompt Builder — UNIVERSAL (vendor-agnostic)
//
// Sprint 142: Extract from 5 provider functions to eliminate duplication.
// CEO directive: "dù dùng CC hay Kimi thì vẫn phải đọc codebase."
// All agents get workspace context regardless of intent (PATCH or READ).
// Provider functions are pure API transport — no context-building logic.
//
// Content complementarity (PM C1 resolution — Option B accepted):
//   formatWorkspaceContext() = git DATA (branch, commits, diff stats)
//   Layer 1.25 WORKSPACE_AWARENESS = INSTRUCTION (discovery protocol)
//   Both injected for Claude Bridge; only this layer for cloud/Kimi/Ollama.
// ============================================================================

export interface EnrichedPrompt {
  systemPrompt: string;
  intent: PatchIntentResult;
  workspace: string;
}

/**
 * Build an enriched system prompt with SOUL + workspace + RL context.
 * Called ONCE per request — result passed to any provider (CC, Kimi, OpenAI, Ollama).
 *
 * @since Sprint 142 — vendor-agnostic enrichment layer
 */
export function buildEnrichedPrompt(
  agent: string,
  task: string,
  config: { projectRoot: string },
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
): EnrichedPrompt {
  const ws = workspace ?? config.projectRoot;
  const intent = classifyPatchIntent(task);
  const parts: string[] = [];

  // Workspace context — ALWAYS inject (CEO fix: not PATCH-only)
  // Kill switch: ENDIORBOT_DISABLE_WORKSPACE_CONTEXT=true to suppress
  if (!process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT) {
    const wsCtx = formatWorkspaceContext(getWorkspaceContext(ws));
    if (wsCtx) parts.push(wsCtx);
  }

  // RL enrichment (confidence-gated)
  const enrichment = formatEnrichmentForPrompt(getPromptEnrichment(agent));
  if (enrichment) parts.push(enrichment);

  const systemPrompt = getAgentSoul(agent)
    + formatHistoryContext(history ?? [])
    + (parts.length > 0 ? "\n\n" + parts.join("\n") : "");

  return { systemPrompt, intent, workspace: ws };
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
  prebuiltPrompt?: EnrichedPrompt,
): Promise<AIResult | null> {
  if (!deps.claudeAvailable || !deps.bridge) return null;

  // Sprint 142: Use prebuilt prompt if provided (avoids double-building when
  // called from callClaudeBridgeClassified), otherwise build fresh.
  const { systemPrompt, intent, workspace: ws } = prebuiltPrompt
    ?? buildEnrichedPrompt(agent, task, deps.config, history, workspace);
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
  // Sprint 137 B6: per-agent timeout (executor=60s / advisory=180s /
  // adr-writer=600s); env-tunable per agent + per class. invokeRead expects
  // seconds, so divide ms → s.
  const perAgentTimeoutMs = getAgentTimeoutMs(agent, deps.config.claudeTimeout * 1000);
  const perAgentTimeoutSec = Math.max(1, Math.round(perAgentTimeoutMs / 1000));
  try {
    const response = await deps.bridge.invokeRead({
      systemPrompt,
      userPrompt: task,
      workspace: workspace ?? deps.config.projectRoot,
      agent: agent as AgentRole,
      timeout: perAgentTimeoutSec,
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

/**
 * Classified variant of `callClaudeBridge` — returns both the result (if any)
 * and a classification of the failure (rate-limit / timeout / auth / other).
 *
 * Sprint 136 A11 (2026-04-18): CEO policy — only RATE_LIMITED triggers Gemini
 * fallback. Timeout/auth/other surface to user directly.
 *
 * This wraps the original callClaudeBridge without changing its contract, so
 * existing tests and callers continue to work unmodified.
 */
export async function callClaudeBridgeClassified(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
  notifyFn?: ChannelSendFn,
): Promise<{ result: AIResult | null; failure: ClaudeCodeFailureClassification | null }> {
  if (!deps.claudeAvailable || !deps.bridge) {
    return {
      result: null,
      failure: {
        kind: "OTHER",
        reason: "Claude Code bridge not available (not configured or disabled)",
      },
    };
  }

  // Sprint 142: Build enriched prompt ONCE, pass to callClaudeBridge if needed.
  const enriched = buildEnrichedPrompt(agent, task, deps.config, history, workspace);
  const { systemPrompt, intent, workspace: ws } = enriched;
  const tier = resolveWorkspaceTier(ws);
  const resolvedModel = getAgentModel(agent, tier);
  const model = resolvedModel ?? "sonnet";

  // PATCH flow short-circuits classification — pass prebuilt prompt to avoid double-building.
  if (intent.intent === "PATCH" && intent.confidence >= 0.8) {
    const result = await callClaudeBridge(deps, agent, task, history, workspace, notifyFn, enriched);
    return { result, failure: result ? null : { kind: "OTHER", reason: "PATCH flow failed or declined" } };
  }

  // Sprint 137 B6: per-agent timeout (same SSOT as the classic callClaudeBridge path).
  const perAgentTimeoutMs2 = getAgentTimeoutMs(agent, deps.config.claudeTimeout * 1000);
  const perAgentTimeoutSec2 = Math.max(1, Math.round(perAgentTimeoutMs2 / 1000));
  try {
    const response = await deps.bridge.invokeRead({
      systemPrompt,
      userPrompt: task,
      workspace: workspace ?? deps.config.projectRoot,
      agent: agent as AgentRole,
      timeout: perAgentTimeoutSec2,
      maxTokens: deps.config.claudeMaxTokens,
      model,
    });

    if (response.success && response.output) {
      const aiResult: AIResult = {
        content: response.output,
        provider: "claude-code",
        durationMs: response.durationMs,
      };
      if (response.tokenUsage) {
        aiResult.tokenUsage = {
          inputTokens: response.tokenUsage.input,
          outputTokens: response.tokenUsage.output,
          totalTokens: response.tokenUsage.input + response.tokenUsage.output,
        };
      }
      return { result: aiResult, failure: null };
    }

    const timedOutByHost = typeof response.error === "string" && /^Timed out after/.test(response.error);
    const classifyCtx: {
      stdout?: string;
      stderr?: string;
      error?: string;
      timedOutByHost?: boolean;
      exitCode?: number;
    } = { timedOutByHost, exitCode: response.exitCode };
    if (response.output) classifyCtx.stdout = response.output;
    if (response.error) classifyCtx.error = response.error;
    const failure = classifyClaudeCodeFailure(classifyCtx);
    log.warn(`Claude Bridge error [${failure.kind}]: ${failure.reason}`);
    return { result: null, failure };
  } catch (e) {
    const msg = (e as Error).message;
    log.warn(`Claude Bridge threw: ${msg}`);
    return {
      result: null,
      failure: classifyClaudeCodeFailure({
        error: msg,
        timedOutByHost: /timed out/i.test(msg),
      }),
    };
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
  /** Sprint 124b: Optional model override — autonomous manager passes tier-selected model */
  modelOverride?: string,
): Promise<AIResult | null> {
  const registry = getProviderRegistry();
  // Sprint 136 A11 (2026-04-18): Cloud fallback MUST skip `claude-code` provider —
  // that is the path that already failed upstream. Previously `getDefault()`
  // returned `claude-code` first and the "cloud fallback" was just a second
  // Claude Code CLI invocation, wasting 60s then reaching the real cloud
  // fallback with everything hung. Prefer actual cloud providers (Gemini,
  // OpenAI) which CEO has explicitly approved via .env.local keys.
  //
  // ADR-051 (Sprint 140): Fallback chain per CEO directive 2026-04-23.
  // Preference order:
  //   kimi-proxy (OAuth) → kimi-api (API key) → openai
  //   Gemini removed; Anthropic removed.
  const preferredOrder = ["kimi-proxy", "kimi-api", "openai"];
  let provider: ReturnType<typeof registry.get> = undefined;
  for (const id of preferredOrder) {
    if (registry.has(id)) {
      provider = registry.get(id);
      if (provider) break;
    }
  }
  if (!provider) {
    // Last-resort: any non-claude-code provider registered
    for (const p of registry.list()) {
      if (p.id !== "claude-code") {
        provider = p;
        break;
      }
    }
  }
  if (!provider) {
    log.warn("Cloud fallback: no non-claude-code provider available");
    return null;
  }

  // Sprint 142: Vendor-agnostic enrichment — build once, transport only.
  const { systemPrompt: basePrompt, workspace: ws } = buildEnrichedPrompt(agent, task, deps.config, history, workspace);
  const systemPrompt = process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT
    ? basePrompt
    : `[Workspace: ${ws}]\n${basePrompt}`;
  // CTO F2: Log tier for cloud fallback observability
  const tier = resolveWorkspaceTier(ws);
  log.info(`Cloud fallback for @${agent} (workspace tier: ${tier}, model: ${modelOverride ?? provider.models[0]?.id ?? "unknown"})`);
  const modelId = modelOverride ?? provider.models[0]?.id;
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
// Kimi Provider (Tier 2 Primary)
// ============================================================================

/**
 * Call Kimi provider (proxy → API) for Tier-2 agents.
 * ADR-051: kimi-proxy (OAuth) preferred, kimi-api (API key) fallback.
 */
export async function callKimiProvider(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
  modelOverride?: string,
): Promise<AIResult | null> {
  const registry = getProviderRegistry();
  const preferredOrder = ["kimi-proxy", "kimi-api"];
  let provider: ReturnType<typeof registry.get> = undefined;
  for (const id of preferredOrder) {
    if (registry.has(id)) {
      provider = registry.get(id);
      if (provider) break;
    }
  }
  if (!provider) {
    log.warn(`Kimi provider unavailable for @${agent}`);
    return null;
  }

  // Sprint 142: Vendor-agnostic enrichment — build once, transport only.
  const { systemPrompt: basePrompt, workspace: ws } = buildEnrichedPrompt(agent, task, deps.config, history, workspace);
  const systemPrompt = process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT
    ? basePrompt
    : `[Workspace: ${ws}]\n${basePrompt}`;

  // Use agent's configured Kimi model or override
  const agentConfig = getAgentProviderModel(agent);
  const modelId = modelOverride ?? agentConfig?.model ?? provider.models[0]?.id ?? "kimi-k2-6";
  if (!modelId) return null;

  // Sprint 141 P0-3: rate-limit monitoring
  const { recordProxySuccess, recordProxyRateLimit, recordFallbackToApi } =
    await import("../../providers/kimi-proxy/rate-limit-monitor.js");

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
    const latencyMs = Date.now() - startTime;
    recordProxySuccess(latencyMs);
    const result: AIResult = {
      content: response.content,
      provider: provider.id === "kimi-proxy" ? "kimi-proxy" : "kimi-api",
      durationMs: latencyMs,
    };
    if (response.usage) {
      result.tokenUsage = {
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
    }
    return result;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);

    // Sprint 141 P0-3: detect 429 rate-limit and try kimi-api fallback
    const is429 = errMsg.includes("429") || errMsg.includes("rate limit") || errMsg.includes("Rate limit");
    if (is429 && provider.id === "kimi-proxy") {
      recordProxyRateLimit();
      log.warn(`Kimi proxy rate-limited for @${agent} — trying kimi-api fallback`);

      // Try kimi-api as immediate fallback
      const apiProvider = registry.has("kimi-api") ? registry.get("kimi-api") : undefined;
      if (apiProvider) {
        try {
          const fbStart = Date.now();
          const fbResponse = await apiProvider.chat({
            model: modelId,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: task },
            ],
            temperature: 0.7,
            maxTokens: 2000,
          });
          const fbLatency = Date.now() - fbStart;
          recordFallbackToApi(fbLatency);
          const fbResult: AIResult = {
            content: fbResponse.content,
            provider: "kimi-api",
            durationMs: fbLatency,
          };
          if (fbResponse.usage) {
            fbResult.tokenUsage = {
              inputTokens: fbResponse.usage.promptTokens,
              outputTokens: fbResponse.usage.completionTokens,
              totalTokens: fbResponse.usage.totalTokens,
            };
          }
          return fbResult;
        } catch (fbErr) {
          log.warn(`Kimi API fallback also failed: ${(fbErr as Error).message}`);
        }
      }
    }

    log.warn(`Kimi provider failed for @${agent}: ${errMsg}`);
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

  // Sprint 142: Vendor-agnostic enrichment — build once, transport only.
  const { systemPrompt: basePrompt, workspace: ws } = buildEnrichedPrompt(agent, task, deps.config, history, workspace);
  const systemPrompt = process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT
    ? basePrompt
    : `[Workspace: ${ws}]\n${basePrompt}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (deps.config.ollamaRemoteApiKey) {
    headers["X-API-Key"] = deps.config.ollamaRemoteApiKey;
  }

  try {
    const startTime = Date.now();
    // ADR-052: Use agent's configured Ollama model for Tier-3 agents
    const agentConfig = getAgentProviderModel(agent);
    const ollamaModel = agentConfig?.provider === "ollama"
      ? agentConfig.model
      : deps.config.ollamaRemoteModel;

    // AI-Platform uses OpenAI-compatible API (not native Ollama)
    const res = await fetch(`${deps.config.ollamaRemoteUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ollamaModel,
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

// ============================================================================
// Agent-Aware Dispatch (ADR-052)
// ============================================================================

/**
 * Dispatch to an agent's PRIMARY provider (per ADR-052 tier mapping).
 *
 * Tier 1 (@architect, @cso, @ceo)  → Claude Code Bridge (Opus)
 * Tier 2 (@coder, @reviewer, ...)   → Kimi (proxy → API)
 * Tier 3 (@assistant)               → Ollama (AI-Platform)
 */
export async function dispatchAgentPrimary(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
  notifyFn?: ChannelSendFn,
): Promise<AIResult | null> {
  const config = getAgentProviderModel(agent);
  if (!config) {
    log.warn(`No provider config for @${agent} — falling back to Claude Code`);
    return callClaudeBridge(deps, agent, task, history, workspace, notifyFn);
  }

  log.info(`ADR-052 dispatch: @${agent} → ${config.provider} (${config.model}) [tier ${config.tier}]`);

  switch (config.provider) {
    case "claude-code":
      return callClaudeBridge(deps, agent, task, history, workspace, notifyFn);
    case "kimi":
      return callKimiProvider(deps, agent, task, history, workspace, config.model);
    case "ollama": {
      // Sprint 141 P0-2: Ollama confidence check for Tier-3 agents.
      // Score the response; if below threshold AND FF enabled, return null
      // to trigger the fallback chain (typically Kimi).
      // CTO C1: always log confidence regardless of FF state.
      const ollamaResult = await callRemoteOllama(deps, agent, task, history, workspace);
      if (ollamaResult) {
        const { scoreOllamaConfidence } = await import("./ollama-confidence.js");
        const confidence = scoreOllamaConfidence(ollamaResult.content, agent);
        if (confidence.shouldEscalate) {
          log.info(`Ollama response below confidence threshold — escalating @${agent}`, {
            score: confidence.score,
            reason: confidence.reason,
          });
          return null; // triggers fallback chain
        }
      }
      return ollamaResult;
    }
    default:
      log.warn(`Unknown provider ${config.provider} for @${agent} — falling back to Claude Code`);
      return callClaudeBridge(deps, agent, task, history, workspace, notifyFn);
  }
}

/**
 * Dispatch to an agent's FALLBACK chain (per ADR-052 tier mapping).
 *
 * Iterates the tier-specific fallback chain until a provider responds.
 */
export async function dispatchAgentFallback(
  deps: ProviderDeps,
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
  notifyFn?: ChannelSendFn,
): Promise<AIResult | null> {
  const config = getAgentProviderModel(agent);
  const tier = config?.tier ?? 2;
  const chain = TIER_FALLBACK_CHAIN[tier];

  // Skip the primary provider (already tried and failed)
  const primaryProvider = config?.provider;
  const fallbackChain = chain.filter((p) => p !== primaryProvider);

  for (const providerId of fallbackChain) {
    log.info(`ADR-052 fallback: @${agent} → ${providerId} [tier ${tier}]`);
    let result: AIResult | null = null;

    const fbStart = Date.now();
    switch (providerId) {
      case "claude-code":
        result = await callClaudeBridge(deps, agent, task, history, workspace, notifyFn);
        break;
      case "kimi":
        result = await callKimiProvider(deps, agent, task, history, workspace, config?.model);
        break;
      case "ollama":
        result = await callRemoteOllama(deps, agent, task, history, workspace);
        break;
    }

    if (result) {
      log.info(`ADR-052 fallback success: @${agent} via ${providerId}`);
      // Sprint 141 P0-3 CPO fix: record fallback-to-Claude telemetry
      if (providerId === "claude-code" && primaryProvider !== "claude-code") {
        const { recordFallbackToClaude } = await import("../../providers/kimi-proxy/rate-limit-monitor.js");
        recordFallbackToClaude(Date.now() - fbStart);
      }
      return result;
    }
  }

  log.warn(`ADR-052 fallback exhausted for @${agent} — no provider responded`);
  return null;
}
