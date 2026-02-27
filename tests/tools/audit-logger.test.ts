/**
 * AuditLogger Tests
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 *
 * Tests for audit logging, querying, and retention.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AuditLogger } from '../../src/tools/audit-logger.js';
import type { ToolAuditLog } from '../../src/tools/types.js';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `audit-logger-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    logger = new AuditLogger({
      logDir: tempDir,
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await logger.dispose();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialization', () => {
    it('should create log directory if not exists', async () => {
      const newDir = join(tempDir, 'new-audit-dir');
      const newLogger = new AuditLogger({ logDir: newDir });

      await newLogger.initialize();

      expect(existsSync(newDir)).toBe(true);
      await newLogger.dispose();
    });

    it('should be idempotent', async () => {
      await logger.initialize();
      await logger.initialize();
      await logger.initialize();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // Log Entry Creation
  // ==========================================================================

  describe('log', () => {
    it('should log entry with required fields', async () => {
      const entry: ToolAuditLog = {
        id: 'test-id-123',
        principal_id: '550e8400-e29b-41d4-a716-446655440000',
        tool: 'github.get_repo',
        args_hash: 'abc123',
        connection_id: 'conn-1',
        result_summary: 'Success',
        duration_ms: 150,
        status: 'success',
        risk: 'READ',
        timestamp: new Date(),
      };

      await logger.log(entry);
      await logger.flush();

      const logs = await logger.queryByPrincipal(entry.principal_id);
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('test-id-123');
    });

    it('should throw on missing required fields', async () => {
      await expect(
        logger.log({
          id: '',
          principal_id: 'test',
          tool: 'test',
        } as ToolAuditLog)
      ).rejects.toThrow('missing required fields');
    });

    it('should immediate flush for high-risk operations', async () => {
      const entry: ToolAuditLog = {
        id: 'destructive-op',
        principal_id: '550e8400-e29b-41d4-a716-446655440000',
        tool: 'shell.execute_command',
        args_hash: 'xyz789',
        connection_id: 'conn-1',
        result_summary: 'Command executed',
        duration_ms: 50,
        status: 'success',
        risk: 'DESTRUCTIVE',
        timestamp: new Date(),
      };

      await logger.log(entry);

      // Should be flushed immediately (no explicit flush needed)
      const logs = await logger.queryByTool('shell.execute_command');
      expect(logs).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  describe('convenience methods', () => {
    it('should log success correctly', async () => {
      await logger.logSuccess(
        'principal-uuid',
        'github.get_repo',
        'hash123',
        'conn-1',
        'Repo details retrieved',
        100,
        'READ'
      );
      await logger.flush();

      const logs = await logger.queryByPrincipal('principal-uuid');
      expect(logs[0].status).toBe('success');
      expect(logs[0].tool).toBe('github.get_repo');
    });

    it('should log denied correctly', async () => {
      await logger.logDenied(
        'principal-uuid',
        'unknown.tool',
        'hash456',
        'Tool not whitelisted',
        'ADMIN'
      );
      await logger.flush();

      const logs = await logger.queryByPrincipal('principal-uuid');
      expect(logs[0].status).toBe('denied');
      expect(logs[0].result_summary).toContain('not whitelisted');
    });

    it('should log pending approval correctly', async () => {
      await logger.logPendingApproval(
        'principal-uuid',
        'gmail.send_message',
        'hash789',
        'approval-token-123',
        'WRITE'
      );
      await logger.flush();

      const logs = await logger.queryByPrincipal('principal-uuid');
      expect(logs[0].status).toBe('pending_approval');
      expect(logs[0].approval_token).toBe('approval-token-123');
    });

    it('should log failure correctly', async () => {
      await logger.logFailure(
        'principal-uuid',
        'slack.send_message',
        'hashABC',
        'conn-1',
        'RATE_LIMITED',
        'Too many requests',
        200,
        'WRITE'
      );
      await logger.flush();

      const logs = await logger.queryByPrincipal('principal-uuid');
      expect(logs[0].status).toBe('failure');
      expect(logs[0].error_code).toBe('RATE_LIMITED');
    });
  });

  // ==========================================================================
  // Querying
  // ==========================================================================

  describe('querying', () => {
    beforeEach(async () => {
      // Create test data
      await logger.logSuccess('principal-1', 'github.get_repo', 'h1', 'c1', 'ok', 100, 'READ');
      await logger.logSuccess('principal-1', 'gmail.list_messages', 'h2', 'c1', 'ok', 150, 'READ');
      await logger.logSuccess('principal-2', 'github.get_repo', 'h3', 'c2', 'ok', 200, 'READ');
      await logger.logFailure('principal-1', 'slack.send_message', 'h4', 'c1', 'ERR', 'fail', 50, 'WRITE');
      await logger.flush();
    });

    it('should query by principal', async () => {
      const logs = await logger.queryByPrincipal('principal-1');
      expect(logs).toHaveLength(3);
      expect(logs.every((l) => l.principal_id === 'principal-1')).toBe(true);
    });

    it('should query by tool', async () => {
      const logs = await logger.queryByTool('github.get_repo');
      expect(logs).toHaveLength(2);
      expect(logs.every((l) => l.tool === 'github.get_repo')).toBe(true);
    });

    it('should respect limit option', async () => {
      const logs = await logger.queryByPrincipal('principal-1', { limit: 2 });
      expect(logs).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 1000);

      const logs = await logger.queryByPrincipal('principal-1', {
        startDate: future,
      });

      expect(logs).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats', () => {
    beforeEach(async () => {
      await logger.logSuccess('p1', 'tool1', 'h1', 'c1', 'ok', 100, 'READ');
      await logger.logSuccess('p1', 'tool1', 'h2', 'c1', 'ok', 200, 'READ');
      await logger.logFailure('p1', 'tool2', 'h3', 'c1', 'ERR', 'fail', 300, 'WRITE');
      await logger.logDenied('p1', 'tool3', 'h4', 'denied', 'ADMIN');
      await logger.logPendingApproval('p1', 'tool4', 'h5', 'token', 'DESTRUCTIVE');
      await logger.flush();
    });

    it('should return correct counts', async () => {
      const stats = await logger.getStats();

      expect(stats.totalCalls).toBe(5);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.deniedCount).toBe(1);
      expect(stats.pendingCount).toBe(1);
    });

    it('should calculate average duration', async () => {
      const stats = await logger.getStats();

      // (100 + 200 + 300 + 0 + 0) / 5 = 120
      expect(stats.avgDurationMs).toBe(120);
    });

    it('should count by tool', async () => {
      const stats = await logger.getStats();

      expect(stats.byTool['tool1']).toBe(2);
      expect(stats.byTool['tool2']).toBe(1);
    });

    it('should count by risk', async () => {
      const stats = await logger.getStats();

      expect(stats.byRisk['READ']).toBe(2);
      expect(stats.byRisk['WRITE']).toBe(1);
      expect(stats.byRisk['ADMIN']).toBe(1);
      expect(stats.byRisk['DESTRUCTIVE']).toBe(1);
    });
  });

  // ==========================================================================
  // Buffering and Flushing
  // ==========================================================================

  describe('buffering', () => {
    it('should buffer entries until flush', async () => {
      // Don't await flush
      await logger.log({
        id: 'buffered-1',
        principal_id: 'test',
        tool: 'test',
        args_hash: 'h',
        connection_id: 'c',
        result_summary: 'ok',
        duration_ms: 10,
        status: 'success',
        risk: 'READ',
        timestamp: new Date(),
      });

      // Without flush, file shouldn't have content yet (unless high-risk)
      const flushed = await logger.flush();
      expect(flushed).toBe(1);
    });

    it('should return number of flushed entries', async () => {
      for (let i = 0; i < 5; i++) {
        await logger.log({
          id: `entry-${i}`,
          principal_id: 'test',
          tool: 'test',
          args_hash: 'h',
          connection_id: 'c',
          result_summary: 'ok',
          duration_ms: 10,
          status: 'success',
          risk: 'READ',
          timestamp: new Date(),
        });
      }

      const flushed = await logger.flush();
      expect(flushed).toBe(5);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('should not delete files within retention period', async () => {
      await logger.logSuccess('p', 't', 'h', 'c', 'ok', 10, 'READ');
      await logger.flush();

      const deleted = await logger.cleanup();
      expect(deleted).toBe(0);
    });

    it('should skip cleanup when retention is 0', async () => {
      const noRetentionLogger = new AuditLogger({
        logDir: tempDir,
        retentionDays: 0,
      });

      const deleted = await noRetentionLogger.cleanup();
      expect(deleted).toBe(0);
      await noRetentionLogger.dispose();
    });
  });

  // ==========================================================================
  // File Format
  // ==========================================================================

  describe('file format', () => {
    it('should write JSONL format', async () => {
      await logger.logSuccess('p1', 't1', 'h1', 'c1', 'ok1', 10, 'READ');
      await logger.logSuccess('p2', 't2', 'h2', 'c2', 'ok2', 20, 'WRITE');
      await logger.flush();

      // Read raw file
      const files = require('fs').readdirSync(tempDir);
      const logFile = files.find((f: string) => f.endsWith('.jsonl'));
      const content = readFileSync(join(tempDir, logFile), 'utf-8');

      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      // Each line should be valid JSON
      const parsed1 = JSON.parse(lines[0]);
      const parsed2 = JSON.parse(lines[1]);

      expect(parsed1.tool).toBe('t1');
      expect(parsed2.tool).toBe('t2');
    });
  });

  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================

  describe('dispose', () => {
    it('should flush remaining buffer on dispose', async () => {
      await logger.log({
        id: 'final-entry',
        principal_id: 'test',
        tool: 'test',
        args_hash: 'h',
        connection_id: 'c',
        result_summary: 'ok',
        duration_ms: 10,
        status: 'success',
        risk: 'READ',
        timestamp: new Date(),
      });

      await logger.dispose();

      // Create new logger to verify data was persisted
      const newLogger = new AuditLogger({ logDir: tempDir });
      await newLogger.initialize();
      const logs = await newLogger.queryByPrincipal('test');

      expect(logs).toHaveLength(1);
      await newLogger.dispose();
    });
  });
});
