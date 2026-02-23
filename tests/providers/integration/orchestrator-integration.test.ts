/**
 * MultiModelOrchestrator Integration Tests
 *
 * Sprint 39 - Integration tests for multi-model orchestration
 *
 * Tests the orchestrator with actual (mocked) providers to verify:
 * - End-to-end query flow
 * - Expert consultation with multiple providers
 * - Routing decisions and failover
 * - Cost tracking accuracy
 *
 * @module tests/providers/integration/orchestrator-integration
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 39
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ResourceRouter,
  createResourceRouter,
  type ProviderId,
  type ProviderConfig,
} from "../../../src/providers/resource-router.js";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
} from "../../../src/providers/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock AI provider for integration tests.
 */
function createIntegrationMockProvider(
  id: ProviderId,
  config: {
    content?: string;
    latencyMs?: number;
    shouldFail?: boolean;
    failAfterCalls?: number;
    healthStatus?: "healthy" | "degraded" | "unhealthy";
  } = {}
): AIProvider {
  let callCount = 0;
  const {
    content = `Response from ${id}`,
    latencyMs = 0,
    shouldFail = false,
    failAfterCalls = Infinity,
    healthStatus = "healthy",
  } = config;

  return {
    id,
    name: `${id} Provider`,
    models: [],

    chat: vi.fn(async (request: ChatRequest): Promise<ChatResponse> => {
      callCount++;

      if (shouldFail || callCount > failAfterCalls) {
        throw new Error(`${id} provider error`);
      }

      // Simulate latency
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      return {
        id: `${id}-response-${callCount}`,
        model: request.model || "default-model",
        content: `${content} (call ${callCount})`,
        finishReason: "stop",
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    }),

    chatStream: vi.fn(),

    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),

    healthCheck: vi.fn(async (): Promise<ProviderHealth> => ({
      status: healthStatus,
      latencyMs: 10,
      message: healthStatus === "healthy" ? "OK" : "Provider issues",
    })),

    getModels: vi.fn(async () => ["model-1", "model-2"]),
    getModelSpec: vi.fn(() => undefined),
    selectModelForTask: vi.fn(() => "default-model"),
    calculateCost: vi.fn(() => 0),
  } as unknown as AIProvider;
}

/**
 * Create a full provider config for the router.
 */
function createRouterProviderConfig(
  id: ProviderId,
  provider: AIProvider,
  overrides: Partial<ProviderConfig> = {}
): ProviderConfig {
  return {
    id,
    name: `${id} Provider`,
    provider,
    models: ["model-1", "model-2"],
    defaultModel: "model-1",
    inputCostPer1K: id === "openai" ? 0.003 : id === "gemini" ? 0.0001 : 0,
    outputCostPer1K: id === "openai" ? 0.015 : id === "gemini" ? 0.0003 : 0,
    priority: id === "openai" ? 1 : id === "gemini" ? 2 : 3,
    specialties: [],
    enabled: true,
    ...overrides,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("Orchestrator Integration", () => {
  let router: ResourceRouter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // End-to-End Query Flow
  // ==========================================================================

  describe("end-to-end query flow", () => {
    beforeEach(() => {
      router = createResourceRouter({
        enableMultiModel: true,
        maxParallelQueries: 3,
        minConsultationProviders: 2,
      });

      // Register providers
      const openai = createIntegrationMockProvider("openai", {
        content: "OpenAI analysis",
      });
      const gemini = createIntegrationMockProvider("gemini", {
        content: "Gemini analysis",
      });
      const ollama = createIntegrationMockProvider("ollama", {
        content: "Ollama analysis",
      });

      router.registerProvider(createRouterProviderConfig("openai", openai));
      router.registerProvider(createRouterProviderConfig("gemini", gemini));
      router.registerProvider(createRouterProviderConfig("ollama", ollama));
    });

    it("should execute single query with routing", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test query" }],
      };

      const response = await router.execute(request, "general");

      expect(response).toBeDefined();
      expect(response.content).toContain("OpenAI"); // Highest priority
    });

    it("should execute multi-model consultation", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Architecture question" }],
      };

      const result = await router.consult(request, "architecture");

      expect(result.responses.length).toBeGreaterThan(1);
      expect(result.consensus).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
    });

    it("should track usage across queries", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      await router.execute(request, "general");
      await router.execute(request, "general");

      const stats = router.getUsageStats();

      expect(stats.total.requests).toBe(2);
      expect(stats.byProvider.openai.requests).toBe(2);
    });
  });

  // ==========================================================================
  // Failover Scenarios
  // ==========================================================================

  describe("failover scenarios", () => {
    it("should failover to next provider on error", async () => {
      router = createResourceRouter();

      // OpenAI fails, Gemini should handle
      const failingOpenai = createIntegrationMockProvider("openai", {
        shouldFail: true,
      });
      const workingGemini = createIntegrationMockProvider("gemini", {
        content: "Gemini fallback",
      });

      router.registerProvider(
        createRouterProviderConfig("openai", failingOpenai, { priority: 1 })
      );
      router.registerProvider(
        createRouterProviderConfig("gemini", workingGemini, { priority: 2 })
      );

      // Mark OpenAI as unhealthy after first failure
      router.markUnhealthy("openai", "Test failure");

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      const response = await router.execute(request, "general");

      expect(response.content).toContain("Gemini");
    });

    it("should skip disabled providers", async () => {
      router = createResourceRouter();

      const openai = createIntegrationMockProvider("openai");
      const gemini = createIntegrationMockProvider("gemini", {
        content: "Gemini active",
      });

      router.registerProvider(createRouterProviderConfig("openai", openai));
      router.registerProvider(createRouterProviderConfig("gemini", gemini));

      router.setProviderEnabled("openai", false);

      const decision = router.route("general");

      expect(decision.providerId).toBe("gemini");
    });

    it("should handle partial consultation failures", async () => {
      router = createResourceRouter({
        enableMultiModel: true,
        maxParallelQueries: 3,
      });

      const workingOpenai = createIntegrationMockProvider("openai", {
        content: "OpenAI works",
      });
      const failingGemini = createIntegrationMockProvider("gemini", {
        shouldFail: true,
      });
      const workingOllama = createIntegrationMockProvider("ollama", {
        content: "Ollama works",
      });

      router.registerProvider(createRouterProviderConfig("openai", workingOpenai));
      router.registerProvider(createRouterProviderConfig("gemini", failingGemini));
      router.registerProvider(createRouterProviderConfig("ollama", workingOllama));

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await router.consult(request, "architecture");

      const successResponses = result.responses.filter((r) => r.status === "success");
      const errorResponses = result.responses.filter((r) => r.status === "error");

      expect(successResponses.length).toBeGreaterThan(0);
      expect(errorResponses.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  describe("cost tracking", () => {
    beforeEach(() => {
      router = createResourceRouter({
        enableMultiModel: true,
      });

      const openai = createIntegrationMockProvider("openai");
      const gemini = createIntegrationMockProvider("gemini");

      // OpenAI: $0.003/1K input, $0.015/1K output
      // Gemini: $0.0001/1K input, $0.0003/1K output
      router.registerProvider(
        createRouterProviderConfig("openai", openai, {
          inputCostPer1K: 0.003,
          outputCostPer1K: 0.015,
        })
      );
      router.registerProvider(
        createRouterProviderConfig("gemini", gemini, {
          inputCostPer1K: 0.0001,
          outputCostPer1K: 0.0003,
        })
      );
    });

    it("should track cost per provider", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      await router.executeWithProvider("openai", request);
      await router.executeWithProvider("gemini", request);

      const stats = router.getUsageStats();

      // OpenAI cost: (100/1000 * 0.003) + (50/1000 * 0.015) = 0.0003 + 0.00075 = 0.00105
      // Gemini cost: (100/1000 * 0.0001) + (50/1000 * 0.0003) = 0.00001 + 0.000015 = 0.000025

      expect(stats.byProvider.openai.cost).toBeCloseTo(0.00105, 5);
      expect(stats.byProvider.gemini.cost).toBeCloseTo(0.000025, 6);

      // Gemini should be cheaper
      expect(stats.byProvider.gemini.cost).toBeLessThan(stats.byProvider.openai.cost);
    });

    it("should track total cost across consultation", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await router.consult(request, "architecture");

      expect(result.totalCost).toBeGreaterThan(0);
    });

    it("should reset usage stats", async () => {
      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      await router.execute(request, "general");

      router.resetUsageStats();

      const stats = router.getUsageStats();
      expect(stats.total.requests).toBe(0);
      expect(stats.total.cost).toBe(0);
    });
  });

  // ==========================================================================
  // Health Monitoring Integration
  // ==========================================================================

  describe("health monitoring integration", () => {
    it("should update health after successful request", async () => {
      router = createResourceRouter();

      const provider = createIntegrationMockProvider("openai");
      router.registerProvider(createRouterProviderConfig("openai", provider));

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      await router.execute(request, "general");

      const health = router.getHealth("openai");

      expect(health?.healthy).toBe(true);
      expect(health?.totalRequests).toBe(1);
      expect(health?.failedRequests).toBe(0);
      expect(health?.successRate).toBe(1);
    });

    it("should update health after failed request", async () => {
      router = createResourceRouter();

      const failingProvider = createIntegrationMockProvider("openai", {
        shouldFail: true,
      });
      const backupProvider = createIntegrationMockProvider("gemini");

      router.registerProvider(createRouterProviderConfig("openai", failingProvider));
      router.registerProvider(createRouterProviderConfig("gemini", backupProvider));

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      try {
        await router.executeWithProvider("openai", request);
      } catch {
        // Expected
      }

      const health = router.getHealth("openai");

      expect(health?.failedRequests).toBe(1);
      expect(health?.successRate).toBeLessThan(1);
    });

    it("should skip unhealthy providers in routing", async () => {
      router = createResourceRouter();

      const openai = createIntegrationMockProvider("openai");
      const gemini = createIntegrationMockProvider("gemini", {
        content: "Gemini handles it",
      });

      router.registerProvider(
        createRouterProviderConfig("openai", openai, { priority: 1 })
      );
      router.registerProvider(
        createRouterProviderConfig("gemini", gemini, { priority: 2 })
      );

      // Mark OpenAI unhealthy
      router.markUnhealthy("openai", "Simulated outage");

      const decision = router.route("general");

      expect(decision.providerId).toBe("gemini");
      expect(decision.alternatives).not.toContain("openai");
    });
  });

  // ==========================================================================
  // Routing Decisions
  // ==========================================================================

  describe("routing decisions", () => {
    beforeEach(() => {
      router = createResourceRouter({
        enableMultiModel: true,
        maxParallelQueries: 3,
      });

      const openai = createIntegrationMockProvider("openai");
      const gemini = createIntegrationMockProvider("gemini");
      const ollama = createIntegrationMockProvider("ollama");

      router.registerProvider(
        createRouterProviderConfig("openai", openai, {
          priority: 1,
          specialties: ["code_generation", "bug_fix"],
        })
      );
      router.registerProvider(
        createRouterProviderConfig("gemini", gemini, {
          priority: 2,
          specialties: ["research", "architecture"],
        })
      );
      router.registerProvider(
        createRouterProviderConfig("ollama", ollama, {
          priority: 3,
          specialties: ["code_generation"],
        })
      );
    });

    it("should route architecture tasks to multi-model", () => {
      const decision = router.route("architecture");

      expect(decision.isMultiModel).toBe(true);
      expect(decision.consultationProviders).toBeDefined();
      expect(decision.consultationProviders!.length).toBeGreaterThan(1);
    });

    it("should route code generation to single model", () => {
      const decision = router.route("code_generation");

      expect(decision.isMultiModel).toBe(false);
    });

    it("should include alternatives in decision", () => {
      const decision = router.route("general");

      expect(decision.alternatives.length).toBeGreaterThan(0);
      expect(decision.alternatives).not.toContain(decision.providerId);
    });

    it("should route security tasks to multi-model", () => {
      const decision = router.route("security");

      expect(decision.isMultiModel).toBe(true);
    });
  });

  // ==========================================================================
  // Concurrent Requests
  // ==========================================================================

  describe("concurrent requests", () => {
    it("should handle rapid concurrent queries", async () => {
      router = createResourceRouter();

      const provider = createIntegrationMockProvider("openai");
      router.registerProvider(createRouterProviderConfig("openai", provider));

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        router.execute(request, "general")
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.content).toContain("openai"); // lowercase provider id
      });

      const stats = router.getUsageStats();
      expect(stats.total.requests).toBe(10);
    });

    it("should handle concurrent consultations", async () => {
      router = createResourceRouter({
        enableMultiModel: true,
      });

      const openai = createIntegrationMockProvider("openai");
      const gemini = createIntegrationMockProvider("gemini");

      router.registerProvider(createRouterProviderConfig("openai", openai));
      router.registerProvider(createRouterProviderConfig("gemini", gemini));

      const request: ChatRequest = {
        model: "test-model",
        messages: [{ role: "user", content: "Test" }],
      };

      const [result1, result2] = await Promise.all([
        router.consult(request, "architecture"),
        router.consult(request, "security"),
      ]);

      expect(result1.responses.length).toBeGreaterThan(0);
      expect(result2.responses.length).toBeGreaterThan(0);
    });
  });
});
