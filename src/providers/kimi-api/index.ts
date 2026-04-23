/**
 * Kimi API Provider (Moonshot)
 *
 * Direct integration with Moonshot AI API (api.moonshot.cn).
 * Uses OpenAI-compatible API format via composition with OpenAIProvider.
 *
 * @module providers/kimi-api
 * @since Sprint 140 — Kimi API fallback tier
 */

import { OpenAIProvider } from "../openai/index.js";
import type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
} from "../types.js";

/** Default Moonshot API endpoint. */
const DEFAULT_MOONSHOT_URL = "https://api.moonshot.cn/v1";

/** Kimi model definitions via Moonshot API. */
const KIMI_API_MODELS: ModelDefinition[] = [
  {
    id: "kimi-k2-6",
    name: "Kimi K2.6",
    contextWindow: 256000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot V1 128K",
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "streaming"],
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot V1 32K",
    contextWindow: 32000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "streaming"],
  },
];

/**
 * KimiApiProvider delegates to an internal OpenAIProvider instance
 * because Moonshot exposes an OpenAI-compatible API.
 *
 * This is Fallback Tier 2 (after Kimi OAuth proxy, before OpenAI Codex).
 */
export class KimiApiProvider implements AIProvider {
  readonly id = "kimi-api";
  readonly name = "Kimi API (Moonshot)";
  readonly models = KIMI_API_MODELS;

  private inner = new OpenAIProvider({
    baseUrl: DEFAULT_MOONSHOT_URL,
    defaultModel: "kimi-k2-6",
    maxRequestsPerMinute: 60,
  });

  async initialize(config: ProviderConfig): Promise<void> {
    const initConfig: { apiKey: string; baseUrl: string } = {
      apiKey: config.apiKey ?? "",
      baseUrl: config.baseUrl ?? DEFAULT_MOONSHOT_URL,
    };
    await this.inner.initialize(initConfig);
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.inner.chat(request);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    yield* this.inner.chatStream(request);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.inner.healthCheck();
  }
}

/**
 * Create a KimiApiProvider from environment variables.
 *
 * Env:
 *   KIMI_API_KEY — Moonshot API key (required)
 *   KIMI_API_BASE_URL — optional override (default https://api.moonshot.cn/v1)
 */
export function createKimiApiProviderFromEnv(): KimiApiProvider {
  const provider = new KimiApiProvider();
  return provider;
}
