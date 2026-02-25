/**
 * Brain Layer 2: Patterns Tests
 *
 * Tests for pattern storage operations.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addOrIncrementPattern,
  addPattern,
  clearPatterns,
  countPatternsByType,
  deletePattern,
  deletePatternBySignature,
  findFixHint,
  getAllPatterns,
  getPattern,
  getPatternBySignature,
  getPatternCount,
  getPatternsByType,
  getPatternsWithFixHints,
  getRecentPatterns,
  getTopPatterns,
  importLegacyPatterns,
  incrementCount,
  incrementCountBySignature,
  recordErrorPattern,
  recordFixPattern,
  recordSuccessPattern,
  recordWarningPattern,
  searchPatterns,
  updatePattern,
} from '../../../src/brain/layers/patterns.js';
import { initializeBrain } from '../../../src/brain/storage.js';
import type { PatternEntry } from '../../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `patterns-${Date.now()}`);

describe('PatternsLayer', () => {
  beforeEach(() => {
    process.env['ENDIORBOT_BRAIN_PATH'] = TEST_BRAIN_PATH;
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    initializeBrain();
  });

  afterEach(() => {
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    delete process.env['ENDIORBOT_BRAIN_PATH'];
  });

  // ===========================================================================
  // Add Patterns
  // ===========================================================================

  describe('addPattern', () => {
    it('should add pattern with auto-generated id and timestamps', () => {
      const pattern = addPattern({
        signature: 'TypeError: undefined is not a function',
        type: 'error',
        fixHint: 'Check if function exists before calling',
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(pattern.signature).toBe('TypeError: undefined is not a function');
      expect(pattern.type).toBe('error');
      expect(pattern.fixHint).toBe('Check if function exists before calling');
      expect(pattern.count).toBe(1);
      expect(pattern.firstSeen).toBeDefined();
      expect(pattern.lastSeen).toBeDefined();
    });

    it('should reject duplicate signature', () => {
      addPattern({ signature: 'unique-error', type: 'error' });

      expect(() =>
        addPattern({ signature: 'unique-error', type: 'error' })
      ).toThrow('already exists');
    });

    it('should allow different signatures', () => {
      const p1 = addPattern({ signature: 'error-1', type: 'error' });
      const p2 = addPattern({ signature: 'error-2', type: 'error' });

      expect(p1.id).not.toBe(p2.id);
      expect(getPatternCount()).toBe(2);
    });
  });

  describe('addOrIncrementPattern', () => {
    it('should add new pattern if not exists', () => {
      const pattern = addOrIncrementPattern({
        signature: 'new-error',
        type: 'error',
      });

      expect(pattern.count).toBe(1);
    });

    it('should increment count if pattern exists', () => {
      addPattern({ signature: 'existing-error', type: 'error' });

      const updated = addOrIncrementPattern({
        signature: 'existing-error',
        type: 'error',
      });

      expect(updated.count).toBe(2);
    });
  });

  // ===========================================================================
  // Get Patterns
  // ===========================================================================

  describe('getPattern', () => {
    it('should return pattern by id', () => {
      const created = addPattern({ signature: 'test-error', type: 'error' });

      const found = getPattern(created.id);
      expect(found).toBeDefined();
      expect(found?.signature).toBe('test-error');
    });

    it('should return undefined for non-existent id', () => {
      const found = getPattern('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('getPatternBySignature', () => {
    it('should return pattern by signature', () => {
      addPattern({ signature: 'find-me', type: 'error' });

      const found = getPatternBySignature('find-me');
      expect(found).toBeDefined();
      expect(found?.signature).toBe('find-me');
    });

    it('should return undefined for non-existent signature', () => {
      const found = getPatternBySignature('not-found');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllPatterns', () => {
    it('should return empty array when no patterns', () => {
      const patterns = getAllPatterns();
      expect(patterns).toEqual([]);
    });

    it('should return all patterns sorted by count', () => {
      const p1 = addPattern({ signature: 'low-count', type: 'error' });
      const p2 = addPattern({ signature: 'high-count', type: 'error' });
      incrementCount(p2.id);
      incrementCount(p2.id);

      const patterns = getAllPatterns();
      expect(patterns[0]?.signature).toBe('high-count');
      expect(patterns[0]?.count).toBe(3);
      expect(patterns[1]?.signature).toBe('low-count');
      expect(patterns[1]?.count).toBe(1);
    });
  });

  describe('getPatternsByType', () => {
    beforeEach(() => {
      addPattern({ signature: 'error-1', type: 'error' });
      addPattern({ signature: 'error-2', type: 'error' });
      addPattern({ signature: 'fix-1', type: 'fix' });
      addPattern({ signature: 'success-1', type: 'success' });
    });

    it('should return patterns of specific type', () => {
      const errors = getPatternsByType('error');
      expect(errors).toHaveLength(2);
      expect(errors.every((p) => p.type === 'error')).toBe(true);
    });

    it('should return empty for unused type', () => {
      const warnings = getPatternsByType('warning');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('getTopPatterns', () => {
    beforeEach(() => {
      const p1 = addPattern({ signature: 'count-1', type: 'error' });
      const p2 = addPattern({ signature: 'count-5', type: 'error' });
      const p3 = addPattern({ signature: 'count-3', type: 'error' });

      // Increment to different counts
      for (let i = 0; i < 4; i++) incrementCount(p2.id);
      for (let i = 0; i < 2; i++) incrementCount(p3.id);
    });

    it('should return top N patterns by count', () => {
      const top = getTopPatterns(2);
      expect(top).toHaveLength(2);
      expect(top[0]?.count).toBe(5);
      expect(top[1]?.count).toBe(3);
    });
  });

  describe('getRecentPatterns', () => {
    it('should return most recently seen patterns', async () => {
      addPattern({ signature: 'old', type: 'error' });
      await new Promise((r) => setTimeout(r, 10));
      addPattern({ signature: 'new', type: 'error' });

      const recent = getRecentPatterns(1);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.signature).toBe('new');
    });
  });

  // ===========================================================================
  // Update Patterns
  // ===========================================================================

  describe('updatePattern', () => {
    it('should update pattern fields', () => {
      const created = addPattern({ signature: 'update-me', type: 'error' });

      const updated = updatePattern(created.id, {
        fixHint: 'New fix hint',
        metadata: { severity: 'high' },
      });

      expect(updated.fixHint).toBe('New fix hint');
      expect(updated.metadata).toEqual({ severity: 'high' });
      expect(updated.signature).toBe('update-me'); // Unchanged
    });

    it('should preserve id and firstSeen', () => {
      const created = addPattern({ signature: 'preserve-me', type: 'error' });
      const originalFirstSeen = created.firstSeen;

      const updated = updatePattern(created.id, { fixHint: 'updated' });

      expect(updated.id).toBe(created.id);
      expect(updated.firstSeen).toBe(originalFirstSeen);
    });

    it('should update lastSeen', async () => {
      const created = addPattern({ signature: 'lastseen-test', type: 'error' });
      const originalLastSeen = created.lastSeen;

      await new Promise((r) => setTimeout(r, 10));
      const updated = updatePattern(created.id, { fixHint: 'updated' });

      expect(new Date(updated.lastSeen).getTime()).toBeGreaterThan(
        new Date(originalLastSeen).getTime()
      );
    });

    it('should throw for non-existent pattern', () => {
      expect(() =>
        updatePattern('non-existent', { fixHint: 'test' })
      ).toThrow('not found');
    });
  });

  describe('incrementCount', () => {
    it('should increment count by 1', () => {
      const created = addPattern({ signature: 'increment-me', type: 'error' });
      expect(created.count).toBe(1);

      const updated = incrementCount(created.id);
      expect(updated.count).toBe(2);

      const again = incrementCount(created.id);
      expect(again.count).toBe(3);
    });

    it('should update lastSeen', async () => {
      const created = addPattern({ signature: 'lastseen-inc', type: 'error' });

      await new Promise((r) => setTimeout(r, 10));
      const updated = incrementCount(created.id);

      expect(new Date(updated.lastSeen).getTime()).toBeGreaterThan(
        new Date(created.lastSeen).getTime()
      );
    });

    it('should throw for non-existent pattern', () => {
      expect(() => incrementCount('non-existent')).toThrow('not found');
    });
  });

  describe('incrementCountBySignature', () => {
    it('should increment by signature', () => {
      addPattern({ signature: 'sig-inc', type: 'error' });

      const updated = incrementCountBySignature('sig-inc');
      expect(updated?.count).toBe(2);
    });

    it('should return undefined for non-existent signature', () => {
      const result = incrementCountBySignature('not-found');
      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // Delete Patterns
  // ===========================================================================

  describe('deletePattern', () => {
    it('should delete pattern by id', () => {
      const created = addPattern({ signature: 'delete-me', type: 'error' });
      expect(getPatternCount()).toBe(1);

      const result = deletePattern(created.id);
      expect(result).toBe(true);
      expect(getPatternCount()).toBe(0);
    });

    it('should return false for non-existent id', () => {
      const result = deletePattern('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('deletePatternBySignature', () => {
    it('should delete pattern by signature', () => {
      addPattern({ signature: 'del-by-sig', type: 'error' });

      const result = deletePatternBySignature('del-by-sig');
      expect(result).toBe(true);
      expect(getPatternCount()).toBe(0);
    });
  });

  describe('clearPatterns', () => {
    it('should remove all patterns', () => {
      addPattern({ signature: 'p1', type: 'error' });
      addPattern({ signature: 'p2', type: 'error' });
      expect(getPatternCount()).toBe(2);

      clearPatterns();
      expect(getPatternCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Count and Stats
  // ===========================================================================

  describe('countPatternsByType', () => {
    it('should count patterns by type', () => {
      addPattern({ signature: 'e1', type: 'error' });
      addPattern({ signature: 'e2', type: 'error' });
      addPattern({ signature: 'f1', type: 'fix' });
      addPattern({ signature: 's1', type: 'success' });

      const counts = countPatternsByType();
      expect(counts.get('error')).toBe(2);
      expect(counts.get('fix')).toBe(1);
      expect(counts.get('success')).toBe(1);
    });
  });

  // ===========================================================================
  // Search and Filter
  // ===========================================================================

  describe('searchPatterns', () => {
    beforeEach(() => {
      addPattern({ signature: 'TypeError: null', type: 'error', fixHint: 'add null check' });
      addPattern({ signature: 'ReferenceError: undefined', type: 'error' });
      addPattern({ signature: 'SyntaxError: missing', type: 'error', fixHint: 'fix syntax' });
    });

    it('should search by signature', () => {
      const results = searchPatterns('TypeError');
      expect(results).toHaveLength(1);
      expect(results[0]?.signature).toContain('TypeError');
    });

    it('should search by fixHint', () => {
      const results = searchPatterns('null check');
      expect(results).toHaveLength(1);
    });

    it('should be case-insensitive', () => {
      const results = searchPatterns('typeerror');
      expect(results).toHaveLength(1);
    });
  });

  describe('getPatternsWithFixHints', () => {
    it('should return only patterns with fix hints', () => {
      addPattern({ signature: 'with-hint', type: 'error', fixHint: 'do this' });
      addPattern({ signature: 'without-hint', type: 'error' });

      const withHints = getPatternsWithFixHints();
      expect(withHints).toHaveLength(1);
      expect(withHints[0]?.signature).toBe('with-hint');
    });
  });

  // ===========================================================================
  // Convenience Functions
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('should record error pattern', () => {
      const p = recordErrorPattern('test-error', 'fix hint');
      expect(p.type).toBe('error');
      expect(p.fixHint).toBe('fix hint');
    });

    it('should record fix pattern', () => {
      const p = recordFixPattern('test-fix', 'apply this fix');
      expect(p.type).toBe('fix');
      expect(p.fixHint).toBe('apply this fix');
    });

    it('should record success pattern', () => {
      const p = recordSuccessPattern('test-success');
      expect(p.type).toBe('success');
    });

    it('should record warning pattern', () => {
      const p = recordWarningPattern('test-warning', 'be careful');
      expect(p.type).toBe('warning');
      expect(p.fixHint).toBe('be careful');
    });

    it('should increment count on repeat', () => {
      recordErrorPattern('repeat-error');
      const second = recordErrorPattern('repeat-error');
      expect(second.count).toBe(2);
    });
  });

  describe('findFixHint', () => {
    beforeEach(() => {
      addPattern({
        signature: 'TypeError: cannot read property',
        type: 'error',
        fixHint: 'Add null check before accessing property',
      });
      addPattern({
        signature: 'undefined variable',
        type: 'error',
        fixHint: 'Declare variable before use',
      });
    });

    it('should find exact match', () => {
      const hint = findFixHint('TypeError: cannot read property');
      expect(hint).toBe('Add null check before accessing property');
    });

    it('should find partial match', () => {
      const hint = findFixHint('TypeError: cannot read property x of undefined');
      expect(hint).toBe('Add null check before accessing property');
    });

    it('should return undefined for no match', () => {
      const hint = findFixHint('completely different error');
      expect(hint).toBeUndefined();
    });
  });

  // ===========================================================================
  // Legacy Import
  // ===========================================================================

  describe('importLegacyPatterns', () => {
    it('should import new patterns', () => {
      const legacyPatterns = [
        { signature: 'legacy-1', fixHint: 'hint-1', count: 5 },
        { signature: 'legacy-2', fixHint: 'hint-2' },
      ];

      const imported = importLegacyPatterns(legacyPatterns);
      expect(imported).toBe(2);
      expect(getPatternCount()).toBe(2);

      const p1 = getPatternBySignature('legacy-1');
      expect(p1?.count).toBe(5);
      expect(p1?.fixHint).toBe('hint-1');
    });

    it('should update existing patterns', () => {
      addPattern({ signature: 'existing', type: 'error', fixHint: 'old hint' });

      const legacyPatterns = [
        { signature: 'existing', fixHint: 'new hint', count: 10 },
      ];

      const imported = importLegacyPatterns(legacyPatterns);
      expect(imported).toBe(0); // Not counted as new

      const p = getPatternBySignature('existing');
      expect(p?.fixHint).toBe('new hint');
      expect(p?.count).toBe(10);
    });
  });
});
