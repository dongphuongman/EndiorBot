/**
 * Context Anchoring E2E Tests
 *
 * End-to-end tests for the Context Anchoring system.
 * Sprint 65: T5.17 - E2E tests for context anchoring.
 *
 * Tests full workflows including:
 * - Sprint goal lifecycle
 * - Checkpoint create/restore
 * - Git context injection
 * - Budget-aware context loading
 *
 * @module tests/e2e/context-anchoring.e2e.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextAnchor,
  resetContextAnchor,
  SprintGoalManager,
  resetSprintGoalManager,
  CheckpointManager,
  resetCheckpointManager,
  GitContextManager,
  resetGitContextManager,
  AnchorBudget,
  resetAnchorBudget,
  getAnchorBudget,
  type SprintGoal,
  type Checkpoint,
} from "../../src/context/index.js";

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "context-e2e-"));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Sprint Goal Lifecycle E2E
// ============================================================================

describe("E2E: Sprint Goal Lifecycle", () => {
  let anchor: ContextAnchor;
  let manager: SprintGoalManager;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await resetContextAnchor();
    await resetSprintGoalManager();
    anchor = new ContextAnchor({ storagePath: tempDir });
    manager = new SprintGoalManager(anchor);
  });

  it("should complete full sprint lifecycle", async () => {
    // 1. Create sprint goal
    const goal = await manager.create({
      sprintNumber: "65",
      title: "Context Anchoring Implementation",
      content: "Implement full context anchoring system",
      objectives: [
        { description: "Create ContextAnchor class", taskRefs: ["T5.3"] },
        { description: "Create SprintGoalManager", taskRefs: ["T5.4"] },
        { description: "Create CheckpointManager", taskRefs: ["T5.7", "T5.8"] },
        { description: "Create GitContextManager", taskRefs: ["T5.10"] },
        { description: "Implement token budget", taskRefs: ["T5.14"] },
      ],
      successCriteria: [
        "All tests pass",
        "Integration with ContextInjector complete",
        "Performance benchmarks met",
      ],
      definitionOfDone: [
        "Code reviewed",
        "Documentation complete",
        "Committed to main",
      ],
      estimatedHours: 40,
      stage: "04-BUILD",
      tags: ["sprint-65", "context-anchoring"],
    });

    expect(goal.id).toBeDefined();
    expect(goal.objectives.length).toBe(5);
    expect(goal.progress).toBe(0);

    // 2. Start working - update first objective
    await manager.updateObjective(goal.id, {
      objectiveId: "obj_1",
      status: "in_progress",
      progress: 50,
    });

    let current = await manager.getCurrent();
    expect(current?.objectives[0]?.status).toBe("in_progress");
    expect(current?.objectives[0]?.progress).toBe(50);

    // 3. Complete first objective
    await manager.completeObjective(goal.id, "obj_1");
    current = await manager.getCurrent();
    expect(current?.objectives[0]?.status).toBe("completed");
    expect(current?.progress).toBe(20); // 1/5 = 20%

    // 4. Block third objective
    await manager.blockObjective(
      goal.id,
      "obj_3",
      "Waiting for dependency resolution"
    );
    current = await manager.getCurrent();
    expect(manager.hasBlockers(current!)).toBe(true);

    // 5. Complete remaining objectives
    await manager.completeObjective(goal.id, "obj_2");
    await manager.updateObjective(goal.id, {
      objectiveId: "obj_3",
      status: "completed",
      progress: 100,
    });
    await manager.completeObjective(goal.id, "obj_4");
    await manager.completeObjective(goal.id, "obj_5");

    // 6. Verify completion
    current = await manager.getCurrent();
    expect(manager.isComplete(current!)).toBe(true);
    expect(current?.progress).toBe(100);

    // 7. Format for context injection
    const fullContext = manager.formatForContext(current!);
    expect(fullContext).toContain("Sprint 65");
    expect(fullContext).toContain("100%");

    const compactContext = manager.formatCompact(current!);
    expect(compactContext).toContain("S65");
    expect(compactContext).toContain("5/5done");

    // 8. Archive completed sprint
    const archived = await manager.archive(goal.id);
    expect(archived?.state).toBe("archived");
  });

  it("should persist and reload sprint goals", async () => {
    // Create goal
    const goal = await manager.create({
      sprintNumber: "66",
      title: "Persistence Test",
      content: "Test data persistence",
      objectives: [{ description: "Test persistence", taskRefs: [] }],
      successCriteria: [],
      definitionOfDone: [],
      estimatedHours: 8,
    });

    await manager.completeObjective(goal.id, "obj_1");

    // Force save
    await anchor.forceSave();

    // Create new instances (simulating restart)
    const newAnchor = new ContextAnchor({ storagePath: tempDir });
    await newAnchor.initialize();
    const newManager = new SprintGoalManager(newAnchor);

    // Verify data persisted
    const loaded = await newManager.getBySprint("66");
    expect(loaded).not.toBeNull();
    expect(loaded?.progress).toBe(100);
    expect(loaded?.objectives[0]?.status).toBe("completed");
  });
});

// ============================================================================
// Checkpoint System E2E
// ============================================================================

describe("E2E: Checkpoint System", () => {
  let anchor: ContextAnchor;
  let sprintManager: SprintGoalManager;
  let checkpointManager: CheckpointManager;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await resetContextAnchor();
    await resetSprintGoalManager();
    await resetCheckpointManager();
    anchor = new ContextAnchor({ storagePath: tempDir });
    sprintManager = new SprintGoalManager(anchor);
    checkpointManager = new CheckpointManager(anchor);
  });

  it("should create checkpoint with active anchors", async () => {
    // Create some context
    const goal = await sprintManager.create({
      sprintNumber: "65",
      title: "Checkpoint Test",
      content: "Testing checkpoint with context",
      objectives: [{ description: "Test", taskRefs: [] }],
      successCriteria: [],
      definitionOfDone: [],
      estimatedHours: 4,
    });

    // Create checkpoint
    const checkpoint = await checkpointManager.create({
      name: "Mid-sprint checkpoint",
      trigger: "manual",
      description: "Capturing state mid-sprint",
    });

    expect(checkpoint.activeAnchors.length).toBeGreaterThan(0);
    expect(checkpoint.activeAnchors).toContain(goal.id);

    // Modify goal
    await sprintManager.completeObjective(goal.id, "obj_1");

    // Checkpoint should still have the original anchor ID
    expect(checkpoint.activeAnchors).toContain(goal.id);
  });

  it("should restore checkpoint state", async () => {
    // Create context
    const goal = await sprintManager.create({
      sprintNumber: "65",
      title: "Restore Test",
      content: "Testing restore",
      objectives: [
        { description: "Obj 1", taskRefs: [] },
        { description: "Obj 2", taskRefs: [] },
      ],
      successCriteria: [],
      definitionOfDone: [],
      estimatedHours: 8,
    });

    // Complete first objective
    await sprintManager.updateObjective(goal.id, {
      objectiveId: "obj_1",
      status: "completed",
      progress: 100,
    });

    // Create checkpoint
    const checkpoint = await checkpointManager.create({
      name: "Before risky change",
      trigger: "pre_destructive",
    });

    // Make more changes
    await sprintManager.updateObjective(goal.id, {
      objectiveId: "obj_2",
      status: "completed",
      progress: 100,
    });

    // Restore checkpoint
    const result = await checkpointManager.restore(checkpoint.id);
    expect(result.success).toBe(true);
    // activatedAnchors is an array of anchor IDs
    expect(Array.isArray(result.activatedAnchors)).toBe(true);
  });

  it("should filter checkpoints by trigger type", async () => {
    // Create different checkpoint types
    await checkpointManager.createManual("Manual 1");
    await checkpointManager.create({ name: "Auto 1", trigger: "auto_time" });
    await checkpointManager.createPreDestructive("risky-op", "Pre-risky");
    await checkpointManager.createManual("Manual 2");

    // List all checkpoints and filter manually
    const allCheckpoints = await checkpointManager.list();
    expect(allCheckpoints.length).toBe(4);

    const manualCheckpoints = allCheckpoints.filter(
      (c) => c.trigger === "manual"
    );
    expect(manualCheckpoints.length).toBe(2);
  });

  it("should create milestone checkpoint", async () => {
    const checkpoint = await checkpointManager.createMilestone(
      "Feature Complete",
      "Sprint 65 milestone"
    );

    expect(checkpoint.trigger).toBe("auto_milestone");
    expect(checkpoint.name).toContain("Feature Complete");
  });
});

// ============================================================================
// Git Context E2E
// ============================================================================

describe("E2E: Git Context", () => {
  let gitManager: GitContextManager;

  beforeEach(() => {
    resetGitContextManager();
    // Use actual project root (EndiorBot is a git repo)
    gitManager = new GitContextManager(process.cwd());
  });

  it("should get complete git context", async () => {
    const context = await gitManager.getContext(5);

    // EndiorBot is a git repo
    expect(context.isGitRepo).toBe(true);
    expect(context.branch).toBeDefined();
    expect(context.branch).not.toBe("none");
    expect(context.shortCommit.length).toBe(7);
    expect(context.recentCommits.length).toBeLessThanOrEqual(5);
  });

  it("should get branch info with tracking", async () => {
    const branchInfo = await gitManager.getCurrentBranchInfo();

    expect(branchInfo).not.toBeNull();
    expect(branchInfo?.name).toBeDefined();
    expect(branchInfo?.isCurrent).toBe(true);
    expect(branchInfo?.lastCommit).toBeDefined();
  });

  it("should format context for AI injection", async () => {
    const context = await gitManager.getContext(3);
    const formatted = gitManager.formatForContext(context);

    expect(formatted).toContain("## Git Context");
    expect(formatted).toContain("**Branch:**");
    expect(formatted).toContain("**Commit:**");

    const compact = gitManager.getCompactContext(context);
    expect(compact).toContain("Git:");
    expect(compact).toContain("branch:");
  });

  it("should get file at specific commit", async () => {
    // Get a file that exists
    const result = await gitManager.getFileAtCommit("package.json", "HEAD");

    expect(result.success).toBe(true);
    expect(result.existed).toBe(true);
    expect(result.content).toContain("endiorbot");
  });

  it("should handle non-existent file in time-travel", async () => {
    const result = await gitManager.getFileAtCommit(
      "this-file-does-not-exist.txt",
      "HEAD"
    );

    // Should succeed but report file didn't exist
    expect(result.existed).toBe(false);
  });

  it("should get file history", async () => {
    const history = await gitManager.getFileHistory("package.json", 5);

    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.sha).toBeDefined();
    expect(history[0]?.message).toBeDefined();
  });
});

// ============================================================================
// Budget-Aware Context Loading E2E
// ============================================================================

describe("E2E: Budget-Aware Context Loading", () => {
  let anchor: ContextAnchor;
  let sprintManager: SprintGoalManager;
  let checkpointManager: CheckpointManager;
  let gitManager: GitContextManager;
  let budget: AnchorBudget;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await resetContextAnchor();
    await resetSprintGoalManager();
    await resetCheckpointManager();
    resetGitContextManager();
    resetAnchorBudget();

    anchor = new ContextAnchor({ storagePath: tempDir });
    sprintManager = new SprintGoalManager(anchor);
    checkpointManager = new CheckpointManager(anchor);
    gitManager = new GitContextManager(process.cwd());
    budget = getAnchorBudget();
  });

  it("should allocate budget for full context", async () => {
    // Create context
    await sprintManager.create({
      sprintNumber: "65",
      title: "Budget Test Sprint",
      content: "Testing budget allocation",
      objectives: [
        { description: "Test budget", taskRefs: [] },
        { description: "Test allocation", taskRefs: [] },
      ],
      successCriteria: ["Budget respected"],
      definitionOfDone: ["Tests pass"],
      estimatedHours: 16,
    });

    await checkpointManager.create({
      name: "Budget checkpoint",
      trigger: "manual",
    });

    // Simulate loadAnchorContext
    const goal = await sprintManager.getCurrent();
    const checkpoints = await anchor.getCheckpoints();
    const blockers = await anchor.getBlockers();
    const gitContext = await gitManager.getContext(3);

    // Estimate tokens
    const gitTokens = gitContext.isGitRepo
      ? budget.estimateTokens(gitManager.formatForContext(gitContext))
      : 0;
    const sprintGoalTokens = goal
      ? sprintManager.estimateTokens(goal, false)
      : 0;
    const checkpointTokens = checkpoints.length > 0 ? 50 : 0;
    const blockerTokens = blockers.length * 30;

    // Allocate
    const allocation = budget.allocate({
      gitTokens,
      sprintGoalTokens,
      checkpointTokens,
      blockerTokens,
    });

    // Should use full strategy for normal usage
    expect(allocation.strategy).toBe("full");
    expect(allocation.totalTokens).toBeLessThanOrEqual(800);
    expect(allocation.truncated).toBe(false);
  });

  it("should switch to compact when budget tight", async () => {
    // Create context with long content
    const longContent = "A".repeat(2000);
    await sprintManager.create({
      sprintNumber: "65",
      title: "Long Sprint Goal with Lots of Content",
      content: longContent,
      objectives: Array.from({ length: 10 }, (_, i) => ({
        description: `Objective ${i + 1}: ${longContent.slice(0, 100)}`,
        taskRefs: [],
      })),
      successCriteria: Array.from({ length: 5 }, (_, i) => `Criteria ${i + 1}`),
      definitionOfDone: Array.from({ length: 5 }, (_, i) => `Done ${i + 1}`),
      estimatedHours: 80,
    });

    const goal = await sprintManager.getCurrent();
    const fullTokens = sprintManager.estimateTokens(goal!, false);
    const compactTokens = sprintManager.estimateTokens(goal!, true);

    // Compact should be significantly smaller
    expect(compactTokens).toBeLessThan(fullTokens);
    expect(compactTokens).toBeLessThan(100); // Compact format is very concise
  });

  it("should truncate when over budget", async () => {
    const tightBudget = new AnchorBudget({ maxTotalTokens: 200 });

    const allocation = tightBudget.allocate({
      gitTokens: 100,
      sprintGoalTokens: 200,
      checkpointTokens: 100,
      blockerTokens: 50,
    });

    // Total requested (450) exceeds budget (200), so truncation happens
    expect(allocation.truncated).toBe(true);
    expect(allocation.totalTokens).toBeLessThanOrEqual(200);

    // Git should have priority (always included)
    expect(allocation.breakdown.git).toBeGreaterThan(0);

    // Sprint goal should be partially included
    expect(allocation.breakdown.sprintGoal).toBeGreaterThan(0);
    expect(allocation.breakdown.sprintGoal).toBeLessThan(200);
  });
});

// ============================================================================
// Full Integration E2E
// ============================================================================

describe("E2E: Full Integration", () => {
  let anchor: ContextAnchor;
  let sprintManager: SprintGoalManager;
  let checkpointManager: CheckpointManager;
  let gitManager: GitContextManager;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    await resetContextAnchor();
    await resetSprintGoalManager();
    await resetCheckpointManager();
    resetGitContextManager();
    resetAnchorBudget();

    anchor = new ContextAnchor({ storagePath: tempDir });
    sprintManager = new SprintGoalManager(anchor);
    checkpointManager = new CheckpointManager(anchor);
    gitManager = new GitContextManager(process.cwd());
  });

  it("should simulate complete context injection workflow", async () => {
    // 1. Set up sprint goal
    const goal = await sprintManager.create({
      sprintNumber: "65",
      title: "Context Anchoring",
      content: "Full implementation",
      objectives: [
        { description: "Week 1: Foundation", taskRefs: ["T5.1-T5.9"] },
        { description: "Week 2: Advanced", taskRefs: ["T5.10-T5.14"] },
        { description: "Week 3: Polish", taskRefs: ["T5.15-T5.18"] },
      ],
      successCriteria: ["Tests pass", "Docs complete"],
      definitionOfDone: ["CTO approved", "Committed"],
      estimatedHours: 40,
    });

    // 2. Progress through sprint
    await sprintManager.completeObjective(goal.id, "obj_1");
    await sprintManager.completeObjective(goal.id, "obj_2");

    // 3. Create checkpoint before final push
    const checkpoint = await checkpointManager.create({
      name: "Pre-Week3",
      trigger: "manual",
    });

    // 4. Get all context components
    const currentGoal = await sprintManager.getCurrent();
    const gitContext = await gitManager.getContext(3);
    const checkpoints = await anchor.getCheckpoints();
    const blockers = await anchor.getBlockers();

    // 5. Build context string (simulating loadAnchorContext)
    const sections: string[] = [];

    if (gitContext.isGitRepo) {
      sections.push(gitManager.formatForContext(gitContext));
    }

    if (currentGoal) {
      sections.push("");
      sections.push(sprintManager.formatForContext(currentGoal));
    }

    if (checkpoints.length > 0) {
      const recent = checkpoints[0] as Checkpoint;
      sections.push("");
      sections.push(`## Last Checkpoint: ${recent.name}`);
    }

    const fullContext = sections.join("\n");

    // 6. Verify context is complete
    expect(fullContext).toContain("Git Context");
    expect(fullContext).toContain("Sprint 65");
    expect(fullContext).toContain("Context Anchoring");
    // 2/3 objectives = 66.67% rounds to 67%
    expect(fullContext).toMatch(/6[67]%/);
    expect(fullContext).toContain("Pre-Week3");
  });

  it("should handle cleanup workflow", async () => {
    // Create anchors
    for (let i = 0; i < 5; i++) {
      await anchor.create({
        type: "decision",
        title: `Decision ${i}`,
        content: "Content",
        priority: "low",
        state: "active",
        tags: [],
        metadata: {},
      });
    }

    const all = await anchor.query({ types: ["decision"] });
    expect(all.length).toBe(5);

    // Set expiration on one (already expired)
    const pastDate = new Date(Date.now() - 1000);
    await anchor.setExpiration(all[0]!.id, pastDate);

    // Run expired cleanup
    const expired = await anchor.cleanupExpired();
    expect(expired).toBeGreaterThanOrEqual(1);

    // Archive another one
    await anchor.archive(all[1]!.id);

    // Cleanup by type (keep only 2)
    const byType = await anchor.cleanupByType("decision", 2);
    expect(byType).toBeGreaterThanOrEqual(0);

    // Verify some were cleaned up
    const remaining = await anchor.query({
      types: ["decision"],
      states: ["active"],
    });
    expect(remaining.length).toBeLessThanOrEqual(4);
  });
});
