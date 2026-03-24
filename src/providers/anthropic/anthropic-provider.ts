/**
 * Anthropic Provider
 *
 * Implementation of AIProvider for Anthropic Claude models.
 * Uses @anthropic-ai/sdk for API communication.
 */

import { BaseProvider } from "../base-provider.js";
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
} from "../types.js";
import { ProviderError, type ProviderErrorCode } from "../types.js";
import { RateLimiter } from "../../security/rate-limiter.js";

// Anthropic API response types
interface AnthropicResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
}

// Anthropic model definitions — Sonnet first (default for chat/fallback)
const ANTHROPIC_MODELS: ModelDefinition[] = [
  // Default: Sonnet (best cost/quality balance)
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude 4.5 Sonnet",
    contextWindow: 200000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude 4.5 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  // Opus: explicit architecture decisions only (CLAUDE.md invariant 4)
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude 4.5 Opus",
    contextWindow: 200000,
    maxOutputTokens: 16384,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  // Legacy models
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
];

/** Default rate limit for Anthropic API (50 req/min for most tiers) */
const DEFAULT_RATE_LIMIT = 50;

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly models = ANTHROPIC_MODELS;

  private _apiKey: string | undefined;
  private _baseUrl: string | undefined;
  private timeout: number = 30000;
  private rateLimiter: RateLimiter;

  constructor(maxRequestsPerMinute: number = DEFAULT_RATE_LIMIT) {
    super();
    // Rate limiter: configurable req/min (default 50)
    this.rateLimiter = new RateLimiter(60_000, maxRequestsPerMinute);
  }

  /** Get API key (throws if not initialized) */
  private get apiKey(): string {
    if (!this._apiKey) {
      throw new ProviderError("Provider not initialized", this.id, "AUTH_ERROR", false);
    }
    return this._apiKey;
  }

  /** Get base URL (throws if not initialized) */
  private get baseUrl(): string {
    if (!this._baseUrl) {
      throw new ProviderError("Provider not initialized", this.id, "AUTH_ERROR", false);
    }
    return this._baseUrl;
  }

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ProviderError(
        "API key is required",
        this.id,
        "AUTH_ERROR",
        false,
      );
    }
    this._apiKey = config.apiKey;
    this._baseUrl = config.baseUrl ?? "https://api.anthropic.com";
    this.timeout = config.timeout ?? 30000;
  }

  protected async doDispose(): Promise<void> {
    this._apiKey = undefined;
    this._baseUrl = undefined;
    this.rateLimiter.clear();
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
    this.checkRateLimit();
    this.validateModel(request.model);

    // Convert messages to Anthropic format
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const anthropicMessages = nonSystemMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: typeof msg.content === "string" ? msg.content : this.formatContent(msg.content),
    }));

    const body = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemMessage ? this.extractTextContent(systemMessage.content) : undefined,
      messages: anthropicMessages,
    };

    const response = await this.makeRequest<AnthropicResponse>("/v1/messages", body);

    return {
      id: response.id,
      model: response.model,
      content: this.extractResponseContent(response.content),
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      finishReason: this.mapStopReason(response.stop_reason),
    };
  }

  protected async *doChatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.checkRateLimit();
    this.validateModel(request.model);

    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const anthropicMessages = nonSystemMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: typeof msg.content === "string" ? msg.content : this.formatContent(msg.content),
    }));

    const body = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: systemMessage ? this.extractTextContent(systemMessage.content) : undefined,
      messages: anthropicMessages,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw await this.handleErrorResponse(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.text) {
              yield {
                id: event.message?.id ?? "",
                model: request.model,
                delta: event.delta.text,
              };
            } else if (event.type === "message_stop") {
              yield {
                id: event.message?.id ?? "",
                model: request.model,
                delta: "",
                finishReason: "stop",
              };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  protected async doHealthCheck(): Promise<ProviderHealth> {
    const start = Date.now();

    try {
      // Simple API check - we just verify auth works
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { status: "healthy", latencyMs };
      }

      if (response.status === 429) {
        return { status: "degraded", latencyMs, message: "Rate limited" };
      }

      return { status: "unhealthy", latencyMs, message: `HTTP ${response.status}` };
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async makeRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError(
          "Request timeout",
          this.id,
          "TIMEOUT",
          true,
          error,
        );
      }

      throw new ProviderError(
        error instanceof Error ? error.message : "Unknown error",
        this.id,
        "NETWORK",
        true,
        error instanceof Error ? error : undefined,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleErrorResponse(response: Response): Promise<ProviderError> {
    let message = `HTTP ${response.status}`;
    let code: ProviderErrorCode = "SERVICE_ERROR";
    let retryable = false;

    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Use default message
    }

    switch (response.status) {
      case 401:
        code = "AUTH_ERROR";
        break;
      case 429:
        code = "RATE_LIMIT";
        retryable = true;
        break;
      case 400:
        code = "INVALID_REQUEST";
        break;
      case 500:
      case 502:
      case 503:
        code = "SERVICE_ERROR";
        retryable = true;
        break;
    }

    return new ProviderError(message, this.id, code, retryable);
  }

  private formatContent(content: { type: string; text?: string; imageUrl?: string }[]): string {
    return content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n");
  }

  private extractTextContent(content: string | { type: string; text?: string }[]): string {
    if (typeof content === "string") return content;
    return this.formatContent(content);
  }

  private extractResponseContent(content: unknown[]): string {
    if (!Array.isArray(content)) return "";
    return content
      .filter((c): c is { type: string; text: string } =>
        typeof c === "object" && c !== null && "type" in c && "text" in c && (c as Record<string, unknown>).type === "text"
      )
      .map((c) => c.text)
      .join("");
  }

  private mapStopReason(reason: string | undefined): ChatResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return "stop";
    }
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
