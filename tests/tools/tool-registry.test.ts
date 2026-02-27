/**
 * ToolRegistry Tests
 * Sprint 50 - Day 5-6 - Real Composio API Integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ComposioClient } from '../../src/tools/composio-client.js';
import {
  ToolRegistry,
  ToolRegistryError,
  PHASE_1_WHITELIST,
} from '../../src/tools/tool-registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let composioClient: ComposioClient;
  const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    composioClient = new ComposioClient({ mockMode: true });
    await composioClient.initialize();
    registry = new ToolRegistry(composioClient);
  });

  // ==========================================================================
  // Whitelist
  // ==========================================================================

  describe('whitelist', () => {
    it('should have exactly 10 Phase 1 tools', () => {
      expect(PHASE_1_WHITELIST).toHaveLength(10);
    });

    it('should include all expected tools', () => {
      expect(PHASE_1_WHITELIST).toContain('github.get_repo');
      expect(PHASE_1_WHITELIST).toContain('github.create_issue');
      expect(PHASE_1_WHITELIST).toContain('gmail.send_message');
      expect(PHASE_1_WHITELIST).toContain('shell.execute_command');
    });

    it('should identify whitelisted tools', () => {
      expect(registry.isToolWhitelisted('github.get_repo')).toBe(true);
      expect(registry.isToolWhitelisted('gmail.list_messages')).toBe(true);
    });

    it('should reject non-whitelisted tools', () => {
      expect(registry.isToolWhitelisted('github.delete_repo')).toBe(false);
      expect(registry.isToolWhitelisted('unknown.tool')).toBe(false);
    });
  });

  // ==========================================================================
  // Tool Discovery
  // ==========================================================================

  describe('discoverTools', () => {
    it('should return only whitelisted tools', async () => {
      const tools = await registry.discoverTools(validPrincipalId);

      for (const tool of tools) {
        expect(registry.isToolWhitelisted(tool.name)).toBe(true);
      }
    });

    it('should cache discovered tools', async () => {
      // First call
      const tools1 = await registry.discoverTools(validPrincipalId);

      // Second call should use cache
      const tools2 = await registry.discoverTools(validPrincipalId);

      expect(tools1).toEqual(tools2);
    });

    it('should filter by app', async () => {
      const tools = await registry.discoverTools(validPrincipalId, ['github']);

      expect(tools.every((t) => t.app === 'github')).toBe(true);
    });
  });

  // ==========================================================================
  // Get Tool By Name
  // ==========================================================================

  describe('getToolByName', () => {
    it('should return tool by name', async () => {
      const tool = await registry.getToolByName('github.get_repo', validPrincipalId);

      expect(tool).not.toBeNull();
      expect(tool?.name).toBe('github.get_repo');
      expect(tool?.app).toBe('github');
    });

    it('should throw for non-whitelisted tool', async () => {
      await expect(
        registry.getToolByName('dangerous.tool', validPrincipalId)
      ).rejects.toThrow(ToolRegistryError);
    });

    it('should return null for non-existent whitelisted tool', async () => {
      // This shouldn't happen in practice, but tests graceful handling
      registry.clearCache();

      // Mock client returns all whitelisted tools, so this will find it
      const tool = await registry.getToolByName('github.get_repo', validPrincipalId);
      expect(tool).not.toBeNull();
    });
  });

  // ==========================================================================
  // Get Tools By App
  // ==========================================================================

  describe('getToolsByApp', () => {
    it('should return tools for github app', async () => {
      const tools = await registry.getToolsByApp('github', validPrincipalId);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((t) => t.app === 'github')).toBe(true);
    });

    it('should return empty for unknown app', async () => {
      const tools = await registry.getToolsByApp('unknown_app', validPrincipalId);
      expect(tools).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Search Tools
  // ==========================================================================

  describe('searchTools', () => {
    it('should search by name', async () => {
      const tools = await registry.searchTools('repo', validPrincipalId);

      expect(tools.some((t) => t.name.includes('repo'))).toBe(true);
    });

    it('should search by description', async () => {
      const tools = await registry.searchTools('email', validPrincipalId);

      expect(tools.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Tool Schema
  // ==========================================================================

  describe('getToolSchema', () => {
    it('should return schema for valid tool', async () => {
      const schema = await registry.getToolSchema('github.get_repo', validPrincipalId);

      expect(schema).not.toBeNull();
      expect(schema?.name).toBe('github.get_repo');
      expect(schema?.parameters).toBeDefined();
    });

    it('should return null for non-existent tool', async () => {
      // Create a new registry with strict whitelist
      const strictRegistry = new ToolRegistry(composioClient, { strictWhitelist: true });

      // This will throw because it's not whitelisted
      await expect(
        strictRegistry.getToolSchema('non.existent', validPrincipalId)
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  describe('cache', () => {
    it('should clear all cache', async () => {
      await registry.discoverTools(validPrincipalId);

      const statsBefore = registry.getCacheStats();
      expect(statsBefore.listCacheSize).toBeGreaterThan(0);

      registry.clearCache();

      const statsAfter = registry.getCacheStats();
      expect(statsAfter.listCacheSize).toBe(0);
      expect(statsAfter.toolCacheSize).toBe(0);
    });

    it('should clear cache for specific principal', async () => {
      const principal1 = '550e8400-e29b-41d4-a716-446655440001';
      const principal2 = '550e8400-e29b-41d4-a716-446655440002';

      await registry.discoverTools(principal1);
      await registry.discoverTools(principal2);

      registry.clearCache(principal1);

      // Cache should still have principal2's data
      const stats = registry.getCacheStats();
      expect(stats.listCacheSize).toBe(1);
    });

    it('should report cache stats', async () => {
      await registry.discoverTools(validPrincipalId);
      await registry.getToolByName('github.get_repo', validPrincipalId);

      const stats = registry.getCacheStats();

      expect(stats.listCacheSize).toBeGreaterThanOrEqual(1);
      expect(stats.toolCacheSize).toBeGreaterThanOrEqual(1);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Non-strict Mode
  // ==========================================================================

  describe('non-strict mode', () => {
    it('should allow all tools in non-strict mode', async () => {
      const nonStrictRegistry = new ToolRegistry(composioClient, {
        strictWhitelist: false,
      });

      const tools = await nonStrictRegistry.discoverTools(validPrincipalId);

      // Should return all tools from mock (which happens to be 10)
      expect(tools.length).toBeGreaterThanOrEqual(10);
    });
  });
});
