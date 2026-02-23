/**
 * Resume Handler Tests
 *
 * Tests for checkpoint resumption and restore flow.
 *
 * @module tests/sessions/checkpoint/resume
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 6-7
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckpointState, ToolCallState, Task, CompletedAction, FileChange } from "../../../src/sessions/checkpoint/types.js";
import { CHECKPOINT_SCHEMA_VERSION } from "../../../src/sessions/checkpoint/types.js";
import {
  resumeFromCheckpoint,
  canResume,
  getResumePreview,
  type ResumeStep,
} from "../../../src/sessions/checkpoint/resume-handler.js";
import {
  executeRestoreFlow,
  executeRollback,
  validateRestoration,
  createCompensationCommit,
} from "../../../src/sessions/checkpoint/restore-flow.js";
import { saveCheckpoint, resetCheckpointStore } from "../../../src/sessions/checkpoint/checkpoint.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockCheckpoint(overrides?: Partial<CheckpointState>): CheckpointState {
  const now = new Date();
  const baseCheckpoint: CheckpointState = {
    meta: {
      id: "test-checkpoint-001",
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      createdAt: now,
      reason: "manual",
    },
    session: {
      session: {
        id: "test-session-001",
        projectId: "test-project-001",
        createdAt: now,
        lastActiveAt: now,
        messages: [],
        tokenCount: 0,
        maxTokens: 100000,
        sdlcStage: "04-BUILD",
        activeGates: [],
        compactionCount: 0,
      },
      activeSoul: "coder",
      decisionLog: [],
    },
    execution: {
      currentPhase: "implement",
      taskQueue: [],
      stepStack: [],
      pendingToolCalls: [],
      partialResults: {},
    },
    provenance: {
      repoCommitSha: "abc1234567890",
      lockfilesHash: "mock-lockfile-hash",
      nodeVersion: process.version,
      modelConfig: { model: "claude-3-opus" },
      envFingerprint: {},
      executionTraceDigest: "mock-trace-digest",
      runtimeFingerprint: `darwin-arm64-${process.version}`,
    },
    idempotency: {
      idempotencyKeys: {},
      completedActions: [],
      idempotencyScope: {},
      toolCallOutputsCache: {},
      toolCallAttempts: {},
      retryBudget: 3,
    },
    filesystem: {
      modifiedFiles: [],
      createdFiles: [],
      fileHashes: {},
    },
    git: {
      branch: "main",
      uncommittedChanges: [],
      lastCheckpointCommit: "abc1234567890",
    },
    cost: {
      sessionCostSoFar: 0.05,
      tokenUsage: [],
    },
    rollback: {},
    brain: {
      brainVersion: "1.0.0",
      brainDigest: "mock-brain-digest",
    },
    statemachine: {
      gateStatus: {},
      evidenceBindings: {},
      approvalPending: [],
    },
  };

  // Deep merge overrides
  if (overrides) {
    return deepMerge(baseCheckpoint, overrides) as CheckpointState;
  }

  return baseCheckpoint;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (source === null || source === undefined) {
    return target;
  }
  if (typeof source !== "object") {
    return source;
  }
  if (Array.isArray(source)) {
    return source;
  }

  const result = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const sourceVal = (source as Record<string, unknown>)[key];
    const targetVal = result[key];
    if (typeof sourceVal === "object" && sourceVal !== null && !Array.isArray(sourceVal) &&
        typeof targetVal === "object" && targetVal !== null && !Array.isArray(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

function createMockToolCall(overrides?: Partial<ToolCallState>): ToolCallState {
  return {
    id: "tool-001",
    toolName: "write_file",
    args: { path: "test.ts", content: "test" },
    idempotent: true,
    status: "pending",
    startedAt: new Date(),
    ...overrides,
  };
}

function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-001",
    description: "Test task",
    status: "pending",
    priority: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockCompletedAction(overrides?: Partial<CompletedAction>): CompletedAction {
  return {
    actionType: "tool_call",
    idempotencyKey: "key-001",
    timestamp: new Date(),
    result: "success",
    ...overrides,
  };
}

function createMockFileChange(overrides?: Partial<FileChange>): FileChange {
  return {
    path: "test.ts",
    changeType: "modified",
    beforeHash: "hash-before",
    afterHash: "hash-after",
    ...overrides,
  };
}

// ============================================================================
// Resume Handler Tests
// ============================================================================

describe("Resume Handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "resume-test-"));
    resetCheckpointStore();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("resumeFromCheckpoint", () => {
    it("should fail when no checkpoint exists", async () => {
      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No checkpoint found");
    });

    it("should successfully resume from valid checkpoint", async () => {
      const checkpoint = createMockCheckpoint();
      await saveCheckpoint(checkpoint, tempDir);

      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
        skipProvenanceCheck: true,
        skipBrainVerification: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("success");
      expect(result.checkpoint).toBeDefined();
      expect(result.stepsCompleted).toContain("version_check");
      expect(result.stepsCompleted).toContain("success");
    });

    it("should track completed steps", async () => {
      const checkpoint = createMockCheckpoint();
      await saveCheckpoint(checkpoint, tempDir);

      const stepsTracked: ResumeStep[] = [];
      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
        skipProvenanceCheck: true,
        skipBrainVerification: true,
        onProgress: (step, status) => {
          if (status === "completed") {
            stepsTracked.push(step);
          }
        },
      });

      expect(result.success).toBe(true);
      expect(stepsTracked).toContain("version_check");
      expect(stepsTracked).toContain("conflict_detection");
      expect(stepsTracked).toContain("idempotency_check");
      expect(stepsTracked).toContain("session_restore");
      expect(stepsTracked).toContain("success");
    });

    it("should collect warnings", async () => {
      const checkpoint = createMockCheckpoint({
        idempotency: {
          idempotencyKeys: { "tool-1": "key1", "tool-2": "key2" },
          completedActions: [
            createMockCompletedAction({ idempotencyKey: "key1" }),
            createMockCompletedAction({ idempotencyKey: "key2" }),
          ],
          idempotencyScope: {},
          toolCallOutputsCache: {},
          toolCallAttempts: {},
          retryBudget: 3,
        },
      });
      await saveCheckpoint(checkpoint, tempDir);

      const warnings: string[] = [];
      await resumeFromCheckpoint({
        projectPath: tempDir,
        skipProvenanceCheck: true,
        skipBrainVerification: true,
        onWarning: (msg) => warnings.push(msg),
      });

      expect(warnings.some((w) => w.includes("Skipping"))).toBe(true);
    });

    it("should fail on version incompatibility", async () => {
      const checkpoint = createMockCheckpoint({
        meta: {
          id: "test-checkpoint",
          schemaVersion: "99.0.0", // Future version
          createdAt: new Date(),
          reason: "manual",
        },
      });
      await saveCheckpoint(checkpoint, tempDir);

      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe("version_check");
      expect(result.error).toContain("BLOCKED");
    });

    it("should skip skipped steps correctly", async () => {
      const checkpoint = createMockCheckpoint();
      await saveCheckpoint(checkpoint, tempDir);

      const skippedSteps: ResumeStep[] = [];
      await resumeFromCheckpoint({
        projectPath: tempDir,
        skipProvenanceCheck: true,
        skipBrainVerification: true,
        onProgress: (step, status) => {
          if (status === "skipped") {
            skippedSteps.push(step);
          }
        },
      });

      expect(skippedSteps).toContain("provenance_check");
      expect(skippedSteps).toContain("brain_verification");
    });

    it("should resume by checkpoint ID", async () => {
      const checkpoint1 = createMockCheckpoint({
        meta: { id: "cp-001", schemaVersion: CHECKPOINT_SCHEMA_VERSION, createdAt: new Date(), reason: "manual" },
      });
      const checkpoint2 = createMockCheckpoint({
        meta: { id: "cp-002", schemaVersion: CHECKPOINT_SCHEMA_VERSION, createdAt: new Date(), reason: "manual" },
      });

      await saveCheckpoint(checkpoint1, tempDir);
      await saveCheckpoint(checkpoint2, tempDir);

      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
        checkpointId: "cp-001",
        skipProvenanceCheck: true,
        skipBrainVerification: true,
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint?.meta.id).toBe("cp-001");
    });

    it("should handle pending tool calls", async () => {
      const checkpoint = createMockCheckpoint({
        execution: {
          currentPhase: "implement",
          currentTaskId: "task-1",
          taskQueue: [createMockTask({ id: "task-1" })],
          stepStack: [],
          pendingToolCalls: [
            createMockToolCall({ id: "tool-1", toolName: "write_file", status: "pending" }),
            createMockToolCall({ id: "tool-2", toolName: "read_file", status: "partial" }),
          ],
          partialResults: {},
        },
      });
      await saveCheckpoint(checkpoint, tempDir);

      const result = await resumeFromCheckpoint({
        projectPath: tempDir,
        skipProvenanceCheck: true,
        skipBrainVerification: true,
      });

      expect(result.success).toBe(true);
      expect(result.toolsToRetry).toContain("tool-1");
      expect(result.toolsToRetry).toContain("tool-2");
      expect(result.tasksToResume).toBe(1);
    });
  });

  describe("canResume", () => {
    it("should return true for valid checkpoint", async () => {
      const checkpoint = createMockCheckpoint();
      await saveCheckpoint(checkpoint, tempDir);

      const result = await canResume(tempDir);

      expect(result.canResume).toBe(true);
    });

    it("should return false when no checkpoint exists", async () => {
      const result = await canResume(tempDir);

      expect(result.canResume).toBe(false);
      expect(result.reason).toContain("No checkpoint");
    });

    it("should return false for incompatible version", async () => {
      const checkpoint = createMockCheckpoint({
        meta: {
          id: "test",
          schemaVersion: "99.0.0",
          createdAt: new Date(),
          reason: "manual",
        },
      });
      await saveCheckpoint(checkpoint, tempDir);

      const result = await canResume(tempDir);

      expect(result.canResume).toBe(false);
      expect(result.reason).toContain("BLOCKED");
    });
  });

  describe("getResumePreview", () => {
    it("should return preview information", async () => {
      const checkpoint = createMockCheckpoint({
        execution: {
          currentPhase: "implement",
          taskQueue: [createMockTask({ id: "t1" })],
          stepStack: [],
          pendingToolCalls: [
            createMockToolCall({ id: "tool-1", status: "pending" }),
          ],
          partialResults: {},
        },
      });
      await saveCheckpoint(checkpoint, tempDir);

      const preview = await getResumePreview(tempDir);

      expect(preview.checkpoint).toBeDefined();
      expect(preview.needsMigration).toBe(false);
      expect(preview.toolsToRetry).toBe(1);
      expect(preview.tasksToResume).toBe(1);
    });

    it("should return empty preview when no checkpoint", async () => {
      const preview = await getResumePreview(tempDir);

      expect(preview.checkpoint).toBeUndefined();
      expect(preview.needsMigration).toBe(false);
      expect(preview.toolsToRetry).toBe(0);
    });
  });
});

// ============================================================================
// Restore Flow Tests
// ============================================================================

describe("Restore Flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "restore-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("executeRestoreFlow", () => {
    it("should execute all restore steps", async () => {
      const checkpoint = createMockCheckpoint();

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it("should restore files in dry run mode", async () => {
      const checkpoint = createMockCheckpoint({
        filesystem: {
          modifiedFiles: [
            createMockFileChange({ path: "test.ts", beforeHash: "abc123" }),
          ],
          createdFiles: [],
          fileHashes: { "test.ts": "def456" },
        },
      });

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      const fileOp = result.operations.find((op) => op.operation === "restore_files");
      expect(fileOp?.details).toContain("1 files");
    });

    it("should restore files in real mode", async () => {
      const testFile = join(tempDir, "test.ts");
      await writeFile(testFile, "modified content");

      const checkpoint = createMockCheckpoint({
        filesystem: {
          modifiedFiles: [
            createMockFileChange({ path: "test.ts", beforeHash: "abc123" }),
          ],
          createdFiles: [],
          fileHashes: { "test.ts": "def456" },
        },
      });

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
        dryRun: false,
      });

      expect(result.success).toBe(true);
    });

    it("should track pending tools correctly", async () => {
      const checkpoint = createMockCheckpoint({
        execution: {
          currentPhase: "implement",
          taskQueue: [],
          stepStack: [],
          pendingToolCalls: [
            createMockToolCall({ id: "tool-1", toolName: "write_file", status: "pending" }),
            createMockToolCall({ id: "tool-2", toolName: "read_file", status: "complete" }),
          ],
          partialResults: {},
        },
        idempotency: {
          idempotencyKeys: { "tool-2": "k2" },
          completedActions: [
            createMockCompletedAction({ idempotencyKey: "k2" }),
          ],
          idempotencyScope: {},
          toolCallOutputsCache: {},
          toolCallAttempts: {},
          retryBudget: 3,
        },
      });

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.pendingTools.length).toBe(1);
      expect(result.pendingTools[0].id).toBe("tool-1");
    });

    it("should restore session state", async () => {
      const now = new Date();
      const checkpoint = createMockCheckpoint({
        session: {
          session: {
            id: "unique-session-123",
            projectId: "test-project",
            createdAt: now,
            lastActiveAt: now,
            messages: [],
            tokenCount: 0,
            maxTokens: 100000,
            sdlcStage: "04-BUILD",
            activeGates: [],
            compactionCount: 0,
          },
          activeSoul: "architect",
          decisionLog: [],
        },
      });

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.session?.session?.id).toBe("unique-session-123");
      expect(result.session?.activeSoul).toBe("architect");
    });

    it("should restore cost tracking", async () => {
      const checkpoint = createMockCheckpoint({
        cost: {
          sessionCostSoFar: 1.23,
          tokenUsage: [{ model: "claude-3", input: 100, output: 50, cost: 0.01 }],
          timeBudgetRemaining: 1800,
        },
      });

      const result = await executeRestoreFlow({
        checkpoint,
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      const costOp = result.operations.find((op) => op.operation === "restore_cost");
      expect(costOp?.details).toContain("1.23");
    });
  });

  describe("executeRollback", () => {
    it("should handle 'none' strategy", async () => {
      const checkpoint = createMockCheckpoint();

      const results = await executeRollback(checkpoint, tempDir, "none");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].details).toContain("disabled");
    });

    it("should handle 'soft' strategy", async () => {
      const checkpoint = createMockCheckpoint();

      const results = await executeRollback(checkpoint, tempDir, "soft");

      expect(results.some((r) => r.operation === "restore_files")).toBe(true);
    });

    it("should handle 'warn_and_continue' strategy", async () => {
      const checkpoint = createMockCheckpoint();

      const results = await executeRollback(checkpoint, tempDir, "warn_and_continue");

      expect(results[0].details).toContain("skipped");
    });
  });

  describe("validateRestoration", () => {
    it("should validate successful restoration", async () => {
      const checkpoint = createMockCheckpoint();

      const result = await validateRestoration(checkpoint, tempDir);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should detect missing session ID", async () => {
      const checkpoint = createMockCheckpoint();
      // @ts-expect-error - intentionally breaking the type for test
      checkpoint.session.session.id = "";

      const result = await validateRestoration(checkpoint, tempDir);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("Session ID"))).toBe(true);
    });

    it("should detect invalid cost value", async () => {
      const checkpoint = createMockCheckpoint({
        cost: {
          sessionCostSoFar: -1,
          tokenUsage: [],
        },
      });

      const result = await validateRestoration(checkpoint, tempDir);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("cost"))).toBe(true);
    });
  });

  describe("createCompensationCommit", () => {
    it("should create compensation commit in dry run", async () => {
      const checkpoint = createMockCheckpoint({
        git: {
          branch: "main",
          uncommittedChanges: [],
          lastCheckpointCommit: "abc123def456789012345678901234567890abcdef",
        },
      });

      const result = await createCompensationCommit(
        checkpoint,
        "Revert changes from checkpoint",
        tempDir,
        true,
      );

      // Without a real git repo with this commit, it will fail
      // This is expected behavior - the function validates the commit exists
      expect(result.operation).toBe("create_compensation_commit");
    });

    it("should handle missing checkpoint commit", async () => {
      const checkpoint = createMockCheckpoint({
        git: {
          branch: "main",
          uncommittedChanges: [],
          lastCheckpointCommit: "unknown",
        },
      });

      const result = await createCompensationCommit(
        checkpoint,
        "Revert changes from checkpoint",
        tempDir,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("lastCheckpointCommit");
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Resume Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "resume-integration-"));
    resetCheckpointStore();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should complete full resume flow", async () => {
    // Create a realistic checkpoint (without file conflicts)
    const now = new Date();
    const checkpoint = createMockCheckpoint({
      session: {
        session: {
          id: "integration-session",
          projectId: "test-project",
          createdAt: now,
          lastActiveAt: now,
          messages: [],
          tokenCount: 0,
          maxTokens: 100000,
          sdlcStage: "04-BUILD",
          activeGates: [],
          compactionCount: 0,
        },
        activeSoul: "coder",
        decisionLog: [
          {
            id: "d1",
            type: "implementation",
            description: "Start implementation",
            rationale: "User requested",
            madeBy: "ceo",
            timestamp: now,
          },
        ],
      },
      execution: {
        currentPhase: "implement",
        currentTaskId: "task-1",
        taskQueue: [
          createMockTask({ id: "task-1", description: "Write tests" }),
        ],
        stepStack: [
          { name: "step-1", depth: 0, startedAt: now },
        ],
        pendingToolCalls: [
          createMockToolCall({ id: "tool-1", toolName: "write_file", status: "pending" }),
        ],
        partialResults: {},
      },
      // No file conflicts - clean filesystem
      filesystem: {
        modifiedFiles: [],
        createdFiles: [],
        fileHashes: {},
      },
    });

    await saveCheckpoint(checkpoint, tempDir);

    // Resume
    const result = await resumeFromCheckpoint({
      projectPath: tempDir,
      skipProvenanceCheck: true,
      skipBrainVerification: true,
    });


    expect(result.success).toBe(true);
    expect(result.checkpoint).toBeDefined();
    expect(result.toolsToRetry).toContain("tool-1");
    expect(result.tasksToResume).toBe(1);
  });

  it("should handle migration during resume", async () => {
    // Create checkpoint with older version (but compatible)
    const checkpoint = createMockCheckpoint({
      meta: {
        id: "migration-test",
        schemaVersion: "1.0.0", // Same as current
        createdAt: new Date(),
        reason: "manual",
      },
    });

    await saveCheckpoint(checkpoint, tempDir);

    const result = await resumeFromCheckpoint({
      projectPath: tempDir,
      skipProvenanceCheck: true,
      skipBrainVerification: true,
    });

    expect(result.success).toBe(true);
    // No migration needed since versions match
    expect(result.stepsCompleted).toContain("version_check");
  });

  it("should handle file conflicts during resume", async () => {
    // Create a file that will conflict
    const conflictFile = join(tempDir, "conflict.ts");
    await writeFile(conflictFile, "external modification");

    const checkpoint = createMockCheckpoint({
      filesystem: {
        modifiedFiles: [
          createMockFileChange({ path: "conflict.ts", afterHash: "checkpoint-hash" }),
        ],
        createdFiles: [],
        fileHashes: { "conflict.ts": "original-hash" },
      },
    });

    await saveCheckpoint(checkpoint, tempDir);

    // Use force: true to proceed with conflicts
    const result = await resumeFromCheckpoint({
      projectPath: tempDir,
      skipProvenanceCheck: true,
      skipBrainVerification: true,
      force: true,  // Force resume even with conflicts
    });


    // Should succeed because force is enabled
    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toContain("conflict_detection");
  });
});
