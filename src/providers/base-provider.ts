/**
 * Base Provider
 *
 * Abstract base class for AI model providers.
 * Implements common functionality and enforces interface contract.
 */

import type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig,
  ProviderHealth,
} from "./types.js";

export abstract class BaseProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly models: ModelDefinition[];

  protected config: ProviderConfig | undefined;
  protected initialized = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    await this.doInitialize(config);
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    await this.doDispose();
    this.initialized = false;
    this.config = undefined;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.ensureInitialized();
    return this.doChat(request);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.ensureInitialized();
    yield* this.doChatStream(request);
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.initialized) {
      return { status: "unhealthy", message: "Provider not initialized" };
    }
    return this.doHealthCheck();
  }

  // Template methods for subclasses
  protected abstract doInitialize(config: ProviderConfig): Promise<void>;
  protected abstract doDispose(): Promise<void>;
  protected abstract doChat(request: ChatRequest): Promise<ChatResponse>;
  protected abstract doChatStream(request: ChatRequest): AsyncIterable<ChatChunk>;
  protected abstract doHealthCheck(): Promise<ProviderHealth>;

  protected ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error(`Provider ${this.id} not initialized. Call initialize() first.`);
    }
  }

  protected getModel(modelId: string): ModelDefinition | undefined {
    return this.models.find((m) => m.id === modelId);
  }

  protected validateModel(modelId: string): ModelDefinition {
    const model = this.getModel(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in provider ${this.id}`);
    }
    return model;
  }
}
