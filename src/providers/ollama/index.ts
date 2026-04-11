/**
 * Ollama Provider for Local AI Models
 *
 * Integrates with Ollama for local model inference.
 *
 * Per Sprint 38 Day 5 requirements:
 * - Support local Ollama models (qwen3, devstral, deepseek, etc.)
 * - Model routing by task type
 * - Health monitoring
 * - Cost-free local inference
 *
 * @module providers/ollama
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Day 5
 * @authority ADR-008 Multi-Provider Architecture
 * @stage 04 - BUILD
 */

import { BaseProvider } from "../base-provider.js";
import type {
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
  TokenUsage,
  FinishReason,
} from "../types.js";
import { ProviderError } from "../types.js";
import { RateLimiter } from "../../security/rate-limiter.js";
import { safeFetch } from "../../security/safe-fetch.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Ollama model specification.
 */
export interface OllamaModel {
  /** Model name (e.g., "qwen3-coder:30b") */
  name: string;
  /** Display name */
  displayName: string;
  /** Model size in GB */
  sizeGb: number;
  /** Purpose/specialty */
  purpose: string;
  /** Context window size */
  contextSize: number;
  /** Task types this model excels at */
  specialties: string[];
}

/**
 * Ollama provider configuration.
 */
export interface OllamaProviderConfig {
  /** Ollama server URL (default: http://localhost:11434) */
  baseUrl?: string | undefined;
  /** API key (for remote Ollama servers) */
  apiKey?: string | undefined;
  /** Default model to use */
  defaultModel?: string | undefined;
  /** Request timeout in ms */
  timeoutMs?: number | undefined;
  /** Max requests per minute (default: 30 - local server) */
  maxRequestsPerMinute?: number | undefined;
}

/**
 * Ollama API response format.
 */
interface OllamaApiResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama streaming response chunk.
 */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Ollama base URL */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Default request timeout (60s for local models) */
export const DEFAULT_OLLAMA_TIMEOUT_MS = 60000;

/** Default model for code generation */
export const DEFAULT_CODE_MODEL = "qwen3-coder:30b";

/** Default model for general chat */
export const DEFAULT_CHAT_MODEL = "qwen3:32b";

/** Default model for fast responses */
export const DEFAULT_FAST_MODEL = "qwen3:8b";

/** Default model for routing (lightweight, fast, local) */
export const DEFAULT_ROUTER_MODEL = "qwen3.5:9b";

/** Default model when Ollama is used as fallback (lighter weight) */
export const DEFAULT_FALLBACK_MODEL = "qwen3.5:9b";

/**
 * Available Ollama models with their specifications.
 */
export const OLLAMA_MODELS: OllamaModel[] = [
  {
    name: "qwen3-coder:30b",
    displayName: "Qwen3 Coder 30B",
    sizeGb: 17.3,
    purpose: "PRIMARY code generation",
    contextSize: 256000,
    specialties: ["code_generation", "bug_fix", "code_review"],
  },
  {
    name: "qwen3:32b",
    displayName: "Qwen3 32B",
    sizeGb: 18.8,
    purpose: "General chat, Vietnamese excellent",
    contextSize: 131072,
    specialties: ["general", "vietnamese", "architecture"],
  },
  {
    name: "qwen3:14b",
    displayName: "Qwen3 14B",
    sizeGb: 8.6,
    purpose: "Vietnamese, fast",
    contextSize: 131072,
    specialties: ["vietnamese", "general"],
  },
  {
    name: "qwen3:8b",
    displayName: "Qwen3 8B",
    sizeGb: 4.9,
    purpose: "Ultra fast drafts",
    contextSize: 131072,
    specialties: ["drafts", "fast"],
  },
  {
    name: "gpt-oss:20b",
    displayName: "GPT-OSS 20B",
    sizeGb: 12.8,
    purpose: "Complex reasoning",
    contextSize: 65536,
    specialties: ["reasoning", "analysis"],
  },
  {
    name: "devstral:24b",
    displayName: "Devstral 24B",
    sizeGb: 13.3,
    purpose: "Code generation",
    contextSize: 131072,
    specialties: ["code_generation", "bug_fix"],
  },
  {
    name: "deepseek-r1:32b-qwen-distill-q4_K_M",
    displayName: "DeepSeek R1 32B",
    sizeGb: 18.5,
    purpose: "Deep reasoning",
    contextSize: 131072,
    specialties: ["reasoning", "analysis", "architecture"],
  },
  {
    name: "mistral-small3.2:24b",
    displayName: "Mistral Small 3.2",
    sizeGb: 14.1,
    purpose: "Fast multilingual",
    contextSize: 131072,
    specialties: ["multilingual", "fast"],
  },
  {
    name: "gemma3:12b",
    displayName: "Gemma3 12B",
    sizeGb: 7.6,
    purpose: "Research & analysis",
    contextSize: 65536,
    specialties: ["research", "analysis"],
  },
  {
    name: "ministral-3:8b",
    displayName: "Ministral 3 8B",
    sizeGb: 5.6,
    purpose: "Structured output",
    contextSize: 65536,
    specialties: ["structured", "fast"],
  },
  {
    name: "qwen3.5:9b",
    displayName: "Qwen3.5 9B",
    sizeGb: 6.6,
    purpose: "Router agent, fast local inference",
    contextSize: 131072,
    specialties: ["routing", "fast", "vietnamese", "general"],
  },
];

/**
 * Embedding models.
 */
export const OLLAMA_EMBEDDING_MODELS: OllamaModel[] = [
  {
    name: "bge-m3",
    displayName: "BGE M3",
    sizeGb: 1.1,
    purpose: "RAG embeddings",
    contextSize: 8192,
    specialties: ["embeddings", "rag"],
  },
  {
    name: "qwen3-embedding:4b",
    displayName: "Qwen3 Embedding 4B",
    sizeGb: 2.3,
    purpose: "Embeddings",
    contextSize: 8192,
    specialties: ["embeddings"],
  },
];

/**
 * Special purpose models.
 */
export const OLLAMA_SPECIAL_MODELS: OllamaModel[] = [
  {
    name: "deepseek-ocr:3b",
    displayName: "DeepSeek OCR 3B",
    sizeGb: 6.2,
    purpose: "OCR",
    contextSize: 8192,
    specialties: ["ocr", "vision"],
  },
  {
    name: "translategemma:12b",
    displayName: "Translate Gemma 12B",
    sizeGb: 7.6,
    purpose: "Translation",
    contextSize: 32768,
    specialties: ["translation"],
  },
];

// ============================================================================
// OllamaProvider
// ============================================================================

/**
 * OllamaProvider - Local AI model provider.
 *
 * Features:
 * - Local model inference (no API costs)
 * - Model routing by task type
 * - Streaming support
 * - Health monitoring
 */
/** Default rate limit for local Ollama (200 req/min - high throughput for local server) */
const DEFAULT_RATE_LIMIT = 200;

export class OllamaProvider extends BaseProvider {
  readonly id = "ollama";
  readonly name = "Ollama";
  readonly models: ModelDefinition[];

  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter: RateLimiter;

  constructor(config: OllamaProviderConfig = {}) {
    super();

    this.baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_URL;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? DEFAULT_CODE_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS;
    this.maxRetries = 2;
    this.retryDelayMs = 1000;

    // Rate limiter: configurable req/min (default 200 for local server - no external limit)
    const maxRequests = config.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(60_000, maxRequests);

    // Convert OllamaModel to ModelDefinition
    this.models = OLLAMA_MODELS.map((m) => ({
      id: m.name,
      name: m.displayName,
      contextWindow: m.contextSize,
      maxOutputTokens: Math.min(m.contextSize / 4, 32768),
      supportedFeatures: ["chat", "streaming"] as const,
    }));

    this.log.info("OllamaProvider created", {
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel,
    });
  }

  // ==========================================================================
  // BaseProvider Implementation
  // ==========================================================================

  protected async doInitialize(_config: ProviderConfig): Promise<void> {
    // Check server connectivity
    const health = await this.doHealthCheck();
    if (health.status === "unhealthy") {
      this.log.warn("Ollama server not available during initialization", {
        message: health.message,
      });
    }
  }

  protected async doDispose(): Promise<void> {
    this.rateLimiter.clear();
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    this.checkRateLimit();
    const model = request.model || this.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 4096,
      },
    };

    // Disable thinking mode for faster responses (e.g., router tasks)
    // Pass think: false via request metadata or extra options
    if (request.metadata?.think === false) {
      body.think = false;
    }

    const response = await this.fetchWithRetry<OllamaApiResponse>(
      `${this.baseUrl}/api/chat`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      }
    );

    return this.transformResponse(response, model);
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.checkRateLimit();
    const model = request.model || this.defaultModel;

    const body = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 4096,
      },
    };

    const response = await safeFetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    }, { provider: this.id });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `Ollama API error: ${response.status} - ${errorText}`,
        this.id,
        response.status === 429 ? "RATE_LIMIT" : "SERVICE_ERROR",
        response.status === 429 || response.status >= 500
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError("No response body", this.id, "SERVICE_ERROR", false);
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk: OllamaStreamChunk = JSON.parse(line);
          const chatChunk: ChatChunk = {
            id: `ollama-${Date.now()}`,
            model,
            delta: chunk.message.content,
          };
          if (chunk.done) {
            chatChunk.finishReason = "stop";
          }
          yield chatChunk;
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  protected async doHealthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      const response = await safeFetch(`${this.baseUrl}/api/tags`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      }, { provider: this.id });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          status: "healthy",
          latencyMs,
        };
      } else {
        return {
          status: "unhealthy",
          latencyMs,
          message: `Server returned ${response.status}`,
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  // ==========================================================================
  // Public Methods (Additional)
  // ==========================================================================

  /**
   * Get available models from Ollama.
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await safeFetch(`${this.baseUrl}/api/tags`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      }, { provider: this.id });

      if (!response.ok) {
        this.log.warn("Failed to fetch Ollama models", {
          status: response.status,
        });
        return OLLAMA_MODELS.map((m) => m.name);
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      return data.models?.map((m) => m.name) ?? [];
    } catch (error) {
      this.log.warn("Error fetching Ollama models", {
        error: (error as Error).message,
      });
      return OLLAMA_MODELS.map((m) => m.name);
    }
  }

  /**
   * Check Ollama server health (public wrapper).
   */
  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const health = await this.doHealthCheck();
    const result: { healthy: boolean; latencyMs: number; error?: string } = {
      healthy: health.status === "healthy",
      latencyMs: health.latencyMs ?? 0,
    };
    if (health.message) {
      result.error = health.message;
    }
    return result;
  }

  /**
   * Select best model for task type.
   */
  selectModelForTask(taskType: string): string {
    switch (taskType) {
      case "code_generation":
      case "bug_fix":
        return "qwen3-coder:30b";
      case "code_review":
        return "devstral:24b";
      case "architecture":
      case "reasoning":
        return "deepseek-r1:32b-qwen-distill-q4_K_M";
      case "research":
      case "analysis":
        return "gemma3:12b";
      case "vietnamese":
        return "qwen3:14b";
      case "fast":
      case "drafts":
        return "qwen3:8b";
      case "routing":
      case "router":
        return DEFAULT_ROUTER_MODEL;
      case "translation":
        return "translategemma:12b";
      case "ocr":
        return "deepseek-ocr:3b";
      default:
        return this.defaultModel;
    }
  }

  /**
   * Get model specification.
   */
  getModelSpec(modelName: string): OllamaModel | undefined {
    const allModels = [
      ...OLLAMA_MODELS,
      ...OLLAMA_EMBEDDING_MODELS,
      ...OLLAMA_SPECIAL_MODELS,
    ];
    return allModels.find((m) => m.name === modelName);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build request headers.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Transform Ollama response to standard format.
   */
  private transformResponse(
    response: OllamaApiResponse,
    model: string
  ): ChatResponse {
    const usage: TokenUsage = {
      promptTokens: response.prompt_eval_count ?? 0,
      completionTokens: response.eval_count ?? 0,
      totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
    };

    const finishReason: FinishReason = response.done_reason === "stop" ? "stop" : "length";

    return {
      id: `ollama-${Date.now()}`,
      model,
      content: response.message.content,
      finishReason,
      usage,
    };
  }

  /**
   * Fetch with retry logic.
   */
  private async fetchWithRetry<T>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await safeFetch(url, {
          ...options,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ProviderError(
            `Ollama API error: ${response.status} - ${errorText}`,
            this.id,
            response.status === 429 ? "RATE_LIMIT" : "SERVICE_ERROR",
            response.status === 429 || response.status >= 500
          );
        }

        const data = (await response.json()) as T;
        return data;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelayMs * (attempt + 1))
          );
        }
      }
    }

    throw lastError ?? new Error("Unknown error");
  }

  /**
   * Check rate limit and throw if exceeded.
   */
  private checkRateLimit(): void {
    const result = this.rateLimiter.check(this.id);
    if (!result.allowed) {
      throw new ProviderError(
        `Rate limit exceeded. Reset in ${Math.ceil(result.resetIn / 1000)}s`,
        this.id,
        "RATE_LIMIT",
        true
      );
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create OllamaProvider instance.
 */
export function createOllamaProvider(
  config?: OllamaProviderConfig
): OllamaProvider {
  return new OllamaProvider(config);
}

/**
 * Create OllamaProvider from environment variables.
 */
export function createOllamaProviderFromEnv(): OllamaProvider {
  return createOllamaProvider({
    baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL,
    apiKey: process.env.OLLAMA_API_KEY,
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL ?? DEFAULT_FALLBACK_MODEL,
    timeoutMs: parseInt(
      process.env.OLLAMA_TIMEOUT_MS ?? String(DEFAULT_OLLAMA_TIMEOUT_MS),
      10
    ),
  });
}
