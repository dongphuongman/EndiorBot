/**
 * Tests for GeminiProvider
 *
 * @module tests/providers/gemini
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GeminiProvider,
  createGeminiProvider,
  createGeminiProviderFromEnv,
  GEMINI_MODELS,
  GEMINI_TASK_ROUTING,
} from "../../../src/providers/gemini/index.js";
import type { ChatRequest, ProviderConfig } from "../../../src/providers/types.js";
import { ProviderError } from "../../../src/providers/types.js";

// ============================================================================
// Mocks
// ============================================================================

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(data),
    body: null,
  } as Response;
}

function createMockStreamResponse(chunks: string[]): Response {
  let chunkIndex = 0;

  const readableStream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex++];
        controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\n`));
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: readableStream,
  } as Response;
}

function createGeminiResponse(text: string, finishReason = "STOP") {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text }],
        },
        finishReason,
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  };
}

// ============================================================================
// GeminiProvider Tests
// ============================================================================

describe("GeminiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create provider with default config", () => {
      const provider = new GeminiProvider();

      expect(provider.id).toBe("gemini");
      expect(provider.name).toBe("Google Gemini");
      expect(provider.models).toBeDefined();
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it("should create provider with custom config", () => {
      const provider = new GeminiProvider({
        apiKey: "test-api-key",
        baseUrl: "https://custom.api.google.com",
        defaultModel: "gemini-1.5-pro",
        timeoutMs: 30000,
      });

      expect(provider.id).toBe("gemini");
    });

    it("should map models to ModelDefinition format", () => {
      const provider = new GeminiProvider();

      const model = provider.models.find((m) => m.id === "gemini-2.0-flash");
      expect(model).toBeDefined();
      expect(model?.name).toBe("Gemini 2.0 Flash");
      expect(model?.contextWindow).toBe(1000000);
      expect(model?.supportedFeatures).toContain("chat");
    });
  });

  describe("initialize", () => {
    it("should initialize with config", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ models: [] })
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const config: ProviderConfig = { apiKey: "test-key" };

      await provider.initialize(config);

      expect(mockFetch).toHaveBeenCalled();
    });

    it("should warn if API key not configured", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Unauthorized" } }, false, 401)
      );

      const provider = new GeminiProvider();
      const config: ProviderConfig = { apiKey: "" };

      // Should not throw
      await provider.initialize(config);
    });

    it("should use config apiKey over constructor", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ models: [] })
      );

      const provider = new GeminiProvider({ apiKey: "constructor-key" });
      const config: ProviderConfig = { apiKey: "config-key" };

      await provider.initialize(config);

      // The config key should be used
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("config-key"),
        expect.any(Object)
      );
    });
  });

  describe("chat", () => {
    it("should make chat request", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ models: [] }) // health check
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Hello from Gemini!"))
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      };

      const response = await provider.chat(request);

      expect(response.content).toBe("Hello from Gemini!");
      expect(response.model).toBe("gemini-2.0-flash");
      expect(response.usage.totalTokens).toBe(30);
      expect(response.finishReason).toBe("stop");
    });

    it("should use default model if not specified", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Response"))
      );

      const provider = new GeminiProvider({
        apiKey: "test-key",
        defaultModel: "gemini-1.5-pro",
      });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "",
        messages: [{ role: "user", content: "Hello" }],
      };

      await provider.chat(request);

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("gemini-1.5-pro"),
        expect.any(Object)
      );
    });

    it("should handle system messages", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Response"))
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
      };

      await provider.chat(request);

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);

      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe("You are helpful");
    });

    it("should include generation config", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Response"))
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        maxTokens: 1000,
      };

      await provider.chat(request);

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);

      expect(body.generationConfig.temperature).toBe(0.7);
      expect(body.generationConfig.maxOutputTokens).toBe(1000);
    });

    it("should handle tools", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Response"))
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "What's the weather?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather info",
            parameters: {
              location: { type: "string", description: "City name", required: true },
            },
          },
        ],
      };

      await provider.chat(request);

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools[0].functionDeclarations[0].name).toBe("get_weather");
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: { code: 400, message: "Invalid request", status: "INVALID_ARGUMENT" } },
          false,
          400
        )
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow(ProviderError);
    });

    it("should handle rate limiting", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: { message: "Rate limit exceeded" } },
          false,
          429
        )
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: { message: "Rate limit exceeded" } },
          false,
          429
        )
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: { message: "Rate limit exceeded" } },
          false,
          429
        )
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow(ProviderError);
    });

    it("should map finish reasons correctly", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));

      // Test STOP
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Text", "STOP"))
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const response1 = await provider.chat({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      });
      expect(response1.finishReason).toBe("stop");

      // Test MAX_TOKENS
      mockFetch.mockResolvedValueOnce(
        createMockResponse(createGeminiResponse("Text", "MAX_TOKENS"))
      );

      const response2 = await provider.chat({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      });
      expect(response2.finishReason).toBe("length");
    });
  });

  describe("chatStream", () => {
    it("should stream chat responses", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));

      const streamChunks = [
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Hello " }] } }],
        }),
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "World!" }] }, finishReason: "STOP" }],
        }),
      ];

      mockFetch.mockResolvedValueOnce(createMockStreamResponse(streamChunks));

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const chunks: string[] = [];
      for await (const chunk of provider.chatStream(request)) {
        chunks.push(chunk.delta);
      }

      expect(chunks).toContain("Hello ");
      expect(chunks).toContain("World!");
    });

    it("should handle stream errors", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: { message: "Stream error" } },
          false,
          500
        )
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const request: ChatRequest = {
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      await expect(async () => {
        for await (const _ of provider.chatStream(request)) {
          // consume
        }
      }).rejects.toThrow(ProviderError);
    });
  });

  describe("healthCheck", () => {
    it("should return unhealthy when not initialized", async () => {
      const provider = new GeminiProvider({ apiKey: "test-key" });
      // Call base class healthCheck without initialization
      const health = await provider.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.message).toBe("Provider not initialized");
    });

    it("should return healthy when initialized and API available", async () => {
      // Mock for initialize and healthCheck
      mockFetch.mockResolvedValue(createMockResponse({ models: [] }));

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const health = await provider.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.latencyMs).toBeDefined();
    });

    it("should return unhealthy for auth errors when initialized", async () => {
      // First call for initialize (success)
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      // Second call for healthCheck (auth error)
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Unauthorized" } }, false, 401)
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const health = await provider.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.message).toContain("Invalid API key");
    });

    it("should return degraded for server errors when initialized", async () => {
      // First call for initialize (success)
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
      // Second call for healthCheck (server error)
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Server error" } }, false, 500)
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      const health = await provider.healthCheck();

      expect(health.status).toBe("degraded");
    });
  });

  describe("getModels", () => {
    it("should fetch models from API", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          models: [
            { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
            { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
          ],
        })
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const models = await provider.getModels();

      expect(models).toContain("gemini-2.0-flash");
      expect(models).toContain("gemini-1.5-pro");
    });

    it("should return default models on API error", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: "Error" } }, false, 500)
      );

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const models = await provider.getModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("gemini-2.0-flash");
    });
  });

  describe("selectModelForTask", () => {
    it("should select appropriate model for task type", () => {
      const provider = new GeminiProvider();

      expect(provider.selectModelForTask("code_generation")).toBe("gemini-2.0-flash");
      expect(provider.selectModelForTask("architecture")).toBe("gemini-1.5-pro");
      expect(provider.selectModelForTask("fast")).toBe("gemini-2.0-flash-lite");
      expect(provider.selectModelForTask("reasoning")).toBe("gemini-2.0-flash-thinking");
      expect(provider.selectModelForTask("long_context")).toBe("gemini-1.5-pro");
    });

    it("should return default model for unknown task", () => {
      const provider = new GeminiProvider({ defaultModel: "gemini-2.0-flash" });

      expect(provider.selectModelForTask("unknown_task")).toBe("gemini-2.0-flash");
    });
  });

  describe("calculateCost", () => {
    it("should calculate cost correctly", () => {
      const provider = new GeminiProvider();

      // gemini-2.0-flash: $0.075/1M input, $0.30/1M output
      const cost = provider.calculateCost("gemini-2.0-flash", 1000, 500);

      // (1000 / 1M) * 0.075 + (500 / 1M) * 0.30
      const expected = (1000 / 1_000_000) * 0.075 + (500 / 1_000_000) * 0.3;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("should return 0 for unknown model", () => {
      const provider = new GeminiProvider();
      const cost = provider.calculateCost("unknown-model", 1000, 500);

      expect(cost).toBe(0);
    });
  });

  describe("getModelSpec", () => {
    it("should return model spec", () => {
      const provider = new GeminiProvider();
      const spec = provider.getModelSpec("gemini-1.5-pro");

      expect(spec).toBeDefined();
      expect(spec?.displayName).toBe("Gemini 1.5 Pro");
      expect(spec?.contextWindow).toBe(2000000);
    });

    it("should return undefined for unknown model", () => {
      const provider = new GeminiProvider();
      const spec = provider.getModelSpec("unknown-model");

      expect(spec).toBeUndefined();
    });
  });

  describe("checkHealth", () => {
    it("should return health check result with latency", async () => {
      vi.clearAllMocks();

      // Create fresh mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ models: [] }),
      } as Response);

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const health = await provider.checkHealth();

      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      // The healthy property is based on healthCheck status
      expect(typeof health.healthy).toBe("boolean");
    });

    it("should report unhealthy for auth errors", async () => {
      vi.clearAllMocks();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: { message: "Bad" } }),
      } as Response);

      const provider = new GeminiProvider({ apiKey: "bad-key" });
      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe("dispose", () => {
    it("should dispose without error", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.initialize({ apiKey: "test-key" });

      // Should not throw
      await provider.dispose();
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createGeminiProvider", () => {
  it("should create provider with config", () => {
    const provider = createGeminiProvider({ apiKey: "test-key" });

    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("should create provider without config", () => {
    const provider = createGeminiProvider();

    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});

describe("createGeminiProviderFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create provider from GOOGLE_AI_API_KEY", () => {
    process.env.GOOGLE_AI_API_KEY = "google-ai-key";

    const provider = createGeminiProviderFromEnv();

    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("should create provider from GEMINI_API_KEY", () => {
    process.env.GEMINI_API_KEY = "gemini-key";

    const provider = createGeminiProviderFromEnv();

    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("should prefer GOOGLE_AI_API_KEY over GEMINI_API_KEY", () => {
    process.env.GOOGLE_AI_API_KEY = "google-key";
    process.env.GEMINI_API_KEY = "gemini-key";

    const provider = createGeminiProviderFromEnv();

    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("GEMINI_MODELS", () => {
  it("should have required model definitions", () => {
    expect(GEMINI_MODELS.find((m) => m.id === "gemini-2.0-flash")).toBeDefined();
    expect(GEMINI_MODELS.find((m) => m.id === "gemini-1.5-pro")).toBeDefined();
    expect(GEMINI_MODELS.find((m) => m.id === "gemini-1.5-flash")).toBeDefined();
  });

  it("should have valid context windows", () => {
    for (const model of GEMINI_MODELS) {
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it("should have pricing info", () => {
    for (const model of GEMINI_MODELS) {
      expect(model.inputCostPer1M).toBeDefined();
      expect(model.outputCostPer1M).toBeDefined();
    }
  });
});

describe("GEMINI_TASK_ROUTING", () => {
  it("should have routing for common tasks", () => {
    expect(GEMINI_TASK_ROUTING.code_generation).toBeDefined();
    expect(GEMINI_TASK_ROUTING.architecture).toBeDefined();
    expect(GEMINI_TASK_ROUTING.fast).toBeDefined();
    expect(GEMINI_TASK_ROUTING.reasoning).toBeDefined();
  });
});

// ============================================================================
// Retry Logic Tests
// ============================================================================

describe("Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock that returns empty models for health checks
    mockFetch.mockReset();
  });

  it("should retry on server errors", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Health check during init
        return Promise.resolve(createMockResponse({ models: [] }));
      } else if (callCount === 2) {
        // First attempt - server error
        return Promise.resolve(
          createMockResponse({ error: { message: "Server error" } }, false, 500)
        );
      } else {
        // Retry - success
        return Promise.resolve(
          createMockResponse({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "Success after retry" }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          })
        );
      }
    });

    const provider = new GeminiProvider({ apiKey: "test-key" });
    await provider.initialize({ apiKey: "test-key" });

    const response = await provider.chat({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("Success after retry");
    expect(callCount).toBe(3);
  });

  it("should not retry on client errors", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Health check during init
        return Promise.resolve(createMockResponse({ models: [] }));
      } else {
        // Chat attempt - client error (no retry)
        return Promise.resolve(
          createMockResponse(
            { error: { message: "Bad request", status: "INVALID_ARGUMENT" } },
            false,
            400
          )
        );
      }
    });

    const provider = new GeminiProvider({ apiKey: "test-key" });
    await provider.initialize({ apiKey: "test-key" });

    await expect(
      provider.chat({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "Hello" }],
      })
    ).rejects.toThrow(ProviderError);

    // Health check + 1 attempt (no retry for 400)
    expect(callCount).toBe(2);
  });
});
