/**
 * ComposioClient Tests
 * Sprint 50 - Day 5-6 - Real Composio API Integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComposioClient, ComposioError } from '../../src/tools/composio-client.js';

describe('ComposioClient', () => {
  let client: ComposioClient;
  const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

  // ==========================================================================
  // Mock Mode Tests (no API key needed)
  // ==========================================================================

  describe('mock mode', () => {
    beforeEach(() => {
      client = new ComposioClient({ mockMode: true });
    });

    it('should initialize in mock mode', async () => {
      const result = await client.initialize();
      expect(result).toBe(true);
    });

    it('should report configured in mock mode', async () => {
      await client.initialize();
      expect(client.isConfigured()).toBe(true);
    });

    it('should return mock tools', async () => {
      await client.initialize();
      const tools = await client.getTools(validPrincipalId);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools.map((t) => t.name)).toContain('github.get_repo');
      expect(tools.map((t) => t.name)).toContain('gmail.send_message');
    });

    it('should filter tools by app', async () => {
      await client.initialize();
      const tools = await client.getTools(validPrincipalId, ['github']);

      expect(tools.every((t) => t.app === 'github')).toBe(true);
    });

    it('should execute mock tool', async () => {
      await client.initialize();
      const result = await client.executeTool(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: 'test', repo: 'my-repo' },
          principal_id: validPrincipalId,
        },
        validPrincipalId
      );

      expect(result).toMatchObject({
        name: 'my-repo',
        full_name: 'test/my-repo',
      });
    });

    it('should throw on unknown tool', async () => {
      await client.initialize();

      await expect(
        client.executeTool(
          {
            id: 'test-1',
            name: 'unknown.tool',
            arguments: {},
            principal_id: validPrincipalId,
          },
          validPrincipalId
        )
      ).rejects.toThrow(ComposioError);
    });

    it('should create entity', async () => {
      await client.initialize();
      const entity = await client.getOrCreateEntity(validPrincipalId);

      expect(entity.id).toContain('entity_');
      expect(entity.connections).toEqual([]);
    });

    it('should return mock connection initiation', async () => {
      await client.initialize();
      const result = await client.initiateConnection(validPrincipalId, 'github');

      expect(result.redirect_url).toContain('mock.composio.dev');
      expect(result.connection_id).toContain('mock_conn_');
    });
  });

  // ==========================================================================
  // Degraded Mode Tests (no API key)
  // ==========================================================================

  describe('degraded mode (no API key)', () => {
    beforeEach(() => {
      // No apiKey, no mockMode
      client = new ComposioClient({ apiKey: '' });
    });

    it('should initialize but report not configured', async () => {
      const result = await client.initialize();
      expect(result).toBe(false);
      expect(client.isConfigured()).toBe(false);
    });

    it('should return empty tools list', async () => {
      await client.initialize();
      const tools = await client.getTools(validPrincipalId);
      expect(tools).toEqual([]);
    });

    it('should throw on execute in degraded mode', async () => {
      await client.initialize();

      await expect(
        client.executeTool(
          {
            id: 'test-1',
            name: 'github.get_repo',
            arguments: {},
            principal_id: validPrincipalId,
          },
          validPrincipalId
        )
      ).rejects.toThrow('not configured');
    });
  });

  // ==========================================================================
  // Health Check
  // ==========================================================================

  describe('healthCheck', () => {
    it('should return health status for mock mode', async () => {
      const mockClient = new ComposioClient({ mockMode: true });
      const health = await mockClient.healthCheck();

      expect(health.configured).toBe(true);
      expect(health.mockMode).toBe(true);
      expect(health.connected).toBe(false);
    });

    it('should return health status for degraded mode', async () => {
      const degradedClient = new ComposioClient({ apiKey: '' });
      const health = await degradedClient.healthCheck();

      expect(health.configured).toBe(false);
      expect(health.mockMode).toBe(false);
    });
  });

  // ==========================================================================
  // Tool Execution Variations
  // ==========================================================================

  describe('tool execution variations', () => {
    beforeEach(async () => {
      client = new ComposioClient({ mockMode: true });
      await client.initialize();
    });

    it('should execute gmail.list_messages', async () => {
      const result = await client.executeTool(
        {
          id: 'test',
          name: 'gmail.list_messages',
          arguments: { max_results: 10 },
          principal_id: validPrincipalId,
        },
        validPrincipalId
      );

      expect((result as { messages: unknown[] }).messages).toHaveLength(2);
    });

    it('should execute slack.send_message', async () => {
      const result = await client.executeTool(
        {
          id: 'test',
          name: 'slack.send_message',
          arguments: { channel: '#general', text: 'Hello' },
          principal_id: validPrincipalId,
        },
        validPrincipalId
      );

      expect((result as { ok: boolean }).ok).toBe(true);
      expect((result as { channel: string }).channel).toBe('#general');
    });

    it('should execute shell.execute_command', async () => {
      const result = await client.executeTool(
        {
          id: 'test',
          name: 'shell.execute_command',
          arguments: { command: 'ls -la' },
          principal_id: validPrincipalId,
        },
        validPrincipalId
      );

      expect((result as { exitCode: number }).exitCode).toBe(0);
      expect((result as { stdout: string }).stdout).toContain('ls -la');
    });
  });
});
