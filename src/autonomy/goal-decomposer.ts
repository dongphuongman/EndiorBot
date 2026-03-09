/**
 * Goal Decomposer
 *
 * Breaks CEO goals into multi-agent subtasks with dependency ordering.
 * Builds on MentionParser (explicit @agent) + TaskClassifier (complexity)
 * + heuristic patterns (implicit multi-agent detection).
 *
 * CTO MF-1: Accepts string[] from RouteResult.agents and validates
 * against AgentRole internally via isValidRole().
 *
 * @module autonomy/goal-decomposer
 * @version 1.0.0
 * @authority Sprint 95 Plan (Phase 2)
 * @sprint 95
 */

import type { AgentRole } from "../agents/types/handoff.js";
import { isValidRole, isAllowedTransition } from "../agents/types/handoff.js";
import { TaskClassifier } from "../agents/orchestrator/task-classifier.js";
import type {
  GoalDecomposition,
  Subtask,
  DecompositionStrategy,
  MultiAgentConfig,
} from "./types.js";
import { DEFAULT_T2_CONFIG } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Heuristic patterns mapping goal keywords → implied agents */
const MULTI_AGENT_PATTERNS: Array<{
  pattern: RegExp;
  agents: string[];
  strategy: DecompositionStrategy;
}> = [
  {
    pattern: /design\s+and\s+implement/i,
    agents: ["architect", "coder"],
    strategy: "sequential",
  },
  {
    pattern: /plan\s+and\s+(build|implement|code)/i,
    agents: ["pm", "coder"],
    strategy: "sequential",
  },
  {
    pattern: /review\s+and\s+(fix|refactor)/i,
    agents: ["reviewer", "coder"],
    strategy: "sequential",
  },
  {
    pattern: /test\s+and\s+(fix|update)/i,
    agents: ["tester", "coder"],
    strategy: "sequential",
  },
  {
    pattern: /design.*review/i,
    agents: ["architect", "reviewer"],
    strategy: "sequential",
  },
  {
    pattern: /implement.*test/i,
    agents: ["coder", "tester"],
    strategy: "sequential",
  },
  {
    pattern: /plan.*design.*implement/i,
    agents: ["pm", "architect", "coder"],
    strategy: "sequential",
  },
];

/** Agent ordering for dependency resolution (lower = earlier in pipeline) */
const AGENT_ORDER: Record<string, number> = {
  researcher: 0,
  pm: 1,
  architect: 2,
  pjm: 3,
  coder: 4,
  reviewer: 5,
  tester: 6,
  devops: 7,
  fullstack: 4,
  // Advisors — not in pipeline
  ceo: -1,
  cpo: -1,
  cto: -1,
  assistant: -1,
};

/** Estimated cost per agent call (Sonnet default) — CTO F2 */
const ESTIMATED_COST_PER_AGENT_USD = 0.15;

/** Estimated duration per agent call */
const ESTIMATED_DURATION_PER_AGENT_MS = 15_000;

let idCounter = 0;

// ============================================================================
// GoalDecomposer
// ============================================================================

export class GoalDecomposer {
  private readonly config: MultiAgentConfig;
  private readonly classifier: TaskClassifier;

  constructor(config?: Partial<MultiAgentConfig>) {
    const merged: MultiAgentConfig = { ...DEFAULT_T2_CONFIG };
    if (config) {
      if (config.maxAgents !== undefined) merged.maxAgents = config.maxAgents;
      if (config.maxParallelTracks !== undefined) merged.maxParallelTracks = config.maxParallelTracks;
      if (config.timeoutMs !== undefined) merged.timeoutMs = config.timeoutMs;
      if (config.costLimitUsd !== undefined) merged.costLimitUsd = config.costLimitUsd;
      if (config.perSubtaskTimeoutMs !== undefined) merged.perSubtaskTimeoutMs = config.perSubtaskTimeoutMs;
      if (config.defaultStrategy !== undefined) merged.defaultStrategy = config.defaultStrategy;
    }
    this.config = merged;
    this.classifier = new TaskClassifier();
  }

  /**
   * Check if a goal should be decomposed into multi-agent subtasks.
   * Returns false for single-agent goals (passthrough).
   */
  shouldDecompose(goal: string): boolean {
    if (!goal || goal.trim().length === 0) return false;

    // Check heuristic patterns
    for (const { pattern } of MULTI_AGENT_PATTERNS) {
      if (pattern.test(goal)) return true;
    }

    return false;
  }

  /**
   * Decompose a goal into multi-agent subtasks.
   *
   * CTO MF-1: `explicitAgents` is string[] from RouteResult.agents.
   * Validated against AgentRole internally.
   *
   * @param goal - CEO goal text
   * @param explicitAgents - Agents from RouteResult/MentionParser (string[])
   */
  decompose(goal: string, explicitAgents?: string[]): GoalDecomposition {
    const goalId = `goal-${Date.now()}-${++idCounter}`;

    // 1. Resolve agents: explicit mentions take precedence
    const agents = this.resolveAgents(goal, explicitAgents);

    // 2. Single agent → trivial decomposition
    if (agents.length <= 1) {
      const agent = agents[0] ?? "assistant";
      return {
        goalId,
        originalGoal: goal,
        subtasks: [this.createSubtask(`${goalId}-1`, goal, agent, [])],
        strategy: "sequential",
        estimatedDurationMs: ESTIMATED_DURATION_PER_AGENT_MS,
        estimatedCostUsd: ESTIMATED_COST_PER_AGENT_USD,
      };
    }

    // 3. Validate against config limits
    const clampedAgents = agents.slice(0, this.config.maxAgents);

    // 4. Build dependency graph
    const subtasks = this.buildSubtasks(goalId, goal, clampedAgents);

    // 5. Determine strategy
    const strategy = this.determineStrategy(subtasks);

    // 6. Estimate totals
    const estimatedDurationMs = this.estimateDuration(subtasks, strategy);
    const estimatedCostUsd = subtasks.length * ESTIMATED_COST_PER_AGENT_USD;

    // 7. Validate budget
    const validation = this.validateBudget(estimatedDurationMs, estimatedCostUsd);
    if (!validation.valid) {
      // Trim subtasks to fit budget
      const maxSubtasks = Math.floor(this.config.costLimitUsd / ESTIMATED_COST_PER_AGENT_USD);
      const trimmed = subtasks.slice(0, Math.max(1, maxSubtasks));
      return {
        goalId,
        originalGoal: goal,
        subtasks: trimmed,
        strategy: trimmed.length === 1 ? "sequential" : this.determineStrategy(trimmed),
        estimatedDurationMs: this.estimateDuration(trimmed, trimmed.length === 1 ? "sequential" : strategy),
        estimatedCostUsd: trimmed.length * ESTIMATED_COST_PER_AGENT_USD,
      };
    }

    return {
      goalId,
      originalGoal: goal,
      subtasks,
      strategy,
      estimatedDurationMs,
      estimatedCostUsd,
    };
  }

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  /**
   * Resolve which agents to use for this goal.
   * Priority: explicit agents → heuristic patterns → task classifier → assistant.
   */
  private resolveAgents(goal: string, explicitAgents?: string[]): string[] {
    // 1. Explicit agents from RouteResult (CTO MF-1: validate string → AgentRole)
    if (explicitAgents && explicitAgents.length > 1) {
      return explicitAgents.filter((a) => isValidRole(a));
    }

    // 2. Heuristic pattern matching
    for (const { pattern, agents } of MULTI_AGENT_PATTERNS) {
      if (pattern.test(goal)) {
        return agents;
      }
    }

    // 3. Task classifier → single agent
    const classification = this.classifier.classify(goal);
    return [this.taskTypeToAgent(classification.taskType)];
  }

  /**
   * Map TaskType → default agent.
   */
  private taskTypeToAgent(taskType: string): string {
    switch (taskType) {
      case "architecture": return "architect";
      case "security": return "reviewer";
      case "code_gen": return "coder";
      case "bug_fix": return "coder";
      case "code_review": return "reviewer";
      case "testing": return "tester";
      case "devops": return "devops";
      case "research": return "researcher";
      default: return "assistant";
    }
  }

  /**
   * Build subtasks with dependency ordering based on agent pipeline order.
   */
  private buildSubtasks(goalId: string, goal: string, agents: string[]): Subtask[] {
    // Sort agents by pipeline order
    const sorted = [...agents].sort((a, b) => {
      const orderA = AGENT_ORDER[a] ?? 99;
      const orderB = AGENT_ORDER[b] ?? 99;
      return orderA - orderB;
    });

    const subtasks: Subtask[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const agent = sorted[i]!;
      const id = `${goalId}-${i + 1}`;
      const dependencies: string[] = [];

      // Check if previous agent's output should be a dependency
      if (i > 0) {
        const prevAgent = sorted[i - 1]!;
        if (this.hasDependency(prevAgent, agent)) {
          dependencies.push(`${goalId}-${i}`);
        }
      }

      const description = this.buildSubtaskDescription(agent, goal, sorted.length);
      subtasks.push(this.createSubtask(id, description, agent, dependencies, i + 1));
    }

    return subtasks;
  }

  /**
   * Check if agent B should depend on agent A's output.
   */
  private hasDependency(agentA: string, agentB: string): boolean {
    // If A can hand off to B, then B depends on A
    if (isValidRole(agentA) && isValidRole(agentB)) {
      return isAllowedTransition(agentA as AgentRole, agentB as AgentRole);
    }
    // Default: sequential dependency based on pipeline order
    const orderA = AGENT_ORDER[agentA] ?? 99;
    const orderB = AGENT_ORDER[agentB] ?? 99;
    return orderA < orderB;
  }

  /**
   * Create a subtask with appropriate description.
   */
  private createSubtask(
    id: string,
    description: string,
    agent: string,
    dependencies: string[],
    priority = 1,
  ): Subtask {
    return {
      id,
      description,
      agent,
      dependencies,
      priority,
      estimatedDurationMs: ESTIMATED_DURATION_PER_AGENT_MS,
      status: "pending",
    };
  }

  /**
   * Build a contextual description for a subtask.
   */
  private buildSubtaskDescription(
    agent: string,
    goal: string,
    total: number,
  ): string {
    if (total === 1) return goal;

    const roleDescriptions: Record<string, string> = {
      researcher: "Research and gather information for",
      pm: "Plan and define requirements for",
      architect: "Design the architecture for",
      pjm: "Manage the project for",
      coder: "Implement the code for",
      reviewer: "Review the implementation of",
      tester: "Write and run tests for",
      devops: "Set up deployment for",
    };

    const prefix = roleDescriptions[agent] ?? `Handle (as ${agent})`;
    return `${prefix}: ${goal}`;
  }

  /**
   * Determine execution strategy from dependency graph.
   */
  private determineStrategy(subtasks: Subtask[]): DecompositionStrategy {
    if (subtasks.length <= 1) return "sequential";

    const hasAnyDeps = subtasks.some((s) => s.dependencies.length > 0);
    const allHaveDeps = subtasks.every((s, i) => i === 0 || s.dependencies.length > 0);

    if (!hasAnyDeps) return "parallel";
    if (allHaveDeps) return "sequential";
    return "mixed";
  }

  /**
   * Estimate total duration based on strategy.
   */
  private estimateDuration(subtasks: Subtask[], strategy: DecompositionStrategy): number {
    const perTask = ESTIMATED_DURATION_PER_AGENT_MS;

    switch (strategy) {
      case "sequential":
        return subtasks.length * perTask;
      case "parallel":
        return perTask; // All run concurrently
      case "mixed": {
        // Rough estimate: half sequential, half parallel
        const sequential = Math.ceil(subtasks.length / 2);
        return sequential * perTask;
      }
    }
  }

  /**
   * Validate estimated budget against Gate B limits.
   */
  private validateBudget(
    estimatedDurationMs: number,
    estimatedCostUsd: number,
  ): { valid: boolean; reason?: string } {
    if (estimatedCostUsd > this.config.costLimitUsd) {
      return {
        valid: false,
        reason: `Estimated cost $${estimatedCostUsd.toFixed(2)} exceeds Gate B limit $${this.config.costLimitUsd.toFixed(2)}`,
      };
    }
    if (estimatedDurationMs > this.config.timeoutMs) {
      return {
        valid: false,
        reason: `Estimated duration ${estimatedDurationMs}ms exceeds Gate B limit ${this.config.timeoutMs}ms`,
      };
    }
    return { valid: true };
  }
}
