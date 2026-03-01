/**
 * Context Module Performance Benchmarks
 *
 * Performance benchmarks for the Context Anchoring system.
 * Sprint 65: T5.15 - Performance benchmarking.
 *
 * Run with: pnpm bench src/context/__tests__/performance.bench.ts
 *
 * @module context/__tests__/performance.bench
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, bench, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ContextAnchor, resetContextAnchor } from "../context-anchor.js";
import {
  SprintGoalManager,
  resetSprintGoalManager,
} from "../sprint-goals.js";
import {
  CheckpointManager,
  resetCheckpointManager,
} from "../checkpoint-manager.js";
import { GitContextManager, resetGitContextManager } from "../git-context.js";
import {
  AnchorBudget,
  resetAnchorBudget,
  formatWithinBudget,
} from "../anchor-budget.js";
import type { AnchorPoint, SprintGoal } from "../types.js";

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let anchor: ContextAnchor;
let sprintManager: SprintGoalManager;
let checkpointManager: CheckpointManager;
let gitManager: GitContextManager;
let budget: AnchorBudget;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-bench-"));
  await resetContextAnchor();
  await resetSprintGoalManager();
  await resetCheckpointManager();
  resetGitContextManager();
  resetAnchorBudget();

  anchor = new ContextAnchor({ storagePath: tempDir });
  sprintManager = new SprintGoalManager(anchor);
  checkpointManager = new CheckpointManager(anchor);
  gitManager = new GitContextManager(process.cwd());
  budget = new AnchorBudget();
});

afterAll(async () => {
  await resetContextAnchor();
  await resetSprintGoalManager();
  await resetCheckpointManager();
  resetGitContextManager();
  resetAnchorBudget();

  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ============================================================================
// ContextAnchor Benchmarks
// ============================================================================

describe("ContextAnchor Performance", () => {
  bench("create anchor", async () => {
    await anchor.create<AnchorPoint>({
      type: "decision",
      title: "Benchmark Decision",
      content: "Performance test content",
      priority: "medium",
      state: "active",
      tags: ["benchmark"],
      metadata: { test: true },
    });
  });

  bench("get anchor by ID", async () => {
    const created = await anchor.create<AnchorPoint>({
      type: "decision",
      title: "Get Test",
      content: "Content",
      priority: "low",
      state: "active",
      tags: [],
      metadata: {},
    });
    await anchor.get(created.id);
  });

  bench("query anchors by type", async () => {
    await anchor.query({ types: ["decision"] });
  });

  bench("query anchors by state", async () => {
    await anchor.query({ states: ["active"] });
  });

  bench("update anchor", async () => {
    const created = await anchor.create<AnchorPoint>({
      type: "blocker",
      title: "Update Test",
      content: "Content",
      priority: "high",
      state: "active",
      tags: [],
      metadata: {},
    });
    await anchor.update(created.id, { title: "Updated Title" });
  });

  bench("archive anchor", async () => {
    const created = await anchor.create<AnchorPoint>({
      type: "decision",
      title: "Archive Test",
      content: "Content",
      priority: "low",
      state: "active",
      tags: [],
      metadata: {},
    });
    await anchor.archive(created.id);
  });
});

// ============================================================================
// SprintGoalManager Benchmarks
// ============================================================================

describe("SprintGoalManager Performance", () => {
  bench("create sprint goal", async () => {
    await sprintManager.create({
      sprintNumber: "65",
      title: "Benchmark Sprint",
      content: "Performance test sprint goal",
      objectives: [
        { description: "Objective 1", taskRefs: ["T1"] },
        { description: "Objective 2", taskRefs: ["T2"] },
      ],
      successCriteria: ["Criteria 1"],
      definitionOfDone: ["Done 1"],
      estimatedHours: 40,
    });
  });

  bench("get current sprint goal", async () => {
    await sprintManager.getCurrent();
  });

  bench("update objective progress", async () => {
    const goal = await sprintManager.create({
      sprintNumber: "65",
      title: "Update Test",
      content: "Content",
      objectives: [{ description: "Obj", taskRefs: [] }],
      successCriteria: [],
      definitionOfDone: [],
      estimatedHours: 10,
    });
    await sprintManager.updateObjective(goal.id, {
      objectiveId: "obj_1",
      progress: 50,
    });
  });

  bench("format for context (full)", async () => {
    const goal = await sprintManager.getCurrent();
    if (goal) {
      sprintManager.formatForContext(goal);
    }
  });

  bench("format compact", async () => {
    const goal = await sprintManager.getCurrent();
    if (goal) {
      sprintManager.formatCompact(goal);
    }
  });

  bench("estimate tokens", async () => {
    const goal = await sprintManager.getCurrent();
    if (goal) {
      sprintManager.estimateTokens(goal, false);
      sprintManager.estimateTokens(goal, true);
    }
  });
});

// ============================================================================
// CheckpointManager Benchmarks
// ============================================================================

describe("CheckpointManager Performance", () => {
  bench("create checkpoint", async () => {
    await checkpointManager.create({
      name: "Benchmark Checkpoint",
      trigger: "manual",
    });
  });

  bench("list checkpoints", async () => {
    await checkpointManager.list();
  });

  bench("get restorable checkpoints", async () => {
    await checkpointManager.getRestorable();
  });

  bench("create checkpoint with context", async () => {
    // Create some context first
    await anchor.create<AnchorPoint>({
      type: "decision",
      title: "Context for Checkpoint",
      content: "Content",
      priority: "medium",
      state: "active",
      tags: [],
      metadata: {},
    });

    await checkpointManager.create({
      name: "With Context",
      trigger: "manual",
    });
  });
});

// ============================================================================
// GitContextManager Benchmarks
// ============================================================================

describe("GitContextManager Performance", () => {
  bench("get git context", async () => {
    await gitManager.getContext(5);
  });

  bench("get git context (3 commits)", async () => {
    await gitManager.getContext(3);
  });

  bench("get current branch info", async () => {
    await gitManager.getCurrentBranchInfo();
  });

  bench("get recent commits", async () => {
    await gitManager.getRecentCommits(10);
  });

  bench("format for context (full)", async () => {
    const context = await gitManager.getContext(3);
    gitManager.formatForContext(context);
  });

  bench("format compact", async () => {
    const context = await gitManager.getContext(3);
    gitManager.getCompactContext(context);
  });
});

// ============================================================================
// AnchorBudget Benchmarks
// ============================================================================

describe("AnchorBudget Performance", () => {
  bench("estimate tokens (short)", () => {
    budget.estimateTokens("Short text for estimation");
  });

  bench("estimate tokens (long)", () => {
    budget.estimateTokens("a".repeat(10000));
  });

  bench("determine strategy", () => {
    budget.determineStrategy(500, 1000);
  });

  bench("allocate budget (within limit)", () => {
    budget.allocate({
      gitTokens: 100,
      sprintGoalTokens: 200,
      checkpointTokens: 100,
      blockerTokens: 50,
    });
  });

  bench("allocate budget (over limit)", () => {
    budget.allocate({
      gitTokens: 300,
      sprintGoalTokens: 500,
      checkpointTokens: 300,
      blockerTokens: 200,
    });
  });

  bench("formatWithinBudget (no truncation)", () => {
    formatWithinBudget("Short content", 100);
  });

  bench("formatWithinBudget (with truncation)", () => {
    formatWithinBudget("a".repeat(1000), 50);
  });
});

// ============================================================================
// Integrated Workflow Benchmarks
// ============================================================================

describe("Integrated Workflow Performance", () => {
  bench("full context injection simulation", async () => {
    // Simulate what loadAnchorContext does
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
    budget.allocate({
      gitTokens,
      sprintGoalTokens,
      checkpointTokens,
      blockerTokens,
    });
  });

  bench("sprint goal lifecycle", async () => {
    // Create
    const goal = await sprintManager.create({
      sprintNumber: "65",
      title: "Lifecycle Test",
      content: "Content",
      objectives: [
        { description: "Obj 1", taskRefs: [] },
        { description: "Obj 2", taskRefs: [] },
      ],
      successCriteria: ["Criteria"],
      definitionOfDone: ["Done"],
      estimatedHours: 20,
    });

    // Update progress
    await sprintManager.updateObjective(goal.id, {
      objectiveId: "obj_1",
      progress: 50,
    });

    // Complete
    await sprintManager.completeObjective(goal.id, "obj_1");

    // Format
    const updated = await sprintManager.get(goal.id);
    if (updated) {
      sprintManager.formatForContext(updated);
    }
  });

  bench("checkpoint create and list", async () => {
    await checkpointManager.create({
      name: "Workflow Checkpoint",
      trigger: "manual",
    });
    await checkpointManager.list();
    await checkpointManager.getRestorable();
  });
});
