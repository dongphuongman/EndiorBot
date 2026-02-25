/**
 * Brain Layer 4: Mental Models
 *
 * Decision heuristics storage ("prefer X when Y").
 * Top layer of the iceberg model - most abstract knowledge.
 *
 * Mental models are rules and heuristics that guide decision-making.
 * They can be:
 * - Imported from CEO preferences
 * - Derived from patterns
 * - Manually defined
 *
 * @see ADR-009-Brain-Architecture.md
 */

import {
  bumpBrainVersion,
  generateId,
  readMentalModels,
  writeMentalModels,
} from '../storage.js';
import type {
  CreateMentalModelInput,
  MentalModelEntry,
  MentalModelSource,
} from '../types.js';
import { BRAIN_LAYERS } from '../types.js';

// =============================================================================
// Mental Model Layer Operations
// =============================================================================

/**
 * Set a mental model (create or update by domain + rule combination)
 *
 * @param input - Mental model data
 * @returns The created or updated mental model entry
 */
export function setModel(input: CreateMentalModelInput): MentalModelEntry {
  const models = readMentalModels();
  const now = new Date().toISOString();

  // Check if model with same domain + rule exists
  const existingIndex = models.findIndex(
    (m) => m.domain === input.domain && m.rule === input.rule
  );

  const entry: MentalModelEntry = {
    id: existingIndex >= 0 ? models[existingIndex]!.id : generateId(),
    ...input,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    // Update existing
    models[existingIndex] = entry;
  } else {
    // Add new
    models.push(entry);
  }

  writeMentalModels(models);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);

  return entry;
}

/**
 * Add a new mental model
 *
 * @param input - Mental model data
 * @returns The created mental model entry
 * @throws Error if model with same domain + rule already exists
 */
export function addModel(input: CreateMentalModelInput): MentalModelEntry {
  const models = readMentalModels();
  const now = new Date().toISOString();

  // Check for duplicate domain + rule
  const existing = models.find(
    (m) => m.domain === input.domain && m.rule === input.rule
  );
  if (existing) {
    throw new Error(
      `Mental model already exists for domain "${input.domain}" with rule "${input.rule.slice(0, 50)}..."`
    );
  }

  const entry: MentalModelEntry = {
    id: generateId(),
    ...input,
    updatedAt: now,
  };

  models.push(entry);
  writeMentalModels(models);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);

  return entry;
}

/**
 * Get a mental model by ID
 *
 * @param id - Model ID
 * @returns Mental model entry or undefined if not found
 */
export function getModel(id: string): MentalModelEntry | undefined {
  const models = readMentalModels();
  return models.find((m) => m.id === id);
}

/**
 * Get all mental models
 *
 * @returns All mental model entries sorted by domain, then confidence
 */
export function getAllModels(): MentalModelEntry[] {
  const models = readMentalModels();
  return sortModels(models);
}

/**
 * Get mental models by domain
 *
 * @param domain - Domain area (e.g., "typescript", "testing")
 * @returns Mental models for the given domain, sorted by confidence
 */
export function getModelsByDomain(domain: string): MentalModelEntry[] {
  const models = readMentalModels();
  const filtered = models.filter((m) => m.domain === domain);
  return filtered.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get mental models by source
 *
 * @param source - Source of the model
 * @returns Mental models from the given source
 */
export function getModelsBySource(source: MentalModelSource): MentalModelEntry[] {
  const models = readMentalModels();
  return models.filter((m) => m.source === source);
}

/**
 * Get high-confidence models
 *
 * @param minConfidence - Minimum confidence threshold (default 0.8)
 * @returns Models with confidence >= threshold
 */
export function getHighConfidenceModels(
  minConfidence: number = 0.8
): MentalModelEntry[] {
  const models = readMentalModels();
  const filtered = models.filter((m) => m.confidence >= minConfidence);
  return filtered.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Update a mental model
 *
 * @param id - Model ID
 * @param updates - Partial model data to update
 * @returns Updated mental model entry
 * @throws Error if model not found
 */
export function updateModel(
  id: string,
  updates: Partial<Omit<MentalModelEntry, 'id'>>
): MentalModelEntry {
  const models = readMentalModels();
  const index = models.findIndex((m) => m.id === id);

  if (index === -1) {
    throw new Error(`Mental model with id "${id}" not found`);
  }

  const existing = models[index]!;
  const updated: MentalModelEntry = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent id change
    updatedAt: new Date().toISOString(),
  };

  models[index] = updated;
  writeMentalModels(models);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);

  return updated;
}

/**
 * Update model confidence
 *
 * @param id - Model ID
 * @param confidence - New confidence value (0.0 - 1.0)
 * @returns Updated mental model entry
 */
export function updateConfidence(
  id: string,
  confidence: number
): MentalModelEntry {
  if (confidence < 0 || confidence > 1) {
    throw new Error(`Confidence must be between 0 and 1, got ${confidence}`);
  }
  return updateModel(id, { confidence });
}

/**
 * Delete a mental model by ID
 *
 * @param id - Model ID
 * @returns true if deleted, false if not found
 */
export function deleteModel(id: string): boolean {
  const models = readMentalModels();
  const index = models.findIndex((m) => m.id === id);

  if (index === -1) {
    return false;
  }

  models.splice(index, 1);
  writeMentalModels(models);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);

  return true;
}

/**
 * Delete all models for a domain
 *
 * @param domain - Domain to clear
 * @returns Number of models deleted
 */
export function deleteModelsByDomain(domain: string): number {
  const models = readMentalModels();
  const remaining = models.filter((m) => m.domain !== domain);
  const deleted = models.length - remaining.length;

  if (deleted > 0) {
    writeMentalModels(remaining);
    bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);
  }

  return deleted;
}

/**
 * Clear all mental models (for tests only)
 *
 * @internal
 */
export function clearModels(): void {
  writeMentalModels([]);
  bumpBrainVersion(BRAIN_LAYERS.MENTAL_MODELS);
}

/**
 * Get total model count
 *
 * @returns Number of mental models
 */
export function getModelCount(): number {
  return readMentalModels().length;
}

/**
 * List all unique domains
 *
 * @returns Array of distinct domain names
 */
export function listDomains(): string[] {
  const models = readMentalModels();
  const domains = new Set(models.map((m) => m.domain));
  return Array.from(domains).sort();
}

/**
 * Count models by domain
 *
 * @returns Map of domain to count
 */
export function countModelsByDomain(): Map<string, number> {
  const models = readMentalModels();
  const counts = new Map<string, number>();

  for (const model of models) {
    const current = counts.get(model.domain) ?? 0;
    counts.set(model.domain, current + 1);
  }

  return counts;
}

/**
 * Search mental models by rule text
 *
 * @param query - Search query (case-insensitive)
 * @returns Matching mental models
 */
export function searchModels(query: string): MentalModelEntry[] {
  const models = readMentalModels();
  const lowerQuery = query.toLowerCase();
  return models.filter(
    (m) =>
      m.rule.toLowerCase().includes(lowerQuery) ||
      m.domain.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Check if a model exists for domain + rule
 *
 * @param domain - Domain area
 * @param rule - Rule text (partial match)
 * @returns true if matching model exists
 */
export function hasModel(domain: string, rule: string): boolean {
  const models = readMentalModels();
  return models.some(
    (m) => m.domain === domain && m.rule.includes(rule)
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sort models by domain, then by confidence (descending)
 */
function sortModels(models: MentalModelEntry[]): MentalModelEntry[] {
  return [...models].sort((a, b) => {
    const domainCompare = a.domain.localeCompare(b.domain);
    if (domainCompare !== 0) return domainCompare;
    return b.confidence - a.confidence;
  });
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Add a CEO-imported rule
 */
export function addCEORule(
  domain: string,
  rule: string,
  confidence: number = 0.9
): MentalModelEntry {
  return setModel({ domain, rule, source: 'ceo_import', confidence });
}

/**
 * Add a derived rule (from pattern analysis)
 */
export function addDerivedRule(
  domain: string,
  rule: string,
  confidence: number = 0.7
): MentalModelEntry {
  return setModel({ domain, rule, source: 'derived', confidence });
}

/**
 * Add a manual rule
 */
export function addManualRule(
  domain: string,
  rule: string,
  confidence: number = 0.8
): MentalModelEntry {
  return setModel({ domain, rule, source: 'manual', confidence });
}

/**
 * Get rules for a decision context
 *
 * Retrieves relevant rules for a given domain with optional minimum confidence.
 *
 * @param domain - Domain area
 * @param minConfidence - Minimum confidence threshold
 * @returns Array of rule strings
 */
export function getRulesForDomain(
  domain: string,
  minConfidence: number = 0.7
): string[] {
  const models = getModelsByDomain(domain);
  return models
    .filter((m) => m.confidence >= minConfidence)
    .map((m) => m.rule);
}

/**
 * Get all rules as a formatted string (for context injection)
 *
 * @param domain - Optional domain filter
 * @returns Formatted rules string
 */
export function getFormattedRules(domain?: string): string {
  const models = domain ? getModelsByDomain(domain) : getAllModels();

  if (models.length === 0) {
    return '';
  }

  const lines = models.map((m) => {
    const prefix = domain ? '' : `[${m.domain}] `;
    const confidence = m.confidence >= 0.9 ? '(high)' : m.confidence >= 0.7 ? '(med)' : '(low)';
    return `${prefix}${m.rule} ${confidence}`;
  });

  return lines.join('\n');
}
