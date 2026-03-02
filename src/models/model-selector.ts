/**
 * Model Selector
 *
 * Selects appropriate model tier based on task type and budget.
 *
 * @module models/model-selector
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.3
 * @sprint 72
 */

import { createLogger, type Logger } from "../logging/index.js";
import {
  ModelTier,
  type ModelConfig,
  type TaskType,
  type ModelSelectionResult,
  MODEL_CONFIGS,
  getModelConfig,
} from "./types.js";
import { SessionBudget } from "./session-budget.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Model selector configuration.
 */
export interface ModelSelectorConfig {
  /** Custom model configs (overrides defaults) */
  modelConfigs?: ModelConfig[];

  /** Session budget instance */
  budget?: SessionBudget;

  /** Enable auto-escalation after failures */
  autoEscalate: boolean;

  /** Number of failures before escalation */
  failureEscalationThreshold: number;

  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default model selector configuration.
 */
export const DEFAULT_MODEL_SELECTOR_CONFIG: ModelSelectorConfig = {
  autoEscalate: true,
  failureEscalationThreshold: 3,
  debug: false,
};

// ============================================================================
// Model Selector
// ============================================================================

/**
 * Model Selector.
 *
 * Selects the appropriate model tier based on:
 * - Task type (architecture → Opus, coding → Sonnet, lint → Haiku)
 * - Task complexity (escalate to higher tier after failures)
 * - Budget constraints (downgrade if budget exhausted)
 *
 * @example
 * ```typescript
 * const selector = new ModelSelector({ autoEscalate: true });
 *
 * // Select model for code generation
 * const result = selector.selectModel('code_generation');
 * console.log(result.config.model); // claude-sonnet-4-5-20250929
 *
 * // With complexity (after 3 failures)
 * const escalated = selector.selectModel('code_generation', 4);
 * console.log(escalated.config.tier); // ELITE (escalated)
 * ```
 */
export class ModelSelector {
  private readonly log: Logger;
  private readonly config: ModelSelectorConfig;
  private readonly modelConfigs: ModelConfig[];
  private budget: SessionBudget | null;

  constructor(config: Partial<ModelSelectorConfig> = {}) {
    this.log = createLogger("ModelSelector");
    this.config = { ...DEFAULT_MODEL_SELECTOR_CONFIG, ...config };
    this.modelConfigs = config.modelConfigs ?? MODEL_CONFIGS;
    this.budget = config.budget ?? null;
  }

  // ==========================================================================
  // Main API
  // ==========================================================================

  /**
   * Select appropriate model for a task.
   *
   * @param taskType - Type of task to perform
   * @param failureCount - Number of previous failures (for escalation)
   * @returns Model selection result
   */
  selectModel(taskType: TaskType, failureCount: number = 0): ModelSelectionResult {
    // Find model by task type
    let config = this.findModelByTaskType(taskType);
    let reason: ModelSelectionResult["reason"] = "task_type_match";
    let downgraded = false;
    let originalTier: ModelTier | undefined;

    // Check for escalation due to failures
    if (this.config.autoEscalate && failureCount >= this.config.failureEscalationThreshold) {
      const escalatedConfig = this.escalateTier(config);
      if (escalatedConfig.tier !== config.tier) {
        if (this.config.debug) {
          this.log.debug("Escalating tier due to failures", {
            from: config.tier,
            to: escalatedConfig.tier,
            failureCount,
          });
        }
        config = escalatedConfig;
        reason = "escalation_due_to_failures";
      }
    }

    // Check budget constraints
    if (this.budget) {
      const budgetCheck = this.budget.checkBudget(config.tier, config.maxCostPerCall);

      if (!budgetCheck.canAfford) {
        // Downgrade to cheaper model
        originalTier = config.tier;
        const downgradedConfig = this.downgradeTier(config);

        if (downgradedConfig.tier !== config.tier) {
          if (this.config.debug) {
            this.log.debug("Downgrading tier due to budget", {
              from: config.tier,
              to: downgradedConfig.tier,
              remainingBudget: budgetCheck.remainingTotal,
            });
          }
          config = downgradedConfig;
          reason = "downgrade_due_to_budget";
          downgraded = true;
        }
      }
    }

    const result: ModelSelectionResult = {
      config,
      reason,
      downgraded,
    };

    if (originalTier) {
      result.originalTier = originalTier;
    }

    // Add warning if downgraded
    if (downgraded) {
      result.warning = `Model downgraded from ${originalTier} to ${config.tier} due to budget constraints`;
    }

    return result;
  }

  /**
   * Select model by tier directly.
   *
   * @param tier - Model tier
   * @returns Model selection result
   */
  selectByTier(tier: ModelTier): ModelSelectionResult {
    let config = this.getConfigForTier(tier);
    let downgraded = false;
    let originalTier: ModelTier | undefined;
    let reason: ModelSelectionResult["reason"] = "task_type_match";

    // Check budget constraints
    if (this.budget) {
      const budgetCheck = this.budget.checkBudget(tier, config.maxCostPerCall);

      if (!budgetCheck.canAfford && budgetCheck.suggestedAlternative) {
        originalTier = tier;
        config = this.getConfigForTier(budgetCheck.suggestedAlternative);
        downgraded = true;
        reason = "downgrade_due_to_budget";
      }
    }

    const result: ModelSelectionResult = {
      config,
      reason,
      downgraded,
    };

    if (originalTier) {
      result.originalTier = originalTier;
    }

    if (downgraded) {
      result.warning = `Model downgraded from ${originalTier} to ${config.tier} due to budget constraints`;
    }

    return result;
  }

  /**
   * Get recommended tier for a task type.
   */
  getRecommendedTier(taskType: TaskType): ModelTier {
    const config = this.findModelByTaskType(taskType);
    return config.tier;
  }

  /**
   * Check if a task type maps to ELITE tier.
   */
  isEliteTask(taskType: TaskType): boolean {
    const config = this.findModelByTaskType(taskType);
    return config.tier === ModelTier.ELITE;
  }

  /**
   * Get all task types for a tier.
   */
  getTaskTypesForTier(tier: ModelTier): TaskType[] {
    const config = this.getConfigForTier(tier);
    return config.taskTypes;
  }

  // ==========================================================================
  // Budget Integration
  // ==========================================================================

  /**
   * Set the session budget.
   */
  setBudget(budget: SessionBudget): void {
    this.budget = budget;
  }

  /**
   * Get the session budget.
   */
  getBudget(): SessionBudget | null {
    return this.budget;
  }

  /**
   * Check if ELITE tier is available (within budget).
   */
  isEliteAvailable(): boolean {
    if (!this.budget) return true;

    const eliteConfig = this.getConfigForTier(ModelTier.ELITE);
    const check = this.budget.checkBudget(ModelTier.ELITE, eliteConfig.maxCostPerCall);
    return check.canAfford;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Find model config by task type.
   */
  private findModelByTaskType(taskType: TaskType): ModelConfig {
    // Find config that handles this task type
    for (const config of this.modelConfigs) {
      if (config.taskTypes.includes(taskType)) {
        return config;
      }
    }

    // Default to STANDARD
    if (this.config.debug) {
      this.log.debug("No model found for task type, defaulting to STANDARD", { taskType });
    }
    return this.getConfigForTier(ModelTier.STANDARD);
  }

  /**
   * Get config for a specific tier.
   */
  private getConfigForTier(tier: ModelTier): ModelConfig {
    const config = this.modelConfigs.find((c) => c.tier === tier);
    if (!config) {
      // Fallback to default configs
      return getModelConfig(tier);
    }
    return config;
  }

  /**
   * Escalate to a higher tier.
   */
  private escalateTier(current: ModelConfig): ModelConfig {
    if (current.tier === ModelTier.EFFICIENCY) {
      return this.getConfigForTier(ModelTier.STANDARD);
    }
    if (current.tier === ModelTier.STANDARD) {
      return this.getConfigForTier(ModelTier.ELITE);
    }
    // Already at highest tier
    return current;
  }

  /**
   * Downgrade to a cheaper tier.
   */
  private downgradeTier(current: ModelConfig): ModelConfig {
    if (current.tier === ModelTier.ELITE) {
      return this.getConfigForTier(ModelTier.STANDARD);
    }
    if (current.tier === ModelTier.STANDARD) {
      return this.getConfigForTier(ModelTier.EFFICIENCY);
    }
    // Already at lowest tier
    return current;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let globalSelector: ModelSelector | undefined;

/**
 * Get the global ModelSelector instance.
 */
export function getModelSelector(
  config?: Partial<ModelSelectorConfig>
): ModelSelector {
  if (!globalSelector) {
    globalSelector = new ModelSelector(config);
  }
  return globalSelector;
}

/**
 * Set the global ModelSelector instance.
 */
export function setModelSelector(selector: ModelSelector): void {
  globalSelector = selector;
}

/**
 * Reset the global ModelSelector (for testing).
 */
export function resetModelSelector(): void {
  globalSelector = undefined;
}

/**
 * Create a new ModelSelector instance.
 */
export function createModelSelector(
  config?: Partial<ModelSelectorConfig>
): ModelSelector {
  return new ModelSelector(config);
}
