/**
 * AutonomousSessionManager Tests
 *
 * Tests for autonomous session orchestration.
 *
 * @module sessions/autonomous/__tests__/manager.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @sprint 72
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AutonomousSessionManager,
  createAutonomousSessionManager,
  getAutonomousSessionManager,
  resetAutonomousSessionManager,
} from "../manager.js";
import {
  AutonomyLevel,
  AUTONOMY_GATE_CONFIG,
  type AutonomousEvent,
} from "../types.js";
import { ResilienceState } from "../../state-machine.js";
import { ModelTier } from "../../../models/types.js";

describe("AutonomousSessionManager", () => {
  beforeEach(() => {
    resetAutonomousSessionManager();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe("constructor", () => {
    it("should create with required config", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      expect(manager).toBeDefined();
      const status = manager.getStatus();
      expect(status.projectId).toBe("test-project");
    });

    it("should use default gate B", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const status = manager.getStatus();
      expect(status.gate).toBe("B");
      expect(status.autonomyLevel).toBe(AutonomyLevel.ASSISTED);
    });

    it("should accept custom gate", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
        gate: "C",
      });

      const status = manager.getStatus();
      expect(status.gate).toBe("C");
      expect(status.autonomyLevel).toBe(AutonomyLevel.AUTONOMOUS);
    });

    it("should accept custom budget", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
        budgetUsd: 20,
        opusCapUsd: 5,
        opusCapMin: 30,
      });

      const budget = manager.getBudget();
      expect(budget.getConfig().totalUsd).toBe(20);
      expect(budget.getConfig().opusCapUsd).toBe(5);
      expect(budget.getConfig().opusCapMin).toBe(30);
    });

    it("should generate session ID if not provided", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const status = manager.getStatus();
      expect(status.sessionId).toMatch(/^auto-/);
    });
  });

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  describe("session lifecycle", () => {
    it("should start session", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();

      const status = manager.getStatus();
      expect(status.isActive).toBe(true);
    });

    it("should emit session_started event", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const events: AutonomousEvent[] = [];
      manager.addEventListener((e) => events.push(e));

      await manager.start();

      expect(events.some((e) => e.type === "session_started")).toBe(true);
    });

    it("should pause session", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();
      await manager.pause("Test pause");

      const status = manager.getStatus();
      expect(status.isActive).toBe(false);
    });

    it("should complete session", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();
      await manager.complete();

      const status = manager.getStatus();
      expect(status.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // Task Management
  // ==========================================================================

  describe("task management", () => {
    it("should add task to queue", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const taskId = manager.addTask({
        type: "code_generation",
        description: "Test task",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.05,
      });

      expect(taskId).toMatch(/^task-/);
      expect(manager.getPendingTasks()).toHaveLength(1);
    });

    it("should sort tasks by priority", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      manager.addTask({
        type: "code_generation",
        description: "Low priority",
        stage: ResilienceState.BUILD,
        priority: 3,
        estimatedCost: 0.05,
      });

      manager.addTask({
        type: "architecture",
        description: "High priority",
        stage: ResilienceState.DESIGN,
        priority: 1,
        estimatedCost: 0.20,
      });

      const tasks = manager.getPendingTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0]!.priority).toBe(1);
      expect(tasks[1]!.priority).toBe(3);
    });

    it("should respect task dependencies", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const task1Id = manager.addTask({
        type: "architecture",
        description: "First task",
        stage: ResilienceState.DESIGN,
        priority: 1,
        estimatedCost: 0.20,
      });

      manager.addTask({
        type: "code_generation",
        description: "Depends on first",
        stage: ResilienceState.BUILD,
        priority: 2,
        estimatedCost: 0.05,
        dependencies: [task1Id],
      });

      // Both tasks are pending
      expect(manager.getPendingTasks()).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Model Selection Integration
  // ==========================================================================

  describe("model selection integration", () => {
    it("should provide model selector", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const selector = manager.getModelSelector();
      expect(selector).toBeDefined();
    });

    it("should select ELITE for architecture tasks", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const selector = manager.getModelSelector();
      const result = selector.selectModel("architecture");

      expect(result.config.tier).toBe(ModelTier.ELITE);
    });

    it("should select STANDARD for code_generation tasks", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const selector = manager.getModelSelector();
      const result = selector.selectModel("code_generation");

      expect(result.config.tier).toBe(ModelTier.STANDARD);
    });
  });

  // ==========================================================================
  // Budget Integration
  // ==========================================================================

  describe("budget integration", () => {
    it("should provide budget", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const budget = manager.getBudget();
      expect(budget).toBeDefined();
    });

    it("should track budget in status", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
        budgetUsd: 10,
      });

      const status = manager.getStatus();
      expect(status.budgetSpent).toBe(0);
      expect(status.budgetRemaining).toBe(10);
    });

    it("should integrate budget with model selector", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
        opusCapUsd: 0, // No Opus budget
      });

      const selector = manager.getModelSelector();
      const result = selector.selectModel("architecture");

      // Should downgrade from ELITE to STANDARD due to budget
      expect(result.config.tier).toBe(ModelTier.STANDARD);
      expect(result.downgraded).toBe(true);
    });
  });

  // ==========================================================================
  // Autonomy Gates
  // ==========================================================================

  describe("autonomy gates", () => {
    it("should have correct Gate A config", () => {
      expect(AUTONOMY_GATE_CONFIG.A.level).toBe(AutonomyLevel.SUPERVISED);
      expect(AUTONOMY_GATE_CONFIG.A.maxDurationMs).toBe(30 * 60 * 1000);
      expect(AUTONOMY_GATE_CONFIG.A.maxCostUsd).toBe(0.5);
    });

    it("should have correct Gate B config", () => {
      expect(AUTONOMY_GATE_CONFIG.B.level).toBe(AutonomyLevel.ASSISTED);
      expect(AUTONOMY_GATE_CONFIG.B.maxDurationMs).toBe(30 * 60 * 1000);
      expect(AUTONOMY_GATE_CONFIG.B.maxCostUsd).toBe(2.0);
    });

    it("should have correct Gate C config", () => {
      expect(AUTONOMY_GATE_CONFIG.C.level).toBe(AutonomyLevel.AUTONOMOUS);
      expect(AUTONOMY_GATE_CONFIG.C.maxDurationMs).toBe(2 * 60 * 60 * 1000);
      expect(AUTONOMY_GATE_CONFIG.C.maxCostUsd).toBe(10.0);
    });
  });

  // ==========================================================================
  // Event System
  // ==========================================================================

  describe("event system", () => {
    it("should add event listener", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const events: AutonomousEvent[] = [];
      manager.addEventListener((e) => events.push(e));

      await manager.start();

      expect(events.length).toBeGreaterThan(0);
    });

    it("should remove event listener", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const events: AutonomousEvent[] = [];
      const listener = (e: AutonomousEvent) => events.push(e);

      manager.addEventListener(listener);
      manager.removeEventListener(listener);

      await manager.start();

      expect(events.length).toBe(0);
    });
  });

  // ==========================================================================
  // Status
  // ==========================================================================

  describe("status", () => {
    it("should return complete status", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
        gate: "C",
      });

      await manager.start();

      const status = manager.getStatus();

      expect(status.sessionId).toBeDefined();
      expect(status.projectId).toBe("test-project");
      expect(status.gate).toBe("C");
      expect(status.autonomyLevel).toBe(AutonomyLevel.AUTONOMOUS);
      expect(status.tasksCompleted).toBe(0);
      expect(status.tasksFailed).toBe(0);
      expect(status.tasksPending).toBe(0);
      expect(status.budgetSpent).toBe(0);
      expect(status.escalationCount).toBe(0);
      expect(status.isActive).toBe(true);
    });

    it("should track duration", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 50));

      const status = manager.getStatus();
      expect(status.durationMs).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe("factory functions", () => {
    it("should create manager with createAutonomousSessionManager", () => {
      const manager = createAutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      expect(manager).toBeInstanceOf(AutonomousSessionManager);
    });

    it("should get global manager with getAutonomousSessionManager", () => {
      createAutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const manager = getAutonomousSessionManager();
      expect(manager).not.toBeNull();
    });

    it("should reset global manager", () => {
      createAutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      resetAutonomousSessionManager();

      const manager = getAutonomousSessionManager();
      expect(manager).toBeNull();
    });
  });

  // ==========================================================================
  // Decisions and Escalations
  // ==========================================================================

  describe("decisions and escalations", () => {
    it("should track decisions", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();

      // Initially no decisions
      const decisions = manager.getDecisions();
      expect(decisions).toHaveLength(0);
    });

    it("should track escalations", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();

      // Initially no escalations
      const escalations = manager.getEscalations();
      expect(escalations).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Resilience Integration
  // ==========================================================================

  describe("resilience integration", () => {
    it("should provide resilience manager", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      const resilience = manager.getResilienceManager();
      expect(resilience).toBeDefined();
    });

    it("should track state from resilience manager", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: "/tmp/test-project",
        projectId: "test-project",
      });

      await manager.start();

      const status = manager.getStatus();
      expect(status.state).toBe(ResilienceState.PLANNING);
    });
  });
});
