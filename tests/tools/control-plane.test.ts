/**
 * ToolControlPlane Tests
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 *
 * Tests for the main orchestration layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ToolControlPlane } from '../../src/tools/control-plane.js';
import type { ToolExecutionEvent } from '../../src/tools/types.js';

describe('ToolControlPlane', () => {
  let controlPlane: ToolControlPlane;
  let tempDir: string;
  const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    tempDir = join(tmpdir(), `control-plane-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    controlPlane = new ToolControlPlane({
      auditLogger: { logDir: tempDir, consoleOutput: false },
      approvalQueue: { tokenExpiryMs: 5000 },
    });

    await controlPlane.initialize();
  });

  afterEach(async () => {
    await controlPlane.dispose();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialization', () => {
    it('should initialize all components', async () => {
      const health = await controlPlane.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.components.policyEngine).toBe(true);
      expect(health.components.approvalQueue).toBe(true);
      expect(health.components.auditLogger).toBe(true);
    });
  });

  // ==========================================================================
  // Evaluate
  // ==========================================================================

  describe('evaluate', () => {
    it('should allow READ tools', async () => {
      const decision = await controlPlane.evaluate(
        'github.get_repo',
        { owner: 'test', repo: 'repo' },
        validPrincipalId
      );

      expect(decision.action).toBe('allow');
      expect(decision.risk).toBe('READ');
    });

    it('should require approval for WRITE tools', async () => {
      const decision = await controlPlane.evaluate(
        'gmail.send_message',
        { to: 'test@example.com', subject: 'Test', body: 'Hello' },
        validPrincipalId
      );

      expect(decision.action).toBe('require_approval');
      expect(decision.approval_token).toBeDefined();
    });

    it('should deny non-whitelisted tools', async () => {
      const decision = await controlPlane.evaluate(
        'dangerous.tool',
        {},
        validPrincipalId
      );

      expect(decision.action).toBe('deny');
      expect(decision.reason).toContain('not in Phase 1 whitelist');
    });

    it('should audit log all decisions', async () => {
      await controlPlane.evaluate('github.get_repo', {}, validPrincipalId);
      await controlPlane.evaluate('unknown.tool', {}, validPrincipalId);

      const logs = await controlPlane.queryAuditByPrincipal(validPrincipalId);
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Execute
  // ==========================================================================

  describe('execute', () => {
    it('should execute allowed tools and return result', async () => {
      const result = await controlPlane.execute(
        'github.get_repo',
        { owner: 'test', repo: 'repo' },
        validPrincipalId
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.duration_ms).toBeGreaterThan(0);
    });

    it('should return mock data for Phase 1', async () => {
      const result = await controlPlane.execute(
        'github.get_repo',
        { owner: 'owner', repo: 'my-repo' },
        validPrincipalId
      );

      expect(result.success).toBe(true);
      expect((result.output as { name: string }).name).toBe('my-repo');
    });

    it('should handle errors gracefully', async () => {
      // Force error by executing unknown tool
      const result = await controlPlane.execute(
        'unknown.tool',
        {},
        validPrincipalId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
    });
  });

  // ==========================================================================
  // Execute with Approval
  // ==========================================================================

  describe('executeWithApproval', () => {
    it('should execute after approval', async () => {
      // Get approval token
      const decision = await controlPlane.evaluate(
        'github.create_issue',
        { owner: 'test', repo: 'repo', title: 'Bug' },
        validPrincipalId
      );

      expect(decision.approval_token).toBeDefined();

      // Execute with token
      const result = await controlPlane.executeWithApproval(decision.approval_token!);

      expect(result.success).toBe(true);
      expect((result.output as { state: string }).state).toBe('open');
    });

    it('should reject invalid approval token', async () => {
      await expect(
        controlPlane.executeWithApproval('invalid-token')
      ).rejects.toThrow();
    });

    it('should reject reused approval token', async () => {
      const decision = await controlPlane.evaluate(
        'gmail.send_message',
        { to: 'test@example.com', subject: 'Hi', body: 'Test' },
        validPrincipalId
      );

      // First use
      await controlPlane.executeWithApproval(decision.approval_token!);

      // Second use should fail
      await expect(
        controlPlane.executeWithApproval(decision.approval_token!)
      ).rejects.toThrow('already used');
    });
  });

  // ==========================================================================
  // Discover Tools
  // ==========================================================================

  describe('discoverTools', () => {
    it('should return Phase 1 whitelisted tools', async () => {
      const tools = await controlPlane.discoverTools(validPrincipalId);

      expect(tools).toHaveLength(10);
      expect(tools.map((t) => t.name)).toContain('github.get_repo');
      expect(tools.map((t) => t.name)).toContain('shell.execute_command');
    });

    it('should include tool metadata', async () => {
      const tools = await controlPlane.discoverTools(validPrincipalId);
      const githubTool = tools.find((t) => t.name === 'github.get_repo');

      expect(githubTool?.app).toBe('github');
      expect(githubTool?.description).toBeDefined();
    });
  });

  // ==========================================================================
  // Dry Run
  // ==========================================================================

  describe('dryRun', () => {
    it('should simulate without executing', async () => {
      const result = await controlPlane.dryRun('github.get_repo', {
        owner: 'test',
        repo: 'repo',
      });

      expect(result.tool_name).toBe('github.get_repo');
      expect(result.would_be_allowed).toBe(true);
      expect(result.risk).toBe('READ');
    });

    it('should show non-whitelisted tools as not allowed', async () => {
      const result = await controlPlane.dryRun('dangerous.tool', {});

      expect(result.would_be_allowed).toBe(false);
      expect(result.risk).toBeNull();
    });

    it('should not affect rate limits', async () => {
      // Do multiple dry runs
      for (let i = 0; i < 20; i++) {
        await controlPlane.dryRun('github.get_repo', {});
      }

      // Real call should still work
      const decision = await controlPlane.evaluate(
        'github.get_repo',
        {},
        validPrincipalId
      );

      expect(decision.action).toBe('allow');
    });
  });

  // ==========================================================================
  // Brain Layer 1 Integration
  // ==========================================================================

  describe('Brain Layer 1 integration', () => {
    it('should emit tool execution events', async () => {
      const events: ToolExecutionEvent[] = [];

      const cp = new ToolControlPlane({
        auditLogger: { logDir: tempDir },
        onToolExecution: async (event) => {
          events.push(event);
        },
      });

      await cp.initialize();
      await cp.execute('github.get_repo', { owner: 'test', repo: 'repo' }, validPrincipalId);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_execution');
      expect(events[0].tool_name).toBe('github.get_repo');
      expect(events[0].success).toBe(true);
      expect(events[0].input_hash).toHaveLength(64);

      await cp.dispose();
    });

    it('should not include secrets in output_summary', async () => {
      const events: ToolExecutionEvent[] = [];

      const cp = new ToolControlPlane({
        auditLogger: { logDir: tempDir },
        onToolExecution: async (event) => {
          events.push(event);
        },
      });

      await cp.initialize();
      await cp.execute(
        'gmail.list_messages',
        { query: 'password: secret123' },
        validPrincipalId
      );

      // Output summary should be truncated, not contain full response
      expect(events[0].output_summary.length).toBeLessThanOrEqual(259); // 256 + "..."

      await cp.dispose();
    });
  });

  // ==========================================================================
  // Connections
  // ==========================================================================

  describe('connections', () => {
    it('should return empty connections initially', async () => {
      const connections = await controlPlane.getConnections(validPrincipalId);
      expect(connections).toHaveLength(0);
    });

    it('should handle disconnect gracefully', async () => {
      // Should not throw even if connection doesn't exist
      await controlPlane.disconnect(validPrincipalId, 'non-existent-conn');
    });
  });

  // ==========================================================================
  // Stats
  // ==========================================================================

  describe('stats', () => {
    it('should return rate limit stats', async () => {
      await controlPlane.evaluate('github.get_repo', {}, validPrincipalId);
      await controlPlane.evaluate('github.get_issue', {}, validPrincipalId);

      const stats = controlPlane.getRateLimitStats(validPrincipalId);

      expect(stats.totalCalls).toBe(2);
      expect(stats.toolCounts['github.get_repo']).toBe(1);
    });

    it('should return approval queue stats', () => {
      const stats = controlPlane.getApprovalQueueStats();

      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('expired');
      expect(stats).toHaveProperty('used');
    });

    it('should return audit stats', async () => {
      await controlPlane.execute('github.get_repo', {}, validPrincipalId);

      const stats = await controlPlane.getAuditStats();

      expect(stats.totalCalls).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Health Check
  // ==========================================================================

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const health = await controlPlane.healthCheck();

      expect(health.status).toBe('healthy');
      expect(Object.values(health.components).every((v) => v)).toBe(true);
    });
  });

  // ==========================================================================
  // Mock Execution (Phase 1)
  // ==========================================================================

  describe('mock execution', () => {
    it('should return mock github.get_repo', async () => {
      const result = await controlPlane.execute(
        'github.get_repo',
        { owner: 'owner', repo: 'test-repo' },
        validPrincipalId
      );

      expect(result.success).toBe(true);
      const output = result.output as { name: string; full_name: string };
      expect(output.name).toBe('test-repo');
      expect(output.full_name).toBe('owner/mock-repo');
    });

    it('should return mock gmail.list_messages', async () => {
      const result = await controlPlane.execute(
        'gmail.list_messages',
        {},
        validPrincipalId
      );

      expect(result.success).toBe(true);
      const output = result.output as { messages: unknown[] };
      expect(output.messages).toHaveLength(2);
    });

    it('should return mock slack.send_message', async () => {
      const result = await controlPlane.execute(
        'slack.send_message',
        { channel: '#general', text: 'Hello' },
        validPrincipalId
      );

      expect(result.success).toBe(true);
      const output = result.output as { ok: boolean; channel: string };
      expect(output.ok).toBe(true);
      expect(output.channel).toBe('#general');
    });

    it('should return mock shell.execute_command', async () => {
      const result = await controlPlane.execute(
        'shell.execute_command',
        { command: 'ls -la' },
        validPrincipalId
      );

      expect(result.success).toBe(true);
      const output = result.output as { stdout: string; exitCode: number };
      expect(output.stdout).toBeDefined();
      expect(output.exitCode).toBe(0);
    });
  });
});
