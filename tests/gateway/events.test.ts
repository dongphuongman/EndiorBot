/**
 * Gateway Events Tests
 *
 * @module tests/gateway/events
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 44 Day 5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import {
  GatewayServer,
  createGatewayServer,
  setGatewayServer,
  getGatewayServer,
  hasGatewayServer,
  emitEvent,
  recordCostWithEvents,
  resetBudgetWarnings,
  createApprovalRequestWithEvents,
  emitApprovalResolved,
  emitSessionStarted,
  emitSessionEnded,
  emitAgentStatus,
  emitGateStatus,
  emitNotification,
  clearEventState,
  clearApprovalQueue,
  resetBudgetState,
  type GatewayEvent,
} from "../../src/gateway/index.js";

const getTestPort = () => 19300 + Math.floor(Math.random() * 100);

describe("Gateway Events", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    clearEventState();
    clearApprovalQueue();
    resetBudgetState();
    resetBudgetWarnings();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    clearEventState();
    clearApprovalQueue();
    resetBudgetState();
  });

  describe("Gateway Server Management", () => {
    it("should set and get gateway server", () => {
      server = createGatewayServer({ port: testPort });

      expect(getGatewayServer()).toBeNull();
      expect(hasGatewayServer()).toBe(false);

      setGatewayServer(server);

      expect(getGatewayServer()).toBe(server);
    });

    it("should report hasGatewayServer as false when server not running", () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);

      expect(hasGatewayServer()).toBe(false); // Not started yet
    });

    it("should report hasGatewayServer as true when server running", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      expect(hasGatewayServer()).toBe(true);
    });

    it("should clear server on clearEventState", () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);

      clearEventState();

      expect(getGatewayServer()).toBeNull();
    });
  });

  describe("Event Emission", () => {
    it("should not throw when no server available", () => {
      expect(() => {
        emitEvent("notification", { message: "test" });
      }).not.toThrow();
    });

    it("should broadcast events to subscribed clients", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe to notifications
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["notification"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      // Emit notification
      emitEvent("notification", {
        title: "Test",
        message: "Hello",
        level: "info",
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      expect(receivedEvents[0].type).toBe("notification");
      expect(receivedEvents[0].data).toEqual({
        title: "Test",
        message: "Hello",
        level: "info",
      });

      client.close();
    });
  });

  describe("Budget Event Wiring", () => {
    it("should emit budget.updated on recordCostWithEvents", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe to budget events
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["budget.updated", "budget.warning"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      // Record a cost
      recordCostWithEvents({
        provider: "anthropic",
        model: "claude-3-opus",
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.05,
      });

      await new Promise((r) => setTimeout(r, 50));

      const budgetEvent = receivedEvents.find((e) => e.type === "budget.updated");
      expect(budgetEvent).toBeDefined();
      expect(budgetEvent?.data).toHaveProperty("sessionCost", 0.05);

      client.close();
    });

    it("should emit budget.warning when threshold crossed", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe to budget events
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["budget.updated", "budget.warning"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      // Record cost that exceeds 80% of session budget (default: $2)
      recordCostWithEvents({
        provider: "anthropic",
        model: "claude-3-opus",
        inputTokens: 10000,
        outputTokens: 5000,
        cost: 1.70, // 85% of $2
      });

      await new Promise((r) => setTimeout(r, 50));

      const warningEvent = receivedEvents.find((e) => e.type === "budget.warning");
      expect(warningEvent).toBeDefined();
      expect(warningEvent?.data).toHaveProperty("scope", "session");
      expect(warningEvent?.data).toHaveProperty("level", "warning");

      client.close();
    });
  });

  describe("Approval Event Wiring", () => {
    it("should emit approval.pending on createApprovalRequestWithEvents", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe to approval events
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["approval.pending", "approval.resolved"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      // Create approval request
      const request = createApprovalRequestWithEvents("gate", "G3 approval needed", {
        details: { feature: "payment-integration" },
      });

      await new Promise((r) => setTimeout(r, 50));

      const pendingEvent = receivedEvents.find((e) => e.type === "approval.pending");
      expect(pendingEvent).toBeDefined();
      expect(pendingEvent?.data).toHaveProperty("id", request.id);
      expect(pendingEvent?.data).toHaveProperty("type", "gate");
      expect(pendingEvent?.data).toHaveProperty("message", "G3 approval needed");

      client.close();
    });

    it("should emit approval.resolved on emitApprovalResolved", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe to approval events
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["approval.pending", "approval.resolved"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      // Create and resolve approval
      const request = createApprovalRequestWithEvents("budget", "Budget increase needed");
      request.status = "approved";
      request.respondedAt = Date.now();
      request.respondedBy = "ceo";

      emitApprovalResolved(request);

      await new Promise((r) => setTimeout(r, 50));

      const resolvedEvent = receivedEvents.find((e) => e.type === "approval.resolved");
      expect(resolvedEvent).toBeDefined();
      expect(resolvedEvent?.data).toHaveProperty("id", request.id);
      expect(resolvedEvent?.data).toHaveProperty("status", "approved");
      expect(resolvedEvent?.data).toHaveProperty("resolvedBy", "ceo");

      client.close();
    });
  });

  describe("Session Event Helpers", () => {
    it("should emit session.started", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      // Subscribe
      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["session.started"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      emitSessionStarted("session-123", "Bflow");

      await new Promise((r) => setTimeout(r, 50));

      const event = receivedEvents.find((e) => e.type === "session.started");
      expect(event).toBeDefined();
      expect(event?.data).toHaveProperty("sessionId", "session-123");
      expect(event?.data).toHaveProperty("projectName", "Bflow");

      client.close();
    });

    it("should emit session.ended", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["session.ended"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      emitSessionEnded("session-123", "completed");

      await new Promise((r) => setTimeout(r, 50));

      const event = receivedEvents.find((e) => e.type === "session.ended");
      expect(event).toBeDefined();
      expect(event?.data).toHaveProperty("sessionId", "session-123");
      expect(event?.data).toHaveProperty("reason", "completed");

      client.close();
    });
  });

  describe("Agent Event Helpers", () => {
    it("should emit agent.status", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["agent.status"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      emitAgentStatus("coder-agent", "working", "Implementing feature");

      await new Promise((r) => setTimeout(r, 50));

      const event = receivedEvents.find((e) => e.type === "agent.status");
      expect(event).toBeDefined();
      expect(event?.data).toHaveProperty("agentId", "coder-agent");
      expect(event?.data).toHaveProperty("status", "working");
      expect(event?.data).toHaveProperty("currentTask", "Implementing feature");

      client.close();
    });
  });

  describe("Gate Event Helpers", () => {
    it("should emit gate.status", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["gate.status"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      emitGateStatus("G3", "passed", "AR-457");

      await new Promise((r) => setTimeout(r, 50));

      const event = receivedEvents.find((e) => e.type === "gate.status");
      expect(event).toBeDefined();
      expect(event?.data).toHaveProperty("gateId", "G3");
      expect(event?.data).toHaveProperty("status", "passed");
      expect(event?.data).toHaveProperty("featureId", "AR-457");

      client.close();
    });
  });

  describe("Notification Helper", () => {
    it("should emit notification", async () => {
      server = createGatewayServer({ port: testPort });
      setGatewayServer(server);
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      const receivedEvents: GatewayEvent[] = [];

      client.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "event") {
          receivedEvents.push(msg.params);
        }
      });

      await new Promise<void>((resolve) => client.on("open", resolve));
      await new Promise((r) => setTimeout(r, 50));

      client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          params: { events: ["notification"] },
          id: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 50));

      emitNotification("Build Complete", "All tests passed", "info");

      await new Promise((r) => setTimeout(r, 50));

      const event = receivedEvents.find((e) => e.type === "notification");
      expect(event).toBeDefined();
      expect(event?.data).toHaveProperty("title", "Build Complete");
      expect(event?.data).toHaveProperty("message", "All tests passed");
      expect(event?.data).toHaveProperty("level", "info");

      client.close();
    });
  });
});
