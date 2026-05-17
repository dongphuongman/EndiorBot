/**
 * Kimi Coding Provider
 *
 * Direct integration with Kimi Coding API via CEO subscription.
 * Endpoint: https://api.kimi.com/coding (Anthropic-compatible).
 * Serves the kimi-for-coding model only.
 *
 * ADR-053: Primary kimi backend. Composes AnthropicProvider because the
 * endpoint speaks Anthropic-compatible API.
 *
 * @module providers/kimi-coding
 * @since Sprint 145 — ADR-053
 */

import { AnthropicProvider } from "../anthropic/index.js";
import type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
} from "../types.js";

/** Default Kimi Coding API endpoint ( AnthropicProvider appends /v1/messages ). */
const DEFAULT_KIMI_CODING_URL = "https://api.kimi.com/coding";

/** Kimi-for-coding model definition. */
const KIMI_CODING_MODELS: ModelDefinition[] = [
  {
    id: "kimi-for-coding",
    name: "Kimi for Coding",
    contextWindow: 256000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
];

/**
 * KimiCodingProvider delegates to an internal AnthropicProvider instance
 * because the Kimi Coding API exposes an Anthropic-compatible interface.
 *
 * We use composition rather than inheritance because AnthropicProvider
 * declares its id/name/models as literal types that cannot be overridden.
 */
export class KimiCodingProvider implements AIProvider {
  readonly id = "kimi-coding";
  readonly name = "Kimi Coding (CEO subscription)";
  readonly models = KIMI_CODING_MODELS;

  private inner = new AnthropicProvider();
  private _baseUrl: string | undefined;

  async initialize(config: ProviderConfig): Promise<void> {
    this._baseUrl = config.baseUrl ?? DEFAULT_KIMI_CODING_URL;
    await this.inner.initialize({
      ...config,
      apiKey: config.apiKey ?? "",
      baseUrl: this._baseUrl,
      timeout: config.timeout ?? 60_000,
    });
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const codingModel = this.resolveCodingModel(request.model);
    return this.inner.chat({ ...request, model: codingModel });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const codingModel = this.resolveCodingModel(request.model);
    yield* this.inner.chatStream({ ...request, model: codingModel });
  }

  /**
   * Resolve any model name to one the endpoint accepts.
   * If the model is already a Kimi coding model, pass through.
   * If it's a Claude/OpenAI model (from agent config), map to default.
   */
  private resolveCodingModel(model: string): string {
    const codingModelIds = KIMI_CODING_MODELS.map((m) => m.id);
    if (codingModelIds.includes(model)) return model;
    // Non-coding model name (e.g. "sonnet", "gpt-4o") → use default
    return KIMI_CODING_MODELS[0]?.id ?? "kimi-for-coding";
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.inner.healthCheck();
  }
}

/**
 * Create a KimiCodingProvider from environment variables.
 *
 * Env:
 *   KIMI_API_KEY — CEO subscription API key (required)
 *   KIMI_API_BASE_URL — optional override (default https://api.kimi.com/coding/v1)
 */
export function createKimiCodingProviderFromEnv(): KimiCodingProvider {
  const provider = new KimiCodingProvider();
  return provider;
}
