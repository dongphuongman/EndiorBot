/**
 * Gateway Tools Methods Tests
 * Sprint 50 - Day 7-8 - Gateway Integration
 *
 * @module tests/gateway/methods/tools
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 50 Day 7-8
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import {
  GatewayServer,
  createGatewayServer,
  JSONRPC_VERSION,
  registerAllMethods,
  resetToolsState,
  type ToolsDiscoverResult,
  type ToolsExecuteResult,
  type ToolsApproveResult,
  type ToolsCancelResult,
  type ToolsStatusResult,
  type ToolsConnectionsResult,
  type ToolsDryRunResult,
} from '../../../src/gateway/index.js';

const getTestPort = () => 19100 + Math.floor(Math.random() * 900);
const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

describe('Gateway Tools Methods', () => {
  let server: GatewayServer;
  let testPort: number;

  beforeEach(() => {
    testPort = getTestPort();
    resetToolsState();
  });

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
    resetToolsState();
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

    client.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve) => client.on('open', resolve));

    // Wait for welcome message
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

    // Wait for response
    while (messages.length <= startLen) {
      await new Promise((r) => setTimeout(r, 10));
    }

    return messages[messages.length - 1];
  }

  // ==========================================================================
  // tools.discover
  // ==========================================================================

  describe('tools.discover', () => {
    it('should return Phase 1 tools', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.discover', {
        principal_id: validPrincipalId,
      });
      const result = response.result as ToolsDiscoverResult;

      expect(result.tools).toBeDefined();
      expect(result.total).toBe(10);
      expect(result.tools.map((t) => t.name)).toContain('github.get_repo');
      expect(result.tools.map((t) => t.name)).toContain('gmail.send_message');

      client.close();
    });

    it('should require principal_id', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.discover', {});

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('principal_id');

      client.close();
    });
  });

  // ==========================================================================
  // tools.execute
  // ==========================================================================

  describe('tools.execute', () => {
    it('should auto-execute READ tools', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'github.get_repo',
        arguments: { owner: 'test', repo: 'my-repo' },
      });
      const result = response.result as ToolsExecuteResult;

      expect(result.status).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result?.success).toBe(true);

      client.close();
    });

    it('should require approval for WRITE tools', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'github.create_issue',
        arguments: { owner: 'test', repo: 'my-repo', title: 'Test Issue' },
      });
      const result = response.result as ToolsExecuteResult;

      expect(result.status).toBe('pending_approval');
      expect(result.approval_token).toBeDefined();
      expect(result.expires_at).toBeDefined();

      client.close();
    });

    it('should deny non-whitelisted tools', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'unknown.dangerous_tool',
        arguments: {},
      });
      const result = response.result as ToolsExecuteResult;

      expect(result.status).toBe('denied');
      expect(result.message).toContain('denied');

      client.close();
    });

    it('should execute with approval token', async () => {
      const { client, messages } = await setupServerAndClient();

      // First, request WRITE tool (gets approval token)
      const request1 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'gmail.send_message',
        arguments: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
      });
      const result1 = request1.result as ToolsExecuteResult;
      expect(result1.status).toBe('pending_approval');
      const approvalToken = result1.approval_token;

      // Execute with approval token
      const request2 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'gmail.send_message',
        arguments: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
        approval_token: approvalToken,
      });
      const result2 = request2.result as ToolsExecuteResult;

      expect(result2.status).toBe('success');
      expect(result2.result?.success).toBe(true);

      client.close();
    });

    it('should require tool_name', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        arguments: {},
      });

      expect(response.error).toBeDefined();

      client.close();
    });
  });

  // ==========================================================================
  // tools.approve
  // ==========================================================================

  describe('tools.approve', () => {
    it('should execute pending approval', async () => {
      const { client, messages } = await setupServerAndClient();

      // First, request WRITE tool
      const request1 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'slack.send_message',
        arguments: { channel: 'C123', text: 'Hello' },
      });
      const result1 = request1.result as ToolsExecuteResult;
      const approvalToken = result1.approval_token;

      // Approve
      const request2 = await sendRequest(client, messages, 'tools.approve', {
        approval_token: approvalToken,
      });
      const result2 = request2.result as ToolsApproveResult;

      expect(result2.result).toBeDefined();
      expect(result2.result.success).toBe(true);
      expect(result2.executed_at).toBeDefined();

      client.close();
    });

    it('should reject invalid token', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.approve', {
        approval_token: 'invalid-token',
      });

      expect(response.error).toBeDefined();

      client.close();
    });

    it('should reject already-used token', async () => {
      const { client, messages } = await setupServerAndClient();

      // Get approval token
      const request1 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'slack.send_message',
        arguments: { channel: 'C123', text: 'Hello' },
      });
      const approvalToken = (request1.result as ToolsExecuteResult).approval_token;

      // First use
      await sendRequest(client, messages, 'tools.approve', {
        approval_token: approvalToken,
      });

      // Second use should fail
      const response = await sendRequest(client, messages, 'tools.approve', {
        approval_token: approvalToken,
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('used');

      client.close();
    });
  });

  // ==========================================================================
  // tools.cancel
  // ==========================================================================

  describe('tools.cancel', () => {
    it('should cancel pending approval', async () => {
      const { client, messages } = await setupServerAndClient();

      // Get approval token
      const request1 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'github.create_issue',
        arguments: { owner: 'test', repo: 'repo', title: 'Test' },
      });
      const approvalToken = (request1.result as ToolsExecuteResult).approval_token;

      // Cancel
      const response = await sendRequest(client, messages, 'tools.cancel', {
        approval_token: approvalToken,
      });
      const result = response.result as ToolsCancelResult;

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');

      client.close();
    });

    it('should return false for non-existent token', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.cancel', {
        approval_token: 'non-existent-token',
      });
      const result = response.result as ToolsCancelResult;

      expect(result.success).toBe(false);

      client.close();
    });
  });

  // ==========================================================================
  // tools.status
  // ==========================================================================

  describe('tools.status', () => {
    it('should return token status', async () => {
      const { client, messages } = await setupServerAndClient();

      // Get approval token
      const request1 = await sendRequest(client, messages, 'tools.execute', {
        principal_id: validPrincipalId,
        tool_name: 'google_calendar.create_event',
        arguments: {
          calendar_id: 'primary',
          summary: 'Test',
          start: '2026-03-01T10:00:00Z',
          end: '2026-03-01T11:00:00Z',
        },
      });
      const approvalToken = (request1.result as ToolsExecuteResult).approval_token;

      // Check status
      const response = await sendRequest(client, messages, 'tools.status', {
        approval_token: approvalToken,
      });
      const result = response.result as ToolsStatusResult;

      expect(result.token).toBeDefined();
      expect(result.token?.used).toBe(false);
      expect(result.pending_call).toBeDefined();
      expect(result.pending_call?.name).toBe('google_calendar.create_event');

      client.close();
    });

    it('should return null for non-existent token', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.status', {
        approval_token: 'non-existent',
      });
      const result = response.result as ToolsStatusResult;

      expect(result.token).toBeNull();
      expect(result.pending_call).toBeNull();

      client.close();
    });
  });

  // ==========================================================================
  // tools.connections
  // ==========================================================================

  describe('tools.connections', () => {
    it('should return empty connections initially', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.connections', {
        principal_id: validPrincipalId,
      });
      const result = response.result as ToolsConnectionsResult;

      expect(result.connections).toEqual([]);
      expect(result.total).toBe(0);

      client.close();
    });

    it('should require principal_id', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.connections', {});

      expect(response.error).toBeDefined();

      client.close();
    });
  });

  // ==========================================================================
  // tools.dryRun
  // ==========================================================================

  describe('tools.dryRun', () => {
    it('should return dry-run result for whitelisted tool', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.dryRun', {
        tool_name: 'github.get_repo',
        arguments: { owner: 'test', repo: 'repo' },
      });
      const result = response.result as ToolsDryRunResult;

      expect(result.tool_name).toBe('github.get_repo');
      expect(result.would_be_allowed).toBe(true);
      expect(result.risk).toBe('READ');

      client.close();
    });

    it('should indicate non-whitelisted tool', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.dryRun', {
        tool_name: 'unknown.tool',
        arguments: {},
      });
      const result = response.result as ToolsDryRunResult;

      expect(result.would_be_allowed).toBe(false);
      expect(result.risk).toBeNull();

      client.close();
    });

    it('should require tool_name', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.dryRun', {
        arguments: {},
      });

      expect(response.error).toBeDefined();

      client.close();
    });
  });

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  describe('Rate Limiting', () => {
    it('should deny when rate limit exceeded', async () => {
      const { client, messages } = await setupServerAndClient();

      // Execute 11 times (limit is 10/min per tool)
      for (let i = 0; i < 11; i++) {
        await sendRequest(client, messages, 'tools.execute', {
          principal_id: validPrincipalId,
          tool_name: 'github.get_repo',
          arguments: { owner: 'test', repo: `repo-${i}` },
        });
      }

      const lastResponse = messages[messages.length - 1];
      const result = lastResponse.result as ToolsExecuteResult;

      expect(result.status).toBe('denied');
      expect(result.message).toContain('Rate limit');

      client.close();
    });
  });

  // ==========================================================================
  // JSON-RPC Error Handling
  // ==========================================================================

  describe('JSON-RPC Error Handling', () => {
    it('should return error for unknown method', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.unknown_method', {});

      expect(response.error).toBeDefined();
      expect((response.error as { code: number }).code).toBe(-32601); // Method not found

      client.close();
    });

    it('should return error for malformed params', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.execute', null);

      // Should have an error since principal_id is required
      expect(response.error).toBeDefined();

      client.close();
    });
  });
});
