/**
 * CEO Profile Tests
 *
 * Tests for CEO profile operations.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addCustomRule,
  clearCustomRules,
  exportCEOProfile,
  getAllPreferencesFlat,
  getCEOProfileSummary,
  getConventions,
  getCustomRules,
  getDocumentationPreference,
  getDevelopmentPreferences,
  getIndentPreference,
  getNamingConvention,
  getQuotePreference,
  getStylePreferences,
  getTestingPreference,
  importCEOProfile,
  importCEOProfileFromJSON,
  isValidCEOProfile,
  loadCEOProfile,
  mergeCEOProfileToMentalModels,
  prefersStrictDocumentation,
  prefersTDD,
  removeCustomRule,
  requiresCodeReviews,
  resetCEOProfile,
  saveCEOProfile,
  setDocumentationPreference,
  setIndentPreference,
  setNamingConvention,
  setQuotePreference,
  setTestingPreference,
  updateConventions,
  updateDevelopmentPreferences,
  updateStylePreferences,
} from '../../src/brain/ceo-profile.js';
import { clearModels, getAllModels } from '../../src/brain/layers/mental-models.js';
import { initializeBrain, readBrainVersion } from '../../src/brain/storage.js';
import { DEFAULT_CEO_PROFILE } from '../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `ceo-profile-${Date.now()}`);

describe('CEOProfile', () => {
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
  // Profile Load/Save
  // ===========================================================================

  describe('loadCEOProfile', () => {
    it('should load default profile', () => {
      const profile = loadCEOProfile();

      expect(profile.style).toBeDefined();
      expect(profile.preferences).toBeDefined();
      expect(profile.conventions).toBeDefined();
    });

    it('should match default values', () => {
      const profile = loadCEOProfile();

      expect(profile.style.indent).toBe(DEFAULT_CEO_PROFILE.style.indent);
      expect(profile.style.quotes).toBe(DEFAULT_CEO_PROFILE.style.quotes);
      expect(profile.preferences.testing).toBe(DEFAULT_CEO_PROFILE.preferences.testing);
    });
  });

  describe('saveCEOProfile', () => {
    it('should persist profile changes', () => {
      const modified = {
        ...DEFAULT_CEO_PROFILE,
        style: { ...DEFAULT_CEO_PROFILE.style, indent: 'tabs' as const },
      };

      saveCEOProfile(modified);
      const loaded = loadCEOProfile();

      expect(loaded.style.indent).toBe('tabs');
    });

    it('should bump brain version', () => {
      const vBefore = readBrainVersion();
      saveCEOProfile(DEFAULT_CEO_PROFILE);
      const vAfter = readBrainVersion();

      expect(vAfter.layerVersions.mentalModels).toBe(vBefore.layerVersions.mentalModels + 1);
    });
  });

  describe('resetCEOProfile', () => {
    it('should restore defaults', () => {
      // Modify profile
      updateStylePreferences({ indent: 'tabs', quotes: 'double' });

      // Reset
      resetCEOProfile();
      const profile = loadCEOProfile();

      expect(profile.style.indent).toBe(DEFAULT_CEO_PROFILE.style.indent);
      expect(profile.style.quotes).toBe(DEFAULT_CEO_PROFILE.style.quotes);
    });
  });

  // ===========================================================================
  // Style Preferences
  // ===========================================================================

  describe('getStylePreferences', () => {
    it('should return all style preferences', () => {
      const style = getStylePreferences();

      expect(style.indent).toBeDefined();
      expect(style.indentSize).toBeDefined();
      expect(style.quotes).toBeDefined();
      expect(style.semicolons).toBeDefined();
      expect(style.trailingComma).toBeDefined();
    });
  });

  describe('updateStylePreferences', () => {
    it('should update partial style', () => {
      const updated = updateStylePreferences({ indent: 'tabs' });

      expect(updated.indent).toBe('tabs');
      expect(updated.quotes).toBe(DEFAULT_CEO_PROFILE.style.quotes); // Unchanged
    });

    it('should persist changes', () => {
      updateStylePreferences({ semicolons: false });
      const style = getStylePreferences();

      expect(style.semicolons).toBe(false);
    });
  });

  describe('getIndentPreference', () => {
    it('should return type and size', () => {
      const indent = getIndentPreference();

      expect(indent.type).toBeDefined();
      expect(indent.size).toBeDefined();
    });
  });

  describe('setIndentPreference', () => {
    it('should update indent type and size', () => {
      setIndentPreference('tabs', 4);
      const indent = getIndentPreference();

      expect(indent.type).toBe('tabs');
      expect(indent.size).toBe(4);
    });

    it('should use default size', () => {
      setIndentPreference('spaces');
      const indent = getIndentPreference();

      expect(indent.type).toBe('spaces');
      expect(indent.size).toBe(2);
    });
  });

  describe('getQuotePreference', () => {
    it('should return quote style', () => {
      const quotes = getQuotePreference();
      expect(['single', 'double']).toContain(quotes);
    });
  });

  describe('setQuotePreference', () => {
    it('should update quote preference', () => {
      setQuotePreference('double');
      expect(getQuotePreference()).toBe('double');

      setQuotePreference('single');
      expect(getQuotePreference()).toBe('single');
    });
  });

  // ===========================================================================
  // Development Preferences
  // ===========================================================================

  describe('getDevelopmentPreferences', () => {
    it('should return all development preferences', () => {
      const prefs = getDevelopmentPreferences();

      expect(prefs.testing).toBeDefined();
      expect(prefs.documentation).toBeDefined();
      expect(prefs.codeReviews).toBeDefined();
      expect(prefs.autoFormat).toBeDefined();
    });
  });

  describe('updateDevelopmentPreferences', () => {
    it('should update partial preferences', () => {
      const updated = updateDevelopmentPreferences({ testing: 'bdd' });

      expect(updated.testing).toBe('bdd');
      expect(updated.documentation).toBe(DEFAULT_CEO_PROFILE.preferences.documentation);
    });
  });

  describe('getTestingPreference', () => {
    it('should return testing methodology', () => {
      const testing = getTestingPreference();
      expect(['tdd', 'bdd', 'minimal']).toContain(testing);
    });
  });

  describe('setTestingPreference', () => {
    it('should update testing methodology', () => {
      setTestingPreference('tdd');
      expect(getTestingPreference()).toBe('tdd');

      setTestingPreference('bdd');
      expect(getTestingPreference()).toBe('bdd');
    });
  });

  describe('getDocumentationPreference', () => {
    it('should return documentation format', () => {
      const docs = getDocumentationPreference();
      expect(['jsdoc', 'tsdoc', 'minimal']).toContain(docs);
    });
  });

  describe('setDocumentationPreference', () => {
    it('should update documentation format', () => {
      setDocumentationPreference('tsdoc');
      expect(getDocumentationPreference()).toBe('tsdoc');
    });
  });

  // ===========================================================================
  // Conventions
  // ===========================================================================

  describe('getConventions', () => {
    it('should return all conventions', () => {
      const conventions = getConventions();

      expect(conventions.naming).toBeDefined();
      expect(conventions.fileNaming).toBeDefined();
      expect(conventions.componentStructure).toBeDefined();
    });
  });

  describe('updateConventions', () => {
    it('should update partial conventions', () => {
      const updated = updateConventions({ naming: 'snake_case' });

      expect(updated.naming).toBe('snake_case');
      expect(updated.fileNaming).toBe(DEFAULT_CEO_PROFILE.conventions.fileNaming);
    });
  });

  describe('getNamingConvention', () => {
    it('should return naming convention', () => {
      const naming = getNamingConvention();
      expect(['camelCase', 'snake_case', 'PascalCase']).toContain(naming);
    });
  });

  describe('setNamingConvention', () => {
    it('should update naming convention', () => {
      setNamingConvention('snake_case');
      expect(getNamingConvention()).toBe('snake_case');

      setNamingConvention('PascalCase');
      expect(getNamingConvention()).toBe('PascalCase');
    });
  });

  // ===========================================================================
  // Custom Rules
  // ===========================================================================

  describe('getCustomRules', () => {
    it('should return empty array by default', () => {
      const rules = getCustomRules();
      expect(rules).toEqual([]);
    });
  });

  describe('addCustomRule', () => {
    it('should add new rule', () => {
      addCustomRule('Always use async/await');
      const rules = getCustomRules();

      expect(rules).toContain('Always use async/await');
    });

    it('should not add duplicate rule', () => {
      addCustomRule('Rule 1');
      addCustomRule('Rule 1');
      const rules = getCustomRules();

      expect(rules).toHaveLength(1);
    });

    it('should add multiple unique rules', () => {
      addCustomRule('Rule 1');
      addCustomRule('Rule 2');
      addCustomRule('Rule 3');
      const rules = getCustomRules();

      expect(rules).toHaveLength(3);
    });
  });

  describe('removeCustomRule', () => {
    it('should remove existing rule', () => {
      addCustomRule('Rule to remove');
      const result = removeCustomRule('Rule to remove');

      expect(result).toBe(true);
      expect(getCustomRules()).not.toContain('Rule to remove');
    });

    it('should return false for non-existent rule', () => {
      const result = removeCustomRule('Non-existent rule');
      expect(result).toBe(false);
    });
  });

  describe('clearCustomRules', () => {
    it('should remove all rules', () => {
      addCustomRule('Rule 1');
      addCustomRule('Rule 2');

      clearCustomRules();

      expect(getCustomRules()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Mental Models Integration
  // ===========================================================================

  describe('mergeCEOProfileToMentalModels', () => {
    beforeEach(() => {
      clearModels();
    });

    it('should create mental model rules from profile', () => {
      const count = mergeCEOProfileToMentalModels();

      expect(count).toBeGreaterThan(10); // Style + prefs + conventions
      expect(getAllModels().length).toBeGreaterThan(0);
    });

    it('should create formatting rules', () => {
      mergeCEOProfileToMentalModels();
      const models = getAllModels();

      const formattingModels = models.filter((m) => m.domain === 'formatting');
      expect(formattingModels.length).toBeGreaterThanOrEqual(4);
    });

    it('should include custom rules', () => {
      addCustomRule('Never use eval()');
      mergeCEOProfileToMentalModels();

      const models = getAllModels();
      const customModels = models.filter((m) => m.domain === 'custom');

      expect(customModels).toHaveLength(1);
      expect(customModels[0]?.rule).toContain('Never use eval()');
    });
  });

  // ===========================================================================
  // Export/Import
  // ===========================================================================

  describe('exportCEOProfile', () => {
    it('should export with version and timestamp', () => {
      const exported = exportCEOProfile();

      expect(exported.version).toBe('1.0.0');
      expect(exported.exportedAt).toBeDefined();
      expect(exported.profile).toBeDefined();
    });

    it('should include full profile', () => {
      updateStylePreferences({ indent: 'tabs' });
      const exported = exportCEOProfile();

      expect(exported.profile.style.indent).toBe('tabs');
    });
  });

  describe('importCEOProfile', () => {
    it('should import valid profile', () => {
      const exported = exportCEOProfile();
      exported.profile.style.indent = 'tabs';

      importCEOProfile(exported);
      const profile = loadCEOProfile();

      expect(profile.style.indent).toBe('tabs');
    });

    it('should reject missing profile', () => {
      expect(() => importCEOProfile({} as never)).toThrow('missing profile data');
    });

    it('should reject incomplete profile', () => {
      expect(() =>
        importCEOProfile({
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profile: { style: {} } as never,
        })
      ).toThrow('missing required sections');
    });
  });

  describe('importCEOProfileFromJSON', () => {
    it('should parse and import JSON', () => {
      const exported = exportCEOProfile();
      exported.profile.style.quotes = 'double';
      const json = JSON.stringify(exported);

      importCEOProfileFromJSON(json);
      const profile = loadCEOProfile();

      expect(profile.style.quotes).toBe('double');
    });

    it('should reject invalid JSON', () => {
      expect(() => importCEOProfileFromJSON('invalid json')).toThrow();
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe('isValidCEOProfile', () => {
    it('should validate correct profile', () => {
      expect(isValidCEOProfile(DEFAULT_CEO_PROFILE)).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(isValidCEOProfile(null)).toBe(false);
      expect(isValidCEOProfile(undefined)).toBe(false);
    });

    it('should reject missing style', () => {
      expect(isValidCEOProfile({ preferences: {}, conventions: {} })).toBe(false);
    });

    it('should reject invalid indent type', () => {
      expect(
        isValidCEOProfile({
          style: { indent: 'invalid' },
          preferences: {},
          conventions: {},
        })
      ).toBe(false);
    });

    it('should reject missing preferences', () => {
      expect(
        isValidCEOProfile({
          style: { indent: 'spaces' },
          conventions: {},
        })
      ).toBe(false);
    });

    it('should reject missing conventions', () => {
      expect(
        isValidCEOProfile({
          style: { indent: 'spaces' },
          preferences: {},
        })
      ).toBe(false);
    });
  });

  // ===========================================================================
  // Profile Summary
  // ===========================================================================

  describe('getCEOProfileSummary', () => {
    it('should return formatted summary', () => {
      const summary = getCEOProfileSummary();

      expect(summary).toContain('CEO Profile Summary');
      expect(summary).toContain('Style:');
      expect(summary).toContain('Preferences:');
      expect(summary).toContain('Conventions:');
      expect(summary).toContain('Custom rules:');
    });

    it('should include current values', () => {
      setIndentPreference('tabs', 4);
      const summary = getCEOProfileSummary();

      expect(summary).toContain('tabs');
    });
  });

  // ===========================================================================
  // Quick Access Helpers
  // ===========================================================================

  describe('prefersTDD', () => {
    it('should return true when testing is tdd', () => {
      setTestingPreference('tdd');
      expect(prefersTDD()).toBe(true);
    });

    it('should return false when testing is not tdd', () => {
      setTestingPreference('bdd');
      expect(prefersTDD()).toBe(false);
    });
  });

  describe('prefersStrictDocumentation', () => {
    it('should return true when documentation is not minimal', () => {
      setDocumentationPreference('jsdoc');
      expect(prefersStrictDocumentation()).toBe(true);

      setDocumentationPreference('tsdoc');
      expect(prefersStrictDocumentation()).toBe(true);
    });

    it('should return false when documentation is minimal', () => {
      setDocumentationPreference('minimal');
      expect(prefersStrictDocumentation()).toBe(false);
    });
  });

  describe('requiresCodeReviews', () => {
    it('should return codeReviews preference', () => {
      updateDevelopmentPreferences({ codeReviews: true });
      expect(requiresCodeReviews()).toBe(true);

      updateDevelopmentPreferences({ codeReviews: false });
      expect(requiresCodeReviews()).toBe(false);
    });
  });

  describe('getAllPreferencesFlat', () => {
    it('should return flat object with all preferences', () => {
      const flat = getAllPreferencesFlat();

      // Style
      expect(flat['indent']).toBeDefined();
      expect(flat['indentSize']).toBeDefined();
      expect(flat['quotes']).toBeDefined();
      expect(flat['semicolons']).toBeDefined();
      expect(flat['trailingComma']).toBeDefined();

      // Preferences
      expect(flat['testing']).toBeDefined();
      expect(flat['documentation']).toBeDefined();
      expect(flat['codeReviews']).toBeDefined();
      expect(flat['autoFormat']).toBeDefined();

      // Conventions
      expect(flat['naming']).toBeDefined();
      expect(flat['fileNaming']).toBeDefined();
      expect(flat['componentStructure']).toBeDefined();
    });

    it('should reflect current values', () => {
      setIndentPreference('tabs', 4);
      setTestingPreference('bdd');

      const flat = getAllPreferencesFlat();

      expect(flat['indent']).toBe('tabs');
      expect(flat['indentSize']).toBe(4);
      expect(flat['testing']).toBe('bdd');
    });
  });
});
