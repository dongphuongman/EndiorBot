/**
 * Conflict Detection Tests
 *
 * Unit tests for conflict detection, classification, and resolution.
 *
 * @module tests/sessions/checkpoint/conflict
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 4
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  // Detector
  detectConflicts,
  detectConflictsForPaths,
  hasFileConflict,
  getConflictingPaths,
  filterConflictsByType,
  hasConflictType,
  toFileConflicts,
  type RawConflict,
  // Classifier
  classifyConflict,
  classifyConflicts,
  allAutoResolvable,
  getReviewRequired,
  getConflictSummary,
  type ClassifiedConflict,
  // Resolver
  autoResolveConflicts,
  forceRestore,
  acceptNewBaseline,
  abortResolution,
  resolveConflicts,
  getAvailableResolutions,
  getRecommendedResolution,
  // Types
  type CheckpointState,
  type ConflictSeverity,
  createCheckpoint,
  hashFile,
} from "../../../src/sessions/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `conflict-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true });
  }
});

async function createTestFile(name: string, content: string): Promise<string> {
  const path = join(testDir, name);
  await writeFile(path, content, "utf8");
  return path;
}

function createMockSession() {
  return {
    id: `session-${Date.now()}`,
    projectId: "test-project",
    createdAt: new Date(),
    lastActiveAt: new Date(),
    messages: [],
    tokenCount: 1000,
    maxTokens: 50000,
    sdlcStage: "04-BUILD" as const,
    activeGates: [],
    compactionCount: 0,
  };
}

async function createTestCheckpoint(fileHashes: Record<string, string>): Promise<CheckpointState> {
  const checkpoint = await createCheckpoint({
    reason: "manual",
    session: createMockSession(),
    activeSoul: "coder",
    currentPhase: "implement",
    sessionCostSoFar: 0,
    tokenUsage: [],
  });

  // Override file hashes
  checkpoint.filesystem.fileHashes = fileHashes;

  return checkpoint;
}

// ============================================================================
// Conflict Detector Tests
// ============================================================================

describe("Conflict Detector", () => {
  describe("detectConflicts", () => {
    it("should detect no conflicts when files unchanged", async () => {
      const filePath = await createTestFile("unchanged.txt", "original content");
      const hash = await hashFile(filePath);

      const checkpoint = await createTestCheckpoint({ [filePath]: hash });
      const result = await detectConflicts(checkpoint);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
      expect(result.filesChecked).toBe(1);
    });

    it("should detect modified files", async () => {
      const filePath = await createTestFile("modified.txt", "original content");
      const originalHash = await hashFile(filePath);

      // Modify the file
      await writeFile(filePath, "modified content", "utf8");

      const checkpoint = await createTestCheckpoint({ [filePath]: originalHash });
      const result = await detectConflicts(checkpoint);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.modifiedFiles).toContain(filePath);
      expect(result.conflicts[0].type).toBe("modified");
    });

    it("should detect deleted files", async () => {
      const filePath = await createTestFile("deleted.txt", "original content");
      const originalHash = await hashFile(filePath);

      // Delete the file
      await rm(filePath);

      const checkpoint = await createTestCheckpoint({ [filePath]: originalHash });
      const result = await detectConflicts(checkpoint);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.deletedFiles).toContain(filePath);
      expect(result.conflicts[0].type).toBe("deleted");
    });

    it("should detect multiple conflicts", async () => {
      const file1 = await createTestFile("file1.txt", "content 1");
      const file2 = await createTestFile("file2.txt", "content 2");
      const file3 = await createTestFile("file3.txt", "content 3");

      const hash1 = await hashFile(file1);
      const hash2 = await hashFile(file2);
      const hash3 = await hashFile(file3);

      // Modify file1, delete file2, keep file3 unchanged
      await writeFile(file1, "modified 1", "utf8");
      await rm(file2);

      const checkpoint = await createTestCheckpoint({
        [file1]: hash1,
        [file2]: hash2,
        [file3]: hash3,
      });
      const result = await detectConflicts(checkpoint);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(2);
      expect(result.modifiedFiles).toHaveLength(1);
      expect(result.deletedFiles).toHaveLength(1);
      expect(result.filesChecked).toBe(3);
    });
  });

  describe("detectConflictsForPaths", () => {
    it("should detect conflicts for specific paths only", async () => {
      const file1 = await createTestFile("specific1.txt", "content 1");
      const file2 = await createTestFile("specific2.txt", "content 2");

      const hash1 = await hashFile(file1);
      const hash2 = await hashFile(file2);

      // Modify both files
      await writeFile(file1, "modified 1", "utf8");
      await writeFile(file2, "modified 2", "utf8");

      // Only check file1
      const result = await detectConflictsForPaths({ [file1]: hash1, [file2]: hash2 }, [file1]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].path).toBe(file1);
    });

    it("should detect new files not in checkpoint", async () => {
      const newFile = await createTestFile("new.txt", "new content");

      const result = await detectConflictsForPaths({}, [newFile]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe("created");
      expect(result.newFiles).toContain(newFile);
    });
  });

  describe("hasFileConflict", () => {
    it("should return false for unchanged file", async () => {
      const filePath = await createTestFile("check.txt", "content");
      const hash = await hashFile(filePath);

      const result = await hasFileConflict(filePath, hash);
      expect(result).toBe(false);
    });

    it("should return true for modified file", async () => {
      const filePath = await createTestFile("check.txt", "content");
      const hash = await hashFile(filePath);

      await writeFile(filePath, "modified", "utf8");

      const result = await hasFileConflict(filePath, hash);
      expect(result).toBe(true);
    });

    it("should return true for deleted file", async () => {
      const filePath = await createTestFile("check.txt", "content");
      const hash = await hashFile(filePath);

      await rm(filePath);

      const result = await hasFileConflict(filePath, hash);
      expect(result).toBe(true);
    });
  });

  describe("filterConflictsByType", () => {
    it("should filter conflicts by type", () => {
      const conflicts: RawConflict[] = [
        { path: "a.txt", checkpointHash: "h1", currentHash: "h2", type: "modified" },
        { path: "b.txt", checkpointHash: "h3", currentHash: "", type: "deleted" },
        { path: "c.txt", checkpointHash: "", currentHash: "h4", type: "created" },
      ];

      expect(filterConflictsByType(conflicts, "modified")).toHaveLength(1);
      expect(filterConflictsByType(conflicts, "deleted")).toHaveLength(1);
      expect(filterConflictsByType(conflicts, "created")).toHaveLength(1);
    });
  });

  describe("toFileConflicts", () => {
    it("should convert raw conflicts to FileConflict format", () => {
      const raw: RawConflict[] = [
        { path: "test.txt", checkpointHash: "h1", currentHash: "h2", type: "modified" },
      ];

      const fileConflicts = toFileConflicts(raw, "semantic");

      expect(fileConflicts).toHaveLength(1);
      expect(fileConflicts[0].severity).toBe("semantic");
    });
  });
});

// ============================================================================
// Conflict Classifier Tests
// ============================================================================

describe("Conflict Classifier", () => {
  describe("classifyConflict", () => {
    it("should classify deleted files as structural", async () => {
      const raw: RawConflict = {
        path: "deleted.txt",
        checkpointHash: "abc123",
        currentHash: "",
        type: "deleted",
      };

      const result = await classifyConflict(raw, "original content");

      expect(result.severity).toBe("structural");
      expect(result.autoResolvable).toBe(false);
      expect(result.conflictType).toBe("deleted");
    });

    it("should classify new files as structural", async () => {
      const raw: RawConflict = {
        path: "new.txt",
        checkpointHash: "",
        currentHash: "xyz789",
        type: "created",
      };

      const result = await classifyConflict(raw, undefined, "new content");

      expect(result.severity).toBe("structural");
      expect(result.autoResolvable).toBe(false);
      expect(result.conflictType).toBe("created");
    });

    it("should classify whitespace-only changes as trivial", async () => {
      const raw: RawConflict = {
        path: "whitespace.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        type: "modified",
      };

      const before = "line1\nline2";
      const after = "line1  \n  line2  ";

      const result = await classifyConflict(raw, before, after);

      expect(result.severity).toBe("trivial");
      expect(result.autoResolvable).toBe(true);
    });

    it("should classify additive changes as additive", async () => {
      const raw: RawConflict = {
        path: "additive.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        type: "modified",
      };

      const before = "line1\nline2";
      const after = "line1\nline2\nline3\nline4";

      const result = await classifyConflict(raw, before, after);

      expect(result.severity).toBe("additive");
      expect(result.autoResolvable).toBe(true);
    });

    it("should classify content changes as semantic", async () => {
      const raw: RawConflict = {
        path: "semantic.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        type: "modified",
      };

      const before = "function foo() {\n  return 1;\n}\n\nfunction bar() {\n  return 2;\n}";
      const after = "function foo() {\n  return 100;\n}\n\nfunction bar() {\n  return 200;\n}";

      const result = await classifyConflict(raw, before, after);

      expect(result.severity).toBe("semantic");
      expect(result.autoResolvable).toBe(false);
    });

    it("should classify unknown when content unavailable", async () => {
      const raw: RawConflict = {
        path: "unknown.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        type: "modified",
      };

      const result = await classifyConflict(raw);

      expect(result.severity).toBe("unknown");
      expect(result.autoResolvable).toBe(false);
    });
  });

  describe("classifyConflicts", () => {
    it("should classify multiple conflicts", async () => {
      const conflicts: RawConflict[] = [
        { path: "deleted.txt", checkpointHash: "h1", currentHash: "", type: "deleted" },
        { path: "created.txt", checkpointHash: "", currentHash: "h2", type: "created" },
      ];

      const result = await classifyConflicts(conflicts);

      expect(result.conflicts).toHaveLength(2);
      expect(result.bySeverity.structural).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.structural).toBe(2);
    });

    it("should determine correct recommendation", async () => {
      // All trivial = proceed
      const trivialOnly: RawConflict[] = [];
      const trivialResult = await classifyConflicts(trivialOnly);
      expect(trivialResult.recommendation).toBe("proceed");

      // Structural = abort
      const structural: RawConflict[] = [
        { path: "deleted.txt", checkpointHash: "h1", currentHash: "", type: "deleted" },
      ];
      const structuralResult = await classifyConflicts(structural);
      expect(structuralResult.recommendation).toBe("abort");
    });
  });

  describe("utility functions", () => {
    it("allAutoResolvable should work correctly", async () => {
      const conflicts: RawConflict[] = [];
      const result = await classifyConflicts(conflicts);

      expect(allAutoResolvable(result)).toBe(true);
    });

    it("getReviewRequired should filter non-auto-resolvable", async () => {
      const conflicts: RawConflict[] = [
        { path: "deleted.txt", checkpointHash: "h1", currentHash: "", type: "deleted" },
      ];
      const result = await classifyConflicts(conflicts);

      const reviewRequired = getReviewRequired(result);
      expect(reviewRequired).toHaveLength(1);
    });

    it("getConflictSummary should return readable summary", async () => {
      const conflicts: RawConflict[] = [
        { path: "deleted.txt", checkpointHash: "h1", currentHash: "", type: "deleted" },
      ];
      const result = await classifyConflicts(conflicts);

      const summary = getConflictSummary(result);
      expect(summary).toContain("Total conflicts: 1");
      expect(summary).toContain("Structural");
    });
  });
});

// ============================================================================
// Conflict Resolver Tests
// ============================================================================

describe("Conflict Resolver", () => {
  describe("autoResolveConflicts", () => {
    it("should auto-resolve trivial conflicts", async () => {
      const conflict: ClassifiedConflict = {
        path: "trivial.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "trivial",
        conflictType: "modified",
        autoResolvable: true,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Whitespace only",
      };

      const classificationResult = {
        conflicts: [conflict],
        bySeverity: {
          trivial: [conflict],
          additive: [],
          semantic: [],
          structural: [],
          unknown: [],
        },
        summary: {
          total: 1,
          trivial: 1,
          additive: 0,
          semantic: 0,
          structural: 0,
          unknown: 0,
          autoResolvable: 1,
          requiresReview: 0,
        },
        recommendation: "proceed" as const,
      };

      const result = await autoResolveConflicts(classificationResult);

      expect(result.resolved).toHaveLength(1);
      expect(result.unresolved).toHaveLength(0);
      expect(result.allResolved).toBe(true);
      expect(result.summary.autoMerged).toBe(1);
    });

    it("should leave non-auto-resolvable conflicts unresolved", async () => {
      const conflict: ClassifiedConflict = {
        path: "semantic.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 5,
        linesRemoved: 3,
        reason: "Content changed",
      };

      const classificationResult = {
        conflicts: [conflict],
        bySeverity: {
          trivial: [],
          additive: [],
          semantic: [conflict],
          structural: [],
          unknown: [],
        },
        summary: {
          total: 1,
          trivial: 0,
          additive: 0,
          semantic: 1,
          structural: 0,
          unknown: 0,
          autoResolvable: 0,
          requiresReview: 1,
        },
        recommendation: "review" as const,
      };

      const result = await autoResolveConflicts(classificationResult);

      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toHaveLength(1);
      expect(result.allResolved).toBe(false);
    });
  });

  describe("forceRestore", () => {
    it("should restore file from checkpoint content", async () => {
      const filePath = await createTestFile("restore.txt", "current content");

      const conflict: ClassifiedConflict = {
        path: filePath,
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Test",
      };

      const result = await forceRestore(conflict, "checkpoint content");

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("force_restore");

      const content = await readFile(filePath, "utf8");
      expect(content).toBe("checkpoint content");
    });

    it("should create backup when requested", async () => {
      const filePath = await createTestFile("backup.txt", "current content");
      const backupDir = join(testDir, "backups");

      const conflict: ClassifiedConflict = {
        path: filePath,
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Test",
      };

      const result = await forceRestore(conflict, "checkpoint content", {
        backupDir,
        createBackups: true,
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath as string)).toBe(true);
    });

    it("should support dry run mode", async () => {
      const filePath = await createTestFile("dryrun.txt", "current content");

      const conflict: ClassifiedConflict = {
        path: filePath,
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Test",
      };

      const result = await forceRestore(conflict, "checkpoint content", { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would overwrite");

      // File should not be modified
      const content = await readFile(filePath, "utf8");
      expect(content).toBe("current content");
    });
  });

  describe("acceptNewBaseline", () => {
    it("should accept current content as new baseline", async () => {
      const conflict: ClassifiedConflict = {
        path: "baseline.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "additive",
        conflictType: "modified",
        autoResolvable: true,
        linesAdded: 5,
        linesRemoved: 0,
        reason: "Test",
      };

      const result = await acceptNewBaseline(conflict);

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("new_baseline");
    });
  });

  describe("abortResolution", () => {
    it("should mark conflict as aborted", () => {
      const conflict: ClassifiedConflict = {
        path: "abort.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "structural",
        conflictType: "deleted",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 10,
        reason: "Test",
      };

      const result = abortResolution(conflict);

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("abort");
    });
  });

  describe("resolveConflicts", () => {
    it("should resolve all conflicts with new_baseline", async () => {
      const conflicts: ClassifiedConflict[] = [
        {
          path: "file1.txt",
          checkpointHash: "h1",
          currentHash: "h2",
          severity: "additive",
          conflictType: "modified",
          autoResolvable: true,
          linesAdded: 2,
          linesRemoved: 0,
          reason: "Test",
        },
        {
          path: "file2.txt",
          checkpointHash: "h3",
          currentHash: "h4",
          severity: "semantic",
          conflictType: "modified",
          autoResolvable: false,
          linesAdded: 5,
          linesRemoved: 3,
          reason: "Test",
        },
      ];

      const result = await resolveConflicts(conflicts, "new_baseline");

      expect(result.resolved).toHaveLength(2);
      expect(result.unresolved).toHaveLength(0);
      expect(result.allResolved).toBe(true);
    });

    it("should leave merge_manual unresolved", async () => {
      const conflict: ClassifiedConflict = {
        path: "manual.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 5,
        linesRemoved: 3,
        reason: "Test",
      };

      const result = await resolveConflicts([conflict], "merge_manual");

      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toHaveLength(1);
      expect(result.allResolved).toBe(false);
    });
  });

  describe("utility functions", () => {
    it("getAvailableResolutions should return correct options", () => {
      const trivial: ClassifiedConflict = {
        path: "trivial.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "trivial",
        conflictType: "modified",
        autoResolvable: true,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Test",
      };

      const structural: ClassifiedConflict = {
        path: "structural.txt",
        checkpointHash: "h1",
        currentHash: "",
        severity: "structural",
        conflictType: "deleted",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 10,
        reason: "Test",
      };

      const trivialOptions = getAvailableResolutions(trivial);
      expect(trivialOptions).toContain("abort");
      expect(trivialOptions).toContain("force_restore");
      expect(trivialOptions).toContain("new_baseline");

      const structuralOptions = getAvailableResolutions(structural);
      expect(structuralOptions).toContain("abort");
      expect(structuralOptions).toContain("merge_manual");
      expect(structuralOptions).not.toContain("force_restore");
    });

    it("getRecommendedResolution should return correct recommendation", () => {
      const trivial: ClassifiedConflict = {
        path: "t.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "trivial",
        conflictType: "modified",
        autoResolvable: true,
        linesAdded: 0,
        linesRemoved: 0,
        reason: "Test",
      };

      const semantic: ClassifiedConflict = {
        path: "s.txt",
        checkpointHash: "h1",
        currentHash: "h2",
        severity: "semantic",
        conflictType: "modified",
        autoResolvable: false,
        linesAdded: 5,
        linesRemoved: 3,
        reason: "Test",
      };

      const structural: ClassifiedConflict = {
        path: "st.txt",
        checkpointHash: "h1",
        currentHash: "",
        severity: "structural",
        conflictType: "deleted",
        autoResolvable: false,
        linesAdded: 0,
        linesRemoved: 10,
        reason: "Test",
      };

      expect(getRecommendedResolution(trivial)).toBe("new_baseline");
      expect(getRecommendedResolution(semantic)).toBe("merge_manual");
      expect(getRecommendedResolution(structural)).toBe("abort");
    });
  });
});
