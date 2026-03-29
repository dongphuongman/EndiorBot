/**
 * Router Decomposition Smoke Tests — Sprint 121 T3
 *
 * Verify that the 3-file decomposition (agent-constants, providers, patch-flow)
 * preserves the public API contract of channel-router.ts.
 *
 * CPO C1: Zero behavior change — pure structural refactor.
 * CPO C5: Run after each extraction step.
 */

import { describe, it, expect, vi } from "vitest";

// ============================================================================
// 1. Re-export resolution — channel-router.ts still exposes the full public API
// ============================================================================

describe("Router Decomposition — re-export resolution", () => {
  it("channel-router re-exports VALID_AGENTS from agent-constants", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.VALID_AGENTS).toBe(subModule.VALID_AGENTS);
  });

  it("channel-router re-exports AgentName type (compile-time check)", async () => {
    // If this compiles, the type re-export works
    const { VALID_AGENTS } = await import("../../../src/agents/channel-router.js");
    const agent: (typeof VALID_AGENTS)[number] = "pm";
    expect(VALID_AGENTS).toContain(agent);
  });

  it("channel-router re-exports TIER_AGENT_MODEL_MAP", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.TIER_AGENT_MODEL_MAP).toBe(subModule.TIER_AGENT_MODEL_MAP);
  });

  it("channel-router re-exports AGENT_MODEL_MAP", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.AGENT_MODEL_MAP).toBe(subModule.AGENT_MODEL_MAP);
  });

  it("channel-router re-exports getAgentModel", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.getAgentModel).toBe(subModule.getAgentModel);
  });

  it("channel-router re-exports getAgentSoul", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.getAgentSoul).toBe(subModule.getAgentSoul);
  });

  it("channel-router re-exports AGENT_SOULS proxy", async () => {
    const mainModule = await import("../../../src/agents/channel-router.js");
    const subModule = await import("../../../src/agents/router/agent-constants.js");
    expect(mainModule.AGENT_SOULS).toBe(subModule.AGENT_SOULS);
  });
});

// ============================================================================
// 2. Provider paths — standalone functions are importable and typed correctly
// ============================================================================

describe("Router Decomposition — provider paths reachable", () => {
  it("callClaudeBridge is exported from providers.ts", async () => {
    const { callClaudeBridge } = await import("../../../src/agents/router/providers.js");
    expect(typeof callClaudeBridge).toBe("function");
  });

  it("callCloudFallback is exported from providers.ts", async () => {
    const { callCloudFallback } = await import("../../../src/agents/router/providers.js");
    expect(typeof callCloudFallback).toBe("function");
  });

  it("callRemoteOllama is exported from providers.ts", async () => {
    const { callRemoteOllama } = await import("../../../src/agents/router/providers.js");
    expect(typeof callRemoteOllama).toBe("function");
  });

  it("callClaudeBridge returns null when bridge unavailable", async () => {
    const { callClaudeBridge } = await import("../../../src/agents/router/providers.js");
    const deps = {
      bridge: null,
      claudeAvailable: false,
      config: { projectRoot: "/tmp", claudeTimeout: 10, claudeMaxTokens: 100 } as any,
    };
    const result = await callClaudeBridge(deps, "coder", "test task");
    expect(result).toBeNull();
  });

  it("callCloudFallback returns null when no provider registered", async () => {
    const { callCloudFallback } = await import("../../../src/agents/router/providers.js");
    const deps = {
      bridge: null,
      claudeAvailable: false,
      config: { projectRoot: "/tmp" } as any,
    };
    const result = await callCloudFallback(deps, "coder", "test task");
    expect(result).toBeNull();
  });

  it("callRemoteOllama returns null when no remote URL configured", async () => {
    const { callRemoteOllama } = await import("../../../src/agents/router/providers.js");
    const deps = {
      bridge: null,
      claudeAvailable: false,
      config: { projectRoot: "/tmp", ollamaRemoteUrl: "" } as any,
    };
    const result = await callRemoteOllama(deps, "coder", "test task");
    expect(result).toBeNull();
  });
});

// ============================================================================
// 3. Patch-flow gate — functions are importable and typed correctly
// ============================================================================

describe("Router Decomposition — patch-flow gate reachable", () => {
  it("requestPatchConfirmation is exported from patch-flow.ts", async () => {
    const { requestPatchConfirmation } = await import("../../../src/agents/router/patch-flow.js");
    expect(typeof requestPatchConfirmation).toBe("function");
  });

  it("executePatch is exported from patch-flow.ts", async () => {
    const { executePatch } = await import("../../../src/agents/router/patch-flow.js");
    expect(typeof executePatch).toBe("function");
  });

  it("executePatch returns null when bridge is null", async () => {
    const { executePatch } = await import("../../../src/agents/router/patch-flow.js");
    const deps = { bridge: null, config: { projectRoot: "/tmp" } as any };
    const result = await executePatch(deps, "coder", "test", "soul prompt");
    expect(result).toBeNull();
  });
});

// ============================================================================
// 4. ChannelRouter class still works (integration smoke)
// ============================================================================

describe("Router Decomposition — ChannelRouter class preserved", () => {
  it("createChannelRouter factory still works", async () => {
    const { createChannelRouter } = await import("../../../src/agents/channel-router.js");
    const router = createChannelRouter({ verbose: false });
    expect(router).toBeDefined();
    expect(router.config.verbose).toBe(false);
  });

  it("ChannelRouter.routeMessage delegates to parseMention", async () => {
    const { createChannelRouter } = await import("../../../src/agents/channel-router.js");
    const router = createChannelRouter();
    const result = await router.routeMessage("@coder fix the bug");
    expect(result).not.toBeNull();
    expect(result!.agents).toContain("coder");
  });

  it("ChannelRouter.formatResponse still works", async () => {
    const { createChannelRouter } = await import("../../../src/agents/channel-router.js");
    const router = createChannelRouter();
    const formatted = router.formatResponse("coder", {
      content: "Fixed the bug",
      provider: "claude-code",
      durationMs: 100,
    });
    expect(formatted).toContain("@coder");
    expect(formatted).toContain("Fixed the bug");
  });

  it("ChannelRouter.getStatus returns valid status object", async () => {
    const { createChannelRouter } = await import("../../../src/agents/channel-router.js");
    const router = createChannelRouter();
    const status = router.getStatus();
    expect(status).toHaveProperty("router");
    expect(status).toHaveProperty("primary");
    expect(status).toHaveProperty("fallback");
    expect(status).toHaveProperty("last");
    expect(status).toHaveProperty("providerCount");
  });
});
