/**
 * Tests for Optimization Strategies
 *
 * @module tests/evaluator/strategies
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BUILTIN_STRATEGIES,
  STRATEGY_NAMES,
  getStrategy,
  getApplicableStrategies,
} from "../../../src/evaluator/strategies/index.js";
import {
  rephraseStrategy,
  buildRephrasePrompt,
  shouldRephrase,
} from "../../../src/evaluator/strategies/rephrase.js";
import {
  decomposeStrategy,
  buildDecomposePrompt,
  detectComplexTask,
  shouldDecompose,
} from "../../../src/evaluator/strategies/decompose.js";
import {
  escalateModelStrategy,
  MODEL_HIERARCHY,
  getNextTierModel,
  getModelTier,
  shouldEscalate,
  getRecommendedModel,
} from "../../../src/evaluator/strategies/escalate-model.js";
import {
  addContextStrategy,
  formatCeoRules,
  buildContextEnhancedPrompt,
  shouldAddContext,
  getDefaultCeoRules,
  getCeoRulesFromBrain,
  hasBrainRules,
  applyAddContextStrategy,
  type CeoRule,
} from "../../../src/evaluator/strategies/add-context.js";
import * as mentalModels from "../../../src/brain/layers/mental-models.js";
import type { MentalModelEntry } from "../../../src/brain/types.js";
import {
  reduceScopeStrategy,
  buildReduceScopePrompt,
  isResponseVerbose,
  shouldReduceScope,
  getScopeReductionLevel,
  getMaxTokensForLevel,
} from "../../../src/evaluator/strategies/reduce-scope.js";

// ============================================================================
// Strategy Index Tests
// ============================================================================

describe("Strategy Index", () => {
  describe("BUILTIN_STRATEGIES", () => {
    it("should contain 5 strategies", () => {
      expect(BUILTIN_STRATEGIES).toHaveLength(5);
    });

    it("should have all required strategy names", () => {
      const names = BUILTIN_STRATEGIES.map((s) => s.name);
      expect(names).toContain("rephrase");
      expect(names).toContain("decompose");
      expect(names).toContain("escalate-model");
      expect(names).toContain("add-context");
      expect(names).toContain("reduce-scope");
    });

    it("should have all strategies enabled by default", () => {
      expect(BUILTIN_STRATEGIES.every((s) => s.enabled)).toBe(true);
    });
  });

  describe("STRATEGY_NAMES", () => {
    it("should have all strategy name constants", () => {
      expect(STRATEGY_NAMES.REPHRASE).toBe("rephrase");
      expect(STRATEGY_NAMES.DECOMPOSE).toBe("decompose");
      expect(STRATEGY_NAMES.ESCALATE_MODEL).toBe("escalate-model");
      expect(STRATEGY_NAMES.ADD_CONTEXT).toBe("add-context");
      expect(STRATEGY_NAMES.REDUCE_SCOPE).toBe("reduce-scope");
    });
  });

  describe("getStrategy", () => {
    it("should return strategy by name", () => {
      const strategy = getStrategy("rephrase");
      expect(strategy).toBeDefined();
      expect(strategy?.name).toBe("rephrase");
    });

    it("should return undefined for unknown strategy", () => {
      const strategy = getStrategy("unknown");
      expect(strategy).toBeUndefined();
    });
  });

  describe("getApplicableStrategies", () => {
    it("should return rephrase for low clarity", () => {
      const strategies = getApplicableStrategies(60, { clarity: 40 });
      expect(strategies.some((s) => s.name === "rephrase")).toBe(true);
    });

    it("should return decompose for low correctness", () => {
      const strategies = getApplicableStrategies(60, { correctness: 50 });
      expect(strategies.some((s) => s.name === "decompose")).toBe(true);
    });

    it("should return escalate-model for low overall", () => {
      const strategies = getApplicableStrategies(40, { correctness: 80, clarity: 80 });
      expect(strategies.some((s) => s.name === "escalate-model")).toBe(true);
    });

    it("should return add-context for low ceoAlignment", () => {
      const strategies = getApplicableStrategies(60, { ceoAlignment: 40 });
      expect(strategies.some((s) => s.name === "add-context")).toBe(true);
    });

    it("should return reduce-scope for low efficiency", () => {
      const strategies = getApplicableStrategies(60, { efficiency: 30 });
      expect(strategies.some((s) => s.name === "reduce-scope")).toBe(true);
    });

    it("should sort by priority", () => {
      const strategies = getApplicableStrategies(30, {
        clarity: 30,
        correctness: 30,
        efficiency: 30,
        ceoAlignment: 30,
      });

      // Should be sorted by priority descending
      for (let i = 0; i < strategies.length - 1; i++) {
        expect(strategies[i].priority).toBeGreaterThanOrEqual(strategies[i + 1].priority);
      }
    });
  });
});

// ============================================================================
// Rephrase Strategy Tests
// ============================================================================

describe("Rephrase Strategy", () => {
  describe("Configuration", () => {
    it("should have correct trigger", () => {
      expect(rephraseStrategy.trigger.dimension).toBe("clarity");
      expect(rephraseStrategy.trigger.operator).toBe("<");
      expect(rephraseStrategy.trigger.value).toBe(50);
    });

    it("should have modify action type", () => {
      expect(rephraseStrategy.action.type).toBe("modify");
    });
  });

  describe("buildRephrasePrompt", () => {
    it("should include instruction and original content", () => {
      const prompt = buildRephrasePrompt("Original response here");
      expect(prompt).toContain("Clear section headings");
      expect(prompt).toContain("Original response here");
    });
  });

  describe("shouldRephrase", () => {
    it("should return true when below threshold", () => {
      expect(shouldRephrase(40)).toBe(true);
      expect(shouldRephrase(49)).toBe(true);
    });

    it("should return false when at or above threshold", () => {
      expect(shouldRephrase(50)).toBe(false);
      expect(shouldRephrase(80)).toBe(false);
    });
  });
});

// ============================================================================
// Decompose Strategy Tests
// ============================================================================

describe("Decompose Strategy", () => {
  describe("Configuration", () => {
    it("should have correct trigger", () => {
      expect(decomposeStrategy.trigger.dimension).toBe("correctness");
      expect(decomposeStrategy.trigger.operator).toBe("<");
      expect(decomposeStrategy.trigger.value).toBe(60);
    });

    it("should have retry action type", () => {
      expect(decomposeStrategy.action.type).toBe("retry");
    });
  });

  describe("buildDecomposePrompt", () => {
    it("should include decomposition instruction", () => {
      const prompt = buildDecomposePrompt("Implement a complex feature");
      expect(prompt).toContain("break it down");
      expect(prompt).toContain("Implement a complex feature");
      expect(prompt).toContain("step by step");
    });
  });

  describe("detectComplexTask", () => {
    it("should detect complex tasks", () => {
      expect(detectComplexTask("Implement multiple features and tests")).toBe(true);
      expect(detectComplexTask("Create a feature with validation and storage")).toBe(true);
      expect(detectComplexTask("A".repeat(600))).toBe(true); // Long task
    });

    it("should not flag simple tasks", () => {
      expect(detectComplexTask("Fix the typo")).toBe(false);
      expect(detectComplexTask("Add a button")).toBe(false);
    });
  });

  describe("shouldDecompose", () => {
    it("should return true for low correctness + complex task", () => {
      expect(shouldDecompose(50, true)).toBe(true);
    });

    it("should return false for high correctness", () => {
      expect(shouldDecompose(80, true)).toBe(false);
    });

    it("should return false for simple task", () => {
      expect(shouldDecompose(50, false)).toBe(false);
    });
  });
});

// ============================================================================
// Escalate Model Strategy Tests
// ============================================================================

describe("Escalate Model Strategy", () => {
  describe("Configuration", () => {
    it("should have correct trigger", () => {
      expect(escalateModelStrategy.trigger.dimension).toBe("overall");
      expect(escalateModelStrategy.trigger.operator).toBe("<");
      expect(escalateModelStrategy.trigger.value).toBe(50);
    });

    it("should have escalate action type", () => {
      expect(escalateModelStrategy.action.type).toBe("escalate");
    });

    it("should only allow 1 attempt", () => {
      expect(escalateModelStrategy.maxAttempts).toBe(1);
    });
  });

  describe("MODEL_HIERARCHY", () => {
    it("should have correct order (free to paid)", () => {
      expect(MODEL_HIERARCHY[0]).toBe("ollama"); // Free
      expect(MODEL_HIERARCHY[MODEL_HIERARCHY.length - 1]).toBe("anthropic"); // Paid
    });

    it("should contain 5 providers", () => {
      expect(MODEL_HIERARCHY).toHaveLength(5);
    });
  });

  describe("getNextTierModel", () => {
    it("should return next tier", () => {
      expect(getNextTierModel("ollama")).toBe("github-models");
      expect(getNextTierModel("github-models")).toBe("gemini");
      expect(getNextTierModel("openai")).toBe("anthropic");
    });

    it("should return null for highest tier", () => {
      expect(getNextTierModel("anthropic")).toBeNull();
    });

    it("should return null for unknown model", () => {
      expect(getNextTierModel("unknown-model")).toBeNull();
    });
  });

  describe("getModelTier", () => {
    it("should return correct tier level", () => {
      expect(getModelTier("ollama")).toBe(0);
      expect(getModelTier("github-models")).toBe(1);
      expect(getModelTier("anthropic")).toBe(4);
    });
  });

  describe("shouldEscalate", () => {
    it("should return true for low score + retry attempted", () => {
      expect(shouldEscalate(40, "ollama", 1)).toBe(true);
    });

    it("should return false for high score", () => {
      expect(shouldEscalate(80, "ollama", 1)).toBe(false);
    });

    it("should return false for first attempt", () => {
      expect(shouldEscalate(40, "ollama", 0)).toBe(false);
    });

    it("should return false for highest tier model", () => {
      expect(shouldEscalate(40, "anthropic", 1)).toBe(false);
    });
  });

  describe("getRecommendedModel", () => {
    it("should recommend anthropic for code", () => {
      expect(getRecommendedModel("code")).toBe("anthropic");
    });

    it("should recommend openai for analysis", () => {
      expect(getRecommendedModel("analysis")).toBe("openai");
    });
  });
});

// ============================================================================
// Add Context Strategy Tests
// ============================================================================

describe("Add Context Strategy", () => {
  describe("Configuration", () => {
    it("should have correct trigger", () => {
      expect(addContextStrategy.trigger.dimension).toBe("ceoAlignment");
      expect(addContextStrategy.trigger.operator).toBe("<");
      expect(addContextStrategy.trigger.value).toBe(50);
    });

    it("should have enhance action type", () => {
      expect(addContextStrategy.action.type).toBe("enhance");
    });

    it("should target Brain Layer 4", () => {
      expect(addContextStrategy.action.params.brainLayer).toBe(4);
    });
  });

  describe("formatCeoRules", () => {
    it("should format rules into markdown", () => {
      const rules: CeoRule[] = [
        { id: "1", name: "Rule 1", description: "Description 1" },
        { id: "2", name: "Rule 2", description: "Description 2", example: "Example" },
      ];
      const formatted = formatCeoRules(rules);

      expect(formatted).toContain("CEO Preferences");
      expect(formatted).toContain("**Rule 1**");
      expect(formatted).toContain("Description 1");
      expect(formatted).toContain("Example: Example");
    });

    it("should return empty string for no rules", () => {
      expect(formatCeoRules([])).toBe("");
    });
  });

  describe("buildContextEnhancedPrompt", () => {
    it("should combine rules and task", () => {
      const rules: CeoRule[] = [
        { id: "1", name: "Use TypeScript", description: "Always use TS" },
      ];
      const prompt = buildContextEnhancedPrompt("Write a function", rules);

      expect(prompt).toContain("Use TypeScript");
      expect(prompt).toContain("Write a function");
    });

    it("should return original task if no rules", () => {
      const prompt = buildContextEnhancedPrompt("Write a function", []);
      expect(prompt).toBe("Write a function");
    });
  });

  describe("shouldAddContext", () => {
    it("should return true when low alignment and rules available", () => {
      expect(shouldAddContext(40, true)).toBe(true);
    });

    it("should return false when high alignment", () => {
      expect(shouldAddContext(80, true)).toBe(false);
    });

    it("should return false when no rules available", () => {
      expect(shouldAddContext(40, false)).toBe(false);
    });
  });

  describe("getDefaultCeoRules", () => {
    it("should return default coding rules", () => {
      const rules = getDefaultCeoRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.name.includes("TypeScript"))).toBe(true);
    });
  });

  // ============================================================================
  // Brain Layer 4 Integration Tests (Day 6)
  // ============================================================================

  describe("getCeoRulesFromBrain", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return Brain rules when available", () => {
      const brainRules: MentalModelEntry[] = [
        {
          id: "brain-1",
          domain: "coding",
          rule: "Use TypeScript strict mode.",
          source: "ceo_import",
          confidence: 0.9,
          updatedAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "brain-2",
          domain: "coding",
          rule: "Never use any type.",
          source: "manual",
          confidence: 0.85,
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ];

      vi.spyOn(mentalModels, "getAllModels").mockReturnValue(brainRules);

      const rules = getCeoRulesFromBrain();

      expect(rules).toHaveLength(2);
      expect(rules[0]?.id).toBe("brain-1");
      expect(rules[0]?.name).toBe("Use TypeScript strict mode");
      expect(rules[0]?.priority).toBe(9); // 0.9 * 10
    });

    it("should return defaults when Brain is empty", () => {
      vi.spyOn(mentalModels, "getAllModels").mockReturnValue([]);

      const rules = getCeoRulesFromBrain();
      const defaults = getDefaultCeoRules();

      expect(rules.length).toBe(defaults.length);
      expect(rules[0]?.id).toBe(defaults[0]?.id);
    });

    it("should filter by domain", () => {
      const tsRules: MentalModelEntry[] = [
        {
          id: "ts-1",
          domain: "typescript",
          rule: "TypeScript specific rule.",
          source: "manual",
          confidence: 0.8,
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ];

      vi.spyOn(mentalModels, "getModelsByDomain").mockReturnValue(tsRules);

      const rules = getCeoRulesFromBrain("typescript");

      expect(rules).toHaveLength(1);
      expect(rules[0]?.domain).toBe("typescript");
    });

    it("should fallback to defaults on Brain error", () => {
      vi.spyOn(mentalModels, "getAllModels").mockImplementation(() => {
        throw new Error("Brain read error");
      });

      const rules = getCeoRulesFromBrain();
      const defaults = getDefaultCeoRules();

      expect(rules.length).toBe(defaults.length);
    });
  });

  describe("hasBrainRules", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true when Brain has rules", () => {
      vi.spyOn(mentalModels, "getAllModels").mockReturnValue([
        {
          id: "rule-1",
          domain: "coding",
          rule: "Test rule",
          source: "manual",
          confidence: 0.8,
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ]);

      expect(hasBrainRules()).toBe(true);
    });

    it("should return false when Brain is empty", () => {
      vi.spyOn(mentalModels, "getAllModels").mockReturnValue([]);

      expect(hasBrainRules()).toBe(false);
    });

    it("should return false on error", () => {
      vi.spyOn(mentalModels, "getAllModels").mockImplementation(() => {
        throw new Error("Brain error");
      });

      expect(hasBrainRules()).toBe(false);
    });
  });

  describe("applyAddContextStrategy", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should enhance prompt with Brain rules", () => {
      vi.spyOn(mentalModels, "getAllModels").mockReturnValue([
        {
          id: "rule-1",
          domain: "coding",
          rule: "Always use TypeScript.",
          source: "ceo_import",
          confidence: 0.9,
          updatedAt: "2025-01-01T00:00:00Z",
        },
      ]);

      const enhanced = applyAddContextStrategy("Write a function");

      expect(enhanced).toContain("CEO Preferences");
      expect(enhanced).toContain("Always use TypeScript");
      expect(enhanced).toContain("Write a function");
    });

    it("should use defaults when Brain empty", () => {
      vi.spyOn(mentalModels, "getAllModels").mockReturnValue([]);

      const enhanced = applyAddContextStrategy("Write a function");
      const defaults = getDefaultCeoRules();

      expect(enhanced).toContain("CEO Preferences");
      expect(enhanced).toContain(defaults[0]?.name);
    });
  });
});

// ============================================================================
// Reduce Scope Strategy Tests
// ============================================================================

describe("Reduce Scope Strategy", () => {
  describe("Configuration", () => {
    it("should have correct trigger", () => {
      expect(reduceScopeStrategy.trigger.dimension).toBe("efficiency");
      expect(reduceScopeStrategy.trigger.operator).toBe("<");
      expect(reduceScopeStrategy.trigger.value).toBe(40);
    });

    it("should have modify action type", () => {
      expect(reduceScopeStrategy.action.type).toBe("modify");
    });

    it("should limit max tokens", () => {
      expect(reduceScopeStrategy.action.params.maxTokens).toBe(1000);
    });
  });

  describe("buildReduceScopePrompt", () => {
    it("should include conciseness constraints", () => {
      const prompt = buildReduceScopePrompt("Write documentation");

      expect(prompt).toContain("concise");
      expect(prompt).toContain("Keep explanations brief");
      expect(prompt).toContain("Write documentation");
    });
  });

  describe("isResponseVerbose", () => {
    it("should detect verbose responses", () => {
      const verbose = "A".repeat(7000);
      expect(isResponseVerbose(verbose)).toBe(true);
    });

    it("should not flag concise responses", () => {
      const concise = "Short response";
      expect(isResponseVerbose(concise)).toBe(false);
    });

    it("should check token count with other indicators", () => {
      // Need 2+ indicators to be considered verbose
      // Long content + high token count
      const longContent = "A".repeat(7000); // > 6000 chars
      expect(isResponseVerbose(longContent, 2000)).toBe(true);
    });
  });

  describe("shouldReduceScope", () => {
    it("should return true for low efficiency + long response", () => {
      expect(shouldReduceScope(30, 5000)).toBe(true);
    });

    it("should return false for high efficiency", () => {
      expect(shouldReduceScope(80, 5000)).toBe(false);
    });

    it("should return false for short response", () => {
      expect(shouldReduceScope(30, 500)).toBe(false);
    });
  });

  describe("getScopeReductionLevel", () => {
    it("should return light for moderate efficiency", () => {
      expect(getScopeReductionLevel(35)).toBe("light");
    });

    it("should return moderate for low efficiency", () => {
      expect(getScopeReductionLevel(20)).toBe("moderate");
    });

    it("should return aggressive for very low efficiency", () => {
      expect(getScopeReductionLevel(10)).toBe("aggressive");
    });
  });

  describe("getMaxTokensForLevel", () => {
    it("should return correct limits", () => {
      expect(getMaxTokensForLevel("light")).toBe(1500);
      expect(getMaxTokensForLevel("moderate")).toBe(1000);
      expect(getMaxTokensForLevel("aggressive")).toBe(500);
    });
  });
});
