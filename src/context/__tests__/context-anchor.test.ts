/**
 * Context Anchor Tests
 *
 * Unit tests for the ContextAnchor class.
 * Sprint 65: Week 1 - Context Anchoring Foundation.
 *
 * @module context/__tests__/context-anchor.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextAnchor,
  getContextAnchor,
  resetContextAnchor,
} from "../context-anchor.js";
import type { AnchorPoint } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "context-anchor-test-"));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// ContextAnchor Constructor Tests
// ============================================================================

describe("ContextAnchor", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
    await resetContextAnchor();
  });

  afterEach(async () => {
    await resetContextAnchor();
    await cleanupTempDir(tempDir);
  });

  describe("constructor", () => {
    it("should create anchor with default config", () => {
      const anchor = new ContextAnchor();
      expect(anchor).toBeInstanceOf(ContextAnchor);
      expect(anchor.isInitialized).toBe(false);
    });

    it("should create anchor with custom storage path", () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      expect(anchor).toBeInstanceOf(ContextAnchor);
    });

    it("should not be initialized until initialize() called", () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      expect(anchor.isInitialized).toBe(false);
    });
  });

  describe("initialize", () => {
    it("should initialize the anchor store", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      await anchor.initialize();
      expect(anchor.isInitialized).toBe(true);
    });

    it("should create storage directory", async () => {
      const storagePath = path.join(tempDir, "anchors");
      const anchor = new ContextAnchor({ storagePath });
      await anchor.initialize();

      const stat = await fs.stat(storagePath);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should be idempotent (multiple calls)", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      await anchor.initialize();
      await anchor.initialize();
      expect(anchor.isInitialized).toBe(true);
    });
  });

  describe("create", () => {
    it("should create an anchor with auto-generated ID", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Test Decision",
        content: "Test content",
        priority: "medium",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(created.id).toBeDefined();
      expect(created.id).toMatch(/^decision_/);
      expect(created.title).toBe("Test Decision");
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it("should create anchor with custom ID", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        id: "custom_id_123",
        type: "blocker",
        title: "Test Blocker",
        content: "Content",
        priority: "high",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(created.id).toBe("custom_id_123");
    });

    it("should increment count after creation", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      expect(anchor.count).toBe(0);

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "First",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(anchor.count).toBe(1);

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Second",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(anchor.count).toBe(2);
    });
  });

  describe("get", () => {
    it("should retrieve an existing anchor", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Test",
        content: "Content",
        priority: "medium",
        state: "active",
        tags: ["test"],
        metadata: { key: "value" },
      });

      const retrieved = await anchor.get<AnchorPoint>(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe("Test");
      expect(retrieved?.metadata).toEqual({ key: "value" });
    });

    it("should return null for non-existent anchor", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      await anchor.initialize();

      const retrieved = await anchor.get("nonexistent_id");
      expect(retrieved).toBeNull();
    });
  });

  describe("update", () => {
    it("should update anchor properties", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Original",
        content: "Content",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await anchor.update<AnchorPoint>(created.id, {
        title: "Updated",
        priority: "high",
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("Updated");
      expect(updated?.priority).toBe("high");
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime()
      );
    });

    it("should return null for non-existent anchor", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      await anchor.initialize();

      const updated = await anchor.update("nonexistent", { title: "New" });
      expect(updated).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an existing anchor", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "To Delete",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(anchor.count).toBe(1);

      const deleted = await anchor.delete(created.id);
      expect(deleted).toBe(true);
      expect(anchor.count).toBe(0);

      const retrieved = await anchor.get(created.id);
      expect(retrieved).toBeNull();
    });

    it("should return false for non-existent anchor", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      await anchor.initialize();

      const deleted = await anchor.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("archive", () => {
    it("should archive an anchor (soft delete)", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "To Archive",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      const archived = await anchor.archive(created.id);
      expect(archived).not.toBeNull();
      expect(archived?.state).toBe("archived");
    });
  });

  describe("query", () => {
    it("should query by type", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Decision 1",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      await anchor.create<AnchorPoint>({
        type: "blocker",
        title: "Blocker 1",
        content: "",
        priority: "high",
        state: "active",
        tags: [],
        metadata: {},
      });

      const decisions = await anchor.query({ types: ["decision"] });
      expect(decisions.length).toBe(1);
      expect(decisions[0]!.type).toBe("decision");
    });

    it("should query by state", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      const active = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Active",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      await anchor.archive(active.id);

      const activeAnchors = await anchor.query({ states: ["active"] });
      const archivedAnchors = await anchor.query({ states: ["archived"] });

      expect(activeAnchors.length).toBe(0);
      expect(archivedAnchors.length).toBe(1);
    });

    it("should query with limit", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      for (let i = 0; i < 5; i++) {
        await anchor.create<AnchorPoint>({
          type: "decision",
          title: `Decision ${i}`,
          content: "",
          priority: "low",
          state: "active",
          tags: [],
          metadata: {},
        });
      }

      const limited = await anchor.query({ limit: 3 });
      expect(limited.length).toBe(3);
    });

    it("should query by tags", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Tagged",
        content: "",
        priority: "low",
        state: "active",
        tags: ["important", "review"],
        metadata: {},
      });

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Not Tagged",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      const tagged = await anchor.query({ tags: ["important"] });
      expect(tagged.length).toBe(1);
      expect(tagged[0]!.title).toBe("Tagged");
    });
  });

  describe("persistence", () => {
    it("should save and load anchors", async () => {
      const storagePath = path.join(tempDir, "persist-test");

      // Create and save
      const anchor1 = new ContextAnchor({ storagePath });
      await anchor1.create<AnchorPoint>({
        type: "decision",
        title: "Persistent",
        content: "Should survive reload",
        priority: "high",
        state: "active",
        tags: ["persist"],
        metadata: { important: true },
      });
      await anchor1.forceSave();
      await anchor1.shutdown();

      // Reload in new instance
      const anchor2 = new ContextAnchor({ storagePath });
      await anchor2.initialize();

      expect(anchor2.count).toBe(1);
      const anchors = await anchor2.query({ types: ["decision"] });
      expect(anchors[0]!.title).toBe("Persistent");
      expect(anchors[0]!.content).toBe("Should survive reload");
    });
  });

  describe("events", () => {
    it("should emit anchor_created event", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      let eventFired = false;

      anchor.on("anchor_created", () => {
        eventFired = true;
      });

      await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Event Test",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      expect(eventFired).toBe(true);
    });

    it("should emit anchor_updated event", async () => {
      const anchor = new ContextAnchor({ storagePath: tempDir });
      let eventFired = false;

      anchor.on("anchor_updated", () => {
        eventFired = true;
      });

      const created = await anchor.create<AnchorPoint>({
        type: "decision",
        title: "Original",
        content: "",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });

      await anchor.update(created.id, { title: "Updated" });

      expect(eventFired).toBe(true);
    });
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe("getContextAnchor", () => {
  beforeEach(async () => {
    await resetContextAnchor();
  });

  afterEach(async () => {
    await resetContextAnchor();
  });

  it("should return same instance", () => {
    const anchor1 = getContextAnchor();
    const anchor2 = getContextAnchor();
    expect(anchor1).toBe(anchor2);
  });

  it("should create new instance after reset", async () => {
    const anchor1 = getContextAnchor();
    await resetContextAnchor();
    const anchor2 = getContextAnchor();
    expect(anchor1).not.toBe(anchor2);
  });
});
