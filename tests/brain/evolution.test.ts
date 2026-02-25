/**
 * Brain Evolution Tests
 *
 * Tests for brain versioning, checkpoint integration, and evolution tracking.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  bumpVersion,
  compareBrainCheckpoint,
  createBrainBackup,
  formatBrainHealthSummary,
  getBrainCheckpointReference,
  getBrainHealth,
  getBrainVersion,
  getDigestForCheckpoint,
  getDigestHash,
  getVersionString,
  loadBrainContext,
  restoreBrainContext,
  restoreBrainFromBackup,
  setBrainVersion,
  verifyBrainCheckpoint,
} from '../../src/brain/evolution.js';
import { appendEvent } from '../../src/brain/layers/events.js';
import { setModel } from '../../src/brain/layers/mental-models.js';
import { addPattern } from '../../src/brain/layers/patterns.js';
import { setStructure } from '../../src/brain/layers/structures.js';
import { initializeBrain } from '../../src/brain/storage.js';
import { DEFAULT_BRAIN_VERSION } from '../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `evolution-${Date.now()}`);

describe('BrainEvolution', () => {
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
  // Version Management
  // ===========================================================================

  describe('getBrainVersion', () => {
    it('should return current version', () => {
      const version = getBrainVersion();

      expect(version.version).toBeDefined();
      expect(version.layerVersions).toBeDefined();
      expect(version.createdAt).toBeDefined();
      expect(version.updatedAt).toBeDefined();
    });
  });

  describe('setBrainVersion', () => {
    it('should set brain version', () => {
      const newVersion = {
        ...DEFAULT_BRAIN_VERSION,
        version: '2.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setBrainVersion(newVersion);
      const version = getBrainVersion();

      expect(version.version).toBe('2.1.0');
    });
  });

  describe('bumpVersion', () => {
    it('should increment layer version', () => {
      const before = getBrainVersion();
      bumpVersion('events');
      const after = getBrainVersion();

      expect(after.layerVersions.events).toBe(before.layerVersions.events + 1);
    });

    it('should not affect other layers', () => {
      const before = getBrainVersion();
      bumpVersion('patterns');
      const after = getBrainVersion();

      expect(after.layerVersions.events).toBe(before.layerVersions.events);
      expect(after.layerVersions.patterns).toBe(before.layerVersions.patterns + 1);
    });
  });

  describe('getVersionString', () => {
    it('should return formatted version string', () => {
      const versionString = getVersionString();

      // Format: v{version}-{events}.{patterns}.{structures}.{mentalModels}
      // e.g., v1.0.0-0.0.0.0
      expect(versionString).toMatch(/^v[\d.]+-\d+\.\d+\.\d+\.\d+$/);
    });
  });

  // ===========================================================================
  // Digest Functions
  // ===========================================================================

  describe('getDigestForCheckpoint', () => {
    it('should return brain digest', () => {
      const digest = getDigestForCheckpoint();

      expect(digest.hash).toBeDefined();
      expect(digest.hash.length).toBe(16);
      expect(digest.computedAt).toBeDefined();
      expect(digest.layerHashes).toBeDefined();
    });
  });

  describe('getDigestHash', () => {
    it('should return hash only', () => {
      const hash = getDigestHash();

      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });
  });

  // ===========================================================================
  // Checkpoint Integration
  // ===========================================================================

  describe('getBrainCheckpointReference', () => {
    it('should return checkpoint reference', () => {
      const ref = getBrainCheckpointReference();

      expect(ref.brainVersion).toBeDefined();
      expect(ref.brainDigest).toBeDefined();
      expect(ref.layerHashes).toBeDefined();
      expect(ref.capturedAt).toBeDefined();
    });

    it('should have all layer hashes', () => {
      const ref = getBrainCheckpointReference();

      expect(ref.layerHashes.events).toBeDefined();
      expect(ref.layerHashes.patterns).toBeDefined();
      expect(ref.layerHashes.structures).toBeDefined();
      expect(ref.layerHashes.mentalModels).toBeDefined();
      expect(ref.layerHashes.ceoProfile).toBeDefined();
    });
  });

  describe('verifyBrainCheckpoint', () => {
    it('should return true for unchanged brain', () => {
      const ref = getBrainCheckpointReference();
      expect(verifyBrainCheckpoint(ref)).toBe(true);
    });

    it('should return false after changes', () => {
      const ref = getBrainCheckpointReference();

      appendEvent({ type: 'session_start', payload: {} });

      expect(verifyBrainCheckpoint(ref)).toBe(false);
    });
  });

  describe('compareBrainCheckpoint', () => {
    it('should detect no changes', () => {
      const ref = getBrainCheckpointReference();
      const comparison = compareBrainCheckpoint(ref);

      expect(comparison.matches).toBe(true);
      expect(comparison.changedLayers).toHaveLength(0);
    });

    it('should detect changed layers', () => {
      const ref = getBrainCheckpointReference();

      appendEvent({ type: 'session_start', payload: {} });
      addPattern({ signature: 'test', type: 'error' });

      const comparison = compareBrainCheckpoint(ref);

      expect(comparison.matches).toBe(false);
      expect(comparison.changedLayers).toContain('events');
      expect(comparison.changedLayers).toContain('patterns');
    });

    it('should return digests', () => {
      const ref = getBrainCheckpointReference();
      const comparison = compareBrainCheckpoint(ref);

      expect(comparison.currentDigest).toBe(ref.brainDigest);
      expect(comparison.checkpointDigest).toBe(ref.brainDigest);
    });
  });

  // ===========================================================================
  // Brain Context
  // ===========================================================================

  describe('loadBrainContext', () => {
    it('should load complete context', () => {
      appendEvent({ type: 'session_start', payload: {} });
      addPattern({ signature: 'test', type: 'error' });

      const context = loadBrainContext();

      expect(context.version).toBeDefined();
      expect(context.digest).toBeDefined();
      expect(context.events).toHaveLength(1);
      expect(context.patterns).toHaveLength(1);
      expect(context.structures).toBeDefined();
      expect(context.mentalModels).toBeDefined();
      expect(context.ceoProfile).toBeDefined();
    });
  });

  describe('restoreBrainContext', () => {
    it('should restore from context', () => {
      // Add some data
      appendEvent({ type: 'session_start', payload: {} });
      addPattern({ signature: 'test', type: 'error' });
      setStructure('proj1', 'module_map', { modules: [] });
      setModel({ domain: 'test', rule: 'Test rule', source: 'manual', confidence: 0.8 });

      // Save context
      const savedContext = loadBrainContext();

      // Clear by reinitializing
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
      initializeBrain();

      // Verify cleared
      let context = loadBrainContext();
      expect(context.events).toHaveLength(0);

      // Restore
      restoreBrainContext(savedContext);

      // Verify restored
      context = loadBrainContext();
      expect(context.events).toHaveLength(1);
      expect(context.patterns).toHaveLength(1);
      expect(context.structures).toHaveLength(1);
      expect(context.mentalModels).toHaveLength(1);
    });
  });

  describe('createBrainBackup', () => {
    it('should create backup export', () => {
      appendEvent({ type: 'test', payload: {} });

      const backup = createBrainBackup();

      expect(backup.exportedAt).toBeDefined();
      expect(backup.version).toBeDefined();
      expect(backup.digest).toBeDefined();
      expect(backup.layers).toBeDefined();
      expect(backup.ceoProfile).toBeDefined();
    });
  });

  describe('restoreBrainFromBackup', () => {
    it('should restore from backup', () => {
      // Create data and backup
      appendEvent({ type: 'test', payload: {} });
      const backup = createBrainBackup();

      // Clear
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
      initializeBrain();

      // Restore
      restoreBrainFromBackup(backup);

      // Verify
      const context = loadBrainContext();
      expect(context.events).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Brain Health
  // ===========================================================================

  describe('getBrainHealth', () => {
    it('should return health status', () => {
      const health = getBrainHealth();

      expect(health.initialized).toBe(true);
      expect(health.version).toBeDefined();
      expect(health.digestHash).toBeDefined();
      expect(health.layers).toBeDefined();
      expect(health.ceoProfileLoaded).toBe(true);
      expect(health.lastUpdated).toBeDefined();
    });

    it('should reflect layer counts', () => {
      appendEvent({ type: 'e1', payload: {} });
      appendEvent({ type: 'e2', payload: {} });
      addPattern({ signature: 'p1', type: 'error' });

      const health = getBrainHealth();

      expect(health.layers.events).toBe(2);
      expect(health.layers.patterns).toBe(1);
      expect(health.layers.structures).toBe(0);
      expect(health.layers.mentalModels).toBe(0);
    });
  });

  describe('formatBrainHealthSummary', () => {
    it('should return formatted summary', () => {
      const summary = formatBrainHealthSummary();

      expect(summary).toContain('Brain:');
      expect(summary).toContain('Digest:');
      expect(summary).toContain('Layers:');
      expect(summary).toContain('CEO Profile:');
    });

    it('should include counts', () => {
      appendEvent({ type: 'test', payload: {} });

      const summary = formatBrainHealthSummary();

      expect(summary).toContain('E=1');
    });
  });

  // ===========================================================================
  // Version String Format
  // ===========================================================================

  describe('version string format', () => {
    it('should reflect layer bumps', () => {
      const before = getVersionString();

      bumpVersion('events');
      bumpVersion('events');
      bumpVersion('patterns');

      const after = getVersionString();

      expect(after).not.toBe(before);
    });
  });
});
