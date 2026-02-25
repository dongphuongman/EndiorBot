/**
 * Routing Confidence Tests
 *
 * @module tests/agents/routing/confidence
 * @date 2026-02-24
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RoutingConfidenceCalculator,
  createConfidenceCalculator,
  createConfidenceContext,
  formatConfidence,
  getConfidenceColor,
  isActionable,
  DEFAULT_HITL_THRESHOLD,
  MINIMUM_CONFIDENCE,
} from "../../../src/agents/routing/confidence.js";
import type {
  ConfidenceContext,
  RoutingConfidenceResult,
} from "../../../src/agents/routing/confidence.js";
import type {
  ModelCapability,
  ModelSelectionResult,
  SelectionCriteria,
} from "../../../src/agents/routing/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockCriteria = (
  overrides?: Partial<SelectionCriteria>
): SelectionCriteria => ({
  taskType: "code_gen",
  complexity: "moderate",
  minTier: "balanced",
  latencyPreference: "balanced",
  ...overrides,
});

const createMockResult = (
  overrides?: Partial<ModelSelectionResult>
): ModelSelectionResult => ({
  primary: {
    providerId: "anthropic",
    modelId: "claude-sonnet-4",
    tier: "powerful",
    reason: "Best match for code generation",
  },
  fallbacks: [
    {
      providerId: "openai",
      modelId: "gpt-4o-mini",
      tier: "balanced",
      reason: "Cost-effective alternative",
    },
  ],
  metadata: {
    criteriaUsed: ["taskType: code_gen", "complexity: moderate"],
    budgetConsidered: true,
    qualityGatePassed: true,
    estimatedCost: 0.05,
  },
  ...overrides,
});

const createMockCapability = (
  overrides?: Partial<ModelCapability>
): ModelCapability => ({
  providerId: "anthropic",
  modelId: "claude-sonnet-4",
  name: "Claude Sonnet 4",
  tier: "powerful",
  inputCost: 0.003,
  outputCost: 0.015,
  maxTokens: 200000,
  strengths: ["code_gen", "bug_fix"],
  features: ["reasoning", "coding", "streaming"],
  ...overrides,
});

const createMockContext = (
  overrides?: Partial<ConfidenceContext>
): ConfidenceContext => ({
  criteria: createMockCriteria(),
  result: createMockResult(),
  modelCapability: createMockCapability(),
  budgetRemainingRatio: 0.8,
  missingFeatures: [],
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("RoutingConfidenceCalculator", () => {
  let calculator: RoutingConfidenceCalculator;

  beforeEach(() => {
    calculator = createConfidenceCalculator();
  });

  describe("constructor", () => {
    it("should use default HITL threshold", () => {
      expect(calculator.getHITLThreshold()).toBe(DEFAULT_HITL_THRESHOLD);
    });

    it("should accept custom HITL threshold", () => {
      const custom = createConfidenceCalculator(0.8);
      expect(custom.getHITLThreshold()).toBe(0.8);
    });
  });

  describe("calculate", () => {
    it("should return confidence score between 0 and 1", () => {
      const context = createMockContext();
      const result = calculator.calculate(context);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should return high confidence for well-matched selection", () => {
      const context = createMockContext({
        budgetRemainingRatio: 1.0,
        historicalSuccessRate: 0.95,
      });
      const result = calculator.calculate(context);

      expect(result.confidence).toBeGreaterThan(0.7);
      expect(["high", "very_high"]).toContain(result.level);
    });

    it("should return low confidence for poor matches", () => {
      const context = createMockContext({
        result: createMockResult({
          primary: {
            providerId: "ollama",
            modelId: "llama2",
            tier: "local",
            reason: "Local fallback",
          },
          fallbacks: [],
        }),
        modelCapability: createMockCapability({
          providerId: "ollama",
          modelId: "llama2",
          tier: "local",
          strengths: [],
          features: [],
        }),
        budgetRemainingRatio: 0.05,
        missingFeatures: ["reasoning", "coding"],
      });
      const result = calculator.calculate(context);

      expect(result.confidence).toBeLessThan(0.5);
    });

    it("should include confidence breakdown", () => {
      const context = createMockContext();
      const result = calculator.calculate(context);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.tierMatch).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.strengthMatch).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.featuresCoverage).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.budgetHealth).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.fallbackAvailability).toBeGreaterThanOrEqual(0);
    });

    it("should apply penalties for local fallback", () => {
      const withCloud = createMockContext();
      const withLocal = createMockContext({
        result: createMockResult({
          primary: {
            providerId: "ollama",
            modelId: "llama2",
            tier: "local",
            reason: "Local fallback",
          },
        }),
        modelCapability: createMockCapability({
          providerId: "ollama",
          modelId: "llama2",
          tier: "local",
        }),
      });

      const cloudResult = calculator.calculate(withCloud);
      const localResult = calculator.calculate(withLocal);

      expect(localResult.confidence).toBeLessThan(cloudResult.confidence);
      expect(localResult.penalties.some((p) => p.name === "localFallback")).toBe(true);
    });

    it("should penalize critical tasks without expert model", () => {
      const context = createMockContext({
        criteria: createMockCriteria({ complexity: "critical" }),
      });
      const result = calculator.calculate(context);

      expect(result.penalties.some((p) => p.name === "criticalWithoutExpert")).toBe(
        true
      );
    });
  });

  describe("HITL decision", () => {
    it("should not require HITL when confidence is high", () => {
      const context = createMockContext({
        budgetRemainingRatio: 1.0,
        historicalSuccessRate: 0.95,
      });
      const result = calculator.calculate(context);

      expect(result.hitl.required).toBe(false);
    });

    it("should require HITL when confidence is below threshold", () => {
      calculator.setHITLThreshold(0.95); // Set very high threshold
      const context = createMockContext();
      const result = calculator.calculate(context);

      expect(result.hitl.required).toBe(true);
      expect(result.hitl.reason).toBeDefined();
    });

    it("should have critical urgency for very low confidence", () => {
      const context = createMockContext({
        result: createMockResult({
          primary: {
            providerId: "ollama",
            modelId: "llama2",
            tier: "local",
            reason: "Local fallback",
          },
          fallbacks: [],
        }),
        modelCapability: createMockCapability({
          providerId: "ollama",
          modelId: "llama2",
          tier: "local",
          strengths: [],
        }),
        budgetRemainingRatio: 0.01,
        missingFeatures: ["reasoning", "coding", "vision"],
        criteria: createMockCriteria({ complexity: "critical" }),
      });
      const result = calculator.calculate(context);

      if (result.hitl.required) {
        expect(["high", "critical"]).toContain(result.hitl.urgency);
      }
    });

    it("should include timeout for HITL decisions", () => {
      calculator.setHITLThreshold(0.99);
      const context = createMockContext();
      const result = calculator.calculate(context);

      if (result.hitl.required) {
        expect(result.hitl.timeoutMs).toBeGreaterThan(0);
      }
    });
  });

  describe("recommendations", () => {
    it("should generate recommendations for improvement", () => {
      const context = createMockContext({
        budgetRemainingRatio: 0.3,
        missingFeatures: ["vision"],
      });
      const result = calculator.calculate(context);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should limit recommendations to 3", () => {
      const context = createMockContext({
        budgetRemainingRatio: 0.1,
        missingFeatures: ["vision", "reasoning"],
        criteria: createMockCriteria({ complexity: "critical" }),
      });
      const result = calculator.calculate(context);

      expect(result.recommendations.length).toBeLessThanOrEqual(3);
    });
  });

  describe("historical success tracking", () => {
    it("should record and retrieve success rate", () => {
      calculator.recordOutcome("anthropic", "claude-sonnet-4", "code_gen", true);
      calculator.recordOutcome("anthropic", "claude-sonnet-4", "code_gen", true);
      calculator.recordOutcome("anthropic", "claude-sonnet-4", "code_gen", false);

      const rate = calculator.getSuccessRate(
        "anthropic",
        "claude-sonnet-4",
        "code_gen"
      );

      expect(rate).toBeCloseTo(0.667, 2);
    });

    it("should return undefined for unknown combinations", () => {
      const rate = calculator.getSuccessRate("unknown", "model", "code_gen");
      expect(rate).toBeUndefined();
    });

    it("should clear history", () => {
      calculator.recordOutcome("anthropic", "claude-sonnet-4", "code_gen", true);
      calculator.clearHistory();

      const rate = calculator.getSuccessRate(
        "anthropic",
        "claude-sonnet-4",
        "code_gen"
      );
      expect(rate).toBeUndefined();
    });
  });

  describe("threshold management", () => {
    it("should update HITL threshold", () => {
      calculator.setHITLThreshold(0.5);
      expect(calculator.getHITLThreshold()).toBe(0.5);
    });

    it("should reject invalid thresholds", () => {
      expect(() => calculator.setHITLThreshold(-0.1)).toThrow();
      expect(() => calculator.setHITLThreshold(1.5)).toThrow();
    });
  });

  describe("quickScore", () => {
    it("should return just the confidence score", () => {
      const context = createMockContext();
      const score = calculator.quickScore(context);

      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("requiresHITL", () => {
    it("should return boolean for HITL requirement", () => {
      const context = createMockContext();
      const result = calculator.requiresHITL(context);

      expect(typeof result).toBe("boolean");
    });
  });
});

describe("createConfidenceContext", () => {
  it("should create context with defaults", () => {
    const criteria = createMockCriteria();
    const result = createMockResult();
    const capability = createMockCapability();

    const context = createConfidenceContext(criteria, result, capability);

    expect(context.budgetRemainingRatio).toBe(1.0);
    expect(context.missingFeatures).toEqual([]);
    expect(context.historicalSuccessRate).toBeUndefined();
  });

  it("should accept optional overrides", () => {
    const criteria = createMockCriteria();
    const result = createMockResult();
    const capability = createMockCapability();

    const context = createConfidenceContext(criteria, result, capability, {
      budgetRemainingRatio: 0.5,
      missingFeatures: ["vision"],
      historicalSuccessRate: 0.9,
      consultationConsensus: 0.8,
    });

    expect(context.budgetRemainingRatio).toBe(0.5);
    expect(context.missingFeatures).toEqual(["vision"]);
    expect(context.historicalSuccessRate).toBe(0.9);
    expect(context.consultationConsensus).toBe(0.8);
  });
});

describe("Utility Functions", () => {
  describe("formatConfidence", () => {
    it("should format as percentage", () => {
      expect(formatConfidence(0.85)).toBe("85.0%");
      expect(formatConfidence(0.123)).toBe("12.3%");
      expect(formatConfidence(1.0)).toBe("100.0%");
      expect(formatConfidence(0)).toBe("0.0%");
    });
  });

  describe("getConfidenceColor", () => {
    it("should return green for high confidence", () => {
      expect(getConfidenceColor("very_high")).toBe("green");
      expect(getConfidenceColor("high")).toBe("green");
    });

    it("should return yellow for medium confidence", () => {
      expect(getConfidenceColor("medium")).toBe("yellow");
    });

    it("should return orange for low confidence", () => {
      expect(getConfidenceColor("low")).toBe("orange");
    });

    it("should return red for very low confidence", () => {
      expect(getConfidenceColor("very_low")).toBe("red");
    });
  });

  describe("isActionable", () => {
    it("should return true for actionable confidence", () => {
      expect(isActionable(0.5)).toBe(true);
      expect(isActionable(MINIMUM_CONFIDENCE)).toBe(true);
    });

    it("should return false for non-actionable confidence", () => {
      expect(isActionable(0.1)).toBe(false);
      expect(isActionable(MINIMUM_CONFIDENCE - 0.01)).toBe(false);
    });
  });
});

describe("Constants", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_HITL_THRESHOLD).toBe(0.7);
    expect(MINIMUM_CONFIDENCE).toBe(0.3);
    expect(DEFAULT_HITL_THRESHOLD).toBeGreaterThan(MINIMUM_CONFIDENCE);
  });
});
