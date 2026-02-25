/**
 * Decompose Strategy
 *
 * Breaks complex tasks into manageable sub-tasks.
 * Triggers when correctness is low due to task complexity.
 *
 * @module evaluator/strategies/decompose
 */

import type { OptimizationStrategy } from "../types.js";

/**
 * Decompose strategy configuration.
 */
export const decomposeStrategy: OptimizationStrategy = {
  name: "decompose",
  description: "Break complex task into smaller sub-tasks for better accuracy",
  trigger: {
    dimension: "correctness",
    operator: "<",
    value: 60,
  },
  action: {
    type: "retry",
    params: {
      instruction: "The task appears complex. Let's break it down into smaller steps.\n\nApproach:\n1. First, identify the key components needed\n2. Solve each component individually\n3. Combine the solutions\n\nOriginal task:",
      maxSubTasks: 5,
      temperature: 0.3,
    },
  },
  priority: 8, // Higher priority for correctness
  maxAttempts: 2,
  cooldownMs: 3000,
  enabled: true,
};

/**
 * Build the decomposition prompt.
 */
export function buildDecomposePrompt(originalTask: string): string {
  return `${decomposeStrategy.action.params.instruction as string}

---
${originalTask}
---

Please solve this step by step:
1. First, list the sub-problems
2. Then solve each one
3. Finally, combine into a complete solution`;
}

/**
 * Detect if a task is complex (heuristic).
 */
export function detectComplexTask(task: string): boolean {
  const complexIndicators = [
    /multiple/i,
    /several/i,
    /complex/i,
    /implement.*and/i,
    /create.*with/i,
    /\d+\s+steps?/i,
    /first.*then.*finally/i,
  ];

  // Long tasks are often complex
  if (task.length > 500) return true;

  // Check for complexity indicators
  return complexIndicators.some((pattern) => pattern.test(task));
}

/**
 * Check if decomposition is applicable.
 */
export function shouldDecompose(
  correctnessScore: number,
  taskComplexity: boolean,
  threshold: number = 60
): boolean {
  return correctnessScore < threshold && taskComplexity;
}
