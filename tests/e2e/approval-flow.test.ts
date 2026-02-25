/**
 * E2E Approval Flow Tests
 *
 * Tests the full approval flow: Agent → Gateway → Desktop → Gateway → Agent
 *
 * @module tests/e2e/approval-flow
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 47 Day 4
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { GatewayServer, createGatewayServer } from "../../src/gateway/server.js";
import { registerAllMethods } from "../../src/gateway/methods/index.js";
import {
  createApprovalRequest,
  waitForApproval,
  clearApprovalQueue,
  getApprovalQueue,
  type ApprovalRequest,
} from "../../src/gateway/methods/approval.js";

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PORT = 18798;
const TEST_HOST = "127.0.0.1";
const WS_URL = `ws://${TEST_HOST}:${TEST_PORT}`;

// ============================================================================
// WebSocket Client Helper
// ============================================================================

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

describe("E2E Approval Flow", () => {
  let server: GatewayServer;
  let desktopClient: TestWebSocketClient;

  beforeAll(async () => {
    server = createGatewayServer({ port: TEST_PORT, host: TEST_HOST });
    registerAllMethods(server);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(async () => {
    clearApprovalQueue();

    desktopClient = new TestWebSocketClient();
    await desktopClient.connect(WS_URL);
    await desktopClient.send("subscribe", { events: ["*"] });
  });

  afterEach(() => {
    desktopClient.disconnect();
  });

  // ==========================================================================
  // Approval Request Creation
  // ==========================================================================

  describe("Approval Request Creation", () => {
    it("should create approval request via internal API", () => {
      const request = createApprovalRequest(
        "action",
        "Delete production database?",
        {
          details: { action: "delete", target: "production_db" },
          sessionId: "test-session-1",
        }
      );

      expect(request.id).toBeDefined();
      expect(request.type).toBe("action");
      expect(request.status).toBe("pending");
      expect(request.message).toBe("Delete production database?");
      expect(request.details).toEqual({ action: "delete", target: "production_db" });
    });

    it("should appear in approval queue", async () => {
      createApprovalRequest("gate", "G-Sprint-47 approval needed");

      const result = await desktopClient.send("approval.list", {});
      const list = result as { requests: ApprovalRequest[]; pendingCount: number };

      expect(list.pendingCount).toBe(1);
      expect(list.requests.length).toBe(1);
      expect(list.requests[0]!.type).toBe("gate");
    });
  });

  // ==========================================================================
  // Desktop Lists Pending Approvals
  // ==========================================================================

  describe("Desktop Lists Pending Approvals", () => {
    it("should list all pending approvals", async () => {
      createApprovalRequest("gate", "G2 gate approval");
      createApprovalRequest("budget", "Increase daily budget");
      createApprovalRequest("action", "Deploy to production");

      const result = await desktopClient.send("approval.list", { status: "pending" });
      const list = result as { requests: ApprovalRequest[]; pendingCount: number };

      expect(list.pendingCount).toBe(3);
      expect(list.requests.length).toBe(3);
    });

    it("should filter by type", async () => {
      createApprovalRequest("gate", "Gate 1");
      createApprovalRequest("gate", "Gate 2");
      createApprovalRequest("budget", "Budget 1");

      const result = await desktopClient.send("approval.list", { type: "gate" });
      const list = result as { requests: ApprovalRequest[] };

      expect(list.requests.length).toBe(2);
      expect(list.requests.every((r) => r.type === "gate")).toBe(true);
    });

    it("should get pending count by type", async () => {
      createApprovalRequest("gate", "Gate approval");
      createApprovalRequest("gate", "Another gate");
      createApprovalRequest("budget", "Budget increase");
      createApprovalRequest("action", "Deploy");

      const result = await desktopClient.send("approval.pendingCount", {});
      const count = result as { count: number; byType: Record<string, number> };

      expect(count.count).toBe(4);
      expect(count.byType.gate).toBe(2);
      expect(count.byType.budget).toBe(1);
      expect(count.byType.action).toBe(1);
    });
  });

  // ==========================================================================
  // CEO Approves from Desktop
  // ==========================================================================

  describe("CEO Approves from Desktop", () => {
    it("should approve pending request", async () => {
      const request = createApprovalRequest("action", "Deploy to prod");

      const result = await desktopClient.send("approval.approve", {
        approvalId: request.id,
        notes: "Looks good, deploy!",
      });

      const approved = result as { success: boolean; request: ApprovalRequest };

      expect(approved.success).toBe(true);
      expect(approved.request.status).toBe("approved");
      expect(approved.request.notes).toBe("Looks good, deploy!");
      expect(approved.request.respondedAt).toBeDefined();
    });

    it("should reject pending request", async () => {
      const request = createApprovalRequest("action", "Delete all data");

      const result = await desktopClient.send("approval.reject", {
        approvalId: request.id,
        reason: "Too dangerous",
      });

      const rejected = result as { success: boolean; request: ApprovalRequest };

      expect(rejected.success).toBe(true);
      expect(rejected.request.status).toBe("rejected");
      expect(rejected.request.notes).toBe("Too dangerous");
    });

    it("should not allow double approval", async () => {
      const request = createApprovalRequest("action", "Single approve test");

      await desktopClient.send("approval.approve", { approvalId: request.id });

      await expect(
        desktopClient.send("approval.approve", { approvalId: request.id })
      ).rejects.toThrow("Request is not pending");
    });
  });

  // ==========================================================================
  // Agent Receives Approval Result
  // ==========================================================================

  describe("Agent Receives Approval Result", () => {
    it("should resolve waitForApproval when approved", async () => {
      const request = createApprovalRequest("escalation", "Need CEO decision");

      // Simulate agent waiting
      const waitPromise = waitForApproval(request.id, 5000);

      // Simulate CEO approving from Desktop
      await new Promise((r) => setTimeout(r, 100));
      await desktopClient.send("approval.approve", { approvalId: request.id });

      // Agent should receive result
      const result = await waitPromise;

      expect(result.status).toBe("approved");
    });

    it("should resolve waitForApproval when rejected", async () => {
      const request = createApprovalRequest("escalation", "CEO must decide");

      const waitPromise = waitForApproval(request.id, 5000);

      await new Promise((r) => setTimeout(r, 100));
      await desktopClient.send("approval.reject", {
        approvalId: request.id,
        reason: "Not now",
      });

      const result = await waitPromise;

      expect(result.status).toBe("rejected");
      expect(result.notes).toBe("Not now");
    });

    it("should expire if no response", async () => {
      const request = createApprovalRequest("action", "Will expire", {
        expiresInMs: 500,
      });

      const result = await waitForApproval(request.id, 1000);

      expect(result.status).toBe("expired");
    });
  });

  // ==========================================================================
  // Full Flow Simulation
  // ==========================================================================

  describe("Full Approval Flow", () => {
    it("should complete Agent → Gateway → Desktop → Gateway → Agent flow", async () => {
      // Step 1: Agent creates approval request
      const request = createApprovalRequest(
        "checkpoint",
        "Restore checkpoint from 2 hours ago?",
        {
          details: { checkpointId: "cp-123", timestamp: Date.now() - 2 * 60 * 60 * 1000 },
          sessionId: "autonomous-session",
        }
      );

      // Step 2: Agent starts waiting
      const agentWait = waitForApproval(request.id, 10000);

      // Step 3: Desktop polls for pending approvals (simulated)
      const pendingResult = await desktopClient.send("approval.pendingCount", {});
      expect((pendingResult as { count: number }).count).toBe(1);

      // Step 4: Desktop gets the request details
      const detailResult = await desktopClient.send("approval.get", {
        approvalId: request.id,
      });
      expect((detailResult as ApprovalRequest).message).toBe(
        "Restore checkpoint from 2 hours ago?"
      );

      // Step 5: CEO approves from Desktop
      const approveResult = await desktopClient.send("approval.approve", {
        approvalId: request.id,
        notes: "Yes, restore it",
      });
      expect((approveResult as { success: boolean }).success).toBe(true);

      // Step 6: Agent receives the result
      const agentResult = await agentWait;
      expect(agentResult.status).toBe("approved");
      expect(agentResult.notes).toBe("Yes, restore it");

      // Step 7: Queue is updated
      const queueAfter = await desktopClient.send("approval.pendingCount", {});
      expect((queueAfter as { count: number }).count).toBe(0);
    });

    it("should handle multiple concurrent approval requests", async () => {
      // Create multiple requests
      const requests = [
        createApprovalRequest("gate", "G3 approval"),
        createApprovalRequest("budget", "Increase limit to $20"),
        createApprovalRequest("action", "Run database migration"),
      ];

      // All agents start waiting
      const waits = requests.map((r) => waitForApproval(r.id, 10000));

      // Desktop approves first, rejects second, approves third
      await desktopClient.send("approval.approve", { approvalId: requests[0]!.id });
      await desktopClient.send("approval.reject", {
        approvalId: requests[1]!.id,
        reason: "Too much",
      });
      await desktopClient.send("approval.approve", { approvalId: requests[2]!.id });

      // All agents receive results
      const results = await Promise.all(waits);

      expect(results[0]!.status).toBe("approved");
      expect(results[1]!.status).toBe("rejected");
      expect(results[2]!.status).toBe("approved");
    });
  });
});
