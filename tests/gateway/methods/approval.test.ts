/**
 * Gateway Approval Methods Tests
 *
 * @module tests/gateway/methods/approval
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import {
  GatewayServer,
  createGatewayServer,
  JSONRPC_VERSION,
  registerAllMethods,
  clearApprovalQueue,
  createGatewayApprovalRequest,
  type GatewayApprovalRequest,
} from "../../../src/gateway/index.js";

const getTestPort = () => 19000 + Math.floor(Math.random() * 100);

describe("Gateway Approval Methods", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    clearApprovalQueue();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    clearApprovalQueue();
  });

  async function setupServerAndClient(): Promise<{
    client: WebSocket;
    messages: Record<string, unknown>[];
  }> {
    server = createGatewayServer({ port: testPort });
    registerAllMethods(server);
    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
    const messages: Record<string, unknown>[] = [];

    client.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve) => client.on("open", resolve));

    while (messages.length < 1) {
      await new Promise((r) => setTimeout(r, 10));
    }

    return { client, messages };
  }

  async function sendRequest(
    client: WebSocket,
    messages: Record<string, unknown>[],
    method: string,
    params?: unknown
  ): Promise<Record<string, unknown>> {
    const startLen = messages.length;
    const request = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
      id: Date.now(),
    };
    client.send(JSON.stringify(request));

    while (messages.length <= startLen) {
      await new Promise((r) => setTimeout(r, 10));
    }

    return messages[messages.length - 1];
  }

  describe("approval.list", () => {
    it("should return empty list initially", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.list");
      const result = response.result as { requests: unknown[]; pendingCount: number };

      expect(result.requests).toEqual([]);
      expect(result.pendingCount).toBe(0);

      client.close();
    });

    it("should return created approval requests", async () => {
      // Create request using internal API
      createGatewayApprovalRequest("gate", "G2 approval needed for PR-123");

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.list");
      const result = response.result as { requests: GatewayApprovalRequest[]; pendingCount: number };

      expect(result.requests).toHaveLength(1);
      expect(result.pendingCount).toBe(1);
      expect(result.requests[0].type).toBe("gate");
      expect(result.requests[0].status).toBe("pending");

      client.close();
    });

    it("should filter by status", async () => {
      // Create multiple requests
      const req1 = createGatewayApprovalRequest("gate", "Request 1");
      createGatewayApprovalRequest("budget", "Request 2");

      // Approve first one (via internal)
      const { client, messages } = await setupServerAndClient();
      await sendRequest(client, messages, "approval.approve", { approvalId: req1.id });

      // List only pending
      const response = await sendRequest(client, messages, "approval.list", { status: "pending" });
      const result = response.result as { requests: GatewayApprovalRequest[] };

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].type).toBe("budget");

      client.close();
    });
  });

  describe("approval.get", () => {
    it("should throw error when approvalId missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.get", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("approvalId is required");

      client.close();
    });

    it("should return approval request by ID", async () => {
      const created = createGatewayApprovalRequest("action", "Delete file confirmation");

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.get", {
        approvalId: created.id,
      });

      const request = response.result as GatewayApprovalRequest;
      expect(request.id).toBe(created.id);
      expect(request.type).toBe("action");
      expect(request.message).toBe("Delete file confirmation");

      client.close();
    });
  });

  describe("approval.approve", () => {
    it("should approve pending request", async () => {
      const created = createGatewayApprovalRequest("gate", "G3 gate approval");

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.approve", {
        approvalId: created.id,
        notes: "Approved by CEO",
      });

      const result = response.result as { success: boolean; request: GatewayApprovalRequest };
      expect(result.success).toBe(true);
      expect(result.request.status).toBe("approved");
      expect(result.request.notes).toBe("Approved by CEO");
      expect(result.request.respondedAt).toBeDefined();

      client.close();
    });

    it("should throw error for non-pending request", async () => {
      const created = createGatewayApprovalRequest("budget", "Budget increase");

      const { client, messages } = await setupServerAndClient();

      // Approve first
      await sendRequest(client, messages, "approval.approve", { approvalId: created.id });

      // Try to approve again
      const response = await sendRequest(client, messages, "approval.approve", {
        approvalId: created.id,
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("not pending");

      client.close();
    });
  });

  describe("approval.reject", () => {
    it("should reject pending request", async () => {
      const created = createGatewayApprovalRequest("escalation", "Agent needs help");

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.reject", {
        approvalId: created.id,
        reason: "Not needed anymore",
      });

      const result = response.result as { success: boolean; request: GatewayApprovalRequest };
      expect(result.success).toBe(true);
      expect(result.request.status).toBe("rejected");
      expect(result.request.notes).toBe("Not needed anymore");

      client.close();
    });
  });

  describe("approval.pendingCount", () => {
    it("should return count by type", async () => {
      createGatewayApprovalRequest("gate", "Gate 1");
      createGatewayApprovalRequest("gate", "Gate 2");
      createGatewayApprovalRequest("budget", "Budget 1");

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.pendingCount");
      const result = response.result as { count: number; byType: Record<string, number> };

      expect(result.count).toBe(3);
      expect(result.byType.gate).toBe(2);
      expect(result.byType.budget).toBe(1);

      client.close();
    });
  });

  describe("Expiry logic", () => {
    it("should mark expired requests", async () => {
      // Create with very short expiry
      createGatewayApprovalRequest("action", "Quick action", { expiresInMs: 1 });

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 50));

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "approval.list");
      const result = response.result as { requests: GatewayApprovalRequest[] };

      expect(result.requests[0].status).toBe("expired");

      client.close();
    });
  });
});
