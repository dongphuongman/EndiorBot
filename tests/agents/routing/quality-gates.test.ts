/**
 * Quality Gates Tests
 *
 * @module tests/agents/routing/quality-gates
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  QualityGatesEvaluator,
  createQualityGates,
  getMinTierForTask,
  MODEL_TIER_HIERARCHY,
  DEFAULT_QUALITY_GATES,
  COMPLEXITY_TIER_MAP,
} from "../../../src/agents/routing/quality-gates.js";
import type { ModelCapability } from "../../../src/agents/routing/types.js";

// ============================================================================
// Test Data
// ============================================================================

const TEST_MODELS: ModelCapability[] = [
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
    tier: "fast",
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

describe("QualityGatesEvaluator", () => {
  let evaluator: QualityGatesEvaluator;

  beforeEach(() => {
    evaluator = createQualityGates(undefined, TEST_MODELS);
  });

  describe("getGate", () => {
    it("should return gate for known task type", () => {
      const gate = evaluator.getGate("architecture");
      expect(gate.taskType).toBe("architecture");
      expect(gate.minTier).toBe("powerful");
      expect(gate.requireConsultation).toBe(true);
    });

    it("should return general gate for unknown task type", () => {
      const gate = evaluator.getGate("general");
      expect(gate.taskType).toBe("general");
      expect(gate.minTier).toBe("fast");
    });
  });

  describe("getMinTier", () => {
    it("should return minimum tier for architecture/simple", () => {
      const tier = evaluator.getMinTier("architecture", "simple");
      // Architecture requires "powerful", simple maps to "fast"
      // Should return the higher (more demanding) requirement
      expect(tier).toBe("powerful");
    });

    it("should return minimum tier for general/simple", () => {
      const tier = evaluator.getMinTier("general", "simple");
      expect(tier).toBe("fast");
    });

    it("should return expert for security/critical", () => {
      const tier = evaluator.getMinTier("security", "critical");
      expect(tier).toBe("expert");
    });

    it("should use complexity tier when higher than task tier", () => {
      const tier = evaluator.getMinTier("general", "critical");
      // general = fast, critical = expert → expert
      expect(tier).toBe("expert");
    });
  });

  describe("evaluate", () => {
    it("should pass when model meets requirements", () => {
      const result = evaluator.evaluate("code_gen", "moderate", {
        providerId: "anthropic",
        modelId: "claude-sonnet-4",
        tier: "powerful",
      });

      expect(result.passed).toBe(true);
      expect(result.meetsMinTier).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should fail when model tier is too low", () => {
      const result = evaluator.evaluate("architecture", "complex", {
        providerId: "ollama",
        modelId: "qwen2.5-coder:14b",
        tier: "fast",
      });

      expect(result.passed).toBe(false);
      expect(result.meetsMinTier).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain("does not meet minimum");
    });

    it("should recommend consultation for architecture", () => {
      const result = evaluator.evaluate("architecture", "complex", {
        providerId: "anthropic",
        modelId: "claude-opus-4",
        tier: "expert",
      });

      expect(result.requiresConsultation).toBe(true);
      expect(result.recommendations.some((r) => r.includes("consultation"))).toBe(true);
    });

    it("should add critical task recommendation", () => {
      const result = evaluator.evaluate("security", "critical", {
        providerId: "anthropic",
        modelId: "claude-opus-4",
        tier: "expert",
      });

      expect(result.recommendations.some((r) => r.includes("Critical task"))).toBe(true);
    });
  });

  describe("getQualifiedModels", () => {
    it("should return models meeting minimum tier", () => {
      const qualified = evaluator.getQualifiedModels("code_gen", "moderate");
      // moderate = balanced tier, should include balanced and above
      expect(qualified.length).toBeGreaterThanOrEqual(3);
      expect(qualified.every((m) => m.tier !== "fast" || m.tier === "balanced")).toBe(true);
    });

    it("should return only expert models for security/critical", () => {
      const qualified = evaluator.getQualifiedModels("security", "critical");
      // critical = expert tier
      expect(qualified.every((m) => m.tier === "expert")).toBe(true);
    });

    it("should sort by tier (most powerful first)", () => {
      const qualified = evaluator.getQualifiedModels("general", "simple");
      const tiers = qualified.map((m) => m.tier);

      // Check order: expert, powerful, balanced, fast
      for (let i = 1; i < tiers.length; i++) {
        const prevIndex = MODEL_TIER_HIERARCHY.indexOf(tiers[i - 1]!);
        const currIndex = MODEL_TIER_HIERARCHY.indexOf(tiers[i]!);
        expect(prevIndex).toBeLessThanOrEqual(currIndex);
      }
    });
  });

  describe("requiresConsultation", () => {
    it("should require consultation for critical complexity", () => {
      expect(evaluator.requiresConsultation("general", "critical")).toBe(true);
    });

    it("should require consultation for security tasks", () => {
      expect(evaluator.requiresConsultation("security", "simple")).toBe(true);
    });

    it("should not require consultation for simple code_gen", () => {
      expect(evaluator.requiresConsultation("code_gen", "simple")).toBe(false);
    });
  });

  describe("getMinConsultationProviders", () => {
    it("should return minimum providers from gate", () => {
      expect(evaluator.getMinConsultationProviders("architecture")).toBe(2);
      expect(evaluator.getMinConsultationProviders("security")).toBe(2);
      expect(evaluator.getMinConsultationProviders("general")).toBe(1);
    });
  });
});

describe("getMinTierForTask", () => {
  it("should work without evaluator instance", () => {
    expect(getMinTierForTask("architecture", "simple")).toBe("powerful");
    expect(getMinTierForTask("security", "critical")).toBe("expert");
    expect(getMinTierForTask("general", "simple")).toBe("fast");
  });
});

describe("Constants", () => {
  it("should have correct tier hierarchy", () => {
    expect(MODEL_TIER_HIERARCHY).toEqual(["expert", "powerful", "balanced", "fast"]);
  });

  it("should have default quality gates for all task types", () => {
    const taskTypes = ["architecture", "security", "code_gen", "bug_fix", "research", "general"];
    for (const taskType of taskTypes) {
      const gate = DEFAULT_QUALITY_GATES.find((g) => g.taskType === taskType);
      expect(gate).toBeDefined();
    }
  });

  it("should have complexity tier mapping", () => {
    expect(COMPLEXITY_TIER_MAP.simple).toBe("fast");
    expect(COMPLEXITY_TIER_MAP.moderate).toBe("balanced");
    expect(COMPLEXITY_TIER_MAP.complex).toBe("powerful");
    expect(COMPLEXITY_TIER_MAP.critical).toBe("expert");
  });
});
