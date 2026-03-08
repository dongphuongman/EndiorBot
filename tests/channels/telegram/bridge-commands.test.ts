/**
 * Bridge Command Handler Tests (Sprint 82.5)
 *
 * Tests for /link, /launch, /sessions, /switch, /capture, /kill
 * wired into telegram-commands.ts per ADR-024.
 *
 * @module tests/channels/telegram/bridge-commands
 * @authority ADR-024 Notification Bridge
 * @sprint 82.5
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks — declared before imports
// ============================================================================

// Mock bridge-audit (prevent disk writes)
const mockAuditLog = vi.fn();
vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({ log: mockAuditLog }),
}));

// Mock agent-launcher
const mockLaunch = vi.fn();
const mockKill = vi.fn();
vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: () => ({ launch: mockLaunch, kill: mockKill }),
}));

// Mock session-registry
const mockGetActive = vi.fn().mockReturnValue([]);
const mockGet = vi.fn().mockReturnValue(null);
vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: () => ({
    getActive: mockGetActive,
    get: mockGet,
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Mock tmux-bridge
const mockCapturePane = vi.fn().mockResolvedValue("$ hello\nhello\n$");
vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    capturePane: mockCapturePane,
    isAvailable: vi.fn().mockResolvedValue("3.4"),
    createSession: vi.fn(),
    killWindow: vi.fn(),
    sendKeys: vi.fn(),
  }),
}));

// Mock output-redactor
vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({
    content: "$ hello\nhello\n$",
    blocked: false,
    violations: [],
  }),
}));

// Mock team-registry (used by handleTeamsCommand)
vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: () => ({
    getTeam: vi.fn().mockReturnValue({ found: false }),
    getTier: vi.fn().mockReturnValue("STANDARD"),
  }),
}));

// Mock keyboards
vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  getAgentIcon: (role: string) => `[${role}]`,
}));

// ============================================================================
// Imports (resolved after mocks)
// ============================================================================

import {
  handleLinkCommand,
  getLinkedActorId,
  handleLaunchCommand,
  handleSessionsCommand,
  handleSwitchCommand,
  handleCaptureCommand,
  handleKillCommand,
  generateHelpMessage,
  sanitizeForEcho,
} from "../../../src/channels/telegram/telegram-commands.js";
import { redactBridgeOutput } from "../../../src/bridge/security/output-redactor.js";
import type { BridgeSession } from "../../../src/bridge/types.js";

const mockRedact = redactBridgeOutput as ReturnType<typeof vi.fn>;

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
    riskMode: "read",
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Phase 1: Identity Binding (/link)
// ============================================================================

describe("Bridge Commands — /link (Identity Binding)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BC-01: /link binds identity and returns success", () => {
    const result = handleLinkCommand("user_123", "ceo_user");
    expect(result.success).toBe(true);
    expect(result.response).toContain("ceo@endiorbot");
  });

  it("BC-02: /link without username defaults gracefully", () => {
    const result = handleLinkCommand("user_456");
    expect(result.success).toBe(true);
    expect(result.response).toContain("ceo@endiorbot");
  });

  it("BC-03: getLinkedActorId returns actorId for linked user", () => {
    handleLinkCommand("user_789", "test");
    const actorId = getLinkedActorId("user_789");
    expect(actorId).toBe("ceo@endiorbot");
  });

  it("BC-04: getLinkedActorId returns null for unlinked user", () => {
    const actorId = getLinkedActorId("nonexistent_user");
    expect(actorId).toBeNull();
  });

  it("BC-05: /link response lists available commands", () => {
    const result = handleLinkCommand("user_link_test", "ceo");
    expect(result.response).toContain("/launch");
    expect(result.response).toContain("/sessions");
    expect(result.response).toContain("/kill");
  });

  it("BC-06: /link logs audit event", () => {
    handleLinkCommand("audit_user", "audit_test");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "identity_link",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      }),
    );
  });
});

// ============================================================================
// Phase 2: Agent Launch (/launch)
// ============================================================================

describe("Bridge Commands — /launch (Agent Launch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BC-07: /launch without args shows usage", async () => {
    const result = await handleLaunchCommand([], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
    expect(result.response).toContain("claude");
  });

  it("BC-08: /launch unknown agent rejected", async () => {
    const result = await handleLaunchCommand(["unknown_agent"], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown agent");
  });

  it("BC-09: /launch with path traversal blocked (MF-2)", async () => {
    const result = await handleLaunchCommand(["claude", "/etc/passwd"], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Path must be under");
  });

  it("BC-10: /launch resolves short name claude → claude-code", async () => {
    mockLaunch.mockResolvedValue({
      success: true,
      session: createMockSession(),
    });
    await handleLaunchCommand(["claude", process.cwd()], "ceo@endiorbot");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "claude-code" }),
    );
  });

  it("BC-11: /launch resolves short name codex → codex-cli", async () => {
    mockLaunch.mockResolvedValue({
      success: true,
      session: createMockSession({ agentType: "codex-cli" }),
    });
    await handleLaunchCommand(["codex", process.cwd()], "ceo@endiorbot");
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "codex-cli" }),
    );
  });

  it("BC-12: /launch success returns session details", async () => {
    const session = createMockSession();
    mockLaunch.mockResolvedValue({ success: true, session });
    const result = await handleLaunchCommand(["claude", process.cwd()], "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(result.response).toContain(session.id);
    expect(result.response).toContain("claude-code");
  });

  it("BC-13: /launch with tmux failure returns error", async () => {
    mockLaunch.mockResolvedValue({
      success: false,
      error: "tmux not found. Install: brew install tmux",
    });
    const result = await handleLaunchCommand(["claude", process.cwd()], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("tmux not found");
  });
});

// ============================================================================
// Phase 3: Session Management (/sessions, /switch)
// ============================================================================

describe("Bridge Commands — /sessions (Session List)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BC-14: /sessions with no active sessions", () => {
    mockGetActive.mockReturnValue([]);
    const result = handleSessionsCommand();
    expect(result.success).toBe(true);
    expect(result.response).toContain("No active sessions");
  });

  it("BC-15: /sessions lists active sessions", () => {
    mockGetActive.mockReturnValue([
      createMockSession(),
      createMockSession({ id: "bridge_2_def", agentType: "codex-cli" }),
    ]);
    const result = handleSessionsCommand();
    expect(result.success).toBe(true);
    expect(result.response).toContain("claude-code");
    expect(result.response).toContain("codex-cli");
  });
});

describe("Bridge Commands — /switch (Session Switch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BC-16: /switch without args shows current or no session", () => {
    const result = handleSwitchCommand([], "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(
      result.response.includes("No active session") || result.response.includes("Usage"),
    ).toBe(true);
  });

  it("BC-17: /switch with nonexistent session returns error", () => {
    mockGet.mockReturnValue(null);
    const result = handleSwitchCommand(["nonexistent_session"], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Session not found");
  });

  it("BC-18: /switch with valid session succeeds", () => {
    const session = createMockSession();
    mockGet.mockReturnValue(session);
    const result = handleSwitchCommand([session.id], "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Switched to session");
    expect(result.response).toContain(session.id);
  });
});

// ============================================================================
// Phase 4: Capture Output (/capture)
// ============================================================================

describe("Bridge Commands — /capture (Output Capture)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up linked identity + active session
    handleLinkCommand("capture_user", "ceo");
  });

  it("BC-19: /capture without active session returns error", async () => {
    const result = await handleCaptureCommand([], "no_session_actor", "capture_user");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No active session");
  });

  it("BC-20: /capture with active session returns redacted output", async () => {
    // First launch to set active session
    const session = createMockSession();
    mockLaunch.mockResolvedValue({ success: true, session });
    await handleLaunchCommand(["claude", process.cwd()], "capture_actor");

    mockGet.mockReturnValue(session);
    mockCapturePane.mockResolvedValue("$ git status\nnothing to commit\n$");
    mockRedact.mockReturnValue({
      content: "$ git status\nnothing to commit\n$",
      blocked: false,
      violations: [],
    });

    const result = await handleCaptureCommand(["20"], "capture_actor", "capture_user");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Capture");
  });

  it("BC-21: /capture with blocked content returns error", async () => {
    const session = createMockSession();
    mockLaunch.mockResolvedValue({ success: true, session });
    await handleLaunchCommand(["claude", process.cwd()], "capture_block_actor");

    mockGet.mockReturnValue(session);
    mockCapturePane.mockResolvedValue("-----BEGIN RSA PRIVATE KEY-----");
    mockRedact.mockReturnValue({
      content: "",
      blocked: true,
      reason: "Sensitive output detected",
      violations: ["private_key"],
    });

    const result = await handleCaptureCommand([], "capture_block_actor", "capture_user");
    expect(result.success).toBe(false);
    expect(result.response).toContain("blocked");
  });
});

// ============================================================================
// Phase 5: Kill Session (/kill)
// ============================================================================

describe("Bridge Commands — /kill (Session Kill)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BC-22: /kill without args shows usage", async () => {
    const result = await handleKillCommand([], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("BC-23: /kill with unknown session returns error", async () => {
    mockKill.mockResolvedValue({
      success: false,
      error: "Session not found: unknown_123",
    });
    const result = await handleKillCommand(["unknown_123"], "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Session not found");
  });

  it("BC-24: /kill with valid session succeeds", async () => {
    mockKill.mockResolvedValue({ success: true });
    const result = await handleKillCommand(["bridge_valid_123"], "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(result.response).toContain("killed");
  });
});

// ============================================================================
// Phase 6: Help & Utilities
// ============================================================================

describe("Bridge Commands — Help & Utilities", () => {
  it("BC-25: generateHelpMessage includes Bridge (ADR-024) section", () => {
    const help = generateHelpMessage();
    expect(help).toContain("Bridge (ADR-024)");
    expect(help).toContain("/link");
    expect(help).toContain("/launch");
    expect(help).toContain("/sessions");
    expect(help).toContain("/switch");
    expect(help).toContain("/capture");
    expect(help).toContain("/kill");
  });

  it("BC-26: sanitizeForEcho strips Markdown special chars", () => {
    const sanitized = sanitizeForEcho("`*_[]()~>#+");
    expect(sanitized.length).toBe(0);
  });

  it("BC-27: sanitizeForEcho limits length to 50", () => {
    const long = "a".repeat(100);
    const sanitized = sanitizeForEcho(long);
    expect(sanitized.length).toBe(50);
  });
});
