/**
 * Gateway Checkpoint Methods Tests
 *
 * @module tests/gateway/methods/checkpoints
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
  clearCheckpoints,
  addTestCheckpoint,
  type GatewayCheckpointInfo,
} from "../../../src/gateway/index.js";

const getTestPort = () => 19100 + Math.floor(Math.random() * 100);

describe("Gateway Checkpoint Methods", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    clearCheckpoints();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    clearCheckpoints();
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

  describe("checkpoints.list", () => {
    it("should return empty list initially", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.list");
      const result = response.result as { checkpoints: unknown[]; total: number };

      expect(result.checkpoints).toEqual([]);
      expect(result.total).toBe(0);

      client.close();
    });

    it("should return created checkpoints", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create checkpoint
      await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "session-1",
        label: "Before refactor",
      });

      const response = await sendRequest(client, messages, "checkpoints.list");
      const result = response.result as { checkpoints: GatewayCheckpointInfo[]; total: number };

      expect(result.checkpoints).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.checkpoints[0].label).toBe("Before refactor");

      client.close();
    });

    it("should filter by sessionId", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create checkpoints for different sessions
      await sendRequest(client, messages, "checkpoints.create", { sessionId: "session-1" });
      await sendRequest(client, messages, "checkpoints.create", { sessionId: "session-2" });
      await sendRequest(client, messages, "checkpoints.create", { sessionId: "session-1" });

      const response = await sendRequest(client, messages, "checkpoints.list", {
        sessionId: "session-1",
      });
      const result = response.result as { checkpoints: GatewayCheckpointInfo[] };

      expect(result.checkpoints).toHaveLength(2);

      client.close();
    });
  });

  describe("checkpoints.get", () => {
    it("should throw error when checkpointId missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.get", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("checkpointId is required");

      client.close();
    });

    it("should return checkpoint by ID", async () => {
      const { client, messages } = await setupServerAndClient();

      const createResponse = await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "test-session",
        label: "Test checkpoint",
      });
      const checkpointId = (createResponse.result as GatewayCheckpointInfo).id;

      const response = await sendRequest(client, messages, "checkpoints.get", { checkpointId });

      const checkpoint = response.result as GatewayCheckpointInfo;
      expect(checkpoint.id).toBe(checkpointId);
      expect(checkpoint.sessionId).toBe("test-session");
      expect(checkpoint.label).toBe("Test checkpoint");

      client.close();
    });
  });

  describe("checkpoints.create", () => {
    it("should throw error when sessionId missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.create", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("sessionId is required");

      client.close();
    });

    it("should create checkpoint with all fields", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "my-session",
        label: "Important checkpoint",
        metadata: { reason: "Before big change" },
      });

      const checkpoint = response.result as GatewayCheckpointInfo;
      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.sessionId).toBe("my-session");
      expect(checkpoint.label).toBe("Important checkpoint");
      expect(checkpoint.metadata).toEqual({ reason: "Before big change" });
      expect(checkpoint.createdAt).toBeDefined();

      client.close();
    });
  });

  describe("checkpoints.restore", () => {
    it("should restore from checkpoint", async () => {
      const { client, messages } = await setupServerAndClient();

      const createResponse = await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "original-session",
      });
      const checkpointId = (createResponse.result as GatewayCheckpointInfo).id;

      const response = await sendRequest(client, messages, "checkpoints.restore", { checkpointId });
      const result = response.result as {
        success: boolean;
        checkpoint: GatewayCheckpointInfo;
        newSessionId: string;
      };

      expect(result.success).toBe(true);
      expect(result.checkpoint.id).toBe(checkpointId);
      expect(result.newSessionId).toBeDefined();

      client.close();
    });

    it("should throw error for non-existent checkpoint", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.restore", {
        checkpointId: "non-existent",
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("Checkpoint not found");

      client.close();
    });
  });

  describe("checkpoints.delete", () => {
    it("should delete checkpoint", async () => {
      const { client, messages } = await setupServerAndClient();

      const createResponse = await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "to-delete",
      });
      const checkpointId = (createResponse.result as GatewayCheckpointInfo).id;

      const response = await sendRequest(client, messages, "checkpoints.delete", { checkpointId });
      const result = response.result as { success: boolean; deletedId: string };

      expect(result.success).toBe(true);
      expect(result.deletedId).toBe(checkpointId);

      // Verify deleted
      const listResponse = await sendRequest(client, messages, "checkpoints.list");
      expect((listResponse.result as { checkpoints: unknown[] }).checkpoints).toHaveLength(0);

      client.close();
    });
  });

  describe("checkpoints.latest", () => {
    it("should return latest checkpoint for session", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create multiple checkpoints
      await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "session-x",
        label: "First",
      });
      await new Promise((r) => setTimeout(r, 10)); // Ensure different timestamps
      await sendRequest(client, messages, "checkpoints.create", {
        sessionId: "session-x",
        label: "Second",
      });

      const response = await sendRequest(client, messages, "checkpoints.latest", {
        sessionId: "session-x",
      });

      const checkpoint = response.result as GatewayCheckpointInfo;
      expect(checkpoint.label).toBe("Second");

      client.close();
    });

    it("should return null for session with no checkpoints", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "checkpoints.latest", {
        sessionId: "empty-session",
      });

      expect(response.result).toBeNull();

      client.close();
    });
  });
});
