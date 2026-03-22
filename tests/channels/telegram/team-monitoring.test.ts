/**
 * Team Monitoring Command Tests — Sprint 91 (ADR-026)
 *
 * Covers: /team-status, /kill-team, cost callback (extend/stop),
 * feature flag guard, audit events.
 *
 * @module tests/channels/telegram/team-monitoring
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockGetActive = vi.fn().mockReturnValue([]);
const mockGet = vi.fn();
const mockKill = vi.fn().mockResolvedValue({ success: true });
const mockAuditLog = vi.fn();
const mockGetFeatureFlag = vi.fn().mockReturnValue(true);

vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: () => ({
    getActive: () => mockGetActive(),
    get: (id: string) => mockGet(id),
  }),
}));

vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    capturePane: vi.fn().mockResolvedValue("some output"),
  }),
}));

vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({
    blocked: false,
    content: "redacted",
    violations: 0,
  }),
}));

vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({
    log: mockAuditLog,
  }),
}));

vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: () => ({
    launch: vi.fn(),
    kill: mockKill,
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
    getTeam: vi.fn(),
  }),
}));

vi.mock("../../../src/bridge/security/bridge-policy.js", () => ({
  getBridgePolicyManager: () => ({
    getPolicy: () => ({
      allowedAgentTypes: ["claude-code"],
      maxSessionsPerAgent: 2,
      maxTotalSessions: 6,
      telegramRateLimit: { commandsPerMinute: 20, sendKeysPerMinute: 10 },
      perSessionSendKeysInterval: 3000,
      sendKeysMaxLength: 500,
      captureRedactPatterns: [],
      shellPanesDisabled: true,
      shellSessionsPerRepo: 1,
      maxShellSessions: 3,
      shellActorAllowlist: [],
      teamCostThresholdUsd: 5.0,
      teamStuckIdleThresholdSec: 180,
    }),
    checkCommandRateLimit: () => true,
    checkSendKeysRateLimit: () => true,
  }),
}));

vi.mock("../../../src/budget/pricing-registry.js", () => ({
  createPricingRegistry: () => ({
    calculateCost: (_model: string, inputTokens: number, outputTokens: number) => {
      return (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
    },
    getPricingOrDefault: vi.fn(),
    listModels: vi.fn(),
    isStale: vi.fn(),
  }),
}));

// Mock team-monitor — commands import these
const mockGetTeamStatus = vi.fn();
const mockGetTeamSessions = vi.fn().mockReturnValue([]);
const mockFormatTeamDashboard = vi.fn().mockReturnValue("📊 Dashboard content");

vi.mock("../../../src/bridge/teams/team-monitor.js", () => ({
  getTeamStatus: (...args: unknown[]) => mockGetTeamStatus(...args),
  getTeamSessions: (...args: unknown[]) => mockGetTeamSessions(...args),
  formatTeamDashboard: (...args: unknown[]) => mockFormatTeamDashboard(...args),
  ESTIMATED_TOKENS_PER_MINUTE: { input: 500, output: 200 },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  handleTeamStatusCommand,
  handleKillTeamCommand,
  handleTeamCostCallback,
  costThresholdOverrides,
} from "../../../src/commands/handlers.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "bridge_12345_abc",
    agentType: "claude-code",
    tmuxTarget: "endiorbot:claudecode.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/project",
    workspaceFingerprint: "abc123",
    status: "active",
    riskMode: "read",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("TeamMonitoring — /team-status (Sprint 91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    costThresholdOverrides.clear();
    mockGetFeatureFlag.mockReturnValue(true);
  });

  it("should return dashboard for team session", async () => {
    const session = makeSession({ teamId: "dev", agentRole: "coder" });
    mockGet.mockReturnValue(session);
    mockGetTeamStatus.mockResolvedValue({
      teamId: "dev",
      members: [{ sessionId: "bridge_12345_abc", agentRole: "coder", health: "alive", estimatedCostUsd: 0.42, idleSeconds: 5, isLeader: true }],
      totalCostUsd: 0.42,
      thresholdUsd: 5.0,
      thresholdExceeded: false,
    });

    const result = await handleTeamStatusCommand(["bridge_12345_abc"], "ceo@test");
    expect(result.success).toBe(true);
    expect(mockFormatTeamDashboard).toHaveBeenCalled();
    expect(result.replyMarkup).toBeUndefined();
  });

  it("should include cost keyboard when threshold exceeded", async () => {
    const session = makeSession({ teamId: "dev", agentRole: "coder" });
    mockGet.mockReturnValue(session);
    mockGetTeamStatus.mockResolvedValue({
      teamId: "dev",
      members: [{ sessionId: "s1", agentRole: "coder", health: "alive", estimatedCostUsd: 6.0, idleSeconds: 0, isLeader: true }],
      totalCostUsd: 6.0,
      thresholdUsd: 5.0,
      thresholdExceeded: true,
    });

    const result = await handleTeamStatusCommand(["bridge_12345_abc"], "ceo@test");
    expect(result.success).toBe(true);
    expect(result.replyMarkup).toBeDefined();
  });

  it("should reject non-team session", async () => {
    mockGet.mockReturnValue(makeSession()); // no teamId

    const result = await handleTeamStatusCommand(["bridge_12345_abc"], "ceo@test");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not part of a team");
  });

  it("should reject unknown session", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await handleTeamStatusCommand(["unknown_id"], "ceo@test");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Session not found");
  });

  it("should reject when AGENT_TEAMS flag is disabled", async () => {
    mockGetFeatureFlag.mockReturnValue(false);

    const result = await handleTeamStatusCommand(["bridge_12345_abc"], "ceo@test");
    expect(result.success).toBe(false);
    expect(result.response).toContain("AGENT_TEAMS");
  });

  it("should audit team_status_checked event", async () => {
    const session = makeSession({ teamId: "dev", agentRole: "coder" });
    mockGet.mockReturnValue(session);
    mockGetTeamStatus.mockResolvedValue({
      teamId: "dev",
      members: [],
      totalCostUsd: 0,
      thresholdUsd: 5.0,
      thresholdExceeded: false,
    });

    await handleTeamStatusCommand(["bridge_12345_abc"], "ceo@test");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "team_status_checked", actorId: "ceo@test" }),
    );
  });
});

describe("TeamMonitoring — /kill-team (Sprint 91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    costThresholdOverrides.clear();
    mockGetFeatureFlag.mockReturnValue(true);
  });

  it("should kill all team sessions", async () => {
    const session = makeSession({ id: "s1", teamId: "dev", agentRole: "coder" });
    mockGet.mockReturnValue(session);
    mockGetTeamSessions.mockReturnValue([
      makeSession({ id: "s1", teamId: "dev", agentRole: "coder" }),
      makeSession({ id: "s2", teamId: "dev", agentRole: "reviewer" }),
    ]);

    const result = await handleKillTeamCommand(["s1"], "ceo@test");
    expect(result.success).toBe(true);
    expect(result.response).toContain("killed");
    expect(result.response).toContain("2 members");
    expect(mockKill).toHaveBeenCalledTimes(2);
  });

  it("should be idempotent for already-stopped team", async () => {
    const session = makeSession({ id: "s1", teamId: "dev" });
    mockGet.mockReturnValue(session);
    mockGetTeamSessions.mockReturnValue([]);

    const result = await handleKillTeamCommand(["s1"], "ceo@test");
    expect(result.success).toBe(true);
    expect(result.response).toContain("already stopped");
  });

  it("should audit team_killed event", async () => {
    const session = makeSession({ id: "s1", teamId: "dev" });
    mockGet.mockReturnValue(session);
    mockGetTeamSessions.mockReturnValue([
      makeSession({ id: "s1", teamId: "dev", agentRole: "coder" }),
    ]);

    await handleKillTeamCommand(["s1"], "ceo@test");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "team_killed" }),
    );
  });

  it("should reject when AGENT_TEAMS flag is disabled", async () => {
    mockGetFeatureFlag.mockReturnValue(false);

    const result = await handleKillTeamCommand(["s1"], "ceo@test");
    expect(result.success).toBe(false);
    expect(result.response).toContain("AGENT_TEAMS");
  });
});

describe("TeamMonitoring — Cost Callback (Sprint 91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    costThresholdOverrides.clear();
    mockGetFeatureFlag.mockReturnValue(true);
  });

  it("should extend cost threshold by $2", async () => {
    const result = await handleTeamCostCallback("extend", "dev", "ceo@test");
    expect(result.success).toBe(true);
    expect(result.response).toContain("$7.00");
    expect(costThresholdOverrides.get("dev")).toBe(7.0);
  });

  it("should stack multiple extend calls", async () => {
    await handleTeamCostCallback("extend", "dev", "ceo@test");
    const result = await handleTeamCostCallback("extend", "dev", "ceo@test");
    expect(result.success).toBe(true);
    expect(result.response).toContain("$9.00");
    expect(costThresholdOverrides.get("dev")).toBe(9.0);
  });

  it("should audit team_cost_extended", async () => {
    await handleTeamCostCallback("extend", "dev", "ceo@test");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "team_cost_extended",
        details: expect.objectContaining({ newThreshold: 7.0 }),
      }),
    );
  });

  it("should delegate stop action to kill-team", async () => {
    mockGetTeamSessions.mockReturnValue([
      makeSession({ id: "s1", teamId: "dev" }),
    ]);
    mockGet.mockReturnValue(makeSession({ id: "s1", teamId: "dev" }));

    const result = await handleTeamCostCallback("stop", "dev", "ceo@test");
    expect(result.success).toBe(true);
    expect(mockKill).toHaveBeenCalled();
  });
});
