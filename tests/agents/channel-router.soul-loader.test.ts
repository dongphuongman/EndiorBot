/**
 * Tests for channel-router SoulLoader integration — Sprint 84 (ADR-025)
 *
 * Covers: getAgentSoul() delegates to SoulLoader, AGENT_SOULS proxy
 * has() and get() behaviour, and unknown-agent fallback content.
 *
 * @module tests/agents/channel-router.soul-loader
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks — declared before imports so vi.mock hoisting takes effect
// ============================================================================

/**
 * Mock SoulLoader — returns deterministic content per role without
 * touching the filesystem. Mirrors the real SoulLoader contract.
 */
const mockLoad = vi.fn().mockImplementation((role: string) => {
  const validRoles = [
    "pm", "architect", "coder", "reviewer", "tester", "researcher",
    "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
  ];
  const isValid = validRoles.includes(role);
  return {
    loaded: isValid,
    content: isValid
      ? `Mock SOUL content for role: ${role}`
      : "You are the Assistant agent for EndiorBot. You handle message routing, delegation, and general assistance. Respond in the same language as the user's message.",
    fallback: !isValid,
    agentRole: isValid ? role : "assistant",
    contentHash: "mockHash1234567890abcdef1234567890abcdef1234567890abcdef12345678",
    source: isValid ? "file" : "fallback-inline",
  };
});

const mockSoulLoaderInstance = {
  load: mockLoad,
  getValidRoles: vi.fn().mockReturnValue([
    "pm", "architect", "coder", "reviewer", "tester", "researcher",
    "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
  ]),
  clearCache: vi.fn(),
};

vi.mock("../../src/bridge/intelligence/soul-loader.js", () => ({
  getSoulLoader: () => mockSoulLoaderInstance,
  resetSoulLoader: vi.fn(),
  createSoulLoader: vi.fn(),
}));

// Mock heavy transitive dependencies that channel-router imports
vi.mock("../../src/agents/invoke/index.js", () => ({
  getClaudeCodeBridge: vi.fn().mockReturnValue({
    isAvailable: vi.fn().mockResolvedValue(false),
    invokeRead: vi.fn().mockResolvedValue({ success: false, error: "mocked" }),
  }),
}));

vi.mock("../../src/providers/init.js", () => ({
  initializeProvidersFromEnv: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../src/providers/provider-registry.js", () => ({
  getProviderRegistry: vi.fn().mockReturnValue({
    getDefault: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock("../../src/agents/orchestrator/mention-parser.js", () => ({
  parseMention: vi.fn().mockReturnValue({ success: false }),
}));

// ============================================================================
// Static imports — resolved after mocks
// ============================================================================

import {
  getAgentSoul,
  AGENT_SOULS,
  VALID_AGENTS,
} from "../../src/agents/channel-router.js";

// ============================================================================
// Tests
// ============================================================================

describe("channel-router — SoulLoader integration (Sprint 84)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-attach mock so clearAllMocks doesn't break it
    mockLoad.mockImplementation((role: string) => {
      const validRoles = [
        "pm", "architect", "coder", "reviewer", "tester", "researcher",
        "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
      ];
      const isValid = validRoles.includes(role);
      return {
        loaded: isValid,
        content: isValid
          ? `Mock SOUL content for role: ${role}`
          : "You are the Assistant agent for EndiorBot. You handle message routing, delegation, and general assistance. Respond in the same language as the user's message.",
        fallback: !isValid,
        agentRole: isValid ? role : "assistant",
        contentHash: "mockHash1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        source: isValid ? "file" : "fallback-inline",
      };
    });
  });

  // --------------------------------------------------------------------------
  // getAgentSoul()
  // --------------------------------------------------------------------------

  describe("getAgentSoul()", () => {
    it("returns content string for a valid role — delegates to SoulLoader.load()", () => {
      const soul = getAgentSoul("pm");

      expect(mockLoad).toHaveBeenCalledWith("pm");
      expect(soul).toBe("Mock SOUL content for role: pm");
    });

    it("returns content for all 14 valid roles without error", () => {
      for (const role of VALID_AGENTS) {
        const soul = getAgentSoul(role);
        expect(typeof soul).toBe("string");
        expect(soul.length).toBeGreaterThan(0);
      }
    });

    it("returns fallback content string when role is unknown", () => {
      const soul = getAgentSoul("unknown-agent");

      expect(mockLoad).toHaveBeenCalledWith("unknown-agent");
      // Falls back to assistant content
      expect(soul).toContain("Assistant agent");
    });

    it("returns a plain string — not a SoulLoadResult object", () => {
      const soul = getAgentSoul("architect");

      expect(typeof soul).toBe("string");
      // Must not be an object with .content property
      expect(typeof (soul as unknown as { content?: string }).content).toBe("undefined");
    });
  });

  // --------------------------------------------------------------------------
  // AGENT_SOULS proxy
  // --------------------------------------------------------------------------

  describe("AGENT_SOULS proxy", () => {
    it("proxy.has() returns true for all valid agent names", () => {
      for (const role of VALID_AGENTS) {
        expect(role in AGENT_SOULS).toBe(true);
      }
    });

    it("proxy.has() returns false for invalid agent names", () => {
      expect("invalid" in AGENT_SOULS).toBe(false);
      expect("root" in AGENT_SOULS).toBe(false);
      expect("" in AGENT_SOULS).toBe(false);
    });

    it("proxy.get() returns soul content string by delegating to getAgentSoul()", () => {
      const content = AGENT_SOULS["coder"];

      expect(typeof content).toBe("string");
      expect(content).toContain("coder");
      expect(mockLoad).toHaveBeenCalledWith("coder");
    });

    it("proxy.get() for unknown key returns fallback content (not undefined)", () => {
      const content = AGENT_SOULS["nonexistent"];

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });
  });
});
