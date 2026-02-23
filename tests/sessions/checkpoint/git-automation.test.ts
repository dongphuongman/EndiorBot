/**
 * Git Automation Tests
 *
 * Tests for git automation functionality including:
 * - Auto-commit on milestones
 * - Compensation commits
 * - Working tree capture/restore
 * - Git state management
 *
 * @module tests/sessions/checkpoint/git-automation
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 8
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isGitRepository,
  getCurrentBranch,
  getCurrentCommit,
  getUncommittedFiles,
  isWorkingTreeClean,
  getGitState,
  getCommitFiles,
  autoCommitOnMilestone,
  createCompensationCommit,
  captureWorkingTree,
  restoreWorkingTree,
  resetToCommit,
  createCheckpointBranch,
  deleteCheckpointBranch,
  createGitCompletedAction,
  commitAndCheckpoint,
  gitRollback,
  type GitOperationResult,
  type AutoCommitOptions,
  type WorktreeState,
} from "../../../src/sessions/checkpoint/git-automation.js";
import type { CheckpointState } from "../../../src/sessions/checkpoint/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a temporary git repository for testing.
 */
async function createTempGitRepo(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "git-test-"));

  // Initialize git repo
  execSync("git init", { cwd: tempDir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: "pipe" });
  execSync('git config user.name "Test User"', { cwd: tempDir, stdio: "pipe" });

  // Create initial commit
  await writeFile(join(tempDir, "README.md"), "# Test Repo\n");
  execSync("git add .", { cwd: tempDir, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: "pipe" });

  return tempDir;
}

/**
 * Clean up temporary directory.
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a mock checkpoint for testing.
 */
function createMockCheckpoint(overrides: Partial<CheckpointState> = {}): CheckpointState {
  const now = new Date();

  return {
    meta: {
      id: "ckpt-test-001",
      schemaVersion: "1.0.0",
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
      repoCommitSha: "abc123",
      lockfilesHash: "def456",
      nodeVersion: "22.11.0",
      modelConfig: { model: "claude-opus-4" },
      envFingerprint: {},
      executionTraceDigest: "trace123",
      runtimeFingerprint: "darwin-arm64-node22.11.0",
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
      lastCheckpointCommit: "abc123",
    },
    cost: {
      sessionCostSoFar: 0.5,
      tokenUsage: [],
    },
    rollback: {},
    brain: {
      brainVersion: "1.0.0",
      brainDigest: "brain123",
    },
    statemachine: {
      gateStatus: {},
      evidenceBindings: {},
      approvalPending: [],
    },
    ...overrides,
  } as CheckpointState;
}

// ============================================================================
// Git Utility Tests
// ============================================================================

describe("Git Utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("isGitRepository", () => {
    it("should return true for git repository", () => {
      expect(isGitRepository(tempDir)).toBe(true);
    });

    it("should return false for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));
      expect(isGitRepository(nonGitDir)).toBe(false);
      await cleanupTempDir(nonGitDir);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", () => {
      const branch = getCurrentBranch(tempDir);
      // Could be "main" or "master" depending on git config
      expect(["main", "master"]).toContain(branch);
    });

    it("should return 'unknown' for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));
      expect(getCurrentBranch(nonGitDir)).toBe("unknown");
      await cleanupTempDir(nonGitDir);
    });
  });

  describe("getCurrentCommit", () => {
    it("should return commit SHA", () => {
      const commit = getCurrentCommit(tempDir);
      expect(commit).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe("getUncommittedFiles", () => {
    it("should return empty array for clean repo", () => {
      const files = getUncommittedFiles(tempDir);
      expect(files).toEqual([]);
    });

    it("should return modified files", async () => {
      await writeFile(join(tempDir, "new-file.txt"), "content");
      const files = getUncommittedFiles(tempDir);
      expect(files).toContain("new-file.txt");
    });
  });

  describe("isWorkingTreeClean", () => {
    it("should return true for clean repo", () => {
      expect(isWorkingTreeClean(tempDir)).toBe(true);
    });

    it("should return false with uncommitted changes", async () => {
      await writeFile(join(tempDir, "new-file.txt"), "content");
      expect(isWorkingTreeClean(tempDir)).toBe(false);
    });
  });

  describe("getGitState", () => {
    it("should return complete git state", () => {
      const state = getGitState(tempDir);

      expect(state.branch).toBeTruthy();
      expect(state.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(state.uncommittedFiles).toEqual([]);
      expect(state.hasUncommittedChanges).toBe(false);
      expect(state.isClean).toBe(true);
    });

    it("should detect uncommitted changes", async () => {
      await writeFile(join(tempDir, "new-file.txt"), "content");
      const state = getGitState(tempDir);

      expect(state.hasUncommittedChanges).toBe(true);
      expect(state.isClean).toBe(false);
      expect(state.uncommittedFiles).toContain("new-file.txt");
    });
  });

  describe("getCommitFiles", () => {
    it("should return files from commit", () => {
      const commit = getCurrentCommit(tempDir);
      const files = getCommitFiles(commit, tempDir);

      expect(files).toContain("README.md");
    });

    it("should return empty for invalid commit", () => {
      const files = getCommitFiles("invalid-sha", tempDir);
      expect(files).toEqual([]);
    });
  });
});

// ============================================================================
// Auto-Commit Tests
// ============================================================================

describe("Auto-Commit on Milestones", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("autoCommitOnMilestone", () => {
    it("should skip empty commit when no changes", async () => {
      const result = await autoCommitOnMilestone({
        milestoneType: "checkpoint",
        projectPath: tempDir,
        skipEmpty: true,
      });

      expect(result.success).toBe(true);
      expect(result.details).toContain("skipped");
    });

    it("should commit changes on milestone", async () => {
      // Create a new file
      await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");

      const result = await autoCommitOnMilestone({
        milestoneType: "gate_pass",
        checkpointReason: "gate_pass",
        checkpointId: "ckpt-test-001",
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe("commit");
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
    });

    it("should use custom message", async () => {
      await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");

      const customMessage = "feat: Custom milestone commit";
      const result = await autoCommitOnMilestone({
        milestoneType: "manual",
        message: customMessage,
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.details).toContain(customMessage);
    });

    it("should dry run without actual commit", async () => {
      await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");

      const result = await autoCommitOnMilestone({
        milestoneType: "checkpoint",
        projectPath: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would commit");

      // File should still be uncommitted
      expect(isWorkingTreeClean(tempDir)).toBe(false);
    });

    it("should fail for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));

      const result = await autoCommitOnMilestone({
        milestoneType: "checkpoint",
        projectPath: nonGitDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("git repository");

      await cleanupTempDir(nonGitDir);
    });

    it("should generate correct message for budget_pause", async () => {
      await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");

      const result = await autoCommitOnMilestone({
        milestoneType: "budget_pause",
        projectPath: tempDir,
        dryRun: true,
      });

      expect(result.details).toContain("budget");
    });
  });
});

// ============================================================================
// Compensation Commit Tests
// ============================================================================

describe("Compensation Commits", () => {
  let tempDir: string;
  let firstCommit: string;
  let secondCommit: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
    firstCommit = getCurrentCommit(tempDir);

    // Create second commit
    await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");
    execSync("git add .", { cwd: tempDir, stdio: "pipe" });
    execSync('git commit -m "Add feature"', { cwd: tempDir, stdio: "pipe" });
    secondCommit = getCurrentCommit(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("createCompensationCommit", () => {
    it("should create compensation commit for revertable change", async () => {
      const result = await createCompensationCommit({
        originalCommitSha: secondCommit,
        reason: "Rolling back feature",
        projectPath: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe("compensation_commit");
      expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.commitSha).not.toBe(secondCommit);
    });

    it("should dry run without actual commit", async () => {
      const result = await createCompensationCommit({
        originalCommitSha: secondCommit,
        reason: "Test rollback",
        projectPath: tempDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would create");
      expect(getCurrentCommit(tempDir)).toBe(secondCommit);
    });

    it("should fail for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));

      const result = await createCompensationCommit({
        originalCommitSha: "abc123",
        reason: "Test",
        projectPath: nonGitDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("git repository");

      await cleanupTempDir(nonGitDir);
    });
  });
});

// ============================================================================
// Working Tree Tests
// ============================================================================

describe("Working Tree Capture and Restore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("captureWorkingTree", () => {
    it("should return clean state for clean repo", async () => {
      const result = await captureWorkingTree({ projectPath: tempDir });

      expect(result.success).toBe(true);
      expect(result.state?.ref).toBe("clean");
      expect(result.state?.files).toEqual([]);
    });

    it("should capture uncommitted changes", async () => {
      await writeFile(join(tempDir, "uncommitted.txt"), "uncommitted content");

      const result = await captureWorkingTree({
        projectPath: tempDir,
        description: "Test capture",
      });

      expect(result.success).toBe(true);
      expect(result.state?.ref).not.toBe("clean");
      expect(result.state?.files).toContain("uncommitted.txt");
      expect(result.state?.description).toBe("Test capture");
    });

    it("should fail for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));

      const result = await captureWorkingTree({ projectPath: nonGitDir });

      expect(result.success).toBe(false);
      expect(result.error).toContain("git repository");

      await cleanupTempDir(nonGitDir);
    });
  });

  describe("restoreWorkingTree", () => {
    it("should handle clean state", async () => {
      const state: WorktreeState = {
        ref: "clean",
        capturedAt: new Date(),
        branch: "main",
        commitSha: "abc123",
        files: [],
      };

      const result = await restoreWorkingTree(state, tempDir);

      expect(result.success).toBe(true);
      expect(result.details).toContain("clean");
    });

    it("should detect branch mismatch", async () => {
      const state: WorktreeState = {
        ref: "wt-test",
        capturedAt: new Date(),
        branch: "feature-branch",
        commitSha: "abc123",
        files: ["file.txt"],
      };

      const result = await restoreWorkingTree(state, tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain("branch");
    });
  });
});

// ============================================================================
// Git Reset Tests
// ============================================================================

describe("Git Reset Operations", () => {
  let tempDir: string;
  let firstCommit: string;
  let secondCommit: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
    firstCommit = getCurrentCommit(tempDir);

    // Create second commit
    await writeFile(join(tempDir, "feature.ts"), "export const feature = true;");
    execSync("git add .", { cwd: tempDir, stdio: "pipe" });
    execSync('git commit -m "Add feature"', { cwd: tempDir, stdio: "pipe" });
    secondCommit = getCurrentCommit(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("resetToCommit", () => {
    it("should reset to specific commit (soft)", async () => {
      const result = await resetToCommit(firstCommit, "soft", tempDir);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("reset");
      expect(getCurrentCommit(tempDir)).toBe(firstCommit);
    });

    it("should reset to specific commit (mixed)", async () => {
      const result = await resetToCommit(firstCommit, "mixed", tempDir);

      expect(result.success).toBe(true);
      expect(getCurrentCommit(tempDir)).toBe(firstCommit);
    });

    it("should reset to specific commit (hard)", async () => {
      const result = await resetToCommit(firstCommit, "hard", tempDir);

      expect(result.success).toBe(true);
      expect(getCurrentCommit(tempDir)).toBe(firstCommit);
    });

    it("should dry run without actual reset", async () => {
      const result = await resetToCommit(firstCommit, "hard", tempDir, true);

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would reset");
      expect(getCurrentCommit(tempDir)).toBe(secondCommit);
    });

    it("should fail for invalid commit", async () => {
      const result = await resetToCommit("invalid-sha-12345", "hard", tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid commit");
    });
  });
});

// ============================================================================
// Branch Operations Tests
// ============================================================================

describe("Branch Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("createCheckpointBranch", () => {
    it("should create checkpoint branch", async () => {
      const result = await createCheckpointBranch("ckpt-test-001", tempDir);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("branch_create");
      expect(result.branch).toBe("checkpoint/ckpt-test-001");

      // Verify branch exists
      const branches = execSync("git branch", { cwd: tempDir, encoding: "utf8" });
      expect(branches).toContain("checkpoint/ckpt-test-001");
    });

    it("should dry run without creating branch", async () => {
      const result = await createCheckpointBranch("ckpt-test-001", tempDir, true);

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would create");

      // Verify branch doesn't exist
      const branches = execSync("git branch", { cwd: tempDir, encoding: "utf8" });
      expect(branches).not.toContain("checkpoint/ckpt-test-001");
    });
  });

  describe("deleteCheckpointBranch", () => {
    beforeEach(async () => {
      // Create the branch first
      await createCheckpointBranch("ckpt-test-001", tempDir);
    });

    it("should delete checkpoint branch", async () => {
      const result = await deleteCheckpointBranch("ckpt-test-001", tempDir);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("branch_delete");

      // Verify branch deleted
      const branches = execSync("git branch", { cwd: tempDir, encoding: "utf8" });
      expect(branches).not.toContain("checkpoint/ckpt-test-001");
    });

    it("should dry run without deleting branch", async () => {
      const result = await deleteCheckpointBranch("ckpt-test-001", tempDir, false, true);

      expect(result.success).toBe(true);
      expect(result.details).toContain("Would delete");

      // Verify branch still exists
      const branches = execSync("git branch", { cwd: tempDir, encoding: "utf8" });
      expect(branches).toContain("checkpoint/ckpt-test-001");
    });
  });
});

// ============================================================================
// Checkpoint Integration Tests
// ============================================================================

describe("Checkpoint Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("createGitCompletedAction", () => {
    it("should create completed action from successful result", () => {
      const result: GitOperationResult = {
        success: true,
        operation: "commit",
        details: "Committed",
        commitSha: "abc123def456",
        branch: "main",
      };

      const action = createGitCompletedAction(result, "ckpt-001");

      expect(action).not.toBeNull();
      expect(action?.actionType).toBe("commit");
      expect(action?.idempotencyKey).toContain("commit");
      expect(action?.idempotencyKey).toContain("abc123def456");
      expect(action?.result).toBe("success");
      expect(action?.metadata?.checkpointId).toBe("ckpt-001");
    });

    it("should return null for failed result", () => {
      const result: GitOperationResult = {
        success: false,
        operation: "commit",
        details: "Failed",
        error: "Some error",
      };

      const action = createGitCompletedAction(result);

      expect(action).toBeNull();
    });
  });

  describe("commitAndCheckpoint", () => {
    it("should commit and update checkpoint state", async () => {
      // Create a file to commit
      await writeFile(join(tempDir, "feature.ts"), "export const x = 1;");

      const checkpoint = createMockCheckpoint();

      const { checkpoint: updated, gitResults } = await commitAndCheckpoint(
        checkpoint,
        {
          autoCommit: true,
          createBranch: false,
          projectPath: tempDir,
        },
      );

      expect(gitResults.length).toBeGreaterThan(0);
      expect(gitResults[0].success).toBe(true);

      // Checkpoint should be updated with new commit
      expect(updated.git.lastCheckpointCommit).toMatch(/^[a-f0-9]{40}$/);
      expect(updated.idempotency.completedActions.length).toBe(1);
    });

    it("should create checkpoint branch when requested", async () => {
      const checkpoint = createMockCheckpoint();

      const { checkpoint: updated, gitResults } = await commitAndCheckpoint(
        checkpoint,
        {
          autoCommit: false,
          createBranch: true,
          projectPath: tempDir,
        },
      );

      // Find branch creation result
      const branchResult = gitResults.find((r) => r.operation === "branch_create");
      expect(branchResult?.success).toBe(true);
      expect(updated.git.workingTreeRef).toContain("checkpoint/");
    });

    it("should dry run without side effects", async () => {
      await writeFile(join(tempDir, "feature.ts"), "export const x = 1;");

      const checkpoint = createMockCheckpoint();
      const originalCommit = getCurrentCommit(tempDir);

      const { gitResults } = await commitAndCheckpoint(checkpoint, {
        autoCommit: true,
        createBranch: true,
        projectPath: tempDir,
        dryRun: true,
      });

      // Should report what would happen
      expect(gitResults.some((r) => r.details.includes("Would"))).toBe(true);

      // No actual changes
      expect(getCurrentCommit(tempDir)).toBe(originalCommit);
    });
  });

  describe("gitRollback", () => {
    it("should rollback to checkpoint commit", async () => {
      const firstCommit = getCurrentCommit(tempDir);

      // Create new commits
      await writeFile(join(tempDir, "new.ts"), "export const x = 1;");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "New commit"', { cwd: tempDir, stdio: "pipe" });

      const checkpoint = createMockCheckpoint({
        git: {
          branch: "main",
          uncommittedChanges: [],
          lastCheckpointCommit: firstCommit,
        },
      });

      const results = await gitRollback(checkpoint, {
        strategy: "hard",
        useCompensation: false,
        projectPath: tempDir,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].success).toBe(true);
      expect(getCurrentCommit(tempDir)).toBe(firstCommit);
    });

    it("should use compensation commit for external changes", async () => {
      const firstCommit = getCurrentCommit(tempDir);

      // Simulate external commit
      await writeFile(join(tempDir, "external.ts"), "external change");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "External commit"', { cwd: tempDir, stdio: "pipe" });

      const checkpoint = createMockCheckpoint({
        git: {
          branch: "main",
          uncommittedChanges: [],
          lastCheckpointCommit: firstCommit,
        },
      });

      const results = await gitRollback(checkpoint, {
        useCompensation: true,
        projectPath: tempDir,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].operation).toBe("compensation_commit");
    });

    it("should fail gracefully when no checkpoint commit", async () => {
      const checkpoint = createMockCheckpoint({
        git: {
          branch: "main",
          uncommittedChanges: [],
          lastCheckpointCommit: "unknown",
        },
      });

      const results = await gitRollback(checkpoint, {
        projectPath: tempDir,
      });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("lastCheckpointCommit");
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  describe("Non-git directories", () => {
    let nonGitDir: string;

    beforeEach(async () => {
      nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));
    });

    afterEach(async () => {
      await cleanupTempDir(nonGitDir);
    });

    it("should handle all operations gracefully", async () => {
      // All operations should fail gracefully for non-git dir
      expect(isGitRepository(nonGitDir)).toBe(false);
      expect(getCurrentBranch(nonGitDir)).toBe("unknown");
      expect(getCurrentCommit(nonGitDir)).toBe("unknown");
      expect(getUncommittedFiles(nonGitDir)).toEqual([]);

      const commitResult = await autoCommitOnMilestone({
        milestoneType: "checkpoint",
        projectPath: nonGitDir,
      });
      expect(commitResult.success).toBe(false);

      const captureResult = await captureWorkingTree({ projectPath: nonGitDir });
      expect(captureResult.success).toBe(false);

      const resetResult = await resetToCommit("abc123", "hard", nonGitDir);
      expect(resetResult.success).toBe(false);

      const branchResult = await createCheckpointBranch("test", nonGitDir);
      expect(branchResult.success).toBe(false);
    });
  });

  describe("Special characters in paths", () => {
    it("should handle paths with spaces", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "git test "));

      try {
        execSync("git init", { cwd: tempDir, stdio: "pipe" });
        execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: "pipe" });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: "pipe" });
        await writeFile(join(tempDir, "README.md"), "# Test");
        execSync("git add .", { cwd: tempDir, stdio: "pipe" });
        execSync('git commit -m "Initial"', { cwd: tempDir, stdio: "pipe" });

        expect(isGitRepository(tempDir)).toBe(true);
        expect(getCurrentBranch(tempDir)).not.toBe("unknown");
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
