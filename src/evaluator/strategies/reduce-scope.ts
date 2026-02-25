/**
 * Reduce Scope Strategy
 *
 * Trims response and focuses on essentials for better efficiency.
 * Triggers when efficiency score is below threshold.
 *
 * @module evaluator/strategies/reduce-scope
 */

import type { OptimizationStrategy } from "../types.js";

/**
 * Reduce scope strategy configuration.
 */
export const reduceScopeStrategy: OptimizationStrategy = {
  name: "reduce-scope",
  description: "Trim response and focus on essentials for better efficiency",
  trigger: {
    dimension: "efficiency",
    operator: "<",
    value: 40,
  },
  action: {
    type: "modify",
    params: {
      instruction: "Provide a more concise response that focuses only on the essential information.",
      maxTokens: 1000, // Limit output
      constraints: [
        "Keep explanations brief",
        "Remove redundant information",
        "Focus on the core answer",
        "Omit verbose examples unless critical",
      ],
      systemPrompt: "You are an expert at providing concise, focused responses. Be direct and avoid unnecessary verbosity.",
    },
  },
  priority: 5, // Lower priority
  maxAttempts: 2,
  cooldownMs: 2000,
  enabled: true,
};

/**
 * Build the reduce scope prompt.
 */
export function buildReduceScopePrompt(originalTask: string): string {
  const constraints = reduceScopeStrategy.action.params.constraints as string[];

  return `Please provide a concise answer to the following task.

Constraints:
${constraints.map((c) => `- ${c}`).join("\n")}

Task: ${originalTask}

Keep your response focused and efficient.`;
}

/**
 * Estimate if response is too verbose.
 */
export function isResponseVerbose(
  content: string,
  tokenEstimate?: number
): boolean {
  // Estimate tokens if not provided (rough: 4 chars per token)
  const tokens = tokenEstimate ?? Math.ceil(content.length / 4);

  // Check for verbosity indicators
  const verbosityIndicators = [
    tokens > 1500, // Too many tokens
    content.split("\n").length > 50, // Too many lines
    (content.match(/```/g)?.length ?? 0) > 6, // Too many code blocks
    content.length > 6000, // Too long
  ];

  return verbosityIndicators.filter(Boolean).length >= 2;
}

/**
 * Check if scope reduction is applicable.
 */
export function shouldReduceScope(
  efficiencyScore: number,
  responseLength: number,
  threshold: number = 40
): boolean {
  return efficiencyScore < threshold && responseLength > 2000;
}

/**
 * Suggest scope reduction level based on current efficiency.
 */
export function getScopeReductionLevel(
  efficiencyScore: number
): "light" | "moderate" | "aggressive" {
  if (efficiencyScore >= 30) return "light";
  if (efficiencyScore >= 15) return "moderate";
  return "aggressive";
}

/**
 * Get max tokens based on reduction level.
 */
export function getMaxTokensForLevel(level: "light" | "moderate" | "aggressive"): number {
  const limits: Record<string, number> = {
    light: 1500,
    moderate: 1000,
    aggressive: 500,
  };
  return limits[level] ?? 1000;
}
