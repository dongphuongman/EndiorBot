/**
 * Ollama Provider Tests
 *
 * Tests for OllamaProvider local AI model integration.
 *
 * @module tests/providers/ollama
 * @date 2026-02-23
 * @status Sprint 38 Day 5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OllamaProvider,
  createOllamaProvider,
  createOllamaProviderFromEnv,
  OLLAMA_MODELS,
  OLLAMA_EMBEDDING_MODELS,
  OLLAMA_SPECIAL_MODELS,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  DEFAULT_CODE_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_FAST_MODEL,
} from "../../../src/providers/ollama/index.js";
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

const mockProviderConfig: ProviderConfig = {
  apiKey: "test-api-key",
  baseUrl: "http://localhost:11434",
};

async function createInitializedProvider(
  ollamaConfig?: Parameters<typeof createOllamaProvider>[0]
): Promise<OllamaProvider> {
  const provider = createOllamaProvider(ollamaConfig);
  // Mock health check during initialization
  mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));
  await provider.initialize(mockProviderConfig);
  return provider;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("OllamaProvider", () => {
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
      expect(DEFAULT_OLLAMA_URL).toBe("http://localhost:11434");
    });

    it("should have correct default timeout", () => {
      expect(DEFAULT_OLLAMA_TIMEOUT_MS).toBe(60000);
    });

    it("should have default models defined", () => {
      expect(DEFAULT_CODE_MODEL).toBe("qwen3-coder:30b");
      expect(DEFAULT_CHAT_MODEL).toBe("qwen3:32b");
      expect(DEFAULT_FAST_MODEL).toBe("qwen3:8b");
    });

    it("should have OLLAMA_MODELS array with expected models", () => {
      expect(OLLAMA_MODELS.length).toBeGreaterThan(0);
      const modelNames = OLLAMA_MODELS.map((m) => m.name);
      expect(modelNames).toContain("qwen3-coder:30b");
      expect(modelNames).toContain("qwen3:32b");
      expect(modelNames).toContain("devstral:24b");
    });

    it("should have OLLAMA_EMBEDDING_MODELS array", () => {
      expect(OLLAMA_EMBEDDING_MODELS.length).toBeGreaterThan(0);
      const modelNames = OLLAMA_EMBEDDING_MODELS.map((m) => m.name);
      expect(modelNames).toContain("bge-m3");
    });

    it("should have OLLAMA_SPECIAL_MODELS array", () => {
      expect(OLLAMA_SPECIAL_MODELS.length).toBeGreaterThan(0);
      const modelNames = OLLAMA_SPECIAL_MODELS.map((m) => m.name);
      expect(modelNames).toContain("deepseek-ocr:3b");
      expect(modelNames).toContain("translategemma:12b");
    });
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe("Initialization", () => {
    it("should create provider with default config", () => {
      const provider = createOllamaProvider();
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("should create provider with custom config", () => {
      const provider = createOllamaProvider({
        baseUrl: "http://custom:11434",
        defaultModel: "qwen3:8b",
        timeoutMs: 30000,
      });
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("should create provider from environment variables", () => {
      const originalEnv = { ...process.env };
      process.env.OLLAMA_BASE_URL = "http://env:11434";
      process.env.OLLAMA_DEFAULT_MODEL = "qwen3:14b";
      process.env.OLLAMA_TIMEOUT_MS = "45000";

      const provider = createOllamaProviderFromEnv();
      expect(provider).toBeInstanceOf(OllamaProvider);

      process.env = originalEnv;
    });

    it("should use defaults when env vars not set", () => {
      const originalEnv = { ...process.env };
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_DEFAULT_MODEL;
      delete process.env.OLLAMA_TIMEOUT_MS;

      const provider = createOllamaProviderFromEnv();
      expect(provider).toBeInstanceOf(OllamaProvider);

      process.env = originalEnv;
    });

    it("should initialize successfully", async () => {
      const provider = createOllamaProvider();
      mockFetch.mockResolvedValueOnce(createMockResponse({ models: [] }));

      await provider.initialize(mockProviderConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/tags"),
        expect.any(Object)
      );
    });

    it("should handle unhealthy server during initialization", async () => {
      const provider = createOllamaProvider();
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 503));

      // Should not throw, just warn
      await provider.initialize(mockProviderConfig);
    });
  });

  // ==========================================================================
  // Chat Tests
  // ==========================================================================

  describe("chat", () => {
    it("should send chat request successfully", async () => {
      const provider = await createInitializedProvider();

      const mockResponse = {
        model: "qwen3-coder:30b",
        created_at: new Date().toISOString(),
        message: {
          role: "assistant",
          content: "Hello! How can I help you?",
        },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 20,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const request: ChatRequest = {
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
      };

      const response = await provider.chat(request);

      expect(response.content).toBe("Hello! How can I help you?");
      expect(response.model).toBe("qwen3-coder:30b");
      expect(response.usage?.promptTokens).toBe(10);
      expect(response.usage?.completionTokens).toBe(20);
      expect(response.usage?.totalTokens).toBe(30);
    });

    it("should use specified model", async () => {
      const provider = await createInitializedProvider();

      const mockResponse = {
        model: "qwen3:8b",
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "Fast response" },
        done: true,
        done_reason: "stop",
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const request: ChatRequest = {
        model: "qwen3:8b",
        messages: [{ role: "user", content: "Quick question" }],
      };

      const response = await provider.chat(request);

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/api/chat"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"model":"qwen3:8b"'),
        })
      );
      expect(response.model).toBe("qwen3:8b");
    });

    it("should handle API errors", async () => {
      const provider = await createInitializedProvider();

      mockFetch.mockResolvedValue(
        createMockResponse({ error: "Model not found" }, false, 404)
      );

      const request: ChatRequest = {
        model: "nonexistent-model",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(provider.chat(request)).rejects.toThrow();
    });

    it("should include temperature and max tokens", async () => {
      const provider = await createInitializedProvider();

      const mockResponse = {
        model: "qwen3-coder:30b",
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "Response" },
        done: true,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const request: ChatRequest = {
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.5,
        maxTokens: 2000,
      };

      await provider.chat(request);

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const callBody = JSON.parse(lastCall[1].body);
      expect(callBody.options.temperature).toBe(0.5);
      expect(callBody.options.num_predict).toBe(2000);
    });
  });

  // ==========================================================================
  // Streaming Tests
  // ==========================================================================

  describe("chatStream", () => {
    it("should stream chat responses", async () => {
      const provider = await createInitializedProvider();

      const chunks = [
        JSON.stringify({
          model: "qwen3-coder:30b",
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: "Hello" },
          done: false,
        }),
        JSON.stringify({
          model: "qwen3-coder:30b",
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: " world" },
          done: false,
        }),
        JSON.stringify({
          model: "qwen3-coder:30b",
          created_at: new Date().toISOString(),
          message: { role: "assistant", content: "!" },
          done: true,
          done_reason: "stop",
        }),
      ];

      mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

      const request: ChatRequest = {
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Say hello world" }],
      };

      const collectedChunks: string[] = [];
      for await (const chunk of provider.chatStream(request)) {
        collectedChunks.push(chunk.delta);
      }

      expect(collectedChunks).toEqual(["Hello", " world", "!"]);
    });

    it("should handle stream errors", async () => {
      const provider = await createInitializedProvider();

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: "Stream failed" }, false, 500)
      );

      const request: ChatRequest = {
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
      };

      await expect(async () => {
        for await (const _chunk of provider.chatStream(request)) {
          // Should throw before yielding
        }
      }).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Model Selection Tests
  // ==========================================================================

  describe("Model Selection", () => {
    it("should select qwen3-coder for code generation", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("code_generation")).toBe(
        "qwen3-coder:30b"
      );
    });

    it("should select qwen3-coder for bug fix", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("bug_fix")).toBe("qwen3-coder:30b");
    });

    it("should select devstral for code review", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("code_review")).toBe("devstral:24b");
    });

    it("should select deepseek-r1 for architecture", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("architecture")).toBe(
        "deepseek-r1:32b-qwen-distill-q4_K_M"
      );
    });

    it("should select deepseek-r1 for reasoning", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("reasoning")).toBe(
        "deepseek-r1:32b-qwen-distill-q4_K_M"
      );
    });

    it("should select gemma3 for research", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("research")).toBe("gemma3:12b");
    });

    it("should select gemma3 for analysis", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("analysis")).toBe("gemma3:12b");
    });

    it("should select qwen3:14b for vietnamese", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("vietnamese")).toBe("qwen3:14b");
    });

    it("should select qwen3:8b for fast tasks", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("fast")).toBe("qwen3:8b");
    });

    it("should select qwen3:8b for drafts", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("drafts")).toBe("qwen3:8b");
    });

    it("should select translategemma for translation", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("translation")).toBe(
        "translategemma:12b"
      );
    });

    it("should select deepseek-ocr for OCR", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("ocr")).toBe("deepseek-ocr:3b");
    });

    it("should return default model for unknown task", () => {
      const provider = createOllamaProvider();
      expect(provider.selectModelForTask("unknown_task")).toBe(
        "qwen3-coder:30b"
      );
    });

    it("should use custom default model", () => {
      const provider = createOllamaProvider({ defaultModel: "qwen3:32b" });
      expect(provider.selectModelForTask("unknown_task")).toBe("qwen3:32b");
    });
  });

  // ==========================================================================
  // Model Specification Tests
  // ==========================================================================

  describe("getModelSpec", () => {
    it("should return spec for known model", () => {
      const provider = createOllamaProvider();
      const spec = provider.getModelSpec("qwen3-coder:30b");

      expect(spec).toBeDefined();
      expect(spec?.name).toBe("qwen3-coder:30b");
      expect(spec?.displayName).toBe("Qwen3 Coder 30B");
      expect(spec?.sizeGb).toBe(17.3);
      expect(spec?.contextSize).toBe(256000);
      expect(spec?.specialties).toContain("code_generation");
    });

    it("should return spec for embedding model", () => {
      const provider = createOllamaProvider();
      const spec = provider.getModelSpec("bge-m3");

      expect(spec).toBeDefined();
      expect(spec?.name).toBe("bge-m3");
      expect(spec?.purpose).toBe("RAG embeddings");
    });

    it("should return spec for special model", () => {
      const provider = createOllamaProvider();
      const spec = provider.getModelSpec("deepseek-ocr:3b");

      expect(spec).toBeDefined();
      expect(spec?.name).toBe("deepseek-ocr:3b");
      expect(spec?.specialties).toContain("ocr");
    });

    it("should return undefined for unknown model", () => {
      const provider = createOllamaProvider();
      const spec = provider.getModelSpec("nonexistent-model");
      expect(spec).toBeUndefined();
    });
  });

  // ==========================================================================
  // Get Models Tests
  // ==========================================================================

  describe("getModels", () => {
    it("should fetch available models from server", async () => {
      const provider = createOllamaProvider();

      const mockResponse = {
        models: [
          { name: "qwen3-coder:30b" },
          { name: "qwen3:32b" },
          { name: "devstral:24b" },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const models = await provider.getModels();

      expect(models).toEqual(["qwen3-coder:30b", "qwen3:32b", "devstral:24b"]);
    });

    it("should return fallback models on server error", async () => {
      const provider = createOllamaProvider();

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: "Server down" }, false, 503)
      );

      const models = await provider.getModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("qwen3-coder:30b");
    });

    it("should return fallback models on network error", async () => {
      const provider = createOllamaProvider();

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const models = await provider.getModels();

      expect(models.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================

  describe("checkHealth", () => {
    it("should return healthy status when server responds", async () => {
      const provider = createOllamaProvider();

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ models: [] }, true, 200)
      );

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeDefined();
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should return unhealthy status when server fails", async () => {
      const provider = createOllamaProvider();

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: "Down" }, false, 503)
      );

      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
    });

    it("should return unhealthy status on network error", async () => {
      const provider = createOllamaProvider();

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
      const provider = await createInitializedProvider();

      const mockResponse = {
        model: "qwen3-coder:30b",
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "Response" },
        done: true,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await provider.chat({
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1].headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
    });

    it("should include Authorization header when API key provided", async () => {
      const provider = await createInitializedProvider({ apiKey: "test-key" });

      const mockResponse = {
        model: "qwen3-coder:30b",
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "Response" },
        done: true,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await provider.chat({
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1].headers).toHaveProperty(
        "Authorization",
        "Bearer test-key"
      );
    });
  });

  // ==========================================================================
  // Model Specifications Validation
  // ==========================================================================

  describe("Model Specifications", () => {
    it("should have valid context sizes for all models", () => {
      const allModels = [
        ...OLLAMA_MODELS,
        ...OLLAMA_EMBEDDING_MODELS,
        ...OLLAMA_SPECIAL_MODELS,
      ];

      for (const model of allModels) {
        expect(model.contextSize).toBeGreaterThan(0);
      }
    });

    it("should have valid sizes for all models", () => {
      const allModels = [
        ...OLLAMA_MODELS,
        ...OLLAMA_EMBEDDING_MODELS,
        ...OLLAMA_SPECIAL_MODELS,
      ];

      for (const model of allModels) {
        expect(model.sizeGb).toBeGreaterThan(0);
      }
    });

    it("should have specialties array for all models", () => {
      const allModels = [
        ...OLLAMA_MODELS,
        ...OLLAMA_EMBEDDING_MODELS,
        ...OLLAMA_SPECIAL_MODELS,
      ];

      for (const model of allModels) {
        expect(Array.isArray(model.specialties)).toBe(true);
        expect(model.specialties.length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // Retry Logic Tests
  // ==========================================================================

  describe("Retry Logic", () => {
    it("should retry on transient failures", async () => {
      const provider = await createInitializedProvider();

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValueOnce(
          createMockResponse({
            model: "qwen3-coder:30b",
            created_at: new Date().toISOString(),
            message: { role: "assistant", content: "Success" },
            done: true,
          })
        );

      const response = await provider.chat({
        model: "qwen3-coder:30b",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(response.content).toBe("Success");
      // 1 for init health check + 2 for chat (1 fail + 1 success)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should fail after max retries", async () => {
      const provider = await createInitializedProvider();

      mockFetch.mockRejectedValue(new Error("Persistent failure"));

      await expect(
        provider.chat({
          model: "qwen3-coder:30b",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("Persistent failure");

      // 1 for init health check + 3 for chat retries (1 initial + 2 retries)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // Provider Properties Tests
  // ==========================================================================

  describe("Provider Properties", () => {
    it("should have correct id", () => {
      const provider = createOllamaProvider();
      expect(provider.id).toBe("ollama");
    });

    it("should have correct name", () => {
      const provider = createOllamaProvider();
      expect(provider.name).toBe("Ollama");
    });

    it("should have models array", () => {
      const provider = createOllamaProvider();
      expect(Array.isArray(provider.models)).toBe(true);
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it("should have models with required properties", () => {
      const provider = createOllamaProvider();
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
