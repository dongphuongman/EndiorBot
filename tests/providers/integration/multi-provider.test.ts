/**
 * Multi-Provider Integration Tests
 *
 * Tests for the multi-provider architecture:
 * - Provider registry with multiple providers
 * - Resource router with provider selection
 * - Cross-provider functionality
 *
 * @module tests/providers/integration/multi-provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OpenAIProvider,
  GeminiProvider,
  OllamaProvider,
  ProviderRegistry,
  getProviderRegistry,
  resetProviderRegistry,
} from "../../../src/providers/index.js";
import type { ChatRequest, ProviderConfig } from "../../../src/providers/types.js";

// ============================================================================
// Mocks
// ============================================================================

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

function createOpenAIResponse(content: string) {
  return {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: Date.now(),
    model: "gpt-4o",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function createGeminiResponse(content: string) {
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ text: content }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  };
}

function createOllamaResponse(content: string) {
  return {
    model: "qwen3-coder:30b",
    created_at: new Date().toISOString(),
    message: { role: "assistant", content },
    done: true,
    total_duration: 1000000000,
    load_duration: 100000000,
    prompt_eval_count: 10,
    eval_count: 20,
  };
}

// ============================================================================
// Provider Registry Tests
// ============================================================================

describe("Provider Registry Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetProviderRegistry();
  });

  it("should register multiple providers", () => {
    const registry = getProviderRegistry();

    const openai = new OpenAIProvider({ apiKey: "openai-key" });
    const gemini = new GeminiProvider({ apiKey: "gemini-key" });
    const ollama = new OllamaProvider({ baseUrl: "http://localhost:11434" });

    registry.register(openai);
    registry.register(gemini);
    registry.register(ollama);

    expect(registry.get("openai")).toBe(openai);
    expect(registry.get("gemini")).toBe(gemini);
    expect(registry.get("ollama")).toBe(ollama);
  });

  it("should list all registered providers", () => {
    const registry = getProviderRegistry();

    registry.register(new OpenAIProvider({ apiKey: "key" }));
    registry.register(new GeminiProvider({ apiKey: "key" }));

    const providerIds = registry.listIds();

    expect(providerIds).toContain("openai");
    expect(providerIds).toContain("gemini");
  });

  it("should unregister providers", () => {
    const registry = getProviderRegistry();

    registry.register(new OpenAIProvider({ apiKey: "key" }));
    registry.unregister("openai");

    expect(registry.get("openai")).toBeUndefined();
  });

  it("should handle provider initialization", async () => {
    mockFetch.mockResolvedValue(createMockResponse({ models: [] }));

    const registry = getProviderRegistry();
    const openai = new OpenAIProvider({ apiKey: "key" });

    registry.register(openai);

    const config: ProviderConfig = { apiKey: "key" };
    await openai.initialize(config);

    // Should be able to make requests after initialization
    mockFetch.mockResolvedValueOnce(
      createMockResponse(createOpenAIResponse("Hello!"))
    );

    const request: ChatRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
    };

    const response = await openai.chat(request);
    expect(response.content).toBe("Hello!");
  });
});

// ============================================================================
// Cross-Provider Functionality Tests
// ============================================================================

describe("Cross-Provider Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should use different providers for different tasks", async () => {
    const openai = new OpenAIProvider({ apiKey: "openai-key" });
    const gemini = new GeminiProvider({ apiKey: "gemini-key" });

    // OpenAI for code generation
    expect(openai.selectModelForTask("code_generation")).toBe("gpt-4o");

    // Gemini for long context
    expect(gemini.selectModelForTask("long_context")).toBe("gemini-1.5-pro");

    // Gemini for fast tasks
    expect(gemini.selectModelForTask("fast")).toBe("gemini-2.0-flash-lite");

    // OpenAI for reasoning
    expect(openai.selectModelForTask("reasoning")).toBe("o1");
  });

  it("should calculate costs correctly across providers", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    // Compare costs for 1M tokens
    const openaiCost = openai.calculateCost("gpt-4o", 1000000, 500000);
    const geminiCost = gemini.calculateCost("gemini-2.5-flash", 1000000, 500000);

    // Gemini 2.5 Flash should be cheaper than GPT-4o
    // GPT-4o: $2.5/1M input + $10/1M output = $2.5 + $5 = $7.5
    // Gemini 2.5 Flash: $0.15/1M input + $0.60/1M output = $0.15 + $0.30 = $0.45
    expect(geminiCost).toBeLessThan(openaiCost);
  });

  it("should provide model specs from all providers", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    const gpt4oSpec = openai.getModelSpec("gpt-4o");
    const geminiProSpec = gemini.getModelSpec("gemini-1.5-pro");

    expect(gpt4oSpec).toBeDefined();
    expect(gpt4oSpec?.displayName).toBe("GPT-4o");
    expect(gpt4oSpec?.contextWindow).toBe(128000);

    expect(geminiProSpec).toBeDefined();
    expect(geminiProSpec?.displayName).toBe("Gemini 1.5 Pro");
    expect(geminiProSpec?.contextWindow).toBe(2000000);
  });

  it("should make parallel requests to multiple providers", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("openai.com")) {
        return Promise.resolve(
          createMockResponse(createOpenAIResponse("OpenAI response"))
        );
      } else if (url.includes("googleapis.com")) {
        return Promise.resolve(
          createMockResponse(createGeminiResponse("Gemini response"))
        );
      }
      return Promise.resolve(createMockResponse({ models: [] }));
    });

    const openai = new OpenAIProvider({ apiKey: "openai-key" });
    const gemini = new GeminiProvider({ apiKey: "gemini-key" });

    await openai.initialize({ apiKey: "openai-key" });
    await gemini.initialize({ apiKey: "gemini-key" });

    const request: ChatRequest = {
      model: "",
      messages: [{ role: "user", content: "Hello" }],
    };

    // Make parallel requests
    const [openaiResponse, geminiResponse] = await Promise.all([
      openai.chat({ ...request, model: "gpt-4o" }),
      gemini.chat({ ...request, model: "gemini-2.5-flash" }),
    ]);

    expect(openaiResponse.content).toBe("OpenAI response");
    expect(geminiResponse.content).toBe("Gemini response");
  });
});

// ============================================================================
// Provider Health Monitoring Tests
// ============================================================================

describe("Provider Health Monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProviderRegistry();
  });

  it("should check health of all providers", async () => {
    mockFetch.mockResolvedValue(createMockResponse({ models: [] }));

    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    await openai.initialize({ apiKey: "key" });
    await gemini.initialize({ apiKey: "key" });

    const openaiHealth = await openai.healthCheck();
    const geminiHealth = await gemini.healthCheck();

    expect(openaiHealth.status).toBe("healthy");
    expect(geminiHealth.status).toBe("healthy");
  });

  it("should identify unhealthy providers", async () => {
    // OpenAI healthy
    mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
    mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));

    // Gemini init healthy, healthCheck unhealthy
    mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ error: { message: "Error" } }, false, 500)
    );

    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    await openai.initialize({ apiKey: "key" });
    await gemini.initialize({ apiKey: "key" });

    const openaiHealth = await openai.healthCheck();
    const geminiHealth = await gemini.healthCheck();

    expect(openaiHealth.status).toBe("healthy");
    expect(geminiHealth.status).toBe("degraded");
  });
});

// ============================================================================
// Model Selection Tests
// ============================================================================

describe("Model Selection", () => {
  it("should select appropriate models for task types", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });
    const ollama = new OllamaProvider({ baseUrl: "http://localhost:11434" });

    // Reasoning tasks
    expect(openai.selectModelForTask("reasoning")).toBe("o1");
    expect(gemini.selectModelForTask("reasoning")).toBe("gemini-2.5-pro");
    expect(ollama.selectModelForTask("reasoning")).toBe("deepseek-r1:32b-qwen-distill-q4_K_M");

    // Fast tasks
    expect(openai.selectModelForTask("fast")).toBe("gpt-4o-mini");
    expect(gemini.selectModelForTask("fast")).toBe("gemini-2.0-flash-lite");
    expect(ollama.selectModelForTask("fast")).toBe("qwen3:8b");
  });

  it("should validate model existence", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    // Valid models
    expect(openai.getModelSpec("gpt-4o")).toBeDefined();
    expect(gemini.getModelSpec("gemini-2.5-flash")).toBeDefined();

    // Invalid models
    expect(openai.getModelSpec("invalid-model")).toBeUndefined();
    expect(gemini.getModelSpec("invalid-model")).toBeUndefined();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling Across Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle auth errors consistently", async () => {
    // OpenAI auth error
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ error: { message: "Invalid API key" } }, false, 401)
    );

    const openai = new OpenAIProvider({ apiKey: "bad-key" });
    const openaiHealth = await openai.checkHealth();

    expect(openaiHealth.healthy).toBe(false);
    expect(openaiHealth.error).toContain("Invalid");

    // Gemini auth error
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ error: { message: "Invalid API key" } }, false, 401)
    );

    const gemini = new GeminiProvider({ apiKey: "bad-key" });
    const geminiHealth = await gemini.checkHealth();

    expect(geminiHealth.healthy).toBe(false);
    expect(geminiHealth.error).toContain("Invalid");
  });

  it("should handle rate limits consistently", async () => {
    // Initialize both providers
    mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] })); // openai init
    mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] })); // gemini init

    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    await openai.initialize({ apiKey: "key" });
    await gemini.initialize({ apiKey: "key" });

    // Both should handle 429 errors
    mockFetch.mockResolvedValue(
      createMockResponse({ error: { message: "Rate limit" } }, false, 429)
    );

    const request: ChatRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
    };

    await expect(openai.chat(request)).rejects.toThrow();

    const geminiRequest: ChatRequest = {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
    };

    await expect(gemini.chat(geminiRequest)).rejects.toThrow();
  });
});

// ============================================================================
// Feature Parity Tests
// ============================================================================

describe("Feature Parity", () => {
  it("should support streaming on all providers", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    // Check model features include streaming
    const gpt4o = openai.models.find((m) => m.id === "gpt-4o");
    const flash = gemini.models.find((m) => m.id === "gemini-2.5-flash");

    expect(gpt4o?.supportedFeatures).toContain("streaming");
    expect(flash?.supportedFeatures).toContain("streaming");
  });

  it("should support tools on capable models", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    const gpt4o = openai.models.find((m) => m.id === "gpt-4o");
    const flash = gemini.models.find((m) => m.id === "gemini-2.5-flash");

    expect(gpt4o?.supportedFeatures).toContain("tools");
    expect(flash?.supportedFeatures).toContain("tools");
  });

  it("should support vision on capable models", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    const gpt4o = openai.models.find((m) => m.id === "gpt-4o");
    const flash = gemini.models.find((m) => m.id === "gemini-2.5-flash");

    expect(gpt4o?.supportedFeatures).toContain("vision");
    expect(flash?.supportedFeatures).toContain("vision");
  });
});

// ============================================================================
// Context Window Tests
// ============================================================================

describe("Context Window Comparison", () => {
  it("should have Gemini with largest context windows", () => {
    const openai = new OpenAIProvider({ apiKey: "key" });
    const gemini = new GeminiProvider({ apiKey: "key" });

    const maxOpenAI = Math.max(...openai.models.map((m) => m.contextWindow));
    const maxGemini = Math.max(...gemini.models.map((m) => m.contextWindow));

    // Gemini 1.5 Pro has 2M context vs OpenAI's 200K
    expect(maxGemini).toBeGreaterThan(maxOpenAI);
    expect(maxGemini).toBe(2000000);
  });

  it("should select appropriate model for long context tasks", () => {
    const gemini = new GeminiProvider({ apiKey: "key" });

    const model = gemini.selectModelForTask("long_context");
    const spec = gemini.getModelSpec(model);

    expect(spec?.contextWindow).toBeGreaterThanOrEqual(1000000);
  });
});
