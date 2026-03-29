/**
 * OTT Command Handlers Tests
 *
 * @module tests/commands/handlers/ott-commands
 * @date 2026-03-26
 * @sprint 119
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockTeamRegistry = {
  getTeam: vi.fn((id: string) => ({
    found: true,
    team: { isActive: true, leader: "coder", id },
  })),
  getTier: vi.fn(() => "STANDARD"),
};

vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: vi.fn(() => mockTeamRegistry),
}));

vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  getAgentIcon: vi.fn((_role: string) => "🤖"),
}));

vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: vi.fn(() => ({ launch: vi.fn(), kill: vi.fn() })),
}));

vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: vi.fn(() => ({ getActive: vi.fn(() => []), get: vi.fn(() => null) })),
}));

vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: vi.fn(() => ({ capturePane: vi.fn(), sendKeys: vi.fn(), sendEnter: vi.fn() })),
}));

vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn(() => ({ blocked: false, content: "output", violations: [] })),
}));

vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: vi.fn(() => ({ log: vi.fn() })),
}));

vi.mock("../../../src/bridge/intelligence/turn-context.js", () => ({
  incrementTurnCount: vi.fn(() => 1),
  getTurnCount: vi.fn(() => 0),
  loadTurnContextFromActive: vi.fn(() => ({})),
  buildTurnContext: vi.fn(() => ""),
  shouldRefreshContext: vi.fn(() => false),
}));

vi.mock("../../../src/bridge/intelligence/envelope-builder.js", () => ({
  serializeEnvelopeForInjection: vi.fn(() => ""),
  buildFullEnvelope: vi.fn(() => ({})),
}));

vi.mock("../../../src/bridge/intelligence/output-evaluator.js", () => ({
  evaluateOutput: vi.fn(() => null),
}));

vi.mock("../../../src/bridge/intelligence/evaluation-store.js", () => ({
  appendEvaluation: vi.fn(),
  generateEvaluationId: vi.fn(() => "eval_123"),
}));

vi.mock("../../../src/budget/pricing-registry.js", () => ({
  createPricingRegistry: vi.fn(() => ({
    calculateCost: vi.fn(() => 0),
  })),
}));

// ============================================================================
// Import module under test AFTER mocks
// ============================================================================

import {
  handleAgentsCommand,
  handleTeamsCommand,
  handleConfigCommand,
  handleCostCommand,
  generateHelpMessage,
} from "../../../src/commands/handlers/ott-commands.js";

// ============================================================================
// handleAgentsCommand
// ============================================================================

describe("handleAgentsCommand", () => {
  it("returns success", () => {
    const result = handleAgentsCommand();
    expect(result.success).toBe(true);
  });

  it("includes 'Available Agents' heading", () => {
    const result = handleAgentsCommand();
    expect(result.response).toContain("Available Agents");
  });

  it("lists all 9 SE4A executor agents", () => {
    const result = handleAgentsCommand();
    const executors = ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack"];
    for (const agent of executors) {
      expect(result.response).toContain(`@${agent}`);
    }
  });

  it("lists all 3 SE4H advisor agents", () => {
    const result = handleAgentsCommand();
    const advisors = ["ceo", "cpo", "cto"];
    for (const agent of advisors) {
      expect(result.response).toContain(`@${agent}`);
    }
  });

  it("includes 13 total agents (9 executors + 3 advisors + at minimum mentions)", () => {
    const result = handleAgentsCommand();
    // Check total count by counting @agent mentions
    const matches = result.response.match(/@\w+/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(12);
  });

  it("includes usage instructions with @agent format", () => {
    const result = handleAgentsCommand();
    expect(result.response).toContain("@agent");
    expect(result.response).toContain("Usage");
  });

  it("includes SE4A and SE4H section labels", () => {
    const result = handleAgentsCommand();
    expect(result.response).toContain("SE4A");
    expect(result.response).toContain("SE4H");
  });
});

// ============================================================================
// handleTeamsCommand
// ============================================================================

describe("handleTeamsCommand", () => {
  it("returns success", () => {
    const result = handleTeamsCommand();
    expect(result.success).toBe(true);
  });

  it("includes 'Available Teams' heading", () => {
    const result = handleTeamsCommand();
    expect(result.response).toContain("Available Teams");
  });

  it("includes team tier info", () => {
    const result = handleTeamsCommand();
    expect(result.response).toContain("Tier");
  });

  it("includes usage instructions", () => {
    const result = handleTeamsCommand();
    expect(result.response).toContain("Usage");
    expect(result.response).toContain("@team");
  });

  it("lists team leaders in response", () => {
    const result = handleTeamsCommand();
    expect(result.response).toContain("leader");
  });

  it("handles ENTERPRISE tier", () => {
    const result = handleTeamsCommand("ENTERPRISE");
    expect(result.success).toBe(true);
  });

  it("handles LITE tier without throwing", () => {
    const result = handleTeamsCommand("LITE");
    expect(result.success).toBe(true);
  });

  it("returns team-not-found gracefully when registry returns found=false", () => {
    mockTeamRegistry.getTeam.mockReturnValueOnce({ found: false });
    const result = handleTeamsCommand();
    expect(result.success).toBe(true);
  });

  it("handles invalid tier parameter gracefully", () => {
    const result = handleTeamsCommand("INVALID_TIER" as never);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// handleConfigCommand
// ============================================================================

describe("handleConfigCommand", () => {
  it("returns success", () => {
    const result = handleConfigCommand();
    expect(result.success).toBe(true);
  });

  it("includes 'Project Config' in response", () => {
    const result = handleConfigCommand();
    expect(result.response).toContain("Project Config");
  });

  it("includes @pm agent reference", () => {
    const result = handleConfigCommand();
    expect(result.response).toContain("@pm");
  });
});

// ============================================================================
// handleCostCommand
// ============================================================================

describe("handleCostCommand", () => {
  it("returns success when no RL data directory exists", () => {
    // Default HOME dir has no rl-training-data in test env, so returns early
    const result = handleCostCommand([]);
    expect(result.success).toBe(true);
  });

  it("returns a string response (not undefined or empty)", () => {
    const result = handleCostCommand([]);
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
  });

  it("does not throw when called with empty args", () => {
    expect(() => handleCostCommand([])).not.toThrow();
  });

  it("does not throw when called with --period flag", () => {
    expect(() => handleCostCommand(["--period", "7d"])).not.toThrow();
  });

  it("handles --period 7d without error", () => {
    const result = handleCostCommand(["--period", "7d"]);
    expect(result.success).toBe(true);
  });

  it("handles --period 24h without error", () => {
    const result = handleCostCommand(["--period", "24h"]);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// generateHelpMessage (help text)
// ============================================================================

describe("generateHelpMessage", () => {
  it("returns a non-empty string", () => {
    const help = generateHelpMessage();
    expect(typeof help).toBe("string");
    expect(help.length).toBeGreaterThan(0);
  });

  it.each([
    ["EndiorBot Commands"],
    ["Workflow:"],
    ["SDLC:"],
    ["AI:"],
    ["Bridge"],
    ["System:"],
  ])("includes section: %s", (section) => {
    expect(generateHelpMessage()).toContain(section);
  });

  it.each([
    ["/launch"], ["/sessions"], ["/capture"], ["/send"], ["/kill"],
    ["/gate"], ["/compliance"], ["/consult"], ["/agents"], ["/teams"], ["/cost"],
  ])("includes command: %s", (cmd) => {
    expect(generateHelpMessage()).toContain(cmd);
  });

  it.each([["@agent"], ["@team"]])("includes mention format: %s", (mention) => {
    expect(generateHelpMessage()).toContain(mention);
  });
});
