/**
 * Evaluator Core
 *
 * Self-evaluation engine for response quality scoring.
 * Implements ADR-010: Evaluator-Optimizer Loop.
 *
 * @module evaluator/evaluator
 */

import { createLogger } from "../logging/logger.js";
import type { AIProvider, ChatRequest, Message } from "../providers/types.js";
import { ProviderRegistry, getProviderRegistry } from "../providers/provider-registry.js";
import {
  type AgentResponse,
  type EvaluationResult,
  type EvaluatorConfig,
  type ScoreCard,
  type ScoreDimensions,
  type DimensionWeights,
  type OptimizationSuggestion,
  type ComparisonResult,
  type ScoreComparison,
  DEFAULT_EVALUATOR_CONFIG,
  calculateOverallScore,
  getDimensionsBelowThreshold,
} from "./types.js";

const logger = createLogger("evaluator");

// ============================================================================
// Evaluation Prompt Templates
// ============================================================================

const EVALUATION_PROMPT_TEMPLATE = `You are an expert evaluator assessing the quality of an AI assistant's response.

## Task Given to the Assistant
{task}

## Assistant's Response
{response}

## Additional Context
{context}

## Evaluation Instructions

Score the response on these 5 dimensions (0-100 each):

1. **Correctness** (30% weight): Does the response correctly solve the problem?
   - Consider: accuracy, completeness, proper implementation
   - 100 = Perfect, no errors
   - 70 = Good with minor issues
   - 50 = Partially correct
   - 30 = Major issues
   - 0 = Completely wrong

2. **Efficiency** (20% weight): Is the response concise and cost-effective?
   - Consider: token usage, response length, avoiding redundancy
   - 100 = Minimal, efficient response
   - 70 = Reasonably concise
   - 50 = Some unnecessary content
   - 30 = Verbose
   - 0 = Extremely wasteful

3. **Clarity** (15% weight): Is the response well-structured and easy to understand?
   - Consider: organization, formatting, explanations
   - 100 = Crystal clear
   - 70 = Easy to follow
   - 50 = Understandable with effort
   - 30 = Confusing
   - 0 = Incomprehensible

4. **Safety** (20% weight): Does the response follow security best practices?
   - Consider: no exposed secrets, no dangerous code, proper input handling
   - 100 = Fully secure
   - 70 = Minor concerns
   - 50 = Some risky patterns
   - 30 = Security issues present
   - 0 = Dangerous/vulnerable

5. **CEO Alignment** (15% weight): Does the response match expected preferences?
   - Consider: coding style, conventions, communication tone
   - 100 = Perfect match
   - 70 = Good alignment
   - 50 = Some mismatches
   - 30 = Poor alignment
   - 0 = Completely off

## Response Format

Respond with a JSON object in this exact format:
\`\`\`json
{
  "scores": {
    "correctness": <number 0-100>,
    "efficiency": <number 0-100>,
    "clarity": <number 0-100>,
    "safety": <number 0-100>,
    "ceoAlignment": <number 0-100>
  },
  "confidence": <number 0.0-1.0>,
  "reasoning": "<brief explanation of each score>",
  "suggestions": [
    {
      "type": "<retry|escalate|simplify|enhance>",
      "reason": "<why this improvement would help>",
      "estimatedImprovement": <number 0-30>
    }
  ]
}
\`\`\`

Only respond with the JSON object, no additional text.`;

const COMPARISON_PROMPT_TEMPLATE = `You are comparing two AI assistant responses to the same task.

## Task
{task}

## Response A
{responseA}

## Response B
{responseB}

## Instructions

Compare the two responses and determine which is better overall.
Score each response on the 5 dimensions (correctness, efficiency, clarity, safety, ceoAlignment) from 0-100.

Respond with a JSON object:
\`\`\`json
{
  "scoresA": {
    "correctness": <number>,
    "efficiency": <number>,
    "clarity": <number>,
    "safety": <number>,
    "ceoAlignment": <number>
  },
  "scoresB": {
    "correctness": <number>,
    "efficiency": <number>,
    "clarity": <number>,
    "safety": <number>,
    "ceoAlignment": <number>
  },
  "winner": "<a|b|equal>",
  "reasoning": "<brief explanation>"
}
\`\`\``;

// ============================================================================
// Evaluator Class
// ============================================================================

/**
 * Self-evaluation engine for response quality scoring.
 */
export class Evaluator {
  private readonly config: EvaluatorConfig;
  private readonly registry: ProviderRegistry;
  private provider: AIProvider | null = null;

  constructor(
    config: Partial<EvaluatorConfig> = {},
    registry?: ProviderRegistry
  ) {
    this.config = { ...DEFAULT_EVALUATOR_CONFIG, ...config };
    this.registry = registry ?? getProviderRegistry();
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set dimension weights for overall score calculation.
   */
  setWeights(weights: Partial<DimensionWeights>): void {
    Object.assign(this.config.weights, weights);
    logger.debug("Updated dimension weights", { weights: this.config.weights });
  }

  /**
   * Get current dimension weights.
   */
  getWeights(): DimensionWeights {
    return { ...this.config.weights };
  }

  /**
   * Set the model to use for evaluation.
   */
  setEvaluationModel(model: string): void {
    this.config.evaluationModel = model;
    logger.debug("Set evaluation model", { model });
  }

  // ==========================================================================
  // Core Evaluation
  // ==========================================================================

  /**
   * Evaluate a response and produce a score card.
   */
  async evaluate(response: AgentResponse): Promise<EvaluationResult> {
    const startTime = Date.now();
    logger.info("Starting evaluation", { responseId: response.id });

    try {
      const provider = await this.getProvider();
      const prompt = this.buildEvaluationPrompt(response);
      const evalResponse = await this.callProvider(provider, prompt);
      const parsed = this.parseEvaluationResponse(evalResponse);

      const scoreCard = this.buildScoreCard(parsed.scores);
      scoreCard.confidence = parsed.confidence; // Use parsed confidence

      const result: EvaluationResult = {
        responseId: response.id,
        scores: scoreCard,
        suggestions: this.buildSuggestions(parsed.suggestions ?? [], parsed.scores),
        evaluatedAt: new Date().toISOString(),
        evaluationModel: this.config.evaluationModel ?? provider.id,
        durationMs: Date.now() - startTime,
      };

      // Conditional assignment for optional property (exactOptionalPropertyTypes)
      if (this.config.includeReasoning && parsed.reasoning) {
        result.reasoning = parsed.reasoning;
      }

      logger.info("Evaluation complete", {
        responseId: response.id,
        overall: result.scores.overall,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      logger.error("Evaluation failed", {
        responseId: response.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Evaluate a response using multiple models and aggregate results.
   */
  async evaluateWithConsensus(
    response: AgentResponse,
    modelIds: string[]
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    logger.info("Starting consensus evaluation", {
      responseId: response.id,
      models: modelIds,
    });

    if (modelIds.length === 0) {
      throw new Error("At least one model required for consensus evaluation");
    }

    // Evaluate with each model in parallel
    const evaluations = await Promise.allSettled(
      modelIds.map(async (modelId) => {
        const provider = this.registry.get(modelId);
        if (!provider) {
          throw new Error(`Provider ${modelId} not found`);
        }
        const prompt = this.buildEvaluationPrompt(response);
        const evalResponse = await this.callProvider(provider, prompt, modelId);
        return this.parseEvaluationResponse(evalResponse);
      })
    );

    // Filter successful evaluations
    const successful = evaluations
      .filter((r): r is PromiseFulfilledResult<ReturnType<typeof this.parseEvaluationResponse>> =>
        r.status === "fulfilled"
      )
      .map((r) => r.value);

    if (successful.length === 0) {
      throw new Error("All evaluation models failed");
    }

    // Aggregate scores (average)
    const aggregatedScores = this.aggregateScores(successful.map((s) => s.scores));

    // Aggregate suggestions (unique)
    const allSuggestions = successful.flatMap((s) => s.suggestions ?? []);
    const uniqueSuggestions = this.deduplicateSuggestions(allSuggestions);

    // Calculate confidence based on agreement
    const confidence = this.calculateConsensusConfidence(successful.map((s) => s.scores));

    const result: EvaluationResult = {
      responseId: response.id,
      scores: {
        ...this.buildScoreCard(aggregatedScores),
        confidence,
      },
      suggestions: this.buildSuggestions(uniqueSuggestions, aggregatedScores),
      evaluatedAt: new Date().toISOString(),
      evaluationModel: `consensus:${modelIds.join(",")}`,
      durationMs: Date.now() - startTime,
    };

    // Conditional assignment for optional property (exactOptionalPropertyTypes)
    if (this.config.includeReasoning) {
      result.reasoning = `Consensus from ${successful.length}/${modelIds.length} models`;
    }

    logger.info("Consensus evaluation complete", {
      responseId: response.id,
      overall: result.scores.overall,
      modelsUsed: successful.length,
      durationMs: result.durationMs,
    });

    return result;
  }

  /**
   * Compare two responses and determine which is better.
   */
  async compareResponses(
    responseA: AgentResponse,
    responseB: AgentResponse
  ): Promise<ComparisonResult> {
    const startTime = Date.now();
    logger.info("Comparing responses", {
      responseA: responseA.id,
      responseB: responseB.id,
    });

    const provider = await this.getProvider();
    const prompt = this.buildComparisonPrompt(responseA, responseB);
    const evalResponse = await this.callProvider(provider, prompt);
    const parsed = this.parseComparisonResponse(evalResponse);

    const scoresA = this.buildScoreCard(parsed.scoresA);
    const scoresB = this.buildScoreCard(parsed.scoresB);

    const comparison: ScoreComparison = {
      winner: parsed.winner,
      overallDiff: scoresA.overall - scoresB.overall,
      dimensionDiffs: {
        correctness: parsed.scoresA.correctness - parsed.scoresB.correctness,
        efficiency: parsed.scoresA.efficiency - parsed.scoresB.efficiency,
        clarity: parsed.scoresA.clarity - parsed.scoresB.clarity,
        safety: parsed.scoresA.safety - parsed.scoresB.safety,
        ceoAlignment: parsed.scoresA.ceoAlignment - parsed.scoresB.ceoAlignment,
      },
      improvementPercent: scoresB.overall > 0
        ? ((scoresA.overall - scoresB.overall) / scoresB.overall) * 100
        : 0,
    };

    const result: ComparisonResult = {
      responseIdA: responseA.id,
      responseIdB: responseB.id,
      comparison,
      recommendation: parsed.winner === "a" ? "use_a" : parsed.winner === "b" ? "use_b" : "either",
      reasoning: parsed.reasoning ?? "",
    };

    logger.info("Comparison complete", {
      responseA: responseA.id,
      responseB: responseB.id,
      winner: result.recommendation,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  // ==========================================================================
  // Rule-Based Evaluation (No AI)
  // ==========================================================================

  /**
   * Quick rule-based evaluation without AI call.
   * Useful for fast initial filtering or when AI is unavailable.
   */
  evaluateQuick(response: AgentResponse): ScoreCard {
    const dimensions: ScoreDimensions = {
      correctness: this.evaluateCorrectnessRuleBased(response),
      efficiency: this.evaluateEfficiencyRuleBased(response),
      clarity: this.evaluateClarityRuleBased(response),
      safety: this.evaluateSafetyRuleBased(response),
      ceoAlignment: 70, // Default to average without CEO profile
    };

    return {
      overall: calculateOverallScore(dimensions, this.config.weights),
      dimensions,
      confidence: 0.5, // Lower confidence for rule-based
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async getProvider(): Promise<AIProvider> {
    if (this.provider) {
      return this.provider;
    }

    // Try to get a configured provider
    if (this.config.evaluationModel) {
      const provider = this.registry.get(this.config.evaluationModel);
      if (provider) {
        this.provider = provider;
        return provider;
      }
    }

    // Fall back to any available provider
    const providers = this.registry.list();
    if (providers.length === 0) {
      throw new Error("No providers available for evaluation");
    }

    // Prefer cheaper/faster models for evaluation
    const preferredOrder = ["github-models", "ollama", "gemini", "openai", "anthropic"];
    for (const preferred of preferredOrder) {
      const provider = providers.find((p) => p.id.includes(preferred));
      if (provider) {
        this.provider = provider;
        return provider;
      }
    }

    // providers[0] is safe - we already checked length > 0 above
    const firstProvider = providers[0];
    if (firstProvider) {
      this.provider = firstProvider;
      return firstProvider;
    }

    throw new Error("No providers available for evaluation");
  }

  private async callProvider(
    provider: AIProvider,
    prompt: string,
    model?: string
  ): Promise<string> {
    const messages: Message[] = [
      { role: "user", content: prompt },
    ];

    const request: ChatRequest = {
      model: model ?? "default",
      messages,
      temperature: 0.1, // Low temperature for consistent evaluation
      maxTokens: 1000,
    };

    const response = await provider.chat(request);
    return response.content;
  }

  private buildEvaluationPrompt(response: AgentResponse): string {
    const contextStr = response.context
      ? JSON.stringify(response.context, null, 2)
      : "No additional context provided";

    return EVALUATION_PROMPT_TEMPLATE
      .replace("{task}", response.task)
      .replace("{response}", response.content)
      .replace("{context}", contextStr);
  }

  private buildComparisonPrompt(
    responseA: AgentResponse,
    responseB: AgentResponse
  ): string {
    return COMPARISON_PROMPT_TEMPLATE
      .replace("{task}", responseA.task)
      .replace("{responseA}", responseA.content)
      .replace("{responseB}", responseB.content);
  }

  private parseEvaluationResponse(content: string): {
    scores: ScoreDimensions;
    confidence: number;
    reasoning?: string;
    suggestions?: Array<{
      type: string;
      reason: string;
      estimatedImprovement: number;
    }>;
  } {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch?.[1] ?? content;

    try {
      const parsed = JSON.parse(jsonStr.trim());

      // Validate scores
      const scores: ScoreDimensions = {
        correctness: this.clampScore(parsed.scores?.correctness ?? 50),
        efficiency: this.clampScore(parsed.scores?.efficiency ?? 50),
        clarity: this.clampScore(parsed.scores?.clarity ?? 50),
        safety: this.clampScore(parsed.scores?.safety ?? 50),
        ceoAlignment: this.clampScore(parsed.scores?.ceoAlignment ?? 50),
      };

      return {
        scores,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
        reasoning: parsed.reasoning,
        suggestions: parsed.suggestions,
      };
    } catch (error) {
      logger.warn("Failed to parse evaluation response, using defaults", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return neutral scores on parse failure
      return {
        scores: {
          correctness: 50,
          efficiency: 50,
          clarity: 50,
          safety: 50,
          ceoAlignment: 50,
        },
        confidence: 0.3,
        reasoning: "Parse error - using default scores",
      };
    }
  }

  private parseComparisonResponse(content: string): {
    scoresA: ScoreDimensions;
    scoresB: ScoreDimensions;
    winner: "a" | "b" | "equal";
    reasoning?: string;
  } {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch?.[1] ?? content;

    try {
      const parsed = JSON.parse(jsonStr.trim());

      return {
        scoresA: {
          correctness: this.clampScore(parsed.scoresA?.correctness ?? 50),
          efficiency: this.clampScore(parsed.scoresA?.efficiency ?? 50),
          clarity: this.clampScore(parsed.scoresA?.clarity ?? 50),
          safety: this.clampScore(parsed.scoresA?.safety ?? 50),
          ceoAlignment: this.clampScore(parsed.scoresA?.ceoAlignment ?? 50),
        },
        scoresB: {
          correctness: this.clampScore(parsed.scoresB?.correctness ?? 50),
          efficiency: this.clampScore(parsed.scoresB?.efficiency ?? 50),
          clarity: this.clampScore(parsed.scoresB?.clarity ?? 50),
          safety: this.clampScore(parsed.scoresB?.safety ?? 50),
          ceoAlignment: this.clampScore(parsed.scoresB?.ceoAlignment ?? 50),
        },
        winner: parsed.winner === "a" || parsed.winner === "b" ? parsed.winner : "equal",
        reasoning: parsed.reasoning,
      };
    } catch {
      return {
        scoresA: { correctness: 50, efficiency: 50, clarity: 50, safety: 50, ceoAlignment: 50 },
        scoresB: { correctness: 50, efficiency: 50, clarity: 50, safety: 50, ceoAlignment: 50 },
        winner: "equal",
        reasoning: "Parse error",
      };
    }
  }

  private buildScoreCard(dimensions: ScoreDimensions): ScoreCard {
    return {
      overall: calculateOverallScore(dimensions, this.config.weights),
      dimensions,
      confidence: 0.8, // Default confidence, may be overridden
    };
  }

  private buildSuggestions(
    rawSuggestions: Array<{ type: string; reason: string; estimatedImprovement: number }>,
    scores: ScoreDimensions
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Add AI-generated suggestions
    for (const raw of rawSuggestions) {
      const type = this.validateSuggestionType(raw.type);
      if (type) {
        suggestions.push({
          type,
          reason: raw.reason,
          confidence: 0.7,
          estimatedImprovement: Math.min(30, Math.max(0, raw.estimatedImprovement)),
        });
      }
    }

    // Add rule-based suggestions for low scores
    const lowDimensions = getDimensionsBelowThreshold(scores, 50);

    for (const dim of lowDimensions) {
      const existing = suggestions.some(
        (s) => s.reason.toLowerCase().includes(dim.toLowerCase())
      );

      if (!existing) {
        suggestions.push(this.getSuggestionForDimension(dim, scores[dim]));
      }
    }

    return suggestions;
  }

  private validateSuggestionType(type: string): OptimizationSuggestion["type"] | null {
    const validTypes = ["retry", "escalate", "simplify", "enhance"] as const;
    return validTypes.includes(type as typeof validTypes[number])
      ? (type as OptimizationSuggestion["type"])
      : null;
  }

  private getSuggestionForDimension(
    dimension: keyof ScoreDimensions,
    score: number
  ): OptimizationSuggestion {
    const suggestions: Record<keyof ScoreDimensions, OptimizationSuggestion> = {
      correctness: {
        type: "retry",
        reason: `Correctness score (${score}) is low - consider adding more context`,
        confidence: 0.8,
        estimatedImprovement: 15,
        strategyName: "retry-with-context",
      },
      efficiency: {
        type: "simplify",
        reason: `Efficiency score (${score}) is low - simplify the prompt`,
        confidence: 0.7,
        estimatedImprovement: 10,
        strategyName: "simplify-prompt",
      },
      clarity: {
        type: "enhance",
        reason: `Clarity score (${score}) is low - add examples`,
        confidence: 0.7,
        estimatedImprovement: 12,
        strategyName: "add-examples",
      },
      safety: {
        type: "enhance",
        reason: `Safety score (${score}) is low - run security review`,
        confidence: 0.9,
        estimatedImprovement: 20,
        strategyName: "security-review",
      },
      ceoAlignment: {
        type: "retry",
        reason: `CEO alignment score (${score}) is low - review preferences`,
        confidence: 0.6,
        estimatedImprovement: 8,
      },
    };

    return suggestions[dimension];
  }

  private aggregateScores(allScores: ScoreDimensions[]): ScoreDimensions {
    const count = allScores.length;
    return {
      correctness: Math.round(allScores.reduce((s, d) => s + d.correctness, 0) / count),
      efficiency: Math.round(allScores.reduce((s, d) => s + d.efficiency, 0) / count),
      clarity: Math.round(allScores.reduce((s, d) => s + d.clarity, 0) / count),
      safety: Math.round(allScores.reduce((s, d) => s + d.safety, 0) / count),
      ceoAlignment: Math.round(allScores.reduce((s, d) => s + d.ceoAlignment, 0) / count),
    };
  }

  private calculateConsensusConfidence(allScores: ScoreDimensions[]): number {
    if (allScores.length <= 1) return 0.8;

    // Calculate standard deviation of overall scores
    const overalls = allScores.map((s) => calculateOverallScore(s, this.config.weights));
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    const variance = overalls.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / overalls.length;
    const stdDev = Math.sqrt(variance);

    // Higher agreement (lower stdDev) = higher confidence
    // stdDev of 0 = confidence 1.0, stdDev of 20+ = confidence 0.5
    return Math.max(0.5, Math.min(1.0, 1.0 - stdDev / 40));
  }

  private deduplicateSuggestions(
    suggestions: Array<{ type: string; reason: string; estimatedImprovement: number }>
  ): Array<{ type: string; reason: string; estimatedImprovement: number }> {
    const seen = new Set<string>();
    return suggestions.filter((s) => {
      const key = `${s.type}:${s.reason.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private clampScore(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  // ==========================================================================
  // Rule-Based Scoring (Fallback)
  // ==========================================================================

  private evaluateCorrectnessRuleBased(response: AgentResponse): number {
    let score = 70; // Start with default

    // Check for error indicators
    const content = response.content.toLowerCase();
    if (content.includes("error") || content.includes("failed")) {
      score -= 20;
    }
    if (content.includes("successfully") || content.includes("completed")) {
      score += 15;
    }

    // Check for code blocks (usually good for code tasks)
    if (content.includes("```")) {
      score += 10;
    }

    return this.clampScore(score);
  }

  private evaluateEfficiencyRuleBased(response: AgentResponse): number {
    const length = response.content.length;
    const tokens = response.tokens?.output ?? length / 4;

    // Penalize very long responses
    if (tokens > 2000) return 40;
    if (tokens > 1500) return 55;
    if (tokens > 1000) return 65;
    if (tokens > 500) return 75;
    return 85;
  }

  private evaluateClarityRuleBased(response: AgentResponse): number {
    let score = 60;

    // Check for structure indicators
    if (response.content.includes("##") || response.content.includes("**")) {
      score += 15;
    }
    if (response.content.includes("```")) {
      score += 10;
    }
    if (response.content.includes("1.") || response.content.includes("-")) {
      score += 10;
    }

    return this.clampScore(score);
  }

  private evaluateSafetyRuleBased(response: AgentResponse): number {
    let score = 80;

    const content = response.content;

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /DROP\s+TABLE/i,
      /eval\(/i,
      /exec\(/i,
      /password\s*[:=]/i,
      /api_key\s*[:=]/i,
      /secret\s*[:=]/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        score -= 20;
      }
    }

    return this.clampScore(score);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an evaluator with default configuration.
 */
export function createEvaluator(
  config?: Partial<EvaluatorConfig>,
  registry?: ProviderRegistry
): Evaluator {
  return new Evaluator(config, registry);
}

/**
 * Create an evaluator configured for a specific model.
 */
export function createEvaluatorWithModel(
  modelId: string,
  registry?: ProviderRegistry
): Evaluator {
  return new Evaluator({ evaluationModel: modelId }, registry);
}
