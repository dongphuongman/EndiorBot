/**
 * Tests for Evaluator Types
 *
 * @module tests/evaluator/types
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_DIMENSION_WEIGHTS,
  DEFAULT_SCORE_THRESHOLDS,
  DEFAULT_LOOP_CONFIG,
  DEFAULT_EVALUATOR_CONFIG,
  getScoreLevel,
  allDimensionsMeetThreshold,
  getDimensionsBelowThreshold,
  calculateOverallScore,
  createEmptyScoreCard,
  isValidScoreCard,
  type ScoreCard,
  type ScoreDimensions,
  type DimensionWeights,
  type ScoreThresholds,
  type LoopConfig,
  type EvaluatorConfig,
  type AgentResponse,
  type EvaluationResult,
  type OptimizationStrategy,
  type OptimizedResponse,
} from "../../src/evaluator/types.js";

describe("Evaluator Types", () => {
  describe("Default Configurations", () => {
    it("should have correct default dimension weights", () => {
      expect(DEFAULT_DIMENSION_WEIGHTS.correctness).toBe(0.3);
      expect(DEFAULT_DIMENSION_WEIGHTS.efficiency).toBe(0.2);
      expect(DEFAULT_DIMENSION_WEIGHTS.clarity).toBe(0.15);
      expect(DEFAULT_DIMENSION_WEIGHTS.safety).toBe(0.2);
      expect(DEFAULT_DIMENSION_WEIGHTS.ceoAlignment).toBe(0.15);
    });

    it("should have weights that sum to 1.0", () => {
      const sum = Object.values(DEFAULT_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });

    it("should have correct default score thresholds", () => {
      expect(DEFAULT_SCORE_THRESHOLDS.minOverall).toBe(50);
      expect(DEFAULT_SCORE_THRESHOLDS.minPerDimension).toBe(40);
      expect(DEFAULT_SCORE_THRESHOLDS.excellentThreshold).toBe(90);
      expect(DEFAULT_SCORE_THRESHOLDS.goodThreshold).toBe(70);
    });

    it("should have correct default loop config", () => {
      expect(DEFAULT_LOOP_CONFIG.enabled).toBe(true);
      expect(DEFAULT_LOOP_CONFIG.autoOptimize).toBe(true);
      expect(DEFAULT_LOOP_CONFIG.limits.maxRetries).toBe(3);
      expect(DEFAULT_LOOP_CONFIG.limits.maxOptimizationTime).toBe(30000);
      expect(DEFAULT_LOOP_CONFIG.notifications.notifyOnLowScore).toBe(true);
      expect(DEFAULT_LOOP_CONFIG.notifications.lowScoreThreshold).toBe(40);
      expect(DEFAULT_LOOP_CONFIG.evaluation.async).toBe(true);
      expect(DEFAULT_LOOP_CONFIG.evaluation.useConsensus).toBe(false);
    });

    it("should have correct default evaluator config", () => {
      expect(DEFAULT_EVALUATOR_CONFIG.weights).toEqual(DEFAULT_DIMENSION_WEIGHTS);
      expect(DEFAULT_EVALUATOR_CONFIG.includeReasoning).toBe(true);
      expect(DEFAULT_EVALUATOR_CONFIG.timeoutMs).toBe(10000);
    });
  });

  describe("getScoreLevel", () => {
    it('should return "excellent" for scores >= 90', () => {
      expect(getScoreLevel(100)).toBe("excellent");
      expect(getScoreLevel(95)).toBe("excellent");
      expect(getScoreLevel(90)).toBe("excellent");
    });

    it('should return "good" for scores >= 70 and < 90', () => {
      expect(getScoreLevel(89)).toBe("good");
      expect(getScoreLevel(80)).toBe("good");
      expect(getScoreLevel(70)).toBe("good");
    });

    it('should return "needs_improvement" for scores >= 50 and < 70', () => {
      expect(getScoreLevel(69)).toBe("needs_improvement");
      expect(getScoreLevel(60)).toBe("needs_improvement");
      expect(getScoreLevel(50)).toBe("needs_improvement");
    });

    it('should return "poor" for scores < 50', () => {
      expect(getScoreLevel(49)).toBe("poor");
      expect(getScoreLevel(30)).toBe("poor");
      expect(getScoreLevel(0)).toBe("poor");
    });

    it("should respect custom thresholds", () => {
      const customThresholds: ScoreThresholds = {
        minOverall: 60,
        minPerDimension: 50,
        excellentThreshold: 95,
        goodThreshold: 80,
      };
      expect(getScoreLevel(90, customThresholds)).toBe("good");
      expect(getScoreLevel(95, customThresholds)).toBe("excellent");
      expect(getScoreLevel(75, customThresholds)).toBe("needs_improvement");
      expect(getScoreLevel(55, customThresholds)).toBe("poor");
    });
  });

  describe("allDimensionsMeetThreshold", () => {
    it("should return true when all dimensions meet threshold", () => {
      const dimensions: ScoreDimensions = {
        correctness: 80,
        efficiency: 70,
        clarity: 65,
        safety: 75,
        ceoAlignment: 60,
      };
      expect(allDimensionsMeetThreshold(dimensions, 60)).toBe(true);
    });

    it("should return false when any dimension is below threshold", () => {
      const dimensions: ScoreDimensions = {
        correctness: 80,
        efficiency: 70,
        clarity: 35, // Below 40
        safety: 75,
        ceoAlignment: 60,
      };
      expect(allDimensionsMeetThreshold(dimensions, 40)).toBe(false);
    });

    it("should return true for perfect scores", () => {
      const dimensions: ScoreDimensions = {
        correctness: 100,
        efficiency: 100,
        clarity: 100,
        safety: 100,
        ceoAlignment: 100,
      };
      expect(allDimensionsMeetThreshold(dimensions, 100)).toBe(true);
    });

    it("should return false for all zeros", () => {
      const dimensions: ScoreDimensions = {
        correctness: 0,
        efficiency: 0,
        clarity: 0,
        safety: 0,
        ceoAlignment: 0,
      };
      expect(allDimensionsMeetThreshold(dimensions, 1)).toBe(false);
    });
  });

  describe("getDimensionsBelowThreshold", () => {
    it("should return empty array when all dimensions meet threshold", () => {
      const dimensions: ScoreDimensions = {
        correctness: 80,
        efficiency: 70,
        clarity: 65,
        safety: 75,
        ceoAlignment: 60,
      };
      expect(getDimensionsBelowThreshold(dimensions, 60)).toEqual([]);
    });

    it("should return dimensions below threshold", () => {
      const dimensions: ScoreDimensions = {
        correctness: 80,
        efficiency: 30, // Below
        clarity: 35, // Below
        safety: 75,
        ceoAlignment: 60,
      };
      const below = getDimensionsBelowThreshold(dimensions, 40);
      expect(below).toContain("efficiency");
      expect(below).toContain("clarity");
      expect(below).toHaveLength(2);
    });

    it("should return all dimensions when all are below threshold", () => {
      const dimensions: ScoreDimensions = {
        correctness: 20,
        efficiency: 30,
        clarity: 25,
        safety: 35,
        ceoAlignment: 10,
      };
      const below = getDimensionsBelowThreshold(dimensions, 40);
      expect(below).toHaveLength(5);
    });
  });

  describe("calculateOverallScore", () => {
    it("should calculate weighted average correctly", () => {
      const dimensions: ScoreDimensions = {
        correctness: 100, // 0.3 * 100 = 30
        efficiency: 100, // 0.2 * 100 = 20
        clarity: 100, // 0.15 * 100 = 15
        safety: 100, // 0.2 * 100 = 20
        ceoAlignment: 100, // 0.15 * 100 = 15
      };
      expect(calculateOverallScore(dimensions)).toBe(100);
    });

    it("should calculate correctly with mixed scores", () => {
      const dimensions: ScoreDimensions = {
        correctness: 80, // 0.3 * 80 = 24
        efficiency: 70, // 0.2 * 70 = 14
        clarity: 60, // 0.15 * 60 = 9
        safety: 90, // 0.2 * 90 = 18
        ceoAlignment: 50, // 0.15 * 50 = 7.5
      };
      // 24 + 14 + 9 + 18 + 7.5 = 72.5 → 73 (rounded)
      expect(calculateOverallScore(dimensions)).toBe(73);
    });

    it("should return 0 for all zero dimensions", () => {
      const dimensions: ScoreDimensions = {
        correctness: 0,
        efficiency: 0,
        clarity: 0,
        safety: 0,
        ceoAlignment: 0,
      };
      expect(calculateOverallScore(dimensions)).toBe(0);
    });

    it("should respect custom weights", () => {
      const dimensions: ScoreDimensions = {
        correctness: 100,
        efficiency: 0,
        clarity: 0,
        safety: 0,
        ceoAlignment: 0,
      };
      const customWeights: DimensionWeights = {
        correctness: 1.0,
        efficiency: 0,
        clarity: 0,
        safety: 0,
        ceoAlignment: 0,
      };
      expect(calculateOverallScore(dimensions, customWeights)).toBe(100);
    });
  });

  describe("createEmptyScoreCard", () => {
    it("should create score card with all zeros", () => {
      const card = createEmptyScoreCard();
      expect(card.overall).toBe(0);
      expect(card.confidence).toBe(0);
      expect(card.dimensions.correctness).toBe(0);
      expect(card.dimensions.efficiency).toBe(0);
      expect(card.dimensions.clarity).toBe(0);
      expect(card.dimensions.safety).toBe(0);
      expect(card.dimensions.ceoAlignment).toBe(0);
    });

    it("should create independent instances", () => {
      const card1 = createEmptyScoreCard();
      const card2 = createEmptyScoreCard();
      card1.overall = 50;
      expect(card2.overall).toBe(0);
    });
  });

  describe("isValidScoreCard", () => {
    it("should return true for valid score card", () => {
      const card: ScoreCard = {
        overall: 75,
        confidence: 0.8,
        dimensions: {
          correctness: 80,
          efficiency: 70,
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(card)).toBe(true);
    });

    it("should return true for edge values", () => {
      const card: ScoreCard = {
        overall: 0,
        confidence: 0,
        dimensions: {
          correctness: 0,
          efficiency: 0,
          clarity: 0,
          safety: 0,
          ceoAlignment: 0,
        },
      };
      expect(isValidScoreCard(card)).toBe(true);

      const maxCard: ScoreCard = {
        overall: 100,
        confidence: 1,
        dimensions: {
          correctness: 100,
          efficiency: 100,
          clarity: 100,
          safety: 100,
          ceoAlignment: 100,
        },
      };
      expect(isValidScoreCard(maxCard)).toBe(true);
    });

    it("should return false for overall out of range", () => {
      const card: ScoreCard = {
        overall: 101,
        confidence: 0.8,
        dimensions: {
          correctness: 80,
          efficiency: 70,
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(card)).toBe(false);

      const negativeCard: ScoreCard = {
        overall: -1,
        confidence: 0.8,
        dimensions: {
          correctness: 80,
          efficiency: 70,
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(negativeCard)).toBe(false);
    });

    it("should return false for confidence out of range", () => {
      const card: ScoreCard = {
        overall: 75,
        confidence: 1.5,
        dimensions: {
          correctness: 80,
          efficiency: 70,
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(card)).toBe(false);

      const negativeCard: ScoreCard = {
        overall: 75,
        confidence: -0.1,
        dimensions: {
          correctness: 80,
          efficiency: 70,
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(negativeCard)).toBe(false);
    });

    it("should return false for dimension out of range", () => {
      const card: ScoreCard = {
        overall: 75,
        confidence: 0.8,
        dimensions: {
          correctness: 80,
          efficiency: 110, // Invalid
          clarity: 75,
          safety: 80,
          ceoAlignment: 65,
        },
      };
      expect(isValidScoreCard(card)).toBe(false);
    });
  });
});

describe("Type Structure Validation", () => {
  describe("AgentResponse", () => {
    it("should accept valid agent response", () => {
      const response: AgentResponse = {
        id: "resp-001",
        task: "Fix the login bug",
        content: "I've identified the issue...",
        model: "claude-3-sonnet",
        timestamp: "2026-02-25T10:00:00Z",
        tokens: {
          input: 100,
          output: 500,
        },
        context: {
          projectId: "project-1",
          sessionId: "session-1",
          files: ["src/auth.ts"],
        },
      };
      expect(response.id).toBe("resp-001");
      expect(response.tokens?.input).toBe(100);
    });
  });

  describe("EvaluationResult", () => {
    it("should accept valid evaluation result", () => {
      const result: EvaluationResult = {
        responseId: "resp-001",
        scores: {
          overall: 75,
          dimensions: {
            correctness: 80,
            efficiency: 70,
            clarity: 75,
            safety: 80,
            ceoAlignment: 65,
          },
          confidence: 0.85,
        },
        suggestions: [
          {
            type: "enhance",
            reason: "Add more detail",
            confidence: 0.7,
            estimatedImprovement: 10,
          },
        ],
        evaluatedAt: "2026-02-25T10:01:00Z",
        evaluationModel: "claude-3-haiku",
        reasoning: "The response correctly identifies...",
        durationMs: 1500,
      };
      expect(result.scores.overall).toBe(75);
      expect(result.suggestions).toHaveLength(1);
    });
  });

  describe("OptimizationStrategy", () => {
    it("should accept valid optimization strategy", () => {
      const strategy: OptimizationStrategy = {
        name: "retry-with-context",
        description: "Add more context and retry",
        trigger: {
          dimension: "correctness",
          operator: "<",
          value: 60,
        },
        action: {
          type: "retry",
          params: {
            additionalContext: true,
            maxTokens: 2000,
          },
        },
        priority: 10,
        maxAttempts: 3,
        cooldownMs: 5000,
        enabled: true,
      };
      expect(strategy.name).toBe("retry-with-context");
      expect(strategy.trigger.dimension).toBe("correctness");
    });

    it("should accept strategy with overall trigger", () => {
      const strategy: OptimizationStrategy = {
        name: "escalate-model",
        description: "Escalate to better model",
        trigger: {
          dimension: "overall",
          operator: "<",
          value: 50,
        },
        action: {
          type: "escalate",
          params: {
            targetModel: "claude-3-opus",
          },
        },
        priority: 5,
        maxAttempts: 1,
        cooldownMs: 0,
        enabled: true,
      };
      expect(strategy.trigger.dimension).toBe("overall");
    });
  });

  describe("OptimizedResponse", () => {
    it("should accept valid optimized response", () => {
      const optimized: OptimizedResponse = {
        originalResponseId: "resp-001",
        optimizedResponse: {
          id: "resp-002",
          task: "Fix the login bug",
          content: "I've identified and fixed the issue...",
          model: "claude-3-opus",
          timestamp: "2026-02-25T10:02:00Z",
        },
        strategyUsed: "escalate-model",
        beforeScore: {
          overall: 45,
          dimensions: {
            correctness: 40,
            efficiency: 50,
            clarity: 45,
            safety: 50,
            ceoAlignment: 45,
          },
          confidence: 0.8,
        },
        afterScore: {
          overall: 85,
          dimensions: {
            correctness: 90,
            efficiency: 80,
            clarity: 85,
            safety: 85,
            ceoAlignment: 80,
          },
          confidence: 0.9,
        },
        attemptNumber: 1,
        durationMs: 5000,
      };
      expect(optimized.afterScore.overall).toBeGreaterThan(optimized.beforeScore.overall);
    });
  });
});
