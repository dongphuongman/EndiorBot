/**
 * Brain Storage Tests
 *
 * Tests for file-based brain storage operations.
 */

import { existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  brainExists,
  BRAIN_FILES,
  computeBrainDigest,
  computeHash,
  computeLayerHashes,
  ensureBrainDir,
  exportBrain,
  generateId,
  getBrainBasePath,
  getBrainFilePath,
  initializeBrain,
  readBrainJson,
  readBrainJsonOrDefault,
  readBrainVersion,
  readCEOProfile,
  readEvents,
  readMentalModels,
  readPatterns,
  readStructures,
  writeBrainJson,
  writeBrainVersion,
  writeCEOProfile,
  writeEvents,
  writeMentalModels,
  writePatterns,
  writeStructures,
} from '../../src/brain/storage.js';
import type {
  BrainVersion,
  CEOProfile,
  EventEntry,
  MentalModelEntry,
  PatternEntry,
  StructureEntry,
} from '../../src/brain/types.js';
import { DEFAULT_CEO_PROFILE } from '../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `test-${Date.now()}`);

describe('BrainStorage', () => {
  beforeEach(() => {
    // Set test brain path
    process.env['ENDIORBOT_BRAIN_PATH'] = TEST_BRAIN_PATH;

    // Clean up any existing test directory
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    delete process.env['ENDIORBOT_BRAIN_PATH'];
  });

  // ===========================================================================
  // Path Management
  // ===========================================================================

  describe('Path Management', () => {
    it('should use env path when set', () => {
      expect(getBrainBasePath()).toBe(TEST_BRAIN_PATH);
    });

    it('should return correct file path', () => {
      const filePath = getBrainFilePath('test.json');
      expect(filePath).toBe(join(TEST_BRAIN_PATH, 'test.json'));
    });
  });

  // ===========================================================================
  // Directory Management
  // ===========================================================================

  describe('Directory Management', () => {
    it('should create brain directory', () => {
      expect(existsSync(TEST_BRAIN_PATH)).toBe(false);
      ensureBrainDir();
      expect(existsSync(TEST_BRAIN_PATH)).toBe(true);
    });

    it('should not fail if directory exists', () => {
      mkdirSync(TEST_BRAIN_PATH, { recursive: true });
      expect(() => ensureBrainDir()).not.toThrow();
    });

    it('should detect brain existence', () => {
      expect(brainExists()).toBe(false);
      initializeBrain();
      expect(brainExists()).toBe(true);
    });
  });

  // ===========================================================================
  // JSON Read/Write
  // ===========================================================================

  describe('JSON Read/Write', () => {
    it('should write and read JSON', () => {
      const data = { foo: 'bar', num: 42 };
      writeBrainJson('test.json', data);

      const read = readBrainJson<typeof data>('test.json');
      expect(read).toEqual(data);
    });

    it('should throw on missing file', () => {
      expect(() => readBrainJson('nonexistent.json')).toThrow('Brain file not found');
    });

    it('should return default on missing file', () => {
      const defaultValue = { default: true };
      const result = readBrainJsonOrDefault('nonexistent.json', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should handle nested objects', () => {
      const data = {
        nested: {
          deep: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
      };
      writeBrainJson('nested.json', data);
      expect(readBrainJson('nested.json')).toEqual(data);
    });
  });

  // ===========================================================================
  // Version Management
  // ===========================================================================

  describe('Version Management', () => {
    it('should read default version when not initialized', () => {
      const version = readBrainVersion();
      expect(version.version).toBe('1.0.0');
      expect(version.layerVersions.events).toBe(0);
    });

    it('should write and read version', () => {
      const version: BrainVersion = {
        version: '2.0.0',
        createdAt: '2026-02-24T00:00:00.000Z',
        updatedAt: '2026-02-24T00:00:00.000Z',
        layerVersions: {
          events: 5,
          patterns: 3,
          structures: 2,
          mentalModels: 1,
        },
      };

      writeBrainVersion(version);
      const read = readBrainVersion();

      expect(read.version).toBe('2.0.0');
      expect(read.layerVersions.events).toBe(5);
    });
  });

  // ===========================================================================
  // Layer Storage
  // ===========================================================================

  describe('Events Layer', () => {
    it('should read empty events by default', () => {
      const events = readEvents();
      expect(events).toEqual([]);
    });

    it('should write and read events', () => {
      const events: EventEntry[] = [
        {
          id: 'event-1',
          timestamp: '2026-02-24T00:00:00.000Z',
          type: 'session_start',
          sessionId: 'session-1',
          payload: { projectId: 'test-project' },
        },
        {
          id: 'event-2',
          timestamp: '2026-02-24T00:01:00.000Z',
          type: 'fix_attempt',
          sessionId: 'session-1',
          payload: { error: 'TypeError', fix: 'add type guard' },
        },
      ];

      writeEvents(events);
      const read = readEvents();

      expect(read).toHaveLength(2);
      expect(read[0]?.type).toBe('session_start');
      expect(read[1]?.type).toBe('fix_attempt');
    });
  });

  describe('Patterns Layer', () => {
    it('should read empty patterns by default', () => {
      const patterns = readPatterns();
      expect(patterns).toEqual([]);
    });

    it('should write and read patterns', () => {
      const patterns: PatternEntry[] = [
        {
          id: 'pattern-1',
          signature: 'TypeError: undefined is not a function',
          type: 'error',
          fixHint: 'Check if function exists before calling',
          count: 5,
          firstSeen: '2026-02-20T00:00:00.000Z',
          lastSeen: '2026-02-24T00:00:00.000Z',
        },
      ];

      writePatterns(patterns);
      const read = readPatterns();

      expect(read).toHaveLength(1);
      expect(read[0]?.signature).toContain('TypeError');
      expect(read[0]?.count).toBe(5);
    });
  });

  describe('Structures Layer', () => {
    it('should read empty structures by default', () => {
      const structures = readStructures();
      expect(structures).toEqual([]);
    });

    it('should write and read structures', () => {
      const structures: StructureEntry[] = [
        {
          id: 'structure-1',
          projectId: 'endiorbot',
          type: 'module_map',
          data: {
            modules: ['brain', 'gateway', 'cli'],
            dependencies: { brain: [], gateway: ['brain'], cli: ['gateway'] },
          },
          updatedAt: '2026-02-24T00:00:00.000Z',
        },
      ];

      writeStructures(structures);
      const read = readStructures();

      expect(read).toHaveLength(1);
      expect(read[0]?.projectId).toBe('endiorbot');
      expect(read[0]?.type).toBe('module_map');
    });
  });

  describe('Mental Models Layer', () => {
    it('should read empty mental models by default', () => {
      const models = readMentalModels();
      expect(models).toEqual([]);
    });

    it('should write and read mental models', () => {
      const models: MentalModelEntry[] = [
        {
          id: 'model-1',
          domain: 'typescript',
          rule: 'Prefer explicit types over any',
          source: 'ceo_import',
          confidence: 0.95,
          updatedAt: '2026-02-24T00:00:00.000Z',
        },
        {
          id: 'model-2',
          domain: 'testing',
          rule: 'Write tests before implementation (TDD)',
          source: 'manual',
          confidence: 0.9,
          updatedAt: '2026-02-24T00:00:00.000Z',
        },
      ];

      writeMentalModels(models);
      const read = readMentalModels();

      expect(read).toHaveLength(2);
      expect(read[0]?.domain).toBe('typescript');
      expect(read[1]?.domain).toBe('testing');
    });
  });

  describe('CEO Profile', () => {
    it('should read default CEO profile', () => {
      const profile = readCEOProfile();
      expect(profile).toEqual(DEFAULT_CEO_PROFILE);
    });

    it('should write and read CEO profile', () => {
      const profile: CEOProfile = {
        style: {
          indent: 'tabs',
          indentSize: 4,
          quotes: 'double',
          semicolons: false,
          trailingComma: 'all',
        },
        preferences: {
          testing: 'bdd',
          documentation: 'jsdoc',
          codeReviews: false,
          autoFormat: true,
        },
        conventions: {
          naming: 'snake_case',
          fileNaming: 'camelCase',
          componentStructure: 'nested',
        },
        customRules: ['Always use const', 'Prefer arrow functions'],
      };

      writeCEOProfile(profile);
      const read = readCEOProfile();

      expect(read.style.indent).toBe('tabs');
      expect(read.preferences.testing).toBe('bdd');
      expect(read.customRules).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Digest Computation
  // ===========================================================================

  describe('Digest Computation', () => {
    beforeEach(() => {
      initializeBrain();
    });

    it('should compute consistent hash', () => {
      const hash1 = computeHash('test content');
      const hash2 = computeHash('test content');
      expect(hash1).toBe(hash2);
    });

    it('should compute different hashes for different content', () => {
      const hash1 = computeHash('content A');
      const hash2 = computeHash('content B');
      expect(hash1).not.toBe(hash2);
    });

    it('should compute layer hashes', () => {
      const hashes = computeLayerHashes();
      expect(hashes.events).toBeDefined();
      expect(hashes.patterns).toBeDefined();
      expect(hashes.structures).toBeDefined();
      expect(hashes.mentalModels).toBeDefined();
      expect(hashes.ceoProfile).toBeDefined();
    });

    it('should compute brain digest', () => {
      const digest = computeBrainDigest();
      expect(digest.hash).toBeDefined();
      expect(digest.hash.length).toBe(16);
      expect(digest.computedAt).toBeDefined();
      expect(digest.layerHashes).toBeDefined();
    });

    it('should change digest when layer changes', () => {
      const digest1 = computeBrainDigest();

      writeEvents([
        {
          id: 'new-event',
          timestamp: new Date().toISOString(),
          type: 'session_start',
          payload: {},
        },
      ]);

      const digest2 = computeBrainDigest();

      expect(digest1.hash).not.toBe(digest2.hash);
      expect(digest1.layerHashes.events).not.toBe(digest2.layerHashes.events);
    });
  });

  // ===========================================================================
  // Brain Export
  // ===========================================================================

  describe('Brain Export', () => {
    beforeEach(() => {
      initializeBrain();
    });

    it('should export entire brain', () => {
      // Add some data
      writeEvents([
        {
          id: 'event-1',
          timestamp: new Date().toISOString(),
          type: 'session_start',
          payload: {},
        },
      ]);
      writePatterns([
        {
          id: 'pattern-1',
          signature: 'test-error',
          type: 'error',
          count: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
      ]);

      const exported = exportBrain();

      expect(exported.exportedAt).toBeDefined();
      expect(exported.version).toBeDefined();
      expect(exported.digest).toBeDefined();
      expect(exported.layers.events).toHaveLength(1);
      expect(exported.layers.patterns).toHaveLength(1);
      expect(exported.layers.structures).toHaveLength(0);
      expect(exported.layers.mentalModels).toHaveLength(0);
      expect(exported.ceoProfile).toEqual(DEFAULT_CEO_PROFILE);
    });
  });

  // ===========================================================================
  // Brain Initialization
  // ===========================================================================

  describe('Brain Initialization', () => {
    it('should initialize all files', () => {
      initializeBrain();

      expect(existsSync(getBrainFilePath(BRAIN_FILES.VERSION))).toBe(true);
      expect(existsSync(getBrainFilePath(BRAIN_FILES.EVENTS))).toBe(true);
      expect(existsSync(getBrainFilePath(BRAIN_FILES.PATTERNS))).toBe(true);
      expect(existsSync(getBrainFilePath(BRAIN_FILES.STRUCTURES))).toBe(true);
      expect(existsSync(getBrainFilePath(BRAIN_FILES.MENTAL_MODELS))).toBe(true);
      expect(existsSync(getBrainFilePath(BRAIN_FILES.CEO_PROFILE))).toBe(true);
    });

    it('should not overwrite existing data', () => {
      // Initialize first time
      initializeBrain();

      // Add some data
      writeEvents([
        {
          id: 'existing-event',
          timestamp: new Date().toISOString(),
          type: 'session_start',
          payload: { existing: true },
        },
      ]);

      // Initialize again
      initializeBrain();

      // Data should still exist
      const events = readEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe('existing-event');
    });
  });

  // ===========================================================================
  // UUID Generation
  // ===========================================================================

  describe('UUID Generation', () => {
    it('should generate valid UUID format', () => {
      const id = generateId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
