/**
 * Tool Pattern Recognition Tests
 * Sprint 51 - Day 7-8 - Composio Integration Phase 2
 *
 * @module tests/tools/tool-patterns
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolPatternRecognizer,
  createToolPatternRecognizer,
  type ToolPattern,
} from '../../src/tools/tool-patterns.js';

describe('ToolPatternRecognizer', () => {
  let recognizer: ToolPatternRecognizer;
  const principal_id = 'user-123';

  beforeEach(() => {
    recognizer = createToolPatternRecognizer({
      minFrequencyForAutoApprove: 3, // Lower for tests
      minSuccessRateForAutoApprove: 0.9,
    });
  });

  // ===========================================================================
  // Pattern Recording
  // ===========================================================================

  describe('Pattern Recording', () => {
    it('should create new pattern on first usage', () => {
      const pattern = recognizer.recordToolUsage(
        principal_id,
        'github.get_repo',
        { repo: 'test/repo' },
        true,
        'READ'
      );

      expect(pattern.id).toBeDefined();
      expect(pattern.tool_name).toBe('github.get_repo');
      expect(pattern.frequency).toBe(1);
      expect(pattern.success_rate).toBe(1);
      expect(pattern.auto_approve_eligible).toBe(false);
    });

    it('should update existing pattern on repeated usage', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');
      const pattern = recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo2' }, true, 'READ');

      expect(pattern.frequency).toBe(2);
      expect(pattern.success_rate).toBe(1);
    });

    it('should track success rate correctly', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, false, 'READ');
      const pattern = recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');

      expect(pattern.frequency).toBe(3);
      expect(pattern.success_rate).toBeCloseTo(2 / 3, 2);
    });

    it('should become auto-approve eligible after threshold', () => {
      // Record 3 successful uses (our test threshold)
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');
      const pattern = recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');

      expect(pattern.auto_approve_eligible).toBe(true);
    });

    it('should not be auto-approve eligible with low success rate', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, false, 'READ');
      const pattern = recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test/repo' }, true, 'READ');

      expect(pattern.auto_approve_eligible).toBe(false);
    });
  });

  // ===========================================================================
  // Pattern Matching
  // ===========================================================================

  describe('Auto-Approve Check', () => {
    it('should return eligible for matching auto-approve pattern', () => {
      // Build up eligibility
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'owner/repo' }, true, 'READ');
      }

      const check = recognizer.checkAutoApprove(principal_id, 'github.get_repo', { repo: 'owner/new-repo' });

      expect(check.eligible).toBe(true);
      expect(check.pattern).toBeDefined();
    });

    it('should not be eligible for different tool', () => {
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'owner/repo' }, true, 'READ');
      }

      const check = recognizer.checkAutoApprove(principal_id, 'github.create_issue', { title: 'Test' });

      expect(check.eligible).toBe(false);
      expect(check.reason).toContain('No matching pattern');
    });

    it('should match prefix patterns', () => {
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'myorg/repo' + i }, true, 'READ');
      }

      const check = recognizer.checkAutoApprove(principal_id, 'github.get_repo', { repo: 'myorg/new-repo' });

      expect(check.eligible).toBe(true);
    });

    it('should match domain patterns', () => {
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(
          principal_id,
          'gmail.send_message',
          { to: `user${i}@company.com` },
          true,
          'WRITE'
        );
      }

      const check = recognizer.checkAutoApprove(
        principal_id,
        'gmail.send_message',
        { to: 'newuser@company.com' }
      );

      expect(check.eligible).toBe(true);
    });
  });

  // ===========================================================================
  // Pattern Retrieval
  // ===========================================================================

  describe('Pattern Retrieval', () => {
    it('should get patterns for principal', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'gmail.list_messages', {}, true, 'READ');

      const patterns = recognizer.getPatterns(principal_id);

      expect(patterns.length).toBe(2);
    });

    it('should get auto-approve patterns only', () => {
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      }
      recognizer.recordToolUsage(principal_id, 'gmail.list_messages', {}, true, 'READ');

      const autoApprove = recognizer.getAutoApprovePatterns(principal_id);

      expect(autoApprove.length).toBe(1);
      expect(autoApprove[0].tool_name).toBe('github.get_repo');
    });

    it('should return empty for unknown principal', () => {
      const patterns = recognizer.getPatterns('unknown-user');
      expect(patterns).toEqual([]);
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe('Statistics', () => {
    it('should calculate stats correctly', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'gmail.send_message', { to: 'test' }, true, 'WRITE');
      recognizer.recordToolUsage(principal_id, 'gmail.send_message', { to: 'test' }, false, 'WRITE');

      const stats = recognizer.getStats(principal_id);

      expect(stats.totalPatterns).toBe(2);
      expect(stats.autoApprovePatterns).toBe(1);
      expect(stats.topTools[0].tool).toBe('github.get_repo');
      expect(stats.topTools[0].frequency).toBe(3);
    });

    it('should handle empty stats', () => {
      const stats = recognizer.getStats('unknown');

      expect(stats.totalPatterns).toBe(0);
      expect(stats.autoApprovePatterns).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
    });
  });

  // ===========================================================================
  // Preference Model
  // ===========================================================================

  describe('Preference Model', () => {
    it('should build preference model', () => {
      // Add various patterns
      for (let i = 0; i < 5; i++) {
        recognizer.recordToolUsage(principal_id, 'github.create_issue', { title: 'Bug' }, true, 'WRITE');
      }
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'gmail.send_message', { to: 'ceo@company.com' }, true, 'WRITE');
      }

      const model = recognizer.getPreferenceModel(principal_id);

      expect(model.preferred_tools.get('issues')).toContain('github.create_issue');
      expect(model.preferred_tools.get('email')).toContain('gmail.send_message');
      expect(model.common_workflows).toContain('Create GitHub issue from bug report');
    });

    it('should infer risk tolerance', () => {
      // Mostly WRITE operations
      for (let i = 0; i < 10; i++) {
        recognizer.recordToolUsage(principal_id, 'github.create_issue', { title: 'Issue' + i }, true, 'WRITE');
      }

      const model = recognizer.getPreferenceModel(principal_id);

      expect(model.risk_tolerance).toBe('high');
    });

    it('should infer approval speed', () => {
      // Build up auto-approve patterns
      for (let i = 0; i < 3; i++) {
        recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
        recognizer.recordToolUsage(principal_id, 'gmail.list_messages', {}, true, 'READ');
      }

      const model = recognizer.getPreferenceModel(principal_id);

      expect(model.approval_speed).toBe('fast');
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe('Cleanup', () => {
    it('should clear all patterns', () => {
      recognizer.recordToolUsage(principal_id, 'github.get_repo', { repo: 'test' }, true, 'READ');
      recognizer.recordToolUsage(principal_id, 'gmail.send_message', {}, true, 'WRITE');

      recognizer.clearPatterns();

      const patterns = recognizer.getPatterns(principal_id);
      expect(patterns).toEqual([]);
    });
  });

  // ===========================================================================
  // Pattern Extraction
  // ===========================================================================

  describe('Pattern Extraction', () => {
    it('should extract domain pattern from email', () => {
      recognizer.recordToolUsage(
        principal_id,
        'gmail.send_message',
        { to: 'user@example.com' },
        true,
        'WRITE'
      );

      const patterns = recognizer.getPatterns(principal_id);
      expect(patterns[0].argument_pattern.to.type).toBe('domain');
      expect(patterns[0].argument_pattern.to.value).toBe('*@example.com');
    });

    it('should extract prefix pattern from repo', () => {
      recognizer.recordToolUsage(
        principal_id,
        'github.get_repo',
        { repo: 'owner/repo-name' },
        true,
        'READ'
      );

      const patterns = recognizer.getPatterns(principal_id);
      expect(patterns[0].argument_pattern.repo.type).toBe('prefix');
      expect(patterns[0].argument_pattern.repo.value).toBe('owner/*');
    });

    it('should use exact match for short strings', () => {
      recognizer.recordToolUsage(
        principal_id,
        'slack.send_message',
        { channel: 'general' },
        true,
        'WRITE'
      );

      const patterns = recognizer.getPatterns(principal_id);
      expect(patterns[0].argument_pattern.channel.type).toBe('exact');
      expect(patterns[0].argument_pattern.channel.value).toBe('general');
    });
  });
});
