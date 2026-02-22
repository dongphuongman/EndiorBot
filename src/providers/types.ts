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
  apiKey: string;
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

export type ProviderErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "CONTEXT_LENGTH"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_REQUEST"
  | "SERVICE_ERROR"
  | "UNKNOWN";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly code: ProviderErrorCode,
    public readonly retryable: boolean,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
