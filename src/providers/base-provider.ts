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
import { createLogger, redactSensitive, type Logger } from "../logging/index.js";

export abstract class BaseProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly models: ModelDefinition[];

  protected config: ProviderConfig | undefined;
  protected initialized = false;
  protected log: Logger;

  constructor() {
    // Create logger - will be updated with provider ID in initialize
    this.log = createLogger("provider");
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.log = createLogger("provider").child({ provider: this.id });
    this.log.debug("Initializing provider", { provider: this.id });

    await this.doInitialize(config);
    this.initialized = true;
    this.log.info("Provider initialized", { provider: this.id });
  }

  async dispose(): Promise<void> {
    this.log.debug("Disposing provider", { provider: this.id });
    await this.doDispose();
    this.initialized = false;
    this.config = undefined;
    this.log.info("Provider disposed", { provider: this.id });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.ensureInitialized();
    this.log.debug("Chat request", {
      model: request.model,
      messageCount: request.messages.length,
    });

    const startTime = Date.now();
    try {
      const response = await this.doChat(request);
      const duration = Date.now() - startTime;
      this.log.info("Chat completed", {
        model: request.model,
        durationMs: duration,
        usage: response.usage,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error("Chat failed", {
        model: request.model,
        durationMs: duration,
        error: redactSensitive({ message: (error as Error).message }, "tools"),
      });
      throw error;
    }
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    this.ensureInitialized();
    this.log.debug("Chat stream started", {
      model: request.model,
      messageCount: request.messages.length,
    });
    yield* this.doChatStream(request);
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.initialized) {
      this.log.warn("Health check on uninitialized provider", { provider: this.id });
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
