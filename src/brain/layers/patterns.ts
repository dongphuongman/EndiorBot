/**
 * Brain Layer 2: Patterns
 *
 * Recurring patterns storage (errors, fixes, success signatures).
 * Second layer of the iceberg model - aggregated from events.
 *
 * @see ADR-009-Brain-Architecture.md
 */

import {
  bumpBrainVersion,
  generateId,
  readPatterns,
  writePatterns,
} from '../storage.js';
import type { CreatePatternInput, PatternEntry, PatternType } from '../types.js';
import { BRAIN_LAYERS } from '../types.js';

// =============================================================================
// Pattern Layer Operations
// =============================================================================

/**
 * Add a new pattern to the patterns layer
 *
 * @param input - Pattern data (without id, timestamps, count)
 * @returns The created pattern entry
 * @throws Error if pattern with same signature already exists
 */
export function addPattern(input: CreatePatternInput): PatternEntry {
  const patterns = readPatterns();
  const now = new Date().toISOString();

  // Check for duplicate signature
  const existing = patterns.find((p) => p.signature === input.signature);
  if (existing) {
    throw new Error(`Pattern with signature "${input.signature}" already exists (id: ${existing.id})`);
  }

  const entry: PatternEntry = {
    id: generateId(),
    ...input,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  };

  patterns.push(entry);
  writePatterns(patterns);
  bumpBrainVersion(BRAIN_LAYERS.PATTERNS);

  return entry;
}

/**
 * Add pattern or increment count if signature exists
 *
 * @param input - Pattern data
 * @returns The created or updated pattern entry
 */
export function addOrIncrementPattern(input: CreatePatternInput): PatternEntry {
  const patterns = readPatterns();
  const existing = patterns.find((p) => p.signature === input.signature);

  if (existing) {
    return incrementCount(existing.id);
  }

  return addPattern(input);
}

/**
 * Get a pattern by ID
 *
 * @param id - Pattern ID
 * @returns Pattern entry or undefined if not found
 */
export function getPattern(id: string): PatternEntry | undefined {
  const patterns = readPatterns();
  return patterns.find((p) => p.id === id);
}

/**
 * Get a pattern by signature
 *
 * @param signature - Pattern signature (error fingerprint)
 * @returns Pattern entry or undefined if not found
 */
export function getPatternBySignature(signature: string): PatternEntry | undefined {
  const patterns = readPatterns();
  return patterns.find((p) => p.signature === signature);
}

/**
 * Get all patterns
 *
 * @returns All pattern entries sorted by count (highest first)
 */
export function getAllPatterns(): PatternEntry[] {
  const patterns = readPatterns();
  return sortByCount(patterns);
}

/**
 * Get patterns by type
 *
 * @param type - Pattern type (error, fix, success, warning)
 * @returns Patterns of the given type, sorted by count
 */
export function getPatternsByType(type: PatternType): PatternEntry[] {
  const patterns = readPatterns();
  const filtered = patterns.filter((p) => p.type === type);
  return sortByCount(filtered);
}

/**
 * Update a pattern
 *
 * @param id - Pattern ID
 * @param updates - Partial pattern data to update
 * @returns Updated pattern entry
 * @throws Error if pattern not found
 */
export function updatePattern(
  id: string,
  updates: Partial<Omit<PatternEntry, 'id' | 'firstSeen'>>
): PatternEntry {
  const patterns = readPatterns();
  const index = patterns.findIndex((p) => p.id === id);

  if (index === -1) {
    throw new Error(`Pattern with id "${id}" not found`);
  }

  const existing = patterns[index]!;
  const updated: PatternEntry = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent id change
    firstSeen: existing.firstSeen, // Prevent firstSeen change
    lastSeen: new Date().toISOString(), // Always update lastSeen
  };

  patterns[index] = updated;
  writePatterns(patterns);
  bumpBrainVersion(BRAIN_LAYERS.PATTERNS);

  return updated;
}

/**
 * Increment pattern match count
 *
 * @param id - Pattern ID
 * @returns Updated pattern entry
 * @throws Error if pattern not found
 */
export function incrementCount(id: string): PatternEntry {
  const patterns = readPatterns();
  const index = patterns.findIndex((p) => p.id === id);

  if (index === -1) {
    throw new Error(`Pattern with id "${id}" not found`);
  }

  const existing = patterns[index]!;
  const updated: PatternEntry = {
    ...existing,
    count: existing.count + 1,
    lastSeen: new Date().toISOString(),
  };

  patterns[index] = updated;
  writePatterns(patterns);
  bumpBrainVersion(BRAIN_LAYERS.PATTERNS);

  return updated;
}

/**
 * Increment pattern match count by signature
 *
 * @param signature - Pattern signature
 * @returns Updated pattern entry or undefined if not found
 */
export function incrementCountBySignature(signature: string): PatternEntry | undefined {
  const pattern = getPatternBySignature(signature);
  if (!pattern) {
    return undefined;
  }
  return incrementCount(pattern.id);
}

/**
 * Get top patterns by count
 *
 * @param limit - Maximum number of patterns to return
 * @returns Top patterns sorted by count (highest first)
 */
export function getTopPatterns(limit: number): PatternEntry[] {
  const patterns = readPatterns();
  const sorted = sortByCount(patterns);
  return sorted.slice(0, limit);
}

/**
 * Get recent patterns (by lastSeen)
 *
 * @param limit - Maximum number of patterns to return
 * @returns Recent patterns sorted by lastSeen (newest first)
 */
export function getRecentPatterns(limit: number): PatternEntry[] {
  const patterns = readPatterns();
  const sorted = [...patterns].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  );
  return sorted.slice(0, limit);
}

/**
 * Delete a pattern
 *
 * @param id - Pattern ID
 * @returns true if deleted, false if not found
 */
export function deletePattern(id: string): boolean {
  const patterns = readPatterns();
  const index = patterns.findIndex((p) => p.id === id);

  if (index === -1) {
    return false;
  }

  patterns.splice(index, 1);
  writePatterns(patterns);
  bumpBrainVersion(BRAIN_LAYERS.PATTERNS);

  return true;
}

/**
 * Delete pattern by signature
 *
 * @param signature - Pattern signature
 * @returns true if deleted, false if not found
 */
export function deletePatternBySignature(signature: string): boolean {
  const pattern = getPatternBySignature(signature);
  if (!pattern) {
    return false;
  }
  return deletePattern(pattern.id);
}

/**
 * Clear all patterns (for tests only)
 *
 * @internal
 */
export function clearPatterns(): void {
  writePatterns([]);
  bumpBrainVersion(BRAIN_LAYERS.PATTERNS);
}

/**
 * Get total pattern count
 *
 * @returns Number of patterns
 */
export function getPatternCount(): number {
  return readPatterns().length;
}

/**
 * Count patterns by type
 *
 * @returns Map of pattern type to count
 */
export function countPatternsByType(): Map<PatternType, number> {
  const patterns = readPatterns();
  const counts = new Map<PatternType, number>();

  for (const pattern of patterns) {
    const current = counts.get(pattern.type) ?? 0;
    counts.set(pattern.type, current + 1);
  }

  return counts;
}

/**
 * Search patterns by signature substring
 *
 * @param query - Search query (case-insensitive)
 * @returns Matching patterns
 */
export function searchPatterns(query: string): PatternEntry[] {
  const patterns = readPatterns();
  const lowerQuery = query.toLowerCase();
  return patterns.filter(
    (p) =>
      p.signature.toLowerCase().includes(lowerQuery) ||
      p.fixHint?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get patterns with fix hints
 *
 * @returns Patterns that have fix hints
 */
export function getPatternsWithFixHints(): PatternEntry[] {
  const patterns = readPatterns();
  return patterns.filter((p) => p.fixHint && p.fixHint.length > 0);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sort patterns by count (descending)
 */
function sortByCount(patterns: PatternEntry[]): PatternEntry[] {
  return [...patterns].sort((a, b) => b.count - a.count);
}

// =============================================================================
// Convenience Functions for Common Pattern Types
// =============================================================================

/**
 * Record an error pattern
 */
export function recordErrorPattern(
  signature: string,
  fixHint?: string,
  metadata?: Record<string, unknown>
): PatternEntry {
  const input: CreatePatternInput = { signature, type: 'error' };
  if (fixHint !== undefined) input.fixHint = fixHint;
  if (metadata !== undefined) input.metadata = metadata;
  return addOrIncrementPattern(input);
}

/**
 * Record a fix pattern
 */
export function recordFixPattern(
  signature: string,
  fixHint: string,
  metadata?: Record<string, unknown>
): PatternEntry {
  const input: CreatePatternInput = { signature, type: 'fix', fixHint };
  if (metadata !== undefined) input.metadata = metadata;
  return addOrIncrementPattern(input);
}

/**
 * Record a success pattern
 */
export function recordSuccessPattern(
  signature: string,
  metadata?: Record<string, unknown>
): PatternEntry {
  const input: CreatePatternInput = { signature, type: 'success' };
  if (metadata !== undefined) input.metadata = metadata;
  return addOrIncrementPattern(input);
}

/**
 * Record a warning pattern
 */
export function recordWarningPattern(
  signature: string,
  fixHint?: string,
  metadata?: Record<string, unknown>
): PatternEntry {
  const input: CreatePatternInput = { signature, type: 'warning' };
  if (fixHint !== undefined) input.fixHint = fixHint;
  if (metadata !== undefined) input.metadata = metadata;
  return addOrIncrementPattern(input);
}

/**
 * Find fix hint for an error signature
 *
 * @param errorSignature - Error signature to look up
 * @returns Fix hint if found, undefined otherwise
 */
export function findFixHint(errorSignature: string): string | undefined {
  // First try exact match
  const exactMatch = getPatternBySignature(errorSignature);
  if (exactMatch?.fixHint) {
    return exactMatch.fixHint;
  }

  // Then try partial match
  const patterns = getPatternsWithFixHints();
  const partialMatch = patterns.find(
    (p) =>
      errorSignature.includes(p.signature) ||
      p.signature.includes(errorSignature)
  );

  return partialMatch?.fixHint;
}

// =============================================================================
// Migration from Sprint 41 Pattern Manager
// =============================================================================

/**
 * Import patterns from Sprint 41 format
 *
 * @param legacyPatterns - Array of legacy pattern objects
 * @returns Number of patterns imported
 */
export function importLegacyPatterns(
  legacyPatterns: Array<{
    signature: string;
    fixHint?: string;
    count?: number;
    lastSeen?: string;
  }>
): number {
  let imported = 0;

  for (const legacy of legacyPatterns) {
    const existing = getPatternBySignature(legacy.signature);
    if (existing) {
      // Update existing pattern - only include fixHint if defined
      const updates: Partial<Omit<PatternEntry, 'id' | 'firstSeen'>> = {
        count: Math.max(existing.count, legacy.count ?? 1),
      };
      if (legacy.fixHint !== undefined) {
        updates.fixHint = legacy.fixHint;
      } else if (existing.fixHint !== undefined) {
        updates.fixHint = existing.fixHint;
      }
      updatePattern(existing.id, updates);
    } else {
      // Add new pattern
      const now = new Date().toISOString();
      const patterns = readPatterns();
      const newEntry: PatternEntry = {
        id: generateId(),
        signature: legacy.signature,
        type: 'error',
        count: legacy.count ?? 1,
        firstSeen: legacy.lastSeen ?? now,
        lastSeen: legacy.lastSeen ?? now,
      };
      if (legacy.fixHint !== undefined) {
        newEntry.fixHint = legacy.fixHint;
      }
      patterns.push(newEntry);
      writePatterns(patterns);
      imported++;
    }
  }

  if (imported > 0) {
    bumpBrainVersion(BRAIN_LAYERS.PATTERNS);
  }

  return imported;
}
