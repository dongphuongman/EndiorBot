/**
 * PolicyEngine Tests
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 *
 * Tests for risk classification, rate limiting, and policy enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolicyEngine } from '../../src/tools/policy-engine.js';
import { ApprovalQueue } from '../../src/tools/approval-queue.js';

describe('PolicyEngine', () => {
  let policyEngine: PolicyEngine;
  let approvalQueue: ApprovalQueue;
  const validPrincipalId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    approvalQueue = new ApprovalQueue({ tokenExpiryMs: 5000 });
    policyEngine = new PolicyEngine(approvalQueue);
  });

  afterEach(() => {
    approvalQueue.dispose();
  });

  // ==========================================================================
  // Whitelist Enforcement
  // ==========================================================================

  describe('whitelist enforcement', () => {
    it('should allow Phase 1 whitelisted tools', async () => {
      const result = await policyEngine.evaluate(
        'github.get_repo',
        { owner: 'test', repo: 'repo' },
        validPrincipalId
      );

      expect(result.action).toBe('allow');
      expect(result.risk).toBe('READ');
    });

    it('should deny non-whitelisted tools', async () => {
      const result = await policyEngine.evaluate(
        'dangerous.unknown_tool',
        {},
        validPrincipalId
      );

      expect(result.action).toBe('deny');
      expect(result.reason).toContain('not in Phase 1 whitelist');
    });

    it('should return all whitelisted tools', () => {
      const tools = policyEngine.getWhitelistedTools();

      expect(tools).toContain('github.get_repo');
      expect(tools).toContain('gmail.send_message');
      expect(tools).toContain('shell.execute_command');
      expect(tools).toHaveLength(10); // Phase 1: 10 tools
    });
  });

  // ==========================================================================
  // Risk Classification
  // ==========================================================================

  describe('risk classification', () => {
    it('should classify READ tools correctly', () => {
      expect(policyEngine.getToolRisk('github.get_repo')).toBe('READ');
      expect(policyEngine.getToolRisk('gmail.list_messages')).toBe('READ');
      expect(policyEngine.getToolRisk('google_calendar.list_events')).toBe('READ');
      expect(policyEngine.getToolRisk('slack.list_channels')).toBe('READ');
    });

    it('should classify WRITE tools correctly', () => {
      expect(policyEngine.getToolRisk('github.create_issue')).toBe('WRITE');
      expect(policyEngine.getToolRisk('gmail.send_message')).toBe('WRITE');
      expect(policyEngine.getToolRisk('google_calendar.create_event')).toBe('WRITE');
      expect(policyEngine.getToolRisk('slack.send_message')).toBe('WRITE');
    });

    it('should classify DESTRUCTIVE tools correctly', () => {
      expect(policyEngine.getToolRisk('shell.execute_command')).toBe('DESTRUCTIVE');
    });

    it('should return null for unknown tools', () => {
      expect(policyEngine.getToolRisk('unknown.tool')).toBeNull();
    });
  });

  // ==========================================================================
  // Auto-Approval for READ Tools
  // ==========================================================================

  describe('auto-approval for READ tools', () => {
    it('should auto-approve READ tools', async () => {
      const result = await policyEngine.evaluate(
        'github.get_issue',
        { owner: 'test', repo: 'repo', issue_number: 1 },
        validPrincipalId
      );

      expect(result.action).toBe('allow');
      expect(result.reason).toContain('auto-approved');
    });

    it('should require approval for WRITE tools', async () => {
      const result = await policyEngine.evaluate(
        'github.create_issue',
        { owner: 'test', repo: 'repo', title: 'New Issue' },
        validPrincipalId
      );

      expect(result.action).toBe('require_approval');
      expect(result.approval_token).toBeDefined();
      expect(result.expires_at).toBeInstanceOf(Date);
    });

    it('should require approval for DESTRUCTIVE tools', async () => {
      const result = await policyEngine.evaluate(
        'shell.execute_command',
        { command: 'ls -la' },
        validPrincipalId
      );

      expect(result.action).toBe('require_approval');
      expect(result.risk).toBe('DESTRUCTIVE');
    });

    it('should respect autoApproveRead config', async () => {
      const strictEngine = new PolicyEngine(approvalQueue, { autoApproveRead: false });

      const result = await strictEngine.evaluate(
        'github.get_repo',
        { owner: 'test', repo: 'repo' },
        validPrincipalId
      );

      expect(result.action).toBe('require_approval');
    });
  });

  // ==========================================================================
  // Principal ID Validation
  // ==========================================================================

  describe('principal ID validation', () => {
    it('should accept valid UUID', async () => {
      const result = await policyEngine.evaluate(
        'github.get_repo',
        {},
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(result.action).not.toBe('deny');
    });

    it('should reject invalid UUID format', async () => {
      const result = await policyEngine.evaluate(
        'github.get_repo',
        {},
        'not-a-uuid'
      );

      expect(result.action).toBe('deny');
      expect(result.reason).toContain('Invalid principal_id');
    });

    it('should reject empty principal ID', async () => {
      const result = await policyEngine.evaluate(
        'github.get_repo',
        {},
        ''
      );

      expect(result.action).toBe('deny');
    });
  });

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  describe('rate limiting', () => {
    it('should enforce per-tool rate limit', async () => {
      // Default: 10 per tool per minute
      const engine = new PolicyEngine(approvalQueue, { perToolPerMinute: 3 });

      // Make 3 successful calls
      for (let i = 0; i < 3; i++) {
        const result = await engine.evaluate('github.get_repo', {}, validPrincipalId);
        expect(result.action).toBe('allow');
      }

      // 4th call should be denied
      const result = await engine.evaluate('github.get_repo', {}, validPrincipalId);
      expect(result.action).toBe('deny');
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should enforce per-principal rate limit', async () => {
      const engine = new PolicyEngine(approvalQueue, { perPrincipalPerMinute: 5 });

      // Call different tools
      await engine.evaluate('github.get_repo', {}, validPrincipalId);
      await engine.evaluate('github.get_issue', {}, validPrincipalId);
      await engine.evaluate('gmail.list_messages', {}, validPrincipalId);
      await engine.evaluate('google_calendar.list_events', {}, validPrincipalId);
      await engine.evaluate('slack.list_channels', {}, validPrincipalId);

      // 6th call should be denied
      const result = await engine.evaluate('github.get_repo', {}, validPrincipalId);
      expect(result.action).toBe('deny');
      expect(result.reason).toContain('total calls');
    });

    it('should enforce destructive operation limit', async () => {
      const engine = new PolicyEngine(approvalQueue, { destructivePerHour: 2 });

      // Make 2 destructive calls (these require approval but still count)
      await engine.evaluate('shell.execute_command', { command: 'ls' }, validPrincipalId);
      await engine.evaluate('shell.execute_command', { command: 'pwd' }, validPrincipalId);

      // 3rd destructive call should be denied
      const result = await engine.evaluate('shell.execute_command', { command: 'whoami' }, validPrincipalId);
      expect(result.action).toBe('deny');
      expect(result.reason).toContain('Destructive operation limit');
    });

    it('should not share rate limits between principals', async () => {
      const engine = new PolicyEngine(approvalQueue, { perToolPerMinute: 2 });

      const principal1 = '550e8400-e29b-41d4-a716-446655440001';
      const principal2 = '550e8400-e29b-41d4-a716-446655440002';

      // Principal 1 uses quota
      await engine.evaluate('github.get_repo', {}, principal1);
      await engine.evaluate('github.get_repo', {}, principal1);

      // Principal 2 should still have quota
      const result = await engine.evaluate('github.get_repo', {}, principal2);
      expect(result.action).toBe('allow');
    });
  });

  // ==========================================================================
  // Rate Limit Stats
  // ==========================================================================

  describe('rate limit stats', () => {
    it('should return accurate stats', async () => {
      await policyEngine.evaluate('github.get_repo', {}, validPrincipalId);
      await policyEngine.evaluate('github.get_issue', {}, validPrincipalId);
      await policyEngine.evaluate('github.get_repo', {}, validPrincipalId);

      const stats = policyEngine.getRateLimitStats(validPrincipalId);

      expect(stats.totalCalls).toBe(3);
      expect(stats.toolCounts['github.get_repo']).toBe(2);
      expect(stats.toolCounts['github.get_issue']).toBe(1);
    });

    it('should return limit configuration', () => {
      const engine = new PolicyEngine(approvalQueue, {
        perToolPerMinute: 15,
        perPrincipalPerMinute: 50,
        destructivePerHour: 10,
      });

      const stats = engine.getRateLimitStats(validPrincipalId);

      expect(stats.limits.perToolPerMinute).toBe(15);
      expect(stats.limits.perPrincipalPerMinute).toBe(50);
      expect(stats.limits.destructivePerHour).toBe(10);
    });
  });

  // ==========================================================================
  // Rate Limit Reset
  // ==========================================================================

  describe('rate limit reset', () => {
    it('should reset rate limits for specific principal', async () => {
      const engine = new PolicyEngine(approvalQueue, { perToolPerMinute: 2 });

      // Exhaust quota
      await engine.evaluate('github.get_repo', {}, validPrincipalId);
      await engine.evaluate('github.get_repo', {}, validPrincipalId);

      // Should be blocked
      let result = await engine.evaluate('github.get_repo', {}, validPrincipalId);
      expect(result.action).toBe('deny');

      // Reset
      engine.resetRateLimits(validPrincipalId);

      // Should work again
      result = await engine.evaluate('github.get_repo', {}, validPrincipalId);
      expect(result.action).toBe('allow');
    });

    it('should reset all rate limits', async () => {
      const engine = new PolicyEngine(approvalQueue, { perToolPerMinute: 1 });

      const principal1 = '550e8400-e29b-41d4-a716-446655440001';
      const principal2 = '550e8400-e29b-41d4-a716-446655440002';

      // Exhaust both quotas
      await engine.evaluate('github.get_repo', {}, principal1);
      await engine.evaluate('github.get_repo', {}, principal2);

      // Reset all
      engine.resetRateLimits();

      // Both should work
      const result1 = await engine.evaluate('github.get_repo', {}, principal1);
      const result2 = await engine.evaluate('github.get_repo', {}, principal2);

      expect(result1.action).toBe('allow');
      expect(result2.action).toBe('allow');
    });
  });

  // ==========================================================================
  // Tool Allowed Check
  // ==========================================================================

  describe('isToolAllowed', () => {
    it('should return true for whitelisted tools', () => {
      expect(policyEngine.isToolAllowed('github.get_repo')).toBe(true);
      expect(policyEngine.isToolAllowed('shell.execute_command')).toBe(true);
    });

    it('should return false for non-whitelisted tools', () => {
      expect(policyEngine.isToolAllowed('unknown.tool')).toBe(false);
      expect(policyEngine.isToolAllowed('github.delete_repo')).toBe(false);
    });
  });
});
