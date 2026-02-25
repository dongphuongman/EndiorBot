/**
 * GitHub Models Provider
 *
 * Integrates with GitHub Models API (Azure-hosted inference).
 * Uses OpenAI-compatible API format with custom base URL.
 *
 * Per Sprint 46 Days 2-3 requirements:
 * - Support GitHub Models (gpt-4o, llama, phi, mistral)
 * - Rate limiting: 15 req/min (circuit breaker)
 * - PAT storage via keytar
 * - Streaming support
 *
 * @module providers/github
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Day 2
 * @authority ADR-008 Multi-Provider Architecture
 * @stage 04 - BUILD
 */

import keytar from "keytar";

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
import { RateLimiter } from "../../gateway/auth.js";

import {
  GITHUB_MODELS,
  GITHUB_MODELS_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MODEL,
  DEFAULT_RATE_LIMIT,
  KEYTAR_SERVICE,
  KEYTAR_ACCOUNT,
  GITHUB_TASK_ROUTING,
  getApiModelName,
  getGitHubModel,
  type GitHubModel,
  type GitHubModelsConfig,
} from "./config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * OpenAI-compatible chat completion response.
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
 * OpenAI-compatible streaming chunk.
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
// GitHubModelsProvider
// ============================================================================

/**
 * GitHub Models Provider - Azure-hosted model inference.
 *
 * Features:
 * - OpenAI-compatible API (gpt-4o, gpt-4o-mini)
 * - Meta Llama models (llama-3.3-70b)
 * - Microsoft Phi models (phi-4)
 * - Mistral models (mistral-large)
 * - Rate limiting (15 req/min circuit breaker)
 * - PAT storage via keytar
 */
export class GitHubModelsProvider extends BaseProvider {
  readonly id = "github-models";
  readonly name = "GitHub Models";
  readonly models: ModelDefinition[];

  private pat: string | undefined;
  private defaultModel: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private rateLimiter: RateLimiter;

  constructor(config: GitHubModelsConfig = {}) {
    super();

    this.pat = config.pat;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = 2;
    this.retryDelayMs = 1000;

    // Rate limiter: 15 req/min (60000ms window)
    const maxRequests = config.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(60_000, maxRequests);

    // Convert GitHubModel to ModelDefinition
    this.models = GITHUB_MODELS.map((m) => ({
      id: m.id,
      name: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      supportedFeatures: m.features.filter(
        (f): f is "chat" | "vision" | "tools" | "streaming" =>
          ["chat", "vision", "tools", "streaming"].includes(f)
      ),
    }));

    this.log.info("GitHubModelsProvider created", {
      defaultModel: this.defaultModel,
      hasPat: !!this.pat,
      rateLimit: maxRequests,
    });
  }

  // ==========================================================================
  // BaseProvider Implementation
  // ==========================================================================

  protected async doInitialize(_config: ProviderConfig): Promise<void> {
    // Try to load PAT from keytar if not provided
    if (!this.pat && !_config.apiKey) {
      this.pat = await this.loadPatFromKeytar();
    } else if (_config.apiKey) {
      this.pat = _config.apiKey;
    }

    if (!this.pat) {
      this.log.warn("GitHub Models PAT not configured");
    }

    // Check API connectivity
    const health = await this.doHealthCheck();
    if (health.status === "unhealthy") {
      this.log.warn("GitHub Models API not available during initialization", {
        message: health.message,
      });
    }
  }

  protected async doDispose(): Promise<void> {
    // Clear rate limiter
    this.rateLimiter.clear();
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model || this.defaultModel;

    // Check rate limit
    this.checkRateLimit();

    // Get API model name
    const apiModel = getApiModelName(model);
    if (!apiModel) {
      throw new ProviderError(
        `Unknown model: ${model}`,
        this.id,
        "INVALID_REQUEST",
        false
      );
    }

    const body = this.buildRequestBody(request, apiModel, false);

    const response = await this.fetchWithRetry<OpenAIChatResponse>(
      `${GITHUB_MODELS_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      }
    );

    return this.transformResponse(response);
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const model = request.model || this.defaultModel;

    // Check rate limit
    this.checkRateLimit();

    // Get API model name
    const apiModel = getApiModelName(model);
    if (!apiModel) {
      throw new ProviderError(
        `Unknown model: ${model}`,
        this.id,
        "INVALID_REQUEST",
        false
      );
    }

    const body = this.buildRequestBody(request, apiModel, true);

    const response = await fetch(`${GITHUB_MODELS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new ProviderError(
        `GitHub Models API error: ${response.status} - ${errorData.message}`,
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
      const response = await fetch(`${GITHUB_MODELS_BASE_URL}/models`, {
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
          message: "Invalid PAT",
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
   * Get available models from GitHub Models.
   */
  async getModels(): Promise<string[]> {
    return GITHUB_MODELS.map((m) => m.id);
  }

  /**
   * Check GitHub Models API health (public wrapper).
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
    return GITHUB_TASK_ROUTING[taskType] ?? this.defaultModel;
  }

  /**
   * Get model specification.
   */
  getModelSpec(modelId: string): GitHubModel | undefined {
    return getGitHubModel(modelId);
  }

  /**
   * Get rate limit status (no side effects).
   * Sprint 46 tech debt fix: uses peek() instead of check().
   */
  getRateLimitStatus(): { remaining: number; resetIn: number } {
    const result = this.rateLimiter.peek(this.id);
    return { remaining: result.remaining, resetIn: result.resetIn };
  }

  /**
   * Store PAT in keytar.
   */
  async storePat(pat: string): Promise<void> {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, pat);
    this.pat = pat;
    this.log.info("GitHub Models PAT stored in keytar");
  }

  /**
   * Delete PAT from keytar.
   */
  async deletePat(): Promise<boolean> {
    const result = await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (result) {
      this.pat = undefined;
      this.log.info("GitHub Models PAT deleted from keytar");
    }
    return result;
  }

  /**
   * Check if PAT is configured.
   */
  hasPatConfigured(): boolean {
    return !!this.pat;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Load PAT from keytar.
   */
  private async loadPatFromKeytar(): Promise<string | undefined> {
    try {
      const pat = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (pat) {
        this.log.info("GitHub Models PAT loaded from keytar");
        return pat;
      }
    } catch (error) {
      this.log.warn("Failed to load PAT from keytar", {
        error: (error as Error).message,
      });
    }
    return undefined;
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

  /**
   * Build request headers.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.pat) {
      headers["Authorization"] = `Bearer ${this.pat}`;
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
        content: typeof m.content === "string" ? m.content : m.content,
      })),
      stream,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
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
              .filter(([_k, v]) => v.required)
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
   * Transform response to standard format.
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
   * Map finish reason to standard format.
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
            `GitHub Models API error: ${response.status} - ${errorData.message}`,
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
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create GitHubModelsProvider instance.
 */
export function createGitHubModelsProvider(
  config?: GitHubModelsConfig
): GitHubModelsProvider {
  return new GitHubModelsProvider(config);
}

/**
 * Create GitHubModelsProvider from environment variables.
 */
export function createGitHubModelsProviderFromEnv(): GitHubModelsProvider {
  const pat = process.env.GITHUB_MODELS_PAT ?? process.env.GITHUB_TOKEN;
  const config: GitHubModelsConfig = {
    defaultModel: process.env.GITHUB_MODELS_DEFAULT_MODEL ?? DEFAULT_MODEL,
    timeoutMs: parseInt(
      process.env.GITHUB_MODELS_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
      10
    ),
    maxRequestsPerMinute: parseInt(
      process.env.GITHUB_MODELS_RATE_LIMIT ?? String(DEFAULT_RATE_LIMIT),
      10
    ),
  };
  if (pat !== undefined) {
    config.pat = pat;
  }
  return createGitHubModelsProvider(config);
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  GITHUB_MODELS,
  GITHUB_MODELS_BASE_URL,
  DEFAULT_MODEL as DEFAULT_GITHUB_MODEL,
  DEFAULT_RATE_LIMIT as DEFAULT_GITHUB_RATE_LIMIT,
  FREE_MODELS as GITHUB_FREE_MODELS,
  PRO_MODELS as GITHUB_PRO_MODELS,
  getGitHubModel,
  getApiModelName,
  isFreeTierModel,
  getModelsByProvider,
  selectModelForTask,
  type GitHubModel,
  type GitHubModelTier,
  type GitHubModelsConfig,
} from "./config.js";
