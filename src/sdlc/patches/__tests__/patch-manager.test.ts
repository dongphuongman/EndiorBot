/**
 * PatchManager Tests
 *
 * Unit tests for PatchManager - file change tracking with rollback support.
 *
 * @module sdlc/patches/__tests__/patch-manager.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  PatchManager,
  resetPatchManager,
  type CreatePatchOptions,
} from "../index.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("PatchManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPatchManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "patch-test-"));
  });

  afterEach(async () => {
    resetPatchManager();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe("constructor", () => {
    it("should create manager with project root", () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      expect(manager).toBeDefined();
    });

    it("should create patch directory if it does not exist", () => {
      new PatchManager({ projectRoot: tempDir });
      const patchDir = path.join(tempDir, ".endiorbot/patches");
      expect(existsSync(patchDir)).toBe(true);
    });

    it("should accept custom patch directory", () => {
      const customDir = "custom-patches";
      new PatchManager({ projectRoot: tempDir, patchDir: customDir });
      const patchDir = path.join(tempDir, customDir);
      expect(existsSync(patchDir)).toBe(true);
    });
  });

  // ============================================================================
  // Patch Lifecycle Tests
  // ============================================================================

  describe("startPatch", () => {
    it("should create a new patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const options: CreatePatchOptions = {
        name: "Test Patch",
        author: "@coder",
      };

      const patch = await manager.startPatch(options);

      expect(patch.id).toMatch(/^patch-/);
      expect(patch.name).toBe("Test Patch");
      expect(patch.author).toBe("@coder");
      expect(patch.state).toBe("pending");
      expect(patch.canRollback).toBe(true);
      expect(patch.changes).toEqual([]);
    });

    it("should set optional fields", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const options: CreatePatchOptions = {
        name: "Test Patch",
        author: "@coder",
        description: "Test description",
        sprintId: "sprint-68",
        taskId: "T2.1",
        metadata: { key: "value" },
      };

      const patch = await manager.startPatch(options);

      expect(patch.description).toBe("Test description");
      expect(patch.sprintId).toBe("sprint-68");
      expect(patch.taskId).toBe("T2.1");
      expect(patch.metadata).toEqual({ key: "value" });
    });

    it("should persist patch to disk", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Persisted Patch",
        author: "@coder",
      });

      const patchFile = path.join(
        tempDir,
        ".endiorbot/patches",
        `${patch.id}.json`
      );
      expect(existsSync(patchFile)).toBe(true);
    });
  });

  describe("recordChange", () => {
    it("should record a create change", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Create Test",
        author: "@coder",
      });

      const change = await manager.recordChange(patch.id, {
        path: "src/new-file.ts",
        changeType: "create",
        newContent: "console.log('hello');",
      });

      expect(change.path).toBe("src/new-file.ts");
      expect(change.changeType).toBe("create");
      expect(change.newContent).toBe("console.log('hello');");
      expect(change.newHash).toBeDefined();
    });

    it("should record a modify change with diff hunks", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Modify Test",
        author: "@coder",
      });

      const change = await manager.recordChange(patch.id, {
        path: "src/existing.ts",
        changeType: "modify",
        previousContent: "line1\nline2\nline3",
        newContent: "line1\nmodified\nline3",
      });

      expect(change.changeType).toBe("modify");
      expect(change.previousContent).toBe("line1\nline2\nline3");
      expect(change.newContent).toBe("line1\nmodified\nline3");
      expect(change.diffHunks.length).toBeGreaterThan(0);
    });

    it("should record a delete change", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Delete Test",
        author: "@coder",
      });

      const change = await manager.recordChange(patch.id, {
        path: "src/to-delete.ts",
        changeType: "delete",
        previousContent: "deleted content",
      });

      expect(change.changeType).toBe("delete");
      expect(change.previousContent).toBe("deleted content");
      expect(change.previousHash).toBeDefined();
    });

    it("should throw for non-existent patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });

      await expect(
        manager.recordChange("non-existent", {
          path: "test.ts",
          changeType: "create",
          newContent: "test",
        })
      ).rejects.toThrow("Patch not found");
    });

    it("should throw when recording to committed patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Commit Test",
        author: "@coder",
      });
      await manager.commitPatch(patch.id);

      await expect(
        manager.recordChange(patch.id, {
          path: "test.ts",
          changeType: "create",
          newContent: "test",
        })
      ).rejects.toThrow("Cannot record changes to committed patch");
    });
  });

  describe("commitPatch", () => {
    it("should commit a patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Commit Test",
        author: "@coder",
      });
      await manager.recordChange(patch.id, {
        path: "test.ts",
        changeType: "create",
        newContent: "test",
      });

      const committed = await manager.commitPatch(patch.id);

      expect(committed.state).toBe("committed");
      expect(manager.getActivePatch()).toBeUndefined();
    });

    it("should throw for non-existent patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });

      await expect(manager.commitPatch("non-existent")).rejects.toThrow(
        "Patch not found"
      );
    });
  });

  describe("rollbackPatch", () => {
    it("should rollback a create change", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Rollback Create",
        author: "@coder",
      });

      // Create a file
      const filePath = path.join(tempDir, "src/created.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "created content", "utf-8");

      await manager.recordChange(patch.id, {
        path: "src/created.ts",
        changeType: "create",
        newContent: "created content",
      });

      // Rollback should delete the file
      const result = await manager.rollbackPatch(patch.id);

      expect(result.success).toBe(true);
      expect(result.filesRolledBack).toBe(1);
      expect(existsSync(filePath)).toBe(false);
    });

    it("should rollback a modify change", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Rollback Modify",
        author: "@coder",
      });

      // Create original file
      const filePath = path.join(tempDir, "src/modified.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "modified content", "utf-8");

      await manager.recordChange(patch.id, {
        path: "src/modified.ts",
        changeType: "modify",
        previousContent: "original content",
        newContent: "modified content",
      });

      // Rollback should restore original content
      const result = await manager.rollbackPatch(patch.id);

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("original content");
    });

    it("should rollback a delete change", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Rollback Delete",
        author: "@coder",
      });

      await manager.recordChange(patch.id, {
        path: "src/deleted.ts",
        changeType: "delete",
        previousContent: "deleted content",
      });

      // Rollback should recreate the file
      const result = await manager.rollbackPatch(patch.id);

      expect(result.success).toBe(true);
      const filePath = path.join(tempDir, "src/deleted.ts");
      expect(existsSync(filePath)).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("deleted content");
    });

    it("should mark patch as rolledback", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "State Test",
        author: "@coder",
      });

      await manager.rollbackPatch(patch.id);

      const updatedPatch = manager.getPatch(patch.id);
      expect(updatedPatch?.state).toBe("rolledback");
    });
  });

  // ============================================================================
  // Query Tests
  // ============================================================================

  describe("getPatch", () => {
    it("should return patch by ID", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Get Test",
        author: "@coder",
      });

      const retrieved = manager.getPatch(patch.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(patch.id);
    });

    it("should return undefined for non-existent patch", () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = manager.getPatch("non-existent");
      expect(patch).toBeUndefined();
    });
  });

  describe("getActivePatch", () => {
    it("should return active patch", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "Active Test",
        author: "@coder",
      });

      const active = manager.getActivePatch();
      expect(active).toBeDefined();
      expect(active?.id).toBe(patch.id);
    });

    it("should return undefined when no active patch", () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const active = manager.getActivePatch();
      expect(active).toBeUndefined();
    });
  });

  describe("getHistory", () => {
    it("should return patch history", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      await manager.startPatch({ name: "Patch 1", author: "@coder" });
      await manager.startPatch({ name: "Patch 2", author: "@coder" });

      const history = await manager.getHistory();

      expect(history.length).toBe(2);
    });

    it("should filter by state", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch1 = await manager.startPatch({ name: "Patch 1", author: "@coder" });
      await manager.startPatch({ name: "Patch 2", author: "@coder" });
      await manager.commitPatch(patch1.id);

      const committed = await manager.getHistory({ state: "committed" });
      const pending = await manager.getHistory({ state: "pending" });

      expect(committed.length).toBe(1);
      expect(pending.length).toBe(1);
    });

    it("should apply limit", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      await manager.startPatch({ name: "Patch 1", author: "@coder" });
      await manager.startPatch({ name: "Patch 2", author: "@coder" });
      await manager.startPatch({ name: "Patch 3", author: "@coder" });

      const history = await manager.getHistory({ limit: 2 });

      expect(history.length).toBe(2);
    });
  });

  describe("getFileHistory", () => {
    it("should return file change history", async () => {
      const manager = new PatchManager({ projectRoot: tempDir });
      const patch = await manager.startPatch({
        name: "File History",
        author: "@coder",
      });

      await manager.recordChange(patch.id, {
        path: "src/file.ts",
        changeType: "create",
        newContent: "v1",
      });

      await manager.recordChange(patch.id, {
        path: "src/file.ts",
        changeType: "modify",
        previousContent: "v1",
        newContent: "v2",
      });

      const history = await manager.getFileHistory("src/file.ts");

      expect(history.length).toBe(2);
    });
  });
});
