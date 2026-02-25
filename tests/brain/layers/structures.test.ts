/**
 * Brain Layer 3: Structures Tests
 *
 * Tests for structure storage operations.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearStructures,
  countStructuresByType,
  deleteProjectStructures,
  deleteStructure,
  getAllStructures,
  getAPISurface,
  getComponentTree,
  getDependencyGraph,
  getFileTree,
  getModuleMap,
  getProjectSummary,
  getStructure,
  getStructureById,
  getStructureCount,
  getStructuresByType,
  hasStructure,
  listProjects,
  setAPISurface,
  setComponentTree,
  setDependencyGraph,
  setFileTree,
  setModuleMap,
  setStructure,
  updateStructureData,
} from '../../../src/brain/layers/structures.js';
import { initializeBrain, readBrainVersion } from '../../../src/brain/storage.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `structures-${Date.now()}`);

describe('StructuresLayer', () => {
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
  // Set Structure
  // ===========================================================================

  describe('setStructure', () => {
    it('should create new structure with auto-generated id', () => {
      const structure = setStructure('project-1', 'module_map', {
        modules: ['auth', 'users'],
      });

      expect(structure.id).toBeDefined();
      expect(structure.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(structure.projectId).toBe('project-1');
      expect(structure.type).toBe('module_map');
      expect(structure.data).toEqual({ modules: ['auth', 'users'] });
      expect(structure.updatedAt).toBeDefined();
    });

    it('should replace existing structure with same projectId + type', () => {
      const first = setStructure('project-1', 'module_map', { modules: ['v1'] });
      const second = setStructure('project-1', 'module_map', { modules: ['v2'] });

      expect(second.id).toBe(first.id); // Same ID preserved
      expect(second.data).toEqual({ modules: ['v2'] }); // Data replaced
      expect(getStructureCount()).toBe(1); // Still only one structure
    });

    it('should allow same type for different projects', () => {
      setStructure('project-1', 'module_map', { data: 1 });
      setStructure('project-2', 'module_map', { data: 2 });

      expect(getStructureCount()).toBe(2);
    });

    it('should allow different types for same project', () => {
      setStructure('project-1', 'module_map', {});
      setStructure('project-1', 'file_tree', {});
      setStructure('project-1', 'dependency_graph', {});

      const structures = getAllStructures('project-1');
      expect(structures).toHaveLength(3);
    });

    it('should bump brain version on set', () => {
      const vBefore = readBrainVersion();
      setStructure('p1', 'module_map', {});
      const vAfter = readBrainVersion();
      expect(vAfter.layerVersions.structures).toBe(vBefore.layerVersions.structures + 1);
    });
  });

  // ===========================================================================
  // Get Structure
  // ===========================================================================

  describe('getStructure', () => {
    it('should return structure by projectId + type', () => {
      setStructure('project-1', 'module_map', { test: true });

      const found = getStructure('project-1', 'module_map');
      expect(found).toBeDefined();
      expect(found?.data).toEqual({ test: true });
    });

    it('should return undefined for non-existent combination', () => {
      setStructure('project-1', 'module_map', {});

      expect(getStructure('project-1', 'file_tree')).toBeUndefined();
      expect(getStructure('project-2', 'module_map')).toBeUndefined();
    });
  });

  describe('getStructureById', () => {
    it('should return structure by id', () => {
      const created = setStructure('project-1', 'module_map', { x: 1 });

      const found = getStructureById(created.id);
      expect(found).toBeDefined();
      expect(found?.projectId).toBe('project-1');
    });

    it('should return undefined for non-existent id', () => {
      expect(getStructureById('non-existent')).toBeUndefined();
    });
  });

  describe('getAllStructures', () => {
    beforeEach(() => {
      setStructure('project-1', 'module_map', {});
      setStructure('project-1', 'file_tree', {});
      setStructure('project-2', 'module_map', {});
    });

    it('should return all structures when no filter', () => {
      const all = getAllStructures();
      expect(all).toHaveLength(3);
    });

    it('should filter by projectId', () => {
      const project1 = getAllStructures('project-1');
      expect(project1).toHaveLength(2);
      expect(project1.every((s) => s.projectId === 'project-1')).toBe(true);
    });

    it('should sort by updatedAt (newest first)', async () => {
      clearStructures();

      setStructure('p', 'module_map', {});
      await new Promise((r) => setTimeout(r, 10));
      setStructure('p', 'file_tree', {});

      const all = getAllStructures();
      expect(all[0]?.type).toBe('file_tree'); // Newest
      expect(all[1]?.type).toBe('module_map'); // Older
    });
  });

  describe('getStructuresByType', () => {
    beforeEach(() => {
      setStructure('p1', 'module_map', {});
      setStructure('p2', 'module_map', {});
      setStructure('p1', 'file_tree', {});
    });

    it('should return structures of specific type', () => {
      const moduleMaps = getStructuresByType('module_map');
      expect(moduleMaps).toHaveLength(2);
      expect(moduleMaps.every((s) => s.type === 'module_map')).toBe(true);
    });
  });

  // ===========================================================================
  // Update Structure
  // ===========================================================================

  describe('updateStructureData', () => {
    it('should merge data updates', () => {
      setStructure('project-1', 'module_map', { a: 1, b: 2 });

      const updated = updateStructureData('project-1', 'module_map', { b: 3, c: 4 });

      expect(updated.data).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should update timestamp', async () => {
      const created = setStructure('project-1', 'module_map', {});

      await new Promise((r) => setTimeout(r, 10));
      const updated = updateStructureData('project-1', 'module_map', { x: 1 });

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime()
      );
    });

    it('should throw for non-existent structure', () => {
      expect(() =>
        updateStructureData('non-existent', 'module_map', {})
      ).toThrow('Structure not found');
    });
  });

  // ===========================================================================
  // Delete Structure
  // ===========================================================================

  describe('deleteStructure', () => {
    it('should delete by projectId + type', () => {
      setStructure('project-1', 'module_map', {});
      expect(getStructureCount()).toBe(1);

      const result = deleteStructure('project-1', 'module_map');
      expect(result).toBe(true);
      expect(getStructureCount()).toBe(0);
    });

    it('should return false for non-existent', () => {
      const result = deleteStructure('non-existent', 'module_map');
      expect(result).toBe(false);
    });

    it('should only delete matching structure', () => {
      setStructure('p1', 'module_map', {});
      setStructure('p1', 'file_tree', {});

      deleteStructure('p1', 'module_map');

      expect(hasStructure('p1', 'module_map')).toBe(false);
      expect(hasStructure('p1', 'file_tree')).toBe(true);
    });
  });

  describe('deleteProjectStructures', () => {
    it('should delete all structures for a project', () => {
      setStructure('p1', 'module_map', {});
      setStructure('p1', 'file_tree', {});
      setStructure('p2', 'module_map', {});

      const deleted = deleteProjectStructures('p1');
      expect(deleted).toBe(2);
      expect(getAllStructures('p1')).toHaveLength(0);
      expect(getAllStructures('p2')).toHaveLength(1);
    });

    it('should return 0 for non-existent project', () => {
      const deleted = deleteProjectStructures('non-existent');
      expect(deleted).toBe(0);
    });
  });

  describe('clearStructures', () => {
    it('should remove all structures', () => {
      setStructure('p1', 'module_map', {});
      setStructure('p2', 'file_tree', {});
      expect(getStructureCount()).toBe(2);

      clearStructures();
      expect(getStructureCount()).toBe(0);
    });
  });

  // ===========================================================================
  // List and Count
  // ===========================================================================

  describe('listProjects', () => {
    it('should return unique project IDs sorted', () => {
      setStructure('zebra', 'module_map', {});
      setStructure('alpha', 'module_map', {});
      setStructure('alpha', 'file_tree', {});
      setStructure('beta', 'module_map', {});

      const projects = listProjects();
      expect(projects).toEqual(['alpha', 'beta', 'zebra']);
    });

    it('should return empty array when no structures', () => {
      expect(listProjects()).toEqual([]);
    });
  });

  describe('countStructuresByType', () => {
    it('should count by type', () => {
      setStructure('p1', 'module_map', {});
      setStructure('p2', 'module_map', {});
      setStructure('p1', 'file_tree', {});

      const counts = countStructuresByType();
      expect(counts.get('module_map')).toBe(2);
      expect(counts.get('file_tree')).toBe(1);
    });
  });

  describe('hasStructure', () => {
    it('should return true when exists', () => {
      setStructure('p1', 'module_map', {});
      expect(hasStructure('p1', 'module_map')).toBe(true);
    });

    it('should return false when not exists', () => {
      expect(hasStructure('p1', 'module_map')).toBe(false);
    });
  });

  // ===========================================================================
  // Convenience Functions
  // ===========================================================================

  describe('Module Map', () => {
    it('should set and get module map', () => {
      const modules = [
        { name: 'auth', path: 'src/auth', dependencies: ['db'] },
        { name: 'db', path: 'src/db' },
      ];

      setModuleMap('project-1', modules);
      const retrieved = getModuleMap('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.modules).toEqual(modules);
    });
  });

  describe('File Tree', () => {
    it('should set and get file tree', () => {
      const files = ['src/index.ts', 'src/auth/login.ts', 'README.md'];

      setFileTree('project-1', '/project', files);
      const retrieved = getFileTree('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.root).toBe('/project');
      expect(retrieved?.files).toEqual(files);
      expect(retrieved?.fileCount).toBe(3);
    });
  });

  describe('Dependency Graph', () => {
    it('should set and get dependency graph', () => {
      const deps = {
        auth: ['db', 'utils'],
        db: ['utils'],
        utils: [],
      };

      setDependencyGraph('project-1', deps);
      const retrieved = getDependencyGraph('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.dependencies).toEqual(deps);
    });
  });

  describe('API Surface', () => {
    it('should set and get API surface', () => {
      const endpoints = [
        { method: 'GET', path: '/users', handler: 'getUsers' },
        { method: 'POST', path: '/users', handler: 'createUser' },
      ];

      setAPISurface('project-1', endpoints);
      const retrieved = getAPISurface('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.endpoints).toEqual(endpoints);
    });
  });

  describe('Component Tree', () => {
    it('should set and get component tree', () => {
      const components = [
        { name: 'App', path: 'src/App.tsx', children: ['Header', 'Main'] },
        { name: 'Header', path: 'src/Header.tsx' },
        { name: 'Main', path: 'src/Main.tsx' },
      ];

      setComponentTree('project-1', components);
      const retrieved = getComponentTree('project-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.components).toEqual(components);
    });
  });

  // ===========================================================================
  // Project Summary
  // ===========================================================================

  describe('getProjectSummary', () => {
    it('should return project summary', () => {
      setStructure('project-1', 'module_map', {});
      setStructure('project-1', 'file_tree', {});
      setStructure('project-1', 'api_schema', {});

      const summary = getProjectSummary('project-1');

      expect(summary.projectId).toBe('project-1');
      expect(summary.structureCount).toBe(3);
      expect(summary.types).toContain('module_map');
      expect(summary.types).toContain('file_tree');
      expect(summary.types).toContain('api_schema');
      expect(summary.lastUpdated).toBeDefined();
    });

    it('should handle non-existent project', () => {
      const summary = getProjectSummary('non-existent');

      expect(summary.projectId).toBe('non-existent');
      expect(summary.structureCount).toBe(0);
      expect(summary.types).toEqual([]);
      expect(summary.lastUpdated).toBeUndefined();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle complex nested data', () => {
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: true }],
            },
          },
        },
      };

      setStructure('project-1', 'module_map', complexData);
      const retrieved = getStructure('project-1', 'module_map');

      expect(retrieved?.data).toEqual(complexData);
    });

    it('should handle empty data', () => {
      setStructure('project-1', 'module_map', {});
      const retrieved = getStructure('project-1', 'module_map');
      expect(retrieved?.data).toEqual({});
    });

    it('should handle special characters in projectId', () => {
      const projectId = 'my-project_v2.0@latest';
      setStructure(projectId, 'module_map', { test: true });

      const retrieved = getStructure(projectId, 'module_map');
      expect(retrieved?.projectId).toBe(projectId);
    });
  });
});
