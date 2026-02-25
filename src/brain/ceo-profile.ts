/**
 * CEO Profile
 *
 * CEO coding style, preferences, and conventions.
 * Stored in ~/.endiorbot/brain/ceo-profile.json
 *
 * The CEO profile represents the personal preferences of the developer
 * and is used to customize code generation, formatting, and suggestions.
 *
 * @see ADR-009-Brain-Architecture.md
 */

import { addCEORule } from './layers/mental-models.js';
import {
  bumpBrainVersion,
  readCEOProfile,
  writeCEOProfile,
} from './storage.js';
import type {
  CEOConventions,
  CEODevelopmentPreferences,
  CEOProfile,
  CEOStylePreferences,
} from './types.js';
import { BRAIN_LAYERS, DEFAULT_CEO_PROFILE } from './types.js';

// =============================================================================
// Profile Load/Save
// =============================================================================

/**
 * Load the CEO profile
 *
 * @returns Current CEO profile (or default if not set)
 */
export function loadCEOProfile(): CEOProfile {
  return readCEOProfile();
}

/**
 * Save the CEO profile
 *
 * @param profile - Profile to save
 */
export function saveCEOProfile(profile: CEOProfile): void {
  writeCEOProfile(profile);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS); // CEO profile affects mental models
}

/**
 * Reset CEO profile to defaults
 */
export function resetCEOProfile(): void {
  saveCEOProfile(DEFAULT_CEO_PROFILE);
}

// =============================================================================
// Style Preferences
// =============================================================================

/**
 * Get all style preferences
 */
export function getStylePreferences(): CEOStylePreferences {
  return loadCEOProfile().style;
}

/**
 * Update style preferences
 *
 * @param updates - Partial style preferences to update
 */
export function updateStylePreferences(
  updates: Partial<CEOStylePreferences>
): CEOStylePreferences {
  const profile = loadCEOProfile();
  const updated: CEOStylePreferences = { ...profile.style, ...updates };
  saveCEOProfile({ ...profile, style: updated });
  return updated;
}

/**
 * Get indent preference
 */
export function getIndentPreference(): { type: 'tabs' | 'spaces'; size: number } {
  const style = getStylePreferences();
  return { type: style.indent, size: style.indentSize };
}

/**
 * Set indent preference
 */
export function setIndentPreference(
  type: 'tabs' | 'spaces',
  size: number = 2
): void {
  updateStylePreferences({ indent: type, indentSize: size });
}

/**
 * Get quote preference
 */
export function getQuotePreference(): 'single' | 'double' {
  return getStylePreferences().quotes;
}

/**
 * Set quote preference
 */
export function setQuotePreference(quotes: 'single' | 'double'): void {
  updateStylePreferences({ quotes });
}

// =============================================================================
// Development Preferences
// =============================================================================

/**
 * Get all development preferences
 */
export function getDevelopmentPreferences(): CEODevelopmentPreferences {
  return loadCEOProfile().preferences;
}

/**
 * Update development preferences
 */
export function updateDevelopmentPreferences(
  updates: Partial<CEODevelopmentPreferences>
): CEODevelopmentPreferences {
  const profile = loadCEOProfile();
  const updated: CEODevelopmentPreferences = { ...profile.preferences, ...updates };
  saveCEOProfile({ ...profile, preferences: updated });
  return updated;
}

/**
 * Get testing preference
 */
export function getTestingPreference(): 'tdd' | 'bdd' | 'minimal' {
  return getDevelopmentPreferences().testing;
}

/**
 * Set testing preference
 */
export function setTestingPreference(testing: 'tdd' | 'bdd' | 'minimal'): void {
  updateDevelopmentPreferences({ testing });
}

/**
 * Get documentation preference
 */
export function getDocumentationPreference(): 'jsdoc' | 'tsdoc' | 'minimal' {
  return getDevelopmentPreferences().documentation;
}

/**
 * Set documentation preference
 */
export function setDocumentationPreference(
  documentation: 'jsdoc' | 'tsdoc' | 'minimal'
): void {
  updateDevelopmentPreferences({ documentation });
}

// =============================================================================
// Conventions
// =============================================================================

/**
 * Get all conventions
 */
export function getConventions(): CEOConventions {
  return loadCEOProfile().conventions;
}

/**
 * Update conventions
 */
export function updateConventions(
  updates: Partial<CEOConventions>
): CEOConventions {
  const profile = loadCEOProfile();
  const updated: CEOConventions = { ...profile.conventions, ...updates };
  saveCEOProfile({ ...profile, conventions: updated });
  return updated;
}

/**
 * Get naming convention
 */
export function getNamingConvention(): 'camelCase' | 'snake_case' | 'PascalCase' {
  return getConventions().naming;
}

/**
 * Set naming convention
 */
export function setNamingConvention(
  naming: 'camelCase' | 'snake_case' | 'PascalCase'
): void {
  updateConventions({ naming });
}

// =============================================================================
// Custom Rules
// =============================================================================

/**
 * Get custom rules
 */
export function getCustomRules(): string[] {
  return loadCEOProfile().customRules ?? [];
}

/**
 * Add a custom rule
 */
export function addCustomRule(rule: string): void {
  const profile = loadCEOProfile();
  const customRules = profile.customRules ?? [];

  if (!customRules.includes(rule)) {
    customRules.push(rule);
    saveCEOProfile({ ...profile, customRules });
  }
}

/**
 * Remove a custom rule
 */
export function removeCustomRule(rule: string): boolean {
  const profile = loadCEOProfile();
  const customRules = profile.customRules ?? [];
  const index = customRules.indexOf(rule);

  if (index === -1) {
    return false;
  }

  customRules.splice(index, 1);
  saveCEOProfile({ ...profile, customRules });
  return true;
}

/**
 * Clear all custom rules
 */
export function clearCustomRules(): void {
  const profile = loadCEOProfile();
  saveCEOProfile({ ...profile, customRules: [] });
}

// =============================================================================
// Profile Merge to Mental Models
// =============================================================================

/**
 * Merge CEO profile preferences into mental models
 *
 * This creates high-confidence CEO rules in the mental models layer
 * based on the CEO profile settings.
 */
export function mergeCEOProfileToMentalModels(): number {
  const profile = loadCEOProfile();
  let rulesAdded = 0;

  // Style rules
  addCEORule('formatting', `Use ${profile.style.indent} for indentation (size: ${profile.style.indentSize})`);
  addCEORule('formatting', `Use ${profile.style.quotes} quotes for strings`);
  addCEORule('formatting', profile.style.semicolons ? 'Always use semicolons' : 'Omit semicolons');
  addCEORule('formatting', `Use ${profile.style.trailingComma} trailing comma style`);
  rulesAdded += 4;

  // Development preference rules
  addCEORule('testing', `Follow ${profile.preferences.testing.toUpperCase()} methodology`);
  addCEORule('documentation', `Use ${profile.preferences.documentation} format for documentation`);
  if (profile.preferences.codeReviews) {
    addCEORule('workflow', 'Require code reviews before merging');
  }
  if (profile.preferences.autoFormat) {
    addCEORule('workflow', 'Auto-format code on save');
  }
  rulesAdded += 4;

  // Convention rules
  addCEORule('naming', `Use ${profile.conventions.naming} for variable and function names`);
  addCEORule('naming', `Use ${profile.conventions.fileNaming} for file names`);
  addCEORule('structure', `Use ${profile.conventions.componentStructure} component structure`);
  rulesAdded += 3;

  // Custom rules
  const customRules = profile.customRules ?? [];
  for (const rule of customRules) {
    addCEORule('custom', rule, 0.95);
    rulesAdded++;
  }

  return rulesAdded;
}

// =============================================================================
// Profile Export/Import
// =============================================================================

/**
 * CEO profile export format
 */
export interface CEOProfileExport {
  version: string;
  exportedAt: string;
  profile: CEOProfile;
}

/**
 * Export CEO profile
 */
export function exportCEOProfile(): CEOProfileExport {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    profile: loadCEOProfile(),
  };
}

/**
 * Import CEO profile from export
 */
export function importCEOProfile(data: CEOProfileExport): void {
  if (!data.profile) {
    throw new Error('Invalid CEO profile export: missing profile data');
  }

  // Validate required fields
  if (!data.profile.style || !data.profile.preferences || !data.profile.conventions) {
    throw new Error('Invalid CEO profile export: missing required sections');
  }

  saveCEOProfile(data.profile);
}

/**
 * Import CEO profile from JSON string
 */
export function importCEOProfileFromJSON(json: string): void {
  const data = JSON.parse(json) as CEOProfileExport;
  importCEOProfile(data);
}

// =============================================================================
// Profile Validation
// =============================================================================

/**
 * Validate CEO profile structure
 */
export function isValidCEOProfile(profile: unknown): profile is CEOProfile {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  const p = profile as Record<string, unknown>;

  // Check style
  if (!p['style'] || typeof p['style'] !== 'object') {
    return false;
  }
  const style = p['style'] as Record<string, unknown>;
  if (!['tabs', 'spaces'].includes(style['indent'] as string)) {
    return false;
  }

  // Check preferences
  if (!p['preferences'] || typeof p['preferences'] !== 'object') {
    return false;
  }

  // Check conventions
  if (!p['conventions'] || typeof p['conventions'] !== 'object') {
    return false;
  }

  return true;
}

// =============================================================================
// Profile Summary
// =============================================================================

/**
 * Get a human-readable summary of the CEO profile
 */
export function getCEOProfileSummary(): string {
  const profile = loadCEOProfile();
  const customRulesCount = (profile.customRules ?? []).length;

  const lines = [
    'CEO Profile Summary',
    '==================',
    '',
    'Style:',
    `  Indent: ${profile.style.indent} (${profile.style.indentSize})`,
    `  Quotes: ${profile.style.quotes}`,
    `  Semicolons: ${profile.style.semicolons ? 'yes' : 'no'}`,
    `  Trailing comma: ${profile.style.trailingComma}`,
    '',
    'Preferences:',
    `  Testing: ${profile.preferences.testing}`,
    `  Documentation: ${profile.preferences.documentation}`,
    `  Code reviews: ${profile.preferences.codeReviews ? 'yes' : 'no'}`,
    `  Auto-format: ${profile.preferences.autoFormat ? 'yes' : 'no'}`,
    '',
    'Conventions:',
    `  Naming: ${profile.conventions.naming}`,
    `  File naming: ${profile.conventions.fileNaming}`,
    `  Component structure: ${profile.conventions.componentStructure}`,
    '',
    `Custom rules: ${customRulesCount}`,
  ];

  return lines.join('\n');
}

// =============================================================================
// Quick Access Helpers
// =============================================================================

/**
 * Check if CEO prefers TDD
 */
export function prefersTDD(): boolean {
  return getTestingPreference() === 'tdd';
}

/**
 * Check if CEO prefers strict documentation
 */
export function prefersStrictDocumentation(): boolean {
  return getDocumentationPreference() !== 'minimal';
}

/**
 * Check if CEO requires code reviews
 */
export function requiresCodeReviews(): boolean {
  return getDevelopmentPreferences().codeReviews;
}

/**
 * Get all CEO preferences as a flat object
 */
export function getAllPreferencesFlat(): Record<string, string | number | boolean> {
  const profile = loadCEOProfile();
  return {
    // Style
    indent: profile.style.indent,
    indentSize: profile.style.indentSize,
    quotes: profile.style.quotes,
    semicolons: profile.style.semicolons,
    trailingComma: profile.style.trailingComma,
    // Preferences
    testing: profile.preferences.testing,
    documentation: profile.preferences.documentation,
    codeReviews: profile.preferences.codeReviews,
    autoFormat: profile.preferences.autoFormat,
    // Conventions
    naming: profile.conventions.naming,
    fileNaming: profile.conventions.fileNaming,
    componentStructure: profile.conventions.componentStructure,
  };
}
