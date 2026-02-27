/**
 * ToolExecutor Tests
 * Sprint 50 - Day 5-6 - Real Composio API Integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ComposioClient } from '../../src/tools/composio-client.js';
import { AuditLogger } from '../../src/tools/audit-logger.js';
import { ToolExecutor } from '../../src/tools/tool-executor.js';
import type { ToolExecutionEvent } from '../../src/tools/types.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let composioClient: ComposioClient;
  let auditLogger: AuditLogger;
  let tempDir: string;
  const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    tempDir = join(tmpdir(), `tool-executor-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    composioClient = new ComposioClient({ mockMode: true });
    await composioClient.initialize();

    auditLogger = new AuditLogger({ logDir: tempDir, consoleOutput: false });
    await auditLogger.initialize();

    executor = new ToolExecutor(composioClient, auditLogger);
  });

  afterEach(async () => {
    await auditLogger.dispose();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Input Validation
  // ==========================================================================

  describe('validateInput', () => {
    it('should validate github.get_repo input', async () => {
      const result = await executor.validateInput('github.get_repo', {
        owner: 'test-owner',
        repo: 'test-repo',
      });

      expect(result.success).toBe(true);
      expect(result.sanitizedInput).toBeDefined();
    });

    it('should reject invalid owner format', async () => {
      const result = await executor.validateInput('github.get_repo', {
        owner: 'invalid owner with spaces',
        repo: 'test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject SQL injection attempts', async () => {
      const result = await executor.validateInput('github.get_repo', {
        owner: "'; DROP TABLE users;--",
        repo: 'test-repo',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('blocked');
    });

    it('should reject XSS attempts', async () => {
      const result = await executor.validateInput('gmail.send_message', {
        to: 'test@example.com',
        subject: '<script>alert("xss")</script>',
        body: 'Hello',
      });

      expect(result.success).toBe(false);
    });

    it('should validate email format for gmail', async () => {
      const result = await executor.validateInput('gmail.send_message', {
        to: 'not-an-email',
        subject: 'Test',
        body: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.includes('email'))).toBe(true);
    });

    it('should reject path traversal', async () => {
      const result = await executor.validateInput('shell.execute_command', {
        command: 'cat ../../../etc/passwd',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for unknown tool', async () => {
      const result = await executor.validateInput('unknown.tool', {});

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('No validation schema');
    });
  });

  // ==========================================================================
  // Tool Execution
  // ==========================================================================

  describe('execute', () => {
    it('should execute valid tool call', async () => {
      const result = await executor.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: 'test', repo: 'my-repo' },
          principal_id: validPrincipalId,
        },
        {}
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.duration_ms).toBeGreaterThan(0);
    });

    it('should fail on validation error', async () => {
      const result = await executor.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: '', repo: '' },
          principal_id: validPrincipalId,
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should audit log success', async () => {
      await executor.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: 'test', repo: 'repo' },
          principal_id: validPrincipalId,
        },
        {}
      );

      const logs = await auditLogger.queryByPrincipal(validPrincipalId);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].status).toBe('success');
    });

    it('should audit log failure', async () => {
      await executor.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: '', repo: '' },
          principal_id: validPrincipalId,
        },
        {}
      );

      const logs = await auditLogger.queryByPrincipal(validPrincipalId);
      expect(logs[0].status).toBe('failure');
    });
  });

  // ==========================================================================
  // Brain Layer 1 Integration
  // ==========================================================================

  describe('Brain Layer 1 integration', () => {
    it('should emit tool execution event', async () => {
      const events: ToolExecutionEvent[] = [];

      const executorWithBrain = new ToolExecutor(composioClient, auditLogger, {
        onToolExecution: async (event) => {
          events.push(event);
        },
      });

      await executorWithBrain.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: 'test', repo: 'repo' },
          principal_id: validPrincipalId,
        },
        {}
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_execution');
      expect(events[0].tool_name).toBe('github.get_repo');
      expect(events[0].success).toBe(true);
    });

    it('should emit event on failure too', async () => {
      const events: ToolExecutionEvent[] = [];

      const executorWithBrain = new ToolExecutor(composioClient, auditLogger, {
        onToolExecution: async (event) => {
          events.push(event);
        },
      });

      await executorWithBrain.execute(
        {
          id: 'test-1',
          name: 'github.get_repo',
          arguments: { owner: '', repo: '' },
          principal_id: validPrincipalId,
        },
        {}
      );

      expect(events).toHaveLength(1);
      expect(events[0].success).toBe(false);
    });
  });

  // ==========================================================================
  // Tool Risk
  // ==========================================================================

  describe('tool risk', () => {
    it('should classify READ tools', () => {
      expect(executor.getToolRisk('github.get_repo')).toBe('READ');
      expect(executor.getToolRisk('gmail.list_messages')).toBe('READ');
    });

    it('should classify WRITE tools', () => {
      expect(executor.getToolRisk('github.create_issue')).toBe('WRITE');
      expect(executor.getToolRisk('gmail.send_message')).toBe('WRITE');
    });

    it('should classify DESTRUCTIVE tools', () => {
      expect(executor.getToolRisk('shell.execute_command')).toBe('DESTRUCTIVE');
    });

    it('should return ADMIN for unknown tools', () => {
      expect(executor.getToolRisk('unknown.tool')).toBe('ADMIN');
    });
  });

  // ==========================================================================
  // Schema Introspection
  // ==========================================================================

  describe('schema introspection', () => {
    it('should report supported tools', () => {
      const tools = executor.getSupportedTools();

      expect(tools).toContain('github.get_repo');
      expect(tools).toContain('gmail.send_message');
      expect(tools).toHaveLength(10);
    });

    it('should check schema existence', () => {
      expect(executor.hasSchema('github.get_repo')).toBe(true);
      expect(executor.hasSchema('unknown.tool')).toBe(false);
    });

    it('should return schema for known tool', () => {
      const schema = executor.getSchema('github.get_repo');
      expect(schema).not.toBeNull();
    });
  });

  // ==========================================================================
  // Dry Run Validation
  // ==========================================================================

  describe('dryRunValidation', () => {
    it('should validate without executing', async () => {
      const result = await executor.dryRunValidation('github.get_repo', {
        owner: 'test',
        repo: 'repo',
      });

      expect(result.valid).toBe(true);
      expect(result.risk).toBe('READ');
      expect(result.hasSchema).toBe(true);
    });

    it('should report errors in dry run', async () => {
      const result = await executor.dryRunValidation('github.get_repo', {
        owner: '',
        repo: '',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});
