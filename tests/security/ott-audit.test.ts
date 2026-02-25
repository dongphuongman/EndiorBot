/**
 * OTT Audit Logger Tests
 *
 * Tests for OTT audit logging functionality.
 *
 * @module tests/security/ott-audit
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Day 1
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OTTAuditLogger,
  createOTTAuditLogger,
  getOTTAuditLogger,
  resetOTTAuditLogger,
  auditOTTMessage,
  auditOTTViolation,
  auditOTTRateLimit,
  cleanupOTTAudit,
  type OTTMessageAudit,
  type OTTViolationAudit,
  type OTTRateLimitAudit,
} from '../../src/security/ott-audit.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_AUDIT_PATH = join(tmpdir(), 'endiorbot-ott-audit-test', `audit-${Date.now()}`);

describe('OTT Audit Logger', () => {
  beforeEach(() => {
    resetOTTAuditLogger();
    if (existsSync(TEST_AUDIT_PATH)) {
      rmSync(TEST_AUDIT_PATH, { recursive: true, force: true });
    }
    mkdirSync(TEST_AUDIT_PATH, { recursive: true });
  });

  afterEach(() => {
    resetOTTAuditLogger();
    if (existsSync(TEST_AUDIT_PATH)) {
      rmSync(TEST_AUDIT_PATH, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // Logger Creation
  // ===========================================================================

  describe('Logger Creation', () => {
    it('should create logger with default config', () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });
      expect(logger).toBeDefined();
    });

    it('should create directory if not exists', () => {
      const newPath = join(TEST_AUDIT_PATH, 'new-dir');
      const logger = createOTTAuditLogger({ baseDir: newPath });
      expect(existsSync(newPath)).toBe(true);
    });

    it('should use singleton pattern', () => {
      const logger1 = getOTTAuditLogger();
      const logger2 = getOTTAuditLogger();
      expect(logger1).toBe(logger2);
    });

    it('should reset singleton', () => {
      const logger1 = getOTTAuditLogger();
      resetOTTAuditLogger();
      const logger2 = getOTTAuditLogger();
      expect(logger1).not.toBe(logger2);
    });
  });

  // ===========================================================================
  // Message Logging
  // ===========================================================================

  describe('Message Logging', () => {
    it('should log message audit entry', async () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });

      await logger.logMessage({
        messageId: 'msg-001',
        source: 'telegram',
        senderId: 'user-123',
        contentLength: 100,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      const files = readdirSync(TEST_AUDIT_PATH);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^ott-\d{4}-\d{2}-\d{2}\.jsonl$/);

      const content = readFileSync(join(TEST_AUDIT_PATH, files[0]), 'utf-8');
      const entry = JSON.parse(content.trim()) as OTTMessageAudit;
      expect(entry.type).toBe('message');
      expect(entry.messageId).toBe('msg-001');
      expect(entry.source).toBe('telegram');
      expect(entry.contentLength).toBe(100);
    });

    it('should log violation audit entry', async () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });

      await logger.logViolation({
        messageId: 'msg-002',
        source: 'telegram',
        senderId: 'user-456',
        violations: ['system_prompt_override', 'jailbreak_prefix'],
        blocked: true,
        blockReason: 'Critical violation detected',
        timestamp: new Date().toISOString(),
      });

      const files = readdirSync(TEST_AUDIT_PATH);
      const content = readFileSync(join(TEST_AUDIT_PATH, files[0]), 'utf-8');
      const entry = JSON.parse(content.trim()) as OTTViolationAudit;

      expect(entry.type).toBe('violation');
      expect(entry.violations).toContain('system_prompt_override');
      expect(entry.violations).toContain('jailbreak_prefix');
      expect(entry.blocked).toBe(true);
    });

    it('should log rate limit audit entry', async () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });

      await logger.logRateLimit({
        messageId: 'msg-003',
        source: 'slack',
        senderId: 'user-789',
        messagesInWindow: 35,
        windowMs: 60000,
        timestamp: new Date().toISOString(),
      });

      const files = readdirSync(TEST_AUDIT_PATH);
      const content = readFileSync(join(TEST_AUDIT_PATH, files[0]), 'utf-8');
      const entry = JSON.parse(content.trim()) as OTTRateLimitAudit;

      expect(entry.type).toBe('rate_limit');
      expect(entry.messagesInWindow).toBe(35);
      expect(entry.windowMs).toBe(60000);
    });

    it('should append multiple entries to same file', async () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });

      await logger.logMessage({
        messageId: 'msg-001',
        source: 'telegram',
        senderId: 'user-1',
        contentLength: 50,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      await logger.logMessage({
        messageId: 'msg-002',
        source: 'telegram',
        senderId: 'user-2',
        contentLength: 75,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      const files = readdirSync(TEST_AUDIT_PATH);
      expect(files.length).toBe(1);

      const content = readFileSync(join(TEST_AUDIT_PATH, files[0]), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });
  });

  // ===========================================================================
  // Convenience Functions
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('should use auditOTTMessage convenience function', async () => {
      // Override default path for test
      resetOTTAuditLogger();

      await auditOTTMessage({
        messageId: 'conv-001',
        source: 'discord',
        senderId: 'user-test',
        contentLength: 200,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      const stats = getOTTAuditLogger().getStats();
      expect(stats.entriesWritten).toBe(1);
    });

    it('should use auditOTTViolation convenience function', async () => {
      resetOTTAuditLogger();

      await auditOTTViolation({
        messageId: 'conv-002',
        source: 'webhook',
        senderId: 'external',
        violations: ['delimiter_escape'],
        blocked: false,
        timestamp: new Date().toISOString(),
      });

      const stats = getOTTAuditLogger().getStats();
      expect(stats.entriesWritten).toBe(1);
    });

    it('should use auditOTTRateLimit convenience function', async () => {
      resetOTTAuditLogger();

      await auditOTTRateLimit({
        messageId: 'conv-003',
        source: 'telegram',
        senderId: 'spammer',
        messagesInWindow: 100,
        windowMs: 60000,
        timestamp: new Date().toISOString(),
      });

      const stats = getOTTAuditLogger().getStats();
      expect(stats.entriesWritten).toBe(1);
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe('Cleanup', () => {
    it('should clean up old audit files', () => {
      const logger = createOTTAuditLogger({
        baseDir: TEST_AUDIT_PATH,
        retentionDays: 7,
      });

      // Create old file (31 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      const oldFileName = `ott-${oldDate.toISOString().slice(0, 10)}.jsonl`;
      writeFileSync(join(TEST_AUDIT_PATH, oldFileName), '{}');

      // Create recent file
      const recentDate = new Date();
      const recentFileName = `ott-${recentDate.toISOString().slice(0, 10)}.jsonl`;
      writeFileSync(join(TEST_AUDIT_PATH, recentFileName), '{}');

      const deleted = logger.cleanup();
      expect(deleted).toBe(1);

      const files = readdirSync(TEST_AUDIT_PATH);
      expect(files).toContain(recentFileName);
      expect(files).not.toContain(oldFileName);
    });

    it('should not delete non-audit files', () => {
      const logger = createOTTAuditLogger({
        baseDir: TEST_AUDIT_PATH,
        retentionDays: 1,
      });

      writeFileSync(join(TEST_AUDIT_PATH, 'other-file.json'), '{}');

      const deleted = logger.cleanup();
      expect(deleted).toBe(0);

      const files = readdirSync(TEST_AUDIT_PATH);
      expect(files).toContain('other-file.json');
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe('Statistics', () => {
    it('should track entries written', async () => {
      const logger = createOTTAuditLogger({ baseDir: TEST_AUDIT_PATH });

      expect(logger.getStats().entriesWritten).toBe(0);

      await logger.logMessage({
        messageId: 'stat-001',
        source: 'telegram',
        senderId: 'user',
        contentLength: 10,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      expect(logger.getStats().entriesWritten).toBe(1);

      await logger.logViolation({
        messageId: 'stat-002',
        source: 'telegram',
        senderId: 'user',
        violations: ['test'],
        blocked: false,
        timestamp: new Date().toISOString(),
      });

      expect(logger.getStats().entriesWritten).toBe(2);
    });

    it('should return correct retention days', () => {
      const logger = createOTTAuditLogger({
        baseDir: TEST_AUDIT_PATH,
        retentionDays: 14,
      });

      expect(logger.getStats().retentionDays).toBe(14);
    });
  });
});
