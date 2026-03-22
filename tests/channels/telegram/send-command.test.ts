/**
 * Tests for /send Command — Sprint 86 (ADR-024 §8.5)
 *
 * Covers: argument parsing, riskMode enforcement, 4096-char limit,
 * context prefix injection, sendKeys relay, audit logging.
 *
 * @module tests/channels/telegram/send-command
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks — declared before imports
// ============================================================================

// Mock bridge-audit
const mockAuditLog = vi.fn();
vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({ log: mockAuditLog }),
}));

// Mock agent-launcher (needed by telegram-commands module)
vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: () => ({ launch: vi.fn(), kill: vi.fn() }),
}));

// Mock session-registry
const mockGet = vi.fn().mockReturnValue(null);
vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: () => ({
    getActive: vi.fn().mockReturnValue([]),
    get: mockGet,
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Mock tmux-bridge
const mockSendKeys = vi.fn().mockResolvedValue(undefined);
const mockSendEnter = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    capturePane: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue("3.4"),
    createSession: vi.fn(),
    killWindow: vi.fn(),
    sendKeys: mockSendKeys,
    sendEnter: mockSendEnter,
  }),
}));

// Mock output-redactor
vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({ content: "", blocked: false, violations: [] }),
}));

// Mock team-registry
vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: () => ({
    getTeam: vi.fn().mockReturnValue({ found: false }),
    getTier: vi.fn().mockReturnValue("STANDARD"),
  }),
}));

// Mock keyboards
vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  getAgentIcon: (role: string) => `[${role}]`,
  createPermissionKeyboard: vi.fn(),
}));

// Mock turn-context
const mockBuildTurnContext = vi.fn().mockReturnValue("");
const mockLoadTurnContextFromActive = vi.fn().mockReturnValue({});
const mockIncrementTurnCount = vi.fn().mockReturnValue(1);
const mockGetTurnCount = vi.fn().mockReturnValue(0);
const mockShouldRefreshContext = vi.fn().mockReturnValue(false);
vi.mock("../../../src/bridge/intelligence/turn-context.js", () => ({
  buildTurnContext: (...args: unknown[]) => mockBuildTurnContext(...args),
  loadTurnContextFromActive: () => mockLoadTurnContextFromActive(),
  incrementTurnCount: (...args: unknown[]) => mockIncrementTurnCount(...args),
  getTurnCount: (...args: unknown[]) => mockGetTurnCount(...args),
  shouldRefreshContext: (...args: unknown[]) => mockShouldRefreshContext(...args),
}));

// Mock envelope-builder (Sprint 87)
const mockBuildFullEnvelope = vi.fn().mockReturnValue({ persona: { agentRole: "assistant", soulContent: "", soulContentHash: "" } });
const mockSerializeEnvelopeForInjection = vi.fn().mockReturnValue("");
vi.mock("../../../src/bridge/intelligence/envelope-builder.js", () => ({
  buildFullEnvelope: (...args: unknown[]) => mockBuildFullEnvelope(...args),
  serializeEnvelopeForInjection: (...args: unknown[]) => mockSerializeEnvelopeForInjection(...args),
}));

// Mock output-evaluator (Sprint 88)
vi.mock("../../../src/bridge/intelligence/output-evaluator.js", () => ({
  evaluateOutput: vi.fn().mockReturnValue(null),
}));

// Mock evaluation-store (Sprint 88)
vi.mock("../../../src/bridge/intelligence/evaluation-store.js", () => ({
  appendEvaluation: vi.fn(),
  generateEvaluationId: vi.fn().mockReturnValue("eval_test_001"),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { handleSendCommand } from "../../../src/commands/handlers.js";
import type { BridgeSession } from "../../../src/bridge/types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockSession(overrides: Partial<BridgeSession> = {}): BridgeSession {
  return {
    id: "bridge_1234567890_abc",
    agentType: "claude-code",
    tmuxTarget: "endiorbot:claude.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/Users/test/project",
    workspaceFingerprint: "abc123def456",
    status: "active",
    riskMode: "patch",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("handleSendCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildTurnContext.mockReturnValue("");
    mockLoadTurnContextFromActive.mockReturnValue({});
    mockIncrementTurnCount.mockReturnValue(1);
    mockShouldRefreshContext.mockReturnValue(false);
    mockSerializeEnvelopeForInjection.mockReturnValue("");
  });

  // --------------------------------------------------------------------------
  // Argument parsing
  // --------------------------------------------------------------------------

  it("rejects when no sessionId provided", async () => {
    const result = await handleSendCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("rejects when no message provided", async () => {
    const result = await handleSendCommand(["bridge_123"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Missing message");
  });

  // --------------------------------------------------------------------------
  // Session validation
  // --------------------------------------------------------------------------

  it("rejects when session not found", async () => {
    mockGet.mockReturnValue(null);
    const result = await handleSendCommand(["bridge_123", "hello"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found");
  });

  it("rejects when session is not active", async () => {
    mockGet.mockReturnValue(createMockSession({ status: "stopped" }));
    const result = await handleSendCommand(["bridge_123", "hello"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found or inactive");
  });

  // --------------------------------------------------------------------------
  // RiskMode enforcement
  // --------------------------------------------------------------------------

  it("rejects READ mode session", async () => {
    mockGet.mockReturnValue(createMockSession({ riskMode: "read" }));
    const result = await handleSendCommand(["bridge_123", "hello"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("READ mode");
  });

  it("allows PATCH mode session", async () => {
    mockGet.mockReturnValue(createMockSession({ riskMode: "patch" }));
    const result = await handleSendCommand(["bridge_123", "fix", "the", "bug"], "user1");
    expect(result.success).toBe(true);
  });

  it("allows INTERACTIVE mode session", async () => {
    mockGet.mockReturnValue(createMockSession({ riskMode: "interactive" }));
    const result = await handleSendCommand(["bridge_123", "run", "tests"], "user1");
    expect(result.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // sendKeys relay
  // --------------------------------------------------------------------------

  it("sends message via tmux sendKeys + sendEnter", async () => {
    mockGet.mockReturnValue(createMockSession());
    const result = await handleSendCommand(["bridge_123", "fix", "the", "bug"], "user1");

    expect(result.success).toBe(true);
    expect(mockSendKeys).toHaveBeenCalledWith("endiorbot:claude.0", "fix the bug");
    expect(mockSendEnter).toHaveBeenCalledWith("endiorbot:claude.0");
  });

  it("prepends turn context when available", async () => {
    mockGet.mockReturnValue(createMockSession());
    mockBuildTurnContext.mockReturnValue("[EndiorBot Context]\nSprint: 86\n[End Context]\n");

    const result = await handleSendCommand(["bridge_123", "hello"], "user1");

    expect(result.success).toBe(true);
    expect(mockSendKeys).toHaveBeenCalledWith(
      "endiorbot:claude.0",
      "[EndiorBot Context]\nSprint: 86\n[End Context]\nhello",
    );
    expect(result.response).toContain("with context");
  });

  // --------------------------------------------------------------------------
  // CTO A2: 4096-char limit
  // --------------------------------------------------------------------------

  it("rejects payload exceeding 4096 chars", async () => {
    mockGet.mockReturnValue(createMockSession());
    const longMessage = "x".repeat(4097);

    const result = await handleSendCommand(["bridge_123", longMessage], "user1");

    expect(result.success).toBe(false);
    expect(result.response).toContain("too long");
    expect(result.response).toContain("4096");
    expect(mockSendKeys).not.toHaveBeenCalled();
  });

  it("allows payload at exactly 4096 chars", async () => {
    mockGet.mockReturnValue(createMockSession());
    const message = "x".repeat(4096);

    const result = await handleSendCommand(["bridge_123", message], "user1");

    expect(result.success).toBe(true);
    expect(mockSendKeys).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Audit logging
  // --------------------------------------------------------------------------

  it("logs send_command audit event", async () => {
    mockGet.mockReturnValue(createMockSession());
    await handleSendCommand(["bridge_123", "fix", "bug"], "user1");

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "send_command",
        actorId: "user1",
        actor: "telegram",
        sessionId: "bridge_1234567890_abc",
        details: expect.objectContaining({
          messageLength: 7, // "fix bug"
          contextPrefixLength: 0,
          fullPayloadLength: 7,
          turnCount: 1,
        }),
      }),
    );
  });
});
