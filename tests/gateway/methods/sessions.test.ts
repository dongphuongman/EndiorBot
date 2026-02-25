/**
 * Gateway Sessions Methods Tests
 *
 * @module tests/gateway/methods/sessions
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
  clearSessions,
  addTestSession,
  type SessionInfo,
} from "../../../src/gateway/index.js";

const getTestPort = () => 18800 + Math.floor(Math.random() * 100);

describe("Gateway Sessions Methods", () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    clearSessions();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    clearSessions();
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

    // Wait for welcome
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

  describe("sessions.list", () => {
    it("should return empty list initially", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "sessions.list");

      expect(response.result).toHaveProperty("sessions");
      expect((response.result as { sessions: unknown[] }).sessions).toEqual([]);

      client.close();
    });

    it("should return sessions after create", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create a session
      await sendRequest(client, messages, "sessions.create", {
        projectId: "test-project",
      });

      const response = await sendRequest(client, messages, "sessions.list");
      const sessions = (response.result as { sessions: SessionInfo[] }).sessions;

      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectId).toBe("test-project");
      expect(sessions[0].status).toBe("active");

      client.close();
    });
  });

  describe("sessions.get", () => {
    it("should throw error when sessionId missing", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "sessions.get", {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("sessionId is required");

      client.close();
    });

    it("should throw error for non-existent session", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "sessions.get", {
        sessionId: "non-existent",
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("Session not found");

      client.close();
    });

    it("should return session by ID", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create session
      const createResponse = await sendRequest(client, messages, "sessions.create", {
        projectId: "test",
      });
      const sessionId = (createResponse.result as SessionInfo).id;

      const response = await sendRequest(client, messages, "sessions.get", {
        sessionId,
      });

      expect(response.result).toHaveProperty("id", sessionId);
      expect(response.result).toHaveProperty("status", "active");

      client.close();
    });
  });

  describe("sessions.create", () => {
    it("should create session with projectId", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "sessions.create", {
        projectId: "my-project",
        projectName: "My Project",
      });

      const session = response.result as SessionInfo;
      expect(session.id).toBeDefined();
      expect(session.status).toBe("active");
      expect(session.projectId).toBe("my-project");
      expect(session.projectName).toBe("My Project");
      expect(session.tokenUsage).toEqual({ input: 0, output: 0 });

      client.close();
    });

    it("should create session without optional params", async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, "sessions.create", {});

      const session = response.result as SessionInfo;
      expect(session.id).toBeDefined();
      expect(session.status).toBe("active");
      expect(session.projectId).toBeUndefined();

      client.close();
    });
  });

  describe("sessions.pause / sessions.resume", () => {
    it("should pause and resume session", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create session
      const createResponse = await sendRequest(client, messages, "sessions.create", {});
      const sessionId = (createResponse.result as SessionInfo).id;

      // Pause
      const pauseResponse = await sendRequest(client, messages, "sessions.pause", {
        sessionId,
      });
      expect((pauseResponse.result as { success: boolean }).success).toBe(true);
      expect((pauseResponse.result as { session: SessionInfo }).session.status).toBe("paused");

      // Resume
      const resumeResponse = await sendRequest(client, messages, "sessions.resume", {
        sessionId,
      });
      expect((resumeResponse.result as { success: boolean }).success).toBe(true);
      expect((resumeResponse.result as { session: SessionInfo }).session.status).toBe("active");

      client.close();
    });

    it("should throw error when resuming non-paused session", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create active session
      const createResponse = await sendRequest(client, messages, "sessions.create", {});
      const sessionId = (createResponse.result as SessionInfo).id;

      // Try to resume active session
      const response = await sendRequest(client, messages, "sessions.resume", {
        sessionId,
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain("not paused");

      client.close();
    });
  });

  describe("sessions.status", () => {
    it("should return status counts", async () => {
      const { client, messages } = await setupServerAndClient();

      // Create multiple sessions
      await sendRequest(client, messages, "sessions.create", {});
      const sess2 = await sendRequest(client, messages, "sessions.create", {});
      await sendRequest(client, messages, "sessions.pause", {
        sessionId: (sess2.result as SessionInfo).id,
      });

      const response = await sendRequest(client, messages, "sessions.status", {});
      const status = response.result as { activeCount: number; pausedCount: number };

      expect(status.activeCount).toBe(1);
      expect(status.pausedCount).toBe(1);

      client.close();
    });
  });
});
