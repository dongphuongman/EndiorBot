/**
 * Brain Layer 3: Structures
 *
 * Project architecture storage (module maps, file trees, dependency graphs).
 * Third layer of the iceberg model - static reference data.
 *
 * Key difference from Layers 1-2:
 * - Layer 1 (Events): append-only, time-ordered
 * - Layer 2 (Patterns): upsert by signature
 * - Layer 3 (Structures): replace/update by projectId + type (compound key)
 *
 * @see ADR-009-Brain-Architecture.md
 */

import {
  bumpBrainVersion,
  generateId,
  readStructures,
  writeStructures,
} from '../storage.js';
import type { StructureEntry, StructureType } from '../types.js';
import { BRAIN_LAYERS } from '../types.js';

// =============================================================================
// Structure Layer Operations
// =============================================================================

/**
 * Set a structure (create or replace by projectId + type)
 *
 * This is a replace operation - if a structure with the same projectId + type exists,
 * it will be completely replaced (not merged).
 *
 * @param projectId - Project identifier
 * @param type - Structure type
 * @param data - Structure data (no schema enforcement)
 * @returns The created or updated structure entry
 */
export function setStructure(
  projectId: string,
  type: StructureType,
  data: Record<string, unknown>
): StructureEntry {
  const structures = readStructures();
  const now = new Date().toISOString();

  // Find existing structure with same projectId + type
  const existingIndex = structures.findIndex(
    (s) => s.projectId === projectId && s.type === type
  );

  const entry: StructureEntry = {
    id: existingIndex >= 0 ? structures[existingIndex]!.id : generateId(),
    projectId,
    type,
    data,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    // Replace existing
    structures[existingIndex] = entry;
  } else {
    // Add new
    structures.push(entry);
  }

  writeStructures(structures);
  bumpBrainVersion(BRAIN_LAYERS.STRUCTURES);

  return entry;
}

/**
 * Get a structure by projectId and type
 *
 * @param projectId - Project identifier
 * @param type - Structure type
 * @returns Structure entry or undefined if not found
 */
export function getStructure(
  projectId: string,
  type: StructureType
): StructureEntry | undefined {
  const structures = readStructures();
  return structures.find((s) => s.projectId === projectId && s.type === type);
}

/**
 * Get a structure by ID
 *
 * @param id - Structure ID
 * @returns Structure entry or undefined if not found
 */
export function getStructureById(id: string): StructureEntry | undefined {
  const structures = readStructures();
  return structures.find((s) => s.id === id);
}

/**
 * Get all structures, optionally filtered by project
 *
 * @param projectId - Optional project filter
 * @returns Structure entries sorted by updatedAt (newest first)
 */
export function getAllStructures(projectId?: string): StructureEntry[] {
  const structures = readStructures();

  const filtered = projectId
    ? structures.filter((s) => s.projectId === projectId)
    : structures;

  return sortByUpdatedAt(filtered);
}

/**
 * Get all structures of a specific type
 *
 * @param type - Structure type
 * @returns Structure entries of the given type
 */
export function getStructuresByType(type: StructureType): StructureEntry[] {
  const structures = readStructures();
  return structures.filter((s) => s.type === type);
}

/**
 * Update structure data (partial update)
 *
 * @param projectId - Project identifier
 * @param type - Structure type
 * @param dataUpdates - Partial data to merge
 * @returns Updated structure entry
 * @throws Error if structure not found
 */
export function updateStructureData(
  projectId: string,
  type: StructureType,
  dataUpdates: Record<string, unknown>
): StructureEntry {
  const structures = readStructures();
  const index = structures.findIndex(
    (s) => s.projectId === projectId && s.type === type
  );

  if (index === -1) {
    throw new Error(`Structure not found: ${projectId}/${type}`);
  }

  const existing = structures[index]!;
  const updated: StructureEntry = {
    ...existing,
    data: { ...existing.data, ...dataUpdates },
    updatedAt: new Date().toISOString(),
  };

  structures[index] = updated;
  writeStructures(structures);
  bumpBrainVersion(BRAIN_LAYERS.STRUCTURES);

  return updated;
}

/**
 * Delete a structure by projectId and type
 *
 * @param projectId - Project identifier
 * @param type - Structure type
 * @returns true if deleted, false if not found
 */
export function deleteStructure(
  projectId: string,
  type: StructureType
): boolean {
  const structures = readStructures();
  const index = structures.findIndex(
    (s) => s.projectId === projectId && s.type === type
  );

  if (index === -1) {
    return false;
  }

  structures.splice(index, 1);
  writeStructures(structures);
  bumpBrainVersion(BRAIN_LAYERS.STRUCTURES);

  return true;
}

/**
 * Delete all structures for a project
 *
 * @param projectId - Project identifier
 * @returns Number of structures deleted
 */
export function deleteProjectStructures(projectId: string): number {
  const structures = readStructures();
  const remaining = structures.filter((s) => s.projectId !== projectId);
  const deleted = structures.length - remaining.length;

  if (deleted > 0) {
    writeStructures(remaining);
    bumpBrainVersion(BRAIN_LAYERS.STRUCTURES);
  }

  return deleted;
}

/**
 * Clear all structures (for tests only)
 *
 * @internal
 */
export function clearStructures(): void {
  writeStructures([]);
  bumpBrainVersion(BRAIN_LAYERS.STRUCTURES);
}

/**
 * List all unique project IDs
 *
 * @returns Array of distinct project IDs
 */
export function listProjects(): string[] {
  const structures = readStructures();
  const projectIds = new Set(structures.map((s) => s.projectId));
  return Array.from(projectIds).sort();
}

/**
 * Get total structure count
 *
 * @returns Number of structures
 */
export function getStructureCount(): number {
  return readStructures().length;
}

/**
 * Count structures by type
 *
 * @returns Map of structure type to count
 */
export function countStructuresByType(): Map<StructureType, number> {
  const structures = readStructures();
  const counts = new Map<StructureType, number>();

  for (const structure of structures) {
    const current = counts.get(structure.type) ?? 0;
    counts.set(structure.type, current + 1);
  }

  return counts;
}

/**
 * Check if a structure exists
 *
 * @param projectId - Project identifier
 * @param type - Structure type
 * @returns true if structure exists
 */
export function hasStructure(projectId: string, type: StructureType): boolean {
  const structures = readStructures();
  return structures.some((s) => s.projectId === projectId && s.type === type);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sort structures by updatedAt (newest first)
 */
function sortByUpdatedAt(structures: StructureEntry[]): StructureEntry[] {
  return [...structures].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// =============================================================================
// Convenience Functions for Common Structure Types
// =============================================================================

/**
 * Set module map for a project
 */
export function setModuleMap(
  projectId: string,
  modules: Array<{ name: string; path: string; dependencies?: string[] }>
): StructureEntry {
  return setStructure(projectId, 'module_map', { modules });
}

/**
 * Get module map for a project
 */
export function getModuleMap(
  projectId: string
): { modules: Array<{ name: string; path: string; dependencies?: string[] }> } | undefined {
  const structure = getStructure(projectId, 'module_map');
  return structure?.data as { modules: Array<{ name: string; path: string; dependencies?: string[] }> } | undefined;
}

/**
 * Set file tree for a project
 */
export function setFileTree(
  projectId: string,
  root: string,
  files: string[]
): StructureEntry {
  return setStructure(projectId, 'file_tree', { root, files, fileCount: files.length });
}

/**
 * Get file tree for a project
 */
export function getFileTree(
  projectId: string
): { root: string; files: string[]; fileCount: number } | undefined {
  const structure = getStructure(projectId, 'file_tree');
  return structure?.data as { root: string; files: string[]; fileCount: number } | undefined;
}

/**
 * Set dependency graph for a project
 */
export function setDependencyGraph(
  projectId: string,
  dependencies: Record<string, string[]>
): StructureEntry {
  return setStructure(projectId, 'dependency_graph', { dependencies });
}

/**
 * Get dependency graph for a project
 */
export function getDependencyGraph(
  projectId: string
): { dependencies: Record<string, string[]> } | undefined {
  const structure = getStructure(projectId, 'dependency_graph');
  return structure?.data as { dependencies: Record<string, string[]> } | undefined;
}

/**
 * Set API surface for a project
 */
export function setAPISurface(
  projectId: string,
  endpoints: Array<{ method: string; path: string; handler?: string }>
): StructureEntry {
  return setStructure(projectId, 'api_schema', { endpoints });
}

/**
 * Get API surface for a project
 */
export function getAPISurface(
  projectId: string
): { endpoints: Array<{ method: string; path: string; handler?: string }> } | undefined {
  const structure = getStructure(projectId, 'api_schema');
  return structure?.data as { endpoints: Array<{ method: string; path: string; handler?: string }> } | undefined;
}

/**
 * Set component tree for a project (React/Vue/etc.)
 */
export function setComponentTree(
  projectId: string,
  components: Array<{ name: string; path: string; children?: string[] }>
): StructureEntry {
  return setStructure(projectId, 'component_tree', { components });
}

/**
 * Get component tree for a project
 */
export function getComponentTree(
  projectId: string
): { components: Array<{ name: string; path: string; children?: string[] }> } | undefined {
  const structure = getStructure(projectId, 'component_tree');
  return structure?.data as { components: Array<{ name: string; path: string; children?: string[] }> } | undefined;
}

// =============================================================================
// Context Anchoring (Sprint 65)
// =============================================================================

/**
 * Context anchor state stored in Brain L3.
 */
export interface ContextAnchorState {
  /** Anchor store version */
  version: string;
  /** Last saved timestamp */
  lastSaved: string;
  /** Active anchor IDs by type */
  activeAnchors: {
    sprint_goal?: string[];
    checkpoint?: string[];
    spec_snapshot?: string[];
    decision?: string[];
    blocker?: string[];
  };
  /** Current sprint goal ID */
  currentSprintGoal?: string;
  /** Current checkpoint ID */
  currentCheckpoint?: string;
}

/**
 * Set context anchor state for a project.
 *
 * Stores the current state of context anchoring in Brain L3
 * for persistence across sessions.
 */
export function setContextAnchorState(
  projectId: string,
  state: ContextAnchorState
): StructureEntry {
  return setStructure(projectId, 'context_anchor', state as unknown as Record<string, unknown>);
}

/**
 * Get context anchor state for a project.
 */
export function getContextAnchorState(
  projectId: string
): ContextAnchorState | undefined {
  const structure = getStructure(projectId, 'context_anchor');
  return structure?.data as ContextAnchorState | undefined;
}

/**
 * Update current sprint goal in anchor state.
 */
export function setCurrentSprintGoal(
  projectId: string,
  goalId: string
): StructureEntry {
  const existing = getContextAnchorState(projectId);
  const state: ContextAnchorState = existing ?? {
    version: '1.0.0',
    lastSaved: new Date().toISOString(),
    activeAnchors: {},
  };

  state.currentSprintGoal = goalId;
  state.lastSaved = new Date().toISOString();

  return setContextAnchorState(projectId, state);
}

/**
 * Update current checkpoint in anchor state.
 */
export function setCurrentCheckpoint(
  projectId: string,
  checkpointId: string
): StructureEntry {
  const existing = getContextAnchorState(projectId);
  const state: ContextAnchorState = existing ?? {
    version: '1.0.0',
    lastSaved: new Date().toISOString(),
    activeAnchors: {},
  };

  state.currentCheckpoint = checkpointId;
  state.lastSaved = new Date().toISOString();

  return setContextAnchorState(projectId, state);
}

// =============================================================================
// Code Search Index (Sprint 63-64)
// =============================================================================

/**
 * Code search index state stored in Brain L3.
 */
export interface CodeIndexState {
  /** Index version */
  version: string;
  /** Last indexed timestamp */
  lastIndexed: string;
  /** Total files indexed */
  fileCount: number;
  /** Index size in bytes */
  indexSizeBytes: number;
  /** Provider used */
  provider: 'ripgrep' | 'zoekt' | 'ast-grep';
  /** Index hash for integrity */
  hash?: string;
}

/**
 * Set code index state for a project.
 */
export function setCodeIndexState(
  projectId: string,
  state: CodeIndexState
): StructureEntry {
  return setStructure(projectId, 'code_index', state as unknown as Record<string, unknown>);
}

/**
 * Get code index state for a project.
 */
export function getCodeIndexState(
  projectId: string
): CodeIndexState | undefined {
  const structure = getStructure(projectId, 'code_index');
  return structure?.data as CodeIndexState | undefined;
}

// =============================================================================
// Project Summary
// =============================================================================

/**
 * Get summary of all structures for a project
 */
export function getProjectSummary(projectId: string): {
  projectId: string;
  structureCount: number;
  types: StructureType[];
  lastUpdated: string | undefined;
} {
  const structures = getAllStructures(projectId);
  const types = structures.map((s) => s.type);
  const lastUpdated = structures[0]?.updatedAt; // Already sorted by updatedAt

  return {
    projectId,
    structureCount: structures.length,
    types,
    lastUpdated,
  };
}
