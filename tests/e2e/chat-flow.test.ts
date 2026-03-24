/**
 * E2E Chat Flow Tests
 *
 * Tests the full chat flow: Desktop → Gateway → Provider → Desktop
 *
 * @module tests/e2e/chat-flow
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 47 Day 3
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { GatewayServer, createGatewayServer } from "../../src/gateway/server.js";
import { registerAllMethods } from "../../src/gateway/methods/index.js";
import { getProviderRegistry, resetProviderRegistry } from "../../src/providers/provider-registry.js";
import { resetBudgetState, getBudgetState } from "../../src/gateway/methods/budget.js";
import { clearActiveStreams } from "../../src/gateway/methods/chat.js";
import type { AIProvider, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig, ProviderHealth } from "../../src/providers/types.js";

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PORT = 18797;
const TEST_HOST = "127.0.0.1";
const WS_URL = `ws://${TEST_HOST}:${TEST_PORT}/ws`;

// ============================================================================
// Mock Provider
// ============================================================================

class E2EMockProvider implements AIProvider {
  readonly id = "e2e-mock";
  readonly name = "E2E Mock Provider";
  readonly models: ModelDefinition[] = [
    {
      id: "e2e-model",
      name: "E2E Test Model",
      contextWindow: 8192,
      maxOutputTokens: 4096,
      supportedFeatures: ["chat", "streaming"],
    },
  ];

  private streamDelay = 50; // ms between chunks
  private shouldFail = false;

  setStreamDelay(ms: number): void {
    this.streamDelay = ms;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async initialize(_config: ProviderConfig): Promise<void> {}
  async dispose(): Promise<void> {}

  async chat(_request: unknown): Promise<ChatResponse> {
    if (this.shouldFail) {
      throw new Error("Simulated provider failure");
    }

    return {
      id: `e2e-response-${Date.now()}`,
      model: "e2e-model",
      content: "This is an E2E test response from the mock provider.",
      usage: { promptTokens: 25, completionTokens: 15, totalTokens: 40 },
      finishReason: "stop",
    };
  }

  async *chatStream(_request: unknown): AsyncIterable<ChatChunk> {
    if (this.shouldFail) {
      throw new Error("Simulated provider failure");
    }

    const chunks = [
      "Hello",
      " from",
      " the",
      " E2E",
      " mock",
      " provider!",
    ];

    for (let i = 0; i < chunks.length; i++) {
      await new Promise((r) => setTimeout(r, this.streamDelay));
      yield {
        id: `chunk-${i}`,
        model: "e2e-model",
        delta: chunks[i]!,
        finishReason: i === chunks.length - 1 ? "stop" : undefined,
      };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { status: "healthy" };
  }
}

// ============================================================================
// WebSocket Client Helper
// ============================================================================

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

class TestWebSocketClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<string, ((data: unknown) => void)[]>();
  private connected = false;

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.connected = true;
        resolve();
      });

      this.ws.on("error", (err) => {
        reject(err);
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.connected = false;
      });
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Response to our request
      if ("id" in message && message.id !== null) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }

      // Notification (event)
      if ("method" in message) {
        const handlers = this.eventHandlers.get(message.method) ?? [];
        for (const handler of handlers) {
          handler(message.params);
        }

        // Also check for gateway events (method: "event")
        if (message.method === "event" && message.params?.type) {
          const eventHandlers = this.eventHandlers.get(message.params.type) ?? [];
          for (const handler of eventHandlers) {
            handler(message.params.data);
          }
        }
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected");
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.ws!.send(JSON.stringify(request));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout"));
        }
      }, 10000);
    });
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);

    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ============================================================================
// E2E Tests
// ============================================================================

describe("E2E Chat Flow", () => {
  let server: GatewayServer;
  let client: TestWebSocketClient;
  let mockProvider: E2EMockProvider;

  beforeAll(async () => {
    // Create and start gateway server
    server = createGatewayServer({ port: TEST_PORT, host: TEST_HOST });
    registerAllMethods(server);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(async () => {
    // Reset state
    resetProviderRegistry();
    resetBudgetState();
    clearActiveStreams();

    // Register mock provider
    mockProvider = new E2EMockProvider();
    getProviderRegistry().register(mockProvider);

    // Connect client
    client = new TestWebSocketClient();
    await client.connect(WS_URL);

    // Subscribe to events
    await client.send("subscribe", { events: ["*"] });
  });

  afterEach(() => {
    client.disconnect();
  });

  // ==========================================================================
  // chat.send E2E Tests
  // ==========================================================================

  describe("chat.send E2E", () => {
    it("should complete full round-trip: Client → Gateway → Provider → Client", async () => {
      const result = await client.send("chat.send", {
        message: "Hello, E2E test!",
      });

      expect(result).toBeDefined();
      expect((result as { content: string }).content).toBe(
        "This is an E2E test response from the mock provider."
      );
      expect((result as { model: string }).model).toBe("e2e-model");
      expect((result as { usage: { input: number } }).usage.input).toBe(25);
      expect((result as { usage: { output: number } }).usage.output).toBe(15);
    });

    it("should record cost in budget after chat.send", async () => {
      const budgetBefore = getBudgetState();
      expect(budgetBefore.session.costSoFar).toBe(0);

      await client.send("chat.send", {
        message: "Track my cost!",
        sessionId: "e2e-session-1",
      });

      const budgetAfter = getBudgetState();
      expect(budgetAfter.session.costSoFar).toBeGreaterThan(0);
    });

    it("should handle provider errors gracefully", async () => {
      mockProvider.setShouldFail(true);

      await expect(
        client.send("chat.send", { message: "This should fail" })
      ).rejects.toThrow("Simulated provider failure");
    });

    it("should include conversation history", async () => {
      const result = await client.send("chat.send", {
        message: "Follow up question",
        history: [
          { role: "user", content: "First question" },
          { role: "assistant", content: "First answer" },
        ],
      });

      expect(result).toBeDefined();
      expect((result as { content: string }).content).toBeDefined();
    });
  });

  // ==========================================================================
  // chat.stream E2E Tests
  // ==========================================================================

  describe("chat.stream E2E", () => {
    it("should stream chunks from Provider to Client", async () => {
      const chunks: string[] = [];

      // Subscribe to chunks
      const unsubChunk = client.on("chat.chunk", (data: unknown) => {
        const chunk = data as { delta: string };
        chunks.push(chunk.delta);
      });

      // Start stream
      const result = await client.send("chat.stream", {
        message: "Stream me a story",
      });

      expect((result as { streamId: string }).streamId).toBeDefined();

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 500));

      unsubChunk();

      // Verify chunks received
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toBe("Hello from the E2E mock provider!");
    });

    it("should send chat.done notification when stream completes", async () => {
      let doneReceived = false;
      let doneData: unknown = null;

      const unsubDone = client.on("chat.done", (data: unknown) => {
        doneReceived = true;
        doneData = data;
      });

      await client.send("chat.stream", { message: "Complete me" });

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 500));

      unsubDone();

      expect(doneReceived).toBe(true);
      expect((doneData as { content: string }).content).toBe(
        "Hello from the E2E mock provider!"
      );
      expect((doneData as { usage: unknown }).usage).toBeDefined();
    });

    it("should record cost in budget after stream completes", async () => {
      // Reset budget state for this test
      resetBudgetState();
      const budgetBefore = getBudgetState();
      expect(budgetBefore.session.costSoFar).toBe(0);

      await client.send("chat.stream", {
        message: "Track streaming cost",
        sessionId: "e2e-stream-session",
      });

      // Wait for stream to complete
      await new Promise((r) => setTimeout(r, 500));

      const budgetAfter = getBudgetState();
      expect(budgetAfter.session.costSoFar).toBeGreaterThan(0);
    });

    it("should handle stream abort cleanly", async () => {
      mockProvider.setStreamDelay(100); // Slow down chunks

      const chunks: string[] = [];
      const unsubChunk = client.on("chat.chunk", (data: unknown) => {
        chunks.push((data as { delta: string }).delta);
      });

      // Start stream
      const result = await client.send("chat.stream", { message: "Abort me" });
      const streamId = (result as { streamId: string }).streamId;

      // Wait for a couple chunks
      await new Promise((r) => setTimeout(r, 150));

      // Abort
      const abortResult = await client.send("chat.abort", { streamId });
      expect((abortResult as { success: boolean }).success).toBe(true);

      // Wait a bit more
      await new Promise((r) => setTimeout(r, 200));

      unsubChunk();

      // Should have received some but not all chunks
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.length).toBeLessThan(6); // Full stream is 6 chunks
    });
  });

  // ==========================================================================
  // Budget Integration Tests
  // ==========================================================================

  describe("Budget Integration", () => {
    it("should update budget across multiple chat requests", async () => {
      // Reset budget for clean test
      resetBudgetState();

      // First request
      await client.send("chat.send", {
        message: "Request 1",
        sessionId: "budget-test",
      });

      const budget1 = getBudgetState();
      const cost1 = budget1.session.costSoFar;
      expect(cost1).toBeGreaterThan(0);

      // Second request
      await client.send("chat.send", {
        message: "Request 2",
        sessionId: "budget-test",
      });

      const budget2 = getBudgetState();
      expect(budget2.session.costSoFar).toBeGreaterThan(cost1);

      // Third request (streaming) - wait for completion before checking
      const streamResult = await client.send("chat.stream", {
        message: "Request 3",
        sessionId: "budget-test",
      });

      // Wait longer for stream to complete and cost to be recorded
      await new Promise((r) => setTimeout(r, 600));

      const budget3 = getBudgetState();
      expect(budget3.session.costSoFar).toBeGreaterThanOrEqual(budget2.session.costSoFar);
    });

    it("should track daily and monthly totals", async () => {
      await client.send("chat.send", {
        message: "Track all budgets",
        sessionId: "full-budget-test",
      });

      const budget = getBudgetState();
      expect(budget.session.costSoFar).toBeGreaterThan(0);
      expect(budget.daily.costSoFar).toBeGreaterThan(0);
      expect(budget.monthly.costSoFar).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Connection Resilience Tests
  // ==========================================================================

  describe("Connection Resilience", () => {
    it("should handle rapid sequential requests", async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          client.send("chat.send", { message: `Rapid request ${i}` })
        );
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      for (const result of results) {
        expect((result as { content: string }).content).toBeDefined();
      }
    });

    it("should handle concurrent streams", async () => {
      const streamResults = await Promise.all([
        client.send("chat.stream", { message: "Stream 1" }),
        client.send("chat.stream", { message: "Stream 2" }),
      ]);

      expect(streamResults.length).toBe(2);
      expect((streamResults[0] as { streamId: string }).streamId).toBeDefined();
      expect((streamResults[1] as { streamId: string }).streamId).toBeDefined();
      expect((streamResults[0] as { streamId: string }).streamId).not.toBe(
        (streamResults[1] as { streamId: string }).streamId
      );

      // Wait for both to complete
      await new Promise((r) => setTimeout(r, 600));
    });
  });
});
