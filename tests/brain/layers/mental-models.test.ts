/**
 * Brain Layer 4: Mental Models Tests
 *
 * Tests for mental model storage operations.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addCEORule,
  addDerivedRule,
  addManualRule,
  addModel,
  clearModels,
  countModelsByDomain,
  deleteModel,
  deleteModelsByDomain,
  getAllModels,
  getFormattedRules,
  getHighConfidenceModels,
  getModel,
  getModelCount,
  getModelsByDomain,
  getModelsBySource,
  getRulesForDomain,
  hasModel,
  listDomains,
  searchModels,
  setModel,
  updateConfidence,
  updateModel,
} from '../../../src/brain/layers/mental-models.js';
import { initializeBrain, readBrainVersion } from '../../../src/brain/storage.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `mental-models-${Date.now()}`);

describe('MentalModelsLayer', () => {
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
  // Set Model
  // ===========================================================================

  describe('setModel', () => {
    it('should create new model with auto-generated id', () => {
      const model = setModel({
        domain: 'typescript',
        rule: 'Prefer explicit types over any',
        source: 'ceo_import',
        confidence: 0.95,
      });

      expect(model.id).toBeDefined();
      expect(model.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(model.domain).toBe('typescript');
      expect(model.rule).toBe('Prefer explicit types over any');
      expect(model.source).toBe('ceo_import');
      expect(model.confidence).toBe(0.95);
      expect(model.updatedAt).toBeDefined();
    });

    it('should update existing model with same domain + rule', () => {
      const first = setModel({
        domain: 'typescript',
        rule: 'Use strict mode',
        source: 'manual',
        confidence: 0.7,
      });

      const second = setModel({
        domain: 'typescript',
        rule: 'Use strict mode',
        source: 'ceo_import',
        confidence: 0.9,
      });

      expect(second.id).toBe(first.id); // Same ID preserved
      expect(second.source).toBe('ceo_import'); // Updated
      expect(second.confidence).toBe(0.9); // Updated
      expect(getModelCount()).toBe(1); // Still only one model
    });

    it('should allow different rules in same domain', () => {
      setModel({ domain: 'typescript', rule: 'Rule 1', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'typescript', rule: 'Rule 2', source: 'manual', confidence: 0.8 });

      expect(getModelCount()).toBe(2);
    });

    it('should bump brain version on set', () => {
      const vBefore = readBrainVersion();
      setModel({ domain: 'test', rule: 'test', source: 'manual', confidence: 0.5 });
      const vAfter = readBrainVersion();
      expect(vAfter.layerVersions.mentalModels).toBe(vBefore.layerVersions.mentalModels + 1);
    });
  });

  describe('addModel', () => {
    it('should add new model', () => {
      const model = addModel({
        domain: 'testing',
        rule: 'Write tests before implementation',
        source: 'ceo_import',
        confidence: 0.9,
      });

      expect(model.domain).toBe('testing');
    });

    it('should reject duplicate domain + rule', () => {
      addModel({ domain: 'testing', rule: 'TDD', source: 'manual', confidence: 0.8 });

      expect(() =>
        addModel({ domain: 'testing', rule: 'TDD', source: 'ceo_import', confidence: 0.9 })
      ).toThrow('already exists');
    });
  });

  // ===========================================================================
  // Get Models
  // ===========================================================================

  describe('getModel', () => {
    it('should return model by id', () => {
      const created = setModel({
        domain: 'testing',
        rule: 'Test rule',
        source: 'manual',
        confidence: 0.8,
      });

      const found = getModel(created.id);
      expect(found).toBeDefined();
      expect(found?.domain).toBe('testing');
    });

    it('should return undefined for non-existent id', () => {
      expect(getModel('non-existent')).toBeUndefined();
    });
  });

  describe('getAllModels', () => {
    beforeEach(() => {
      setModel({ domain: 'typescript', rule: 'R1', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'testing', rule: 'R2', source: 'manual', confidence: 0.9 });
      setModel({ domain: 'typescript', rule: 'R3', source: 'manual', confidence: 0.7 });
    });

    it('should return all models sorted by domain, then confidence', () => {
      const models = getAllModels();
      expect(models).toHaveLength(3);
      // testing comes after typescript alphabetically
      expect(models[0]?.domain).toBe('testing');
      expect(models[1]?.domain).toBe('typescript');
      expect(models[2]?.domain).toBe('typescript');
    });
  });

  describe('getModelsByDomain', () => {
    beforeEach(() => {
      setModel({ domain: 'typescript', rule: 'TS Rule 1', source: 'manual', confidence: 0.7 });
      setModel({ domain: 'typescript', rule: 'TS Rule 2', source: 'manual', confidence: 0.9 });
      setModel({ domain: 'testing', rule: 'Test Rule', source: 'manual', confidence: 0.8 });
    });

    it('should return models for domain sorted by confidence', () => {
      const models = getModelsByDomain('typescript');
      expect(models).toHaveLength(2);
      expect(models[0]?.confidence).toBe(0.9); // Higher first
      expect(models[1]?.confidence).toBe(0.7);
    });

    it('should return empty for non-existent domain', () => {
      expect(getModelsByDomain('nonexistent')).toHaveLength(0);
    });
  });

  describe('getModelsBySource', () => {
    beforeEach(() => {
      setModel({ domain: 'd1', rule: 'R1', source: 'ceo_import', confidence: 0.9 });
      setModel({ domain: 'd2', rule: 'R2', source: 'derived', confidence: 0.7 });
      setModel({ domain: 'd3', rule: 'R3', source: 'ceo_import', confidence: 0.8 });
    });

    it('should return models by source', () => {
      const ceoModels = getModelsBySource('ceo_import');
      expect(ceoModels).toHaveLength(2);
      expect(ceoModels.every((m) => m.source === 'ceo_import')).toBe(true);
    });
  });

  describe('getHighConfidenceModels', () => {
    beforeEach(() => {
      setModel({ domain: 'd1', rule: 'R1', source: 'manual', confidence: 0.95 });
      setModel({ domain: 'd2', rule: 'R2', source: 'manual', confidence: 0.7 });
      setModel({ domain: 'd3', rule: 'R3', source: 'manual', confidence: 0.85 });
    });

    it('should return models with confidence >= threshold', () => {
      const high = getHighConfidenceModels(0.8);
      expect(high).toHaveLength(2);
      expect(high[0]?.confidence).toBe(0.95);
      expect(high[1]?.confidence).toBe(0.85);
    });

    it('should use default threshold of 0.8', () => {
      const high = getHighConfidenceModels();
      expect(high).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Update Models
  // ===========================================================================

  describe('updateModel', () => {
    it('should update model fields', () => {
      const created = setModel({
        domain: 'test',
        rule: 'Original rule',
        source: 'manual',
        confidence: 0.5,
      });

      const updated = updateModel(created.id, {
        rule: 'Updated rule',
        confidence: 0.8,
      });

      expect(updated.rule).toBe('Updated rule');
      expect(updated.confidence).toBe(0.8);
      expect(updated.id).toBe(created.id); // ID preserved
    });

    it('should update timestamp', async () => {
      const created = setModel({
        domain: 'test',
        rule: 'Rule',
        source: 'manual',
        confidence: 0.5,
      });

      await new Promise((r) => setTimeout(r, 10));
      const updated = updateModel(created.id, { confidence: 0.9 });

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime()
      );
    });

    it('should throw for non-existent model', () => {
      expect(() => updateModel('non-existent', { confidence: 0.5 })).toThrow('not found');
    });
  });

  describe('updateConfidence', () => {
    it('should update only confidence', () => {
      const created = setModel({
        domain: 'test',
        rule: 'Rule',
        source: 'manual',
        confidence: 0.5,
      });

      const updated = updateConfidence(created.id, 0.9);
      expect(updated.confidence).toBe(0.9);
      expect(updated.rule).toBe('Rule'); // Unchanged
    });

    it('should reject invalid confidence values', () => {
      const created = setModel({
        domain: 'test',
        rule: 'Rule',
        source: 'manual',
        confidence: 0.5,
      });

      expect(() => updateConfidence(created.id, -0.1)).toThrow('between 0 and 1');
      expect(() => updateConfidence(created.id, 1.5)).toThrow('between 0 and 1');
    });
  });

  // ===========================================================================
  // Delete Models
  // ===========================================================================

  describe('deleteModel', () => {
    it('should delete by id', () => {
      const created = setModel({
        domain: 'test',
        rule: 'Rule',
        source: 'manual',
        confidence: 0.5,
      });

      const result = deleteModel(created.id);
      expect(result).toBe(true);
      expect(getModelCount()).toBe(0);
    });

    it('should return false for non-existent', () => {
      expect(deleteModel('non-existent')).toBe(false);
    });
  });

  describe('deleteModelsByDomain', () => {
    beforeEach(() => {
      setModel({ domain: 'typescript', rule: 'R1', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'typescript', rule: 'R2', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'testing', rule: 'R3', source: 'manual', confidence: 0.8 });
    });

    it('should delete all models for domain', () => {
      const deleted = deleteModelsByDomain('typescript');
      expect(deleted).toBe(2);
      expect(getModelsByDomain('typescript')).toHaveLength(0);
      expect(getModelsByDomain('testing')).toHaveLength(1);
    });
  });

  describe('clearModels', () => {
    it('should remove all models', () => {
      setModel({ domain: 'd1', rule: 'R1', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'd2', rule: 'R2', source: 'manual', confidence: 0.5 });

      clearModels();
      expect(getModelCount()).toBe(0);
    });
  });

  // ===========================================================================
  // List and Count
  // ===========================================================================

  describe('listDomains', () => {
    it('should return unique domains sorted', () => {
      setModel({ domain: 'testing', rule: 'R1', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'typescript', rule: 'R2', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'testing', rule: 'R3', source: 'manual', confidence: 0.5 });

      expect(listDomains()).toEqual(['testing', 'typescript']);
    });
  });

  describe('countModelsByDomain', () => {
    it('should count by domain', () => {
      setModel({ domain: 'typescript', rule: 'R1', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'typescript', rule: 'R2', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'testing', rule: 'R3', source: 'manual', confidence: 0.5 });

      const counts = countModelsByDomain();
      expect(counts.get('typescript')).toBe(2);
      expect(counts.get('testing')).toBe(1);
    });
  });

  describe('searchModels', () => {
    beforeEach(() => {
      setModel({ domain: 'typescript', rule: 'Prefer explicit types', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'testing', rule: 'Write unit tests first', source: 'manual', confidence: 0.8 });
      setModel({ domain: 'security', rule: 'Sanitize all inputs', source: 'manual', confidence: 0.8 });
    });

    it('should search by rule text', () => {
      const results = searchModels('types');
      expect(results).toHaveLength(1);
      expect(results[0]?.domain).toBe('typescript');
    });

    it('should search by domain', () => {
      const results = searchModels('testing');
      expect(results).toHaveLength(1);
    });

    it('should be case-insensitive', () => {
      const results = searchModels('TYPES');
      expect(results).toHaveLength(1);
    });
  });

  describe('hasModel', () => {
    it('should return true for existing model', () => {
      setModel({ domain: 'typescript', rule: 'Use strict mode', source: 'manual', confidence: 0.8 });
      expect(hasModel('typescript', 'strict')).toBe(true);
    });

    it('should return false for non-existent', () => {
      expect(hasModel('nonexistent', 'rule')).toBe(false);
    });
  });

  // ===========================================================================
  // Convenience Functions
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('should add CEO rule with default confidence', () => {
      const model = addCEORule('typescript', 'Prefer const over let');
      expect(model.source).toBe('ceo_import');
      expect(model.confidence).toBe(0.9);
    });

    it('should add derived rule with default confidence', () => {
      const model = addDerivedRule('testing', 'Run tests in parallel');
      expect(model.source).toBe('derived');
      expect(model.confidence).toBe(0.7);
    });

    it('should add manual rule with default confidence', () => {
      const model = addManualRule('security', 'Validate inputs');
      expect(model.source).toBe('manual');
      expect(model.confidence).toBe(0.8);
    });
  });

  describe('getRulesForDomain', () => {
    beforeEach(() => {
      setModel({ domain: 'typescript', rule: 'Rule 1', source: 'manual', confidence: 0.9 });
      setModel({ domain: 'typescript', rule: 'Rule 2', source: 'manual', confidence: 0.5 });
      setModel({ domain: 'typescript', rule: 'Rule 3', source: 'manual', confidence: 0.8 });
    });

    it('should return rule strings above threshold', () => {
      const rules = getRulesForDomain('typescript', 0.7);
      expect(rules).toHaveLength(2);
      expect(rules).toContain('Rule 1');
      expect(rules).toContain('Rule 3');
    });
  });

  describe('getFormattedRules', () => {
    it('should format rules for context injection', () => {
      setModel({ domain: 'typescript', rule: 'Use strict', source: 'manual', confidence: 0.95 });
      setModel({ domain: 'typescript', rule: 'Avoid any', source: 'manual', confidence: 0.75 });

      const formatted = getFormattedRules('typescript');
      expect(formatted).toContain('Use strict (high)');
      expect(formatted).toContain('Avoid any (med)');
    });

    it('should include domain prefix when no filter', () => {
      setModel({ domain: 'typescript', rule: 'TS Rule', source: 'manual', confidence: 0.9 });

      const formatted = getFormattedRules();
      expect(formatted).toContain('[typescript]');
    });
  });
});
