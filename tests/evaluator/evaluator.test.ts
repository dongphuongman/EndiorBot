/**
 * Tests for Evaluator Core
 *
 * @module tests/evaluator/evaluator
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Evaluator, createEvaluator, createEvaluatorWithModel } from "../../src/evaluator/evaluator.js";
import { ProviderRegistry } from "../../src/providers/provider-registry.js";
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth, ProviderConfig, ChatChunk } from "../../src/providers/types.js";
import type { AgentResponse, DimensionWeights, ScoreCard } from "../../src/evaluator/types.js";
import { DEFAULT_DIMENSION_WEIGHTS, calculateOverallScore } from "../../src/evaluator/types.js";

// ============================================================================
// Mock Provider
// ============================================================================

function createMockProvider(
  id: string,
  responseContent: string
): AIProvider {
  return {
    id,
    name: `Mock ${id}`,
    models: [],
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    chat: vi.fn().mockResolvedValue({
      id: "resp-1",
      model: id,
      content: responseContent,
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "stop",
    } satisfies ChatResponse),
    chatStream: vi.fn().mockImplementation(async function* (): AsyncIterable<ChatChunk> {
      yield { id: "chunk-1", model: id, delta: responseContent };
    }),
    healthCheck: vi.fn().mockResolvedValue({
      status: "healthy",
      latencyMs: 100,
    } satisfies ProviderHealth),
  };
}

function createValidEvaluationResponse(scores: Partial<Record<keyof ScoreCard["dimensions"], number>> = {}): string {
  const defaultScores = {
    correctness: 85,
    efficiency: 75,
    clarity: 80,
    safety: 90,
    ceoAlignment: 70,
  };
  const finalScores = { ...defaultScores, ...scores };

  return `\`\`\`json
{
  "scores": ${JSON.stringify(finalScores)},
  "confidence": 0.85,
  "reasoning": "The response is well-structured and correct.",
  "suggestions": [
    {
      "type": "enhance",
      "reason": "Could add more examples for clarity",
      "estimatedImprovement": 10
    }
  ]
}
\`\`\``;
}

function createAgentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    id: "test-response-1",
    task: "Write a function to add two numbers",
    content: "Here is a function to add two numbers:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```",
    model: "test-model",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Evaluator", () => {
  let registry: ProviderRegistry;
  let mockProvider: AIProvider;
  let evaluator: Evaluator;

  beforeEach(() => {
    registry = new ProviderRegistry();
    mockProvider = createMockProvider("test-provider", createValidEvaluationResponse());
    registry.register(mockProvider);
    evaluator = new Evaluator({}, registry);
  });

  describe("Configuration", () => {
    it("should use default weights", () => {
      const weights = evaluator.getWeights();
      expect(weights).toEqual(DEFAULT_DIMENSION_WEIGHTS);
    });

    it("should allow setting custom weights", () => {
      evaluator.setWeights({ correctness: 0.5, efficiency: 0.1 });
      const weights = evaluator.getWeights();
      expect(weights.correctness).toBe(0.5);
      expect(weights.efficiency).toBe(0.1);
      expect(weights.clarity).toBe(0.15); // Unchanged
    });

    it("should allow setting evaluation model", () => {
      evaluator.setEvaluationModel("claude-3-opus");
      // No direct accessor, but should not throw
    });
  });

  describe("evaluate()", () => {
    it("should evaluate a response and return score card", async () => {
      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.responseId).toBe(response.id);
      expect(result.scores.dimensions.correctness).toBe(85);
      expect(result.scores.dimensions.efficiency).toBe(75);
      expect(result.scores.dimensions.clarity).toBe(80);
      expect(result.scores.dimensions.safety).toBe(90);
      expect(result.scores.dimensions.ceoAlignment).toBe(70);
      expect(result.scores.confidence).toBeGreaterThan(0);
      expect(result.evaluatedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should calculate overall score correctly", async () => {
      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      const expectedOverall = calculateOverallScore(result.scores.dimensions, DEFAULT_DIMENSION_WEIGHTS);
      expect(result.scores.overall).toBe(expectedOverall);
    });

    it("should include suggestions", async () => {
      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toHaveProperty("type");
      expect(result.suggestions[0]).toHaveProperty("reason");
      expect(result.suggestions[0]).toHaveProperty("confidence");
      expect(result.suggestions[0]).toHaveProperty("estimatedImprovement");
    });

    it("should include reasoning when configured", async () => {
      evaluator = new Evaluator({ includeReasoning: true }, registry);
      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.reasoning).toBeDefined();
    });

    it("should not include reasoning when disabled", async () => {
      evaluator = new Evaluator({ includeReasoning: false }, registry);
      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.reasoning).toBeUndefined();
    });

    it("should handle low scores and add suggestions", async () => {
      mockProvider = createMockProvider("test-provider", createValidEvaluationResponse({
        correctness: 30,
        efficiency: 25,
      }));
      registry = new ProviderRegistry();
      registry.register(mockProvider);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.scores.dimensions.correctness).toBe(30);
      expect(result.scores.dimensions.efficiency).toBe(25);
      // Should have suggestions for low dimensions
      expect(result.suggestions.some(s => s.reason.toLowerCase().includes("correctness"))).toBe(true);
    });

    it("should throw when no providers available", async () => {
      const emptyRegistry = new ProviderRegistry();
      const evalWithNoProvider = new Evaluator({}, emptyRegistry);

      const response = createAgentResponse();
      await expect(evalWithNoProvider.evaluate(response)).rejects.toThrow("No providers available");
    });
  });

  describe("evaluateWithConsensus()", () => {
    it("should aggregate scores from multiple models", async () => {
      const provider1 = createMockProvider("provider-1", createValidEvaluationResponse({
        correctness: 80,
        efficiency: 70,
      }));
      const provider2 = createMockProvider("provider-2", createValidEvaluationResponse({
        correctness: 90,
        efficiency: 80,
      }));

      registry = new ProviderRegistry();
      registry.register(provider1);
      registry.register(provider2);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      const result = await evaluator.evaluateWithConsensus(response, ["provider-1", "provider-2"]);

      // Should be average of the two
      expect(result.scores.dimensions.correctness).toBe(85); // (80 + 90) / 2
      expect(result.scores.dimensions.efficiency).toBe(75); // (70 + 80) / 2
    });

    it("should throw when no models provided", async () => {
      const response = createAgentResponse();
      await expect(evaluator.evaluateWithConsensus(response, [])).rejects.toThrow("At least one model required");
    });

    it("should continue with partial success", async () => {
      const provider1 = createMockProvider("provider-1", createValidEvaluationResponse());
      const provider2: AIProvider = {
        ...createMockProvider("provider-2", ""),
        chat: vi.fn().mockRejectedValue(new Error("Provider 2 failed")),
      };

      registry = new ProviderRegistry();
      registry.register(provider1);
      registry.register(provider2);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      const result = await evaluator.evaluateWithConsensus(response, ["provider-1", "provider-2"]);

      // Should succeed with just provider-1's results
      expect(result.scores.dimensions.correctness).toBe(85);
    });

    it("should throw when all models fail", async () => {
      const provider1: AIProvider = {
        ...createMockProvider("provider-1", ""),
        chat: vi.fn().mockRejectedValue(new Error("Provider 1 failed")),
      };
      const provider2: AIProvider = {
        ...createMockProvider("provider-2", ""),
        chat: vi.fn().mockRejectedValue(new Error("Provider 2 failed")),
      };

      registry = new ProviderRegistry();
      registry.register(provider1);
      registry.register(provider2);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      await expect(evaluator.evaluateWithConsensus(response, ["provider-1", "provider-2"]))
        .rejects.toThrow("All evaluation models failed");
    });
  });

  describe("compareResponses()", () => {
    it("should compare two responses", async () => {
      const comparisonResponse = `\`\`\`json
{
  "scoresA": {
    "correctness": 90,
    "efficiency": 85,
    "clarity": 80,
    "safety": 95,
    "ceoAlignment": 75
  },
  "scoresB": {
    "correctness": 70,
    "efficiency": 75,
    "clarity": 70,
    "safety": 80,
    "ceoAlignment": 65
  },
  "winner": "a",
  "reasoning": "Response A is more complete and correct."
}
\`\`\``;

      mockProvider = createMockProvider("test-provider", comparisonResponse);
      registry = new ProviderRegistry();
      registry.register(mockProvider);
      evaluator = new Evaluator({}, registry);

      const responseA = createAgentResponse({ id: "response-a" });
      const responseB = createAgentResponse({ id: "response-b", content: "Shorter response" });

      const result = await evaluator.compareResponses(responseA, responseB);

      expect(result.responseIdA).toBe("response-a");
      expect(result.responseIdB).toBe("response-b");
      expect(result.recommendation).toBe("use_a");
      expect(result.comparison.winner).toBe("a");
      expect(result.comparison.overallDiff).toBeGreaterThan(0);
    });

    it("should handle equal responses", async () => {
      const comparisonResponse = `\`\`\`json
{
  "scoresA": {
    "correctness": 80,
    "efficiency": 75,
    "clarity": 70,
    "safety": 85,
    "ceoAlignment": 70
  },
  "scoresB": {
    "correctness": 80,
    "efficiency": 75,
    "clarity": 70,
    "safety": 85,
    "ceoAlignment": 70
  },
  "winner": "equal",
  "reasoning": "Both responses are equivalent."
}
\`\`\``;

      mockProvider = createMockProvider("test-provider", comparisonResponse);
      registry = new ProviderRegistry();
      registry.register(mockProvider);
      evaluator = new Evaluator({}, registry);

      const responseA = createAgentResponse({ id: "response-a" });
      const responseB = createAgentResponse({ id: "response-b" });

      const result = await evaluator.compareResponses(responseA, responseB);

      expect(result.recommendation).toBe("either");
      expect(result.comparison.winner).toBe("equal");
    });
  });

  describe("evaluateQuick()", () => {
    it("should perform rule-based evaluation without AI", () => {
      const response = createAgentResponse();
      const scoreCard = evaluator.evaluateQuick(response);

      expect(scoreCard.overall).toBeGreaterThan(0);
      expect(scoreCard.overall).toBeLessThanOrEqual(100);
      expect(scoreCard.confidence).toBe(0.5); // Lower confidence for rule-based
    });

    it("should penalize responses with error indicators", () => {
      const goodResponse = createAgentResponse({ content: "Successfully completed the task" });
      const badResponse = createAgentResponse({ content: "An error occurred: failed to complete" });

      const goodScore = evaluator.evaluateQuick(goodResponse);
      const badScore = evaluator.evaluateQuick(badResponse);

      expect(goodScore.dimensions.correctness).toBeGreaterThan(badScore.dimensions.correctness);
    });

    it("should penalize very long responses", () => {
      const shortResponse = createAgentResponse({ content: "Short answer", tokens: { input: 10, output: 50 } });
      const longResponse = createAgentResponse({ content: "A".repeat(10000), tokens: { input: 10, output: 2500 } });

      const shortScore = evaluator.evaluateQuick(shortResponse);
      const longScore = evaluator.evaluateQuick(longResponse);

      expect(shortScore.dimensions.efficiency).toBeGreaterThan(longScore.dimensions.efficiency);
    });

    it("should reward well-formatted responses", () => {
      const plainResponse = createAgentResponse({ content: "Just some text without formatting" });
      const formattedResponse = createAgentResponse({
        content: "## Header\n\n1. First item\n2. Second item\n\n```code```",
      });

      const plainScore = evaluator.evaluateQuick(plainResponse);
      const formattedScore = evaluator.evaluateQuick(formattedResponse);

      expect(formattedScore.dimensions.clarity).toBeGreaterThan(plainScore.dimensions.clarity);
    });

    it("should penalize dangerous patterns", () => {
      const safeResponse = createAgentResponse({ content: "Here is safe code: console.log('hello')" });
      const dangerousResponse = createAgentResponse({ content: "Run: rm -rf / to clean up" });

      const safeScore = evaluator.evaluateQuick(safeResponse);
      const dangerousScore = evaluator.evaluateQuick(dangerousResponse);

      expect(safeScore.dimensions.safety).toBeGreaterThan(dangerousScore.dimensions.safety);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON response", async () => {
      mockProvider = createMockProvider("test-provider", "Invalid JSON response");
      registry = new ProviderRegistry();
      registry.register(mockProvider);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      // Should return default scores
      expect(result.scores.dimensions.correctness).toBe(50);
      expect(result.scores.confidence).toBe(0.3); // Low confidence on parse error
    });

    it("should clamp out-of-range scores", async () => {
      const invalidScoresResponse = `\`\`\`json
{
  "scores": {
    "correctness": 150,
    "efficiency": -20,
    "clarity": 80,
    "safety": 90,
    "ceoAlignment": 70
  },
  "confidence": 0.8
}
\`\`\``;

      mockProvider = createMockProvider("test-provider", invalidScoresResponse);
      registry = new ProviderRegistry();
      registry.register(mockProvider);
      evaluator = new Evaluator({}, registry);

      const response = createAgentResponse();
      const result = await evaluator.evaluate(response);

      expect(result.scores.dimensions.correctness).toBe(100); // Clamped from 150
      expect(result.scores.dimensions.efficiency).toBe(0); // Clamped from -20
    });
  });
});

describe("Factory Functions", () => {
  it("createEvaluator should create evaluator with defaults", () => {
    const registry = new ProviderRegistry();
    const evaluator = createEvaluator({}, registry);
    expect(evaluator).toBeInstanceOf(Evaluator);
    expect(evaluator.getWeights()).toEqual(DEFAULT_DIMENSION_WEIGHTS);
  });

  it("createEvaluatorWithModel should set evaluation model", () => {
    const registry = new ProviderRegistry();
    const evaluator = createEvaluatorWithModel("claude-3-opus", registry);
    expect(evaluator).toBeInstanceOf(Evaluator);
  });
});
