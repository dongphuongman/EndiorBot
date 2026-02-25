/**
 * Tests for Optimizer Core
 *
 * @module tests/evaluator/optimizer
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Optimizer, createOptimizer, DEFAULT_OPTIMIZER_CONFIG } from "../../src/evaluator/optimizer.js";
import { ProviderRegistry } from "../../src/providers/provider-registry.js";
import type { AIProvider, ChatResponse, ProviderHealth, ChatChunk } from "../../src/providers/types.js";
import type { ScoreCard, OptimizationStrategy, AgentResponse } from "../../src/evaluator/types.js";

// ============================================================================
// Mock Provider
// ============================================================================

function createMockProvider(id: string, responseContent: string): AIProvider {
  return {
    id,
    name: `Mock ${id}`,
    models: [{ id: "default", name: "Default", contextWindow: 4096, maxOutputTokens: 1024, supportedFeatures: ["chat"] }],
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

// ============================================================================
// Test Helpers
// ============================================================================

function createTestStrategy(overrides: Partial<OptimizationStrategy> = {}): OptimizationStrategy {
  return {
    name: "test-strategy",
    description: "Test optimization strategy",
    trigger: {
      dimension: "overall",
      operator: "<",
      value: 50,
    },
    action: {
      type: "retry",
      params: {},
    },
    priority: 10,
    maxAttempts: 3,
    cooldownMs: 1000,
    enabled: true,
    ...overrides,
  };
}

function createTestScoreCard(overrides: Partial<ScoreCard> = {}): ScoreCard {
  return {
    overall: 75,
    dimensions: {
      correctness: 80,
      efficiency: 70,
      clarity: 75,
      safety: 85,
      ceoAlignment: 65,
    },
    confidence: 0.8,
    ...overrides,
  };
}

function createTestResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    id: "test-response-1",
    task: "Write a function to add two numbers",
    content: "Here is the function...",
    model: "test-model",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Optimizer", () => {
  let registry: ProviderRegistry;
  let mockProvider: AIProvider;
  let optimizer: Optimizer;

  beforeEach(() => {
    registry = new ProviderRegistry();
    mockProvider = createMockProvider("test-provider", "Optimized response");
    registry.register(mockProvider);
    optimizer = new Optimizer([], {}, registry);
  });

  describe("Strategy Management", () => {
    it("should register strategies", () => {
      const strategy = createTestStrategy();
      optimizer.registerStrategy(strategy);

      expect(optimizer.getStrategy("test-strategy")).toEqual(strategy);
    });

    it("should list strategies sorted by priority", () => {
      optimizer.registerStrategy(createTestStrategy({ name: "low-priority", priority: 5 }));
      optimizer.registerStrategy(createTestStrategy({ name: "high-priority", priority: 15 }));
      optimizer.registerStrategy(createTestStrategy({ name: "medium-priority", priority: 10 }));

      const strategies = optimizer.listStrategies();

      expect(strategies[0].name).toBe("high-priority");
      expect(strategies[1].name).toBe("medium-priority");
      expect(strategies[2].name).toBe("low-priority");
    });

    it("should remove strategies", () => {
      const strategy = createTestStrategy();
      optimizer.registerStrategy(strategy);

      const removed = optimizer.removeStrategy("test-strategy");

      expect(removed).toBe(true);
      expect(optimizer.getStrategy("test-strategy")).toBeUndefined();
    });

    it("should enable/disable strategies", () => {
      const strategy = createTestStrategy({ enabled: true });
      optimizer.registerStrategy(strategy);

      optimizer.setStrategyEnabled("test-strategy", false);

      expect(optimizer.getStrategy("test-strategy")?.enabled).toBe(false);
    });
  });

  describe("Strategy Selection", () => {
    it("should select strategy when trigger is met", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "low-score-strategy",
        trigger: { dimension: "overall", operator: "<", value: 50 },
      }));

      const lowScoreCard = createTestScoreCard({ overall: 40 });
      const selected = optimizer.selectStrategy(lowScoreCard);

      expect(selected?.name).toBe("low-score-strategy");
    });

    it("should not select strategy when trigger is not met", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "low-score-strategy",
        trigger: { dimension: "overall", operator: "<", value: 50 },
      }));

      const highScoreCard = createTestScoreCard({ overall: 80 });
      const selected = optimizer.selectStrategy(highScoreCard);

      expect(selected).toBeNull();
    });

    it("should check dimension-specific triggers", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "low-safety-strategy",
        trigger: { dimension: "safety", operator: "<", value: 60 },
      }));

      const lowSafetyCard = createTestScoreCard({
        overall: 70,
        dimensions: { correctness: 80, efficiency: 70, clarity: 75, safety: 50, ceoAlignment: 65 },
      });

      const selected = optimizer.selectStrategy(lowSafetyCard);

      expect(selected?.name).toBe("low-safety-strategy");
    });

    it("should not select disabled strategies", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "disabled-strategy",
        trigger: { dimension: "overall", operator: "<", value: 100 },
        enabled: false,
      }));

      const scoreCard = createTestScoreCard({ overall: 50 });
      const selected = optimizer.selectStrategy(scoreCard);

      expect(selected).toBeNull();
    });

    it("should select multiple strategies", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "strategy-1",
        trigger: { dimension: "overall", operator: "<", value: 60 },
        priority: 10,
      }));
      optimizer.registerStrategy(createTestStrategy({
        name: "strategy-2",
        trigger: { dimension: "correctness", operator: "<", value: 50 },
        priority: 5,
      }));

      const lowScoreCard = createTestScoreCard({
        overall: 45,
        dimensions: { correctness: 40, efficiency: 50, clarity: 50, safety: 50, ceoAlignment: 50 },
      });

      const selected = optimizer.selectStrategies(lowScoreCard, 5);

      expect(selected).toHaveLength(2);
      expect(selected[0].name).toBe("strategy-1"); // Higher priority first
    });

    it("should respect operator comparisons", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "greater-than",
        trigger: { dimension: "overall", operator: ">", value: 80 },
      }));
      optimizer.registerStrategy(createTestStrategy({
        name: "greater-equal",
        trigger: { dimension: "overall", operator: ">=", value: 75 },
      }));
      optimizer.registerStrategy(createTestStrategy({
        name: "less-equal",
        trigger: { dimension: "overall", operator: "<=", value: 75 },
      }));

      const card75 = createTestScoreCard({ overall: 75 });
      const selected = optimizer.selectStrategies(card75, 5);

      // Should match >= 75 and <= 75, but not > 80
      expect(selected.map(s => s.name)).toContain("greater-equal");
      expect(selected.map(s => s.name)).toContain("less-equal");
      expect(selected.map(s => s.name)).not.toContain("greater-than");
    });
  });

  describe("optimize()", () => {
    it("should apply retry strategy", async () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "retry-strategy",
        action: { type: "retry", params: { additionalContext: "Please be more detailed" } },
      }));

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("retry-strategy")!;

      const result = await optimizer.optimize(response, strategy, scoreCard);

      expect(result.originalResponseId).toBe(response.id);
      expect(result.strategyUsed).toBe("retry-strategy");
      expect(result.attemptNumber).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockProvider.chat).toHaveBeenCalled();
    });

    it("should apply escalate strategy", async () => {
      // Register a higher tier provider
      const betterProvider = createMockProvider("anthropic-provider", "Better response");
      registry.register(betterProvider);

      optimizer.registerStrategy(createTestStrategy({
        name: "escalate-strategy",
        action: { type: "escalate", params: { targetModel: "anthropic" } },
      }));

      const response = createTestResponse({ model: "ollama" });
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("escalate-strategy")!;

      const result = await optimizer.optimize(response, strategy, scoreCard);

      expect(result.strategyUsed).toBe("escalate-strategy");
      expect(result.optimizedResponse.model).toBe("anthropic");
    });

    it("should apply enhance strategy", async () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "enhance-strategy",
        action: { type: "enhance", params: { addExamples: true } },
      }));

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("enhance-strategy")!;

      const result = await optimizer.optimize(response, strategy, scoreCard);

      expect(result.strategyUsed).toBe("enhance-strategy");
      // Enhanced task should include examples request
      expect(result.optimizedResponse.task).toContain("examples");
    });

    it("should track attempt count", async () => {
      optimizer.registerStrategy(createTestStrategy({ name: "tracked-strategy" }));
      optimizer.clearCooldowns();

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("tracked-strategy")!;

      // First attempt
      const result1 = await optimizer.optimize(response, strategy, scoreCard);
      expect(result1.attemptNumber).toBe(1);

      optimizer.clearCooldowns();

      // Second attempt
      const result2 = await optimizer.optimize(response, strategy, scoreCard);
      expect(result2.attemptNumber).toBe(2);
    });

    it("should throw when max attempts exceeded", async () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "limited-strategy",
        maxAttempts: 1,
      }));
      optimizer.clearCooldowns();

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("limited-strategy")!;

      // First attempt should succeed
      await optimizer.optimize(response, strategy, scoreCard);
      optimizer.clearCooldowns();

      // Second attempt should fail
      await expect(optimizer.optimize(response, strategy, scoreCard))
        .rejects.toThrow("Max attempts (1) exceeded");
    });

    it("should throw when escalation is disabled", async () => {
      const noEscalationOptimizer = new Optimizer(
        [createTestStrategy({
          name: "escalate-strategy",
          action: { type: "escalate", params: {} },
        })],
        { allowEscalation: false },
        registry
      );

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = noEscalationOptimizer.getStrategy("escalate-strategy")!;

      await expect(noEscalationOptimizer.optimize(response, strategy, scoreCard))
        .rejects.toThrow("Model escalation is disabled");
    });
  });

  describe("Suggestions", () => {
    it("should generate suggestions based on applicable strategies", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "low-score-strategy",
        description: "Retry with more context",
        trigger: { dimension: "overall", operator: "<", value: 60 },
        action: { type: "retry", params: {} },
      }));

      const scoreCard = createTestScoreCard({ overall: 45 });
      const suggestions = optimizer.suggestImprovements(scoreCard);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].strategyName).toBe("low-score-strategy");
    });

    it("should add generic suggestions for low dimensions", () => {
      const scoreCard = createTestScoreCard({
        overall: 50,
        dimensions: { correctness: 30, efficiency: 80, clarity: 80, safety: 80, ceoAlignment: 80 },
      });

      const suggestions = optimizer.suggestImprovements(scoreCard);

      const correctnessSuggestion = suggestions.find((s) =>
        s.reason.toLowerCase().includes("correctness")
      );
      expect(correctnessSuggestion).toBeDefined();
    });

    it("should sort suggestions by estimated improvement", () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "high-improvement",
        trigger: { dimension: "overall", operator: "<", value: 60 },
        action: { type: "escalate", params: {} },
      }));
      optimizer.registerStrategy(createTestStrategy({
        name: "low-improvement",
        trigger: { dimension: "overall", operator: "<", value: 60 },
        action: { type: "modify", params: {} },
      }));

      const scoreCard = createTestScoreCard({ overall: 45 });
      const suggestions = optimizer.suggestImprovements(scoreCard);

      // Escalate should have higher improvement than modify
      const escalateIndex = suggestions.findIndex((s) => s.type === "escalate");
      const modifyIndex = suggestions.findIndex((s) => s.type === "modify");

      if (escalateIndex !== -1 && modifyIndex !== -1) {
        expect(escalateIndex).toBeLessThan(modifyIndex);
      }
    });
  });

  describe("Cooldowns", () => {
    it("should respect strategy cooldown", async () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "cooldown-strategy",
        cooldownMs: 5000,
        trigger: { dimension: "overall", operator: "<", value: 100 },
      }));

      const scoreCard = createTestScoreCard({ overall: 50 });

      // Strategy should be selected initially
      let selected = optimizer.selectStrategy(scoreCard);
      expect(selected?.name).toBe("cooldown-strategy");

      // Trigger cooldown by optimizing
      const response = createTestResponse();
      const strategy = optimizer.getStrategy("cooldown-strategy")!;
      await optimizer.optimize(response, strategy, scoreCard);

      // Strategy should not be selected during cooldown
      selected = optimizer.selectStrategy(scoreCard);
      expect(selected).toBeNull();
    });

    it("should allow clearing cooldowns", async () => {
      optimizer.registerStrategy(createTestStrategy({
        name: "cooldown-strategy",
        cooldownMs: 60000,
        trigger: { dimension: "overall", operator: "<", value: 100 },
      }));

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 50 });
      const strategy = optimizer.getStrategy("cooldown-strategy")!;

      await optimizer.optimize(response, strategy, scoreCard);

      // Clear cooldowns
      optimizer.clearCooldowns();

      // Should be selectable again
      const selected = optimizer.selectStrategy(scoreCard);
      expect(selected?.name).toBe("cooldown-strategy");
    });
  });

  describe("Attempt History", () => {
    it("should track optimization attempts", async () => {
      optimizer.registerStrategy(createTestStrategy({ name: "tracked-strategy" }));

      const response = createTestResponse();
      const scoreCard = createTestScoreCard({ overall: 40 });
      const strategy = optimizer.getStrategy("tracked-strategy")!;

      await optimizer.optimize(response, strategy, scoreCard);

      const history = optimizer.getAttemptHistory(response.id);

      expect(history).toHaveLength(1);
      expect(history[0].strategy).toBe("tracked-strategy");
      expect(history[0].attemptNumber).toBe(1);
      expect(history[0].beforeScore).toBe(40);
    });
  });
});

describe("Factory Functions", () => {
  it("createOptimizer should create optimizer with strategies", () => {
    const strategies = [createTestStrategy()];
    const optimizer = createOptimizer(strategies);

    expect(optimizer.getStrategy("test-strategy")).toBeDefined();
  });

  it("should use default config values", () => {
    expect(DEFAULT_OPTIMIZER_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_OPTIMIZER_CONFIG.allowEscalation).toBe(true);
    expect(DEFAULT_OPTIMIZER_CONFIG.modelHierarchy).toContain("anthropic");
  });
});
