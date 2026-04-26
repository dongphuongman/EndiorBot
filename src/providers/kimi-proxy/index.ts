/**
 * Kimi Proxy Provider
 *
 * Routes to a local claude-code-proxy instance running Kimi2.6.
 * The proxy exposes an Anthropic-compatible API at a local endpoint
 * and is started via the SubprocessOrchestrator.
 *
 * @module providers/kimi-proxy
 * @since Sprint 140 — Kimi2.6 fallback for all SDLC agents
 */

import { AnthropicProvider } from "../anthropic/index.js";
import { safeFetch } from "../../security/safe-fetch.js";
import type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
} from "../types.js";

/** Kimi model definitions exposed by the proxy. */
const KIMI_MODELS: ModelDefinition[] = [
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    contextWindow: 256000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "kimi-for-coding",
    name: "Kimi for Coding",
    contextWindow: 256000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
];

/**
 * KimiProxyProvider delegates to an internal AnthropicProvider instance
 * because the local proxy speaks Anthropic-compatible API.
 *
 * We use composition rather than inheritance because AnthropicProvider
 * declares its id/name/models as literal types that cannot be overridden.
 */
export class KimiProxyProvider implements AIProvider {
  readonly id = "kimi-proxy";
  readonly name = "Kimi Proxy (claude-code-proxy)";
  readonly models = KIMI_MODELS;

  private inner = new AnthropicProvider();
  private _proxyUrl: string | undefined;

  async initialize(config: ProviderConfig): Promise<void> {
    this._proxyUrl = config.baseUrl ?? "http://127.0.0.1:18765";
    await this.inner.initialize({
      ...config,
      apiKey: config.apiKey ?? "anything",
      baseUrl: this._proxyUrl,
    });
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Sprint 143 fix: Force model to a Kimi-compatible name.
    // The inner AnthropicProvider validates model against its own model list
    // (claude-*) and rejects kimi-k2.6. But the proxy binary routes by model
    // name — it accepts kimi-k2.6, kimi-for-coding, etc. We normalize here
    // so callers can pass any model name and it reaches the proxy correctly.
    const kimiModel = this.resolveKimiModel(request.model);
    return this.inner.chat({ ...request, model: kimiModel });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const kimiModel = this.resolveKimiModel(request.model);
    yield* this.inner.chatStream({ ...request, model: kimiModel });
  }

  /**
   * Resolve any model name to one the proxy accepts.
   * If the model is already a Kimi model, pass through.
   * If it's a Claude/OpenAI model (from agent config), map to default Kimi model.
   */
  private resolveKimiModel(model: string): string {
    const kimiModelIds = KIMI_MODELS.map(m => m.id);
    if (kimiModelIds.includes(model)) return model;
    // Non-Kimi model name (e.g. "sonnet", "gpt-4o") → use default Kimi model
    return KIMI_MODELS[0]?.id ?? "kimi-k2.6";
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this._proxyUrl) {
      return { status: "unhealthy", message: "Proxy URL not configured" };
    }
    const start = Date.now();
    try {
      const res = await safeFetch(`${this._proxyUrl}/healthz`, {
        signal: AbortSignal.timeout(3000),
      }, { provider: "kimi-proxy" });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { status: "healthy", latencyMs };
      }
      return {
        status: "unhealthy",
        latencyMs,
        message: `HTTP ${res.status}`,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Create a KimiProxyProvider from environment variables.
 *
 * Env:
 *   KIMI_PROXY_URL — proxy endpoint (default http://127.0.0.1:18765)
 *   KIMI_PROXY_API_KEY — optional, passed as Anthropic x-api-key
 */
export function createKimiProxyProviderFromEnv(): KimiProxyProvider {
  const provider = new KimiProxyProvider();
  return provider;
}

// Re-export orchestrator utilities
export {
  startKimiProxy,
  stopKimiProxy,
  getKimiProxyState,
  registerKimiProxyCleanup,
  type SubprocessOrchestratorState,
} from "./subprocess-orchestrator.js";
