/**
 * System Health Gateway Method Tests
 *
 * Tests for the system.health gateway method.
 *
 * @module tests/gateway/system-health.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import {
  GatewayServer,
  createGatewayServer,
} from "../../src/gateway/index.js";

// Use a random port for testing to avoid conflicts
const getTestPort = () => 18790 + Math.floor(Math.random() * 1000);

describe("system.health Gateway Method", () => {
  let server: GatewayServer;
  let client: WebSocket;
  let testPort: number;

  beforeEach(async () => {
    testPort = getTestPort();
    server = createGatewayServer({
      port: testPort,
      host: "127.0.0.1",
      authEnabled: false,
    });
    await server.start();

    // Connect client - set up message handler BEFORE open to catch welcome
    client = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);

    const welcomePromise = new Promise<void>((resolve) => {
      client.once("message", () => resolve());
    });

    await new Promise<void>((resolve) => client.on("open", resolve));
    await welcomePromise;
  });

  afterEach(async () => {
    if (client?.readyState === WebSocket.OPEN) {
      client.close();
    }
    if (server?.isRunning) {
      await server.stop();
    }
  });

  function sendRequest(
    method: string,
    params?: unknown
  ): Promise<{ result?: unknown; error?: unknown }> {
    return new Promise((resolve) => {
      const id = Date.now();
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const handler = (data: WebSocket.RawData) => {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          client.off("message", handler);
          resolve(response);
        }
      };

      client.on("message", handler);
      client.send(JSON.stringify(request));
    });
  }

  it("should return health report with all required fields", async () => {
    const response = await sendRequest("system.health");

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();

    const report = response.result as Record<string, unknown>;

    // Check all top-level fields
    expect(report).toHaveProperty("status");
    expect(report).toHaveProperty("uptime");
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("providers");
    expect(report).toHaveProperty("brain");
    expect(report).toHaveProperty("gateway");
    expect(report).toHaveProperty("memory");
  });

  it("should return valid status value", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as { status: string };

    expect(["healthy", "degraded", "unhealthy"]).toContain(report.status);
  });

  it("should return non-negative uptime", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as { uptime: number };

    expect(report.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should return valid timestamp", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as { timestamp: string };

    expect(() => new Date(report.timestamp)).not.toThrow();
  });

  it("should return gateway metrics including active connections", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as {
      gateway: {
        activeConnections: number;
        methodCount: number;
        messagesReceived: number;
        messagesSent: number;
      };
    };

    // At least 1 connection (our test client)
    expect(report.gateway.activeConnections).toBeGreaterThanOrEqual(1);
    // Should have at least builtin methods
    expect(report.gateway.methodCount).toBeGreaterThanOrEqual(6);
    expect(typeof report.gateway.messagesReceived).toBe("number");
    expect(typeof report.gateway.messagesSent).toBe("number");
  });

  it("should return memory metrics", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as {
      memory: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
      };
    };

    expect(report.memory.heapUsed).toBeGreaterThan(0);
    expect(report.memory.heapTotal).toBeGreaterThan(0);
    expect(report.memory.rss).toBeGreaterThan(0);
    expect(typeof report.memory.external).toBe("number");
  });

  it("should return brain metrics", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as {
      brain: {
        initialized: boolean;
        layerCounts: {
          events: number;
          patterns: number;
          structures: number;
          mentalModels: number;
        };
      };
    };

    expect(typeof report.brain.initialized).toBe("boolean");
    expect(typeof report.brain.layerCounts.events).toBe("number");
    expect(typeof report.brain.layerCounts.patterns).toBe("number");
    expect(typeof report.brain.layerCounts.structures).toBe("number");
    expect(typeof report.brain.layerCounts.mentalModels).toBe("number");
  });

  it("should return providers as object", async () => {
    const response = await sendRequest("system.health");
    const report = response.result as { providers: Record<string, unknown> };

    expect(typeof report.providers).toBe("object");
    expect(report.providers).not.toBeNull();
  });

  it("should accept checkProviders parameter", async () => {
    const response = await sendRequest("system.health", {
      checkProviders: false,
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
  });

  it("should accept providerCheckTimeout parameter", async () => {
    const response = await sendRequest("system.health", {
      checkProviders: true,
      providerCheckTimeout: 1000,
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
  });
});
