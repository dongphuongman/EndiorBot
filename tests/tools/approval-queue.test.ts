/**
 * ApprovalQueue Tests
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 *
 * Tests for token management, expiry, and one-time use.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalQueue, ApprovalError } from '../../src/tools/approval-queue.js';

describe('ApprovalQueue', () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    // Use short expiry for testing, but longer cleanup interval
    // to avoid cleanup running during test assertions
    queue = new ApprovalQueue({
      tokenExpiryMs: 500, // 500ms for fast tests
      cleanupIntervalMs: 60000, // 1 minute - won't run during tests
    });
  });

  afterEach(() => {
    queue.dispose();
  });

  // ==========================================================================
  // Enqueue
  // ==========================================================================

  describe('enqueue', () => {
    it('should create approval token with correct properties', async () => {
      const token = await queue.enqueue(
        'github.create_issue',
        { title: 'Test Issue', body: 'Body' },
        '550e8400-e29b-41d4-a716-446655440000',
        'conn-123'
      );

      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
      expect(token.tool_name).toBe('github.create_issue');
      expect(token.args_hash).toHaveLength(64); // SHA256 hex
      expect(token.principal_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(token.connection_id).toBe('conn-123');
      expect(token.used).toBe(false);
      expect(token.expires_at).toBeInstanceOf(Date);
      expect(token.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should generate unique tokens', async () => {
      const tokens = await Promise.all([
        queue.enqueue('tool1', {}, 'principal-1', 'conn'),
        queue.enqueue('tool2', {}, 'principal-2', 'conn'),
        queue.enqueue('tool3', {}, 'principal-3', 'conn'),
      ]);

      const tokenIds = tokens.map((t) => t.token);
      expect(new Set(tokenIds).size).toBe(3);
    });

    it('should store pending call for later execution', async () => {
      const args = { title: 'My Issue', labels: ['bug'] };
      const token = await queue.enqueue(
        'github.create_issue',
        args,
        'principal-id',
        'conn-id'
      );

      const pendingCall = await queue.getPendingCall(token.token);
      expect(pendingCall).not.toBeNull();
      expect(pendingCall?.name).toBe('github.create_issue');
      expect(pendingCall?.arguments).toEqual(args);
      expect(pendingCall?.principal_id).toBe('principal-id');
    });

    it('should set expiry time correctly', async () => {
      const before = Date.now();
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');
      const after = Date.now();

      const expiryTime = token.expires_at.getTime();
      // Token expiry is 500ms from creation
      expect(expiryTime).toBeGreaterThanOrEqual(before + 500);
      expect(expiryTime).toBeLessThanOrEqual(after + 500);
    });
  });

  // ==========================================================================
  // Validate
  // ==========================================================================

  describe('validate', () => {
    it('should return token on valid validation', async () => {
      const originalToken = await queue.enqueue(
        'gmail.send_message',
        { to: 'test@example.com' },
        'principal-uuid',
        'conn'
      );

      const validated = await queue.validate(originalToken.token);

      expect(validated.token).toBe(originalToken.token);
      expect(validated.tool_name).toBe('gmail.send_message');
    });

    it('should mark token as used after validation', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');

      await queue.validate(token.token);

      const details = await queue.getTokenDetails(token.token);
      expect(details?.used).toBe(true);
    });

    it('should throw on invalid token', async () => {
      await expect(queue.validate('non-existent-token')).rejects.toThrow(ApprovalError);
      await expect(queue.validate('non-existent-token')).rejects.toThrow('Approval token not found');
    });

    it('should throw on already-used token (one-time use)', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');

      // First use
      await queue.validate(token.token);

      // Second use should fail
      await expect(queue.validate(token.token)).rejects.toThrow('already used');
    });

    it('should throw on expired token', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');

      // Wait for expiry (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      await expect(queue.validate(token.token)).rejects.toThrow('expired');
    });

    it('should prevent replay attacks (one-time use enforcement)', async () => {
      const token = await queue.enqueue('shell.execute_command', { command: 'rm -rf /' }, 'principal', 'conn');

      // Legitimate use
      const result = await queue.validate(token.token);
      expect(result.used).toBe(true);

      // Replay attempt should fail
      await expect(queue.validate(token.token)).rejects.toThrow('already used');
    });
  });

  // ==========================================================================
  // Token Details
  // ==========================================================================

  describe('getTokenDetails', () => {
    it('should return token without consuming it', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');

      const details1 = await queue.getTokenDetails(token.token);
      const details2 = await queue.getTokenDetails(token.token);

      expect(details1?.used).toBe(false);
      expect(details2?.used).toBe(false);
    });

    it('should return null for non-existent token', async () => {
      const details = await queue.getTokenDetails('fake-token');
      expect(details).toBeNull();
    });
  });

  // ==========================================================================
  // Pending for Principal
  // ==========================================================================

  describe('getPendingForPrincipal', () => {
    it('should return only pending (non-used, non-expired) tokens', async () => {
      const principal = '550e8400-e29b-41d4-a716-446655440000';

      // Create multiple tokens
      const token1 = await queue.enqueue('tool1', {}, principal, 'conn');
      const token2 = await queue.enqueue('tool2', {}, principal, 'conn');
      const token3 = await queue.enqueue('tool3', {}, 'other-principal', 'conn');

      // Use one
      await queue.validate(token1.token);

      const pending = await queue.getPendingForPrincipal(principal);

      expect(pending).toHaveLength(1);
      expect(pending[0].token).toBe(token2.token);
    });

    it('should not include expired tokens', async () => {
      const principal = 'test-principal-uuid';
      await queue.enqueue('tool', {}, principal, 'conn');

      // Wait for expiry (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      const pending = await queue.getPendingForPrincipal(principal);
      expect(pending).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Cancel
  // ==========================================================================

  describe('cancel', () => {
    it('should remove pending token', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');

      const cancelled = await queue.cancel(token.token);

      expect(cancelled).toBe(true);
      expect(await queue.getTokenDetails(token.token)).toBeNull();
    });

    it('should return false for non-existent token', async () => {
      const cancelled = await queue.cancel('fake-token');
      expect(cancelled).toBe(false);
    });

    it('should return false for already-used token', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');
      await queue.validate(token.token);

      const cancelled = await queue.cancel(token.token);
      expect(cancelled).toBe(false);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('should remove expired tokens', async () => {
      await queue.enqueue('tool1', {}, 'principal', 'conn');
      await queue.enqueue('tool2', {}, 'principal', 'conn');

      // Wait for expiry (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      const removed = await queue.cleanup();
      expect(removed).toBe(2);
    });

    it('should remove used tokens', async () => {
      const token = await queue.enqueue('tool', {}, 'principal', 'conn');
      await queue.validate(token.token);

      const removed = await queue.cleanup();
      expect(removed).toBe(1);
    });
  });

  // ==========================================================================
  // Stats
  // ==========================================================================

  describe('getStats', () => {
    it('should return correct counts', async () => {
      // Create some tokens
      const token1 = await queue.enqueue('tool1', {}, 'principal', 'conn');
      await queue.enqueue('tool2', {}, 'principal', 'conn');
      await queue.enqueue('tool3', {}, 'principal', 'conn');

      // Use one
      await queue.validate(token1.token);

      const stats = queue.getStats();

      expect(stats.pending).toBe(2);
      expect(stats.used).toBe(1);
      expect(stats.expired).toBe(0);
    });
  });

  // ==========================================================================
  // Args Hashing
  // ==========================================================================

  describe('args hashing', () => {
    it('should produce consistent hashes for same args', async () => {
      const args = { key: 'value', nested: { a: 1 } };

      const token1 = await queue.enqueue('tool', args, 'principal', 'conn');
      const token2 = await queue.enqueue('tool', args, 'principal', 'conn');

      expect(token1.args_hash).toBe(token2.args_hash);
    });

    it('should produce different hashes for different args', async () => {
      const token1 = await queue.enqueue('tool', { key: 'value1' }, 'principal', 'conn');
      const token2 = await queue.enqueue('tool', { key: 'value2' }, 'principal', 'conn');

      expect(token1.args_hash).not.toBe(token2.args_hash);
    });
  });
});
