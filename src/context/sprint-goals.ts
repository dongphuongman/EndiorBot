/**
 * Sprint Goals Manager
 *
 * Manages sprint goals persistence across sessions.
 * Sprint 65: T5.4 - Implement sprint-goals.ts.
 *
 * Sprint goals are the "north star" that prevents context drift.
 * They persist across conversations and keep the AI focused.
 *
 * @module context/sprint-goals
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.4
 * @sprint 65
 */

import { createLogger, type Logger } from "../logging/index.js";
import { getContextAnchor, type ContextAnchor } from "./context-anchor.js";
import { type SprintGoal, type SprintObjective } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a sprint goal.
 */
export interface CreateSprintGoalOptions {
  /** Sprint number */
  sprintNumber: string;
  /** Goal title */
  title: string;
  /** Goal description/content */
  content: string;
  /** Sprint objectives */
  objectives: Array<{
    description: string;
    taskRefs?: string[];
  }>;
  /** Success criteria */
  successCriteria: string[];
  /** Definition of done */
  definitionOfDone: string[];
  /** Estimated hours */
  estimatedHours: number;
  /** Target completion date */
  targetDate?: Date;
  /** SDLC stage */
  stage?: string;
  /** Tags */
  tags?: string[];
}

/**
 * Options for updating sprint progress.
 */
export interface UpdateProgressOptions {
  /** Objective ID to update */
  objectiveId: string;
  /** New status */
  status?: "pending" | "in_progress" | "completed" | "blocked";
  /** Progress percentage */
  progress?: number;
  /** Hours spent */
  hoursSpent?: number;
  /** Blocking reason if blocked */
  blockingReason?: string;
}

// ============================================================================
// SprintGoalManager Class
// ============================================================================

/**
 * Sprint Goal Manager.
 *
 * Manages sprint goals persistence and tracking.
 *
 * @example
 * ```typescript
 * const manager = getSprintGoalManager();
 *
 * // Create a new sprint goal
 * const goal = await manager.create({
 *   sprintNumber: "65",
 *   title: "Context Anchoring",
 *   objectives: [
 *     { description: "Implement sprint-goals.ts" },
 *     { description: "Implement checkpoint-manager.ts" },
 *   ],
 *   successCriteria: ["Tests pass", "Integration complete"],
 *   definitionOfDone: ["Code reviewed", "Committed"],
 *   estimatedHours: 40,
 * });
 *
 * // Update progress
 * await manager.updateObjective(goal.id, {
 *   objectiveId: "obj_1",
 *   status: "completed",
 *   progress: 100,
 * });
 *
 * // Get current sprint goal
 * const current = await manager.getCurrent();
 * ```
 */
export class SprintGoalManager {
  private readonly anchor: ContextAnchor;
  private readonly logger: Logger;
  private currentGoalId: string | null = null;

  constructor(anchor?: ContextAnchor) {
    this.anchor = anchor ?? getContextAnchor();
    this.logger = createLogger("SprintGoalManager");
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Create a new sprint goal.
   */
  async create(options: CreateSprintGoalOptions): Promise<SprintGoal> {
    // Create objectives with IDs
    const objectives: SprintObjective[] = options.objectives.map(
      (obj, index) => ({
        id: `obj_${index + 1}`,
        description: obj.description,
        status: "pending" as const,
        progress: 0,
        taskRefs: obj.taskRefs ?? [],
      })
    );

    // Build goal data with proper optional property handling
    const goalData: Omit<SprintGoal, "id" | "createdAt" | "updatedAt"> = {
      type: "sprint_goal",
      title: options.title,
      content: options.content,
      priority: "critical",
      state: "active",
      sprintNumber: options.sprintNumber,
      objectives,
      successCriteria: options.successCriteria,
      definitionOfDone: options.definitionOfDone,
      estimatedHours: options.estimatedHours,
      hoursSpent: 0,
      progress: 0,
      tags: options.tags ?? ["sprint-goal"],
      metadata: {},
    };

    // Add optional properties only if defined
    if (options.targetDate) {
      goalData.targetDate = options.targetDate;
    }
    if (options.stage) {
      goalData.stage = options.stage;
    }

    const goal = await this.anchor.create<SprintGoal>(goalData);

    // Set as current if no current goal
    if (!this.currentGoalId) {
      this.currentGoalId = goal.id;
    }

    this.logger.info("Sprint goal created", {
      id: goal.id,
      sprint: goal.sprintNumber,
      objectives: objectives.length,
    });

    return goal;
  }

  /**
   * Get a sprint goal by ID.
   */
  async get(id: string): Promise<SprintGoal | null> {
    return this.anchor.get<SprintGoal>(id);
  }

  /**
   * Get the current sprint goal.
   */
  async getCurrent(): Promise<SprintGoal | null> {
    // Try cached current goal
    if (this.currentGoalId) {
      const goal = await this.get(this.currentGoalId);
      if (goal && goal.state === "active") {
        return goal;
      }
    }

    // Find most recent active goal
    const goals = await this.anchor.getSprintGoals();
    if (goals.length === 0) {
      return null;
    }

    // Sort by creation date descending
    goals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const current = goals[0]!;
    this.currentGoalId = current.id;

    return current;
  }

  /**
   * Get sprint goal by sprint number.
   */
  async getBySprint(sprintNumber: string): Promise<SprintGoal | null> {
    const goals = await this.anchor.getSprintGoals();
    return goals.find((g) => g.sprintNumber === sprintNumber) ?? null;
  }

  /**
   * List all sprint goals.
   */
  async list(): Promise<SprintGoal[]> {
    return this.anchor.query<SprintGoal>({
      types: ["sprint_goal"],
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  }

  /**
   * Archive a sprint goal.
   */
  async archive(id: string): Promise<SprintGoal | null> {
    const updated = await this.anchor.archive(id);
    if (updated && this.currentGoalId === id) {
      this.currentGoalId = null;
    }
    return updated as SprintGoal | null;
  }

  // =========================================================================
  // Progress Tracking
  // =========================================================================

  /**
   * Update an objective's progress.
   */
  async updateObjective(
    goalId: string,
    options: UpdateProgressOptions
  ): Promise<SprintGoal | null> {
    const goal = await this.get(goalId);
    if (!goal) {
      return null;
    }

    // Find and update objective
    const objIndex = goal.objectives.findIndex(
      (o) => o.id === options.objectiveId
    );
    if (objIndex < 0) {
      this.logger.warn("Objective not found", {
        goalId,
        objectiveId: options.objectiveId,
      });
      return null;
    }

    const objectives = [...goal.objectives];
    const obj = { ...objectives[objIndex]! };

    if (options.status !== undefined) {
      obj.status = options.status;
    }
    if (options.progress !== undefined) {
      obj.progress = options.progress;
    }
    if (options.blockingReason !== undefined) {
      obj.blockingReason = options.blockingReason;
    }

    objectives[objIndex] = obj;

    // Recalculate overall progress
    const totalProgress =
      objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length;

    // Update hours if provided
    const hoursSpent =
      options.hoursSpent !== undefined ? options.hoursSpent : goal.hoursSpent;

    const updated = await this.anchor.update<SprintGoal>(goalId, {
      objectives,
      progress: Math.round(totalProgress),
      hoursSpent,
    });

    if (updated) {
      this.logger.info("Objective updated", {
        goalId,
        objectiveId: options.objectiveId,
        status: obj.status,
        progress: obj.progress,
      });
    }

    return updated;
  }

  /**
   * Mark an objective as completed.
   */
  async completeObjective(
    goalId: string,
    objectiveId: string
  ): Promise<SprintGoal | null> {
    return this.updateObjective(goalId, {
      objectiveId,
      status: "completed",
      progress: 100,
    });
  }

  /**
   * Mark an objective as blocked.
   */
  async blockObjective(
    goalId: string,
    objectiveId: string,
    reason: string
  ): Promise<SprintGoal | null> {
    return this.updateObjective(goalId, {
      objectiveId,
      status: "blocked",
      blockingReason: reason,
    });
  }

  /**
   * Update hours spent on a goal.
   */
  async updateHours(
    goalId: string,
    hoursSpent: number
  ): Promise<SprintGoal | null> {
    return this.anchor.update<SprintGoal>(goalId, { hoursSpent });
  }

  // =========================================================================
  // Context Injection
  // =========================================================================

  /**
   * Format sprint goal for context injection.
   *
   * Returns a markdown string suitable for AI context.
   */
  formatForContext(goal: SprintGoal): string {
    const lines: string[] = [
      `## Sprint ${goal.sprintNumber}: ${goal.title}`,
      "",
      `**Progress:** ${goal.progress}% | **Hours:** ${goal.hoursSpent}/${goal.estimatedHours}h`,
      "",
      "### Objectives",
      "",
    ];

    for (const obj of goal.objectives) {
      const status = this.getStatusEmoji(obj.status);
      lines.push(`- ${status} ${obj.description} (${obj.progress}%)`);
      if (obj.status === "blocked" && obj.blockingReason) {
        lines.push(`  - ⚠️ Blocked: ${obj.blockingReason}`);
      }
    }

    if (goal.successCriteria.length > 0) {
      lines.push("");
      lines.push("### Success Criteria");
      lines.push("");
      for (const criteria of goal.successCriteria) {
        lines.push(`- [ ] ${criteria}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get status emoji for display.
   */
  private getStatusEmoji(
    status: "pending" | "in_progress" | "completed" | "blocked"
  ): string {
    switch (status) {
      case "pending":
        return "⬜";
      case "in_progress":
        return "🔄";
      case "completed":
        return "✅";
      case "blocked":
        return "🚫";
    }
  }

  // =========================================================================
  // Validation
  // =========================================================================

  /**
   * Check if all objectives are completed.
   */
  isComplete(goal: SprintGoal): boolean {
    return goal.objectives.every((o) => o.status === "completed");
  }

  /**
   * Check if any objective is blocked.
   */
  hasBlockers(goal: SprintGoal): boolean {
    return goal.objectives.some((o) => o.status === "blocked");
  }

  /**
   * Get blocked objectives.
   */
  getBlockedObjectives(goal: SprintGoal): SprintObjective[] {
    return goal.objectives.filter((o) => o.status === "blocked");
  }

  /**
   * Get pending objectives.
   */
  getPendingObjectives(goal: SprintGoal): SprintObjective[] {
    return goal.objectives.filter((o) => o.status === "pending");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: SprintGoalManager | null = null;

/**
 * Get the default SprintGoalManager instance.
 */
export function getSprintGoalManager(): SprintGoalManager {
  if (!defaultManager) {
    defaultManager = new SprintGoalManager();
  }
  return defaultManager;
}

/**
 * Reset the default SprintGoalManager instance.
 */
export function resetSprintGoalManager(): void {
  defaultManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a sprint goal.
 */
export async function createSprintGoal(
  options: CreateSprintGoalOptions
): Promise<SprintGoal> {
  const manager = getSprintGoalManager();
  return manager.create(options);
}

/**
 * Load the current sprint goal.
 */
export async function loadCurrentSprintGoal(): Promise<SprintGoal | null> {
  const manager = getSprintGoalManager();
  return manager.getCurrent();
}

/**
 * Update sprint progress.
 */
export async function updateSprintProgress(
  goalId: string,
  options: UpdateProgressOptions
): Promise<SprintGoal | null> {
  const manager = getSprintGoalManager();
  return manager.updateObjective(goalId, options);
}
