/**
 * Task Agent Mapper Tests — Sprint 124b (ADR-042)
 *
 * Covers: 18 TaskType→Agent mappings, Gate C guard, efficiency tasks,
 * buildTaskContext format, cost estimation.
 */

import { describe, it, expect } from "vitest";
import {
  taskTypeToAgent,
  isEfficiencyTask,
  requiresGateC,
  buildTaskContext,
  estimateCostFromTokens,
} from "../../../src/sessions/autonomous/task-agent-mapper.js";
import type { AutonomousTask } from "../../../src/sessions/autonomous/types.js";

// ============================================================================
// C2: All 18 TaskType → Agent Mappings
// ============================================================================

describe("taskTypeToAgent (CTO C2 — all TaskType values)", () => {
  const expectedMappings: Record<string, string> = {
    // ELITE
    architecture: "architect",
    design_decision: "architect",
    adr_draft: "architect",
    complex_analysis: "researcher",
    strategic_planning: "pm",
    // STANDARD
    code_generation: "coder",
    refactor: "coder",
    bug_fix: "coder",
    test_write: "tester",
    code_review: "reviewer",
    documentation: "coder",
    api_design: "architect",
    // EFFICIENCY
    lint: "coder",
    format: "coder",
    simple_edit: "coder",
    verify: "tester",
    syntax_check: "coder",
    quick_lookup: "researcher",
  };

  for (const [taskType, expectedAgent] of Object.entries(expectedMappings)) {
    it(`${taskType} → @${expectedAgent}`, () => {
      expect(taskTypeToAgent(taskType)).toBe(expectedAgent);
    });
  }

  it("unknown type falls back to assistant", () => {
    expect(taskTypeToAgent("unknown_type")).toBe("assistant");
  });
});

// ============================================================================
// Gate C Guard (CTO C4)
// ============================================================================

describe("requiresGateC (CTO C4 — PATCH guard)", () => {
  it("deployment requires Gate C", () => {
    expect(requiresGateC("deployment")).toBe(true);
  });

  it("infrastructure requires Gate C", () => {
    expect(requiresGateC("infrastructure")).toBe(true);
  });

  it("monitoring requires Gate C", () => {
    expect(requiresGateC("monitoring")).toBe(true);
  });

  it("configuration requires Gate C", () => {
    expect(requiresGateC("configuration")).toBe(true);
  });

  it("code_generation does NOT require Gate C", () => {
    expect(requiresGateC("code_generation")).toBe(false);
  });

  it("architecture does NOT require Gate C", () => {
    expect(requiresGateC("architecture")).toBe(false);
  });
});

// ============================================================================
// Efficiency Tasks
// ============================================================================

describe("isEfficiencyTask", () => {
  it("lint is efficiency (no agent call)", () => {
    expect(isEfficiencyTask("lint")).toBe(true);
  });

  it("format is efficiency", () => {
    expect(isEfficiencyTask("format")).toBe(true);
  });

  it("simple_edit is efficiency", () => {
    expect(isEfficiencyTask("simple_edit")).toBe(true);
  });

  it("syntax_check is efficiency", () => {
    expect(isEfficiencyTask("syntax_check")).toBe(true);
  });

  it("code_generation is NOT efficiency", () => {
    expect(isEfficiencyTask("code_generation")).toBe(false);
  });
});

// ============================================================================
// C3: buildTaskContext Format
// ============================================================================

describe("buildTaskContext (CTO C3)", () => {
  const makeTask = (overrides: Partial<AutonomousTask> = {}): AutonomousTask => ({
    id: "task-1",
    type: "code_generation",
    description: "Implement login API",
    stage: 4 as never, // BUILD stage
    priority: 1,
    estimatedCost: 0.1,
    maxRetries: 3,
    dependencies: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it("includes Session Context section", () => {
    const ctx = buildTaskContext(makeTask(), { sprintGoal: "Sprint 124b", projectRoot: "/project" });
    expect(ctx).toContain("[Session Context]");
    expect(ctx).toContain("Sprint: Sprint 124b");
    expect(ctx).toContain("Project: /project");
    expect(ctx).toContain("[/Session Context]");
  });

  it("includes Agent SOUL section", () => {
    const ctx = buildTaskContext(makeTask(), {});
    expect(ctx).toContain("[Agent: coder]");
    expect(ctx).toContain("[/Agent]");
  });

  it("includes Task section", () => {
    const ctx = buildTaskContext(makeTask({ description: "Build payment API" }), {});
    expect(ctx).toContain("[Task]");
    expect(ctx).toContain("Build payment API");
    expect(ctx).toContain("[/Task]");
  });

  it("includes dependency outputs when present", () => {
    const completedTasks = new Map();
    completedTasks.set("dep-1", { output: "Previous task completed analysis of auth module" });

    const ctx = buildTaskContext(
      makeTask({ dependencies: ["dep-1"] }),
      { completedTasks },
    );
    expect(ctx).toContain("[Prior Task: dep-1]");
    expect(ctx).toContain("Previous task completed");
  });

  it("truncates dependency output to 500 chars", () => {
    const completedTasks = new Map();
    const longOutput = "Z".repeat(1000);
    completedTasks.set("dep-1", { output: longOutput });

    const ctx = buildTaskContext(
      makeTask({ dependencies: ["dep-1"] }),
      { completedTasks },
    );
    // Output between [Prior Task] tags should be max 500 chars
    const priorSection = ctx.split("[Prior Task: dep-1]")[1]?.split("[/Prior Task]")[0] ?? "";
    expect(priorSection.trim().length).toBe(500);
  });
});

// ============================================================================
// Cost Estimation
// ============================================================================

describe("estimateCostFromTokens", () => {
  it("ELITE tier costs more", () => {
    const cost = estimateCostFromTokens({ inputTokens: 1000, outputTokens: 500 }, "ELITE");
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(
      estimateCostFromTokens({ inputTokens: 1000, outputTokens: 500 }, "STANDARD"),
    );
  });

  it("EFFICIENCY tier costs least", () => {
    const cost = estimateCostFromTokens({ inputTokens: 1000, outputTokens: 500 }, "EFFICIENCY");
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(
      estimateCostFromTokens({ inputTokens: 1000, outputTokens: 500 }, "STANDARD"),
    );
  });

  it("zero tokens → zero cost", () => {
    expect(estimateCostFromTokens({ inputTokens: 0, outputTokens: 0 }, "STANDARD")).toBe(0);
  });
});
