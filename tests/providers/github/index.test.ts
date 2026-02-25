/**
 * GitHub Models Provider Tests
 *
 * Tests for GitHubModelsProvider with mock HTTP (no real API calls).
 *
 * @module tests/providers/github
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Day 2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GitHubModelsProvider,
  createGitHubModelsProvider,
  createGitHubModelsProviderFromEnv,
  GITHUB_MODELS,
  GITHUB_MODELS_BASE_URL,
  DEFAULT_GITHUB_MODEL,
  DEFAULT_GITHUB_RATE_LIMIT,
  GITHUB_FREE_MODELS,
  GITHUB_PRO_MODELS,
  getGitHubModel,
  getApiModelName,
  isFreeTierModel,
  selectModelForTask,
} from "../../../src/providers/github/index.js";
import type { ChatRequest, ProviderConfig } from "../../../src/providers/types.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock keytar
vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));

function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    body: null,
  } as unknown as Response;
}

function createMockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const readableStream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex] + "\n"));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    body: readableStream,
  } as unknown as Response;
}

function createChatResponse(content: string = "Test response"): unknown {
  return {
    id: "chatcmpl-github-123",
    object: "chat.completion",
    created: Date.now(),
    model: "openai/gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };
}

const mockProviderConfig: ProviderConfig = {
  apiKey: "test-github-pat",
};

async function createInitializedProvider(
  config?: Parameters<typeof createGitHubModelsProvider>[0]
): Promise<GitHubModelsProvider> {
  const provider = createGitHubModelsProvider(config);
  // Mock health check during initialization
  mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));
  await provider.initialize(mockProviderConfig);
  return provider;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("GitHubModelsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constants Tests
  // ==========================================================================

  describe("Constants", () => {
    it("should have correct base URL", () => {
      expect(GITHUB_MODELS_BASE_URL).toBe("https://models.inference.ai.azure.com");
    });

    it("should have correct default model", () => {
      expect(DEFAULT_GITHUB_MODEL).toBe("gpt-4o-mini");
    });

    it("should have correct default rate limit", () => {
      expect(DEFAULT_GITHUB_RATE_LIMIT).toBe(15);
    });

    it("should have GITHUB_MODELS array with expected models", () => {
      expect(GITHUB_MODELS.length).toBeGreaterThan(0);
      const modelIds = GITHUB_MODELS.map((m) => m.id);
      expect(modelIds).toContain("gpt-4o");
      expect(modelIds).toContain("gpt-4o-mini");
      expect(modelIds).toContain("llama-3.3-70b");
      expect(modelIds).toContain("phi-4");
    });

    it("should have free tier models", () => {
      expect(GITHUB_FREE_MODELS.length).toBeGreaterThan(0);
      expect(GITHUB_FREE_MODELS).toContain("gpt-4o-mini");
      expect(GITHUB_FREE_MODELS).toContain("llama-3.3-70b");
      expect(GITHUB_FREE_MODELS).toContain("phi-4");
    });

    it("should have pro tier models", () => {
      expect(GITHUB_PRO_MODELS.length).toBeGreaterThan(0);
      expect(GITHUB_PRO_MODELS).toContain("gpt-4o");
    });
  });

  // ==========================================================================
  // Config Helper Tests
  // ==========================================================================

  describe("Config Helpers", () => {
    it("should get model by ID", () => {
      const model = getGitHubModel("gpt-4o-mini");
      expect(model).toBeDefined();
      expect(model?.apiName).toBe("openai/gpt-4o-mini");
      expect(model?.tier).toBe("free");
    });

    it("should return undefined for unknown model", () => {
      const model = getGitHubModel("unknown-model");
      expect(model).toBeUndefined();
    });

    it("should get API model name", () => {
      expect(getApiModelName("gpt-4o")).toBe("openai/gpt-4o");
      expect(getApiModelName("llama-3.3-70b")).toBe("meta/llama-3.3-70b-instruct");
      expect(getApiModelName("phi-4")).toBe("microsoft/phi-4");
    });

    it("should check free tier model", () => {
      expect(isFreeTierModel("gpt-4o-mini")).toBe(true);
      expect(isFreeTierModel("phi-4")).toBe(true);
      expect(isFreeTierModel("gpt-4o")).toBe(false);
    });

    it("should select model for task", () => {
      expect(selectModelForTask("code_generation")).toBe("gpt-4o");
      expect(selectModelForTask("fast")).toBe("phi-4");
      expect(selectModelForTask("bug_fix")).toBe("gpt-4o-mini");
      expect(selectModelForTask("unknown_task")).toBe("gpt-4o-mini"); // Default
    });
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe("Initialization", () => {
    it("should create provider with default config", () => {
      const provider = createGitHubModelsProvider();
      expect(provider.id).toBe("github-models");
      expect(provider.name).toBe("GitHub Models");
    });

    it("should create provider with custom config", () => {
      const provider = createGitHubModelsProvider({
        pat: "custom-pat",
        defaultModel: "llama-3.3-70b",
        maxRequestsPerMinute: 30,
      });
      expect(provider.id).toBe("github-models");
    });

    it("should initialize provider", async () => {
      const provider = await createInitializedProvider();
      expect(provider.id).toBe("github-models");
    });

    it("should have correct model definitions", () => {
      const provider = createGitHubModelsProvider();
      expect(provider.models.length).toBeGreaterThan(0);

      const miniModel = provider.models.find((m) => m.id === "gpt-4o-mini");
      expect(miniModel).toBeDefined();
      expect(miniModel?.contextWindow).toBe(128_000);
    });
  });

  // ==========================================================================
  // Factory Tests
  // ==========================================================================

  describe("Factory Functions", () => {
    it("should create provider from env with defaults", () => {
      const provider = createGitHubModelsProviderFromEnv();
      expect(provider.id).toBe("github-models");
    });

    it("should create provider from env with GITHUB_MODELS_PAT", () => {
      const originalEnv = process.env.GITHUB_MODELS_PAT;
      process.env.GITHUB_MODELS_PAT = "test-pat-from-env";

      const provider = createGitHubModelsProviderFromEnv();
      expect(provider.hasPatConfigured()).toBe(true);

      process.env.GITHUB_MODELS_PAT = originalEnv;
    });

    it("should create provider from env with GITHUB_TOKEN fallback", () => {
      const originalEnv = process.env.GITHUB_TOKEN;
      const originalPat = process.env.GITHUB_MODELS_PAT;
      delete process.env.GITHUB_MODELS_PAT;
      process.env.GITHUB_TOKEN = "test-token-fallback";

      const provider = createGitHubModelsProviderFromEnv();
      expect(provider.hasPatConfigured()).toBe(true);

      process.env.GITHUB_TOKEN = originalEnv;
      process.env.GITHUB_MODELS_PAT = originalPat;
    });
  });

  // ==========================================================================
  // Chat Tests
  // ==========================================================================

  describe("Chat", () => {
    it("should send chat request", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse("Hello!")));

      const request: ChatRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      };

      const response = await provider.chat(request);

      expect(response.content).toBe("Hello!");
      expect(response.usage.totalTokens).toBe(150);
      expect(response.finishReason).toBe("stop");

      // Verify API was called with correct model name
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/chat/completions"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("openai/gpt-4o-mini"),
        })
      );
    });

    it("should use default model when not specified", async () => {
      const provider = await createInitializedProvider({
        pat: "test-pat",
        defaultModel: "phi-4",
      });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse("Hi")));

      const request: ChatRequest = {
        model: "", // Empty model should use default
        messages: [{ role: "user", content: "Hello" }],
      };

      // Use the default model from request.model || this.defaultModel
      // So we need to pass the request through
      await provider.chat({ ...request, model: "" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("microsoft/phi-4"),
        })
      );
    });

    it("should include temperature in request", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      await provider.chat({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.7'),
        })
      );
    });

    it("should include maxTokens in request", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      await provider.chat({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 1000,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"max_tokens":1000'),
        })
      );
    });

    it("should throw on unknown model", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      await expect(
        provider.chat({
          model: "unknown-model",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Unknown model");
    });
  });

  // ==========================================================================
  // Rate Limiting Tests
  // ==========================================================================

  describe("Rate Limiting", () => {
    it("should enforce rate limit", async () => {
      const provider = await createInitializedProvider({
        pat: "test-pat",
        maxRequestsPerMinute: 2, // Very low limit for testing
      });

      // Mock successful responses
      mockFetch.mockResolvedValue(createMockResponse(createChatResponse()));

      // First 2 requests should succeed
      await provider.chat({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "1" }],
      });

      await provider.chat({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "2" }],
      });

      // Third request should fail with rate limit
      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "3" }],
        })
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("should get rate limit status", async () => {
      const provider = await createInitializedProvider({
        pat: "test-pat",
        maxRequestsPerMinute: 10,
      });

      // With peek(), no activity means full quota and no reset needed
      const status = provider.getRateLimitStatus();
      expect(status.remaining).toBe(10);
      expect(status.resetIn).toBe(0); // No window started yet
    });
  });

  // ==========================================================================
  // Streaming Tests
  // ==========================================================================

  describe("Streaming", () => {
    it("should stream chat response", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      const chunks = [
        'data: {"id":"1","model":"gpt-4o-mini","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"id":"1","model":"gpt-4o-mini","choices":[{"delta":{"content":" World"},"finish_reason":null}]}',
        'data: {"id":"1","model":"gpt-4o-mini","choices":[{"delta":{},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ];

      mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

      const request: ChatRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const collectedChunks: string[] = [];
      for await (const chunk of provider.chatStream(request)) {
        if (chunk.delta) {
          collectedChunks.push(chunk.delta);
        }
      }

      expect(collectedChunks.join("")).toBe("Hello World");
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================

  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      const health = await provider.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should return unhealthy on auth error", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Invalid PAT" } }, false, 401)
      );

      const health = await provider.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain("Invalid PAT");
    });

    it("should return unhealthy on network error", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const health = await provider.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain("Network error");
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("Error Handling", () => {
    it("should handle API errors", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      // Always return error (for retries)
      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: "Internal server error", type: "server_error" } },
          false,
          500
        )
      );

      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("GitHub Models API error");
    });

    it("should handle rate limit errors from API", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      // Always return rate limit error (for retries)
      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: "Rate limit exceeded", type: "rate_limit" } },
          false,
          429
        )
      );

      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Rate limit");
    });

    it("should handle auth errors", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      mockFetch.mockResolvedValue(
        createMockResponse({ error: { message: "Invalid token" } }, false, 401)
      );

      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("401");
    });
  });

  // ==========================================================================
  // Retry Logic Tests
  // ==========================================================================

  describe("Retry Logic", () => {
    it("should retry on transient failures", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      // First call fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({ error: { message: "Server error" } }, false, 500)
        )
        .mockResolvedValueOnce(createMockResponse(createChatResponse("Success")));

      const response = await provider.chat({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(response.content).toBe("Success");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000);

    it("should not retry auth errors", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      mockFetch.mockResolvedValue(
        createMockResponse({ error: { message: "Invalid token" } }, false, 401)
      );

      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow();

      // Should only call once (no retry)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should fail after max retries", async () => {
      const provider = await createInitializedProvider({ pat: "test-pat" });
      vi.clearAllMocks(); // Clear health check call

      // Always fail with 500
      mockFetch.mockResolvedValue(
        createMockResponse({ error: { message: "Server error" } }, false, 500)
      );

      await expect(
        provider.chat({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Server error");

      // Should retry 3 times (1 + 2 retries)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  // ==========================================================================
  // Model Selection Tests
  // ==========================================================================

  describe("Model Selection", () => {
    it("should select model for task type", async () => {
      const provider = await createInitializedProvider();

      expect(provider.selectModelForTask("code_generation")).toBe("gpt-4o");
      expect(provider.selectModelForTask("fast")).toBe("phi-4");
      expect(provider.selectModelForTask("general")).toBe("gpt-4o-mini");
    });

    it("should return default model for unknown task", async () => {
      const provider = await createInitializedProvider();

      expect(provider.selectModelForTask("unknown")).toBe("gpt-4o-mini");
    });

    it("should get model specification", async () => {
      const provider = await createInitializedProvider();

      const spec = provider.getModelSpec("llama-3.3-70b");
      expect(spec).toBeDefined();
      expect(spec?.provider).toBe("meta");
      expect(spec?.tier).toBe("free");
      expect(spec?.contextWindow).toBe(128_000);
    });

    it("should return undefined for unknown model spec", async () => {
      const provider = await createInitializedProvider();

      const spec = provider.getModelSpec("unknown-model");
      expect(spec).toBeUndefined();
    });
  });

  // ==========================================================================
  // PAT Management Tests
  // ==========================================================================

  describe("PAT Management", () => {
    it("should check if PAT is configured", () => {
      const providerWithPat = createGitHubModelsProvider({ pat: "test-pat" });
      expect(providerWithPat.hasPatConfigured()).toBe(true);

      const providerWithoutPat = createGitHubModelsProvider();
      expect(providerWithoutPat.hasPatConfigured()).toBe(false);
    });

    it("should get available models", async () => {
      const provider = await createInitializedProvider();

      const models = await provider.getModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("gpt-4o-mini");
      expect(models).toContain("llama-3.3-70b");
    });
  });
});
