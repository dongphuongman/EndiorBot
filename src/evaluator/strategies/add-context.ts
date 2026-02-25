/**
 * Add Context Strategy
 *
 * Injects CEO rules and preferences from Brain Layer 4 into the prompt.
 * Triggers when CEO alignment score is below threshold.
 *
 * Wired to Brain Layer 4 (Mental Models) via brain-bridge.
 *
 * @module evaluator/strategies/add-context
 */

import type { OptimizationStrategy } from "../types.js";
import {
  getAllModels,
  getModelsByDomain,
} from "../../brain/layers/mental-models.js";
import type { MentalModelEntry } from "../../brain/types.js";

/**
 * Add context strategy configuration.
 */
export const addContextStrategy: OptimizationStrategy = {
  name: "add-context",
  description: "Inject CEO rules and preferences from Brain Layer 4 for better alignment",
  trigger: {
    dimension: "ceoAlignment",
    operator: "<",
    value: 50,
  },
  action: {
    type: "enhance",
    params: {
      injectBrainRules: true,
      brainLayer: 4, // Mental Models layer
      ruleDomain: "coding", // Default domain
      systemPromptPrefix: "IMPORTANT - CEO Preferences:\n",
    },
  },
  priority: 6, // Medium-low priority
  maxAttempts: 2,
  cooldownMs: 2000,
  enabled: true,
};

/**
 * Format CEO rules for injection into system prompt.
 * This will be wired to Brain Layer 4 getFormattedRules() in Day 6.
 */
export function formatCeoRules(rules: CeoRule[]): string {
  if (rules.length === 0) {
    return "";
  }

  const sections = [
    "## CEO Preferences & Rules",
    "",
    "Follow these guidelines when generating responses:",
    "",
  ];

  for (const rule of rules) {
    sections.push(`- **${rule.name}**: ${rule.description}`);
    if (rule.example) {
      sections.push(`  Example: ${rule.example}`);
    }
  }

  return sections.join("\n");
}

/**
 * CEO rule interface (matches Brain Layer 4 mental model structure).
 */
export interface CeoRule {
  id: string;
  name: string;
  description: string;
  domain?: string;
  example?: string;
  priority?: number;
}

/**
 * Build enhanced prompt with CEO context.
 */
export function buildContextEnhancedPrompt(
  originalTask: string,
  ceoRules: CeoRule[]
): string {
  const rulesSection = formatCeoRules(ceoRules);

  if (!rulesSection) {
    return originalTask;
  }

  return `${rulesSection}

---

Task: ${originalTask}`;
}

/**
 * Check if context enhancement is applicable.
 */
export function shouldAddContext(
  ceoAlignmentScore: number,
  hasRulesAvailable: boolean,
  threshold: number = 50
): boolean {
  return ceoAlignmentScore < threshold && hasRulesAvailable;
}

/**
 * Get default CEO rules for common coding preferences.
 * These are fallback rules when Brain Layer 4 is not available.
 */
export function getDefaultCeoRules(): CeoRule[] {
  return [
    {
      id: "typing",
      name: "Use TypeScript",
      description: "Always use TypeScript with explicit types, avoid 'any'",
      domain: "coding",
      example: "function add(a: number, b: number): number",
    },
    {
      id: "const",
      name: "Prefer const",
      description: "Use 'const' for variables that won't be reassigned",
      domain: "coding",
    },
    {
      id: "error-handling",
      name: "Proper Error Handling",
      description: "Handle errors explicitly, don't swallow exceptions",
      domain: "coding",
      example: "try { ... } catch (error) { logger.error(error); throw error; }",
    },
    {
      id: "logging",
      name: "Use Structured Logging",
      description: "Use createLogger() for logging, include context",
      domain: "coding",
    },
    {
      id: "jsdoc",
      name: "Document Public APIs",
      description: "Add JSDoc comments to exported functions and classes",
      domain: "coding",
    },
  ];
}

// =============================================================================
// Brain Layer 4 Integration (Day 6)
// =============================================================================

/**
 * Convert a MentalModelEntry to CeoRule format.
 *
 * @param model - Brain mental model entry
 * @returns CeoRule format
 */
function mapMentalModelToCeoRule(model: MentalModelEntry): CeoRule {
  const firstSentence = model.rule.split(".")[0] ?? model.rule;
  const name =
    firstSentence.length > 50 ? firstSentence.slice(0, 47) + "..." : firstSentence;

  return {
    id: model.id,
    name,
    description: model.rule,
    domain: model.domain,
    priority: Math.round(model.confidence * 10),
  };
}

/**
 * Get CEO rules from Brain Layer 4, with fallback to defaults.
 *
 * This is the main entry point for the add-context strategy.
 * Uses Brain mental models when available, otherwise returns default rules.
 *
 * @param domain - Optional domain filter (e.g., "coding", "typescript")
 * @returns Array of CeoRule from Brain or defaults
 */
export function getCeoRulesFromBrain(domain?: string): CeoRule[] {
  try {
    const models = domain ? getModelsByDomain(domain) : getAllModels();

    if (models.length === 0) {
      // Brain is empty, use defaults
      return getDefaultCeoRules();
    }

    return models.map(mapMentalModelToCeoRule);
  } catch {
    // Brain read failed, use defaults
    return getDefaultCeoRules();
  }
}

/**
 * Check if Brain Layer 4 has rules available.
 *
 * @param domain - Optional domain filter
 * @returns true if Brain has rules (not using fallback)
 */
export function hasBrainRules(domain?: string): boolean {
  try {
    const models = domain ? getModelsByDomain(domain) : getAllModels();
    return models.length > 0;
  } catch {
    return false;
  }
}

/**
 * Apply the add-context strategy to enhance a prompt.
 *
 * This function is called by the Optimizer when applying the strategy.
 *
 * @param originalPrompt - The original prompt to enhance
 * @param domain - Optional domain for filtering rules
 * @returns Enhanced prompt with CEO rules injected
 */
export function applyAddContextStrategy(
  originalPrompt: string,
  domain?: string
): string {
  const rules = getCeoRulesFromBrain(domain);
  return buildContextEnhancedPrompt(originalPrompt, rules);
}
