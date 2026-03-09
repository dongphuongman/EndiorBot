/**
 * ContextTransferStore Tests — Sprint 96
 *
 * Tests file-based persistence, CRUD, cleanup, and stats.
 *
 * @module tests/context/transfer/context-transfer-store
 * @sprint 96
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextTransferStore,
  getContextTransferStore,
  resetContextTransferStore,
} from "../../../src/context/transfer/context-transfer-store.js";
import type { TransferableContext } from "../../../src/context/transfer/types.js";

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;

function makeContext(overrides: Partial<TransferableContext> = {}): TransferableContext {
  const base: TransferableContext = {
    id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: "test-project",
    sourceSessionId: "session-1",
    type: "decision",
    content: "Use REST API for payment integration",
    tokenCount: 12,
    quality: {
      relevance: 0.8,
      recency: 0.9,
      confidence: 0.7,
      completeness: 1.0,
      composite: 0.85,
    },
    tags: ["payment", "api"],
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  return { ...base, ...overrides };
}

// ============================================================================
// Tests
// ============================================================================

describe("ContextTransferStore", () => {
  let store: ContextTransferStore;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `endiorbot-store-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    store = new ContextTransferStore({ basePath: tempDir });
    resetContextTransferStore();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  describe("CRUD operations", () => {
    it("should save and load a context entry", async () => {
      const ctx = makeContext({ id: "crud-1" });
      await store.save(ctx);

      const loaded = await store.load("test-project", "crud-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("crud-1");
      expect(loaded!.content).toBe(ctx.content);
      expect(loaded!.quality.composite).toBe(ctx.quality.composite);
    });

    it("should return null for non-existent entry", async () => {
      const loaded = await store.load("test-project", "nonexistent");
      expect(loaded).toBeNull();
    });

    it("should delete an entry", async () => {
      const ctx = makeContext({ id: "delete-1" });
      await store.save(ctx);

      const deleted = await store.delete("test-project", "delete-1");
      expect(deleted).toBe(true);

      const loaded = await store.load("test-project", "delete-1");
      expect(loaded).toBeNull();
    });

    it("should return false when deleting non-existent entry", async () => {
      const deleted = await store.delete("test-project", "nonexistent");
      expect(deleted).toBe(false);
    });

    it("should save batch of entries", async () => {
      const contexts = [
        makeContext({ id: "batch-1" }),
        makeContext({ id: "batch-2" }),
        makeContext({ id: "batch-3" }),
      ];

      await store.saveBatch(contexts);

      const list = await store.listByProject("test-project");
      expect(list).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Listing
  // --------------------------------------------------------------------------

  describe("listByProject", () => {
    it("should list all entries for a project", async () => {
      await store.save(makeContext({ id: "list-1", type: "decision" }));
      await store.save(makeContext({ id: "list-2", type: "task_output" }));

      const all = await store.listByProject("test-project");
      expect(all).toHaveLength(2);
    });

    it("should return empty array for non-existent project", async () => {
      const all = await store.listByProject("nonexistent-project");
      expect(all).toHaveLength(0);
    });

    it("should filter by type", async () => {
      await store.save(makeContext({ id: "type-1", type: "decision" }));
      await store.save(makeContext({ id: "type-2", type: "task_output" }));

      const decisions = await store.listByProject("test-project", { type: "decision" });
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.type).toBe("decision");
    });

    it("should filter out expired entries when excludeExpired is true", async () => {
      const expired = makeContext({
        id: "expired-1",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      const valid = makeContext({ id: "valid-1" });

      await store.save(expired);
      await store.save(valid);

      const filtered = await store.listByProject("test-project", { excludeExpired: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("valid-1");
    });
  });

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  describe("cleanup", () => {
    it("should cleanup expired entries", async () => {
      await store.save(makeContext({
        id: "exp-1",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }));
      await store.save(makeContext({ id: "valid-1" }));

      const count = await store.cleanupExpired("test-project");
      expect(count).toBe(1);

      const remaining = await store.listByProject("test-project");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe("valid-1");
    });

    it("should cleanup by age", async () => {
      await store.save(makeContext({
        id: "old-1",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago
      }));
      await store.save(makeContext({
        id: "new-1",
        createdAt: new Date().toISOString(),
      }));

      // Cleanup entries older than 24h
      const count = await store.cleanupByAge("test-project", 24 * 60 * 60 * 1000);
      expect(count).toBe(1);

      const remaining = await store.listByProject("test-project");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe("new-1");
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe("getStats", () => {
    it("should return correct statistics", async () => {
      await store.save(makeContext({ id: "s1", type: "decision", tokenCount: 10 }));
      await store.save(makeContext({ id: "s2", type: "task_output", tokenCount: 20 }));
      await store.save(makeContext({ id: "s3", type: "decision", tokenCount: 15 }));

      const stats = await store.getStats("test-project");
      expect(stats.totalEntries).toBe(3);
      expect(stats.totalTokens).toBe(45);
      expect(stats.byType.decision).toBe(2);
      expect(stats.byType.task_output).toBe(1);
      expect(stats.averageQuality).toBeGreaterThan(0);
    });

    it("should return zero stats for empty project", async () => {
      const stats = await store.getStats("empty-project");
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.averageQuality).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getContextTransferStore should return consistent instance", () => {
      resetContextTransferStore();
      const a = getContextTransferStore();
      const b = getContextTransferStore();
      expect(a).toBe(b);
    });
  });
});
