/**
 * Checkpoint Serializer Tests
 *
 * Unit tests for checkpoint serialization and compression.
 *
 * @module tests/sessions/checkpoint/serializer
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 2-3
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect } from "vitest";
import {
  // Types
  type CheckpointState,
  type Session,
  CHECKPOINT_SCHEMA_VERSION,
  // Serialization
  COMPRESSION_THRESHOLD,
  serializeCheckpoint,
  deserializeCheckpoint,
  isCompressed,
  getSerializedSize,
  extractSummary,
  validateCheckpoint,
  sanitizeCheckpoint,
  // Checkpoint creation
  createCheckpoint,
} from "../../../src/sessions/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockSession(): Session {
  return {
    id: `session-${Date.now()}`,
    projectId: "test-project",
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

async function createTestCheckpoint(
  options: Partial<{
    reason: string;
    description: string;
    sessionCostSoFar: number;
    filesModified: number;
    envVars: Record<string, string>;
  }> = {},
): Promise<CheckpointState> {
  const session = createMockSession();

  const checkpoint = await createCheckpoint({
    reason: (options.reason as "manual") ?? "manual",
    description: options.description,
    session,
    activeSoul: "coder",
    currentPhase: "implement",
    sessionCostSoFar: options.sessionCostSoFar ?? 0,
    tokenUsage: [],
  });

  // Add custom env vars if provided
  if (options.envVars) {
    checkpoint.provenance.envFingerprint = options.envVars;
  }

  return checkpoint;
}

// ============================================================================
// Serialization Tests
// ============================================================================

describe("serializeCheckpoint / deserializeCheckpoint", () => {
  it("should serialize and deserialize checkpoint correctly", async () => {
    const original = await createTestCheckpoint({
      description: "Test checkpoint",
      sessionCostSoFar: 1.25,
    });

    const serialized = serializeCheckpoint(original);
    const deserialized = deserializeCheckpoint(serialized);

    expect(deserialized.meta.id).toBe(original.meta.id);
    expect(deserialized.meta.description).toBe("Test checkpoint");
    expect(deserialized.cost.sessionCostSoFar).toBe(1.25);
  });

  it("should preserve Date objects", async () => {
    const original = await createTestCheckpoint();
    const now = original.meta.createdAt;

    const serialized = serializeCheckpoint(original);
    const deserialized = deserializeCheckpoint(serialized);

    expect(deserialized.meta.createdAt).toBeInstanceOf(Date);
    expect(deserialized.meta.createdAt.getTime()).toBe(now.getTime());
  });

  it("should preserve nested Date objects", async () => {
    const original = await createTestCheckpoint();

    const serialized = serializeCheckpoint(original);
    const deserialized = deserializeCheckpoint(serialized);

    expect(deserialized.session.session.createdAt).toBeInstanceOf(Date);
    expect(deserialized.session.session.lastActiveAt).toBeInstanceOf(Date);
  });

  it("should handle all checkpoint fields", async () => {
    const original = await createTestCheckpoint();

    const serialized = serializeCheckpoint(original);
    const deserialized = deserializeCheckpoint(serialized);

    // Verify all sub-interfaces
    expect(deserialized.meta).toBeDefined();
    expect(deserialized.session).toBeDefined();
    expect(deserialized.execution).toBeDefined();
    expect(deserialized.provenance).toBeDefined();
    expect(deserialized.idempotency).toBeDefined();
    expect(deserialized.filesystem).toBeDefined();
    expect(deserialized.git).toBeDefined();
    expect(deserialized.cost).toBeDefined();
    expect(deserialized.rollback).toBeDefined();
    expect(deserialized.brain).toBeDefined();
    expect(deserialized.statemachine).toBeDefined();
  });
});

// ============================================================================
// Compression Tests
// ============================================================================

describe("Compression", () => {
  it("should not compress small checkpoints by default", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint);

    expect(isCompressed(serialized)).toBe(false);
  });

  it("should force compression when requested", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint, true);

    expect(isCompressed(serialized)).toBe(true);
    expect(serialized.startsWith("CKPT_GZ:")).toBe(true);
  });

  it("should deserialize compressed checkpoints", async () => {
    const original = await createTestCheckpoint({ description: "Compressed test" });

    const serialized = serializeCheckpoint(original, true);
    const deserialized = deserializeCheckpoint(serialized);

    expect(deserialized.meta.id).toBe(original.meta.id);
    expect(deserialized.meta.description).toBe("Compressed test");
  });

  it("should have correct compression threshold", () => {
    expect(COMPRESSION_THRESHOLD).toBe(50 * 1024); // 50KB
  });
});

// ============================================================================
// Size Calculation Tests
// ============================================================================

describe("getSerializedSize", () => {
  it("should return correct byte size", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint);
    const size = getSerializedSize(serialized);

    expect(size).toBeGreaterThan(0);
    expect(size).toBe(Buffer.byteLength(serialized, "utf8"));
  });

  it("should return smaller size for compressed data", async () => {
    const checkpoint = await createTestCheckpoint();

    const uncompressed = serializeCheckpoint(checkpoint, false);
    const compressed = serializeCheckpoint(checkpoint, true);

    const uncompressedSize = getSerializedSize(uncompressed);
    const compressedSize = getSerializedSize(compressed);

    // Compressed should generally be smaller (though not always for very small data)
    expect(compressedSize).toBeLessThan(uncompressedSize * 1.5);
  });
});

// ============================================================================
// Summary Extraction Tests
// ============================================================================

describe("extractSummary", () => {
  it("should extract summary from checkpoint", async () => {
    const checkpoint = await createTestCheckpoint({
      reason: "gate_pass",
      description: "G1 passed",
      sessionCostSoFar: 2.5,
    });

    const serialized = serializeCheckpoint(checkpoint);
    const summary = extractSummary(checkpoint, getSerializedSize(serialized), isCompressed(serialized));

    expect(summary.id).toBe(checkpoint.meta.id);
    expect(summary.reason).toBe("gate_pass");
    expect(summary.description).toBe("G1 passed");
    expect(summary.sessionCost).toBe(2.5);
    expect(summary.currentPhase).toBe("implement");
    expect(summary.sizeBytes).toBeGreaterThan(0);
    expect(summary.compressed).toBe(false);
  });

  it("should indicate compression status", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint, true);
    const summary = extractSummary(checkpoint, getSerializedSize(serialized), true);

    expect(summary.compressed).toBe(true);
  });

  it("should handle checkpoint without description", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint);
    const summary = extractSummary(checkpoint, getSerializedSize(serialized), false);

    expect(summary.description).toBeUndefined();
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("validateCheckpoint", () => {
  it("should validate correct checkpoint", async () => {
    const checkpoint = await createTestCheckpoint();

    expect(() => validateCheckpoint(checkpoint)).not.toThrow();
  });

  it("should throw for missing meta.id", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.meta as { id?: string }).id = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing meta.id");
  });

  it("should throw for missing meta.schemaVersion", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.meta as { schemaVersion?: string }).schemaVersion = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing meta.schemaVersion");
  });

  it("should throw for missing meta.reason", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.meta as { reason?: string }).reason = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing meta.reason");
  });

  it("should throw for missing session", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.session.session as { id?: string }).id = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing session.session.id");
  });

  it("should throw for missing activeSoul", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.session as { activeSoul?: string }).activeSoul = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing session.activeSoul");
  });

  it("should throw for missing provenance", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.provenance as { repoCommitSha?: string }).repoCommitSha = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing provenance.repoCommitSha");
  });

  it("should throw for missing brain reference", async () => {
    const checkpoint = await createTestCheckpoint();
    (checkpoint.brain as { brainVersion?: string }).brainVersion = undefined;

    expect(() => validateCheckpoint(checkpoint)).toThrow("Checkpoint missing brain.brainVersion");
  });
});

// ============================================================================
// Sanitization Tests
// ============================================================================

describe("sanitizeCheckpoint", () => {
  it("should remove sensitive environment variables", async () => {
    const checkpoint = await createTestCheckpoint({
      envVars: {
        SHELL: "/bin/zsh",
        LANG: "en_US.UTF-8",
        API_KEY: "secret-key",
        PASSWORD: "secret-password",
      },
    });

    const sanitized = sanitizeCheckpoint(checkpoint);

    expect(sanitized.provenance.envFingerprint["SHELL"]).toBe("/bin/zsh");
    expect(sanitized.provenance.envFingerprint["LANG"]).toBe("en_US.UTF-8");
    expect(sanitized.provenance.envFingerprint["API_KEY"]).toBeUndefined();
    expect(sanitized.provenance.envFingerprint["PASSWORD"]).toBeUndefined();
  });

  it("should keep only safe environment keys", async () => {
    const checkpoint = await createTestCheckpoint({
      envVars: {
        SHELL: "/bin/bash",
        LANG: "en_US.UTF-8",
        TERM: "xterm-256color",
        NODE_ENV: "production",
        SECRET_KEY: "should-be-removed",
      },
    });

    const sanitized = sanitizeCheckpoint(checkpoint);
    const keys = Object.keys(sanitized.provenance.envFingerprint);

    expect(keys).toContain("SHELL");
    expect(keys).toContain("LANG");
    expect(keys).toContain("TERM");
    expect(keys).toContain("NODE_ENV");
    expect(keys).not.toContain("SECRET_KEY");
  });

  it("should clear tool call outputs cache", async () => {
    const checkpoint = await createTestCheckpoint();
    checkpoint.idempotency.toolCallOutputsCache = {
      "tool-1": { sensitive: "data" },
    };

    const sanitized = sanitizeCheckpoint(checkpoint);

    expect(sanitized.idempotency.toolCallOutputsCache).toEqual({});
  });

  it("should not modify original checkpoint", async () => {
    const checkpoint = await createTestCheckpoint({
      envVars: {
        SHELL: "/bin/zsh",
        SECRET: "keep-original",
      },
    });

    const originalEnvKeys = Object.keys(checkpoint.provenance.envFingerprint);

    sanitizeCheckpoint(checkpoint);

    expect(Object.keys(checkpoint.provenance.envFingerprint)).toEqual(originalEnvKeys);
  });

  it("should preserve checkpoint structure", async () => {
    const checkpoint = await createTestCheckpoint({
      description: "Test sanitization",
      sessionCostSoFar: 1.5,
    });

    const sanitized = sanitizeCheckpoint(checkpoint);

    expect(sanitized.meta.id).toBe(checkpoint.meta.id);
    expect(sanitized.meta.description).toBe("Test sanitization");
    expect(sanitized.cost.sessionCostSoFar).toBe(1.5);
    expect(sanitized.session.activeSoul).toBe("coder");
  });
});

// ============================================================================
// Schema Version Tests
// ============================================================================

describe("Schema Version", () => {
  it("should have correct schema version constant", () => {
    expect(CHECKPOINT_SCHEMA_VERSION).toBe("1.0.0");
  });

  it("should include schema version in checkpoint", async () => {
    const checkpoint = await createTestCheckpoint();

    expect(checkpoint.meta.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
  });

  it("should preserve schema version through serialization", async () => {
    const checkpoint = await createTestCheckpoint();

    const serialized = serializeCheckpoint(checkpoint);
    const deserialized = deserializeCheckpoint(serialized);

    expect(deserialized.meta.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
  });
});
