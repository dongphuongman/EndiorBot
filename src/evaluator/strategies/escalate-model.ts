/**
 * Escalate Model Strategy
 *
 * Moves to a higher-tier model when current model can't achieve quality threshold.
 * Triggers when overall score is low after retry attempts.
 *
 * @module evaluator/strategies/escalate-model
 */

import type { OptimizationStrategy } from "../types.js";

/**
 * Model hierarchy from free to paid.
 * Matches Sprint 44 ResourceRouter priority.
 */
export const MODEL_HIERARCHY = [
  "ollama",        // Free, local
  "github-models", // Free, rate-limited
  "gemini",        // Free tier available
  "openai",        // Paid
  "anthropic",     // Paid, highest quality
] as const;

/**
 * Escalate model strategy configuration.
 */
export const escalateModelStrategy: OptimizationStrategy = {
  name: "escalate-model",
  description: "Use a higher-tier model for improved quality",
  trigger: {
    dimension: "overall",
    operator: "<",
    value: 50,
  },
  action: {
    type: "escalate",
    params: {
      modelHierarchy: MODEL_HIERARCHY,
      preferredTarget: "anthropic", // Best quality
      fallbackTarget: "openai",
      preserveContext: true,
    },
  },
  priority: 10, // Highest priority when score is very low
  maxAttempts: 1, // Only escalate once
  cooldownMs: 5000,
  enabled: true,
};

/**
 * Get the next tier model from hierarchy.
 */
export function getNextTierModel(
  currentModel: string,
  hierarchy: readonly string[] = MODEL_HIERARCHY
): string | null {
  // Find current model's position in hierarchy
  const currentIndex = hierarchy.findIndex((h) =>
    currentModel.toLowerCase().includes(h.toLowerCase())
  );

  // If not found or already at highest tier, return null
  if (currentIndex === -1 || currentIndex >= hierarchy.length - 1) {
    return null;
  }

  // Return next tier
  return hierarchy[currentIndex + 1] ?? null;
}

/**
 * Get model tier level (0 = lowest, higher = better).
 */
export function getModelTier(
  model: string,
  hierarchy: readonly string[] = MODEL_HIERARCHY
): number {
  const index = hierarchy.findIndex((h) =>
    model.toLowerCase().includes(h.toLowerCase())
  );
  return index >= 0 ? index : 0;
}

/**
 * Check if escalation is worthwhile.
 */
export function shouldEscalate(
  overallScore: number,
  currentModel: string,
  attemptNumber: number,
  threshold: number = 50
): boolean {
  // Only escalate if score is low
  if (overallScore >= threshold) return false;

  // Check if there's a higher tier available
  const nextTier = getNextTierModel(currentModel);
  if (!nextTier) return false;

  // Only escalate after at least one retry
  return attemptNumber >= 1;
}

/**
 * Get recommended target model based on task type.
 */
export function getRecommendedModel(
  taskType: "code" | "analysis" | "creative" | "general" = "general"
): string {
  const recommendations: Record<string, string> = {
    code: "anthropic",      // Best at code
    analysis: "openai",     // Good at analysis
    creative: "anthropic",  // Good at creative
    general: "openai",      // Balanced
  };
  return recommendations[taskType] ?? "openai";
}
