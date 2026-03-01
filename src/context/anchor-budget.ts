/**
 * Anchor Budget Configuration
 *
 * Token budget management for context anchoring.
 * Sprint 65: T5.14 - Token budget optimization.
 *
 * Defines budget limits and strategies for anchor context injection.
 *
 * @module context/anchor-budget
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.14
 * @sprint 65
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Budget allocation strategy.
 */
export type BudgetStrategy = "full" | "compact" | "minimal";

/**
 * Anchor budget configuration.
 */
export interface AnchorBudgetConfig {
  /** Maximum tokens for all anchor context */
  maxTotalTokens: number;
  /** Maximum tokens for sprint goal */
  maxSprintGoalTokens: number;
  /** Maximum tokens for git context */
  maxGitContextTokens: number;
  /** Maximum tokens for checkpoints */
  maxCheckpointTokens: number;
  /** Maximum tokens for blockers */
  maxBlockerTokens: number;
  /** Threshold to switch to compact mode (% of max) */
  compactThreshold: number;
  /** Threshold to switch to minimal mode (% of max) */
  minimalThreshold: number;
}

/**
 * Budget allocation result.
 */
export interface AnchorBudgetAllocation {
  /** Total tokens allocated */
  totalTokens: number;
  /** Strategy used */
  strategy: BudgetStrategy;
  /** Tokens per component */
  breakdown: {
    git: number;
    sprintGoal: number;
    checkpoint: number;
    blockers: number;
  };
  /** Whether budget was exceeded (items truncated) */
  truncated: boolean;
  /** Items that were dropped */
  droppedItems: string[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default anchor budget configuration.
 *
 * Budget breakdown:
 * - Git context: ~100-200 tokens (compact: ~50)
 * - Sprint goal: ~300-500 tokens (compact: ~50)
 * - Checkpoint: ~100-200 tokens (compact: ~30)
 * - Blockers: ~200 tokens (up to 3 blockers)
 *
 * Total budget: ~800 tokens (within 2K limit for context injection)
 */
export const DEFAULT_ANCHOR_BUDGET: AnchorBudgetConfig = {
  maxTotalTokens: 800,
  maxSprintGoalTokens: 400,
  maxGitContextTokens: 150,
  maxCheckpointTokens: 150,
  maxBlockerTokens: 200,
  compactThreshold: 0.7, // Switch to compact at 70% usage
  minimalThreshold: 0.9, // Switch to minimal at 90% usage
};

/**
 * Compact mode budget (used when total > 70% of max).
 */
export const COMPACT_ANCHOR_BUDGET: AnchorBudgetConfig = {
  maxTotalTokens: 400,
  maxSprintGoalTokens: 150,
  maxGitContextTokens: 80,
  maxCheckpointTokens: 80,
  maxBlockerTokens: 100,
  compactThreshold: 0.7,
  minimalThreshold: 0.9,
};

/**
 * Minimal mode budget (used when total > 90% of max).
 */
export const MINIMAL_ANCHOR_BUDGET: AnchorBudgetConfig = {
  maxTotalTokens: 200,
  maxSprintGoalTokens: 80,
  maxGitContextTokens: 40,
  maxCheckpointTokens: 40,
  maxBlockerTokens: 40,
  compactThreshold: 0.7,
  minimalThreshold: 0.9,
};

// ============================================================================
// Anchor Budget Manager
// ============================================================================

/**
 * Anchor Budget Manager.
 *
 * Manages token budget allocation for anchor context injection.
 *
 * @example
 * ```typescript
 * const budget = new AnchorBudget();
 *
 * // Get allocation for current context
 * const allocation = budget.allocate({
 *   gitTokens: 100,
 *   sprintGoalTokens: 400,
 *   checkpointTokens: 150,
 *   blockerTokens: 100,
 * });
 *
 * // Check if compact mode needed
 * if (allocation.strategy === "compact") {
 *   // Use compact formatting
 * }
 * ```
 */
export class AnchorBudget {
  private config: AnchorBudgetConfig;

  constructor(config?: Partial<AnchorBudgetConfig>) {
    this.config = { ...DEFAULT_ANCHOR_BUDGET, ...config };
  }

  /**
   * Estimate tokens for content.
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Determine strategy based on available budget.
   */
  determineStrategy(
    currentUsage: number,
    availableBudget: number
  ): BudgetStrategy {
    const usageRatio = currentUsage / availableBudget;

    if (usageRatio >= this.config.minimalThreshold) {
      return "minimal";
    }
    if (usageRatio >= this.config.compactThreshold) {
      return "compact";
    }
    return "full";
  }

  /**
   * Allocate budget for anchor components.
   */
  allocate(
    components: {
      gitTokens: number;
      sprintGoalTokens: number;
      checkpointTokens: number;
      blockerTokens: number;
    },
    availableBudget?: number
  ): AnchorBudgetAllocation {
    const budget = availableBudget ?? this.config.maxTotalTokens;
    const totalRequested =
      components.gitTokens +
      components.sprintGoalTokens +
      components.checkpointTokens +
      components.blockerTokens;

    // Determine strategy
    const strategy = this.determineStrategy(totalRequested, budget);
    const droppedItems: string[] = [];
    let totalTokens = 0;

    // Get budget config based on strategy
    const budgetConfig =
      strategy === "minimal"
        ? MINIMAL_ANCHOR_BUDGET
        : strategy === "compact"
          ? COMPACT_ANCHOR_BUDGET
          : this.config;

    // Allocate with priority: git > sprintGoal > blockers > checkpoint
    const breakdown = {
      git: Math.min(components.gitTokens, budgetConfig.maxGitContextTokens),
      sprintGoal: 0,
      checkpoint: 0,
      blockers: 0,
    };
    totalTokens += breakdown.git;

    // Allocate sprint goal
    const remainingAfterGit = budget - totalTokens;
    if (remainingAfterGit > budgetConfig.maxSprintGoalTokens * 0.5) {
      breakdown.sprintGoal = Math.min(
        components.sprintGoalTokens,
        budgetConfig.maxSprintGoalTokens
      );
      totalTokens += breakdown.sprintGoal;
    } else if (remainingAfterGit > 50) {
      // Minimal sprint goal
      breakdown.sprintGoal = Math.min(components.sprintGoalTokens, 50);
      totalTokens += breakdown.sprintGoal;
    } else {
      droppedItems.push("sprintGoal");
    }

    // Allocate blockers (higher priority than checkpoint)
    const remainingAfterGoal = budget - totalTokens;
    if (remainingAfterGoal > budgetConfig.maxBlockerTokens * 0.5) {
      breakdown.blockers = Math.min(
        components.blockerTokens,
        budgetConfig.maxBlockerTokens
      );
      totalTokens += breakdown.blockers;
    } else if (remainingAfterGoal > 30 && components.blockerTokens > 0) {
      breakdown.blockers = Math.min(components.blockerTokens, 30);
      totalTokens += breakdown.blockers;
    } else if (components.blockerTokens > 0) {
      droppedItems.push("blockers");
    }

    // Allocate checkpoint (lowest priority)
    const remainingAfterBlockers = budget - totalTokens;
    if (remainingAfterBlockers > budgetConfig.maxCheckpointTokens * 0.5) {
      breakdown.checkpoint = Math.min(
        components.checkpointTokens,
        budgetConfig.maxCheckpointTokens
      );
      totalTokens += breakdown.checkpoint;
    } else if (remainingAfterBlockers > 30) {
      breakdown.checkpoint = Math.min(components.checkpointTokens, 30);
      totalTokens += breakdown.checkpoint;
    } else if (components.checkpointTokens > 0) {
      droppedItems.push("checkpoint");
    }

    return {
      totalTokens,
      strategy,
      breakdown,
      truncated: droppedItems.length > 0 || totalTokens < totalRequested,
      droppedItems,
    };
  }

  /**
   * Get budget configuration.
   */
  getConfig(): AnchorBudgetConfig {
    return { ...this.config };
  }

  /**
   * Update budget configuration.
   */
  updateConfig(config: Partial<AnchorBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalAnchorBudget: AnchorBudget | undefined;

/**
 * Get the global AnchorBudget instance.
 */
export function getAnchorBudget(
  config?: Partial<AnchorBudgetConfig>
): AnchorBudget {
  if (!globalAnchorBudget) {
    globalAnchorBudget = new AnchorBudget(config);
  }
  return globalAnchorBudget;
}

/**
 * Reset the global AnchorBudget (for testing).
 */
export function resetAnchorBudget(): void {
  globalAnchorBudget = undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format content within token budget.
 *
 * @param content - Content to format
 * @param maxTokens - Maximum tokens allowed
 * @param truncateSuffix - Suffix to add when truncated
 */
export function formatWithinBudget(
  content: string,
  maxTokens: number,
  truncateSuffix = "..."
): string {
  const estimatedTokens = Math.ceil(content.length / 4);

  if (estimatedTokens <= maxTokens) {
    return content;
  }

  // Truncate to fit within budget
  const maxChars = maxTokens * 4 - truncateSuffix.length;
  return content.slice(0, maxChars) + truncateSuffix;
}

/**
 * Format checkpoint in compact form.
 */
export function formatCheckpointCompact(checkpoint: {
  name: string;
  trigger: string;
  createdAt: Date;
}): string {
  const ago = formatTimeAgo(checkpoint.createdAt);
  return `Checkpoint: ${checkpoint.name} (${checkpoint.trigger}, ${ago})`;
}

/**
 * Format blocker in compact form.
 */
export function formatBlockerCompact(blocker: {
  title: string;
  description?: string;
}): string {
  return `⚠️ ${blocker.title}`;
}

/**
 * Format time ago string.
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ago`;
  }
  if (diffMins > 0) {
    return `${diffMins}m ago`;
  }
  return "just now";
}
