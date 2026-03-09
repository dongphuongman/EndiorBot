/**
 * GoalDecomposer Tests — Sprint 95
 *
 * Tests multi-agent goal decomposition with explicit/implicit agent detection,
 * dependency ordering, budget validation, and edge cases.
 *
 * @module tests/autonomy/goal-decomposer
 * @sprint 95
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GoalDecomposer } from "../../src/autonomy/goal-decomposer.js";
import type { GoalDecomposition } from "../../src/autonomy/types.js";
import { DEFAULT_T2_CONFIG } from "../../src/autonomy/types.js";

describe("GoalDecomposer", () => {
  let decomposer: GoalDecomposer;

  beforeEach(() => {
    decomposer = new GoalDecomposer();
  });

  // --------------------------------------------------------------------------
  // shouldDecompose
  // --------------------------------------------------------------------------

  describe("shouldDecompose", () => {
    it("should return true for multi-agent patterns", () => {
      expect(decomposer.shouldDecompose("design and implement payment gateway")).toBe(true);
      expect(decomposer.shouldDecompose("plan and build auth system")).toBe(true);
      expect(decomposer.shouldDecompose("review and fix the login bug")).toBe(true);
    });

    it("should return false for single-agent goals", () => {
      expect(decomposer.shouldDecompose("fix the login bug")).toBe(false);
      expect(decomposer.shouldDecompose("add a button")).toBe(false);
    });

    it("should return false for empty goal", () => {
      expect(decomposer.shouldDecompose("")).toBe(false);
      expect(decomposer.shouldDecompose("   ")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // decompose — single agent passthrough
  // --------------------------------------------------------------------------

  describe("decompose — single agent", () => {
    it("should create trivial decomposition for single-agent goal", () => {
      const result = decomposer.decompose("fix bug in login validation");

      expect(result.subtasks).toHaveLength(1);
      expect(result.strategy).toBe("sequential");
      expect(result.subtasks[0].agent).toBe("coder"); // bug_fix → coder
      expect(result.subtasks[0].dependencies).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // decompose — explicit multi-agent
  // --------------------------------------------------------------------------

  describe("decompose — explicit multi-agent", () => {
    it("should decompose with explicit agents from RouteResult", () => {
      const result = decomposer.decompose(
        "design the payment system",
        ["pm", "architect"],
      );

      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks[0].agent).toBe("pm");
      expect(result.subtasks[1].agent).toBe("architect");
      // pm → architect is allowed transition, so sequential dependency
      expect(result.subtasks[1].dependencies.length).toBeGreaterThan(0);
    });

    it("should filter out invalid agent roles (CTO MF-1)", () => {
      const result = decomposer.decompose(
        "do something",
        ["pm", "invalid-agent", "coder"],
      );

      // invalid-agent is filtered, leaves pm + coder
      expect(result.subtasks).toHaveLength(2);
      const agents = result.subtasks.map((s) => s.agent);
      expect(agents).toContain("pm");
      expect(agents).toContain("coder");
      expect(agents).not.toContain("invalid-agent");
    });
  });

  // --------------------------------------------------------------------------
  // decompose — implicit multi-agent
  // --------------------------------------------------------------------------

  describe("decompose — implicit multi-agent", () => {
    it("should detect 'design and implement' → architect + coder", () => {
      const result = decomposer.decompose("design and implement payment gateway");

      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks[0].agent).toBe("architect");
      expect(result.subtasks[1].agent).toBe("coder");
      expect(result.strategy).toBe("sequential");
    });

    it("should detect 'plan and build' → pm + coder", () => {
      const result = decomposer.decompose("plan and build the auth system");

      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks[0].agent).toBe("pm");
      expect(result.subtasks[1].agent).toBe("coder");
    });

    it("should detect 'review and fix' → reviewer + coder", () => {
      const result = decomposer.decompose("review and fix the input validation");

      expect(result.subtasks).toHaveLength(2);
      const agents = result.subtasks.map((s) => s.agent);
      expect(agents).toContain("reviewer");
      expect(agents).toContain("coder");
    });
  });

  // --------------------------------------------------------------------------
  // Dependency ordering
  // --------------------------------------------------------------------------

  describe("dependency ordering", () => {
    it("should order agents by pipeline position", () => {
      const result = decomposer.decompose(
        "plan design and implement the feature",
        ["coder", "pm", "architect"],
      );

      // Should be sorted: pm (1) → architect (2) → coder (4)
      expect(result.subtasks[0].agent).toBe("pm");
      expect(result.subtasks[1].agent).toBe("architect");
      expect(result.subtasks[2].agent).toBe("coder");
    });

    it("should create sequential dependencies for pipeline agents", () => {
      const result = decomposer.decompose(
        "design and implement",
        ["architect", "coder"],
      );

      // architect → coder: allowed transition, so coder depends on architect
      expect(result.subtasks[0].dependencies).toHaveLength(0);
      expect(result.subtasks[1].dependencies.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Budget validation
  // --------------------------------------------------------------------------

  describe("budget validation", () => {
    it("should trim subtasks when cost exceeds Gate B limit", () => {
      // Gate B = $2.00, each agent ≈ $0.15 → max ~13 agents
      // Create decomposer with strict $0.30 limit (allows only 2 agents)
      const strict = new GoalDecomposer({ costLimitUsd: 0.30 });

      const result = strict.decompose(
        "plan design implement review test deploy",
        ["pm", "architect", "coder", "reviewer", "tester", "devops"],
      );

      // Should be trimmed to fit $0.30 budget
      expect(result.subtasks.length).toBeLessThanOrEqual(2);
      expect(result.estimatedCostUsd).toBeLessThanOrEqual(0.30);
    });

    it("should respect maxAgents config", () => {
      const limited = new GoalDecomposer({ maxAgents: 2 });

      const result = limited.decompose(
        "do everything",
        ["pm", "architect", "coder", "reviewer"],
      );

      expect(result.subtasks.length).toBeLessThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle single-word goal", () => {
      const result = decomposer.decompose("help");
      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks[0].agent).toBe("assistant");
    });

    it("should generate unique goal IDs", () => {
      const r1 = decomposer.decompose("fix bug A");
      const r2 = decomposer.decompose("fix bug B");
      expect(r1.goalId).not.toBe(r2.goalId);
    });
  });

  // --------------------------------------------------------------------------
  // Strategy detection
  // --------------------------------------------------------------------------

  describe("strategy detection", () => {
    it("should return sequential for fully dependent subtasks", () => {
      const result = decomposer.decompose("design and implement payment");
      // architect → coder: all dependent
      expect(result.strategy).toBe("sequential");
    });
  });
});
