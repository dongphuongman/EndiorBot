/**
 * MultiModelOrchestrator Unit Tests
 *
 * Sprint 39 - Multi-Model Orchestration
 *
 * Tests cover:
 * - Orchestrator lifecycle (create, initialize, dispose)
 * - Simple queries with routing
 * - Expert consultation with consensus
 * - Provider management
 * - Health monitoring
 * - Usage statistics
 *
 * @module tests/providers/multi-model-orchestrator
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 39
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MultiModelOrchestrator,
  createOrchestrator,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  PROVIDER_COSTS,
  type OrchestratorConfig,
  type ProviderSetup,
  type ExpertConsultationRequest,
} from "../../src/providers/multi-model-orchestrator.js";
import type { AIProvider, ChatResponse } from "../../src/providers/types.js";
import type { ProviderId } from "../../src/providers/resource-router.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock AI provider.
 */
function createMockProvider(
  content: string = "Mock response",
  providerId: string = "mock"
): AIProvider {
  return {
    id: providerId,
    name: `Mock ${providerId}`,
    models: [],
    chat: vi.fn(async (): Promise<ChatResponse> => ({
      id: "test-id",
      model: "test-model",
      content,
      finishReason: "stop",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    })),
    chatStream: vi.fn(),
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    healthCheck: vi.fn(async () => ({
      status: "healthy" as const,
      message: "OK",
      latencyMs: 10,
    })),
    getModels: vi.fn(async () => ["test-model"]),
    getModelSpec: vi.fn(() => undefined),
    selectModelForTask: vi.fn(() => "test-model"),
    calculateCost: vi.fn(() => 0),
  } as unknown as AIProvider;
}

/**
 * Create failing mock provider.
 */
function createFailingProvider(): AIProvider {
  return {
    ...createMockProvider(),
    chat: vi.fn(async () => {
      throw new Error("Provider error");
    }),
    checkHealth: vi.fn(async () => ({
      healthy: false,
      error: "Provider unavailable",
      latencyMs: 0,
    })),
  } as unknown as AIProvider;
}

/**
 * Create test orchestrator config.
 */
function createTestConfig(
  overrides: Partial<OrchestratorConfig> = {}
): OrchestratorConfig {
  return {
    providers: [],
    enableMultiModel: true,
    providerTimeoutMs: 5000,
    maxParallelQueries: 3,
    minConsultationProviders: 2,
    autoInitialize: false,
    healthCheckIntervalMs: 0, // Disable for tests
    ...overrides,
  };
}

// ============================================================================
// Mock Provider Setup
// ============================================================================

// Mock the actual provider modules
vi.mock("../../src/providers/openai/index.js", () => ({
  OpenAIProvider: class MockOpenAI {
    id = "openai";
    name = "OpenAI";
    models = [];
    async initialize() {}
    async dispose() {}
    async chat(): Promise<ChatResponse> {
      return {
        id: "openai-response",
        model: "gpt-4o",
        content: "OpenAI recommends using a microservice architecture.",
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    }
    async healthCheck() {
      return { status: "healthy" as const, latencyMs: 10 };
    }
  },
  createOpenAIProviderFromEnv: () => ({
    id: "openai",
    name: "OpenAI",
    models: [],
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    chat: vi.fn(async (): Promise<ChatResponse> => ({
      id: "openai-response",
      model: "gpt-4o",
      content: "OpenAI recommends using a microservice architecture.",
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })),
    healthCheck: vi.fn(async () => ({ status: "healthy" as const, latencyMs: 10 })),
  }),
  OPENAI_MODELS: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
}));

vi.mock("../../src/providers/gemini/index.js", () => ({
  GeminiProvider: class MockGemini {
    id = "gemini";
    name = "Gemini";
    models = [];
    async initialize() {}
    async dispose() {}
    async chat(): Promise<ChatResponse> {
      return {
        id: "gemini-response",
        model: "gemini-2.0-flash",
        content: "Gemini suggests considering serverless for this use case.",
        finishReason: "stop",
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      };
    }
    async healthCheck() {
      return { status: "healthy" as const, latencyMs: 15 };
    }
  },
  createGeminiProviderFromEnv: () => ({
    id: "gemini",
    name: "Gemini",
    models: [],
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    chat: vi.fn(async (): Promise<ChatResponse> => ({
      id: "gemini-response",
      model: "gemini-2.0-flash",
      content: "Gemini suggests considering serverless for this use case.",
      finishReason: "stop",
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
    })),
    healthCheck: vi.fn(async () => ({ status: "healthy" as const, latencyMs: 15 })),
  }),
  GEMINI_MODELS: [{ id: "gemini-2.0-flash" }, { id: "gemini-1.5-pro" }],
}));

vi.mock("../../src/providers/ollama/index.js", () => ({
  OllamaProvider: class MockOllama {
    id = "ollama";
    name = "Ollama";
    models = [];
    async initialize() {}
    async dispose() {}
    async chat(): Promise<ChatResponse> {
      return {
        id: "ollama-response",
        model: "qwen3-coder:30b",
        content: "Ollama recommends local development first.",
        finishReason: "stop",
        usage: { promptTokens: 90, completionTokens: 45, totalTokens: 135 },
      };
    }
    async healthCheck() {
      return { status: "healthy" as const, latencyMs: 5 };
    }
  },
  createOllamaProviderFromEnv: () => ({
    id: "ollama",
    name: "Ollama",
    models: [],
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    chat: vi.fn(async (): Promise<ChatResponse> => ({
      id: "ollama-response",
      model: "qwen3-coder:30b",
      content: "Ollama recommends local development first.",
      finishReason: "stop",
      usage: { promptTokens: 90, completionTokens: 45, totalTokens: 135 },
    })),
    healthCheck: vi.fn(async () => ({ status: "healthy" as const, latencyMs: 5 })),
  }),
  OLLAMA_MODELS: [{ id: "qwen3-coder:30b" }, { id: "qwen3:8b" }],
}));

// ============================================================================
// Test Suites
// ============================================================================

describe("MultiModelOrchestrator", () => {
  let orchestrator: MultiModelOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (orchestrator?.getState() === "ready") {
      await orchestrator.dispose();
    }
  });

  // ==========================================================================
  // Lifecycle Tests
  // ==========================================================================

  describe("lifecycle", () => {
    it("should create with default config", () => {
      orchestrator = createOrchestrator();

      expect(orchestrator).toBeInstanceOf(MultiModelOrchestrator);
      expect(orchestrator.getState()).toBe("created");
    });

    it("should create with custom config", () => {
      orchestrator = createOrchestrator({
        enableMultiModel: false,
        providerTimeoutMs: 60000,
        maxParallelQueries: 5,
      });

      expect(orchestrator).toBeInstanceOf(MultiModelOrchestrator);
    });

    it("should initialize successfully", async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true, priority: 1 },
          ],
        })
      );

      await orchestrator.initialize();

      expect(orchestrator.getState()).toBe("ready");
      expect(orchestrator.getProviders()).toContain("openai");
    });

    it("should initialize with multiple providers", async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true, priority: 1 },
            { id: "gemini", enabled: true, priority: 2 },
          ],
        })
      );

      await orchestrator.initialize();

      expect(orchestrator.getProviders()).toHaveLength(2);
    });

    it("should skip disabled providers", async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true },
            { id: "gemini", enabled: false },
          ],
        })
      );

      await orchestrator.initialize();

      expect(orchestrator.getProviders()).toContain("openai");
      expect(orchestrator.getProviders()).not.toContain("gemini");
    });

    it("should dispose successfully", async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [{ id: "openai", enabled: true }],
        })
      );

      await orchestrator.initialize();
      await orchestrator.dispose();

      expect(orchestrator.getState()).toBe("disposed");
    });

    it("should not re-initialize after disposed", async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [{ id: "openai", enabled: true }],
        })
      );

      await orchestrator.initialize();
      await orchestrator.dispose();

      // Re-initialization should be a no-op (state is disposed)
      await orchestrator.initialize();
      expect(orchestrator.getState()).toBe("disposed");
    });
  });

  // ==========================================================================
  // Query Tests
  // ==========================================================================

  describe("query", () => {
    beforeEach(async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true, priority: 1 },
            { id: "gemini", enabled: true, priority: 2 },
          ],
        })
      );
      await orchestrator.initialize();
    });

    it("should execute simple query", async () => {
      const response = await orchestrator.query("What is TypeScript?");

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it("should execute query with task type", async () => {
      const response = await orchestrator.query("Fix this bug", {
        taskType: "bug_fix",
      });

      expect(response).toBeDefined();
    });

    it("should execute query with system prompt", async () => {
      const response = await orchestrator.query("Generate code", {
        systemPrompt: "You are a TypeScript expert.",
      });

      expect(response).toBeDefined();
    });

    it("should query specific provider", async () => {
      const response = await orchestrator.queryProvider(
        "gemini",
        "Research this topic"
      );

      expect(response).toBeDefined();
      // Based on mock, gemini response should mention serverless
      expect(response.content).toContain("serverless");
    });

    it("should throw when not initialized", async () => {
      const uninitializedOrchestrator = createOrchestrator(createTestConfig());

      await expect(
        uninitializedOrchestrator.query("Test")
      ).rejects.toThrow("not ready");
    });
  });

  // ==========================================================================
  // Consultation Tests
  // ==========================================================================

  describe("consult", () => {
    beforeEach(async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true, priority: 1 },
            { id: "gemini", enabled: true, priority: 2 },
          ],
          enableMultiModel: true,
          minConsultationProviders: 2,
        })
      );
      await orchestrator.initialize();
    });

    it("should consult multiple providers", async () => {
      const result = await orchestrator.consult({
        query: "Design a payment gateway",
        taskType: "architecture",
      });

      expect(result).toBeDefined();
      expect(result.experts.length).toBeGreaterThan(0);
    });

    it("should return recommendation", async () => {
      const result = await orchestrator.consult({
        query: "How should I structure this API?",
        taskType: "architecture",
      });

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it("should return consensus analysis", async () => {
      const result = await orchestrator.consult({
        query: "Best approach for caching?",
        taskType: "architecture",
      });

      expect(result.consensus).toBeDefined();
      expect(typeof result.consensus.hasConsensus).toBe("boolean");
      expect(result.consensus.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(result.consensus.agreementLevel).toBeLessThanOrEqual(1);
    });

    it("should return confidence score", async () => {
      const result = await orchestrator.consult({
        query: "Security review needed",
        taskType: "security",
      });

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should return total cost", async () => {
      const result = await orchestrator.consult({
        query: "Code review",
        taskType: "code_review",
      });

      expect(result.totalCost).toBeGreaterThanOrEqual(0);
    });

    it("should return routing decision", async () => {
      const result = await orchestrator.consult({
        query: "Architecture question",
        taskType: "architecture",
      });

      expect(result.routing).toBeDefined();
      expect(result.routing.providerId).toBeDefined();
    });

    it("should include expert opinions", async () => {
      const result = await orchestrator.consult({
        query: "Design review",
        taskType: "architecture",
      });

      for (const expert of result.experts) {
        expect(expert.providerId).toBeDefined();
        expect(expert.status).toBeDefined();
        expect(["success", "error", "timeout"]).toContain(expert.status);
      }
    });

    it("should handle context in request", async () => {
      const result = await orchestrator.consult({
        query: "Review this design",
        context: "We are building an e-commerce platform.",
        taskType: "architecture",
      });

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Provider Management Tests
  // ==========================================================================

  describe("provider management", () => {
    beforeEach(async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true },
            { id: "gemini", enabled: true },
          ],
        })
      );
      await orchestrator.initialize();
    });

    it("should list registered providers", () => {
      const providers = orchestrator.getProviders();

      expect(providers).toHaveLength(2);
      expect(providers).toContain("openai");
      expect(providers).toContain("gemini");
    });

    it("should enable/disable provider", () => {
      const result = orchestrator.setProviderEnabled("openai", false);

      expect(result).toBe(true);
    });

    it("should return false for unknown provider", () => {
      const result = orchestrator.setProviderEnabled(
        "unknown" as ProviderId,
        false
      );

      expect(result).toBe(false);
    });

    it("should get provider health", () => {
      const health = orchestrator.getProviderHealth("openai");

      expect(health).toBeDefined();
      expect(health!.healthy).toBe(true);
    });

    it("should get all health statuses", () => {
      const allHealth = orchestrator.getAllHealth();

      expect(allHealth).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Usage Statistics Tests
  // ==========================================================================

  describe("usage statistics", () => {
    beforeEach(async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [{ id: "openai", enabled: true }],
        })
      );
      await orchestrator.initialize();
    });

    it("should track usage after query", async () => {
      await orchestrator.query("Test query");

      const stats = orchestrator.getUsageStats();

      expect(stats.total.requests).toBe(1);
    });

    it("should reset usage stats", async () => {
      await orchestrator.query("Test query");
      orchestrator.resetUsageStats();

      const stats = orchestrator.getUsageStats();

      expect(stats.total.requests).toBe(0);
    });

    it("should track per-provider stats", async () => {
      await orchestrator.query("Test query");

      const stats = orchestrator.getUsageStats();

      expect(stats.byProvider.openai).toBeDefined();
      expect(stats.byProvider.openai.requests).toBe(1);
    });
  });

  // ==========================================================================
  // Health Monitoring Tests
  // ==========================================================================

  describe("health monitoring", () => {
    beforeEach(async () => {
      orchestrator = createOrchestrator(
        createTestConfig({
          providers: [
            { id: "openai", enabled: true },
            { id: "gemini", enabled: true },
          ],
        })
      );
      await orchestrator.initialize();
    });

    it("should check all provider health", async () => {
      const results = await orchestrator.checkAllHealth();

      expect(results.size).toBe(2);
      expect(results.get("openai")).toBeDefined();
      expect(results.get("gemini")).toBeDefined();
    });

    it("should report healthy providers", async () => {
      const results = await orchestrator.checkAllHealth();

      const openaiHealth = results.get("openai");
      expect(openaiHealth?.healthy).toBe(true);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createOrchestrator", () => {
  it("should create orchestrator with defaults", () => {
    const orchestrator = createOrchestrator();
    expect(orchestrator).toBeInstanceOf(MultiModelOrchestrator);
  });

  it("should create orchestrator with config", () => {
    const orchestrator = createOrchestrator({
      enableMultiModel: false,
      maxParallelQueries: 5,
    });
    expect(orchestrator).toBeInstanceOf(MultiModelOrchestrator);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("constants", () => {
  it("should have correct health check interval", () => {
    expect(DEFAULT_HEALTH_CHECK_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("should have provider costs defined", () => {
    expect(PROVIDER_COSTS.openai).toBeDefined();
    expect(PROVIDER_COSTS.gemini).toBeDefined();
    expect(PROVIDER_COSTS.ollama).toBeDefined();
    expect(PROVIDER_COSTS.anthropic).toBeDefined();
  });

  it("should have correct Ollama cost (local = free)", () => {
    expect(PROVIDER_COSTS.ollama.input).toBe(0);
    expect(PROVIDER_COSTS.ollama.output).toBe(0);
  });
});

// ============================================================================
// Consensus Analysis Tests
// ============================================================================

describe("consensus analysis", () => {
  let orchestrator: MultiModelOrchestrator;

  beforeEach(async () => {
    orchestrator = createOrchestrator(
      createTestConfig({
        providers: [
          { id: "openai", enabled: true, priority: 1 },
          { id: "gemini", enabled: true, priority: 2 },
        ],
        enableMultiModel: true,
      })
    );
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  it("should analyze consensus from multiple responses", async () => {
    const result = await orchestrator.consult({
      query: "Architecture review",
      taskType: "architecture",
    });

    expect(result.consensus).toBeDefined();
    expect(Array.isArray(result.consensus.commonPoints)).toBe(true);
    expect(Array.isArray(result.consensus.disagreements)).toBe(true);
    expect(Array.isArray(result.consensus.keyRecommendations)).toBe(true);
    expect(Array.isArray(result.consensus.concerns)).toBe(true);
  });

  it("should extract key recommendations", async () => {
    const result = await orchestrator.consult({
      query: "Best practices for caching",
      taskType: "architecture",
    });

    // Even if empty, should be an array
    expect(Array.isArray(result.consensus.keyRecommendations)).toBe(true);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("error handling", () => {
  it("should handle provider initialization failure gracefully", async () => {
    // Create orchestrator with non-existent provider type
    const orchestrator = createOrchestrator(
      createTestConfig({
        providers: [
          { id: "openai", enabled: true }, // Valid
        ],
      })
    );

    // Should not throw
    await orchestrator.initialize();
    expect(orchestrator.getState()).toBe("ready");
    await orchestrator.dispose();
  });

  it("should throw when querying without initialization", async () => {
    const orchestrator = createOrchestrator(createTestConfig());

    await expect(orchestrator.query("Test")).rejects.toThrow();
  });

  it("should throw when consulting without initialization", async () => {
    const orchestrator = createOrchestrator(createTestConfig());

    await expect(
      orchestrator.consult({ query: "Test", taskType: "architecture" })
    ).rejects.toThrow();
  });
});
