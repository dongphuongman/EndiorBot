/**
 * Optimizer Core
 *
 * Strategy selection and application for response optimization.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 *
 * @module evaluator/optimizer
 */

import { createLogger } from "../logging/logger.js";
import type { AIProvider, ChatRequest, Message } from "../providers/types.js";
import { ProviderRegistry, getProviderRegistry } from "../providers/provider-registry.js";
import {
  type ScoreCard,
  type ScoreDimensions,
  type OptimizationStrategy,
  type OptimizationSuggestion,
  type OptimizedResponse,
  type AgentResponse,
  type StrategyTrigger,
  getDimensionsBelowThreshold,
} from "./types.js";

const logger = createLogger("optimizer");

// ============================================================================
// Optimizer Configuration
// ============================================================================

export interface OptimizerConfig {
  /** Maximum retry attempts per response */
  maxRetries: number;
  /** Default cooldown between retries in ms */
  defaultCooldownMs: number;
  /** Model to use for optimization prompts */
  optimizationModel?: string;
  /** Whether to allow model escalation */
  allowEscalation: boolean;
  /** Model hierarchy for escalation */
  modelHierarchy: string[];
}

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  maxRetries: 3,
  defaultCooldownMs: 1000,
  allowEscalation: true,
  modelHierarchy: [
    "ollama",
    "github-models",
    "gemini",
    "openai",
    "anthropic",
  ],
};

// ============================================================================
// Optimization State Tracking
// ============================================================================

interface OptimizationAttempt {
  responseId: string;
  strategy: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string;
  beforeScore: number;
  afterScore?: number;
  success?: boolean;
}

// ============================================================================
// Optimizer Class
// ============================================================================

/**
 * Optimizer for response quality improvement.
 */
export class Optimizer {
  private readonly config: OptimizerConfig;
  private readonly registry: ProviderRegistry;
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private attempts: Map<string, OptimizationAttempt[]> = new Map();
  private cooldowns: Map<string, number> = new Map();

  constructor(
    strategies: OptimizationStrategy[] = [],
    config: Partial<OptimizerConfig> = {},
    registry?: ProviderRegistry
  ) {
    this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
    this.registry = registry ?? getProviderRegistry();

    // Register initial strategies
    for (const strategy of strategies) {
      this.registerStrategy(strategy);
    }
  }

  // ==========================================================================
  // Strategy Management
  // ==========================================================================

  /**
   * Register a new optimization strategy.
   */
  registerStrategy(strategy: OptimizationStrategy): void {
    if (this.strategies.has(strategy.name)) {
      logger.warn("Overwriting existing strategy", { name: strategy.name });
    }
    this.strategies.set(strategy.name, strategy);
    logger.debug("Registered strategy", { name: strategy.name, priority: strategy.priority });
  }

  /**
   * Remove a strategy by name.
   */
  removeStrategy(name: string): boolean {
    const removed = this.strategies.delete(name);
    if (removed) {
      logger.debug("Removed strategy", { name });
    }
    return removed;
  }

  /**
   * Get a strategy by name.
   */
  getStrategy(name: string): OptimizationStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * List all registered strategies.
   */
  listStrategies(): OptimizationStrategy[] {
    return Array.from(this.strategies.values())
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Enable or disable a strategy.
   */
  setStrategyEnabled(name: string, enabled: boolean): void {
    const strategy = this.strategies.get(name);
    if (strategy) {
      strategy.enabled = enabled;
      logger.debug("Updated strategy enabled state", { name, enabled });
    }
  }

  // ==========================================================================
  // Strategy Selection
  // ==========================================================================

  /**
   * Select the best strategy for the given score card.
   */
  selectStrategy(scoreCard: ScoreCard): OptimizationStrategy | null {
    const strategies = this.selectStrategies(scoreCard, 1);
    return strategies[0] ?? null;
  }

  /**
   * Select multiple applicable strategies for the given score card.
   */
  selectStrategies(scoreCard: ScoreCard, max: number = 3): OptimizationStrategy[] {
    const applicable: OptimizationStrategy[] = [];

    // Get all strategies sorted by priority
    const allStrategies = this.listStrategies();

    for (const strategy of allStrategies) {
      if (!strategy.enabled) continue;
      if (this.isOnCooldown(strategy.name)) continue;
      if (this.checkTrigger(strategy.trigger, scoreCard)) {
        applicable.push(strategy);
        if (applicable.length >= max) break;
      }
    }

    logger.debug("Selected strategies", {
      count: applicable.length,
      names: applicable.map((s) => s.name),
    });

    return applicable;
  }

  /**
   * Check if a trigger condition is met.
   */
  private checkTrigger(trigger: StrategyTrigger, scoreCard: ScoreCard): boolean {
    const value = trigger.dimension === "overall"
      ? scoreCard.overall
      : scoreCard.dimensions[trigger.dimension];

    switch (trigger.operator) {
      case "<":
        return value < trigger.value;
      case "<=":
        return value <= trigger.value;
      case ">":
        return value > trigger.value;
      case ">=":
        return value >= trigger.value;
      default:
        return false;
    }
  }

  // ==========================================================================
  // Optimization
  // ==========================================================================

  /**
   * Apply an optimization strategy to a response.
   */
  async optimize(
    response: AgentResponse,
    strategy: OptimizationStrategy,
    scoreCard: ScoreCard
  ): Promise<OptimizedResponse> {
    const attemptNumber = this.getAttemptCount(response.id, strategy.name) + 1;

    logger.info("Starting optimization", {
      responseId: response.id,
      strategy: strategy.name,
      attemptNumber,
    });

    // Check if max attempts exceeded
    if (attemptNumber > strategy.maxAttempts) {
      throw new Error(`Max attempts (${strategy.maxAttempts}) exceeded for strategy ${strategy.name}`);
    }

    // Record attempt start
    this.recordAttemptStart(response.id, strategy.name, attemptNumber, scoreCard.overall);

    const startTime = Date.now();

    try {
      // Apply the optimization based on action type
      const optimizedResponse = await this.applyOptimization(response, strategy);

      // Set cooldown
      this.setCooldown(strategy.name, strategy.cooldownMs);

      const result: OptimizedResponse = {
        originalResponseId: response.id,
        optimizedResponse,
        strategyUsed: strategy.name,
        beforeScore: scoreCard,
        afterScore: scoreCard, // Will be updated by caller after re-evaluation
        attemptNumber,
        durationMs: Date.now() - startTime,
      };

      logger.info("Optimization complete", {
        responseId: response.id,
        strategy: strategy.name,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      logger.error("Optimization failed", {
        responseId: response.id,
        strategy: strategy.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply optimization and generate new response.
   */
  private async applyOptimization(
    response: AgentResponse,
    strategy: OptimizationStrategy
  ): Promise<AgentResponse> {
    switch (strategy.action.type) {
      case "retry":
        return this.applyRetryStrategy(response, strategy);
      case "escalate":
        return this.applyEscalateStrategy(response, strategy);
      case "modify":
        return this.applyModifyStrategy(response, strategy);
      case "enhance":
        return this.applyEnhanceStrategy(response, strategy);
      default:
        throw new Error(`Unknown action type: ${strategy.action.type}`);
    }
  }

  private async applyRetryStrategy(
    response: AgentResponse,
    strategy: OptimizationStrategy
  ): Promise<AgentResponse> {
    const provider = await this.getProvider(response.model);
    const params = strategy.action.params as {
      additionalContext?: string;
      temperature?: number;
      maxTokens?: number;
    };

    // Build enhanced prompt
    let enhancedTask = response.task;
    if (params.additionalContext) {
      enhancedTask = `${response.task}\n\nAdditional context: ${params.additionalContext}`;
    }

    const messages: Message[] = [
      { role: "user", content: enhancedTask },
    ];

    const request: ChatRequest = {
      model: response.model,
      messages,
      temperature: params.temperature ?? 0.3,
      maxTokens: params.maxTokens ?? 2000,
    };

    const chatResponse = await provider.chat(request);

    const result: AgentResponse = {
      id: `${response.id}-retry-${Date.now()}`,
      task: response.task,
      content: chatResponse.content,
      model: response.model,
      timestamp: new Date().toISOString(),
      tokens: {
        input: chatResponse.usage.promptTokens,
        output: chatResponse.usage.completionTokens,
      },
    };

    if (response.context) {
      result.context = response.context;
    }

    return result;
  }

  private async applyEscalateStrategy(
    response: AgentResponse,
    strategy: OptimizationStrategy
  ): Promise<AgentResponse> {
    if (!this.config.allowEscalation) {
      throw new Error("Model escalation is disabled");
    }

    const params = strategy.action.params as { targetModel?: string };
    const targetModel = params.targetModel ?? this.getNextTierModel(response.model);

    if (!targetModel) {
      throw new Error("No higher tier model available for escalation");
    }

    const provider = await this.getProvider(targetModel);

    const messages: Message[] = [
      { role: "user", content: response.task },
    ];

    const request: ChatRequest = {
      model: targetModel,
      messages,
      temperature: 0.2,
      maxTokens: 2500,
    };

    const chatResponse = await provider.chat(request);

    const result: AgentResponse = {
      id: `${response.id}-escalate-${Date.now()}`,
      task: response.task,
      content: chatResponse.content,
      model: targetModel,
      timestamp: new Date().toISOString(),
      tokens: {
        input: chatResponse.usage.promptTokens,
        output: chatResponse.usage.completionTokens,
      },
    };

    if (response.context) {
      result.context = response.context;
    }

    return result;
  }

  private async applyModifyStrategy(
    response: AgentResponse,
    strategy: OptimizationStrategy
  ): Promise<AgentResponse> {
    const provider = await this.getProvider();
    const params = strategy.action.params as {
      modification?: string;
      simplify?: boolean;
    };

    let prompt: string;
    if (params.simplify) {
      prompt = `The following task prompt may be too complex. Simplify it while preserving the core requirements:\n\nOriginal task: ${response.task}\n\nSimplified task:`;
    } else {
      prompt = `Modify the following task based on this instruction: ${params.modification}\n\nOriginal task: ${response.task}\n\nModified task:`;
    }

    const messages: Message[] = [
      { role: "user", content: prompt },
    ];

    const simplifyResponse = await provider.chat({
      model: "default",
      messages,
      temperature: 0.3,
      maxTokens: 500,
    });

    // Now execute with simplified task
    const simplifiedTask = simplifyResponse.content;

    const executeMessages: Message[] = [
      { role: "user", content: simplifiedTask },
    ];

    const chatResponse = await provider.chat({
      model: response.model,
      messages: executeMessages,
      temperature: 0.3,
      maxTokens: 2000,
    });

    const result: AgentResponse = {
      id: `${response.id}-modify-${Date.now()}`,
      task: simplifiedTask,
      content: chatResponse.content,
      model: response.model,
      timestamp: new Date().toISOString(),
      tokens: {
        input: chatResponse.usage.promptTokens,
        output: chatResponse.usage.completionTokens,
      },
    };

    if (response.context) {
      result.context = response.context;
    }

    return result;
  }

  private async applyEnhanceStrategy(
    response: AgentResponse,
    strategy: OptimizationStrategy
  ): Promise<AgentResponse> {
    const provider = await this.getProvider(response.model);
    const params = strategy.action.params as {
      addExamples?: boolean;
      securityReview?: boolean;
      formatting?: string;
    };

    let enhancedTask = response.task;

    if (params.addExamples) {
      enhancedTask = `${response.task}\n\nPlease include concrete examples to illustrate your answer.`;
    }

    if (params.securityReview) {
      enhancedTask = `${response.task}\n\nIMPORTANT: Ensure your response follows security best practices. Avoid exposing secrets, use parameterized queries, and validate all inputs.`;
    }

    if (params.formatting) {
      enhancedTask = `${response.task}\n\nPlease format your response as: ${params.formatting}`;
    }

    const messages: Message[] = [
      { role: "user", content: enhancedTask },
    ];

    const request: ChatRequest = {
      model: response.model,
      messages,
      temperature: 0.3,
      maxTokens: 2500,
    };

    const chatResponse = await provider.chat(request);

    const result: AgentResponse = {
      id: `${response.id}-enhance-${Date.now()}`,
      task: enhancedTask,
      content: chatResponse.content,
      model: response.model,
      timestamp: new Date().toISOString(),
      tokens: {
        input: chatResponse.usage.promptTokens,
        output: chatResponse.usage.completionTokens,
      },
    };

    if (response.context) {
      result.context = response.context;
    }

    return result;
  }

  // ==========================================================================
  // Suggestions
  // ==========================================================================

  /**
   * Generate optimization suggestions for a score card.
   */
  suggestImprovements(scoreCard: ScoreCard): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Get applicable strategies
    const applicableStrategies = this.selectStrategies(scoreCard, 5);

    for (const strategy of applicableStrategies) {
      suggestions.push({
        type: strategy.action.type as OptimizationSuggestion["type"],
        reason: `${strategy.description} (${strategy.trigger.dimension} ${strategy.trigger.operator} ${strategy.trigger.value})`,
        confidence: 0.7,
        estimatedImprovement: this.estimateImprovement(strategy, scoreCard),
        strategyName: strategy.name,
      });
    }

    // Add generic suggestions for low dimensions
    const lowDimensions = getDimensionsBelowThreshold(scoreCard.dimensions, 50);
    for (const dim of lowDimensions) {
      const existing = suggestions.some((s) => s.reason.includes(dim));
      if (!existing) {
        suggestions.push(this.getGenericSuggestion(dim, scoreCard.dimensions[dim]));
      }
    }

    return suggestions.sort((a, b) => b.estimatedImprovement - a.estimatedImprovement);
  }

  private estimateImprovement(strategy: OptimizationStrategy, scoreCard: ScoreCard): number {
    // Estimate based on strategy type and current score
    const baseImprovement = {
      retry: 10,
      escalate: 20,
      modify: 8,
      enhance: 12,
    };

    const base = baseImprovement[strategy.action.type] ?? 10;

    // Higher improvement for lower scores
    const scoreFactor = scoreCard.overall < 50 ? 1.5 : 1.0;

    return Math.round(base * scoreFactor);
  }

  private getGenericSuggestion(
    dimension: keyof ScoreDimensions,
    score: number
  ): OptimizationSuggestion {
    const suggestions: Record<keyof ScoreDimensions, OptimizationSuggestion> = {
      correctness: {
        type: "retry",
        reason: `Correctness is low (${score}). Consider retrying with more context.`,
        confidence: 0.6,
        estimatedImprovement: 15,
      },
      efficiency: {
        type: "simplify",
        reason: `Efficiency is low (${score}). Consider simplifying the prompt.`,
        confidence: 0.6,
        estimatedImprovement: 10,
      },
      clarity: {
        type: "enhance",
        reason: `Clarity is low (${score}). Consider adding examples.`,
        confidence: 0.6,
        estimatedImprovement: 12,
      },
      safety: {
        type: "enhance",
        reason: `Safety is low (${score}). Consider running security review.`,
        confidence: 0.8,
        estimatedImprovement: 20,
      },
      ceoAlignment: {
        type: "retry",
        reason: `CEO alignment is low (${score}). Review preferences and retry.`,
        confidence: 0.5,
        estimatedImprovement: 8,
      },
    };

    return suggestions[dimension];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async getProvider(modelId?: string): Promise<AIProvider> {
    // Try to get specified model
    if (modelId) {
      const providers = this.registry.list();
      const prefix = modelId.split("-")[0] ?? modelId;
      for (const provider of providers) {
        if (provider.models.some((m) => m.id === modelId) || provider.id.includes(prefix)) {
          return provider;
        }
      }
    }

    // Fall back to any available provider
    const providers = this.registry.list();
    if (providers.length === 0) {
      throw new Error("No providers available");
    }

    const firstProvider = providers[0];
    if (!firstProvider) {
      throw new Error("No providers available");
    }

    return firstProvider;
  }

  private getNextTierModel(currentModel: string): string | null {
    const currentIndex = this.config.modelHierarchy.findIndex(
      (m) => currentModel.toLowerCase().includes(m.toLowerCase())
    );

    if (currentIndex === -1 || currentIndex >= this.config.modelHierarchy.length - 1) {
      return null;
    }

    return this.config.modelHierarchy[currentIndex + 1] ?? null;
  }

  private getAttemptCount(responseId: string, strategyName: string): number {
    const attempts = this.attempts.get(responseId) ?? [];
    return attempts.filter((a) => a.strategy === strategyName).length;
  }

  private recordAttemptStart(
    responseId: string,
    strategyName: string,
    attemptNumber: number,
    beforeScore: number
  ): void {
    const attempts = this.attempts.get(responseId) ?? [];
    attempts.push({
      responseId,
      strategy: strategyName,
      attemptNumber,
      startedAt: new Date().toISOString(),
      beforeScore,
    });
    this.attempts.set(responseId, attempts);
  }

  private isOnCooldown(strategyName: string): boolean {
    const cooldownEnd = this.cooldowns.get(strategyName);
    if (!cooldownEnd) return false;
    return Date.now() < cooldownEnd;
  }

  private setCooldown(strategyName: string, durationMs: number): void {
    this.cooldowns.set(strategyName, Date.now() + durationMs);
  }

  /**
   * Clear all cooldowns (for testing).
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  /**
   * Get optimization history for a response.
   */
  getAttemptHistory(responseId: string): OptimizationAttempt[] {
    return this.attempts.get(responseId) ?? [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an optimizer with default configuration.
 */
export function createOptimizer(
  strategies?: OptimizationStrategy[],
  config?: Partial<OptimizerConfig>,
  registry?: ProviderRegistry
): Optimizer {
  return new Optimizer(strategies, config, registry);
}

/**
 * Create an optimizer with built-in strategies.
 */
export function createOptimizerWithDefaults(
  config?: Partial<OptimizerConfig>,
  registry?: ProviderRegistry
): Optimizer {
  // Built-in strategies will be added in Day 5
  const defaultStrategies: OptimizationStrategy[] = [];
  return new Optimizer(defaultStrategies, config, registry);
}
