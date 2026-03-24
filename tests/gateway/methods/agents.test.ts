/**
 * Gateway Agent Methods Tests
 *
 * @module tests/gateway/methods/agents
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
  clearAgents,
  registerAgent,
  type AgentInfo,
  type RoutingDecision,
  type ConsultationResult,
} from "../../../src/gateway/index.js";

const getTestPort = () => 19200 + Math.floor(Math.random() * 100);

describe("Gateway Agent Methods", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    clearAgents();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    clearAgents();
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

  describe("agents.status", () => {
    it("should return empty agents list initially", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.status");
      const result = response.result as { agents: AgentInfo[]; activeCount: number };

      expect(result.agents).toEqual([]);
      expect(result.activeCount).toBe(0);

      client.close();
    });

    it("should return registered agents", async () => {
      // Register agent using internal API
      registerAgent({
        id: "agent-1",
        type: "coder",
        status: "working",
        currentTask: "Implementing feature",
        tokenUsage: { input: 100, output: 50 },
        startedAt: Date.now(),
      });

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.status");
      const result = response.result as { agents: AgentInfo[]; activeCount: number };

      expect(result.agents).toHaveLength(1);
      expect(result.activeCount).toBe(1);
      expect(result.agents[0].type).toBe("coder");
      expect(result.agents[0].currentTask).toBe("Implementing feature");

      client.close();
    });
  });

  describe("agents.get", () => {
    it("should throw error when agentId missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.get", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("agentId is required");

      client.close();
    });

    it("should return agent by ID", async () => {
      registerAgent({
        id: "agent-2",
        type: "reviewer",
        status: "idle",
        tokenUsage: { input: 0, output: 0 },
      });

      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.get", { agentId: "agent-2" });
      const agent = response.result as AgentInfo;

      expect(agent.id).toBe("agent-2");
      expect(agent.type).toBe("reviewer");
      expect(agent.status).toBe("idle");

      client.close();
    });
  });

  describe("agents.route", () => {
    it("should throw error when query missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.route", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("query is required");

      client.close();
    });

    it("should route architecture query to opus", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.route", {
        query: "Design a payment gateway architecture",
      });

      const decision = response.result as RoutingDecision;
      expect(decision.model).toContain("opus");
      expect(decision.confidence).toBeGreaterThan(0.8);
      expect(decision.reason).toBeDefined();

      client.close();
    });

    it("should route simple query to haiku", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.route", {
        query: "Fix typo",
        taskType: "simple",
      });

      const decision = response.result as RoutingDecision;
      expect(decision.model).toContain("haiku");
      expect(decision.confidence).toBeGreaterThan(0.9);

      client.close();
    });

    it("should route research to gemini", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.route", {
        query: "Research latest trends in AI",
      });

      const decision = response.result as RoutingDecision;
      expect(decision.provider).toBe("google");

      client.close();
    });

    it("should respect cost constraints", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.route", {
        query: "Complex architecture design",
        constraints: { maxCost: 0.001 },
      });

      const decision = response.result as RoutingDecision;
      expect(decision.model).toContain("haiku");
      expect(decision.reason).toContain("Cost constraint");

      client.close();
    });
  });

  describe("agents.consult", () => {
    it("should throw error when query missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.consult", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("query is required");

      client.close();
    });

    // Sprint 116 T5a: agents.consult now returns 501 (Zero Mock Policy)
    it("should return 501 not wired error", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.consult", {
        query: "What is the best approach for caching?",
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("not yet wired");

      client.close();
    });
  });

  describe("agents.routingStats", () => {
    it("should return routing statistics", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "agents.routingStats");
      const stats = response.result as {
        totalRouted: number;
        byProvider: Record<string, number>;
        avgConfidence: number;
      };

      expect(stats.totalRouted).toBeDefined();
      expect(stats.byProvider).toBeDefined();
      expect(stats.avgConfidence).toBeDefined();

      client.close();
    });
  });
});
