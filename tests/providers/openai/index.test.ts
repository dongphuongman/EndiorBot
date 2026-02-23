/**
 * OpenAI Provider Tests
 *
 * Tests for OpenAIProvider GPT model integration.
 *
 * @module tests/providers/openai
 * @date 2026-02-23
 * @status Sprint 38 Day 7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OpenAIProvider,
  createOpenAIProvider,
  createOpenAIProviderFromEnv,
  OPENAI_MODELS,
  OPENAI_TASK_ROUTING,
  DEFAULT_OPENAI_URL,
  DEFAULT_OPENAI_TIMEOUT_MS,
  DEFAULT_OPENAI_MODEL,
} from "../../../src/providers/openai/index.js";
import type { ChatRequest, ProviderConfig } from "../../../src/providers/types.js";

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    id: "chatcmpl-123",
    object: "chat.completion",
    created: Date.now(),
    model: "gpt-4o",
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
  apiKey: "test-api-key",
};

async function createInitializedProvider(
  openaiConfig?: Parameters<typeof createOpenAIProvider>[0]
): Promise<OpenAIProvider> {
  const provider = createOpenAIProvider(openaiConfig);
  // Mock health check during initialization
  mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));
  await provider.initialize(mockProviderConfig);
  return provider;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("OpenAIProvider", () => {
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
    it("should have correct default URL", () => {
      expect(DEFAULT_OPENAI_URL).toBe("https://api.openai.com/v1");
    });

    it("should have correct default timeout", () => {
      expect(DEFAULT_OPENAI_TIMEOUT_MS).toBe(30000);
    });

    it("should have correct default model", () => {
      expect(DEFAULT_OPENAI_MODEL).toBe("gpt-4o");
    });

    it("should have OPENAI_MODELS array with expected models", () => {
      expect(OPENAI_MODELS.length).toBeGreaterThan(0);
      const modelIds = OPENAI_MODELS.map((m) => m.id);
      expect(modelIds).toContain("gpt-4o");
      expect(modelIds).toContain("gpt-4o-mini");
      expect(modelIds).toContain("o1");
      expect(modelIds).toContain("o3-mini");
    });

    it("should have task routing configured", () => {
      expect(OPENAI_TASK_ROUTING.code_generation).toBe("gpt-4o");
      expect(OPENAI_TASK_ROUTING.fast).toBe("gpt-4o-mini");
      expect(OPENAI_TASK_ROUTING.reasoning).toBe("o1");
    });
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe("Initialization", () => {
    it("should create provider with default config", () => {
      const provider = createOpenAIProvider();
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.id).toBe("openai");
      expect(provider.name).toBe("OpenAI");
    });

    it("should create provider with custom config", () => {
      const provider = createOpenAIProvider({
        apiKey: "custom-key",
        defaultModel: "gpt-4o-mini",
        timeoutMs: 60000,
      });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("should create provider from environment variables", () => {
      const originalEnv = { ...process.env };
      process.env.OPENAI_API_KEY = "env-api-key";
      process.env.OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
      process.env.OPENAI_TIMEOUT_MS = "45000";

      const provider = createOpenAIProviderFromEnv();
      expect(provider).toBeInstanceOf(OpenAIProvider);

      process.env = originalEnv;
    });

    it("should initialize successfully", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await provider.initialize(mockProviderConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/models"),
        expect.any(Object)
      );
    });

    it("should handle missing API key during initialization", async () => {
      const provider = createOpenAIProvider();
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Invalid API key" } }, false, 401)
      );

      // Should not throw, just warn
      await provider.initialize({ apiKey: "" });
    });
  });

  // ==========================================================================
  // Chat Tests
  // ==========================================================================

  describe("chat", () => {
    it("should send chat request successfully", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse(createChatResponse("Hello! How can I help?"))
      );

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      const response = await provider.chat(request);

      expect(response.content).toBe("Hello! How can I help?");
      expect(response.model).toBe("gpt-4o");
      expect(response.usage?.promptTokens).toBe(100);
      expect(response.usage?.completionTokens).toBe(50);
      expect(response.usage?.totalTokens).toBe(150);
      expect(response.finishReason).toBe("stop");
    });

    it("should use specified model", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      const mockResponse = {
        ...createChatResponse("Fast response"),
        model: "gpt-4o-mini",
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const request: ChatRequest = {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Quick question" }],
      };

      const response = await provider.chat(request);

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/chat/completions"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"model":"gpt-4o-mini"'),
        })
      );
      expect(response.model).toBe("gpt-4o-mini");
    });

    it("should handle API errors", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: "Model not found", type: "invalid_request_error" } },
          false,
          400
        )
      );

      const request: ChatRequest = {
        model: "nonexistent-model",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow();
    });

    it("should handle rate limit errors", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: "Rate limit exceeded" } },
          false,
          429
        )
      );

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow("Rate limit");
    });

    it("should handle auth errors without retry", async () => {
      const provider = await createInitializedProvider({ apiKey: "invalid-key" });

      mockFetch.mockResolvedValue(
        createMockResponse(
          { error: { message: "Invalid API key" } },
          false,
          401
        )
      );

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow("Invalid API key");

      // Auth errors should not retry
      // 1 for init + 1 for chat (no retries for auth errors)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should include temperature and max tokens", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5,
        maxTokens: 2000,
      };

      await provider.chat(request);

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const callBody = JSON.parse(lastCall[1].body);
      expect(callBody.temperature).toBe(0.5);
      expect(callBody.max_tokens).toBe(2000);
    });

    it("should handle tool calls in response", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      const responseWithTools = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: Date.now(),
        model: "gpt-4o",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location": "London"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(responseWithTools));

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "What's the weather in London?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather for a location",
            parameters: {
              location: { type: "string", description: "City name", required: true },
            },
          },
        ],
      };

      const response = await provider.chat(request);

      expect(response.finishReason).toBe("tool_calls");
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0].name).toBe("get_weather");
      expect(response.toolCalls?.[0].arguments).toEqual({ location: "London" });
    });
  });

  // ==========================================================================
  // Streaming Tests
  // ==========================================================================

  describe("chatStream", () => {
    it("should stream chat responses", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ];

      mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Say hello world" }],
      };

      const collectedChunks: string[] = [];
      for await (const chunk of provider.chatStream(request)) {
        collectedChunks.push(chunk.delta);
      }

      expect(collectedChunks).toEqual(["Hello", " world", "!"]);
    });

    it("should handle stream errors", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Stream failed" } }, false, 500)
      );

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(async () => {
        for await (const _chunk of provider.chatStream(request)) {
          // Should throw before yielding
        }
      }).rejects.toThrow();
    });

    it("should handle SSE comments and keepalive", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      const chunks = [
        ": keepalive",
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Test"},"finish_reason":null}]}',
        "",
        "data: [DONE]",
      ];

      mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

      const request: ChatRequest = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Test" }],
      };

      const collectedChunks: string[] = [];
      for await (const chunk of provider.chatStream(request)) {
        collectedChunks.push(chunk.delta);
      }

      expect(collectedChunks).toEqual(["Test"]);
    });
  });

  // ==========================================================================
  // Model Selection Tests
  // ==========================================================================

  describe("Model Selection", () => {
    it("should select gpt-4o for code generation", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("code_generation")).toBe("gpt-4o");
    });

    it("should select gpt-4o for bug fix", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("bug_fix")).toBe("gpt-4o");
    });

    it("should select o1 for architecture", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("architecture")).toBe("o1");
    });

    it("should select o1 for reasoning", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("reasoning")).toBe("o1");
    });

    it("should select gpt-4o-mini for fast tasks", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("fast")).toBe("gpt-4o-mini");
    });

    it("should select gpt-4o-mini for drafts", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("drafts")).toBe("gpt-4o-mini");
    });

    it("should return default model for unknown task", () => {
      const provider = createOpenAIProvider();
      expect(provider.selectModelForTask("unknown_task")).toBe("gpt-4o");
    });

    it("should use custom default model", () => {
      const provider = createOpenAIProvider({ defaultModel: "gpt-3.5-turbo" });
      expect(provider.selectModelForTask("unknown_task")).toBe("gpt-3.5-turbo");
    });
  });

  // ==========================================================================
  // Model Specification Tests
  // ==========================================================================

  describe("getModelSpec", () => {
    it("should return spec for known model", () => {
      const provider = createOpenAIProvider();
      const spec = provider.getModelSpec("gpt-4o");

      expect(spec).toBeDefined();
      expect(spec?.id).toBe("gpt-4o");
      expect(spec?.displayName).toBe("GPT-4o");
      expect(spec?.contextWindow).toBe(128000);
      expect(spec?.features).toContain("vision");
    });

    it("should return spec for mini model", () => {
      const provider = createOpenAIProvider();
      const spec = provider.getModelSpec("gpt-4o-mini");

      expect(spec).toBeDefined();
      expect(spec?.id).toBe("gpt-4o-mini");
      expect(spec?.inputCostPer1M).toBeLessThan(1);
    });

    it("should return undefined for unknown model", () => {
      const provider = createOpenAIProvider();
      const spec = provider.getModelSpec("nonexistent-model");
      expect(spec).toBeUndefined();
    });
  });

  // ==========================================================================
  // Cost Calculation Tests
  // ==========================================================================

  describe("calculateCost", () => {
    it("should calculate cost for gpt-4o", () => {
      const provider = createOpenAIProvider();
      const cost = provider.calculateCost("gpt-4o", 1000000, 500000);

      // Input: 1M tokens * $2.5/1M = $2.5
      // Output: 500K tokens * $10/1M = $5
      // Total: $7.5
      expect(cost).toBeCloseTo(7.5, 2);
    });

    it("should calculate cost for gpt-4o-mini", () => {
      const provider = createOpenAIProvider();
      const cost = provider.calculateCost("gpt-4o-mini", 1000000, 500000);

      // Input: 1M tokens * $0.15/1M = $0.15
      // Output: 500K tokens * $0.6/1M = $0.3
      // Total: $0.45
      expect(cost).toBeCloseTo(0.45, 2);
    });

    it("should return 0 for unknown model", () => {
      const provider = createOpenAIProvider();
      const cost = provider.calculateCost("unknown-model", 1000, 500);
      expect(cost).toBe(0);
    });

    it("should handle small token counts", () => {
      const provider = createOpenAIProvider();
      const cost = provider.calculateCost("gpt-4o", 100, 50);

      // Input: 100 tokens * $2.5/1M = $0.00025
      // Output: 50 tokens * $10/1M = $0.0005
      // Total: $0.00075
      expect(cost).toBeCloseTo(0.00075, 5);
    });
  });

  // ==========================================================================
  // Get Models Tests
  // ==========================================================================

  describe("getModels", () => {
    it("should fetch available models from API", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });

      const mockResponse = {
        data: [
          { id: "gpt-4o" },
          { id: "gpt-4o-mini" },
          { id: "gpt-3.5-turbo" },
          { id: "dall-e-3" }, // Should be filtered out
          { id: "o1" },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const models = await provider.getModels();

      expect(models).toContain("gpt-4o");
      expect(models).toContain("gpt-4o-mini");
      expect(models).toContain("o1");
      expect(models).not.toContain("dall-e-3");
    });

    it("should return fallback models on API error", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: "Server error" }, false, 500)
      );

      const models = await provider.getModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("gpt-4o");
    });

    it("should return fallback models on network error", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const models = await provider.getModels();

      expect(models.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================

  describe("checkHealth", () => {
    it("should return healthy status when API responds", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should return unhealthy status for invalid API key", async () => {
      const provider = createOpenAIProvider({ apiKey: "invalid-key" });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Invalid API key" } }, false, 401)
      );

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe("Invalid API key");
    });

    it("should return unhealthy status on network error", async () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });

      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe("Connection refused");
    });
  });

  // ==========================================================================
  // Headers Tests
  // ==========================================================================

  describe("Headers", () => {
    it("should include Content-Type header", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      await provider.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1].headers["Content-Type"]).toBe("application/json");
    });

    it("should include Authorization header", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      await provider.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      // Note: initialize() overrides apiKey from ProviderConfig
      expect(lastCall[1].headers["Authorization"]).toBe("Bearer test-api-key");
    });

    it("should include Organization header when configured", async () => {
      const provider = await createInitializedProvider({
        apiKey: "test-key",
        organizationId: "org-123",
      });

      mockFetch.mockResolvedValueOnce(createMockResponse(createChatResponse()));

      await provider.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1].headers["OpenAI-Organization"]).toBe("org-123");
    });
  });

  // ==========================================================================
  // Model Specifications Validation
  // ==========================================================================

  describe("Model Specifications", () => {
    it("should have valid context windows for all models", () => {
      for (const model of OPENAI_MODELS) {
        expect(model.contextWindow).toBeGreaterThan(0);
      }
    });

    it("should have valid output limits for all models", () => {
      for (const model of OPENAI_MODELS) {
        expect(model.maxOutputTokens).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeLessThanOrEqual(model.contextWindow);
      }
    });

    it("should have pricing info for all models", () => {
      for (const model of OPENAI_MODELS) {
        expect(model.inputCostPer1M).toBeGreaterThan(0);
        expect(model.outputCostPer1M).toBeGreaterThan(0);
      }
    });

    it("should have features array for all models", () => {
      for (const model of OPENAI_MODELS) {
        expect(Array.isArray(model.features)).toBe(true);
        expect(model.features.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Retry Logic Tests
  // ==========================================================================

  describe("Retry Logic", () => {
    it("should retry on transient failures", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValueOnce(createMockResponse(createChatResponse("Success")));

      const response = await provider.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(response.content).toBe("Success");
      // 1 for init + 2 for chat (1 fail + 1 success)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should retry on 500 errors", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({ error: { message: "Server error" } }, false, 500)
        )
        .mockResolvedValueOnce(createMockResponse(createChatResponse("Success")));

      const response = await provider.chat({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(response.content).toBe("Success");
    });

    it("should not retry on auth errors", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      mockFetch.mockResolvedValue(
        createMockResponse({ error: { message: "Invalid API key" } }, false, 401)
      );

      await expect(
        provider.chat({
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Invalid API key");

      // Should not retry auth errors - just 1 call for init + 1 for chat
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Provider Properties Tests
  // ==========================================================================

  describe("Provider Properties", () => {
    it("should have correct id", () => {
      const provider = createOpenAIProvider();
      expect(provider.id).toBe("openai");
    });

    it("should have correct name", () => {
      const provider = createOpenAIProvider();
      expect(provider.name).toBe("OpenAI");
    });

    it("should have models array", () => {
      const provider = createOpenAIProvider();
      expect(Array.isArray(provider.models)).toBe(true);
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it("should have models with required properties", () => {
      const provider = createOpenAIProvider();
      for (const model of provider.models) {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("contextWindow");
        expect(model).toHaveProperty("maxOutputTokens");
        expect(model).toHaveProperty("supportedFeatures");
      }
    });
  });
});
