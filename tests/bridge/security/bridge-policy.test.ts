/**
 * Bridge Policy Manager Tests
 *
 * Tests for BridgePolicyManager — covers default policy values, safety
 * invariants, session creation guards, agent type allowlist, rate limiting,
 * and shell pane enforcement.
 *
 * @module tests/bridge/security/bridge-policy
 * @version 1.0.0
 * @date 2026-03-06
 * @authority ADR-024 A4
 * @stage 04 - BUILD (Sprint 82)
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  BridgePolicyManager,
  DEFAULT_BRIDGE_POLICY,
  resetBridgePolicyManager,
} from "../../../src/bridge/security/bridge-policy.js";
import type { BridgeSession, AgentProviderType } from "../../../src/bridge/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSession(
  agentType: AgentProviderType,
  status: "active" | "stopped" | "error" = "active"
): BridgeSession {
  return {
    id: `bridge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    agentType,
    tmuxTarget: "endiorbot:claude.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/project",
    workspaceFingerprint: "abc123",
    status,
    riskMode: "read",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}

function makeActiveSessions(
  agentType: AgentProviderType,
  count: number
): BridgeSession[] {
  return Array.from({ length: count }, () => makeSession(agentType, "active"));
}

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  resetBridgePolicyManager();
});

// ============================================================================
// Default Policy Values
// ============================================================================

describe("DEFAULT_BRIDGE_POLICY", () => {
  it("has correct allowedAgentTypes", () => {
    expect(DEFAULT_BRIDGE_POLICY.allowedAgentTypes).toEqual([
      "claude-code",
      "cursor",
      "codex-cli",
      "gemini-cli",
    ]);
  });

  it("has maxSessionsPerAgent of 2", () => {
    expect(DEFAULT_BRIDGE_POLICY.maxSessionsPerAgent).toBe(2);
  });

  it("has maxTotalSessions of 6", () => {
    expect(DEFAULT_BRIDGE_POLICY.maxTotalSessions).toBe(6);
  });

  it("has commandsPerMinute of 20", () => {
    expect(DEFAULT_BRIDGE_POLICY.telegramRateLimit.commandsPerMinute).toBe(20);
  });

  it("has sendKeysPerMinute of 10", () => {
    expect(DEFAULT_BRIDGE_POLICY.telegramRateLimit.sendKeysPerMinute).toBe(10);
  });

  it("has shellPanesDisabled set to true", () => {
    expect(DEFAULT_BRIDGE_POLICY.shellPanesDisabled).toBe(true);
  });
});

// ============================================================================
// Safety Invariant: shellPanesDisabled is always true
// ============================================================================

describe("BridgePolicyManager — shellPanesDisabled invariant", () => {
  it("keeps shellPanesDisabled true even when constructed with false", () => {
    const manager = new BridgePolicyManager({ shellPanesDisabled: false });
    expect(manager.getPolicy().shellPanesDisabled).toBe(true);
  });

  it("keeps shellPanesDisabled true with default construction", () => {
    const manager = new BridgePolicyManager();
    expect(manager.getPolicy().shellPanesDisabled).toBe(true);
  });
});

// ============================================================================
// canCreateSession
// ============================================================================

describe("BridgePolicyManager — canCreateSession", () => {
  it("allows session creation for valid agent type with no existing sessions", () => {
    const manager = new BridgePolicyManager();
    const result = manager.canCreateSession("claude-code", []);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("OK");
  });

  it("allows session when under per-agent limit", () => {
    const manager = new BridgePolicyManager();
    const sessions = makeActiveSessions("claude-code", 1);
    const result = manager.canCreateSession("claude-code", sessions);
    expect(result.allowed).toBe(true);
  });

  it("blocks session when per-agent limit reached (default 2)", () => {
    const manager = new BridgePolicyManager();
    const sessions = makeActiveSessions("claude-code", 2);
    const result = manager.canCreateSession("claude-code", sessions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max sessions reached for claude-code/i);
    expect(result.reason).toMatch(/2\/2/);
  });

  it("blocks session when total sessions limit reached (default 6)", () => {
    const manager = new BridgePolicyManager();
    // 2 claude-code + 2 cursor + 2 codex-cli = 6 total
    const sessions = [
      ...makeActiveSessions("claude-code", 2),
      ...makeActiveSessions("cursor", 2),
      ...makeActiveSessions("codex-cli", 2),
    ];
    // gemini-cli has 0 active — under per-agent limit, but total is at max
    const result = manager.canCreateSession("gemini-cli", sessions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max total sessions reached/i);
    expect(result.reason).toMatch(/6\/6/);
  });

  it("does not count stopped sessions toward per-agent limit", () => {
    const manager = new BridgePolicyManager();
    const sessions = [
      makeSession("claude-code", "stopped"),
      makeSession("claude-code", "stopped"),
    ];
    const result = manager.canCreateSession("claude-code", sessions);
    expect(result.allowed).toBe(true);
  });

  it("does not count error sessions toward total limit", () => {
    const manager = new BridgePolicyManager();
    // 6 error sessions — none are active
    const sessions = Array.from({ length: 6 }, () =>
      makeSession("cursor", "error")
    );
    const result = manager.canCreateSession("cursor", sessions);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================================
// isAgentTypeAllowed
// ============================================================================

describe("BridgePolicyManager — isAgentTypeAllowed", () => {
  it("allows claude-code", () => {
    const manager = new BridgePolicyManager();
    expect(manager.isAgentTypeAllowed("claude-code")).toBe(true);
  });

  it("allows cursor", () => {
    const manager = new BridgePolicyManager();
    expect(manager.isAgentTypeAllowed("cursor")).toBe(true);
  });

  it("allows codex-cli", () => {
    const manager = new BridgePolicyManager();
    expect(manager.isAgentTypeAllowed("codex-cli")).toBe(true);
  });

  it("allows gemini-cli", () => {
    const manager = new BridgePolicyManager();
    expect(manager.isAgentTypeAllowed("gemini-cli")).toBe(true);
  });

  it("blocks agent type not in allowlist", () => {
    // Cast to AgentProviderType to test boundary — real runtime scenario
    const manager = new BridgePolicyManager({
      allowedAgentTypes: ["claude-code"],
    });
    expect(manager.isAgentTypeAllowed("cursor")).toBe(false);
  });

  it("canCreateSession blocks disallowed agent type", () => {
    const manager = new BridgePolicyManager({
      allowedAgentTypes: ["claude-code"],
    });
    const result = manager.canCreateSession("cursor", []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });
});

// ============================================================================
// Rate Limiting
// ============================================================================

describe("BridgePolicyManager — rate limiting", () => {
  it("allows commands within rate limit", () => {
    resetBridgePolicyManager();
    const manager = new BridgePolicyManager({
      telegramRateLimit: { commandsPerMinute: 5, sendKeysPerMinute: 5 },
    });
    // First 5 calls within limit
    for (let i = 0; i < 5; i++) {
      expect(manager.checkCommandRateLimit("actor-1")).toBe(true);
    }
  });

  it("blocks commands once rate limit is exceeded", () => {
    resetBridgePolicyManager();
    const manager = new BridgePolicyManager({
      telegramRateLimit: { commandsPerMinute: 3, sendKeysPerMinute: 10 },
    });
    // Exhaust the 3-per-minute budget
    manager.checkCommandRateLimit("actor-2");
    manager.checkCommandRateLimit("actor-2");
    manager.checkCommandRateLimit("actor-2");
    // 4th call should be blocked
    expect(manager.checkCommandRateLimit("actor-2")).toBe(false);
  });

  it("rate limits are per-actor (different actors have independent buckets)", () => {
    resetBridgePolicyManager();
    const manager = new BridgePolicyManager({
      telegramRateLimit: { commandsPerMinute: 2, sendKeysPerMinute: 10 },
    });
    manager.checkCommandRateLimit("actor-A");
    manager.checkCommandRateLimit("actor-A");
    // actor-A is at limit, actor-B should still be allowed
    expect(manager.checkCommandRateLimit("actor-A")).toBe(false);
    expect(manager.checkCommandRateLimit("actor-B")).toBe(true);
  });
});

// ============================================================================
// isShellPaneAllowed — always false
// ============================================================================

describe("BridgePolicyManager — isShellPaneAllowed", () => {
  it("returns false with default policy", () => {
    const manager = new BridgePolicyManager();
    expect(manager.isShellPaneAllowed()).toBe(false);
  });

  it("returns false even when constructed with shellPanesDisabled: false", () => {
    // The safety invariant forces shellPanesDisabled = true in constructor
    const manager = new BridgePolicyManager({ shellPanesDisabled: false });
    expect(manager.isShellPaneAllowed()).toBe(false);
  });
});
