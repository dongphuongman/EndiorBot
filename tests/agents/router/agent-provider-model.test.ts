/**
 * ADR-052: Agent-Model Tier Mapping Tests
 *
 * Validates AGENT_PROVIDER_MODEL_MAP, TIER_FALLBACK_CHAIN,
 * getAgentProviderModel(), and dispatchAgentPrimary/dispatchAgentFallback.
 */

import {
  AGENT_PROVIDER_MODEL_MAP,
  TIER_FALLBACK_CHAIN,
  getAgentProviderModel,
  getAgentModel,
  AGENT_MODEL_MAP,
  TIER_AGENT_MODEL_MAP,
} from "../../../src/agents/router/agent-constants.js";

describe("ADR-052: Agent-Model Tier Mapping", () => {
  describe("AGENT_PROVIDER_MODEL_MAP", () => {
    it("covers all 14 agents", () => {
      const agents = [
        "pm", "architect", "coder", "reviewer", "tester", "researcher",
        "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "cso", "assistant",
      ];
      for (const agent of agents) {
        expect(AGENT_PROVIDER_MODEL_MAP[agent as keyof typeof AGENT_PROVIDER_MODEL_MAP]).toBeDefined();
      }
    });

    it("Tier 1 agents use claude-code/opus", () => {
      expect(AGENT_PROVIDER_MODEL_MAP.architect.provider).toBe("claude-code");
      expect(AGENT_PROVIDER_MODEL_MAP.architect.model).toBe("claude-opus-4");
      expect(AGENT_PROVIDER_MODEL_MAP.architect.tier).toBe(1);

      expect(AGENT_PROVIDER_MODEL_MAP.cso.provider).toBe("claude-code");
      expect(AGENT_PROVIDER_MODEL_MAP.cso.model).toBe("claude-opus-4");
      expect(AGENT_PROVIDER_MODEL_MAP.cso.tier).toBe(1);

      expect(AGENT_PROVIDER_MODEL_MAP.ceo.provider).toBe("claude-code");
      expect(AGENT_PROVIDER_MODEL_MAP.ceo.model).toBe("claude-opus-4");
      expect(AGENT_PROVIDER_MODEL_MAP.ceo.tier).toBe(1);
    });

    it("Tier 2 agents use claude-code/sonnet (CEO 2026-04-26: CC first, Kimi fallback)", () => {
      const tier2Agents = ["coder", "reviewer", "tester", "pm", "cpo", "cto", "fullstack", "pjm", "researcher", "devops"];
      for (const agent of tier2Agents) {
        const config = AGENT_PROVIDER_MODEL_MAP[agent as keyof typeof AGENT_PROVIDER_MODEL_MAP];
        expect(config).toBeDefined();
        expect(config.provider).toBe("claude-code");
        expect(config.model).toBe("sonnet");
        expect(config.tier).toBe(2);
      }
    });

    it("Tier 3 agent uses ollama/qwen3.5:9b", () => {
      expect(AGENT_PROVIDER_MODEL_MAP.assistant.provider).toBe("ollama");
      expect(AGENT_PROVIDER_MODEL_MAP.assistant.model).toBe("qwen3.5:9b");
      expect(AGENT_PROVIDER_MODEL_MAP.assistant.tier).toBe(3);
    });
  });

  describe("TIER_FALLBACK_CHAIN", () => {
    it("Tier 1: claude-code → kimi → ollama", () => {
      expect(TIER_FALLBACK_CHAIN[1]).toEqual(["claude-code", "kimi", "ollama"]);
    });

    it("Tier 2: claude-code → kimi → ollama (CEO 2026-04-26: CC first)", () => {
      expect(TIER_FALLBACK_CHAIN[2]).toEqual(["claude-code", "kimi", "ollama"]);
    });

    it("Tier 3: ollama → kimi → claude-code", () => {
      expect(TIER_FALLBACK_CHAIN[3]).toEqual(["ollama", "kimi", "claude-code"]);
    });
  });

  describe("getAgentProviderModel", () => {
    it("returns config for known agents", () => {
      expect(getAgentProviderModel("coder")?.provider).toBe("claude-code");
      expect(getAgentProviderModel("architect")?.provider).toBe("claude-code");
      expect(getAgentProviderModel("assistant")?.provider).toBe("ollama");
    });

    it("returns undefined for unknown agents", () => {
      expect(getAgentProviderModel("unknown-agent")).toBeUndefined();
    });
  });

  describe("Backward compatibility", () => {
    it("getAgentModel still works and returns model name", () => {
      expect(getAgentModel("coder")).toBe("sonnet");
      expect(getAgentModel("architect")).toBe("claude-opus-4");
      expect(getAgentModel("assistant")).toBe("qwen3.5:9b");
    });

    it("AGENT_MODEL_MAP still has legacy entries", () => {
      expect(AGENT_MODEL_MAP.coder).toBe("sonnet"); // legacy value from TIER_AGENT_MODEL_MAP
      expect(AGENT_MODEL_MAP.architect).toBe("opus");
    });

    it("TIER_AGENT_MODEL_MAP preserved", () => {
      expect(Object.keys(TIER_AGENT_MODEL_MAP)).toEqual(["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"]);
    });
  });
});
