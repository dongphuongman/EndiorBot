/**
 * Chat Methods Tests
 *
 * @module tests/gateway/methods/chat
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 47
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerChatMethods,
  clearActiveStreams,
  getActiveStreamsCount,
  resetServerRef,
  type ChatSendParams,
  type ChatStreamParams,
  type ChatChunkData,
  type ChatDoneData,
} from "../../../src/gateway/methods/chat.js";
import { getProviderRegistry, resetProviderRegistry } from "../../../src/providers/provider-registry.js";
import { resetBudgetState } from "../../../src/gateway/methods/budget.js";
import type { AIProvider, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig, ProviderHealth } from "../../../src/providers/types.js";
import type { GatewayServer } from "../../../src/gateway/server.js";
import type { ClientInfo, GatewayEvent } from "../../../src/gateway/types.js";

// ============================================================================
// Mock Provider
// ============================================================================

class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly name = "Mock Provider";
  readonly models: ModelDefinition[] = [
    {
      id: "mock-model",
      name: "Mock Model",
      contextWindow: 4096,
      maxOutputTokens: 2048,
      supportedFeatures: ["chat", "streaming"],
    },
  ];

  private _chatResponse: ChatResponse = {
    id: "mock-response-1",
    model: "mock-model",
    content: "This is a mock response",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: "stop",
  };

  private _streamChunks: ChatChunk[] = [
    { id: "chunk-1", model: "mock-model", delta: "Hello" },
    { id: "chunk-2", model: "mock-model", delta: " world" },
    { id: "chunk-3", model: "mock-model", delta: "!", finishReason: "stop" },
  ];

  setChatResponse(response: ChatResponse): void {
    this._chatResponse = response;
  }

  setStreamChunks(chunks: ChatChunk[]): void {
    this._streamChunks = chunks;
  }

  async initialize(_config: ProviderConfig): Promise<void> {
    // No-op
  }

  async dispose(): Promise<void> {
    // No-op
  }

  async chat(_request: unknown): Promise<ChatResponse> {
    return this._chatResponse;
  }

  async *chatStream(_request: unknown): AsyncIterable<ChatChunk> {
    for (const chunk of this._streamChunks) {
      yield chunk;
      // Small delay to simulate streaming
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { status: "healthy" };
  }
}

// ============================================================================
// Mock Server
// ============================================================================

class MockGatewayServer {
  private methods = new Map<string, (params: unknown, client: ClientInfo) => unknown>();
  public sentMessages: Array<{ clientId: string; message: string }> = [];

  // Mock WebSocket clients map for sendNotification to work
  public clients = new Map<string, {
    readyState: number;
    send: (message: string) => void;
  }>();

  registerMethod(method: string, handler: (params: unknown, client: ClientInfo) => unknown): void {
    this.methods.set(method, handler);
  }

  getMethod(method: string): ((params: unknown, client: ClientInfo) => unknown) | undefined {
    return this.methods.get(method);
  }

  sendTo(clientId: string, event: GatewayEvent): boolean {
    this.sentMessages.push({ clientId, message: JSON.stringify(event) });
    return true;
  }

  // Add a mock client that captures sent messages
  addMockClient(clientId: string): void {
    this.clients.set(clientId, {
      readyState: 1, // WebSocket.OPEN
      send: (message: string) => {
        this.sentMessages.push({ clientId, message });
      },
    });
  }
}

// ============================================================================
// Test Setup
// ============================================================================

describe("Chat Methods", () => {
  let mockServer: MockGatewayServer;
  let mockProvider: MockProvider;
  let mockClient: ClientInfo;

  beforeEach(() => {
    // Reset state
    resetProviderRegistry();
    resetBudgetState();
    clearActiveStreams();
    resetServerRef();

    // Create mock server
    mockServer = new MockGatewayServer();

    // Create and register mock provider
    mockProvider = new MockProvider();
    getProviderRegistry().register(mockProvider);

    // Create mock client
    mockClient = {
      id: "test-client-1",
      type: "desktop",
      remoteAddress: "127.0.0.1",
      connectedAt: new Date(),
      lastActivity: new Date(),
      authenticated: true,
      subscriptions: new Set(["chat.chunk", "chat.done", "chat.error"]),
    };

    // Add mock client to server's clients map for sendNotification to work
    mockServer.addMockClient(mockClient.id);

    // Register methods
    registerChatMethods(mockServer as unknown as GatewayServer);
  });

  afterEach(() => {
    clearActiveStreams();
    resetServerRef();
  });

  // ==========================================================================
  // chat.send Tests
  // ==========================================================================

  describe("chat.send", () => {
    it("should send a chat message and receive response", async () => {
      const handler = mockServer.getMethod("chat.send");
      expect(handler).toBeDefined();

      const params: ChatSendParams = {
        message: "Hello, AI!",
      };

      const result = await handler!(params, mockClient);

      expect(result).toBeDefined();
      expect((result as { content: string }).content).toBe("This is a mock response");
      expect((result as { model: string }).model).toBe("mock-model");
      expect((result as { usage: { input: number } }).usage.input).toBe(10);
      expect((result as { usage: { output: number } }).usage.output).toBe(20);
    });

    it("should include history in request", async () => {
      const handler = mockServer.getMethod("chat.send");

      const params: ChatSendParams = {
        message: "Follow up question",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      };

      const result = await handler!(params, mockClient);

      expect(result).toBeDefined();
      expect((result as { content: string }).content).toBe("This is a mock response");
    });

    it("should include system prompt", async () => {
      const handler = mockServer.getMethod("chat.send");

      const params: ChatSendParams = {
        message: "Write code",
        systemPrompt: "You are a helpful coding assistant",
      };

      const result = await handler!(params, mockClient);

      expect(result).toBeDefined();
    });

    it("should throw error for empty message", async () => {
      const handler = mockServer.getMethod("chat.send");

      const params: ChatSendParams = {
        message: "",
      };

      await expect(handler!(params, mockClient)).rejects.toThrow("message is required");
    });

    it("should throw error for missing message", async () => {
      const handler = mockServer.getMethod("chat.send");

      const params = {};

      await expect(handler!(params, mockClient)).rejects.toThrow("message is required");
    });
  });

  // ==========================================================================
  // chat.stream Tests
  // ==========================================================================

  describe("chat.stream", () => {
    it("should start a stream and return streamId", async () => {
      const handler = mockServer.getMethod("chat.stream");
      expect(handler).toBeDefined();

      const params: ChatStreamParams = {
        message: "Tell me a story",
      };

      const result = await handler!(params, mockClient);

      expect(result).toBeDefined();
      expect((result as { streamId: string }).streamId).toBeDefined();
      expect((result as { model: string }).model).toBe("mock-model");
    });

    it("should send chunk notifications", async () => {
      const handler = mockServer.getMethod("chat.stream");

      const params: ChatStreamParams = {
        message: "Tell me a story",
      };

      await handler!(params, mockClient);

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 100));

      // Check that chunks were sent (messages are JSON strings)
      const chunkMessages = mockServer.sentMessages.filter((m) => {
        try {
          const parsed = JSON.parse(m.message);
          return parsed.method === "chat.chunk" && parsed.params?.delta !== undefined;
        } catch {
          return false;
        }
      });

      expect(chunkMessages.length).toBeGreaterThan(0);
    });

    it("should send done notification when stream completes", async () => {
      const handler = mockServer.getMethod("chat.stream");

      const params: ChatStreamParams = {
        message: "Tell me a story",
      };

      await handler!(params, mockClient);

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 100));

      // Check that done was sent (messages are JSON strings)
      const doneMessages = mockServer.sentMessages.filter((m) => {
        try {
          const parsed = JSON.parse(m.message);
          return parsed.method === "chat.done" && parsed.params?.finishReason !== undefined;
        } catch {
          return false;
        }
      });

      expect(doneMessages.length).toBe(1);
    });

    it("should throw error for empty message", async () => {
      const handler = mockServer.getMethod("chat.stream");

      const params: ChatStreamParams = {
        message: "",
      };

      await expect(handler!(params, mockClient)).rejects.toThrow("message is required");
    });
  });

  // ==========================================================================
  // chat.abort Tests
  // ==========================================================================

  describe("chat.abort", () => {
    it("should abort an active stream", async () => {
      const streamHandler = mockServer.getMethod("chat.stream");
      const abortHandler = mockServer.getMethod("chat.abort");

      // Start a stream
      const streamResult = await streamHandler!({ message: "Long story" }, mockClient);
      const streamId = (streamResult as { streamId: string }).streamId;

      // Abort it
      const abortResult = abortHandler!({ streamId }, mockClient);

      expect((abortResult as { success: boolean }).success).toBe(true);
    });

    it("should throw error for missing streamId", () => {
      const handler = mockServer.getMethod("chat.abort");

      expect(() => handler!({}, mockClient)).toThrow("streamId is required");
    });

    it("should throw error for non-existent stream", () => {
      const handler = mockServer.getMethod("chat.abort");

      expect(() => handler!({ streamId: "non-existent" }, mockClient)).toThrow(
        "Stream not found"
      );
    });
  });

  // ==========================================================================
  // chat.history Tests
  // ==========================================================================

  describe("chat.history", () => {
    it("should return empty history for now", () => {
      const handler = mockServer.getMethod("chat.history");
      expect(handler).toBeDefined();

      const result = handler!({ sessionId: "test-session" }, mockClient);

      expect(result).toBeDefined();
      expect((result as { messages: unknown[] }).messages).toEqual([]);
    });

    it("should throw error for missing sessionId", () => {
      const handler = mockServer.getMethod("chat.history");

      expect(() => handler!({}, mockClient)).toThrow("sessionId is required");
    });
  });

  // ==========================================================================
  // Provider Error Tests
  // ==========================================================================

  describe("Provider Errors", () => {
    it("should throw error when no provider configured", async () => {
      // Clear registry
      resetProviderRegistry();

      const handler = mockServer.getMethod("chat.send");

      await expect(handler!({ message: "Hello" }, mockClient)).rejects.toThrow(
        "No AI provider configured"
      );
    });
  });

  // ==========================================================================
  // Stream Management Tests
  // ==========================================================================

  describe("Stream Management", () => {
    it("should track active streams", async () => {
      expect(getActiveStreamsCount()).toBe(0);

      const handler = mockServer.getMethod("chat.stream");
      await handler!({ message: "Test" }, mockClient);

      expect(getActiveStreamsCount()).toBe(1);

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 100));

      expect(getActiveStreamsCount()).toBe(0);
    });

    it("should clear active streams", async () => {
      const handler = mockServer.getMethod("chat.stream");
      await handler!({ message: "Test" }, mockClient);

      expect(getActiveStreamsCount()).toBe(1);

      clearActiveStreams();

      expect(getActiveStreamsCount()).toBe(0);
    });
  });
});
