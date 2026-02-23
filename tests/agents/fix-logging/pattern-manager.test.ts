/**
 * Pattern Manager Tests
 *
 * @module tests/agents/fix-logging/pattern-manager
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  PatternManager,
  createPatternManager,
  type CreatePatternParams,
} from "../../../src/agents/fix-logging/pattern-manager.js";

describe("PatternManager", () => {
  let manager: PatternManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pattern-manager-test-"));
    manager = createPatternManager({ storageDir: tempDir });
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize with default patterns", async () => {
      const patterns = await manager.getAllPatterns();

      // Should have default patterns
      expect(patterns.length).toBeGreaterThan(0);

      // Check a known default pattern
      const ts2304 = patterns.find(
        (p) => p.category === "TYPE" && p.errorCode === "TS2304"
      );
      expect(ts2304).toBeDefined();
      expect(ts2304!.fixType).toBe("add_import");
    });

    it("should create storage file after modification", async () => {
      // Add a pattern to trigger file creation
      await manager.addPattern({
        category: "TEST",
        errorCode: "TEST_CODE",
        fixType: "manual",
        description: "Test pattern",
        confidence: "low",
      });

      const filePath = manager.getFilePath();
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });

  describe("addPattern", () => {
    it("should add a new pattern", async () => {
      const params: CreatePatternParams = {
        category: "TYPE",
        errorCode: "TS9999",
        fixType: "add_type",
        description: "Test pattern",
        confidence: "medium",
      };

      const pattern = await manager.addPattern(params);

      expect(pattern.id).toBe("TYPE:TS9999:add_type");
      expect(pattern.description).toBe("Test pattern");
      expect(pattern.metadata.source).toBe("manual");
    });

    it("should reject duplicate pattern", async () => {
      const params: CreatePatternParams = {
        category: "TYPE",
        errorCode: "TS2304",
        fixType: "add_import",
        description: "Duplicate",
        confidence: "high",
      };

      await expect(manager.addPattern(params)).rejects.toThrow("already exists");
    });
  });

  describe("updatePattern", () => {
    it("should update pattern properties", async () => {
      const patterns = await manager.getAllPatterns();
      const first = patterns[0]!;

      const updated = await manager.updatePattern(first.id, {
        description: "Updated description",
        confidence: "low",
      });

      expect(updated).toBeDefined();
      expect(updated!.description).toBe("Updated description");
      expect(updated!.confidence).toBe("low");
    });

    it("should return null for non-existent pattern", async () => {
      const result = await manager.updatePattern("non-existent", {
        description: "test",
      });

      expect(result).toBeNull();
    });
  });

  describe("updateMetadata", () => {
    it("should update success/failure counts", async () => {
      const patterns = await manager.getAllPatterns();
      const first = patterns[0]!;

      // Record successes
      await manager.updateMetadata(first.id, true, 100);
      await manager.updateMetadata(first.id, true, 150);
      await manager.updateMetadata(first.id, false, 200);

      const updated = await manager.getPattern(first.id);

      expect(updated!.metadata.appliedCount).toBe(3);
      expect(updated!.metadata.successCount).toBe(2);
      expect(updated!.metadata.failureCount).toBe(1);
      expect(updated!.metadata.successRate).toBeCloseTo(0.667, 2);
    });

    it("should update average duration", async () => {
      const patterns = await manager.getAllPatterns();
      const first = patterns[0]!;

      await manager.updateMetadata(first.id, true, 100);
      await manager.updateMetadata(first.id, true, 200);
      await manager.updateMetadata(first.id, true, 300);

      const updated = await manager.getPattern(first.id);

      expect(updated!.metadata.avgDurationMs).toBe(200);
    });

    it("should track escalations", async () => {
      const patterns = await manager.getAllPatterns();
      const first = patterns[0]!;

      await manager.updateMetadata(first.id, false, 100, true);

      const updated = await manager.getPattern(first.id);

      expect(updated!.metadata.escalationCount).toBe(1);
    });
  });

  describe("findPatternForError", () => {
    it("should find matching pattern", async () => {
      const pattern = await manager.findPatternForError("TYPE", "TS2304");

      expect(pattern).toBeDefined();
      expect(pattern!.errorCode).toBe("TS2304");
    });

    it("should return null for unknown error", async () => {
      const pattern = await manager.findPatternForError("TYPE", "UNKNOWN");

      expect(pattern).toBeNull();
    });

    it("should return highest success rate pattern", async () => {
      // Add alternative pattern with higher success
      await manager.addPattern({
        category: "TYPE",
        errorCode: "TS2304",
        fixType: "fix_typo",
        description: "Alternative fix",
        confidence: "medium",
      });

      // Update the alternative with high success
      await manager.updateMetadata("TYPE:TS2304:fix_typo", true, 100);
      await manager.updateMetadata("TYPE:TS2304:fix_typo", true, 100);
      await manager.updateMetadata("TYPE:TS2304:fix_typo", true, 100);

      const pattern = await manager.findPatternForError("TYPE", "TS2304");

      expect(pattern!.fixType).toBe("fix_typo");
    });
  });

  describe("query", () => {
    it("should filter by category", async () => {
      const patterns = await manager.query({ category: "TYPE" });

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.category === "TYPE")).toBe(true);
    });

    it("should filter by status", async () => {
      // Add deprecated pattern
      await manager.addPattern({
        category: "TYPE",
        errorCode: "TS0001",
        fixType: "manual",
        description: "Deprecated",
        confidence: "low",
        status: "deprecated",
      });

      const deprecated = await manager.query({ status: "deprecated" });
      expect(deprecated.length).toBe(1);

      const active = await manager.query({ status: "active" });
      expect(active.every((p) => p.status === "active")).toBe(true);
    });

    it("should filter by minimum success rate", async () => {
      // Update some patterns with successes
      const patterns = await manager.getAllPatterns();
      await manager.updateMetadata(patterns[0]!.id, true, 100);
      await manager.updateMetadata(patterns[0]!.id, true, 100);
      await manager.updateMetadata(patterns[1]!.id, false, 100);

      const highSuccess = await manager.query({ minSuccessRate: 0.9 });

      expect(highSuccess.every((p) => p.metadata.successRate >= 0.9)).toBe(true);
    });

    it("should sort by field", async () => {
      const patterns = await manager.getAllPatterns();
      await manager.updateMetadata(patterns[0]!.id, true, 100);
      await manager.updateMetadata(patterns[0]!.id, true, 100);
      await manager.updateMetadata(patterns[1]!.id, true, 100);
      await manager.updateMetadata(patterns[1]!.id, true, 100);
      await manager.updateMetadata(patterns[1]!.id, true, 100);

      const sorted = await manager.query({
        sortBy: "appliedCount",
        sortOrder: "desc",
      });

      expect(sorted[0]!.metadata.appliedCount).toBeGreaterThanOrEqual(
        sorted[1]!.metadata.appliedCount
      );
    });
  });

  describe("deletePattern", () => {
    it("should delete a pattern", async () => {
      const countBefore = await manager.getCount();

      const patterns = await manager.getAllPatterns();
      const first = patterns[0]!;

      const deleted = await manager.deletePattern(first.id);

      expect(deleted).toBe(true);

      const countAfter = await manager.getCount();
      expect(countAfter).toBe(countBefore - 1);
    });

    it("should return false for non-existent pattern", async () => {
      const deleted = await manager.deletePattern("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("import/export", () => {
    it("should export to JSON", async () => {
      const json = await manager.exportJson();
      const data = JSON.parse(json);

      expect(data.schemaVersion).toBeDefined();
      expect(data.patterns).toBeDefined();
      expect(Array.isArray(data.patterns)).toBe(true);
    });

    it("should import and merge patterns", async () => {
      const countBefore = await manager.getCount();

      // Create export data with new pattern
      const exportData = {
        schemaVersion: "1.0.0",
        lastUpdated: new Date().toISOString(),
        patterns: [
          {
            id: "TEST:NEW_ERROR:manual",
            description: "Imported pattern",
            category: "TEST",
            errorCode: "NEW_ERROR",
            fixType: "manual",
            confidence: "low",
            status: "active",
            metadata: {
              appliedCount: 0,
              successCount: 0,
              failureCount: 0,
              escalationCount: 0,
              successRate: 0,
              avgDurationMs: 0,
              source: "manual",
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: {
          source: "import",
        },
      };

      const imported = await manager.importJson(JSON.stringify(exportData), true);

      expect(imported).toBe(1);

      const countAfter = await manager.getCount();
      expect(countAfter).toBe(countBefore + 1);
    });

    it("should replace patterns when not merging", async () => {
      const exportData = {
        schemaVersion: "1.0.0",
        lastUpdated: new Date().toISOString(),
        patterns: [
          {
            id: "TEST:ONLY_ONE:manual",
            description: "Only pattern",
            category: "TEST",
            errorCode: "ONLY_ONE",
            fixType: "manual",
            confidence: "low",
            status: "active",
            metadata: {
              appliedCount: 0,
              successCount: 0,
              failureCount: 0,
              escalationCount: 0,
              successRate: 0,
              avgDurationMs: 0,
              source: "manual",
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: {
          source: "import",
        },
      };

      await manager.importJson(JSON.stringify(exportData), false);

      const count = await manager.getCount();
      expect(count).toBe(1);

      const patterns = await manager.getAllPatterns();
      expect(patterns[0]!.id).toBe("TEST:ONLY_ONE:manual");
    });
  });

  describe("resetToDefaults", () => {
    it("should reset all patterns to defaults", async () => {
      // Add custom pattern
      await manager.addPattern({
        category: "TYPE",
        errorCode: "CUSTOM",
        fixType: "manual",
        description: "Custom",
        confidence: "low",
      });

      // Update some metadata
      const patterns = await manager.getAllPatterns();
      await manager.updateMetadata(patterns[0]!.id, true, 100);

      // Reset
      await manager.resetToDefaults();

      // Verify reset
      const afterReset = await manager.getAllPatterns();
      const custom = afterReset.find((p) => p.errorCode === "CUSTOM");
      expect(custom).toBeUndefined();

      // Check metadata reset
      expect(afterReset[0]!.metadata.appliedCount).toBe(0);
    });
  });
});
