/**
 * Gateway OAuth Methods Tests
 * Sprint 50 - Day 9 - OAuth & Principal Mapping
 *
 * Tests for tools.initOAuth and tools.handleCallback gateway methods.
 *
 * @module tests/gateway/methods/oauth
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 50 Day 9
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import {
  GatewayServer,
  createGatewayServer,
  JSONRPC_VERSION,
  registerAllMethods,
  resetToolsState,
  type ToolsInitOAuthResult,
  type ToolsHandleCallbackResult,
} from '../../../src/gateway/index.js';

const getTestPort = () => 18800 + Math.floor(Math.random() * 100);
const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

describe('Gateway OAuth Methods', () => {
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
  // tools.initOAuth
  // ==========================================================================

  describe('tools.initOAuth', () => {
    it('should return redirect URL and state for github', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'github',
      });
      const result = response.result as ToolsInitOAuthResult;

      expect(result.redirect_url).toBeDefined();
      expect(result.connection_id).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.expires_at).toBeDefined();

      client.close();
    });

    it('should return redirect URL and state for gmail', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'gmail',
      });
      const result = response.result as ToolsInitOAuthResult;

      expect(result.redirect_url).toContain('mock.composio.dev');
      expect(result.state.length).toBeGreaterThan(0);

      client.close();
    });

    it('should return error for unsupported app', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'unsupported_app',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('not supported');

      client.close();
    });

    it('should return error for shell app (no OAuth needed)', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'shell',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('OAuth');

      client.close();
    });

    it('should require principal_id', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        app_name: 'github',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('principal_id');

      client.close();
    });

    it('should require app_name', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('app_name');

      client.close();
    });

    it('should support all Phase 1 OAuth apps', async () => {
      const { client, messages } = await setupServerAndClient();

      const apps = ['github', 'gmail', 'google_calendar', 'slack'];

      for (const app_name of apps) {
        const response = await sendRequest(client, messages, 'tools.initOAuth', {
          principal_id: validPrincipalId,
          app_name,
        });
        const result = response.result as ToolsInitOAuthResult;

        expect(result.redirect_url).toBeDefined();
        expect(result.state).toBeDefined();
      }

      client.close();
    });
  });

  // ==========================================================================
  // tools.handleCallback
  // ==========================================================================

  describe('tools.handleCallback', () => {
    it('should complete OAuth flow with valid state and code', async () => {
      const { client, messages } = await setupServerAndClient();

      // First initiate OAuth
      const initResponse = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'github',
      });
      const initResult = initResponse.result as ToolsInitOAuthResult;

      // Then handle callback
      const callbackResponse = await sendRequest(client, messages, 'tools.handleCallback', {
        state: initResult.state,
        code: 'auth-code-123',
      });
      const callbackResult = callbackResponse.result as ToolsHandleCallbackResult;

      expect(callbackResult.success).toBe(true);
      expect(callbackResult.connection_id).toBe(initResult.connection_id);
      expect(callbackResult.principal_id).toBe(validPrincipalId);
      expect(callbackResult.app_name).toBe('github');

      client.close();
    });

    it('should return error for invalid state', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.handleCallback', {
        state: 'invalid-state-token',
        code: 'auth-code-123',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('Invalid');

      client.close();
    });

    it('should handle OAuth error response', async () => {
      const { client, messages } = await setupServerAndClient();

      // First initiate OAuth
      const initResponse = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'github',
      });
      const initResult = initResponse.result as ToolsInitOAuthResult;

      // Then handle error callback
      const callbackResponse = await sendRequest(client, messages, 'tools.handleCallback', {
        state: initResult.state,
        error: 'access_denied',
        error_description: 'User denied access',
      });
      const callbackResult = callbackResponse.result as ToolsHandleCallbackResult;

      expect(callbackResult.success).toBe(false);
      expect(callbackResult.error).toBe('User denied access');

      client.close();
    });

    it('should require state parameter', async () => {
      const { client, messages } = await setupServerAndClient();

      const response = await sendRequest(client, messages, 'tools.handleCallback', {
        code: 'auth-code-123',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { message: string }).message).toContain('state');

      client.close();
    });

    it('should clean up state after successful callback', async () => {
      const { client, messages } = await setupServerAndClient();

      // First initiate OAuth
      const initResponse = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'gmail',
      });
      const initResult = initResponse.result as ToolsInitOAuthResult;

      // Complete the callback
      await sendRequest(client, messages, 'tools.handleCallback', {
        state: initResult.state,
        code: 'auth-code-123',
      });

      // Try to use the same state again - should fail
      const secondResponse = await sendRequest(client, messages, 'tools.handleCallback', {
        state: initResult.state,
        code: 'another-code',
      });

      expect(secondResponse.error).toBeDefined();

      client.close();
    });
  });

  // ==========================================================================
  // End-to-End OAuth Flow
  // ==========================================================================

  describe('End-to-End OAuth Flow', () => {
    it('should complete full OAuth flow for multiple apps', async () => {
      const { client, messages } = await setupServerAndClient();

      const apps = ['github', 'gmail'];

      for (const app_name of apps) {
        // Initiate
        const initResponse = await sendRequest(client, messages, 'tools.initOAuth', {
          principal_id: validPrincipalId,
          app_name,
        });
        const initResult = initResponse.result as ToolsInitOAuthResult;

        expect(initResult.redirect_url).toBeDefined();

        // Complete callback
        const callbackResponse = await sendRequest(client, messages, 'tools.handleCallback', {
          state: initResult.state,
          code: `code-for-${app_name}`,
        });
        const callbackResult = callbackResponse.result as ToolsHandleCallbackResult;

        expect(callbackResult.success).toBe(true);
        expect(callbackResult.app_name).toBe(app_name);
      }

      client.close();
    });

    it('should handle concurrent OAuth flows for same principal', async () => {
      const { client, messages } = await setupServerAndClient();

      // Initiate OAuth for two apps simultaneously
      const initGithub = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'github',
      });
      const initGmail = await sendRequest(client, messages, 'tools.initOAuth', {
        principal_id: validPrincipalId,
        app_name: 'gmail',
      });

      const githubResult = initGithub.result as ToolsInitOAuthResult;
      const gmailResult = initGmail.result as ToolsInitOAuthResult;

      // States should be different
      expect(githubResult.state).not.toBe(gmailResult.state);

      // Complete both callbacks
      const callbackGithub = await sendRequest(client, messages, 'tools.handleCallback', {
        state: githubResult.state,
        code: 'github-code',
      });
      const callbackGmail = await sendRequest(client, messages, 'tools.handleCallback', {
        state: gmailResult.state,
        code: 'gmail-code',
      });

      expect((callbackGithub.result as ToolsHandleCallbackResult).success).toBe(true);
      expect((callbackGmail.result as ToolsHandleCallbackResult).success).toBe(true);

      client.close();
    });
  });
});
