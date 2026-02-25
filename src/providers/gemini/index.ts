/**
 * Gemini Provider for Google AI Models
 *
 * Integrates with Google Gemini API for AI model inference.
 *
 * Per Sprint 38 Day 8 requirements:
 * - Support Gemini models (gemini-2.0-flash, gemini-1.5-pro, etc.)
 * - Streaming support
 * - Cost tracking per request
 * - Health monitoring
 *
 * @module providers/gemini
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Day 8
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
  Message,
  Tool,
} from "../types.js";
import { ProviderError } from "../types.js";
import { RateLimiter } from "../../gateway/auth.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Gemini model specification.
 */
export interface GeminiModel {
  /** Model ID (e.g., "gemini-2.0-flash") */
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
 * Gemini provider configuration.
 */
export interface GeminiProviderConfig {
  /** Google AI API key */
  apiKey?: string | undefined;
  /** Base URL (default: https://generativelanguage.googleapis.com/v1beta) */
  baseUrl?: string | undefined;
  /** Default model */
  defaultModel?: string | undefined;
  /** Request timeout in ms */
  timeoutMs?: number | undefined;
  /** Max requests per minute (default: 60) */
  maxRequestsPerMinute?: number | undefined;
}

/**
 * Gemini API content part.
 */
interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

/**
 * Gemini API content.
 */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

/**
 * Gemini API generate content response.
 */
interface GeminiGenerateResponse {
  candidates?: Array<{
    content: {
      role: string;
      parts: Array<{ text?: string }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Gemini API stream chunk.
 */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      role: string;
      parts: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Gemini API tool definition.
 */
interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default Gemini API base URL */
const DEFAULT_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta";

/** Default model */
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/** Default timeout in ms */
const DEFAULT_GEMINI_TIMEOUT_MS = 60000;

/**
 * Available Gemini models with specifications.
 *
 * Reference: https://ai.google.dev/pricing
 * Note: Pricing as of Feb 2026, subject to change.
 */
export const GEMINI_MODELS: GeminiModel[] = [
  {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    purpose: "Latest fast model with 1M context",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash Lite",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.0375,
    outputCostPer1M: 0.15,
    purpose: "Cost-effective for high-volume tasks",
    features: ["chat", "streaming"],
  },
  {
    id: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    purpose: "Most capable model with 2M context",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gemini-1.5-flash",
    displayName: "Gemini 1.5 Flash",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    purpose: "Previous fast model",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gemini-1.5-flash-8b",
    displayName: "Gemini 1.5 Flash 8B",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.0375,
    outputCostPer1M: 0.15,
    purpose: "Lightweight for simple tasks",
    features: ["chat", "streaming"],
  },
  {
    id: "gemini-2.0-flash-thinking",
    displayName: "Gemini 2.0 Flash Thinking",
    contextWindow: 32768,
    maxOutputTokens: 8192,
    inputCostPer1M: 0.0, // Experimental, may be free or change
    outputCostPer1M: 0.0,
    purpose: "Reasoning model with thinking process",
    features: ["chat", "reasoning", "streaming"],
  },
];

/**
 * Task type to model mapping.
 */
export const GEMINI_TASK_ROUTING: Record<string, string> = {
  code_generation: "gemini-2.0-flash",
  bug_fix: "gemini-2.0-flash",
  code_review: "gemini-1.5-pro",
  architecture: "gemini-1.5-pro",
  reasoning: "gemini-2.0-flash-thinking",
  research: "gemini-1.5-pro",
  analysis: "gemini-1.5-pro",
  fast: "gemini-2.0-flash-lite",
  drafts: "gemini-2.0-flash-lite",
  general: "gemini-2.0-flash",
  long_context: "gemini-1.5-pro",
};

// ============================================================================
// GeminiProvider
// ============================================================================

/**
 * GeminiProvider - Google Gemini model provider.
 *
 * Features:
 * - Gemini 2.0, 1.5 model support
 * - 1M-2M context window support
 * - Streaming support
 * - Cost tracking
 * - Health monitoring
 */
/** Default rate limit for Gemini API (60 req/min for most tiers) */
const DEFAULT_RATE_LIMIT = 60;

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";
  readonly models: ModelDefinition[];

  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter: RateLimiter;

  constructor(config: GeminiProviderConfig = {}) {
    super();

    this.baseUrl = config.baseUrl ?? DEFAULT_GEMINI_URL;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? DEFAULT_GEMINI_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    this.maxRetries = 2;
    this.retryDelayMs = 1000;

    // Rate limiter: configurable req/min (default 60)
    const maxRequests = config.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(60_000, maxRequests);

    // Convert GeminiModel to ModelDefinition
    this.models = GEMINI_MODELS.map((m) => ({
      id: m.id,
      name: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      supportedFeatures: m.features.filter(
        (f): f is "chat" | "vision" | "tools" | "streaming" =>
          ["chat", "vision", "tools", "streaming"].includes(f)
      ),
    }));

    this.log.info("GeminiProvider created", {
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
      this.log.warn("Gemini API key not configured");
    } else if (_config.apiKey) {
      this.apiKey = _config.apiKey;
    }

    // Check API connectivity
    const health = await this.doHealthCheck();
    if (health.status === "unhealthy") {
      this.log.warn("Gemini API not available during initialization", {
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

    const body = this.buildRequestBody(request);

    const response = await this.fetchWithRetry<GeminiGenerateResponse>(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
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

    const body = this.buildRequestBody(request);

    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      }
    );

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new ProviderError(
        `Gemini API error: ${response.status} - ${errorData.message}`,
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
    let chunkIndex = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim() || line.startsWith(":")) continue;

        const dataMatch = line.match(/^data: (.+)$/);
        if (!dataMatch || !dataMatch[1]) continue;

        try {
          const jsonData = dataMatch[1];
          const chunk: GeminiStreamChunk = JSON.parse(jsonData);

          const candidate = chunk.candidates?.[0];
          if (!candidate?.content?.parts) continue;

          const text = candidate.content.parts
            .map((p) => p.text ?? "")
            .join("");

          if (!text && !candidate.finishReason) continue;

          const chatChunk: ChatChunk = {
            id: `gemini-stream-${chunkIndex++}`,
            model,
            delta: text,
          };

          if (candidate.finishReason) {
            chatChunk.finishReason = this.mapFinishReason(candidate.finishReason);
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
      // Use models list endpoint for health check
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        {
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(5000),
        }
      );

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          status: "healthy",
          latencyMs,
        };
      } else if (response.status === 401 || response.status === 403) {
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
   * Get available models from Gemini API.
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        {
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        this.log.warn("Failed to fetch Gemini models", {
          status: response.status,
        });
        return GEMINI_MODELS.map((m) => m.id);
      }

      const data = (await response.json()) as {
        models?: Array<{ name: string; displayName: string }>;
      };

      // Filter to gemini models and extract IDs
      const geminiModels =
        data.models
          ?.filter((m) => m.name.includes("gemini"))
          .map((m) => m.name.replace("models/", "")) ?? [];

      return geminiModels.length > 0 ? geminiModels : GEMINI_MODELS.map((m) => m.id);
    } catch (error) {
      this.log.warn("Error fetching Gemini models", {
        error: (error as Error).message,
      });
      return GEMINI_MODELS.map((m) => m.id);
    }
  }

  /**
   * Check Gemini API health (public wrapper).
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
    return GEMINI_TASK_ROUTING[taskType] ?? this.defaultModel;
  }

  /**
   * Get model specification.
   */
  getModelSpec(modelId: string): GeminiModel | undefined {
    return GEMINI_MODELS.find((m) => m.id === modelId);
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
    return {
      "Content-Type": "application/json",
    };
  }

  /**
   * Build request body for Gemini API.
   */
  private buildRequestBody(request: ChatRequest): Record<string, unknown> {
    const contents = this.convertMessages(request.messages);

    const body: Record<string, unknown> = {
      contents,
    };

    // Generation config
    const generationConfig: Record<string, unknown> = {};

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    // System instruction (handled separately in Gemini)
    const systemMessage = request.messages.find((m) => m.role === "system");
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: typeof systemMessage.content === "string" ? systemMessage.content : "" }],
      };
    }

    return body;
  }

  /**
   * Convert messages to Gemini format.
   */
  private convertMessages(messages: Message[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const message of messages) {
      // Skip system messages (handled separately)
      if (message.role === "system") continue;

      const role: "user" | "model" = message.role === "assistant" ? "model" : "user";

      if (typeof message.content === "string") {
        contents.push({
          role,
          parts: [{ text: message.content }],
        });
      } else {
        // Handle multimodal content
        const parts: GeminiContentPart[] = message.content.map((part) => {
          if (part.type === "text") {
            return { text: part.text };
          } else if (part.type === "image") {
            // Extract base64 from data URL or use URL directly
            const imageData = this.parseImageUrl(part.imageUrl);
            return {
              inline_data: {
                mime_type: imageData.mimeType,
                data: imageData.data,
              },
            };
          }
          return { text: "" };
        });

        contents.push({ role, parts });
      }
    }

    return contents;
  }

  /**
   * Parse image URL to extract mime type and data.
   */
  private parseImageUrl(url: string): { mimeType: string; data: string } {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        return {
          mimeType: match[1],
          data: match[2],
        };
      }
    }

    // Default for unknown format
    return {
      mimeType: "image/jpeg",
      data: url,
    };
  }

  /**
   * Convert tools to Gemini format.
   */
  private convertTools(tools: Tool[]): GeminiTool[] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.parameters,
            required: Object.entries(tool.parameters)
              .filter(([, param]) => param.required)
              .map(([name]) => name),
          },
        })),
      },
    ];
  }

  /**
   * Transform Gemini response to standard format.
   */
  private transformResponse(
    response: GeminiGenerateResponse,
    model: string
  ): ChatResponse {
    if (response.error) {
      throw new ProviderError(
        `Gemini API error: ${response.error.message}`,
        this.id,
        "SERVICE_ERROR",
        false
      );
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new ProviderError(
        "No response candidates",
        this.id,
        "SERVICE_ERROR",
        false
      );
    }

    const content = candidate.content.parts
      .map((p) => p.text ?? "")
      .join("");

    const usage: TokenUsage = {
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
    };

    return {
      id: `gemini-${Date.now()}`,
      model,
      content,
      usage,
      finishReason: this.mapFinishReason(candidate.finishReason),
    };
  }

  /**
   * Map Gemini finish reason to standard format.
   */
  private mapFinishReason(reason?: string): FinishReason {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
      case "RECITATION":
      case "OTHER":
        return "stop";
      default:
        return "stop";
    }
  }

  /**
   * Map HTTP status to error code.
   */
  private mapErrorCode(
    status: number,
    errorData: { code?: string; message?: string }
  ): "AUTH_ERROR" | "RATE_LIMIT" | "CONTEXT_LENGTH" | "TIMEOUT" | "NETWORK" | "INVALID_REQUEST" | "SERVICE_ERROR" | "UNKNOWN" {
    if (status === 401 || status === 403) {
      return "AUTH_ERROR";
    }
    if (status === 429) {
      return "RATE_LIMIT";
    }
    if (status === 400) {
      if (errorData.message?.includes("context")) {
        return "CONTEXT_LENGTH";
      }
      return "INVALID_REQUEST";
    }
    if (status >= 500) {
      return "SERVICE_ERROR";
    }
    return "UNKNOWN";
  }

  /**
   * Parse error response.
   */
  private async parseErrorResponse(
    response: Response
  ): Promise<{ code?: string; message: string }> {
    try {
      const data = (await response.json()) as {
        error?: { code?: number; message?: string; status?: string };
      };
      const result: { code?: string; message: string } = {
        message: data.error?.message ?? `HTTP ${response.status}`,
      };
      if (data.error?.status) {
        result.code = data.error.status;
      }
      return result;
    } catch {
      return {
        message: `HTTP ${response.status}`,
      };
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

          // Don't retry client errors (4xx) except 429
          if (response.status < 500 && response.status !== 429) {
            throw new ProviderError(
              `Gemini API error: ${response.status} - ${errorData.message}`,
              this.id,
              this.mapErrorCode(response.status, errorData),
              false
            );
          }

          // Retry on server errors and rate limits
          if (attempt < this.maxRetries) {
            await this.delay(this.retryDelayMs * (attempt + 1));
            continue;
          }

          throw new ProviderError(
            `Gemini API error: ${response.status} - ${errorData.message}`,
            this.id,
            this.mapErrorCode(response.status, errorData),
            response.status === 429 || response.status >= 500
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on ProviderError unless retryable
        if (error instanceof ProviderError) {
          if (!error.retryable) {
            throw error;
          }
        }

        // Retry on network errors
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelayMs * (attempt + 1));
          continue;
        }
      }
    }

    throw (
      lastError ??
      new ProviderError("Unknown error", this.id, "UNKNOWN", false)
    );
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Create a GeminiProvider instance.
 */
export function createGeminiProvider(
  config?: GeminiProviderConfig
): GeminiProvider {
  return new GeminiProvider(config);
}

/**
 * Create a GeminiProvider with API key from environment.
 */
export function createGeminiProviderFromEnv(): GeminiProvider {
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  return new GeminiProvider({ apiKey });
}
