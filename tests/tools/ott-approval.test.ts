/**
 * OTT Approval Service Tests
 * Sprint 51 - Day 5-6 - Composio Integration Phase 2
 *
 * @module tests/tools/ott-approval
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OTTApprovalService,
  OTTApprovalError,
  createOTTApprovalService,
  type OTTApprovalConfig,
} from '../../src/tools/ott-approval.js';
import type { PolicyDecision, ToolRisk } from '../../src/tools/types.js';

// =============================================================================
// Mock Setup
// =============================================================================

function createMockTelegramChannel() {
  return {
    name: 'telegram',
    send: vi.fn().mockResolvedValue(true),
    sendAlert: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createMockDecision(
  risk: ToolRisk = 'WRITE',
  token?: string
): PolicyDecision {
  return {
    action: 'require_approval',
    risk,
    reason: 'Requires CEO approval',
    approval_token: token ?? `test-token-${Date.now()}`,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
  };
}

describe('OTTApprovalService', () => {
  let service: OTTApprovalService;
  let mockTelegram: ReturnType<typeof createMockTelegramChannel>;

  beforeEach(() => {
    mockTelegram = createMockTelegramChannel();

    service = createOTTApprovalService({
      telegramChannel: mockTelegram as unknown as OTTApprovalConfig['telegramChannel'],
      preferredChannel: 'telegram',
      ceoChatId: '123456789',
      approvalTimeoutMs: 1000, // Short timeout for tests
    });
  });

  afterEach(() => {
    service.dispose();
  });

  // ===========================================================================
  // Basic Approval Flow
  // ===========================================================================

  describe('Basic Approval Flow', () => {
    it('should send approval request to telegram', async () => {
      const decision = createMockDecision('WRITE', 'test-token-123');

      // Start request (don't await - it will timeout)
      const promise = service.requestApproval(
        decision,
        'github.create_issue',
        'user-123'
      );

      // Simulate CEO approval
      setTimeout(() => {
        service.handleApprovalResponse('test-tok', true);
      }, 100);

      const approved = await promise;

      expect(approved).toBe(true);
      expect(mockTelegram.sendAlert).toHaveBeenCalled();
    });

    it('should handle rejection', async () => {
      const decision = createMockDecision('WRITE', 'reject-token-123');

      const promise = service.requestApproval(
        decision,
        'gmail.send_message',
        'user-123'
      );

      setTimeout(() => {
        service.handleApprovalResponse('reject-t', false);
      }, 100);

      const approved = await promise;

      expect(approved).toBe(false);
    });

    it('should throw on timeout', async () => {
      const decision = createMockDecision('WRITE');

      await expect(
        service.requestApproval(decision, 'slack.send_message', 'user-123')
      ).rejects.toThrow(OTTApprovalError);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw if decision has no token', async () => {
      const decision: PolicyDecision = {
        action: 'require_approval',
        risk: 'WRITE',
        reason: 'Test',
        // No approval_token
      };

      try {
        await service.requestApproval(decision, 'test.tool', 'user-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OTTApprovalError);
        expect((error as OTTApprovalError).code).toBe('MISSING_TOKEN');
      }
    });

    it('should throw if no channel available', async () => {
      mockTelegram.isAvailable.mockResolvedValue(false);

      const decision = createMockDecision();

      try {
        await service.requestApproval(decision, 'test.tool', 'user-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OTTApprovalError);
        expect((error as OTTApprovalError).code).toBe('NO_CHANNEL');
      }
    });

    it('should throw if send fails', async () => {
      mockTelegram.sendAlert.mockResolvedValue(false);

      const decision = createMockDecision();

      try {
        await service.requestApproval(decision, 'test.tool', 'user-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OTTApprovalError);
        expect((error as OTTApprovalError).code).toBe('SEND_FAILED');
      }
    });
  });

  // ===========================================================================
  // Token Prefix Matching
  // ===========================================================================

  describe('Token Prefix Matching', () => {
    it('should match token by prefix', async () => {
      const decision = createMockDecision('WRITE', 'abc12345-full-token');

      const promise = service.requestApproval(
        decision,
        'github.create_issue',
        'user-123'
      );

      setTimeout(() => {
        // Use short prefix
        const matched = service.handleApprovalResponse('abc12345', true);
        expect(matched).toBe(true);
      }, 100);

      const approved = await promise;
      expect(approved).toBe(true);
    });

    it('should return false for unknown token', () => {
      const matched = service.handleApprovalResponse('unknown-token', true);
      expect(matched).toBe(false);
    });
  });

  // ===========================================================================
  // Cancellation
  // ===========================================================================

  describe('Cancellation', () => {
    it('should cancel pending approval', async () => {
      const decision = createMockDecision('WRITE', 'cancel-token-123');

      const promise = service.requestApproval(
        decision,
        'test.tool',
        'user-123'
      );

      setTimeout(() => {
        const cancelled = service.cancelPendingApproval('cancel-token-123');
        expect(cancelled).toBe(true);
      }, 100);

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OTTApprovalError);
        expect((error as OTTApprovalError).code).toBe('CANCELLED');
      }
    });

    it('should return false for non-existent token', () => {
      const cancelled = service.cancelPendingApproval('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe('Statistics', () => {
    it('should track approval stats', async () => {
      const decision = createMockDecision('WRITE', 'stats-token-1');

      const promise = service.requestApproval(
        decision,
        'test.tool',
        'user-123'
      );

      setTimeout(() => {
        service.handleApprovalResponse('stats-to', true);
      }, 100);

      await promise;

      const stats = service.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(0);
    });

    it('should return recent history', async () => {
      const decision = createMockDecision('WRITE', 'history-token');

      const promise = service.requestApproval(
        decision,
        'test.tool',
        'user-123'
      );

      setTimeout(() => {
        service.handleApprovalResponse('history-', true);
      }, 100);

      await promise;

      const history = service.getRecentHistory(5);
      expect(history.length).toBe(1);
      expect(history[0].approved).toBe(true);
    });
  });

  // ===========================================================================
  // Disposal
  // ===========================================================================

  describe('Disposal', () => {
    it('should reject pending on dispose', async () => {
      const decision = createMockDecision('WRITE', 'dispose-token');

      const promise = service.requestApproval(
        decision,
        'test.tool',
        'user-123'
      );

      setTimeout(() => {
        service.dispose();
      }, 100);

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OTTApprovalError);
        expect((error as OTTApprovalError).code).toBe('DISPOSED');
      }
    });
  });
});
