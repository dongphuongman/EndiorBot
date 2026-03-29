/**
 * Tests for team command handlers.
 *
 * @module tests/commands/handlers/team-commands
 * @sprint 120 — Track A1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies
vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: vi.fn(),
}));
vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: vi.fn(),
}));
vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: vi.fn(() => ({})),
}));
vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: vi.fn(() => ({ log: vi.fn() })),
}));
vi.mock("../../../src/bridge/security/bridge-policy.js", () => ({
  getBridgePolicyManager: vi.fn(() => ({
    getPolicy: () => ({ teamCostThresholdUsd: 5.0 }),
  })),
}));
vi.mock("../../../src/config/feature-flags.js", () => ({
  getFeatureFlagWithEnvOverride: vi.fn(),
}));
vi.mock("../../../src/bridge/teams/team-monitor.js", () => ({
  getTeamStatus: vi.fn(),
  getTeamSessions: vi.fn(),
  formatTeamDashboard: vi.fn(),
}));
vi.mock("../../../src/budget/pricing-registry.js", () => ({
  createPricingRegistry: vi.fn(() => ({})),
}));
vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  createTeamCostKeyboard: vi.fn((teamId: string) => ({
    inline_keyboard: [[{ text: "Extend", callback_data: `team_cost_extend_${teamId}` }]],
  })),
}));
vi.mock("../../../src/commands/handlers/bridge-commands.js", () => ({
  activeSessionMap: new Map(),
}));

import {
  handleTeamStatusCommand,
  handleKillTeamCommand,
  handleTeamCostCallback,
  costThresholdOverrides,
} from "../../../src/commands/handlers/team-commands.js";
import { getFeatureFlagWithEnvOverride } from "../../../src/config/feature-flags.js";
import { getSessionRegistry } from "../../../src/bridge/session-registry.js";
import { getTeamStatus, getTeamSessions, formatTeamDashboard } from "../../../src/bridge/teams/team-monitor.js";
import { getAgentLauncher } from "../../../src/bridge/agent-launcher.js";

const mockRegistry = {
  get: vi.fn(),
};

const mockLauncher = {
  kill: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  costThresholdOverrides.clear();
  vi.mocked(getSessionRegistry).mockReturnValue(mockRegistry as never);
  vi.mocked(getAgentLauncher).mockReturnValue(mockLauncher as never);
});

// ============================================================================
// handleTeamStatusCommand
// ============================================================================

describe("handleTeamStatusCommand", () => {
  it("returns error when AGENT_TEAMS flag disabled", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(false);
    const result = await handleTeamStatusCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("AGENT_TEAMS");
  });

  it("returns usage when no args", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    const result = await handleTeamStatusCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage: /team-status");
  });

  it("returns not found for unknown session", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue(undefined);
    const result = await handleTeamStatusCommand(["unknown"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found");
  });

  it("returns error for non-team session", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: undefined });
    const result = await handleTeamStatusCommand(["sess-1"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not part of a team");
  });

  it("returns formatted dashboard for valid team session", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: "dev" });
    vi.mocked(getTeamStatus).mockResolvedValue({
      teamId: "dev",
      members: [{ id: "sess-1" }],
      totalCostUsd: 1.5,
      thresholdExceeded: false,
    } as never);
    vi.mocked(formatTeamDashboard).mockReturnValue("Dashboard: dev-team OK");

    const result = await handleTeamStatusCommand(["sess-1"], "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Dashboard: dev-team OK");
  });

  it("includes cost keyboard when threshold exceeded", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: "dev" });
    vi.mocked(getTeamStatus).mockResolvedValue({
      teamId: "dev",
      members: [{ id: "sess-1" }],
      totalCostUsd: 10.0,
      thresholdExceeded: true,
    } as never);
    vi.mocked(formatTeamDashboard).mockReturnValue("Dashboard: OVER BUDGET");

    const result = await handleTeamStatusCommand(["sess-1"], "user1");
    expect(result.success).toBe(true);
    expect(result.replyMarkup).toBeDefined();
  });
});

// ============================================================================
// handleKillTeamCommand
// ============================================================================

describe("handleKillTeamCommand", () => {
  it("returns error when AGENT_TEAMS flag disabled", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(false);
    const result = await handleKillTeamCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("AGENT_TEAMS");
  });

  it("returns usage when no args", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    const result = await handleKillTeamCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage: /kill-team");
  });

  it("returns not found for unknown session", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue(undefined);
    const result = await handleKillTeamCommand(["unknown"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found");
  });

  it("returns error for non-team session", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-solo", teamId: undefined });
    const result = await handleKillTeamCommand(["sess-solo"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not part of a team");
  });

  it("kills all team members and returns count", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: "dev" });
    vi.mocked(getTeamSessions).mockReturnValue([
      { id: "sess-1" },
      { id: "sess-2" },
    ] as never);
    mockLauncher.kill.mockResolvedValue({ success: true });

    const result = await handleKillTeamCommand(["sess-1"], "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("2 members stopped");
    expect(mockLauncher.kill).toHaveBeenCalledTimes(2);
  });

  it("clears costThresholdOverrides after kill", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: "dev" });
    vi.mocked(getTeamSessions).mockReturnValue([{ id: "sess-1" }] as never);
    mockLauncher.kill.mockResolvedValue({ success: true });

    costThresholdOverrides.set("dev", 10.0);
    await handleKillTeamCommand(["sess-1"], "user1");
    expect(costThresholdOverrides.has("dev")).toBe(false);
  });
});

// ============================================================================
// handleTeamCostCallback
// ============================================================================

describe("handleTeamCostCallback", () => {
  it("extend action increases threshold by $2", async () => {
    const result = await handleTeamCostCallback("extend", "dev", "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("$7.00"); // default 5.0 + 2.0
    expect(costThresholdOverrides.get("dev")).toBe(7.0);
  });

  it("extend action stacks on existing override", async () => {
    costThresholdOverrides.set("dev", 9.0);
    const result = await handleTeamCostCallback("extend", "dev", "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("$11.00"); // 9.0 + 2.0
    expect(costThresholdOverrides.get("dev")).toBe(11.0);
  });

  it("stop action delegates to kill-team", async () => {
    vi.mocked(getFeatureFlagWithEnvOverride).mockReturnValue(true);
    vi.mocked(getTeamSessions).mockReturnValue([{ id: "sess-1" }] as never);
    mockRegistry.get.mockReturnValue({ id: "sess-1", teamId: "dev" });
    mockLauncher.kill.mockResolvedValue({ success: true });

    const result = await handleTeamCostCallback("stop", "dev", "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("killed");
  });

  it("stop action when team already stopped", async () => {
    vi.mocked(getTeamSessions).mockReturnValue([]);
    const result = await handleTeamCostCallback("stop", "dev", "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("already stopped");
  });

  it("unknown action returns error", async () => {
    const result = await handleTeamCostCallback("unknown", "dev", "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown cost action");
  });
});
