/**
 * LocalRouterAgent Tests
 *
 * @module tests/agents/routing/local-router
 * @sprint 78
 * @authority ADR-021
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LocalRouterAgent,
  getLocalRouter,
  resetLocalRouter,
  type RouterDecision,
} from "../../../src/agents/routing/local-router.js";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../../src/providers/ollama/index.js", () => ({
  DEFAULT_ROUTER_MODEL: "qwen3.5:9b",
  createOllamaProvider: vi.fn(() => ({
    chat: vi.fn(),
    isAvailable: vi.fn(),
  })),
}));

vi.mock("../../../src/providers/anthropic/index.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    chat: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  })),
}));

import { createOllamaProvider } from "../../../src/providers/ollama/index.js";
import { AnthropicProvider } from "../../../src/providers/anthropic/index.js";

// ============================================================================
// Helpers
// ============================================================================

function makeOllamaMock(response: string, available = true) {
  const mock = {
    chat: vi.fn().mockResolvedValue({ content: response, tokenUsage: {} }),
    healthCheck: vi.fn().mockResolvedValue({ status: available ? "healthy" : "unhealthy" }),
  };
  vi.mocked(createOllamaProvider).mockReturnValue(mock as never);
  return mock;
}

function makeAnthropicMock(response: string) {
  const mock = {
    initialize: vi.fn(),
    chat: vi.fn().mockResolvedValue({ content: response, tokenUsage: {} }),
  };
  vi.mocked(AnthropicProvider).mockImplementation(() => mock as never);
  return mock;
}

// ============================================================================
// Tests: isAvailable()
// ============================================================================

describe("LocalRouterAgent.isAvailable()", () => {
  afterEach(() => {
    resetLocalRouter();
    vi.clearAllMocks();
  });

  it("returns true when Ollama is reachable", async () => {
    makeOllamaMock('{"agent":"coder","confidence":0.9}', true);
    const router = new LocalRouterAgent();
    expect(await router.isAvailable()).toBe(true);
  });

  it("returns false when Ollama is unreachable", async () => {
    makeOllamaMock('{}', false);
    const router = new LocalRouterAgent();
    expect(await router.isAvailable()).toBe(false);
  });

  it("returns false when isAvailable() throws", async () => {
    const mock = { chat: vi.fn(), healthCheck: vi.fn().mockRejectedValue(new Error("connection refused")) };
    vi.mocked(createOllamaProvider).mockReturnValue(mock as never);
    const router = new LocalRouterAgent();
    expect(await router.isAvailable()).toBe(false);
  });
});

// ============================================================================
// Tests: route() — local path
// ============================================================================

describe("LocalRouterAgent.route() — local Ollama", () => {
  afterEach(() => {
    resetLocalRouter();
    vi.clearAllMocks();
  });

  const cases: Array<[string, string, string]> = [
    ["write a sort function", "coder", "code writing task"],
    ["plan the sprint", "pm", "sprint planning task"],
    ["review this code", "reviewer", "code review task"],
    ["design the architecture", "architect", "architecture task"],
    ["deploy to production", "devops", "deployment task"],
    ["write unit tests", "tester", "testing task"],
    ["research Redis vs Postgres", "researcher", "research task"],
    ["manage project timeline", "pjm", "project management task"],
    ["set product vision", "cpo", "product vision task"],
    ["review technical standards", "cto", "technical standards task"],
  ];

  it.each(cases)("routes '%s' → %s (%s)", async (message, expectedAgent, _desc) => {
    makeOllamaMock(`{"agent":"${expectedAgent}","confidence":0.92}`);
    const router = new LocalRouterAgent();
    const result = await router.route(message);

    expect(result.agent).toBe(expectedAgent);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.fallbackUsed).toBe(false);
    expect(result.routerModel).toBe("qwen3.5:9b");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("strips markdown fences from response", async () => {
    makeOllamaMock('```json\n{"agent":"coder","confidence":0.85}\n```');
    const router = new LocalRouterAgent();
    const result = await router.route("write tests");
    expect(result.agent).toBe("coder");
  });

  it("handles response with extra text before JSON", async () => {
    makeOllamaMock('Sure! {"agent":"architect","confidence":0.8} here you go');
    const router = new LocalRouterAgent();
    const result = await router.route("design the system");
    expect(result.agent).toBe("architect");
  });

  it("clamps confidence > 1 to 1", async () => {
    makeOllamaMock('{"agent":"coder","confidence":1.5}');
    const router = new LocalRouterAgent();
    const result = await router.route("write code");
    expect(result.confidence).toBe(1);
  });

  it("clamps confidence < 0 to 0", async () => {
    makeOllamaMock('{"agent":"coder","confidence":-0.1}');
    const router = new LocalRouterAgent();
    const result = await router.route("write code");
    expect(result.confidence).toBe(0);
  });

  it("defaults to coder for invalid agent role", async () => {
    makeOllamaMock('{"agent":"invalid_role","confidence":0.9}');
    const router = new LocalRouterAgent();
    const result = await router.route("do something");
    expect(result.agent).toBe("coder");
    expect(result.confidence).toBe(0.5);
  });

  it("defaults to coder for unparseable JSON", async () => {
    makeOllamaMock("not valid json at all");
    const router = new LocalRouterAgent();
    const result = await router.route("do something");
    expect(result.agent).toBe("coder");
  });

  it("includes context.previousAgent in user prompt", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const router = new LocalRouterAgent();
    await router.route("continue", { previousAgent: "architect" });
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.messages[1].content).toContain("Previous agent: architect");
  });

  it("includes context.stage in user prompt", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const router = new LocalRouterAgent();
    await router.route("implement", { stage: "04-BUILD" });
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.messages[1].content).toContain("SDLC stage: 04-BUILD");
  });

  it("sends metadata.think:false to Ollama", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const router = new LocalRouterAgent();
    await router.route("write code");
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.metadata).toEqual({ think: false });
  });

  it("uses maxTokens:64 for efficiency", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"pm","confidence":0.9}');
    const router = new LocalRouterAgent();
    await router.route("plan sprint");
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.maxTokens).toBe(64);
  });

  it("uses low temperature:0.1 for deterministic routing", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const router = new LocalRouterAgent();
    await router.route("fix bug");
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.temperature).toBe(0.1);
  });

  it("handles Vietnamese messages", async () => {
    makeOllamaMock('{"agent":"coder","confidence":0.88}');
    const router = new LocalRouterAgent();
    const result = await router.route("viết hàm sắp xếp mảng");
    expect(result.agent).toBe("coder");
    expect(result.fallbackUsed).toBe(false);
  });

  it("truncates very long messages to 500 chars", async () => {
    const ollamaMock = makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const router = new LocalRouterAgent();
    const longMsg = "x".repeat(1000);
    await router.route(longMsg);
    const callArg = ollamaMock.chat.mock.calls[0][0];
    expect(callArg.messages[1].content.length).toBeLessThan(600);
  });
});

// ============================================================================
// Tests: route() — fallback path
// ============================================================================

describe("LocalRouterAgent.route() — fallback to Anthropic Haiku", () => {
  afterEach(() => {
    resetLocalRouter();
    vi.clearAllMocks();
  });

  it("uses fallback when Ollama chat() returns null (timeout)", async () => {
    const ollamaMock = {
      chat: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 5000))
      ),
      healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    };
    vi.mocked(createOllamaProvider).mockReturnValue(ollamaMock as never);
    makeAnthropicMock('{"agent":"architect","confidence":0.8}');

    const router = new LocalRouterAgent();
    const result = await router.route("design the system");

    expect(result.fallbackUsed).toBe(true);
    expect(result.agent).toBe("architect");
    expect(result.routerModel).toBe("claude-haiku-4-5-20251001");
  });

  it("uses fallback when Ollama chat() throws", async () => {
    const ollamaMock = {
      chat: vi.fn().mockRejectedValue(new Error("connection refused")),
      healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    };
    vi.mocked(createOllamaProvider).mockReturnValue(ollamaMock as never);
    makeAnthropicMock('{"agent":"pm","confidence":0.85}');

    const router = new LocalRouterAgent();
    const result = await router.route("plan the sprint");

    expect(result.fallbackUsed).toBe(true);
    expect(result.agent).toBe("pm");
  });

  it("fallback also defaults to coder on bad JSON", async () => {
    const ollamaMock = {
      chat: vi.fn().mockRejectedValue(new Error("timeout")),
      healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    };
    vi.mocked(createOllamaProvider).mockReturnValue(ollamaMock as never);
    makeAnthropicMock("sorry I cannot help");

    const router = new LocalRouterAgent();
    const result = await router.route("do something");

    expect(result.fallbackUsed).toBe(true);
    expect(result.agent).toBe("coder");
  });

  it("fallback sets routerModel to haiku model id", async () => {
    const ollamaMock = {
      chat: vi.fn().mockRejectedValue(new Error("down")),
      healthCheck: vi.fn().mockResolvedValue({ status: "unhealthy" }),
    };
    vi.mocked(createOllamaProvider).mockReturnValue(ollamaMock as never);
    makeAnthropicMock('{"agent":"coder","confidence":0.9}');

    const router = new LocalRouterAgent();
    const result = await router.route("write code");

    expect(result.routerModel).toBe("claude-haiku-4-5-20251001");
  });
});

// ============================================================================
// Tests: singleton
// ============================================================================

describe("getLocalRouter() singleton", () => {
  afterEach(() => {
    resetLocalRouter();
    vi.clearAllMocks();
  });

  it("returns same instance on multiple calls", () => {
    makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const a = getLocalRouter();
    const b = getLocalRouter();
    expect(a).toBe(b);
  });

  it("resetLocalRouter() creates fresh instance", () => {
    makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const a = getLocalRouter();
    resetLocalRouter();
    makeOllamaMock('{"agent":"coder","confidence":0.9}');
    const b = getLocalRouter();
    expect(a).not.toBe(b);
  });
});
