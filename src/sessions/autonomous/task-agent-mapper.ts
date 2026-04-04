/**
 * Task → Agent Mapper (ADR-042, CTO C2+C3)
 *
 * Maps 18 TaskTypes to agents. Builds per-task context.
 * No conversation history, no memory — clean per-task context.
 *
 * @module sessions/autonomous/task-agent-mapper
 * @version 1.0.0
 * @date 2026-04-03
 * @status ACTIVE — Sprint 124b
 * @authority ADR-042 Autonomous Execution Engine
 */

import { getSoulLoader } from "../../bridge/intelligence/soul-loader.js";
import type { TaskType } from "../../models/types.js";
import type { AutonomousTask, TaskExecutionResult } from "./types.js";

// ============================================================================
// C2: Full TaskType → Agent Mapping (typed against actual TaskType union)
// ============================================================================

const TASK_TYPE_TO_AGENT: Record<TaskType, string> = {
  // ELITE tasks (Opus)
  architecture: "architect",
  design_decision: "architect",
  adr_draft: "architect",
  complex_analysis: "researcher",
  strategic_planning: "pm",
  // STANDARD tasks (Sonnet)
  code_generation: "coder",
  refactor: "coder",
  bug_fix: "coder",
  test_write: "tester",
  code_review: "reviewer",
  documentation: "coder",
  api_design: "architect",
  // EFFICIENCY tasks (Haiku)
  lint: "coder",
  format: "coder",
  simple_edit: "coder",
  verify: "tester",
  // Special
  syntax_check: "coder",
  quick_lookup: "researcher",
};

/** EFFICIENCY tasks — no agent call needed, return success immediately */
const EFFICIENCY_TASKS: ReadonlySet<string> = new Set(["lint", "format", "simple_edit", "syntax_check"]);

/** Gate C only tasks — none in current TaskType union, but guard for future additions */
const GATE_C_ONLY_TASKS: ReadonlySet<string> = new Set(["deployment", "infrastructure", "monitoring", "configuration"]);

/**
 * Map task type to agent name (CTO C2).
 */
export function taskTypeToAgent(taskType: string): string {
  return (TASK_TYPE_TO_AGENT as Record<string, string>)[taskType] ?? "assistant";
}

/**
 * Check if task type is an EFFICIENCY task (no agent call needed).
 */
export function isEfficiencyTask(taskType: string): boolean {
  return EFFICIENCY_TASKS.has(taskType);
}

/**
 * Check if task requires Gate C (blocked in Gate B — CTO C4).
 */
export function requiresGateC(taskType: string): boolean {
  return GATE_C_ONLY_TASKS.has(taskType);
}

// ============================================================================
// C3: Build Task Context
// ============================================================================

/**
 * Build per-task context string (CTO C3).
 *
 * Format: Session Context + Agent SOUL + Task + Dependency Outputs
 * No conversation history. No memory facts.
 */
export function buildTaskContext(
  task: AutonomousTask,
  options: {
    sprintGoal?: string;
    projectRoot?: string;
    tier?: string;
    completedTasks?: Map<string, TaskExecutionResult>;
  },
): string {
  const parts: string[] = [];

  // Session context
  parts.push("[Session Context]");
  if (options.sprintGoal) parts.push(`Sprint: ${options.sprintGoal}`);
  if (options.projectRoot) parts.push(`Project: ${options.projectRoot}`);
  if (options.tier) parts.push(`Tier: ${options.tier}`);
  parts.push("[/Session Context]");

  // Agent SOUL
  const agent = taskTypeToAgent(task.type);
  const soulResult = getSoulLoader().load(agent);
  parts.push(`\n[Agent: ${agent}]`);
  parts.push(soulResult.content);
  parts.push(`[/Agent]`);

  // Task description
  parts.push(`\n[Task]`);
  parts.push(task.description);
  parts.push(`[/Task]`);

  // Dependency outputs (first 500 chars each)
  if (task.dependencies.length > 0 && options.completedTasks) {
    for (const depId of task.dependencies) {
      const depResult = options.completedTasks.get(depId);
      if (depResult?.output) {
        parts.push(`\n[Prior Task: ${depId}]`);
        parts.push(depResult.output.slice(0, 500));
        parts.push(`[/Prior Task]`);
      }
    }
  }

  return parts.join("\n");
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost from token usage and model tier.
 */
export function estimateCostFromTokens(
  tokenUsage: { inputTokens: number; outputTokens: number },
  tier: string,
): number {
  // Rough cost per 1K tokens by tier
  const rates: Record<string, { input: number; output: number }> = {
    ELITE: { input: 0.015, output: 0.075 },
    STANDARD: { input: 0.003, output: 0.015 },
    EFFICIENCY: { input: 0.00025, output: 0.00125 },
  };
  const rate = rates[tier] ?? rates.STANDARD!;
  return (tokenUsage.inputTokens / 1000) * rate.input +
         (tokenUsage.outputTokens / 1000) * rate.output;
}
