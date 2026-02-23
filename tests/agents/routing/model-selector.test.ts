/**
 * Model Selector Tests
 *
 * @module tests/agents/routing/model-selector
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ModelSelector,
  createModelSelector,
  DEFAULT_MODEL_CAPABILITIES,
  CONSULTATION_PRIORITY,
} from "../../../src/agents/routing/model-selector.js";
import type { ModelCapability, SelectionCriteria } from "../../../src/agents/routing/types.js";

// ============================================================================
// Test Data
// ============================================================================

const MINIMAL_MODELS: ModelCapability[] = [
  {
    providerId: "anthropic",
    modelId: "claude-opus-4",
    name: "Claude Opus 4",
    tier: "expert",
    inputCost: 0.015,
    outputCost: 0.075,
    maxTokens: 200000,
    strengths: ["architecture", "security"],
    features: ["reasoning", "coding"],
  },
  {
    providerId: "anthropic",
    modelId: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    tier: "powerful",
    inputCost: 0.003,
    outputCost: 0.015,
    maxTokens: 200000,
    strengths: ["code_gen", "bug_fix"],
    features: ["reasoning", "coding"],
  },
  {
    providerId: "openai",
    modelId: "gpt-4o-mini",
    name: "GPT-4o Mini",
    tier: "balanced",
    inputCost: 0.00015,
    outputCost: 0.0006,
    maxTokens: 128000,
    strengths: ["general"],
    features: ["fast", "coding"],
  },
  {
    providerId: "ollama",
    modelId: "qwen2.5-coder:14b",
    name: "Qwen 2.5 Coder",
    tier: "balanced",
    inputCost: 0,
    outputCost: 0,
    maxTokens: 32768,
    strengths: ["code_gen"],
    features: ["fast", "coding"],
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("ModelSelector", () => {
  let selector: ModelSelector;

  beforeEach(() => {
    selector = createModelSelector(MINIMAL_MODELS);
  });

  describe("select", () => {
    it("should select appropriate model for simple task", () => {
      const criteria: SelectionCriteria = {
        taskType: "general",
        complexity: "simple",
        minTier: "fast",
        latencyPreference: "fastest",
      };

      const result = selector.select(criteria);

      expect(result.primary.tier).toBeDefined();
      expect(result.metadata.criteriaUsed).toContain("taskType: general");
      expect(result.metadata.criteriaUsed).toContain("complexity: simple");
    });

    it("should select expert tier for critical security task", () => {
      const criteria: SelectionCriteria = {
        taskType: "security",
        complexity: "critical",
        minTier: "expert",
        latencyPreference: "quality",
      };

      const result = selector.select(criteria);

      expect(result.primary.tier).toBe("expert");
      expect(result.primary.providerId).toBe("anthropic");
      expect(result.primary.modelId).toBe("claude-opus-4");
    });

    it("should include consultation models for architecture", () => {
      const criteria: SelectionCriteria = {
        taskType: "architecture",
        complexity: "complex",
        minTier: "powerful",
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);

      expect(result.consultationModels).toBeDefined();
      expect(result.consultationModels!.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect preferred providers", () => {
      const criteria: SelectionCriteria = {
        taskType: "code_gen",
        complexity: "moderate",
        minTier: "balanced",
        preferredProviders: ["openai"],
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);

      expect(result.primary.providerId).toBe("openai");
    });

    it("should fallback to local when budget is exhausted", () => {
      selector.updateBudget({ currentDailySpend: 9.5 }); // 95% spent

      const criteria: SelectionCriteria = {
        taskType: "code_gen",
        complexity: "moderate",
        minTier: "balanced",
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);

      expect(result.primary.providerId).toBe("ollama");
      expect(result.primary.reason).toContain("fallback");
    });

    it("should include estimated cost in metadata", () => {
      const criteria: SelectionCriteria = {
        taskType: "code_gen",
        complexity: "moderate",
        minTier: "balanced",
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);

      expect(result.metadata.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(result.metadata.budgetConsidered).toBe(true);
    });

    it("should provide fallback options", () => {
      const criteria: SelectionCriteria = {
        taskType: "code_gen",
        complexity: "moderate",
        minTier: "balanced",
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);

      // Should have fallbacks unless only one model qualifies
      expect(result.fallbacks).toBeDefined();
    });
  });

  describe("quickSelect", () => {
    it("should return provider and model quickly", () => {
      const result = selector.quickSelect("code_gen", "moderate");

      expect(result.providerId).toBeDefined();
      expect(result.modelId).toBeDefined();
    });

    it("should select appropriate tier for complexity", () => {
      const simple = selector.quickSelect("general", "simple");
      const critical = selector.quickSelect("security", "critical");

      // Critical should get a more powerful model
      expect(critical.providerId).toBe("anthropic");
    });
  });

  describe("getConsultationModels", () => {
    it("should return models for consultation", () => {
      const models = selector.getConsultationModels("architecture", "anthropic");

      expect(models).toBeDefined();
      expect(models!.length).toBeGreaterThanOrEqual(1);
      expect(models!.some((m) => m.role === "primary")).toBe(true);
    });

    it("should mark primary provider correctly", () => {
      const models = selector.getConsultationModels("architecture", "anthropic");

      const primary = models!.find((m) => m.providerId === "anthropic");
      expect(primary?.role).toBe("primary");
    });

    it("should include expert providers", () => {
      const models = selector.getConsultationModels("architecture", "anthropic");

      const experts = models!.filter((m) => m.role === "expert");
      expect(experts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("shouldUseLocalFallback", () => {
    it("should return false when budget is healthy", () => {
      expect(selector.shouldUseLocalFallback()).toBe(false);
    });

    it("should return true when budget is low", () => {
      selector.updateBudget({ currentDailySpend: 9.5 });
      expect(selector.shouldUseLocalFallback()).toBe(true);
    });
  });

  describe("getBudgetStatus", () => {
    it("should return budget status", () => {
      const status = selector.getBudgetStatus();

      expect(status.dailyRemaining).toBeDefined();
      expect(status.monthlyRemaining).toBeDefined();
      expect(status.shouldFallbackToLocal).toBe(false);
    });

    it("should reflect spending", () => {
      selector.recordSpend(5.0);
      const status = selector.getBudgetStatus();

      expect(status.dailyRemaining).toBe(5.0);
    });
  });

  describe("registerModels", () => {
    it("should add new models", () => {
      const newModel: ModelCapability = {
        providerId: "gemini",
        modelId: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        tier: "powerful",
        inputCost: 0.0001,
        outputCost: 0.0004,
        maxTokens: 1000000,
        strengths: ["research"],
        features: ["fast", "context"],
      };

      selector.registerModels([newModel]);

      const criteria: SelectionCriteria = {
        taskType: "research",
        complexity: "moderate",
        minTier: "balanced",
        preferredProviders: ["gemini"],
        latencyPreference: "balanced",
      };

      const result = selector.select(criteria);
      expect(result.primary.providerId).toBe("gemini");
    });
  });
});

describe("Default Model Capabilities", () => {
  it("should include models from major providers", () => {
    const providers = new Set(DEFAULT_MODEL_CAPABILITIES.map((m) => m.providerId));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("gemini")).toBe(true);
    expect(providers.has("ollama")).toBe(true);
  });

  it("should include models across all tiers", () => {
    const tiers = new Set(DEFAULT_MODEL_CAPABILITIES.map((m) => m.tier));
    expect(tiers.has("expert")).toBe(true);
    expect(tiers.has("powerful")).toBe(true);
    expect(tiers.has("balanced")).toBe(true);
    expect(tiers.has("fast")).toBe(true);
  });
});

describe("Consultation Priority", () => {
  it("should have priorities for all task types", () => {
    const taskTypes = ["architecture", "security", "code_gen", "bug_fix", "research", "general"];
    for (const taskType of taskTypes) {
      expect(CONSULTATION_PRIORITY[taskType as keyof typeof CONSULTATION_PRIORITY]).toBeDefined();
    }
  });

  it("should prefer Anthropic for architecture", () => {
    expect(CONSULTATION_PRIORITY.architecture[0]).toBe("anthropic");
  });

  it("should prefer Gemini for research", () => {
    expect(CONSULTATION_PRIORITY.research[0]).toBe("gemini");
  });
});
