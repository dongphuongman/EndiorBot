/**
 * Gateway Server Tests
 *
 * Tests for WebSocket gateway server.
 *
 * @module tests/gateway/server
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import {
  GatewayServer,
  createGatewayServer,
  type GatewayConfig,
  JSONRPC_VERSION,
} from "../../src/gateway/index.js";

// Use a random port for testing to avoid conflicts
const getTestPort = () => 18790 + Math.floor(Math.random() * 1000);

describe("GatewayServer", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe("Server Lifecycle", () => {
    it("should create server with default config", () => {
      server = createGatewayServer();
      expect(server).toBeInstanceOf(GatewayServer);
      expect(server.config.port).toBe(18790);
      expect(server.config.host).toBe("127.0.0.1");
      expect(server.isRunning).toBe(false);
    });

    it("should create server with custom config", () => {
      server = createGatewayServer({ port: testPort, host: "0.0.0.0" });
      expect(server.config.port).toBe(testPort);
      expect(server.config.host).toBe("0.0.0.0");
    });

    it("should start and stop server", async () => {
      server = createGatewayServer({ port: testPort });

      await server.start();
      expect(server.isRunning).toBe(true);
      expect(server.stats.activeConnections).toBe(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it("should throw if starting already running server", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      await expect(server.start()).rejects.toThrow("already running");
    });
  });

  describe("Client Connection", () => {
    it("should accept client connection", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise<void>((resolve) => client.on("open", resolve));

      expect(server.stats.activeConnections).toBe(1);
      expect(server.getClients()).toHaveLength(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.stats.activeConnections).toBe(0);
    });

    it("should send welcome message on connect", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);

      const welcome = await new Promise<Record<string, unknown>>((resolve) => {
        client.on("message", (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(welcome.jsonrpc).toBe(JSONRPC_VERSION);
      expect(welcome.method).toBe("welcome");
      expect(welcome.params).toHaveProperty("clientId");
      expect(welcome.params).toHaveProperty("serverVersion");

      client.close();
    });
  });

  describe("JSON-RPC Protocol", () => {
    it("should respond to system.ping", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      // Set up message handler BEFORE connection is established
      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Send ping request
      const request = {
        jsonrpc: JSONRPC_VERSION,
        method: "system.ping",
        id: 1,
      };
      client.send(JSON.stringify(request));

      // Wait for response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const response = messages[1];
      expect(response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(response.id).toBe(1);
      expect(response.result).toHaveProperty("pong");

      client.close();
    });

    it("should respond to system.version", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Send version request
      const request = {
        jsonrpc: JSONRPC_VERSION,
        method: "system.version",
        id: 2,
      };
      client.send(JSON.stringify(request));

      // Wait for response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const response = messages[1];
      expect(response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(response.id).toBe(2);
      expect(response.result).toHaveProperty("gateway");
      expect(response.result).toHaveProperty("endiorbot");
      expect(response.result).toHaveProperty("protocol");

      client.close();
    });

    it("should return error for invalid JSON", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Send invalid JSON
      client.send("not valid json");

      // Wait for response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const response = messages[1];
      expect(response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(response.error).toBeDefined();
      expect((response.error as Record<string, unknown>).code).toBe(-32700);

      client.close();
    });

    it("should return error for method not found", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Send unknown method request
      const request = {
        jsonrpc: JSONRPC_VERSION,
        method: "unknown.method",
        id: 3,
      };
      client.send(JSON.stringify(request));

      // Wait for response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const response = messages[1];
      expect(response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(response.id).toBe(3);
      expect(response.error).toBeDefined();
      expect((response.error as Record<string, unknown>).code).toBe(-32601);

      client.close();
    });
  });

  describe("Subscriptions", () => {
    it("should handle subscribe/unsubscribe", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Subscribe to events
      const subscribeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "subscribe",
        params: { events: ["budget.updated", "approval.pending"] },
        id: 4,
      };
      client.send(JSON.stringify(subscribeRequest));

      // Wait for subscribe response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const subscribeResponse = messages[1];
      expect(subscribeResponse.result).toHaveProperty("subscribed");
      expect((subscribeResponse.result as Record<string, unknown>).subscribed).toEqual([
        "budget.updated",
        "approval.pending",
      ]);

      // Unsubscribe from one event
      const unsubscribeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "unsubscribe",
        params: { events: ["budget.updated"] },
        id: 5,
      };
      client.send(JSON.stringify(unsubscribeRequest));

      // Wait for unsubscribe response
      while (messages.length < 3) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const unsubscribeResponse = messages[2];
      expect(unsubscribeResponse.result).toHaveProperty("subscribed");
      expect((unsubscribeResponse.result as Record<string, unknown>).subscribed).toEqual([
        "approval.pending",
      ]);

      client.close();
    });
  });

  describe("Event Broadcasting", () => {
    it("should broadcast events to subscribed clients", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Subscribe to budget.updated
      const subscribeRequest = {
        jsonrpc: JSONRPC_VERSION,
        method: "subscribe",
        params: { events: ["budget.updated"] },
        id: 6,
      };
      client.send(JSON.stringify(subscribeRequest));

      // Wait for subscribe response
      while (messages.length < 2) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Broadcast event
      server.broadcast({
        type: "budget.updated",
        timestamp: Date.now(),
        data: { sessionCost: 0.5, sessionLimit: 2.0 },
      });

      // Wait for event
      while (messages.length < 3) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const event = messages[2];
      expect(event.method).toBe("event");
      expect((event.params as Record<string, unknown>).type).toBe("budget.updated");

      client.close();
    });

    it("should not send events to unsubscribed clients", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      const messages: Record<string, unknown>[] = [];

      client.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      await new Promise<void>((resolve) => client.on("open", resolve));

      // Wait for welcome message
      while (messages.length < 1) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Do NOT subscribe to any events

      // Broadcast event
      server.broadcast({
        type: "budget.updated",
        timestamp: Date.now(),
        data: { sessionCost: 0.5, sessionLimit: 2.0 },
      });

      // Client should not receive event (wait 200ms to confirm)
      await new Promise((r) => setTimeout(r, 200));

      // Should only have the welcome message
      expect(messages.length).toBe(1);

      client.close();
    });
  });

  describe("Statistics", () => {
    it("should track connection statistics", async () => {
      server = createGatewayServer({ port: testPort });
      await server.start();

      expect(server.stats.totalConnections).toBe(0);
      expect(server.stats.activeConnections).toBe(0);

      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise<void>((resolve) => client.on("open", resolve));

      expect(server.stats.totalConnections).toBe(1);
      expect(server.stats.activeConnections).toBe(1);
      expect(server.stats.messagesReceived).toBe(0);
      expect(server.stats.messagesSent).toBe(1); // Welcome message

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(server.stats.totalConnections).toBe(1);
      expect(server.stats.activeConnections).toBe(0);
    });
  });
});

describe("Gateway Protocol", () => {
  describe("JSON-RPC Schema", () => {
    it("should validate JSON-RPC request", async () => {
      const { isJsonRpcRequest } = await import("../../src/gateway/protocol/schema.js");

      expect(
        isJsonRpcRequest({
          jsonrpc: "2.0",
          method: "test",
          id: 1,
        })
      ).toBe(true);

      expect(
        isJsonRpcRequest({
          jsonrpc: "2.0",
          method: "test",
          // no id = notification
        })
      ).toBe(false);

      expect(isJsonRpcRequest(null)).toBe(false);
      expect(isJsonRpcRequest("string")).toBe(false);
    });
  });

  describe("Error Factory", () => {
    it("should create error responses", async () => {
      const errors = await import("../../src/gateway/protocol/errors.js");

      const parseErr = errors.parseError();
      expect(parseErr.error.code).toBe(-32700);

      const methodErr = errors.methodNotFound(1, "test.method");
      expect(methodErr.error.code).toBe(-32601);
      expect(methodErr.error.message).toContain("test.method");

      const authErr = errors.unauthorized(2);
      expect(authErr.error.code).toBe(-32001);
    });
  });
});
