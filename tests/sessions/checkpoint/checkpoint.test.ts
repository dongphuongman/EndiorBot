/**
 * Checkpoint Tests
 *
 * Unit tests for checkpoint creation, save, and load functionality.
 *
 * @module tests/sessions/checkpoint
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 2-3
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  // Types
  type CheckpointState,
  type CheckpointSummary,
  type Session,
  CHECKPOINT_SCHEMA_VERSION,
  // Functions
  generateCheckpointId,
  createCheckpoint,
  hashFile,
  hashFiles,
  FileCheckpointStore,
  saveCheckpoint,
  loadCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  cleanupCheckpoints,
  resetCheckpointStore,
} from "../../../src/sessions/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDir(): string {
  const testDir = path.join(os.tmpdir(), `endiorbot-ckpt-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDir(testDir: string): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function createMockSession(projectId: string = "test-project"): Session {
  return {
    id: `session-${Date.now()}`,
    projectId,
    createdAt: new Date(),
    lastActiveAt: new Date(),
    messages: [],
    tokenCount: 1000,
    maxTokens: 50000,
    sdlcStage: "04-BUILD",
    activeGates: [],
    compactionCount: 0,
  };
}

// ============================================================================
// ID Generation Tests
// ============================================================================

describe("generateCheckpointId", () => {
  it("should generate unique checkpoint IDs", () => {
    const id1 = generateCheckpointId();
    const id2 = generateCheckpointId();

    expect(id1).toMatch(/^ckpt-\d{8}-\d{6}-[a-z0-9]{4}$/);
    expect(id2).toMatch(/^ckpt-\d{8}-\d{6}-[a-z0-9]{4}$/);
    expect(id1).not.toBe(id2);
  });

  it("should include date and time in ID", () => {
    const id = generateCheckpointId();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    expect(id).toContain(dateStr);
  });
});

// ============================================================================
// File Hashing Tests
// ============================================================================

describe("File Hashing", () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = createTestDir();
    testFile = path.join(testDir, "test.txt");
    fs.writeFileSync(testFile, "Hello, World!");
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("hashFile", () => {
    it("should hash file content", async () => {
      const hash = await hashFile(testFile);

      expect(hash).toHaveLength(64); // SHA256 hex
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should return consistent hash for same content", async () => {
      const hash1 = await hashFile(testFile);
      const hash2 = await hashFile(testFile);

      expect(hash1).toBe(hash2);
    });

    it("should return different hash for different content", async () => {
      const hash1 = await hashFile(testFile);

      fs.writeFileSync(testFile, "Different content");
      const hash2 = await hashFile(testFile);

      expect(hash1).not.toBe(hash2);
    });

    it("should return empty string for non-existent file", async () => {
      const hash = await hashFile("/nonexistent/file.txt");

      expect(hash).toBe("");
    });
  });

  describe("hashFiles", () => {
    it("should hash multiple files", async () => {
      const file2 = path.join(testDir, "test2.txt");
      fs.writeFileSync(file2, "Another file");

      const hashes = await hashFiles([testFile, file2]);

      expect(Object.keys(hashes)).toHaveLength(2);
      expect(hashes[testFile]).toHaveLength(64);
      expect(hashes[file2]).toHaveLength(64);
    });

    it("should skip non-existent files", async () => {
      const hashes = await hashFiles([testFile, "/nonexistent/file.txt"]);

      expect(Object.keys(hashes)).toHaveLength(1);
      expect(hashes[testFile]).toHaveLength(64);
    });
  });
});

// ============================================================================
// Checkpoint Creation Tests
// ============================================================================

describe("createCheckpoint", () => {
  it("should create checkpoint with required fields", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0.5,
      tokenUsage: [{ model: "claude-opus-4", input: 500, output: 200, cost: 0.5 }],
    });

    expect(checkpoint.meta.id).toMatch(/^ckpt-/);
    expect(checkpoint.meta.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    expect(checkpoint.meta.reason).toBe("manual");
    expect(checkpoint.meta.createdAt).toBeInstanceOf(Date);

    expect(checkpoint.session.session.id).toBe(session.id);
    expect(checkpoint.session.activeSoul).toBe("coder");

    expect(checkpoint.execution.currentPhase).toBe("implement");

    expect(checkpoint.cost.sessionCostSoFar).toBe(0.5);
    expect(checkpoint.cost.tokenUsage).toHaveLength(1);
  });

  it("should include optional description", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "gate_pass",
      description: "G1 gate passed",
      session,
      activeSoul: "architect",
      currentPhase: "design",
      sessionCostSoFar: 0.25,
      tokenUsage: [],
    });

    expect(checkpoint.meta.description).toBe("G1 gate passed");
  });

  it("should use custom checkpoint ID if provided", async () => {
    const session = createMockSession();
    const customId = "ckpt-custom-id";

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
      checkpointId: customId,
    });

    expect(checkpoint.meta.id).toBe(customId);
  });

  it("should include provenance fields", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
    });

    expect(checkpoint.provenance.nodeVersion).toBeDefined();
    expect(checkpoint.provenance.runtimeFingerprint).toBeDefined();
    expect(checkpoint.provenance.executionTraceDigest).toHaveLength(64);
  });

  it("should include brain reference", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
    });

    // Brain reference now comes from the Brain module (Sprint 45)
    expect(checkpoint.brain.brainVersion).toBeDefined();
    expect(checkpoint.brain.brainDigest).toBeDefined();
    expect(checkpoint.brain.brainDigest.length).toBeGreaterThanOrEqual(16);
  });

  it("should track created files", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
      createdFiles: ["src/new-file.ts", "tests/new-file.test.ts"],
    });

    expect(checkpoint.filesystem.createdFiles).toEqual([
      "src/new-file.ts",
      "tests/new-file.test.ts",
    ]);
  });
});

// ============================================================================
// FileCheckpointStore Tests
// ============================================================================

describe("FileCheckpointStore", () => {
  let testDir: string;
  let store: FileCheckpointStore;

  beforeEach(() => {
    testDir = createTestDir();
    store = new FileCheckpointStore(testDir);
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("save", () => {
    it("should save checkpoint to disk", async () => {
      const session = createMockSession();
      const checkpoint = await createCheckpoint({
        reason: "manual",
        session,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });

      await store.save(checkpoint);

      const files = fs.readdirSync(testDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^ckpt-.*\.ckpt\.json$/);
    });
  });

  describe("load", () => {
    it("should load checkpoint from disk", async () => {
      const session = createMockSession();
      const checkpoint = await createCheckpoint({
        reason: "manual",
        description: "Test checkpoint",
        session,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 1.25,
        tokenUsage: [{ model: "test", input: 100, output: 50 }],
      });

      await store.save(checkpoint);

      const loaded = await store.load(checkpoint.meta.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.meta.id).toBe(checkpoint.meta.id);
      expect(loaded?.meta.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
      expect(loaded?.meta.description).toBe("Test checkpoint");
      expect(loaded?.cost.sessionCostSoFar).toBe(1.25);
    });

    it("should return null for non-existent checkpoint", async () => {
      const loaded = await store.load("nonexistent-id");

      expect(loaded).toBeNull();
    });

    it("should restore Date objects correctly", async () => {
      const session = createMockSession();
      const checkpoint = await createCheckpoint({
        reason: "manual",
        session,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });

      await store.save(checkpoint);

      const loaded = await store.load(checkpoint.meta.id);

      expect(loaded?.meta.createdAt).toBeInstanceOf(Date);
      expect(loaded?.session.session.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("delete", () => {
    it("should delete checkpoint from disk", async () => {
      const session = createMockSession();
      const checkpoint = await createCheckpoint({
        reason: "manual",
        session,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });

      await store.save(checkpoint);
      await store.delete(checkpoint.meta.id);

      const files = fs.readdirSync(testDir);
      expect(files).toHaveLength(0);
    });

    it("should not throw for non-existent checkpoint", async () => {
      await expect(store.delete("nonexistent-id")).resolves.not.toThrow();
    });
  });

  describe("list", () => {
    it("should list all checkpoints", async () => {
      const session = createMockSession();

      // Create multiple checkpoints
      for (let i = 0; i < 3; i++) {
        const checkpoint = await createCheckpoint({
          reason: "manual",
          session,
          activeSoul: "coder",
          currentPhase: "implement",
          sessionCostSoFar: i * 0.5,
          tokenUsage: [],
        });
        await store.save(checkpoint);
      }

      const summaries = await store.list();

      expect(summaries).toHaveLength(3);
      expect(summaries[0].reason).toBe("manual");
    });

    it("should filter by project ID", async () => {
      const session1 = createMockSession("project-1");
      const session2 = createMockSession("project-2");

      const checkpoint1 = await createCheckpoint({
        reason: "manual",
        session: session1,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });
      await store.save(checkpoint1);

      const checkpoint2 = await createCheckpoint({
        reason: "manual",
        session: session2,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });
      await store.save(checkpoint2);

      const project1Summaries = await store.list("project-1");
      const project2Summaries = await store.list("project-2");

      expect(project1Summaries).toHaveLength(1);
      expect(project2Summaries).toHaveLength(1);
    });

    it("should sort by creation date (newest first)", async () => {
      const session = createMockSession();

      // Create checkpoints with small delays
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const checkpoint = await createCheckpoint({
          reason: "manual",
          session,
          activeSoul: "coder",
          currentPhase: "implement",
          sessionCostSoFar: 0,
          tokenUsage: [],
        });
        ids.push(checkpoint.meta.id);
        await store.save(checkpoint);
      }

      const summaries = await store.list();

      // Most recent should be first
      expect(summaries[0].id).toBe(ids[2]);
    });
  });

  describe("getLatest", () => {
    it("should return most recent checkpoint", async () => {
      const session = createMockSession();

      // Create multiple checkpoints
      for (let i = 0; i < 3; i++) {
        const checkpoint = await createCheckpoint({
          reason: "manual",
          description: `Checkpoint ${i}`,
          session,
          activeSoul: "coder",
          currentPhase: "implement",
          sessionCostSoFar: 0,
          tokenUsage: [],
        });
        await store.save(checkpoint);
      }

      const latest = await store.getLatest();

      expect(latest).not.toBeNull();
      expect(latest?.meta.description).toBe("Checkpoint 2");
    });

    it("should return null when no checkpoints exist", async () => {
      const latest = await store.getLatest();

      expect(latest).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("should delete old checkpoints keeping N most recent", async () => {
      const session = createMockSession();

      // Create 5 checkpoints
      for (let i = 0; i < 5; i++) {
        const checkpoint = await createCheckpoint({
          reason: "manual",
          session,
          activeSoul: "coder",
          currentPhase: "implement",
          sessionCostSoFar: 0,
          tokenUsage: [],
        });
        await store.save(checkpoint);
      }

      const deleted = await store.cleanup(2);

      expect(deleted).toBe(3);

      const remaining = await store.list();
      expect(remaining).toHaveLength(2);
    });

    it("should not delete if less than keepCount", async () => {
      const session = createMockSession();

      const checkpoint = await createCheckpoint({
        reason: "manual",
        session,
        activeSoul: "coder",
        currentPhase: "implement",
        sessionCostSoFar: 0,
        tokenUsage: [],
      });
      await store.save(checkpoint);

      const deleted = await store.cleanup(10);

      expect(deleted).toBe(0);
    });
  });
});

// ============================================================================
// Checkpoint Schema Tests
// ============================================================================

describe("Checkpoint Schema", () => {
  it("should have correct schema version", () => {
    expect(CHECKPOINT_SCHEMA_VERSION).toBe("1.0.0");
  });

  it("should create checkpoint matching ADR-006 structure", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0.5,
      tokenUsage: [],
    });

    // Verify all sub-interfaces exist
    expect(checkpoint.meta).toBeDefined();
    expect(checkpoint.session).toBeDefined();
    expect(checkpoint.execution).toBeDefined();
    expect(checkpoint.provenance).toBeDefined();
    expect(checkpoint.idempotency).toBeDefined();
    expect(checkpoint.filesystem).toBeDefined();
    expect(checkpoint.git).toBeDefined();
    expect(checkpoint.cost).toBeDefined();
    expect(checkpoint.rollback).toBeDefined();
    expect(checkpoint.brain).toBeDefined();
    expect(checkpoint.statemachine).toBeDefined();
  });

  it("should include idempotency state with retry budget", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
    });

    expect(checkpoint.idempotency.retryBudget).toBe(3);
    expect(checkpoint.idempotency.completedActions).toEqual([]);
    expect(checkpoint.idempotency.idempotencyKeys).toEqual({});
  });

  it("should include state machine state", async () => {
    const session = createMockSession();

    const checkpoint = await createCheckpoint({
      reason: "manual",
      session,
      activeSoul: "coder",
      currentPhase: "implement",
      sessionCostSoFar: 0,
      tokenUsage: [],
    });

    expect(checkpoint.statemachine.gateStatus).toEqual({});
    expect(checkpoint.statemachine.evidenceBindings).toEqual({});
    expect(checkpoint.statemachine.approvalPending).toEqual([]);
  });
});
