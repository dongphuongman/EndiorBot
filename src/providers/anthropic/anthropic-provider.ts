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
import { ProviderError } from "../types.js";

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

// Anthropic model definitions
const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: "claude-opus-4",
    name: "Claude Opus 4",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "claude-haiku-4",
    name: "Claude Haiku 4",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportedFeatures: ["chat", "vision", "tools", "streaming"],
  },
];

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly models = ANTHROPIC_MODELS;

  private apiKey: string | undefined;
  private baseUrl: string | undefined;
  private timeout: number = 30000;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com";
    this.timeout = config.timeout ?? 30000;

    if (!this.apiKey) {
      throw new ProviderError(
        "API key is required",
        this.id,
        "AUTH_ERROR",
        false,
      );
    }
  }

  protected async doDispose(): Promise<void> {
    this.apiKey = undefined;
    this.baseUrl = undefined;
  }

  protected async doChat(request: ChatRequest): Promise<ChatResponse> {
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
        "x-api-key": this.apiKey!,
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
          "x-api-key": this.apiKey!,
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
          "x-api-key": this.apiKey!,
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
    let code: ProviderError["code"] = "SERVICE_ERROR";
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
}
