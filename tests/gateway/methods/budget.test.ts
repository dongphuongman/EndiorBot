/**
 * Gateway Budget Methods Tests
 *
 * @module tests/gateway/methods/budget
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
  resetBudgetState,
  recordCost,
  type BudgetStatus,
} from "../../../src/gateway/index.js";

const getTestPort = () => 18900 + Math.floor(Math.random() * 100);

describe("Gateway Budget Methods", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    resetBudgetState();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    resetBudgetState();
  });

  async function setupServerAndClient(): Promise<{
    client: WebSocket;
    messages: Record<string, unknown>[];
  }> {
    server = createGatewayServer({ port: testPort });
    registerAllMethods(server);
    await server.start();

    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
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

  describe("budget.get", () => {
    it("should return initial budget status", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "budget.get");
      const budget = response.result as BudgetStatus;

      expect(budget.session).toBeDefined();
      expect(budget.session.costSoFar).toBe(0);
      expect(budget.session.limit).toBe(2.0);
      expect(budget.daily).toBeDefined();
      expect(budget.monthly).toBeDefined();

      client.close();
    });

    it("should reflect recorded costs", async () => {
      const { client, messages } = await setupServerAndClient();

      // Record a cost
      recordCost({
        provider: "anthropic",
        model: "claude-3-opus",
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.05,
      });

      const response = await sendRequest(client, messages, "budget.get");
      const budget = response.result as BudgetStatus;

      expect(budget.session.costSoFar).toBe(0.05);
      expect(budget.daily.costSoFar).toBe(0.05);
      expect(budget.monthly.costSoFar).toBe(0.05);

      client.close();
    });
  });

  describe("budget.remaining", () => {
    it("should return remaining budget", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "budget.remaining");
      const remaining = response.result as { session: number; daily: number; monthly: number };

      expect(remaining.session).toBe(2.0);
      expect(remaining.daily).toBe(10.0);
      expect(remaining.monthly).toBe(100.0);

      client.close();
    });

    it("should decrease after cost recorded", async () => {
      const { client, messages } = await setupServerAndClient();

      recordCost({
        provider: "anthropic",
        model: "claude-3-sonnet",
        inputTokens: 500,
        outputTokens: 200,
        cost: 0.5,
      });

      const response = await sendRequest(client, messages, "budget.remaining");
      const remaining = response.result as { session: number; daily: number; monthly: number };

      expect(remaining.session).toBe(1.5);
      expect(remaining.daily).toBe(9.5);
      expect(remaining.monthly).toBe(99.5);

      client.close();
    });
  });

  describe("budget.setLimits", () => {
    it("should update budget limits", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "budget.setLimits", {
        session: 5.0,
        daily: 20.0,
        monthly: 200.0,
      });

      expect((response.result as { success: boolean }).success).toBe(true);

      const budget = (response.result as { budget: BudgetStatus }).budget;
      expect(budget.session.limit).toBe(5.0);
      expect(budget.daily.limit).toBe(20.0);
      expect(budget.monthly.limit).toBe(200.0);

      client.close();
    });

    it("should allow partial updates", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "budget.setLimits", {
        session: 3.0,
      });

      const budget = (response.result as { budget: BudgetStatus }).budget;
      expect(budget.session.limit).toBe(3.0);
      expect(budget.daily.limit).toBe(10.0); // unchanged

      client.close();
    });
  });

  describe("budget.resetSession", () => {
    it("should reset session cost to zero", async () => {
      const { client, messages } = await setupServerAndClient();

      // Record cost
      recordCost({
        provider: "anthropic",
        model: "claude-3-opus",
        inputTokens: 1000,
        outputTokens: 500,
        cost: 1.0,
      });

      // Reset session
      const response = await sendRequest(client, messages, "budget.resetSession");
      const budget = (response.result as { budget: BudgetStatus }).budget;

      expect(budget.session.costSoFar).toBe(0);
      expect(budget.daily.costSoFar).toBe(1.0); // daily not reset

      client.close();
    });
  });

  describe("budget.history", () => {
    it("should return empty history initially", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "budget.history");
      const result = response.result as { entries: unknown[]; total: number };

      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);

      client.close();
    });

    it("should return recorded cost entries", async () => {
      const { client, messages } = await setupServerAndClient();

      recordCost({
        provider: "anthropic",
        model: "claude-3-opus",
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
      });

      const response = await sendRequest(client, messages, "budget.history");
      const result = response.result as { entries: unknown[]; total: number };

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);

      client.close();
    });
  });
});
