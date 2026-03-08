/**
 * Team Launch Tests — Sprint 90 (ADR-026)
 *
 * Covers: --as-team parsing, flag check, mutual exclusion,
 * complexity gate flow, callback handling, timeout behavior.
 *
 * @module tests/channels/telegram/team-launch
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockLaunch = vi.fn().mockResolvedValue({
  success: true,
  session: {
    id: "bridge_12345_abc",
    agentType: "claude-code",
    tmuxTarget: "endiorbot:claudecode.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/project",
    workspaceFingerprint: "abc123",
    status: "active",
    riskMode: "read",
    agentRole: "coder",
    teamId: "dev",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  },
});

const mockGetFeatureFlag = vi.fn().mockReturnValue(true);

vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: () => ({
    launch: mockLaunch,
  }),
}));

vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: () => ({
    getActive: vi.fn().mockReturnValue([]),
    get: vi.fn(),
  }),
}));

vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    capturePane: vi.fn().mockResolvedValue(""),
  }),
}));

vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({ blocked: false, content: "" }),
}));

vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({
    log: vi.fn(),
  }),
}));

vi.mock("../../../src/config/feature-flags.js", () => ({
  getFeatureFlagWithEnvOverride: (...args: unknown[]) => mockGetFeatureFlag(...args),
}));

vi.mock("../../../src/bridge/intelligence/turn-context.js", () => ({
  buildTurnContext: vi.fn(),
  loadTurnContextFromActive: vi.fn(),
  incrementTurnCount: vi.fn().mockReturnValue(1),
  getTurnCount: vi.fn().mockReturnValue(0),
  shouldRefreshContext: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../src/bridge/intelligence/envelope-builder.js", () => ({
  buildFullEnvelope: vi.fn().mockReturnValue({ persona: { agentRole: "coder", soulContent: "", soulContentHash: "" } }),
  serializeEnvelopeForInjection: vi.fn().mockReturnValue(""),
}));

vi.mock("../../../src/bridge/intelligence/output-evaluator.js", () => ({
  evaluateOutput: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../src/bridge/intelligence/evaluation-store.js", () => ({
  appendEvaluation: vi.fn(),
  generateEvaluationId: vi.fn().mockReturnValue("eval_test"),
}));

vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: () => ({
    getTeam: vi.fn().mockReturnValue({ found: true, team: { id: "dev", leader: "coder" } }),
  }),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  handleLaunchCommand,
  handleComplexityGateCallback,
  pendingTeamLaunches,
  pendingTeamTimeouts,
} from "../../../src/channels/telegram/telegram-commands.js";

// ============================================================================
// Tests
// ============================================================================

describe("Team Launch — --as-team Flag (Sprint 90)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeatureFlag.mockReturnValue(true);
    pendingTeamLaunches.clear();
    for (const [, timer] of pendingTeamTimeouts) clearTimeout(timer);
    pendingTeamTimeouts.clear();
  });

  // --------------------------------------------------------------------------
  // --as-team parsing
  // --------------------------------------------------------------------------

  it("should parse --as-team dev and launch with teamId", async () => {
    // Long enough + keyword to pass complexity gate
    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as-team", "dev", "Refactor", "the", "authentication", "module", "and", "update", "tests"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(true);
    expect(result.response).toContain("Agent Launched");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "dev",
        agentRole: "coder", // derived from TEAM_LEADER_ROLES
      }),
    );
  });

  it("should reject unknown teamId", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as-team", "nonexistent"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown team");
  });

  it("should error when AGENT_TEAMS flag is disabled", async () => {
    mockGetFeatureFlag.mockReturnValue(false);

    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as-team", "dev"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(false);
    expect(result.response).toContain("AGENT_TEAMS");
  });

  it("should reject --as and --as-team together", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as", "pm", "--as-team", "dev"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(false);
    expect(result.response).toContain("Cannot use --as and --as-team together");
  });

  // --------------------------------------------------------------------------
  // Complexity gate
  // --------------------------------------------------------------------------

  it("should trigger complexity gate for simple task", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as-team", "dev", "Fix", "typo"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(true);
    expect(result.response).toContain("Complexity Gate");
    expect(result.reply_markup).toBeDefined();
    expect(pendingTeamLaunches.size).toBe(1);
  });

  it("should launch directly for complex task", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/tmp/project", "--as-team", "dev", "Refactor", "the", "authentication", "module", "and", "update", "all", "tests"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(true);
    expect(result.response).toContain("Agent Launched");
    expect(pendingTeamLaunches.size).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Complexity gate callback
  // --------------------------------------------------------------------------

  it("should launch team on 'team' callback", async () => {
    // Store a pending launch
    pendingTeamLaunches.set("gate_123", {
      agentType: "claude-code",
      projectPath: "/tmp/project",
      teamId: "dev",
      actorId: "ceo@endiorbot",
      task: "Fix typo",
      createdAt: Date.now(),
    });

    const result = await handleComplexityGateCallback("team", "gate_123", "ceo@endiorbot");

    expect(result.success).toBe(true);
    expect(result.response).toContain("Agent Launched");
    expect(result.response).toContain("team");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "dev" }),
    );
    expect(pendingTeamLaunches.size).toBe(0);
  });

  it("should launch solo on 'solo' callback", async () => {
    pendingTeamLaunches.set("gate_456", {
      agentType: "claude-code",
      projectPath: "/tmp/project",
      teamId: "dev",
      actorId: "ceo@endiorbot",
      task: "Fix typo",
      createdAt: Date.now(),
    });

    const result = await handleComplexityGateCallback("solo", "gate_456", "ceo@endiorbot");

    expect(result.success).toBe(true);
    expect(result.response).toContain("solo");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ agentRole: "coder" }),
    );
    // Should NOT have teamId for solo
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.not.objectContaining({ teamId: "dev" }),
    );
    expect(pendingTeamLaunches.size).toBe(0);
  });

  it("should return error for expired gate", async () => {
    const result = await handleComplexityGateCallback("team", "nonexistent", "ceo@endiorbot");

    expect(result.success).toBe(false);
    expect(result.response).toContain("expired");
  });
});
