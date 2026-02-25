/**
 * Error Recovery Tests
 *
 * Tests for provider fallback, retry logic, and error recovery.
 * Target: ≥90% error recovery rate.
 *
 * @module tests/providers/error-recovery.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ResourceRouter, type ProviderId, type TaskType } from "../../src/providers/resource-router.js";
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from "../../src/providers/types.js";
import { ProviderError } from "../../src/providers/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock provider.
 */
function createMockProvider(
  id: string,
  behavior: "success" | "rate_limit" | "timeout" | "auth_error" | "service_error" | "always_fail"
): AIProvider {
  return {
    id,
    name: `Mock ${id}`,
    models: [
      {
        id: "test-model",
        name: "Test Model",
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportedFeatures: ["chat"],
      },
    ],
    async initialize() {},
    async dispose() {},
    async chat(): Promise<ChatResponse> {
      switch (behavior) {
        case "success":
          return {
            id: "test-response",
            model: "test-model",
            content: "Test response",
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            finishReason: "stop",
          };
        case "rate_limit":
          throw new ProviderError(
            "Rate limit exceeded",
            id,
            "RATE_LIMIT",
            true
          );
        case "timeout":
          throw new ProviderError(
            "Request timeout",
            id,
            "TIMEOUT",
            true
          );
        case "auth_error":
          throw new ProviderError(
            "Authentication failed",
            id,
            "AUTH_ERROR",
            false
          );
        case "service_error":
          throw new ProviderError(
            "Service error",
            id,
            "SERVICE_ERROR",
            true
          );
        case "always_fail":
          throw new ProviderError(
            "Always fails",
            id,
            "UNKNOWN",
            false
          );
      }
    },
    async *chatStream() {
      throw new Error("Not implemented");
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { status: "healthy" };
    },
  };
}

/**
 * Create a flaky provider that fails sometimes.
 */
function createFlakyProvider(
  id: string,
  failureRate: number
): AIProvider {
  let attempts = 0;
  return {
    id,
    name: `Flaky ${id}`,
    models: [
      {
        id: "test-model",
        name: "Test Model",
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportedFeatures: ["chat"],
      },
    ],
    async initialize() {},
    async dispose() {},
    async chat(): Promise<ChatResponse> {
      attempts++;
      if (Math.random() < failureRate) {
        throw new ProviderError(
          "Flaky failure",
          id,
          "SERVICE_ERROR",
          true
        );
      }
      return {
        id: `response-${attempts}`,
        model: "test-model",
        content: `Response ${attempts}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: "stop",
      };
    },
    async *chatStream() {
      throw new Error("Not implemented");
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { status: "healthy" };
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Error Recovery", () => {
  describe("Provider Fallback Chain", () => {
    it("should fall back to secondary provider when primary fails", async () => {
      const router = new ResourceRouter();

      // Register primary (fails) and secondary (succeeds)
      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createMockProvider("openai", "rate_limit"),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      router.registerProvider({
        id: "gemini" as ProviderId,
        name: "Gemini",
        provider: createMockProvider("gemini", "success"),
        models: ["gemini-2.0"],
        defaultModel: "gemini-2.0",
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        priority: 2,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      // First request fails on primary
      const decision1 = router.route("general");
      expect(decision1.providerId).toBe("openai");

      // Simulate failure
      try {
        await router.executeWithProvider("openai" as ProviderId, {
          model: "gpt-4o",
          messages: [{ role: "user", content: "test" }],
        });
      } catch (e) {
        // Expected
        router.reportError("openai" as ProviderId, "RATE_LIMIT");
      }

      // After enough failures, fallback should be chosen
      router.reportError("openai" as ProviderId, "RATE_LIMIT");
      router.reportError("openai" as ProviderId, "RATE_LIMIT");
      router.reportError("openai" as ProviderId, "RATE_LIMIT");
      router.reportError("openai" as ProviderId, "RATE_LIMIT");

      // Now primary should be unhealthy
      expect(router.isHealthy("openai" as ProviderId)).toBe(false);

      // New routing should pick secondary
      const decision2 = router.route("general");
      expect(decision2.providerId).toBe("gemini");

      // Execute on secondary should succeed
      const response = await router.executeWithProvider("gemini" as ProviderId, {
        model: "gemini-2.0",
        messages: [{ role: "user", content: "test" }],
      });
      expect(response.content).toBe("Test response");
    });

    it("should track health correctly after failures", () => {
      const router = new ResourceRouter();

      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createMockProvider("openai", "success"),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      // Initially healthy
      expect(router.isHealthy("openai" as ProviderId)).toBe(true);

      // Report some errors
      router.reportError("openai" as ProviderId, "RATE_LIMIT");

      // After 1 error, should still be "healthy" (threshold not reached)
      const health = router.getHealth("openai" as ProviderId);
      expect(health).toBeDefined();
      expect(health!.totalRequests).toBe(1);
      expect(health!.failedRequests).toBe(1);
    });
  });

  describe("Retryable Error Handling", () => {
    it("should identify retryable errors correctly", () => {
      const rateLimitError = new ProviderError(
        "Rate limited",
        "test",
        "RATE_LIMIT",
        true
      );
      const authError = new ProviderError(
        "Auth failed",
        "test",
        "AUTH_ERROR",
        false
      );

      expect(rateLimitError.retryable).toBe(true);
      expect(authError.retryable).toBe(false);
    });

    it("should allow recovery after rate limit clears", async () => {
      const router = new ResourceRouter();

      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createMockProvider("openai", "success"),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      // Mark unhealthy
      router.markUnhealthy("openai" as ProviderId, "Rate limited");
      expect(router.isHealthy("openai" as ProviderId)).toBe(false);

      // Mark healthy again (simulating recovery)
      router.markHealthy("openai" as ProviderId);
      expect(router.isHealthy("openai" as ProviderId)).toBe(true);
    });
  });

  describe("Error Recovery Rate", () => {
    it("should achieve ≥90% recovery rate with fallback", async () => {
      const router = new ResourceRouter();
      const totalAttempts = 100;
      let successfulRecoveries = 0;

      // Register primary (50% failure) and backup (100% success)
      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createFlakyProvider("openai", 0.5),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      router.registerProvider({
        id: "gemini" as ProviderId,
        name: "Gemini",
        provider: createMockProvider("gemini", "success"),
        models: ["gemini-2.0"],
        defaultModel: "gemini-2.0",
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        priority: 2,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "test" }],
      };

      for (let i = 0; i < totalAttempts; i++) {
        const decision = router.route("general");
        let recovered = false;

        // Try primary first
        try {
          await router.executeWithProvider(decision.providerId, request);
          recovered = true;
        } catch {
          // Primary failed, try fallback
          for (const alt of decision.alternatives) {
            try {
              await router.executeWithProvider(alt, request);
              recovered = true;
              break;
            } catch {
              // Continue to next alternative
            }
          }
        }

        if (recovered) {
          successfulRecoveries++;
        }
      }

      const recoveryRate = successfulRecoveries / totalAttempts;
      expect(recoveryRate).toBeGreaterThanOrEqual(0.9);
    });

    it("should handle cascading failures gracefully", async () => {
      const router = new ResourceRouter();

      // All providers fail
      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createMockProvider("openai", "always_fail"),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      router.registerProvider({
        id: "gemini" as ProviderId,
        name: "Gemini",
        provider: createMockProvider("gemini", "always_fail"),
        models: ["gemini-2.0"],
        defaultModel: "gemini-2.0",
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        priority: 2,
        specialties: ["general" as TaskType],
        enabled: true,
      });

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "test" }],
      };

      // Should fail gracefully without crashing
      const decision = router.route("general");
      let allFailed = true;

      try {
        await router.executeWithProvider(decision.providerId, request);
        allFailed = false;
      } catch {
        for (const alt of decision.alternatives) {
          try {
            await router.executeWithProvider(alt, request);
            allFailed = false;
            break;
          } catch {
            // Continue
          }
        }
      }

      // All providers failed as expected
      expect(allFailed).toBe(true);
    });
  });

  describe("Multi-Model Consultation Recovery", () => {
    it("should complete consultation even with partial failures", async () => {
      const router = new ResourceRouter({
        enableMultiModel: true,
        minConsultationProviders: 2,
        maxParallelQueries: 3,
      });

      // One fails, two succeed
      router.registerProvider({
        id: "openai" as ProviderId,
        name: "OpenAI",
        provider: createMockProvider("openai", "timeout"),
        models: ["gpt-4o"],
        defaultModel: "gpt-4o",
        inputCostPer1K: 0.01,
        outputCostPer1K: 0.03,
        priority: 1,
        specialties: ["architecture" as TaskType],
        enabled: true,
      });

      router.registerProvider({
        id: "gemini" as ProviderId,
        name: "Gemini",
        provider: createMockProvider("gemini", "success"),
        models: ["gemini-2.0"],
        defaultModel: "gemini-2.0",
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        priority: 2,
        specialties: ["architecture" as TaskType],
        enabled: true,
      });

      router.registerProvider({
        id: "ollama" as ProviderId,
        name: "Ollama",
        provider: createMockProvider("ollama", "success"),
        models: ["qwen3"],
        defaultModel: "qwen3",
        inputCostPer1K: 0.0,
        outputCostPer1K: 0.0,
        priority: 3,
        specialties: ["architecture" as TaskType],
        enabled: true,
      });

      const result = await router.consult(
        {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Design architecture" }],
        },
        "architecture"
      );

      // Should have responses from at least 2 providers
      const successResponses = result.responses.filter(
        (r) => r.status === "success"
      );
      expect(successResponses.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Rate Limiter Integration", () => {
    it("should throw retryable error when rate limited", () => {
      const error = new ProviderError(
        "Rate limit exceeded",
        "test-provider",
        "RATE_LIMIT",
        true
      );

      expect(error.retryable).toBe(true);
      expect(error.code).toBe("PROVIDER_RATE_LIMITED"); // Mapped code from base hierarchy
    });

    it("should preserve legacy code for backward compatibility", () => {
      const error = new ProviderError(
        "Rate limit exceeded",
        "test-provider",
        "RATE_LIMIT",
        true
      );

      // The error should have the legacy code accessible via legacyCode
      expect(error.legacyCode).toBe("RATE_LIMIT");
      // The base class code is the mapped value
      expect(error.code).toBe("PROVIDER_RATE_LIMITED");
    });
  });
});
