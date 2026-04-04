/**
 * OpenAI Provider for GPT Models
 *
 * Integrates with OpenAI API for GPT model inference.
 *
 * Per Sprint 38 Day 7 requirements:
 * - Support OpenAI models (gpt-4o, gpt-4o-mini, etc.)
 * - Streaming support
 * - Cost tracking per request
 * - Health monitoring
 *
 * Note: CEO uses subscription-based access for chat.
 * This provider is for programmatic/automation use with service account API key.
 *
 * @module providers/openai
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Day 7
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

// ============================================================================
// Types
// ============================================================================

/**
 * OpenAI model specification.
 */
export interface OpenAIModel {
  /** Model ID (e.g., "gpt-4o") */
  id: string;
  /** Display name */
  displayName: string;
  /** Context window size */
  contextWindow: number;
  /** Max output tokens */
  maxOutputTokens: number;
  /** Input cost per 1M tokens (USD) */
  inputCostPer1M: number;
  /** Output cost per 1M tokens (USD) */
  outputCostPer1M: number;
  /** Purpose/specialty */
  purpose: string;
  /** Supported features */
  features: string[];
}

/**
 * OpenAI provider configuration.
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key */
  apiKey?: string | undefined;
  /** Base URL (default: https://api.openai.com/v1) */
  baseUrl?: string | undefined;
  /** Default model */
  defaultModel?: string | undefined;
  /** Organization ID (optional) */
  organizationId?: string | undefined;
  /** Request timeout in ms */
  timeoutMs?: number | undefined;
  /** Max requests per minute (default: 60) */
  maxRequestsPerMinute?: number | undefined;
}

/**
 * OpenAI API chat completion response.
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI streaming chunk.
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
    };
    finish_reason: string | null;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default OpenAI base URL */
export const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";

/** Default request timeout (30s) */
export const DEFAULT_OPENAI_TIMEOUT_MS = 30000;

/** Default model */
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

/**
 * Available OpenAI models with their specifications.
 * Pricing as of Feb 2026 (may change).
 */
export const OPENAI_MODELS: OpenAIModel[] = [
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    purpose: "Most capable model, vision support",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    purpose: "Fast, cost-effective for most tasks",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
    purpose: "Previous flagship model",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gpt-4",
    displayName: "GPT-4",
    contextWindow: 8192,
    maxOutputTokens: 8192,
    inputCostPer1M: 30.0,
    outputCostPer1M: 60.0,
    purpose: "Original GPT-4",
    features: ["chat", "tools", "streaming"],
  },
  {
    id: "gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo",
    contextWindow: 16385,
    maxOutputTokens: 4096,
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
    purpose: "Legacy fast model",
    features: ["chat", "tools", "streaming"],
  },
  {
    id: "o1",
    displayName: "O1",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 15.0,
    outputCostPer1M: 60.0,
    purpose: "Advanced reasoning model",
    features: ["chat", "reasoning"],
  },
  {
    id: "o1-mini",
    displayName: "O1 Mini",
    contextWindow: 128000,
    maxOutputTokens: 65536,
    inputCostPer1M: 3.0,
    outputCostPer1M: 12.0,
    purpose: "Fast reasoning model",
    features: ["chat", "reasoning"],
  },
  {
    id: "o3-mini",
    displayName: "O3 Mini",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    purpose: "Latest fast reasoning model",
    features: ["chat", "reasoning", "streaming"],
  },
];

/**
 * Task type to model mapping.
 */
export const OPENAI_TASK_ROUTING: Record<string, string> = {
  code_generation: "gpt-4o",
  bug_fix: "gpt-4o",
  code_review: "gpt-4o",
  architecture: "o1",
  reasoning: "o1",
  research: "gpt-4o",
  analysis: "gpt-4o",
  fast: "gpt-4o-mini",
  drafts: "gpt-4o-mini",
  general: "gpt-4o-mini",
};

// ============================================================================
// OpenAIProvider
// ============================================================================

/**
 * OpenAIProvider - OpenAI GPT model provider.
 *
 * Features:
 * - GPT-4o, GPT-4o-mini, O1 model support
 * - Streaming support
 * - Cost tracking
 * - Health monitoring
 */
/** Default rate limit for OpenAI API (60 req/min for most tiers) */
const DEFAULT_RATE_LIMIT = 60;

export class OpenAIProvider extends BaseProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  readonly models: ModelDefinition[];

  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string;
  private organizationId: string | undefined;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter: RateLimiter;

  constructor(config: OpenAIProviderConfig = {}) {
    super();

    this.baseUrl = config.baseUrl ?? DEFAULT_OPENAI_URL;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? DEFAULT_OPENAI_MODEL;
    this.organizationId = config.organizationId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
    this.maxRetries = 2;
    this.retryDelayMs = 1000;

    // Rate limiter: configurable req/min (default 60)
    const maxRequests = config.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(60_000, maxRequests);

    // Convert OpenAIModel to ModelDefinition
    this.models = OPENAI_MODELS.map((m) => ({
      id: m.id,
      name: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      supportedFeatures: m.features.filter(
        (f): f is "chat" | "vision" | "tools" | "streaming" =>
          ["chat", "vision", "tools", "streaming"].includes(f)
      ),
    }));

    this.log.info("OpenAIProvider created", {
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel,
      hasApiKey: !!this.apiKey,
    });
  }

  // ==========================================================================
  // BaseProvider Implementation
  // ==========================================================================

  protected async doInitialize(_config: ProviderConfig): Promise<void> {
    // Verify API key is configured
    if (!this.apiKey && !_config.apiKey) {
      this.log.warn("OpenAI API key not configured");
    } else if (_config.apiKey) {
      this.apiKey = _config.apiKey;
    }

    // Check API connectivity
    const health = await this.doHealthCheck();
    if (health.status === "unhealthy") {
      this.log.warn("OpenAI API not available during initialization", {
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

    const body = this.buildRequestBody(request, model, false);

    const response = await this.fetchWithRetry<OpenAIChatResponse>(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      }
    );

    return this.transformResponse(response);
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.checkRateLimit();
    const model = request.model || this.defaultModel;

    const body = this.buildRequestBody(request, model, true);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new ProviderError(
        `OpenAI API error: ${response.status} - ${errorData.message}`,
        this.id,
        this.mapErrorCode(response.status, errorData),
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
        if (!line.trim() || line.startsWith(":")) continue;
        if (line === "data: [DONE]") continue;

        const dataMatch = line.match(/^data: (.+)$/);
        if (!dataMatch || !dataMatch[1]) continue;

        try {
          const jsonData = dataMatch[1];
          const chunk: OpenAIStreamChunk = JSON.parse(jsonData);
          const choice = chunk.choices[0];
          if (!choice) continue;

          const content = choice.delta.content ?? "";
          if (!content && !choice.finish_reason) continue;

          const chatChunk: ChatChunk = {
            id: chunk.id,
            model: chunk.model,
            delta: content,
          };

          if (choice.finish_reason) {
            chatChunk.finishReason = this.mapFinishReason(choice.finish_reason);
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
      // Use models endpoint for health check
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          status: "healthy",
          latencyMs,
        };
      } else if (response.status === 401) {
        return {
          status: "unhealthy",
          latencyMs,
          message: "Invalid API key",
        };
      } else {
        return {
          status: "degraded",
          latencyMs,
          message: `API returned ${response.status}`,
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
   * Get available models from OpenAI.
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.log.warn("Failed to fetch OpenAI models", {
          status: response.status,
        });
        return OPENAI_MODELS.map((m) => m.id);
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      // Filter to only GPT models
      const gptModels = data.data?.filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o1") || m.id.startsWith("o3")) ?? [];
      return gptModels.map((m) => m.id);
    } catch (error) {
      this.log.warn("Error fetching OpenAI models", {
        error: (error as Error).message,
      });
      return OPENAI_MODELS.map((m) => m.id);
    }
  }

  /**
   * Check OpenAI API health (public wrapper).
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
    return OPENAI_TASK_ROUTING[taskType] ?? this.defaultModel;
  }

  /**
   * Get model specification.
   */
  getModelSpec(modelId: string): OpenAIModel | undefined {
    return OPENAI_MODELS.find((m) => m.id === modelId);
  }

  /**
   * Calculate cost for a request.
   */
  calculateCost(modelId: string, promptTokens: number, completionTokens: number): number {
    const model = this.getModelSpec(modelId);
    if (!model) return 0;

    const inputCost = (promptTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (completionTokens / 1_000_000) * model.outputCostPer1M;
    return inputCost + outputCost;
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

    if (this.organizationId) {
      headers["OpenAI-Organization"] = this.organizationId;
    }

    return headers;
  }

  /**
   * Build request body.
   */
  private buildRequestBody(
    request: ChatRequest,
    model: string,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        // ADR-040: Flatten SystemBlock[] to string for OpenAI (no cache_control support)
        content: typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content) && m.content.length > 0 && typeof m.content[0] === "object" && m.content[0] !== null && "text" in m.content[0]
            ? (m.content as Array<{ text: string }>).map((b) => b.text).join("\n")
            : m.content,
      })),
      stream,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      // GPT-5+ and o-series models require max_completion_tokens instead of max_tokens
      const model = request.model ?? this.defaultModel;
      if (model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) {
        body.max_completion_tokens = request.maxTokens;
      } else {
        body.max_tokens = request.maxTokens;
      }
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: "object",
            properties: t.parameters,
            required: Object.entries(t.parameters)
              .filter(([_, v]) => v.required)
              .map(([k]) => k),
          },
        },
      }));
    }

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    return body;
  }

  /**
   * Transform OpenAI response to standard format.
   */
  private transformResponse(response: OpenAIChatResponse): ChatResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError("No choices in response", this.id, "SERVICE_ERROR", false);
    }

    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    const result: ChatResponse = {
      id: response.id,
      model: response.model,
      content: choice.message.content ?? "",
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage,
    };

    // Handle tool calls
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    return result;
  }

  /**
   * Map OpenAI finish reason to standard format.
   */
  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
        return "tool_calls";
      case "content_filter":
        return "error";
      default:
        return "stop";
    }
  }

  /**
   * Map HTTP status to error code.
   */
  private mapErrorCode(
    status: number,
    errorData: { type?: string }
  ): import("../types.js").ProviderErrorCode {
    if (status === 401) return "AUTH_ERROR";
    if (status === 429) return "RATE_LIMIT";
    if (status === 400 && errorData.type === "invalid_request_error") {
      return "INVALID_REQUEST";
    }
    if (status === 400 && errorData.type === "context_length_exceeded") {
      return "CONTEXT_LENGTH";
    }
    if (status >= 500) return "SERVICE_ERROR";
    return "UNKNOWN";
  }

  /**
   * Parse error response.
   */
  private async parseErrorResponse(
    response: Response
  ): Promise<{ message: string; type?: string }> {
    try {
      const data = (await response.json()) as {
        error?: { message?: string; type?: string };
      };
      const result: { message: string; type?: string } = {
        message: data.error?.message ?? `HTTP ${response.status}`,
      };
      if (data.error?.type) {
        result.type = data.error.type;
      }
      return result;
    } catch {
      return { message: `HTTP ${response.status}` };
    }
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
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);
          const error = new ProviderError(
            `OpenAI API error: ${response.status} - ${errorData.message}`,
            this.id,
            this.mapErrorCode(response.status, errorData),
            response.status === 429 || response.status >= 500
          );

          // Don't retry auth errors
          if (response.status === 401) {
            throw error;
          }

          throw error;
        }

        const data = (await response.json()) as T;
        return data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-retryable errors
        if (error instanceof ProviderError && !error.retryable) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
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
 * Create OpenAIProvider instance.
 */
export function createOpenAIProvider(
  config?: OpenAIProviderConfig
): OpenAIProvider {
  return new OpenAIProvider(config);
}

/**
 * Create OpenAIProvider from environment variables.
 */
export function createOpenAIProviderFromEnv(): OpenAIProvider {
  return createOpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_URL,
    defaultModel: process.env.OPENAI_DEFAULT_MODEL ?? DEFAULT_OPENAI_MODEL,
    organizationId: process.env.OPENAI_ORGANIZATION_ID,
    timeoutMs: parseInt(
      process.env.OPENAI_TIMEOUT_MS ?? String(DEFAULT_OPENAI_TIMEOUT_MS),
      10
    ),
  });
}
