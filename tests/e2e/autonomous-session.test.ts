/**
 * E2E Autonomous Session Simulation Tests
 *
 * Simulates a 2-hour autonomous session with:
 * - Multiple chat requests
 * - Budget tracking and alerts
 * - Checkpoint creation
 * - Approval flows
 * - Connection stability
 *
 * @module tests/e2e/autonomous-session
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 47 Day 5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { GatewayServer, createGatewayServer } from "../../src/gateway/server.js";
import { registerAllMethods } from "../../src/gateway/methods/index.js";
import { getProviderRegistry, resetProviderRegistry } from "../../src/providers/provider-registry.js";
import { resetBudgetState, getBudgetState, recordCost } from "../../src/gateway/methods/budget.js";
import { clearActiveStreams } from "../../src/gateway/methods/chat.js";
import {
  createApprovalRequest,
  clearApprovalQueue,
  waitForApproval,
} from "../../src/gateway/methods/approval.js";
import {
  storeCheckpoint,
  clearCheckpoints,
  getCheckpointsMap,
  addTestCheckpoint,
  type CheckpointInfo,
} from "../../src/gateway/methods/checkpoints.js";
import { randomUUID } from "crypto";
import type { AIProvider, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig, ProviderHealth } from "../../src/providers/types.js";

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PORT = 18799;
const TEST_HOST = "127.0.0.1";
const WS_URL = `ws://${TEST_HOST}:${TEST_PORT}`;

// Simulate time compression: 1 "hour" = 100ms for testing
const SIMULATED_HOUR_MS = 100;

// ============================================================================
// Mock Provider
// ============================================================================

class AutonomousSessionMockProvider implements AIProvider {
  readonly id = "autonomous-mock";
  readonly name = "Autonomous Session Mock";
  readonly models: ModelDefinition[] = [
    {
      id: "auto-model",
      name: "Auto Model",
      contextWindow: 8192,
      maxOutputTokens: 4096,
      supportedFeatures: ["chat", "streaming"],
    },
  ];

  private requestCount = 0;

  async initialize(_config: ProviderConfig): Promise<void> {}
  async dispose(): Promise<void> {}

  async chat(_request: unknown): Promise<ChatResponse> {
    this.requestCount++;
    return {
      id: `auto-response-${this.requestCount}`,
      model: "auto-model",
      content: `Autonomous response #${this.requestCount}`,
      usage: {
        promptTokens: 50 + Math.floor(Math.random() * 50),
        completionTokens: 100 + Math.floor(Math.random() * 100),
        totalTokens: 200,
      },
      finishReason: "stop",
    };
  }

  async *chatStream(_request: unknown): AsyncIterable<ChatChunk> {
    this.requestCount++;
    const chunks = ["Processing", " your", " request", "..."];
    for (let i = 0; i < chunks.length; i++) {
      yield {
        id: `chunk-${i}`,
        model: "auto-model",
        delta: chunks[i]!,
        finishReason: i === chunks.length - 1 ? "stop" : undefined,
      };
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { status: "healthy" };
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}

// ============================================================================
// WebSocket Client
// ============================================================================

class SessionWebSocketClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<string, ((data: unknown) => void)[]>();
  private connected = false;
  private reconnectCount = 0;

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.connected = true;
        resolve();
      });

      this.ws.on("error", reject);

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

      if ("method" in message) {
        const handlers = this.eventHandlers.get(message.method) ?? [];
        for (const handler of handlers) {
          handler(message.params);
        }

        if (message.method === "event" && message.params?.type) {
          const eventHandlers = this.eventHandlers.get(message.params.type) ?? [];
          for (const handler of eventHandlers) {
            handler(message.params.data);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected");
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.ws!.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));

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
        const idx = handlers.indexOf(handler);
        if (idx > -1) handlers.splice(idx, 1);
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

  getReconnectCount(): number {
    return this.reconnectCount;
  }
}

// ============================================================================
// E2E Tests
// ============================================================================

describe("E2E Autonomous Session Simulation", () => {
  let server: GatewayServer;
  let client: SessionWebSocketClient;
  let mockProvider: AutonomousSessionMockProvider;

  beforeAll(async () => {
    server = createGatewayServer({ port: TEST_PORT, host: TEST_HOST });
    registerAllMethods(server);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(async () => {
    resetProviderRegistry();
    resetBudgetState();
    clearActiveStreams();
    clearApprovalQueue();
    clearCheckpoints();

    mockProvider = new AutonomousSessionMockProvider();
    getProviderRegistry().register(mockProvider);

    client = new SessionWebSocketClient();
    await client.connect(WS_URL);
    await client.send("subscribe", { events: ["*"] });
  });

  afterEach(() => {
    client.disconnect();
  });

  // ==========================================================================
  // Session Runs Without Human Intervention
  // ==========================================================================

  describe("Session Without Human Intervention", () => {
    it("should process multiple chat requests autonomously", async () => {
      const requestCount = 10;
      const results: unknown[] = [];

      for (let i = 0; i < requestCount; i++) {
        const result = await client.send("chat.send", {
          message: `Autonomous request ${i + 1}`,
          sessionId: "autonomous-session-1",
        });
        results.push(result);

        // Small delay between requests
        await new Promise((r) => setTimeout(r, SIMULATED_HOUR_MS / 10));
      }

      expect(results.length).toBe(requestCount);
      expect(mockProvider.getRequestCount()).toBe(requestCount);
    });

    it("should maintain connection throughout session", async () => {
      // Simulate 2 "hours" of activity
      for (let hour = 0; hour < 2; hour++) {
        // 5 requests per hour
        for (let i = 0; i < 5; i++) {
          await client.send("chat.send", {
            message: `Hour ${hour + 1}, Request ${i + 1}`,
          });
          await new Promise((r) => setTimeout(r, SIMULATED_HOUR_MS / 5));
        }
      }

      // Connection should still be active
      expect(client.isConnected()).toBe(true);
      expect(client.getReconnectCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Budget Alerts at Threshold
  // ==========================================================================

  describe("Budget Alerts at Threshold", () => {
    it("should track cumulative costs across requests", async () => {
      const initialBudget = getBudgetState();
      expect(initialBudget.session.costSoFar).toBe(0);

      // Simulate cost accumulation
      for (let i = 0; i < 5; i++) {
        recordCost({
          provider: "autonomous-mock",
          model: "auto-model",
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.01,
          sessionId: "budget-test-session",
        });
      }

      const afterCosts = getBudgetState();
      expect(afterCosts.session.costSoFar).toBe(0.05);
      expect(afterCosts.daily.costSoFar).toBe(0.05);
      expect(afterCosts.monthly.costSoFar).toBe(0.05);
    });

    it("should calculate budget percentage correctly", async () => {
      // Set a low limit for testing
      await client.send("budget.setLimits", { session: 0.10 });

      // Add cost
      recordCost({
        provider: "autonomous-mock",
        model: "auto-model",
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.05,
        sessionId: "percentage-test",
      });

      const budget = await client.send("budget.get", {});
      const status = budget as { session: { percentage: number } };

      expect(status.session.percentage).toBe(50); // 50% of limit
    });

    it("should report remaining budget correctly", async () => {
      await client.send("budget.setLimits", { session: 1.0, daily: 10.0 });

      recordCost({
        provider: "autonomous-mock",
        model: "auto-model",
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.30,
        sessionId: "remaining-test",
      });

      const remaining = await client.send("budget.remaining", {});
      const result = remaining as { session: number; daily: number };

      expect(result.session).toBeCloseTo(0.70, 2);
      expect(result.daily).toBeCloseTo(9.70, 2);
    });
  });

  // ==========================================================================
  // Checkpoint Creation
  // ==========================================================================

  describe("Checkpoint Creation", () => {
    it("should create checkpoint with session data", () => {
      const checkpointId = randomUUID();
      const checkpoint: CheckpointInfo = {
        id: checkpointId,
        sessionId: "autonomous-session-1",
        label: "Before risky operation",
        createdAt: Date.now(),
        fileCount: 5,
        messageCount: 10,
        tokenUsage: { input: 500, output: 1000 },
        brainDigest: "sha256:abc123def456",
      };

      storeCheckpoint(checkpoint);

      const stored = getCheckpointsMap().get(checkpointId);
      expect(stored).toBeDefined();
      expect(stored?.label).toBe("Before risky operation");
      expect(stored?.brainDigest).toBe("sha256:abc123def456");
    });

    it("should list checkpoints via Gateway", async () => {
      // Create checkpoints
      const cp1: CheckpointInfo = {
        id: randomUUID(),
        sessionId: "session-1",
        createdAt: Date.now(),
        fileCount: 0,
        messageCount: 0,
        tokenUsage: { input: 0, output: 0 },
        brainDigest: "digest-1",
      };
      const cp2: CheckpointInfo = {
        id: randomUUID(),
        sessionId: "session-1",
        createdAt: Date.now() + 1,
        fileCount: 0,
        messageCount: 0,
        tokenUsage: { input: 0, output: 0 },
        brainDigest: "digest-2",
      };

      storeCheckpoint(cp1);
      storeCheckpoint(cp2);

      const result = await client.send("checkpoints.list", {
        sessionId: "session-1",
      });

      const list = result as { checkpoints: unknown[] };
      expect(list.checkpoints.length).toBe(2);
    });

    it("should include brainDigest in checkpoint", () => {
      const checkpointId = randomUUID();
      const checkpoint: CheckpointInfo = {
        id: checkpointId,
        sessionId: "digest-test",
        createdAt: Date.now(),
        fileCount: 0,
        messageCount: 0,
        tokenUsage: { input: 0, output: 0 },
        brainDigest: "sha256:brain_state_hash_12345",
      };

      storeCheckpoint(checkpoint);

      const stored = getCheckpointsMap().get(checkpointId);
      expect(stored?.brainDigest).toBe("sha256:brain_state_hash_12345");
    });
  });

  // ==========================================================================
  // Full 2-Hour Simulation
  // ==========================================================================

  describe("2-Hour Autonomous Session Simulation", () => {
    it("should complete full simulation without errors", async () => {
      const sessionId = "full-simulation-session";
      const events: string[] = [];

      // Track events
      client.on("budget.update", () => events.push("budget.update"));
      client.on("approval.pending", () => events.push("approval.pending"));

      // Hour 1: Multiple chat requests + checkpoint
      for (let i = 0; i < 5; i++) {
        await client.send("chat.send", {
          message: `Hour 1, Task ${i + 1}`,
          sessionId,
        });
      }

      // Create hourly checkpoint
      const cp1: CheckpointInfo = {
        id: randomUUID(),
        sessionId,
        label: "Hour 1 checkpoint",
        createdAt: Date.now(),
        fileCount: 0,
        messageCount: 5,
        tokenUsage: { input: 250, output: 500 },
        brainDigest: "sha256:hour1_state",
      };
      storeCheckpoint(cp1);

      // Simulate approval request mid-session
      const approvalRequest = createApprovalRequest(
        "action",
        "Deploy hourly build?",
        { sessionId }
      );

      // Auto-approve (simulating CEO approval)
      setTimeout(async () => {
        await client.send("approval.approve", { approvalId: approvalRequest.id });
      }, 50);

      await waitForApproval(approvalRequest.id, 1000);

      // Hour 2: More chat requests + final checkpoint
      for (let i = 0; i < 5; i++) {
        await client.send("chat.send", {
          message: `Hour 2, Task ${i + 1}`,
          sessionId,
        });
      }

      const cp2: CheckpointInfo = {
        id: randomUUID(),
        sessionId,
        label: "Hour 2 checkpoint",
        createdAt: Date.now(),
        fileCount: 0,
        messageCount: 10,
        tokenUsage: { input: 500, output: 1000 },
        brainDigest: "sha256:hour2_state",
      };
      storeCheckpoint(cp2);

      // Verify session completed successfully
      expect(mockProvider.getRequestCount()).toBe(10);
      expect(client.isConnected()).toBe(true);

      // Check checkpoints created
      const checkpointsResult = await client.send("checkpoints.list", { sessionId });
      const checkpoints = checkpointsResult as { checkpoints: unknown[] };
      expect(checkpoints.checkpoints.length).toBe(2);

      // Check budget accumulated
      const budget = getBudgetState();
      expect(budget.session.costSoFar).toBeGreaterThan(0);
    });

    it("should handle approval flow during autonomous operation", async () => {
      // Start autonomous work
      await client.send("chat.send", { message: "Start task" });

      // Agent encounters decision needing CEO approval
      const request = createApprovalRequest(
        "escalation",
        "Should I proceed with risky refactoring?",
        {
          details: { affectedFiles: 15, riskLevel: "medium" },
          sessionId: "approval-flow-session",
        }
      );

      // Verify it appears in pending
      const pending = await client.send("approval.pendingCount", {});
      expect((pending as { count: number }).count).toBe(1);

      // CEO approves
      await client.send("approval.approve", {
        approvalId: request.id,
        notes: "Proceed carefully",
      });

      // Agent continues
      await client.send("chat.send", { message: "Continuing after approval" });

      // Session continues without interruption
      expect(client.isConnected()).toBe(true);
    });
  });

  // ==========================================================================
  // Connection Stability
  // ==========================================================================

  describe("Connection Stability", () => {
    it("should handle rapid consecutive requests", async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(client.send("chat.send", { message: `Rapid ${i}` }));
      }

      await Promise.all(promises);

      expect(client.isConnected()).toBe(true);
      expect(mockProvider.getRequestCount()).toBe(20);
    });

    it("should maintain state across many operations", async () => {
      // Mix of operations
      await client.send("chat.send", { message: "Chat 1", sessionId: "mixed" });
      await client.send("budget.get", {});
      await client.send("chat.send", { message: "Chat 2", sessionId: "mixed" });
      await client.send("approval.pendingCount", {});
      await client.send("chat.send", { message: "Chat 3", sessionId: "mixed" });
      await client.send("budget.remaining", {});

      const mixedCp: CheckpointInfo = {
        id: randomUUID(),
        sessionId: "mixed",
        createdAt: Date.now(),
        fileCount: 0,
        messageCount: 3,
        tokenUsage: { input: 150, output: 300 },
        brainDigest: "sha256:mixed_session",
      };
      storeCheckpoint(mixedCp);

      await client.send("checkpoints.list", { sessionId: "mixed" });

      // All operations should complete without disconnection
      expect(client.isConnected()).toBe(true);
    });
  });
});
