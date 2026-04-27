/**
 * Brain Bridge for Evaluator
 *
 * Connects the Evaluator-Optimizer to Brain Layer 4 (Mental Models).
 * Provides CEO rules for context injection and alignment scoring.
 *
 * @module evaluator/brain-bridge
 */

import {
  getAllModels,
  getModelsByDomain,
  getFormattedRules,
} from '../brain/layers/mental-models.js';
import type { MentalModelEntry } from '../brain/types.js';
import {
  type CeoRule,
  getDefaultCeoRules,
} from './strategies/add-context.js';

// =============================================================================
// Brain to CEO Rule Mapping
// =============================================================================

/**
 * Convert a MentalModelEntry to CeoRule format.
 *
 * @param model - Brain mental model entry
 * @returns CeoRule format for evaluator use
 */
export function mapMentalModelToCeoRule(model: MentalModelEntry): CeoRule {
  // Extract a short name from the rule (first 50 chars or until first period)
  const firstSentence = model.rule.split('.')[0] ?? model.rule;
  const name = firstSentence.length > 50
    ? firstSentence.slice(0, 47) + '...'
    : firstSentence;

  return {
    id: model.id,
    name,
    description: model.rule,
    domain: model.domain,
    // Convert confidence (0-1) to priority (1-10)
    priority: Math.round(model.confidence * 10),
  };
}

/**
 * Get Brain Layer 4 rules as CeoRule format.
 *
 * @param domain - Optional domain filter (e.g., "coding", "typescript")
 * @returns Array of CeoRule from Brain, or default rules if empty
 */
export function getBrainRulesAsCeoRules(domain?: string): CeoRule[] {
  try {
    const models = domain
      ? getModelsByDomain(domain)
      : getAllModels();

    if (models.length === 0) {
      // Fallback to default rules when Brain is empty
      return getDefaultCeoRules();
    }

    return models.map(mapMentalModelToCeoRule);
  } catch {
    // If Brain read fails, use defaults
    return getDefaultCeoRules();
  }
}

/**
 * Check if Brain has rules available.
 *
 * @param domain - Optional domain filter
 * @returns true if Brain has rules (not using fallback)
 */
export function hasBrainRulesAvailable(domain?: string): boolean {
  try {
    const models = domain
      ? getModelsByDomain(domain)
      : getAllModels();

    return models.length > 0;
  } catch {
    return false;
  }
}

// =============================================================================
// CEO Alignment Scoring
// =============================================================================

/**
 * Get formatted rules from Brain for alignment comparison.
 *
 * @param domain - Optional domain filter
 * @returns Formatted rules string for comparison
 */
export function getBrainFormattedRules(domain?: string): string {
  try {
    const formatted = getFormattedRules(domain);
    if (!formatted) {
      // Return default rules as formatted string
      const defaults = getDefaultCeoRules();
      return defaults.map(r => `[${r.domain}] ${r.description}`).join('\n');
    }
    return formatted;
  } catch {
    const defaults = getDefaultCeoRules();
    return defaults.map(r => `[${r.domain}] ${r.description}`).join('\n');
  }
}

/**
 * Count how many Brain rules are potentially violated.
 *
 * Simple heuristic: checks if response contains anti-patterns
 * from the rules (e.g., "any" when rule says "avoid any").
 *
 * @param response - The response content to check
 * @param domain - Optional domain filter
 * @returns Object with total rules and violated count
 */
export function checkRuleViolations(
  response: string,
  domain?: string
): { total: number; violated: number; score: number } {
  const rules = getBrainRulesAsCeoRules(domain);
  const lowerResponse = response.toLowerCase();

  let violated = 0;

  for (const rule of rules) {
    // Check for common anti-patterns based on rule description
    const desc = rule.description.toLowerCase();

    // If rule says "avoid X" or "don't use X" or "never use X", check for X
    const avoidMatch = desc.match(/avoid\s+(?:using\s+)?['"]?(\w+)['"]?/i);
    const dontUseMatch = desc.match(/don't use\s+['"]?(\w+)['"]?/i);
    const neverMatch = desc.match(/never\s+(?:use\s+)?['"]?(\w+)['"]?/i);

    const antiPattern = avoidMatch?.[1] ?? dontUseMatch?.[1] ?? neverMatch?.[1];
    if (antiPattern && lowerResponse.includes(antiPattern.toLowerCase())) {
      violated++;
    }

    // If rule says "use X" or "always X", check for absence
    const useMatch = desc.match(/\buse\s+['"]?(\w+)['"]?/i);
    const alwaysMatch = desc.match(/always\s+(\w+)/i);

    const requiredPattern = useMatch?.[1] ?? alwaysMatch?.[1];
    if (requiredPattern && !lowerResponse.includes(requiredPattern.toLowerCase())) {
      // Only count as violation if it seems relevant to code
      if (response.includes('```') || response.includes('function') || response.includes('const')) {
        violated++;
      }
    }
  }

  const total = rules.length;
  const score = total > 0 ? Math.round(((total - violated) / total) * 100) : 100;

  return { total, violated, score };
}

// =============================================================================
// Feedback Storage (for Day 7 Loop Orchestrator)
// =============================================================================

/**
 * Feedback entry for storing evaluation results.
 */
export interface FeedbackEntry {
  taskId: string;
  timestamp: string;
  prompt: string;
  response: string;
  score: number;
  dimensions: Record<string, number>;
  strategyApplied?: string;
  improved: boolean;
}

// In-memory feedback storage (will be persisted in Day 7)
const feedbackStorage: FeedbackEntry[] = [];

/**
 * Store evaluation feedback for learning.
 *
 * @param entry - Feedback entry to store
 */
export function storeFeedback(entry: FeedbackEntry): void {
  feedbackStorage.push(entry);
  // DEFERRED(Sprint 147): Persist to Brain storage (in-memory only for now)
}

/**
 * Get recent feedback entries.
 *
 * @param limit - Maximum entries to return
 * @returns Recent feedback entries
 */
export function getRecentFeedback(limit: number = 10): FeedbackEntry[] {
  return feedbackStorage.slice(-limit);
}

/**
 * Get feedback for a specific task.
 *
 * @param taskId - Task ID to search for
 * @returns Feedback entries for the task
 */
export function getFeedbackByTask(taskId: string): FeedbackEntry[] {
  return feedbackStorage.filter(f => f.taskId === taskId);
}

/**
 * Calculate average score from recent feedback.
 *
 * @param limit - Number of recent entries to consider
 * @returns Average score or undefined if no feedback
 */
export function getAverageScore(limit: number = 50): number | undefined {
  const recent = feedbackStorage.slice(-limit);
  if (recent.length === 0) return undefined;

  const sum = recent.reduce((acc, f) => acc + f.score, 0);
  return Math.round(sum / recent.length);
}

/**
 * Get improvement rate from feedback.
 *
 * @returns Percentage of responses that improved after optimization
 */
export function getImprovementRate(): number {
  const withStrategy = feedbackStorage.filter(f => f.strategyApplied);
  if (withStrategy.length === 0) return 0;

  const improved = withStrategy.filter(f => f.improved);
  return Math.round((improved.length / withStrategy.length) * 100);
}

/**
 * Clear feedback storage (for tests).
 *
 * @internal
 */
export function clearFeedback(): void {
  feedbackStorage.length = 0;
}
