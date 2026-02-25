/**
 * Brain Digest Tests
 *
 * Tests for digest computation and comparison.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  compareBrainDigests,
  computeBrainDigest,
  computeLayerHashes,
  createBrainSnapshot,
  getDiffSummary,
  getDigestSummary,
  hasCEOProfileChanged,
  hasLayerChanged,
  isValidDigest,
  matchesSnapshot,
} from '../../src/brain/digest.js';
import { appendEvent } from '../../src/brain/layers/events.js';
import { setModel } from '../../src/brain/layers/mental-models.js';
import { addPattern } from '../../src/brain/layers/patterns.js';
import { setStructure } from '../../src/brain/layers/structures.js';
import {
  initializeBrain,
  writeCEOProfile,
} from '../../src/brain/storage.js';
import { DEFAULT_CEO_PROFILE } from '../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `digest-${Date.now()}`);

describe('BrainDigest', () => {
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
  // Digest Computation
  // ===========================================================================

  describe('computeBrainDigest', () => {
    it('should compute digest with all fields', () => {
      const digest = computeBrainDigest();

      expect(digest.hash).toBeDefined();
      expect(digest.hash.length).toBe(16); // 16 hex chars
      expect(digest.computedAt).toBeDefined();
      expect(digest.layerHashes).toBeDefined();
      expect(digest.layerHashes.events).toBeDefined();
      expect(digest.layerHashes.patterns).toBeDefined();
      expect(digest.layerHashes.structures).toBeDefined();
      expect(digest.layerHashes.mentalModels).toBeDefined();
      expect(digest.layerHashes.ceoProfile).toBeDefined();
    });

    it('should produce consistent hashes for same state', () => {
      const digest1 = computeBrainDigest();
      const digest2 = computeBrainDigest();

      expect(digest1.hash).toBe(digest2.hash);
      expect(digest1.layerHashes.events).toBe(digest2.layerHashes.events);
    });

    it('should change when events layer changes', () => {
      const before = computeBrainDigest();

      appendEvent({ type: 'session_start', payload: {} });

      const after = computeBrainDigest();

      expect(after.hash).not.toBe(before.hash);
      expect(after.layerHashes.events).not.toBe(before.layerHashes.events);
      // Other layers unchanged
      expect(after.layerHashes.patterns).toBe(before.layerHashes.patterns);
      expect(after.layerHashes.structures).toBe(before.layerHashes.structures);
      expect(after.layerHashes.mentalModels).toBe(before.layerHashes.mentalModels);
    });

    it('should change when patterns layer changes', () => {
      const before = computeBrainDigest();

      addPattern({ signature: 'test-error', type: 'error' });

      const after = computeBrainDigest();

      expect(after.hash).not.toBe(before.hash);
      expect(after.layerHashes.patterns).not.toBe(before.layerHashes.patterns);
      expect(after.layerHashes.events).toBe(before.layerHashes.events);
    });

    it('should change when structures layer changes', () => {
      const before = computeBrainDigest();

      setStructure('project', 'module_map', { test: true });

      const after = computeBrainDigest();

      expect(after.hash).not.toBe(before.hash);
      expect(after.layerHashes.structures).not.toBe(before.layerHashes.structures);
    });

    it('should change when mental models layer changes', () => {
      const before = computeBrainDigest();

      setModel({ domain: 'test', rule: 'Test rule', source: 'manual', confidence: 0.8 });

      const after = computeBrainDigest();

      expect(after.hash).not.toBe(before.hash);
      expect(after.layerHashes.mentalModels).not.toBe(before.layerHashes.mentalModels);
    });

    it('should change when CEO profile changes', () => {
      const before = computeBrainDigest();

      writeCEOProfile({
        ...DEFAULT_CEO_PROFILE,
        style: { ...DEFAULT_CEO_PROFILE.style, indent: 'tabs' },
      });

      const after = computeBrainDigest();

      expect(after.hash).not.toBe(before.hash);
      expect(after.layerHashes.ceoProfile).not.toBe(before.layerHashes.ceoProfile);
    });
  });

  describe('computeLayerHashes', () => {
    it('should compute individual layer hashes', () => {
      const hashes = computeLayerHashes();

      expect(hashes.events).toBeDefined();
      expect(hashes.patterns).toBeDefined();
      expect(hashes.structures).toBeDefined();
      expect(hashes.mentalModels).toBeDefined();
      expect(hashes.ceoProfile).toBeDefined();
    });
  });

  // ===========================================================================
  // Digest Comparison
  // ===========================================================================

  describe('compareBrainDigests', () => {
    it('should detect identical digests', () => {
      const digest = computeBrainDigest();
      const diff = compareBrainDigests(digest, digest);

      expect(diff.identical).toBe(true);
      expect(diff.changedLayers).toHaveLength(0);
    });

    it('should detect changed layers', () => {
      const before = computeBrainDigest();
      appendEvent({ type: 'session_start', payload: {} });
      const after = computeBrainDigest();

      const diff = compareBrainDigests(before, after);

      expect(diff.identical).toBe(false);
      expect(diff.changedLayers).toContain('events');
      expect(diff.previousHash).toBe(before.hash);
      expect(diff.currentHash).toBe(after.hash);
    });

    it('should detect multiple changed layers', () => {
      const before = computeBrainDigest();

      appendEvent({ type: 'session_start', payload: {} });
      addPattern({ signature: 'error', type: 'error' });

      const after = computeBrainDigest();
      const diff = compareBrainDigests(before, after);

      expect(diff.changedLayers).toContain('events');
      expect(diff.changedLayers).toContain('patterns');
      expect(diff.changedLayers).toHaveLength(2);
    });

    it('should provide layer diffs', () => {
      const before = computeBrainDigest();
      appendEvent({ type: 'session_start', payload: {} });
      const after = computeBrainDigest();

      const diff = compareBrainDigests(before, after);

      const eventsDiff = diff.layerDiffs.find((d) => d.layer === 'events');
      expect(eventsDiff?.changed).toBe(true);
      expect(eventsDiff?.previousHash).toBe(before.layerHashes.events);
      expect(eventsDiff?.currentHash).toBe(after.layerHashes.events);
    });
  });

  describe('hasLayerChanged', () => {
    it('should detect layer change', () => {
      const before = computeBrainDigest();
      appendEvent({ type: 'session_start', payload: {} });
      const after = computeBrainDigest();

      expect(hasLayerChanged('events', after, before)).toBe(true);
      expect(hasLayerChanged('patterns', after, before)).toBe(false);
    });
  });

  describe('hasCEOProfileChanged', () => {
    it('should detect CEO profile change', () => {
      const before = computeBrainDigest();

      writeCEOProfile({
        ...DEFAULT_CEO_PROFILE,
        preferences: { ...DEFAULT_CEO_PROFILE.preferences, testing: 'bdd' },
      });

      const after = computeBrainDigest();

      expect(hasCEOProfileChanged(after, before)).toBe(true);
    });

    it('should return false when unchanged', () => {
      const before = computeBrainDigest();
      const after = computeBrainDigest();

      expect(hasCEOProfileChanged(after, before)).toBe(false);
    });
  });

  // ===========================================================================
  // Digest Summary
  // ===========================================================================

  describe('getDigestSummary', () => {
    it('should return formatted summary', () => {
      const digest = computeBrainDigest();
      const summary = getDigestSummary(digest);

      expect(summary).toContain('Brain Digest:');
      expect(summary).toContain(digest.hash);
      expect(summary).toContain('Layer Hashes:');
      expect(summary).toContain('events:');
      expect(summary).toContain('patterns:');
    });
  });

  describe('getDiffSummary', () => {
    it('should show no changes for identical', () => {
      const digest = computeBrainDigest();
      const diff = compareBrainDigests(digest, digest);
      const summary = getDiffSummary(diff);

      expect(summary).toBe('No changes detected');
    });

    it('should show changed layers', () => {
      const before = computeBrainDigest();
      appendEvent({ type: 'session_start', payload: {} });
      const after = computeBrainDigest();

      const diff = compareBrainDigests(before, after);
      const summary = getDiffSummary(diff);

      expect(summary).toContain('Changes detected');
      expect(summary).toContain('events');
    });
  });

  // ===========================================================================
  // Digest Validation
  // ===========================================================================

  describe('isValidDigest', () => {
    it('should validate correct digest', () => {
      const digest = computeBrainDigest();
      expect(isValidDigest(digest)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidDigest(null)).toBe(false);
      expect(isValidDigest(undefined)).toBe(false);
    });

    it('should reject missing hash', () => {
      expect(isValidDigest({ computedAt: '2024-01-01', layerHashes: {} })).toBe(false);
    });

    it('should reject missing layer hashes', () => {
      expect(isValidDigest({ hash: 'abc', computedAt: '2024-01-01' })).toBe(false);
    });

    it('should reject incomplete layer hashes', () => {
      expect(
        isValidDigest({
          hash: 'abc',
          computedAt: '2024-01-01',
          layerHashes: { events: 'x', patterns: 'y' },
        })
      ).toBe(false);
    });
  });

  // ===========================================================================
  // Snapshot Functions
  // ===========================================================================

  describe('createBrainSnapshot', () => {
    it('should create snapshot with digest and timestamp', () => {
      const snapshot = createBrainSnapshot();

      expect(snapshot.digest).toBeDefined();
      expect(snapshot.snapshotAt).toBeDefined();
      expect(isValidDigest(snapshot.digest)).toBe(true);
    });
  });

  describe('matchesSnapshot', () => {
    it('should return true when state unchanged', () => {
      const snapshot = createBrainSnapshot();
      expect(matchesSnapshot(snapshot.digest)).toBe(true);
    });

    it('should return false when state changed', () => {
      const snapshot = createBrainSnapshot();
      appendEvent({ type: 'session_start', payload: {} });
      expect(matchesSnapshot(snapshot.digest)).toBe(false);
    });
  });
});
