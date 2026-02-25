/**
 * Tests for Score Card Calculator
 *
 * @module tests/evaluator/score-card
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ScoreCardCalculator,
  createScoreCardCalculator,
  createScoreCard,
  formatScoreCard,
} from "../../src/evaluator/score-card.js";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  DEFAULT_SCORE_THRESHOLDS,
  createEmptyScoreCard,
  type ScoreCard,
  type ScoreDimensions,
  type ResponseMetrics,
} from "../../src/evaluator/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestMetrics(overrides: Partial<ResponseMetrics> = {}): ResponseMetrics {
  return {
    correctness: {
      errorCount: 0,
      testsPass: true,
      succeeded: true,
      ...overrides.correctness,
    },
    efficiency: {
      tokensUsed: 500,
      latencyMs: 2000,
      ...overrides.efficiency,
    },
    clarity: {
      wellStructured: true,
      hasFormatting: true,
      length: 1000,
      ...overrides.clarity,
    },
    safety: {
      securityScanPass: true,
      noSecretsExposed: true,
      noDangerousOps: true,
      ...overrides.safety,
    },
    ceoAlignment: {
      matchesStyle: true,
      followsConventions: true,
      matchesTone: true,
      ...overrides.ceoAlignment,
    },
  };
}

function createTestScoreCard(overrides: Partial<ScoreCard> = {}): ScoreCard {
  return {
    overall: 80,
    dimensions: {
      correctness: 85,
      efficiency: 75,
      clarity: 80,
      safety: 90,
      ceoAlignment: 70,
      ...overrides.dimensions,
    },
    confidence: 0.85,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("ScoreCardCalculator", () => {
  let calculator: ScoreCardCalculator;

  beforeEach(() => {
    calculator = new ScoreCardCalculator();
  });

  describe("Configuration", () => {
    it("should use default weights", () => {
      const weights = calculator.getWeights();
      expect(weights).toEqual(DEFAULT_DIMENSION_WEIGHTS);
    });

    it("should use default thresholds", () => {
      const thresholds = calculator.getThresholds();
      expect(thresholds).toEqual(DEFAULT_SCORE_THRESHOLDS);
    });

    it("should allow custom weights in constructor", () => {
      const customCalc = new ScoreCardCalculator({ correctness: 0.5 });
      expect(customCalc.getWeights().correctness).toBe(0.5);
    });

    it("should allow custom thresholds in constructor", () => {
      const customCalc = new ScoreCardCalculator({}, { minOverall: 60 });
      expect(customCalc.getThresholds().minOverall).toBe(60);
    });

    it("should allow updating weights", () => {
      calculator.setWeights({ efficiency: 0.3 });
      expect(calculator.getWeights().efficiency).toBe(0.3);
    });

    it("should allow updating thresholds", () => {
      calculator.setThresholds({ goodThreshold: 75 });
      expect(calculator.getThresholds().goodThreshold).toBe(75);
    });
  });

  describe("calculate()", () => {
    it("should calculate score card from perfect metrics", () => {
      const metrics = createTestMetrics();
      const card = calculator.calculate(metrics);

      expect(card.overall).toBeGreaterThan(80);
      expect(card.dimensions.correctness).toBeGreaterThan(80);
      expect(card.dimensions.safety).toBe(100); // Perfect safety
      expect(card.confidence).toBeGreaterThan(0.5);
    });

    it("should penalize errors in correctness", () => {
      const goodMetrics = createTestMetrics({ correctness: { errorCount: 0 } });
      const badMetrics = createTestMetrics({ correctness: { errorCount: 3 } });

      const goodCard = calculator.calculate(goodMetrics);
      const badCard = calculator.calculate(badMetrics);

      expect(goodCard.dimensions.correctness).toBeGreaterThan(badCard.dimensions.correctness);
    });

    it("should penalize failed tests", () => {
      const passMetrics = createTestMetrics({ correctness: { errorCount: 0, testsPass: true } });
      const failMetrics = createTestMetrics({ correctness: { errorCount: 0, testsPass: false } });

      const passCard = calculator.calculate(passMetrics);
      const failCard = calculator.calculate(failMetrics);

      expect(passCard.dimensions.correctness).toBeGreaterThan(failCard.dimensions.correctness);
    });

    it("should penalize high token usage", () => {
      const efficientMetrics = createTestMetrics({ efficiency: { tokensUsed: 200, latencyMs: 1000 } });
      const inefficientMetrics = createTestMetrics({ efficiency: { tokensUsed: 3500, latencyMs: 1000 } });

      const efficientCard = calculator.calculate(efficientMetrics);
      const inefficientCard = calculator.calculate(inefficientMetrics);

      expect(efficientCard.dimensions.efficiency).toBeGreaterThan(inefficientCard.dimensions.efficiency);
    });

    it("should penalize high latency", () => {
      const fastMetrics = createTestMetrics({ efficiency: { tokensUsed: 500, latencyMs: 500 } });
      const slowMetrics = createTestMetrics({ efficiency: { tokensUsed: 500, latencyMs: 15000 } });

      const fastCard = calculator.calculate(fastMetrics);
      const slowCard = calculator.calculate(slowMetrics);

      expect(fastCard.dimensions.efficiency).toBeGreaterThan(slowCard.dimensions.efficiency);
    });

    it("should reward well-formatted responses", () => {
      const formattedMetrics = createTestMetrics({
        clarity: { wellStructured: true, hasFormatting: true, length: 1000 },
      });
      const plainMetrics = createTestMetrics({
        clarity: { wellStructured: false, hasFormatting: false, length: 1000 },
      });

      const formattedCard = calculator.calculate(formattedMetrics);
      const plainCard = calculator.calculate(plainMetrics);

      expect(formattedCard.dimensions.clarity).toBeGreaterThan(plainCard.dimensions.clarity);
    });

    it("should penalize security issues", () => {
      const safeMetrics = createTestMetrics({
        safety: { securityScanPass: true, noSecretsExposed: true, noDangerousOps: true },
      });
      const unsafeMetrics = createTestMetrics({
        safety: { securityScanPass: false, noSecretsExposed: false, noDangerousOps: false },
      });

      const safeCard = calculator.calculate(safeMetrics);
      const unsafeCard = calculator.calculate(unsafeMetrics);

      expect(safeCard.dimensions.safety).toBe(100);
      expect(unsafeCard.dimensions.safety).toBe(0);
    });

    it("should calculate CEO alignment from preferences", () => {
      const alignedMetrics = createTestMetrics({
        ceoAlignment: { matchesStyle: true, followsConventions: true, matchesTone: true },
      });
      const misalignedMetrics = createTestMetrics({
        ceoAlignment: { matchesStyle: false, followsConventions: false, matchesTone: false },
      });

      const alignedCard = calculator.calculate(alignedMetrics);
      const misalignedCard = calculator.calculate(misalignedMetrics);

      expect(alignedCard.dimensions.ceoAlignment).toBeGreaterThan(misalignedCard.dimensions.ceoAlignment);
    });
  });

  describe("Score Analysis", () => {
    it("should correctly identify score levels", () => {
      const excellent = createTestScoreCard({ overall: 95 });
      const good = createTestScoreCard({ overall: 75 });
      const needsImprovement = createTestScoreCard({ overall: 55 });
      const poor = createTestScoreCard({ overall: 35 });

      expect(calculator.getLevel(excellent)).toBe("excellent");
      expect(calculator.getLevel(good)).toBe("good");
      expect(calculator.getLevel(needsImprovement)).toBe("needs_improvement");
      expect(calculator.getLevel(poor)).toBe("poor");
    });

    it("should check if card meets threshold", () => {
      const passing = createTestScoreCard({
        overall: 60,
        dimensions: { correctness: 50, efficiency: 50, clarity: 50, safety: 50, ceoAlignment: 50 },
      });
      const failing = createTestScoreCard({
        overall: 40,
        dimensions: { correctness: 30, efficiency: 50, clarity: 50, safety: 50, ceoAlignment: 50 },
      });

      expect(calculator.meetsThreshold(passing)).toBe(true);
      expect(calculator.meetsThreshold(failing)).toBe(false);
    });

    it("should identify deficient dimensions", () => {
      const card = createTestScoreCard({
        dimensions: { correctness: 30, efficiency: 35, clarity: 80, safety: 90, ceoAlignment: 70 },
      });

      const deficient = calculator.getDeficientDimensions(card);

      expect(deficient).toContain("correctness");
      expect(deficient).toContain("efficiency");
      expect(deficient).not.toContain("clarity");
    });

    it("should check for excellent quality", () => {
      expect(calculator.isExcellent(createTestScoreCard({ overall: 95 }))).toBe(true);
      expect(calculator.isExcellent(createTestScoreCard({ overall: 85 }))).toBe(false);
    });

    it("should check for good quality", () => {
      expect(calculator.isGood(createTestScoreCard({ overall: 75 }))).toBe(true);
      expect(calculator.isGood(createTestScoreCard({ overall: 65 }))).toBe(false);
    });

    it("should check for poor quality", () => {
      expect(calculator.isPoor(createTestScoreCard({ overall: 40 }))).toBe(true);
      expect(calculator.isPoor(createTestScoreCard({ overall: 55 }))).toBe(false);
    });

    it("should validate score card", () => {
      const valid = createTestScoreCard();
      const invalid = createTestScoreCard({
        overall: 150, // Invalid
      });

      expect(calculator.isValid(valid)).toBe(true);
      expect(calculator.isValid(invalid)).toBe(false);
    });
  });

  describe("Score Comparison", () => {
    it("should compare two cards and determine winner", () => {
      const better = createTestScoreCard({ overall: 85 });
      const worse = createTestScoreCard({ overall: 70 });

      const comparison = calculator.compareCards(better, worse);

      expect(comparison.winner).toBe("a");
      expect(comparison.overallDiff).toBe(15);
      expect(comparison.improvementPercent).toBeCloseTo(21.43, 1);
    });

    it("should identify equal cards", () => {
      const cardA = createTestScoreCard({ overall: 75 });
      const cardB = createTestScoreCard({ overall: 76 });

      const comparison = calculator.compareCards(cardA, cardB);

      expect(comparison.winner).toBe("equal"); // Within 3 point margin
    });

    it("should calculate dimension differences", () => {
      const cardA = createTestScoreCard({
        dimensions: { correctness: 80, efficiency: 70, clarity: 75, safety: 85, ceoAlignment: 65 },
      });
      const cardB = createTestScoreCard({
        dimensions: { correctness: 70, efficiency: 80, clarity: 75, safety: 85, ceoAlignment: 65 },
      });

      const comparison = calculator.compareCards(cardA, cardB);

      expect(comparison.dimensionDiffs.correctness).toBe(10);
      expect(comparison.dimensionDiffs.efficiency).toBe(-10);
      expect(comparison.dimensionDiffs.clarity).toBe(0);
    });

    it("should calculate improvement metrics", () => {
      const before = createTestScoreCard({
        overall: 50,
        dimensions: { correctness: 40, efficiency: 50, clarity: 55, safety: 60, ceoAlignment: 45 },
      });
      const after = createTestScoreCard({
        overall: 75,
        dimensions: { correctness: 80, efficiency: 70, clarity: 75, safety: 80, ceoAlignment: 65 },
      });

      const improvement = calculator.calculateImprovement(before, after);

      expect(improvement.overallImprovement).toBe(25);
      expect(improvement.percentImprovement).toBe(50);
      expect(improvement.improvedDimensions).toContain("correctness");
      expect(improvement.improvedDimensions).toContain("efficiency");
      expect(improvement.worsenedDimensions).toHaveLength(0);
    });
  });

  describe("Aggregation", () => {
    it("should calculate average of multiple cards", () => {
      const cards = [
        createTestScoreCard({
          dimensions: { correctness: 80, efficiency: 70, clarity: 60, safety: 90, ceoAlignment: 70 },
        }),
        createTestScoreCard({
          dimensions: { correctness: 60, efficiency: 80, clarity: 80, safety: 80, ceoAlignment: 70 },
        }),
      ];

      const avg = calculator.average(cards);

      expect(avg.dimensions.correctness).toBe(70);
      expect(avg.dimensions.efficiency).toBe(75);
      expect(avg.dimensions.clarity).toBe(70);
      expect(avg.dimensions.safety).toBe(85);
    });

    it("should return empty card for empty array", () => {
      const avg = calculator.average([]);
      expect(avg).toEqual(createEmptyScoreCard());
    });

    it("should find minimum across cards", () => {
      const cards = [
        createTestScoreCard({
          dimensions: { correctness: 80, efficiency: 70, clarity: 60, safety: 90, ceoAlignment: 70 },
        }),
        createTestScoreCard({
          dimensions: { correctness: 60, efficiency: 80, clarity: 80, safety: 80, ceoAlignment: 50 },
        }),
      ];

      const min = calculator.minimum(cards);

      expect(min.dimensions.correctness).toBe(60);
      expect(min.dimensions.efficiency).toBe(70);
      expect(min.dimensions.clarity).toBe(60);
      expect(min.dimensions.ceoAlignment).toBe(50);
    });

    it("should find maximum across cards", () => {
      const cards = [
        createTestScoreCard({
          dimensions: { correctness: 80, efficiency: 70, clarity: 60, safety: 90, ceoAlignment: 70 },
        }),
        createTestScoreCard({
          dimensions: { correctness: 60, efficiency: 80, clarity: 80, safety: 80, ceoAlignment: 50 },
        }),
      ];

      const max = calculator.maximum(cards);

      expect(max.dimensions.correctness).toBe(80);
      expect(max.dimensions.efficiency).toBe(80);
      expect(max.dimensions.clarity).toBe(80);
      expect(max.dimensions.safety).toBe(90);
    });
  });

  describe("Utility Methods", () => {
    it("should recalculate overall from dimensions", () => {
      const card = createTestScoreCard({
        overall: 0, // Wrong
        dimensions: { correctness: 100, efficiency: 100, clarity: 100, safety: 100, ceoAlignment: 100 },
      });

      const recalculated = calculator.recalculateOverall(card);

      expect(recalculated.overall).toBe(100);
    });
  });
});

describe("Factory Functions", () => {
  it("createScoreCardCalculator should create calculator", () => {
    const calc = createScoreCardCalculator();
    expect(calc).toBeInstanceOf(ScoreCardCalculator);
  });

  it("createScoreCard should create valid score card", () => {
    const dimensions: ScoreDimensions = {
      correctness: 80,
      efficiency: 75,
      clarity: 70,
      safety: 85,
      ceoAlignment: 65,
    };

    const card = createScoreCard(dimensions);

    expect(card.dimensions).toEqual(dimensions);
    expect(card.confidence).toBe(0.8);
    expect(card.overall).toBeGreaterThan(0);
  });

  it("formatScoreCard should return formatted string", () => {
    const card = createTestScoreCard({ overall: 85 });
    const formatted = formatScoreCard(card);

    expect(formatted).toContain("Overall: 85");
    expect(formatted).toContain("Correctness:");
    expect(formatted).toContain("Efficiency:");
    expect(formatted).toContain("Clarity:");
    expect(formatted).toContain("Safety:");
    expect(formatted).toContain("CEO Alignment:");
    expect(formatted).toContain("Confidence:");
  });

  it("formatScoreCard should include level emoji", () => {
    const excellent = createTestScoreCard({ overall: 95 });
    const poor = createTestScoreCard({ overall: 35 });

    expect(formatScoreCard(excellent)).toContain("🌟");
    expect(formatScoreCard(poor)).toContain("❌");
  });
});
