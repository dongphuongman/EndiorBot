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
  type FrozenContext,
  FROZEN_CONTEXT_CHAR_CAP,
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
  /**
   * Select the best strategy for the current iteration.
   *
   * Sprint 139 P1-4 (OpenMythos loop-index analog): when `iterationIndex`
   * is provided, strategy priority is adjusted per iteration tier:
   *   - Early (0):  boost low-risk (rephrase, add-context); penalize aggressive
   *   - Middle (1): no adjustment — use base priority as-is (W7 fix)
   *   - Late (2+):  boost high-impact (escalate-model, decompose); penalize safe
   */
  selectStrategy(scoreCard: ScoreCard, iterationIndex?: number): OptimizationStrategy | null {
    const strategies = this.selectStrategies(scoreCard, 3, iterationIndex);
    return strategies[0] ?? null;
  }

  /**
   * Select multiple applicable strategies for the given score card.
   * Sprint 139 P1-4: `iterationIndex` adjusts priority weights.
   */
  selectStrategies(scoreCard: ScoreCard, max: number = 3, iterationIndex?: number): OptimizationStrategy[] {
    const applicable: OptimizationStrategy[] = [];

    // Get all strategies sorted by priority
    const allStrategies = this.listStrategies();

    for (const strategy of allStrategies) {
      if (!strategy.enabled) continue;
      if (this.isOnCooldown(strategy.name)) continue;
      if (this.checkTrigger(strategy.trigger, scoreCard)) {
        applicable.push(strategy);
      }
    }

    // Sprint 139 P1-4: re-sort by iteration-aware priority when iterationIndex is set.
    if (iterationIndex !== undefined && applicable.length > 1) {
      applicable.sort((a, b) => {
        const aPriority = this.iterationAdjustedPriority(a, iterationIndex);
        const bPriority = this.iterationAdjustedPriority(b, iterationIndex);
        return bPriority - aPriority;
      });
    }

    const result = applicable.slice(0, max);

    logger.debug("Selected strategies", {
      count: result.length,
      names: result.map((s) => s.name),
      iterationIndex,
    });

    return result;
  }

  /**
   * Sprint 139 P1-4: adjust strategy priority based on iteration tier.
   * Early iterations prefer safe strategies; late iterations prefer aggressive ones.
   */
  private iterationAdjustedPriority(strategy: OptimizationStrategy, iterationIndex: number): number {
    const base = strategy.priority;
    const name = strategy.name;

    if (iterationIndex <= 0) {
      // Early: boost safe strategies, penalize aggressive ones
      if (name === "rephrase" || name === "add-context") return base + 20;
      if (name === "escalate-model" || name === "decompose") return base - 10;
    } else if (iterationIndex >= 2) {
      // Late: boost aggressive strategies, penalize safe ones
      if (name === "escalate-model" || name === "decompose") return base + 20;
      if (name === "rephrase" || name === "add-context") return base - 10;
    }
    // Middle (iterationIndex === 1): no adjustment — base priority
    return base;
  }

  /**
   * Check if a trigger condition is met.
   */
  private checkTrigger(trigger: StrategyTrigger, scoreCard: ScoreCard): boolean {
    const rawValue = trigger.dimension === "overall"
      ? scoreCard.overall
      : scoreCard.dimensions[trigger.dimension];
    const value = rawValue ?? 50; // Default to neutral for optional dimensions

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
    scoreCard: ScoreCard,
    frozenContext?: FrozenContext,
    iterationIndex?: number,
    totalIterations?: number,
  ): Promise<OptimizedResponse> {
    const attemptNumber = this.getAttemptCount(response.id, strategy.name) + 1;

    // B5 fix: include iterationIndex in log payloads for telemetry evidence
    logger.info("Starting optimization", {
      responseId: response.id,
      strategy: strategy.name,
      attemptNumber,
      iterationIndex,
      totalIterations,
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
      // Sprint 139 P1-3: thread frozenContext so each strategy re-anchors to the
      // original CEO task (OpenMythos frozen input `e` pattern).
      // Sprint 139 P1-4: thread iterationIndex for iteration-aware prompting.
      const optimizedResponse = await this.applyOptimization(response, strategy, frozenContext, iterationIndex, totalIterations);

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

      // B5 fix: include iterationIndex in completion log
      logger.info("Optimization complete", {
        responseId: response.id,
        strategy: strategy.name,
        durationMs: result.durationMs,
        iterationIndex,
      });

      // B2 fix: emit frozen_context_injected telemetry with token count
      if (frozenContext) {
        const frozenTokens = Math.ceil(frozenContext.originalTask.length / 4);
        logger.info("Frozen context injected", {
          responseId: response.id,
          frozenTokens,
          truncated: frozenContext.originalTask.length > FROZEN_CONTEXT_CHAR_CAP,
        });
      }

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
    strategy: OptimizationStrategy,
    frozenContext?: FrozenContext,
    iterationIndex?: number,
    totalIterations?: number,
  ): Promise<AgentResponse> {
    switch (strategy.action.type) {
      case "retry":
        return this.applyRetryStrategy(response, strategy, frozenContext, iterationIndex, totalIterations);
      case "escalate":
        return this.applyEscalateStrategy(response, strategy, frozenContext);
      case "modify":
        return this.applyModifyStrategy(response, strategy, frozenContext);
      case "enhance":
        return this.applyEnhanceStrategy(response, strategy, frozenContext);
      default:
        throw new Error(`Unknown action type: ${strategy.action.type}`);
    }
  }

  /**
   * Sprint 139 P1-4 (OpenMythos loop-index analog): generate iteration-aware
   * guidance text for the optimization prompt. Each tier gets qualitatively
   * different instructions so retries are distinct, not redundant.
   */
  buildIterationGuidance(iterationIndex?: number, totalIterations?: number): string {
    if (iterationIndex === undefined) return "";
    const total = totalIterations ?? "?";
    if (iterationIndex <= 0) {
      return `[Optimization attempt ${iterationIndex + 1}/${total}] This is the first refinement. Focus on the lowest-scoring dimension. Make targeted, minimal improvements.\n\n`;
    }
    if (iterationIndex === 1) {
      return `[Optimization attempt ${iterationIndex + 1}/${total}] Previous refinement did not reach threshold. Try a different approach from the first attempt — rethink the structure or strategy.\n\n`;
    }
    return `[Optimization attempt ${iterationIndex + 1}/${total}] Multiple refinements attempted without convergence. Consider restructuring the response entirely or addressing a fundamentally different dimension.\n\n`;
  }

  /**
   * Sprint 139 P1-3: Build a frozen context prefix for the optimization prompt.
   * Caps at FROZEN_CONTEXT_CHAR_CAP (CTO condition: 500 tokens ≈ 2000 chars).
   */
  private buildFrozenContextBlock(ctx?: FrozenContext): string {
    if (!ctx) return "";
    const parts: string[] = [
      "## FROZEN CONTEXT (do not deviate from this)",
    ];
    let task = ctx.originalTask;
    if (task.length > FROZEN_CONTEXT_CHAR_CAP) {
      task = task.slice(0, FROZEN_CONTEXT_CHAR_CAP - 20) + "\n[...truncated]";
    }
    parts.push(`Original Task: ${task}`);
    if (ctx.soulIdentity) {
      parts.push(`Agent Identity: ${ctx.soulIdentity.slice(0, 200)}`);
    }
    if (ctx.constraints) {
      parts.push(`Constraints: ${ctx.constraints}`);
    }
    parts.push("---");
    return parts.join("\n") + "\n\n";
  }

  private async applyRetryStrategy(
    response: AgentResponse,
    strategy: OptimizationStrategy,
    frozenContext?: FrozenContext,
    iterationIndex?: number,
    totalIterations?: number,
  ): Promise<AgentResponse> {
    const provider = await this.getProvider(response.model);
    const params = strategy.action.params as {
      additionalContext?: string;
      temperature?: number;
      maxTokens?: number;
    };

    // Sprint 139 P1-3: prepend frozen context so the optimizer stays anchored
    // to the original CEO task, even across multiple refinement iterations.
    // Sprint 139 P1-4: add iteration-aware guidance for qualitatively different retries.
    const frozenBlock = this.buildFrozenContextBlock(frozenContext);
    const iterGuide = this.buildIterationGuidance(iterationIndex, totalIterations);

    // Build enhanced prompt — frozenBlock + iterGuide ALWAYS prepended (B3/BG1 fix)
    let enhancedTask = frozenBlock + iterGuide + response.task;
    if (params.additionalContext) {
      enhancedTask = `${frozenBlock}${iterGuide}${response.task}\n\nAdditional context: ${params.additionalContext}`;
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
    strategy: OptimizationStrategy,
    frozenContext?: FrozenContext,
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

    const frozenBlock = this.buildFrozenContextBlock(frozenContext);
    const messages: Message[] = [
      { role: "user", content: frozenBlock + response.task },
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
    strategy: OptimizationStrategy,
    frozenContext?: FrozenContext,
  ): Promise<AgentResponse> {
    const provider = await this.getProvider();
    const params = strategy.action.params as {
      modification?: string;
      simplify?: boolean;
    };

    // B4 fix: frozen context anchors the modification to the original CEO task.
    // The LLM simplifies/modifies the task, but the frozen block ensures the
    // original intent is preserved in the modification prompt.
    const frozenBlock = this.buildFrozenContextBlock(frozenContext);

    let prompt: string;
    if (params.simplify) {
      prompt = `${frozenBlock}The following task prompt may be too complex. Simplify it while preserving the core requirements:\n\nOriginal task: ${response.task}\n\nSimplified task:`;
    } else {
      prompt = `${frozenBlock}Modify the following task based on this instruction: ${params.modification}\n\nOriginal task: ${response.task}\n\nModified task:`;
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

    // Now execute with simplified task — prepend frozen block so execution
    // stays anchored to the CEO's original request even after modification.
    const simplifiedTask = simplifyResponse.content;

    const executeMessages: Message[] = [
      { role: "user", content: frozenBlock + simplifiedTask },
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
    strategy: OptimizationStrategy,
    frozenContext?: FrozenContext,
  ): Promise<AgentResponse> {
    const provider = await this.getProvider(response.model);
    const params = strategy.action.params as {
      addExamples?: boolean;
      securityReview?: boolean;
      formatting?: string;
    };

    // B3 fix: frozenBlock ALWAYS prepended; enhancement suffixes appended
    // after the base task, not replacing it.
    const frozenBlock = this.buildFrozenContextBlock(frozenContext);
    const suffixes: string[] = [];

    if (params.addExamples) {
      suffixes.push("Please include concrete examples to illustrate your answer.");
    }

    if (params.securityReview) {
      suffixes.push("IMPORTANT: Ensure your response follows security best practices. Avoid exposing secrets, use parameterized queries, and validate all inputs.");
    }

    if (params.formatting) {
      suffixes.push(`Please format your response as: ${params.formatting}`);
    }

    const enhancedTask = suffixes.length > 0
      ? `${frozenBlock}${response.task}\n\n${suffixes.join("\n\n")}`
      : frozenBlock + response.task;

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
        const dimScore = scoreCard.dimensions[dim] ?? 50;
        suggestions.push(this.getGenericSuggestion(dim, dimScore));
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
      toolEffectiveness: {
        type: "enhance",
        reason: `Tool effectiveness is low (${score}). Review tool selection strategy.`,
        confidence: 0.6,
        estimatedImprovement: 10,
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
