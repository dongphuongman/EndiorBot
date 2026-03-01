/**
 * Checkpoint Manager Tests
 *
 * Unit tests for the CheckpointManager class.
 * Sprint 65: Week 1 - Context Anchoring Foundation.
 *
 * @module context/__tests__/checkpoint-manager.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ContextAnchor, resetContextAnchor } from "../context-anchor.js";
import {
  CheckpointManager,
  getCheckpointManager,
  resetCheckpointManager,
  DEFAULT_AUTO_CHECKPOINT_CONFIG,
} from "../checkpoint-manager.js";
import type { Checkpoint, AnchorPoint } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "checkpoint-test-"));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// CheckpointManager Tests
// ============================================================================

describe("CheckpointManager", () => {
  let anchor: ContextAnchor;
  let manager: CheckpointManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await resetContextAnchor();
    await resetCheckpointManager();
    anchor = new ContextAnchor({ storagePath: tempDir });
    manager = new CheckpointManager(anchor);
  });

  afterEach(async () => {
    manager.stopAutoCheckpoint();
    await resetCheckpointManager();
    await resetContextAnchor();
    await cleanupTempDir(tempDir);
  });

  describe("create", () => {
    it("should create a checkpoint with auto-generated ID", async () => {
      const checkpoint = await manager.create({
        name: "Test Checkpoint",
        trigger: "manual",
      });

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.id).toMatch(/^checkpoint_/);
      expect(checkpoint.name).toBe("Test Checkpoint");
      expect(checkpoint.trigger).toBe("manual");
      expect(checkpoint.restorable).toBe(true);
    });

    it("should include active anchors in checkpoint", async () => {
      // Create an active anchor
      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Test Decision",
        content: "Content",
        priority: "medium",
        state: "active",
        tags: [],
        metadata: {},
      });

      const checkpoint = await manager.create({
        name: "Test Checkpoint",
        trigger: "manual",
      });

      expect(checkpoint.activeAnchors.length).toBe(1);
    });

    it("should include optional git info", async () => {
      const checkpoint = await manager.create({
        name: "Pre-merge",
        trigger: "pre_destructive",
        gitCommit: "abc123def",
        gitBranch: "feature/test",
      });

      expect(checkpoint.gitCommit).toBe("abc123def");
      expect(checkpoint.gitBranch).toBe("feature/test");
    });

    it("should set priority based on trigger", async () => {
      const manual = await manager.create({
        name: "Manual",
        trigger: "manual",
      });
      expect(manual.priority).toBe("high");

      const preDestructive = await manager.create({
        name: "Pre-destructive",
        trigger: "pre_destructive",
      });
      expect(preDestructive.priority).toBe("critical");

      const autoTime = await manager.create({
        name: "Auto Time",
        trigger: "auto_time",
      });
      expect(autoTime.priority).toBe("low");
    });
  });

  describe("convenience create methods", () => {
    it("should create manual checkpoint", async () => {
      const checkpoint = await manager.createManual("Quick Save", "04-BUILD");

      expect(checkpoint.trigger).toBe("manual");
      expect(checkpoint.stage).toBe("04-BUILD");
    });

    it("should create pre-destructive checkpoint", async () => {
      const checkpoint = await manager.createPreDestructive("refactor");

      expect(checkpoint.trigger).toBe("pre_destructive");
      expect(checkpoint.name).toContain("Pre-refactor");
      expect(checkpoint.metadata.operation).toBe("refactor");
    });

    it("should create milestone checkpoint", async () => {
      const checkpoint = await manager.createMilestone("Feature Complete");

      expect(checkpoint.trigger).toBe("auto_milestone");
      expect(checkpoint.name).toContain("Milestone: Feature Complete");
    });

    it("should create session end checkpoint", async () => {
      const checkpoint = await manager.createSessionEnd();

      expect(checkpoint.trigger).toBe("session_end");
      expect(checkpoint.name).toBe("Session End");
    });
  });

  describe("get and list", () => {
    it("should get checkpoint by ID", async () => {
      const created = await manager.create({
        name: "Test",
        trigger: "manual",
      });

      const retrieved = await manager.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return null for non-existent checkpoint", async () => {
      const retrieved = await manager.get("nonexistent");
      expect(retrieved).toBeNull();
    });

    it("should list all checkpoints", async () => {
      await manager.create({ name: "First", trigger: "manual" });
      await manager.create({ name: "Second", trigger: "manual" });
      await manager.create({ name: "Third", trigger: "auto_time" });

      const all = await manager.list();
      expect(all.length).toBe(3);
    });

    it("should list with limit", async () => {
      await manager.create({ name: "First", trigger: "manual" });
      await manager.create({ name: "Second", trigger: "manual" });
      await manager.create({ name: "Third", trigger: "manual" });

      const limited = await manager.list(2);
      expect(limited.length).toBe(2);
    });

    it("should get most recent checkpoint", async () => {
      await manager.create({ name: "First", trigger: "manual" });
      await new Promise((r) => setTimeout(r, 5));
      await manager.create({ name: "Second", trigger: "manual" });

      const recent = await manager.getMostRecent();
      expect(recent?.name).toBe("Second");
    });

    it("should get checkpoints by trigger", async () => {
      await manager.create({ name: "Manual 1", trigger: "manual" });
      await manager.create({ name: "Auto 1", trigger: "auto_time" });
      await manager.create({ name: "Manual 2", trigger: "manual" });

      const manuals = await manager.getByTrigger("manual");
      expect(manuals.length).toBe(2);
    });
  });

  describe("restore", () => {
    it("should restore a checkpoint", async () => {
      // Create an anchor
      const testAnchor = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Test Decision",
        content: "Content",
        priority: "medium",
        state: "active",
        tags: [],
        metadata: {},
      });

      // Create checkpoint with the anchor
      const checkpoint = await manager.create({
        name: "Test Checkpoint",
        trigger: "manual",
      });

      // Archive the anchor
      await anchor.archive(testAnchor.id);

      // Restore the checkpoint
      const result = await manager.restore(checkpoint.id);

      expect(result.success).toBe(true);
      expect(result.activatedAnchors.length).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should fail for non-existent checkpoint", async () => {
      const result = await manager.restore("nonexistent");

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Checkpoint not found: nonexistent");
    });

    it("should fail for non-restorable checkpoint", async () => {
      const checkpoint = await manager.create({
        name: "Test",
        trigger: "manual",
      });

      // Mark as non-restorable (cast to allow restorable property)
      await anchor.update<Checkpoint>(checkpoint.id, { restorable: false } as Partial<Omit<Checkpoint, "id" | "type" | "createdAt">>);

      const result = await manager.restore(checkpoint.id);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Checkpoint is not restorable");
    });

    it("should update metadata on restore", async () => {
      const checkpoint = await manager.create({
        name: "Test",
        trigger: "manual",
      });

      await manager.restore(checkpoint.id);
      const updated = await manager.get(checkpoint.id);

      expect(updated?.metadata.lastRestored).toBeDefined();
      expect(updated?.metadata.restoreCount).toBe(1);
    });
  });

  describe("token-based checkpoints", () => {
    it("should create checkpoint when token threshold exceeded", async () => {
      const tokenManager = new CheckpointManager(anchor, {
        tokenEnabled: true,
        tokenThreshold: 1000,
      });

      const checkpoint = await tokenManager.updateTokenCount(1500);

      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.trigger).toBe("auto_tokens");
    });

    it("should not create checkpoint below threshold", async () => {
      const tokenManager = new CheckpointManager(anchor, {
        tokenEnabled: true,
        tokenThreshold: 50000,
      });

      const checkpoint = await tokenManager.updateTokenCount(10000);

      expect(checkpoint).toBeNull();
    });

    it("should respect token feature flag", async () => {
      const tokenManager = new CheckpointManager(anchor, {
        tokenEnabled: false,
        tokenThreshold: 100,
      });

      const checkpoint = await tokenManager.updateTokenCount(1000);

      expect(checkpoint).toBeNull();
    });
  });

  describe("archive", () => {
    it("should archive a checkpoint", async () => {
      const checkpoint = await manager.create({
        name: "Test",
        trigger: "manual",
      });

      const archived = await manager.archive(checkpoint.id);
      expect(archived?.state).toBe("archived");
    });
  });

  describe("formatForDisplay", () => {
    it("should format checkpoint as markdown", async () => {
      const checkpoint = await manager.create({
        name: "Test Checkpoint",
        trigger: "manual",
        gitBranch: "main",
        gitCommit: "abc123def456",
        modifiedFiles: ["src/test.ts", "src/other.ts"],
      });

      const formatted = manager.formatForDisplay(checkpoint);

      expect(formatted).toContain("## Checkpoint: Test Checkpoint");
      expect(formatted).toContain("**Trigger:** manual");
      expect(formatted).toContain("**Branch:** main");
      expect(formatted).toContain("**Commit:** abc123de");
      expect(formatted).toContain("src/test.ts");
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe("AutoCheckpointConfig", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_AUTO_CHECKPOINT_CONFIG.timeEnabled).toBe(true);
    expect(DEFAULT_AUTO_CHECKPOINT_CONFIG.timeIntervalMinutes).toBe(30);
    expect(DEFAULT_AUTO_CHECKPOINT_CONFIG.tokenEnabled).toBe(true);
    expect(DEFAULT_AUTO_CHECKPOINT_CONFIG.tokenThreshold).toBe(50000);
    expect(DEFAULT_AUTO_CHECKPOINT_CONFIG.maxCheckpoints).toBe(50);
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe("getCheckpointManager", () => {
  beforeEach(async () => {
    await resetCheckpointManager();
    await resetContextAnchor();
  });

  afterEach(async () => {
    await resetCheckpointManager();
    await resetContextAnchor();
  });

  it("should return same instance", () => {
    const manager1 = getCheckpointManager();
    const manager2 = getCheckpointManager();
    expect(manager1).toBe(manager2);
  });

  it("should create new instance after reset", () => {
    const manager1 = getCheckpointManager();
    resetCheckpointManager();
    const manager2 = getCheckpointManager();
    expect(manager1).not.toBe(manager2);
  });

  it("should accept configuration", () => {
    const manager = getCheckpointManager({ timeIntervalMinutes: 60 });
    expect(manager).toBeDefined();
  });
});
