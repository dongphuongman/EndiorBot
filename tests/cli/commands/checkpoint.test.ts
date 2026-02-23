/**
 * Checkpoint CLI Tests
 *
 * Tests for checkpoint and resume CLI commands.
 *
 * @module tests/cli/commands/checkpoint
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 9
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
  registerCheckpointCommand,
  registerResumeCommand,
} from "../../../src/cli/commands/checkpoint.js";
import {
  saveCheckpoint,
  createCheckpoint,
  type CheckpointState,
} from "../../../src/sessions/checkpoint/index.js";
import type { Session } from "../../../src/sessions/types.js";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Create a test program with checkpoint commands.
 */
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerCheckpointCommand(program);
  registerResumeCommand(program);
  return program;
}

/**
 * Create a temporary directory.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ckpt-cli-test-"));
}

/**
 * Create a test session.
 */
function createTestSession(): Session {
  const now = new Date();
  return {
    id: `test-session-${Date.now()}`,
    projectId: "test-project",
    createdAt: now,
    lastActiveAt: now,
    messages: [],
    tokenCount: 0,
    maxTokens: 50000,
    sdlcStage: "04-BUILD",
    activeGates: [],
    compactionCount: 0,
  };
}

/**
 * Create a test checkpoint in a directory.
 */
async function createTestCheckpointInDir(
  dir: string,
  reason: string = "manual",
): Promise<CheckpointState> {
  const checkpoint = await createCheckpoint({
    reason: reason as "manual",
    session: createTestSession(),
    activeSoul: "coder",
    currentPhase: "implement",
    sessionCostSoFar: 0.5,
    tokenUsage: [],
  });
  await saveCheckpoint(checkpoint, dir);
  return checkpoint;
}

// ============================================================================
// Command Registration Tests
// ============================================================================

describe("Checkpoint Command Registration", () => {
  it("should register checkpoint command", () => {
    const program = createTestProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("checkpoint");
  });

  it("should register resume command", () => {
    const program = createTestProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("resume");
  });

  it("should have checkpoint subcommands", () => {
    const program = createTestProgram();
    const checkpoint = program.commands.find((c) => c.name() === "checkpoint");
    expect(checkpoint).toBeDefined();

    const subcommands = checkpoint!.commands.map((c) => c.name());
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("show");
    expect(subcommands).toContain("cleanup");
  });

  it("should have checkpoint options", () => {
    const program = createTestProgram();
    const checkpoint = program.commands.find((c) => c.name() === "checkpoint");
    expect(checkpoint).toBeDefined();

    const optionNames = checkpoint!.options.map((o) => o.long);
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--reason");
    expect(optionNames).toContain("--description");
    expect(optionNames).toContain("--dry-run");
  });

  it("should have resume options", () => {
    const program = createTestProgram();
    const resume = program.commands.find((c) => c.name() === "resume");
    expect(resume).toBeDefined();

    const optionNames = resume!.options.map((o) => o.long);
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--dry-run");
    expect(optionNames).toContain("--skip-conflicts");
    expect(optionNames).toContain("--force");
  });

  it("should have list subcommand options", () => {
    const program = createTestProgram();
    const checkpoint = program.commands.find((c) => c.name() === "checkpoint");
    const list = checkpoint!.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();

    const optionNames = list!.options.map((o) => o.long);
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--limit");
    expect(optionNames).toContain("--json");
  });

  it("should have cleanup subcommand options", () => {
    const program = createTestProgram();
    const checkpoint = program.commands.find((c) => c.name() === "checkpoint");
    const cleanup = checkpoint!.commands.find((c) => c.name() === "cleanup");
    expect(cleanup).toBeDefined();

    const optionNames = cleanup!.options.map((o) => o.long);
    expect(optionNames).toContain("--verbose");
    expect(optionNames).toContain("--keep");
    expect(optionNames).toContain("--dry-run");
    expect(optionNames).toContain("--force");
  });
});

// ============================================================================
// Help Output Tests
// ============================================================================

describe("Checkpoint Command Help", () => {
  it("should show checkpoint help", () => {
    const program = createTestProgram();
    const checkpoint = program.commands.find((c) => c.name() === "checkpoint");
    expect(checkpoint!.description()).toContain("checkpoint");
  });

  it("should show resume help", () => {
    const program = createTestProgram();
    const resume = program.commands.find((c) => c.name() === "resume");
    expect(resume!.description()).toContain("checkpoint");
  });
});

// ============================================================================
// Checkpoint List Integration Tests
// ============================================================================

describe("Checkpoint List (with temp dir)", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = createTempDir();
    originalEnv = process.env;
    // Override HOME to use temp dir for checkpoints
    process.env = { ...originalEnv, HOME: tempDir };
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should list checkpoints when none exist", async () => {
    // The list command should handle empty directory gracefully
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");
    const { listCheckpoints } = await import("../../../src/sessions/checkpoint/index.js");
    const list = await listCheckpoints(undefined, checkpointDir);
    expect(list).toEqual([]);
  });

  it("should list checkpoints when they exist", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    await createTestCheckpointInDir(checkpointDir);

    const { listCheckpoints } = await import("../../../src/sessions/checkpoint/index.js");
    const list = await listCheckpoints(undefined, checkpointDir);
    expect(list.length).toBe(1);
    expect(list[0].reason).toBe("manual");
  });

  it("should sort checkpoints by date (newest first)", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create two checkpoints
    await createTestCheckpointInDir(checkpointDir, "manual");
    await new Promise((r) => setTimeout(r, 10)); // Ensure different timestamps
    await createTestCheckpointInDir(checkpointDir, "auto");

    const { listCheckpoints } = await import("../../../src/sessions/checkpoint/index.js");
    const list = await listCheckpoints(undefined, checkpointDir);
    expect(list.length).toBe(2);
    expect(list[0].reason).toBe("auto"); // Newest first
    expect(list[1].reason).toBe("manual");
  });
});

// ============================================================================
// Checkpoint Cleanup Integration Tests
// ============================================================================

describe("Checkpoint Cleanup (with temp dir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should cleanup old checkpoints", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create 5 checkpoints
    for (let i = 0; i < 5; i++) {
      await createTestCheckpointInDir(checkpointDir);
      await new Promise((r) => setTimeout(r, 10));
    }

    const { listCheckpoints, cleanupCheckpoints } = await import("../../../src/sessions/checkpoint/index.js");

    // Verify 5 checkpoints exist
    let list = await listCheckpoints(undefined, checkpointDir);
    expect(list.length).toBe(5);

    // Cleanup, keeping only 2
    const removed = await cleanupCheckpoints(2, checkpointDir);
    expect(removed).toBe(3);

    // Verify only 2 remain
    list = await listCheckpoints(undefined, checkpointDir);
    expect(list.length).toBe(2);
  });

  it("should not cleanup if count is below threshold", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create 2 checkpoints
    await createTestCheckpointInDir(checkpointDir);
    await createTestCheckpointInDir(checkpointDir);

    const { listCheckpoints, cleanupCheckpoints } = await import("../../../src/sessions/checkpoint/index.js");

    // Cleanup with keep=5 (more than exist)
    const removed = await cleanupCheckpoints(5, checkpointDir);
    expect(removed).toBe(0);

    // Verify both remain
    const list = await listCheckpoints(undefined, checkpointDir);
    expect(list.length).toBe(2);
  });
});

// ============================================================================
// Resume Preview Tests
// ============================================================================

describe("Resume Preview", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return empty preview when no checkpoint exists", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    const { getResumePreview } = await import("../../../src/sessions/checkpoint/index.js");
    const preview = await getResumePreview(checkpointDir);

    expect(preview.checkpoint).toBeUndefined();
    expect(preview.needsMigration).toBe(false);
    expect(preview.toolsToRetry).toBe(0);
    expect(preview.tasksToResume).toBe(0);
  });

  it("should return preview for existing checkpoint", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    const checkpoint = await createTestCheckpointInDir(checkpointDir);

    const { getResumePreview } = await import("../../../src/sessions/checkpoint/index.js");
    const preview = await getResumePreview(checkpointDir, undefined, checkpoint.meta.id);

    expect(preview.checkpoint).toBeDefined();
    expect(preview.checkpoint!.meta.id).toBe(checkpoint.meta.id);
    expect(preview.needsMigration).toBe(false);
    expect(preview.toolsToRetry).toBe(0);
    expect(preview.tasksToResume).toBe(0);
  });
});

// ============================================================================
// Can Resume Tests
// ============================================================================

describe("Can Resume Check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return false when no checkpoint exists", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    const { canResume } = await import("../../../src/sessions/checkpoint/index.js");
    const result = await canResume(checkpointDir);

    expect(result.canResume).toBe(false);
    expect(result.reason).toContain("No checkpoint found");
  });

  it("should return true when valid checkpoint exists", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    await createTestCheckpointInDir(checkpointDir);

    const { canResume } = await import("../../../src/sessions/checkpoint/index.js");
    const result = await canResume(checkpointDir);

    expect(result.canResume).toBe(true);
  });
});

// ============================================================================
// Progress Callback Tests
// ============================================================================

describe("Resume Progress Callback", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should call progress callback during resume", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    const checkpoint = await createTestCheckpointInDir(checkpointDir);

    const { resumeFromCheckpoint } = await import("../../../src/sessions/checkpoint/index.js");

    const progressSteps: string[] = [];
    const progressStatuses: string[] = [];

    const result = await resumeFromCheckpoint({
      checkpointId: checkpoint.meta.id,
      projectPath: checkpointDir,
      onProgress: (step, status) => {
        progressSteps.push(step);
        progressStatuses.push(status);
      },
    });

    expect(result.success).toBe(true);
    expect(progressSteps.length).toBeGreaterThan(0);
    expect(progressSteps).toContain("version_check");
    expect(progressSteps).toContain("success");
  });
});

// ============================================================================
// Resume Execution Tests
// ============================================================================

describe("Resume Execution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should successfully resume from valid checkpoint", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    const checkpoint = await createTestCheckpointInDir(checkpointDir);

    const { resumeFromCheckpoint } = await import("../../../src/sessions/checkpoint/index.js");

    const result = await resumeFromCheckpoint({
      checkpointId: checkpoint.meta.id,
      projectPath: checkpointDir,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.checkpoint).toBeDefined();
    expect(result.checkpoint!.meta.id).toBe(checkpoint.meta.id);
    expect(result.stepsCompleted).toContain("version_check");
    expect(result.stepsCompleted).toContain("success");
  });

  it("should resume from latest checkpoint when no ID specified", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create two checkpoints
    await createTestCheckpointInDir(checkpointDir, "manual");
    await new Promise((r) => setTimeout(r, 10));
    const latest = await createTestCheckpointInDir(checkpointDir, "auto");

    const { resumeFromCheckpoint } = await import("../../../src/sessions/checkpoint/index.js");

    const result = await resumeFromCheckpoint({
      projectPath: checkpointDir,
    });

    expect(result.success).toBe(true);
    expect(result.checkpoint!.meta.id).toBe(latest.meta.id);
  });

  it("should fail when checkpoint ID not found", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    const { resumeFromCheckpoint } = await import("../../../src/sessions/checkpoint/index.js");

    const result = await resumeFromCheckpoint({
      checkpointId: "nonexistent-id",
      projectPath: checkpointDir,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("corrupted");
    expect(result.error).toContain("not found");
  });
});

// ============================================================================
// Warning Handling Tests
// ============================================================================

describe("Resume Warning Handling", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, ".endiorbot", "checkpoints"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should collect warnings during resume", async () => {
    const checkpointDir = join(tempDir, ".endiorbot", "checkpoints");

    // Create a checkpoint
    const checkpoint = await createTestCheckpointInDir(checkpointDir);

    const { resumeFromCheckpoint } = await import("../../../src/sessions/checkpoint/index.js");

    const warnings: string[] = [];

    const result = await resumeFromCheckpoint({
      checkpointId: checkpoint.meta.id,
      projectPath: checkpointDir,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(result.success).toBe(true);
    // Warnings array may be empty or contain warnings - both are valid
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
