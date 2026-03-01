/**
 * Sprint Goals Manager Tests
 *
 * Unit tests for the SprintGoalManager class.
 * Sprint 65: Week 1 - Context Anchoring Foundation.
 *
 * @module context/__tests__/sprint-goals.test
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
  SprintGoalManager,
  getSprintGoalManager,
  resetSprintGoalManager,
} from "../sprint-goals.js";
// Types imported for documentation purposes only

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "sprint-goals-test-"));
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createTestGoalOptions() {
  return {
    sprintNumber: "65",
    title: "Context Anchoring",
    content: "Implement context anchoring features",
    objectives: [
      { description: "Implement sprint-goals.ts", taskRefs: ["T5.4"] },
      { description: "Implement checkpoint-manager.ts", taskRefs: ["T5.7", "T5.8"] },
    ],
    successCriteria: ["Tests pass", "Integration complete"],
    definitionOfDone: ["Code reviewed", "Committed"],
    estimatedHours: 40,
  };
}

// ============================================================================
// SprintGoalManager Tests
// ============================================================================

describe("SprintGoalManager", () => {
  let anchor: ContextAnchor;
  let manager: SprintGoalManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await resetContextAnchor();
    await resetSprintGoalManager();
    anchor = new ContextAnchor({ storagePath: tempDir });
    manager = new SprintGoalManager(anchor);
  });

  afterEach(async () => {
    await resetSprintGoalManager();
    await resetContextAnchor();
    await cleanupTempDir(tempDir);
  });

  describe("create", () => {
    it("should create a sprint goal with objectives", async () => {
      const options = createTestGoalOptions();
      const goal = await manager.create(options);

      expect(goal.id).toBeDefined();
      expect(goal.id).toMatch(/^sprint_goal_/);
      expect(goal.sprintNumber).toBe("65");
      expect(goal.title).toBe("Context Anchoring");
      expect(goal.objectives.length).toBe(2);
      expect(goal.progress).toBe(0);
      expect(goal.hoursSpent).toBe(0);
    });

    it("should assign IDs to objectives", async () => {
      const options = createTestGoalOptions();
      const goal = await manager.create(options);

      expect(goal.objectives[0]!.id).toBe("obj_1");
      expect(goal.objectives[1]!.id).toBe("obj_2");
      expect(goal.objectives[0]!.status).toBe("pending");
      expect(goal.objectives[0]!.progress).toBe(0);
    });

    it("should include optional properties when provided", async () => {
      const options = {
        ...createTestGoalOptions(),
        targetDate: new Date("2026-03-15"),
        stage: "04-BUILD",
        tags: ["sprint-65", "context-anchoring"],
      };
      const goal = await manager.create(options);

      expect(goal.targetDate).toEqual(new Date("2026-03-15"));
      expect(goal.stage).toBe("04-BUILD");
      expect(goal.tags).toContain("sprint-65");
    });
  });

  describe("get and getCurrent", () => {
    it("should retrieve a goal by ID", async () => {
      const options = createTestGoalOptions();
      const created = await manager.create(options);

      const retrieved = await manager.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe("Context Anchoring");
    });

    it("should return null for non-existent goal", async () => {
      const retrieved = await manager.get("nonexistent_id");
      expect(retrieved).toBeNull();
    });

    it("should get current sprint goal", async () => {
      const options = createTestGoalOptions();
      await manager.create(options);

      const current = await manager.getCurrent();
      expect(current).not.toBeNull();
      expect(current?.sprintNumber).toBe("65");
    });
  });

  describe("getBySprint", () => {
    it("should find goal by sprint number", async () => {
      const options = createTestGoalOptions();
      await manager.create(options);

      const found = await manager.getBySprint("65");
      expect(found).not.toBeNull();
      expect(found?.title).toBe("Context Anchoring");
    });

    it("should return null for non-existent sprint", async () => {
      const options = createTestGoalOptions();
      await manager.create(options);

      const found = await manager.getBySprint("99");
      expect(found).toBeNull();
    });
  });

  describe("updateObjective", () => {
    it("should update objective status and progress", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const updated = await manager.updateObjective(goal.id, {
        objectiveId: "obj_1",
        status: "in_progress",
        progress: 50,
      });

      expect(updated).not.toBeNull();
      expect(updated?.objectives[0]!.status).toBe("in_progress");
      expect(updated?.objectives[0]!.progress).toBe(50);
    });

    it("should recalculate overall progress", async () => {
      const goal = await manager.create(createTestGoalOptions());

      // Complete first objective
      await manager.updateObjective(goal.id, {
        objectiveId: "obj_1",
        status: "completed",
        progress: 100,
      });

      // Update second objective to 50%
      const updated = await manager.updateObjective(goal.id, {
        objectiveId: "obj_2",
        progress: 50,
      });

      // Overall progress should be (100 + 50) / 2 = 75
      expect(updated?.progress).toBe(75);
    });

    it("should return null for non-existent objective", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const result = await manager.updateObjective(goal.id, {
        objectiveId: "nonexistent",
        status: "completed",
      });

      expect(result).toBeNull();
    });
  });

  describe("completeObjective", () => {
    it("should mark objective as completed", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const updated = await manager.completeObjective(goal.id, "obj_1");

      expect(updated?.objectives[0]!.status).toBe("completed");
      expect(updated?.objectives[0]!.progress).toBe(100);
    });
  });

  describe("blockObjective", () => {
    it("should mark objective as blocked with reason", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const updated = await manager.blockObjective(
        goal.id,
        "obj_2",
        "Waiting for code review"
      );

      expect(updated?.objectives[1]!.status).toBe("blocked");
      expect(updated?.objectives[1]!.blockingReason).toBe(
        "Waiting for code review"
      );
    });
  });

  describe("validation helpers", () => {
    it("should check if goal is complete", async () => {
      const goal = await manager.create(createTestGoalOptions());

      expect(manager.isComplete(goal)).toBe(false);

      // Complete both objectives
      await manager.completeObjective(goal.id, "obj_1");
      const completed = await manager.completeObjective(goal.id, "obj_2");

      expect(manager.isComplete(completed!)).toBe(true);
    });

    it("should detect blockers", async () => {
      const goal = await manager.create(createTestGoalOptions());

      expect(manager.hasBlockers(goal)).toBe(false);

      const blocked = await manager.blockObjective(
        goal.id,
        "obj_1",
        "Test blocker"
      );

      expect(manager.hasBlockers(blocked!)).toBe(true);
      expect(manager.getBlockedObjectives(blocked!).length).toBe(1);
    });

    it("should get pending objectives", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const pending = manager.getPendingObjectives(goal);
      expect(pending.length).toBe(2);

      await manager.completeObjective(goal.id, "obj_1");
      const updatedGoal = await manager.get(goal.id);

      expect(manager.getPendingObjectives(updatedGoal!).length).toBe(1);
    });
  });

  describe("archive", () => {
    it("should archive a sprint goal", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const archived = await manager.archive(goal.id);
      expect(archived).not.toBeNull();
      expect(archived?.state).toBe("archived");
    });

    it("should clear current goal when archived", async () => {
      const goal = await manager.create(createTestGoalOptions());

      // Verify it's current
      const current = await manager.getCurrent();
      expect(current?.id).toBe(goal.id);

      // Archive it
      await manager.archive(goal.id);

      // Create a new manager to test getCurrent with no cached ID
      const newManager = new SprintGoalManager(anchor);
      const newCurrent = await newManager.getCurrent();

      // Should be null since the only goal is archived
      expect(newCurrent).toBeNull();
    });
  });

  describe("formatForContext", () => {
    it("should format goal as markdown", async () => {
      const goal = await manager.create(createTestGoalOptions());

      const formatted = manager.formatForContext(goal);

      expect(formatted).toContain("## Sprint 65: Context Anchoring");
      expect(formatted).toContain("**Progress:** 0%");
      expect(formatted).toContain("### Objectives");
      expect(formatted).toContain("Implement sprint-goals.ts");
    });

    it("should show blocked status with reason", async () => {
      const goal = await manager.create(createTestGoalOptions());
      const blocked = await manager.blockObjective(
        goal.id,
        "obj_1",
        "Waiting for review"
      );

      const formatted = manager.formatForContext(blocked!);

      expect(formatted).toContain("Blocked: Waiting for review");
    });
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe("getSprintGoalManager", () => {
  beforeEach(async () => {
    await resetSprintGoalManager();
    await resetContextAnchor();
  });

  afterEach(async () => {
    await resetSprintGoalManager();
    await resetContextAnchor();
  });

  it("should return same instance", () => {
    const manager1 = getSprintGoalManager();
    const manager2 = getSprintGoalManager();
    expect(manager1).toBe(manager2);
  });

  it("should create new instance after reset", () => {
    const manager1 = getSprintGoalManager();
    resetSprintGoalManager();
    const manager2 = getSprintGoalManager();
    expect(manager1).not.toBe(manager2);
  });
});
