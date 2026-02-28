/**
 * Provider Types
 *
 * Core interfaces for AI model providers.
 * Based on TS-001 Provider Architecture specification.
 */

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

// ============================================================================
// Model Definition
// ============================================================================

export type ModelFeature = "chat" | "vision" | "tools" | "streaming";

export interface ModelDefinition {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportedFeatures: ModelFeature[];
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = "system" | "user" | "assistant";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  imageUrl: string;
  mediaType?: string;
}

export type ContentPart = TextContent | ImageContent;

export interface Message {
  role: MessageRole;
  content: string | ContentPart[];
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  required?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ============================================================================
// Chat Request/Response
// ============================================================================

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  stream?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "error";

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
}

export interface ChatChunk {
  id: string;
  model: string;
  delta: string;
  toolCalls?: ToolCall[];
  finishReason?: FinishReason;
}

// ============================================================================
// Provider Health
// ============================================================================

export interface ProviderHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly models: ModelDefinition[];

  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  dispose(): Promise<void>;

  // Core operations
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;

  // Health
  healthCheck(): Promise<ProviderHealth>;
}

// ============================================================================
// Provider Error
// ============================================================================

import { EndiorBotError } from "../errors/base.js";

/**
 * Legacy provider error codes (kept for backward compatibility).
 * New code should use ProviderErrorCode from ../errors/provider.js
 */
export type ProviderErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "CONTEXT_LENGTH"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_REQUEST"
  | "SERVICE_ERROR"
  | "UNKNOWN";

/**
 * Map legacy codes to new error hierarchy codes.
 */
function mapLegacyCode(code: ProviderErrorCode): string {
  const codeMap: Record<ProviderErrorCode, string> = {
    AUTH_ERROR: "PROVIDER_AUTH_FAILED",
    RATE_LIMIT: "PROVIDER_RATE_LIMITED",
    CONTEXT_LENGTH: "PROVIDER_CONTEXT_TOO_LONG",
    TIMEOUT: "PROVIDER_TIMEOUT",
    NETWORK: "PROVIDER_NETWORK_ERROR",
    INVALID_REQUEST: "PROVIDER_INVALID_RESPONSE",
    SERVICE_ERROR: "PROVIDER_SERVICE_ERROR",
    UNKNOWN: "PROVIDER_UNKNOWN",
  };
  return codeMap[code];
}

/**
 * Provider error class extending the unified error hierarchy.
 * Maintains backward compatibility with legacy constructor signature.
 */
export class ProviderError extends EndiorBotError {
  /** Provider that generated the error */
  public readonly providerId: string;

  /** Legacy error code (for backward compatibility) */
  public readonly legacyCode: ProviderErrorCode;

  /** Original error if any */
  public readonly originalError?: Error;

  constructor(
    message: string,
    providerId: string,
    code: ProviderErrorCode,
    retryable: boolean,
    originalError?: Error,
  ) {
    const superOptions: {
      code: string;
      category: "PROVIDER";
      retryable: boolean;
      metadata: Record<string, unknown>;
      cause?: Error;
    } = {
      code: mapLegacyCode(code),
      category: "PROVIDER",
      retryable,
      metadata: { providerId, legacyCode: code },
    };
    if (originalError) {
      superOptions.cause = originalError;
    }
    super(message, superOptions);

    this.name = "ProviderError";
    this.providerId = providerId;
    this.legacyCode = code;
    if (originalError) {
      this.originalError = originalError;
    }
  }
}
