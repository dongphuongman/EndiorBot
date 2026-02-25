/**
 * Rephrase Strategy
 *
 * Improves clarity by rewriting the response with clearer structure.
 * Triggers when clarity score is below threshold.
 *
 * @module evaluator/strategies/rephrase
 */

import type { OptimizationStrategy } from "../types.js";

/**
 * Rephrase strategy configuration.
 */
export const rephraseStrategy: OptimizationStrategy = {
  name: "rephrase",
  description: "Rewrite response with clearer structure and formatting",
  trigger: {
    dimension: "clarity",
    operator: "<",
    value: 50,
  },
  action: {
    type: "modify",
    params: {
      instruction: "Rewrite the following response with:\n1. Clear section headings\n2. Numbered steps where applicable\n3. Code blocks properly formatted\n4. Concise explanations\n\nOriginal response to improve:",
      systemPrompt: "You are an expert at restructuring technical content for clarity. Preserve all technical accuracy while improving readability and organization.",
    },
  },
  priority: 7, // Medium priority
  maxAttempts: 2,
  cooldownMs: 2000,
  enabled: true,
};

/**
 * Build the rephrase prompt.
 */
export function buildRephrasePrompt(originalContent: string): string {
  return `${rephraseStrategy.action.params.instruction as string}

---
${originalContent}
---

Please provide an improved version with better structure and clarity.`;
}

/**
 * Check if rephrase is applicable.
 */
export function shouldRephrase(clarityScore: number, threshold: number = 50): boolean {
  return clarityScore < threshold;
}
