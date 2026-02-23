/**
 * Migration Tests
 *
 * Tests for checkpoint schema migration.
 *
 * @module tests/sessions/checkpoint/migration
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 5
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerMigration,
  getMigrationRegistry,
  clearMigrations,
  findMigrationPath,
  applyMigrationStep,
  migrateCheckpoint,
  validateCheckpointVersion,
  needsMigration,
  getCheckpointVersion,
  defineMigration,
  MigrationBuilder,
  type MigrationStep,
} from "../../../src/sessions/checkpoint/migration.js";
import { VersionIncompatibleError } from "../../../src/sessions/checkpoint/versioning.js";
import { CHECKPOINT_SCHEMA_VERSION } from "../../../src/sessions/checkpoint/types.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Migration Module", () => {
  beforeEach(() => {
    clearMigrations();
  });

  afterEach(() => {
    clearMigrations();
  });

  // ============================================================================
  // Migration Registry Tests
  // ============================================================================

  describe("Migration Registry", () => {
    it("should register a migration step", () => {
      const step: MigrationStep = {
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Test migration",
        migrate: (c) => c,
      };

      registerMigration(step);
      const registry = getMigrationRegistry();

      expect(registry.has("1.0.0")).toBe(true);
      expect(registry.get("1.0.0")).toEqual(step);
    });

    it("should list registered versions", () => {
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Migration 1",
        migrate: (c) => c,
      });
      registerMigration({
        fromVersion: "1.0.1",
        toVersion: "1.0.2",
        description: "Migration 2",
        migrate: (c) => c,
      });

      const registry = getMigrationRegistry();
      const versions = registry.versions();

      expect(versions).toContain("1.0.0");
      expect(versions).toContain("1.0.1");
    });

    it("should clear migrations", () => {
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Test",
        migrate: (c) => c,
      });

      clearMigrations();
      const registry = getMigrationRegistry();

      expect(registry.has("1.0.0")).toBe(false);
      expect(registry.versions()).toHaveLength(0);
    });
  });

  // ============================================================================
  // Migration Path Finding Tests
  // ============================================================================

  describe("findMigrationPath", () => {
    it("should find single-step migration path", () => {
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Single step",
        migrate: (c) => c,
      });

      const path = findMigrationPath("1.0.0", "1.0.1");

      expect(path).toHaveLength(1);
      expect(path[0].fromVersion).toBe("1.0.0");
      expect(path[0].toVersion).toBe("1.0.1");
    });

    it("should find multi-step migration path", () => {
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Step 1",
        migrate: (c) => c,
      });
      registerMigration({
        fromVersion: "1.0.1",
        toVersion: "1.0.2",
        description: "Step 2",
        migrate: (c) => c,
      });

      const path = findMigrationPath("1.0.0", "1.0.2");

      expect(path).toHaveLength(2);
      expect(path[0].fromVersion).toBe("1.0.0");
      expect(path[1].fromVersion).toBe("1.0.1");
    });

    it("should return empty path when no migration needed", () => {
      const path = findMigrationPath("1.0.0", "1.0.0");
      expect(path).toHaveLength(0);
    });

    it("should return empty path when no migration exists", () => {
      const path = findMigrationPath("1.0.0", "2.0.0");
      expect(path).toHaveLength(0);
    });

    it("should handle implicit migration to current version", () => {
      // When no explicit migration exists but target is current schema version
      const path = findMigrationPath("0.9.0", CHECKPOINT_SCHEMA_VERSION);
      // Should return empty (handled by implicit migration)
      expect(path).toHaveLength(0);
    });
  });

  // ============================================================================
  // Migration Execution Tests
  // ============================================================================

  describe("applyMigrationStep", () => {
    it("should apply migration function", () => {
      const step: MigrationStep = {
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Add new field",
        migrate: (checkpoint: unknown) => {
          const cp = checkpoint as Record<string, unknown>;
          return { ...cp, newField: "added" };
        },
      };

      const result = applyMigrationStep({ existing: "data" }, step);

      expect(result).toHaveProperty("existing", "data");
      expect(result).toHaveProperty("newField", "added");
    });

    it("should throw MigrationError on failure", () => {
      const step: MigrationStep = {
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Failing migration",
        migrate: () => {
          throw new Error("Migration failed");
        },
      };

      expect(() => applyMigrationStep({}, step)).toThrow("Migration from v1.0.0 to v1.0.1 failed");
    });
  });

  describe("migrateCheckpoint", () => {
    it("should return success when no migration needed", () => {
      const checkpoint = {
        meta: { schemaVersion: CHECKPOINT_SCHEMA_VERSION },
      };

      const result = migrateCheckpoint(checkpoint);

      expect(result.success).toBe(true);
      expect(result.originalVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
      expect(result.migrationsApplied).toHaveLength(0);
    });

    it("should BLOCK when checkpoint is newer than code", () => {
      const checkpoint = {
        meta: { schemaVersion: "99.0.0" }, // Future version
      };

      const result = migrateCheckpoint(checkpoint);

      expect(result.success).toBe(false);
      expect(result.error).toContain("BLOCKED");
    });

    it("should apply explicit migration path", () => {
      registerMigration({
        fromVersion: "0.9.0",
        toVersion: CHECKPOINT_SCHEMA_VERSION,
        description: "Upgrade to current",
        migrate: (checkpoint: unknown) => {
          const cp = checkpoint as Record<string, unknown>;
          const meta = cp.meta as Record<string, unknown>;
          return {
            ...cp,
            meta: { ...meta, schemaVersion: CHECKPOINT_SCHEMA_VERSION },
            migrated: true,
          };
        },
      });

      const checkpoint = {
        meta: { schemaVersion: "0.9.0" },
        data: "original",
      };

      const result = migrateCheckpoint(checkpoint);

      expect(result.success).toBe(true);
      expect(result.migrationsApplied).toHaveLength(1);
      expect(result.checkpoint).toHaveProperty("migrated", true);
    });

    it("should apply implicit migration when no explicit path exists", () => {
      const checkpoint = {
        meta: { schemaVersion: "0.9.0" },
        data: "original",
      };

      const result = migrateCheckpoint(checkpoint);

      // Should succeed with implicit migration
      expect(result.success).toBe(true);
      expect(result.migrationsApplied[0]).toContain("implicit");
      expect(result.checkpoint?.meta.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    });

    it("should handle unknown version", () => {
      const checkpoint = {
        meta: {}, // No schemaVersion
        data: "test",
      };

      const result = migrateCheckpoint(checkpoint);

      expect(result.originalVersion).toBe("unknown");
    });

    it("should handle migration failure gracefully", () => {
      registerMigration({
        fromVersion: "0.8.0",
        toVersion: "0.9.0",
        description: "Failing step",
        migrate: () => {
          throw new Error("Something went wrong");
        },
      });

      const checkpoint = {
        meta: { schemaVersion: "0.8.0" },
      };

      const result = migrateCheckpoint(checkpoint);

      expect(result.success).toBe(false);
      expect(result.error).toContain("failed");
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe("validateCheckpointVersion", () => {
    it("should not throw for compatible version", () => {
      const checkpoint = {
        meta: { schemaVersion: CHECKPOINT_SCHEMA_VERSION },
      };

      expect(() => validateCheckpointVersion(checkpoint)).not.toThrow();
    });

    it("should throw VersionIncompatibleError for newer checkpoint", () => {
      const checkpoint = {
        meta: { schemaVersion: "99.0.0" },
      };

      expect(() => validateCheckpointVersion(checkpoint)).toThrow(VersionIncompatibleError);
    });

    it("should not throw for older compatible checkpoint", () => {
      const checkpoint = {
        meta: { schemaVersion: "0.9.0" },
      };

      // Older versions are compatible (forward migration)
      expect(() => validateCheckpointVersion(checkpoint)).not.toThrow();
    });
  });

  describe("needsMigration", () => {
    it("should return false when versions match", () => {
      const checkpoint = {
        meta: { schemaVersion: CHECKPOINT_SCHEMA_VERSION },
      };

      expect(needsMigration(checkpoint)).toBe(false);
    });

    it("should return true when checkpoint is older", () => {
      const checkpoint = {
        meta: { schemaVersion: "0.9.0" },
      };

      expect(needsMigration(checkpoint)).toBe(true);
    });

    it("should return false when checkpoint is newer (blocked, not migrated)", () => {
      const checkpoint = {
        meta: { schemaVersion: "99.0.0" },
      };

      // Newer checkpoints are blocked, not migrated
      expect(needsMigration(checkpoint)).toBe(false);
    });
  });

  describe("getCheckpointVersion", () => {
    it("should extract version from checkpoint", () => {
      const checkpoint = {
        meta: { schemaVersion: "1.2.3" },
      };

      expect(getCheckpointVersion(checkpoint)).toBe("1.2.3");
    });

    it("should return 'unknown' when no version", () => {
      const checkpoint = { meta: {} };
      expect(getCheckpointVersion(checkpoint)).toBe("unknown");

      const checkpoint2 = {};
      expect(getCheckpointVersion(checkpoint2)).toBe("unknown");
    });
  });

  // ============================================================================
  // Migration Builder Tests
  // ============================================================================

  describe("MigrationBuilder", () => {
    it("should build and register migration", () => {
      const step = defineMigration()
        .from("1.0.0")
        .to("1.0.1")
        .description("Add new feature field")
        .migrate((checkpoint: unknown) => {
          const cp = checkpoint as Record<string, unknown>;
          return { ...cp, feature: true };
        })
        .register();

      expect(step.fromVersion).toBe("1.0.0");
      expect(step.toVersion).toBe("1.0.1");
      expect(step.description).toBe("Add new feature field");

      const registry = getMigrationRegistry();
      expect(registry.has("1.0.0")).toBe(true);
    });

    it("should chain builder methods", () => {
      const builder = new MigrationBuilder();

      const result = builder
        .from("1.0.0")
        .to("1.1.0")
        .description("Test")
        .migrate((c) => c);

      expect(result).toBe(builder); // Verify chaining returns same instance
    });

    it("should apply default identity migration", () => {
      const step = defineMigration().from("1.0.0").to("1.0.1").description("No-op").register();

      const original = { data: "test" };
      const migrated = step.migrate(original);

      expect(migrated).toEqual(original);
    });
  });

  // ============================================================================
  // CTO Guidance: Forward-Only Migration Tests
  // ============================================================================

  describe("CTO Guidance: Forward-Only Migration", () => {
    it("should support forward migration chain", () => {
      // Register migration chain: 1.0.0 → 1.0.1 → 1.0.2
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Step 1",
        migrate: (cp: unknown) => {
          const c = cp as Record<string, unknown>;
          return { ...c, step1: true };
        },
      });
      registerMigration({
        fromVersion: "1.0.1",
        toVersion: "1.0.2",
        description: "Step 2",
        migrate: (cp: unknown) => {
          const c = cp as Record<string, unknown>;
          return { ...c, step2: true };
        },
      });

      const path = findMigrationPath("1.0.0", "1.0.2");

      expect(path).toHaveLength(2);
      expect(path[0].toVersion).toBe("1.0.1");
      expect(path[1].toVersion).toBe("1.0.2");
    });

    it("should NOT provide backward migration path", () => {
      registerMigration({
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        description: "Forward only",
        migrate: (c) => c,
      });

      // Try to find backward path (should fail)
      const backwardPath = findMigrationPath("1.0.1", "1.0.0");

      // No backward path should exist
      expect(backwardPath).toHaveLength(0);
    });

    it("should block newer checkpoint per CTO guidance", () => {
      // Scenario: code is v1.0.0, checkpoint is v1.1.0
      const result = migrateCheckpoint({
        meta: { schemaVersion: "1.1.0" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("BLOCKED");
      expect(result.migrationsApplied).toHaveLength(0);
    });

    it("should prevent silent data corruption", () => {
      // When CEO rolls back binary but has newer checkpoint
      const checkpoint = {
        meta: { schemaVersion: "2.0.0" }, // Newer than any code version
        sensitiveData: { important: true },
      };

      const result = migrateCheckpoint(checkpoint);

      // Must fail - not silently corrupt
      expect(result.success).toBe(false);

      // Original checkpoint must not be modified
      expect(result.checkpoint).toBeUndefined();

      // Error must be actionable
      expect(result.error).toContain("Upgrade");
    });

    it("should track migrations applied", () => {
      registerMigration({
        fromVersion: "0.9.0",
        toVersion: "0.9.5",
        description: "First",
        migrate: (cp: unknown) => {
          const c = cp as Record<string, unknown>;
          const meta = c.meta as Record<string, unknown>;
          return { ...c, meta: { ...meta, schemaVersion: "0.9.5" } };
        },
      });
      registerMigration({
        fromVersion: "0.9.5",
        toVersion: CHECKPOINT_SCHEMA_VERSION,
        description: "Second",
        migrate: (cp: unknown) => {
          const c = cp as Record<string, unknown>;
          const meta = c.meta as Record<string, unknown>;
          return { ...c, meta: { ...meta, schemaVersion: CHECKPOINT_SCHEMA_VERSION } };
        },
      });

      const result = migrateCheckpoint({
        meta: { schemaVersion: "0.9.0" },
      });

      expect(result.success).toBe(true);
      expect(result.migrationsApplied).toHaveLength(2);
      expect(result.migrationsApplied[0]).toContain("0.9.0 → 0.9.5");
      expect(result.migrationsApplied[1]).toContain("0.9.5 →");
    });
  });
});
