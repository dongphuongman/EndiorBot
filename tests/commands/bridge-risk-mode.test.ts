/**
 * Sprint 104: Bridge Risk Mode Tests
 *
 * Tests ADR-031 GAP-002/004/005 closure:
 * - GAP-002: --risk flag parsed (error on invalid mode; valid modes wire to launchOptions)
 * - GAP-004: /mode without session → error; /mode with no-session actorId → correct error
 * - GAP-005: /fix shows deprecation note (once per workspace)
 * - CTO C1: Bridge redirect uses <session-id> placeholder
 *
 * @module tests/commands/bridge-risk-mode
 * @sprint 104
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: vi.fn(),
}));

vi.mock("../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: vi.fn(),
}));

vi.mock("../../src/sdlc/scaffold/project-detector.js", () => ({
  detectProject: vi.fn(),
}));

vi.mock("../../src/sdlc/compliance/fix-engine.js", () => ({
  createComplianceFixEngine: vi.fn(),
}));

vi.mock("../../src/config/paths.js", () => ({
  loadActiveProject: vi.fn(),
}));

// ============================================================================
// GAP-002: --risk flag parsing in handleLaunchCommand
// ============================================================================

describe("handleLaunchCommand --risk flag (Sprint 104 GAP-002)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/launch --risk patch wires riskMode to launchOptions", async () => {
    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    const mockLauncher = {
      launch: vi.fn().mockResolvedValue({
        success: true,
        session: {
          id: "bridge_abc",
          riskMode: "patch",
          agentType: "claude",
          status: "active",
          projectPath: "/tmp/test",
          actorId: "ceo@endiorbot",
          createdAt: Date.now(),
          tmuxTarget: "endiorbot:0",
        },
      }),
    };
    vi.mocked(getAgentLauncher).mockReturnValue(mockLauncher as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    const result = await handleLaunchCommand(
      ["claude", "/tmp/test", "--risk", "patch"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ riskMode: "patch" }),
    );
  });

  it("/launch --risk read wires riskMode to launchOptions", async () => {
    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    const mockLauncher = {
      launch: vi.fn().mockResolvedValue({
        success: true,
        session: {
          id: "bridge_abc",
          riskMode: "read",
          agentType: "claude",
          status: "active",
          projectPath: "/tmp/test",
          actorId: "ceo@endiorbot",
          createdAt: Date.now(),
          tmuxTarget: "endiorbot:0",
        },
      }),
    };
    vi.mocked(getAgentLauncher).mockReturnValue(mockLauncher as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    const result = await handleLaunchCommand(
      ["claude", "/tmp/test", "--risk", "read"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ riskMode: "read" }),
    );
  });

  it("/launch --risk invalid returns error before calling launcher", async () => {
    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    const mockLauncher = { launch: vi.fn() };
    vi.mocked(getAgentLauncher).mockReturnValue(mockLauncher as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    const result = await handleLaunchCommand(
      ["claude", "/tmp/test", "--risk", "invalid"],
      "ceo@endiorbot",
    );

    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown risk mode");
    expect(result.response).toContain("Valid: read, patch");
    // Launcher must NOT be called — error returned before reaching it
    expect(mockLauncher.launch).not.toHaveBeenCalled();
  });

  it("/launch without --risk does NOT include riskMode in launchOptions", async () => {
    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    const mockLauncher = {
      launch: vi.fn().mockResolvedValue({
        success: true,
        session: {
          id: "bridge_abc",
          riskMode: "read",
          agentType: "claude",
          status: "active",
          projectPath: "/tmp/test",
          actorId: "ceo@endiorbot",
          createdAt: Date.now(),
          tmuxTarget: "endiorbot:0",
        },
      }),
    };
    vi.mocked(getAgentLauncher).mockReturnValue(mockLauncher as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    await handleLaunchCommand(
      ["claude", "/tmp/test"],
      "ceo@endiorbot",
    );

    // riskMode should NOT be set (AgentLauncher defaults to "read" itself)
    const calledWith = mockLauncher.launch.mock.calls[0]?.[0];
    expect(calledWith).not.toHaveProperty("riskMode");
  });
});

// ============================================================================
// GAP-004: /mode — happy path (mutation + transition response)
// ============================================================================

describe("handleModeCommand happy-path (Sprint 104 GAP-004 — CTO non-blocking)", () => {
  it("mutates session.riskMode and returns READ → PATCH transition response", async () => {
    // Use unique actorId to avoid state bleed from other tests
    const actorId = "ceo-mode-test-" + Math.random().toString(36).slice(2);
    const sessionId = "bridge_mode_happy_" + Math.random().toString(36).slice(2);

    // Create a mutable session object so we can verify mutation
    const fakeSession = {
      id: sessionId,
      riskMode: "read" as "read" | "patch",
      status: "active",
      agentType: "claude",
      tmuxTarget: "endiorbot:0",
      projectPath: "/tmp/test",
      actorId,
      createdAt: Date.now(),
    };

    // Step 1: Populate activeSessionMap via handleLaunchCommand (only way to set it)
    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    vi.mocked(getAgentLauncher).mockReturnValue({
      launch: vi.fn().mockResolvedValue({ success: true, session: fakeSession }),
    } as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    const launchResult = await handleLaunchCommand(
      ["claude", "/tmp/test"],
      actorId,
    );
    expect(launchResult.success).toBe(true); // confirms activeSessionMap.set(actorId, sessionId)

    // Step 2: Mock registry to return our mutable fakeSession
    const { getSessionRegistry } = await import("../../src/bridge/session-registry.js");
    vi.mocked(getSessionRegistry).mockReturnValue({
      get: vi.fn((id: string) => (id === sessionId ? fakeSession : null)),
      list: vi.fn().mockReturnValue([fakeSession]),
    } as never);

    // Step 3: Call handleModeCommand — should mutate session.riskMode
    const { handleModeCommand } = await import("../../src/commands/handlers.js");
    const result = handleModeCommand(["patch"], actorId);

    // Verify mutation (CPO C4)
    expect(fakeSession.riskMode).toBe("patch");

    // Verify transition response (CPO C5)
    expect(result.success).toBe(true);
    expect(result.response).toContain("READ → PATCH");
    expect(result.response).toContain(sessionId);
    expect(result.response).toContain("Affects this session only");
  });

  it("returns READ mode display when no mode arg given", async () => {
    const actorId = "ceo-mode-display-" + Math.random().toString(36).slice(2);
    const sessionId = "bridge_mode_display_" + Math.random().toString(36).slice(2);

    const fakeSession = {
      id: sessionId,
      riskMode: "read" as "read" | "patch",
      status: "active",
      agentType: "claude",
      tmuxTarget: "endiorbot:0",
      projectPath: "/tmp/test",
      actorId,
      createdAt: Date.now(),
    };

    const { getAgentLauncher } = await import("../../src/bridge/agent-launcher.js");
    vi.mocked(getAgentLauncher).mockReturnValue({
      launch: vi.fn().mockResolvedValue({ success: true, session: fakeSession }),
    } as never);

    const { handleLaunchCommand } = await import("../../src/commands/handlers.js");
    await handleLaunchCommand(["claude", "/tmp/test"], actorId);

    const { getSessionRegistry } = await import("../../src/bridge/session-registry.js");
    vi.mocked(getSessionRegistry).mockReturnValue({
      get: vi.fn((id: string) => (id === sessionId ? fakeSession : null)),
      list: vi.fn().mockReturnValue([]),
    } as never);

    const { handleModeCommand } = await import("../../src/commands/handlers.js");
    const result = handleModeCommand([], actorId);

    expect(result.success).toBe(true);
    expect(result.response).toContain("READ");
    expect(result.response).toContain(sessionId);
  });
});

// ============================================================================
// GAP-004: /mode without session → error
// ============================================================================

describe("handleModeCommand (Sprint 104 GAP-004 — error cases)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when actorId has no active session", async () => {
    const { getSessionRegistry } = await import("../../src/bridge/session-registry.js");
    vi.mocked(getSessionRegistry).mockReturnValue({
      get: vi.fn().mockReturnValue(null),
      list: vi.fn().mockReturnValue([]),
    } as never);

    const { handleModeCommand } = await import("../../src/commands/handlers.js");
    // "ghost-actor" has no entry in activeSessionMap → sessionId = undefined
    const result = handleModeCommand([], "ghost-actor");

    expect(result.success).toBe(false);
    expect(result.response).toContain("No active session");
    expect(result.response).toContain("/launch");
  });

  it("returns error for any unknown actor (no session in map)", async () => {
    const { handleModeCommand } = await import("../../src/commands/handlers.js");
    const result = handleModeCommand(["patch"], "no-such-actor");

    expect(result.success).toBe(false);
    expect(result.response).toContain("No active session");
  });
});

// ============================================================================
// GAP-005 / CPO C6: /fix deprecation note (once per workspace)
// ============================================================================

describe("executeFixCommand deprecation note (Sprint 104 GAP-005)", () => {
  // Use unique workspace per test suite to avoid fixDeprecationShown state
  const workspace = "/tmp/deprecation-test-s104-" + Math.random().toString(36).slice(2);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows deprecation tip on first /fix call for a workspace", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    vi.mocked(createComplianceFixEngine).mockReturnValue({
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 50,
        scoreAfter: 50,
        totalIssues: 2,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 100,
        dryRun: true,
      }),
    } as never);

    const { executeFixCommand } = await import("../../src/commands/handlers.js");
    const result = await executeFixCommand([], workspace);

    expect(result.success).toBe(true);
    expect(result.response).toContain("/compliance fix");
    expect(result.response).toMatch(/future release/);
  });
});

// ============================================================================
// CTO C1: Bridge redirect uses <session-id> placeholder
// ============================================================================

describe("Bridge redirect instructions (Sprint 104 CTO C1)", () => {
  it("/fix --yes uses <session-id> placeholder (not literal 'compliance')", async () => {
    const { executeFixCommand } = await import("../../src/commands/handlers.js");
    const result = await executeFixCommand(["--yes"], "/tmp/some-workspace-c1");

    expect(result.success).toBe(true);
    expect(result.response).toContain("<session-id>");
    expect(result.response).toContain("/sessions");
    // Must NOT have literal "compliance" as first arg after /send
    expect(result.response).not.toMatch(/\/send compliance fix/);
  });

  it("/fix --yes --stage includes stage in redirect with <session-id>", async () => {
    const { executeFixCommand } = await import("../../src/commands/handlers.js");
    const result = await executeFixCommand(["--yes", "--stage", "01-planning"], "/tmp/workspace-c1b");

    expect(result.success).toBe(true);
    expect(result.response).toContain("<session-id>");
    expect(result.response).toContain("01-planning");
  });
});

// ============================================================================
// /send error message improvement (CPO C5)
// ============================================================================

describe("/send READ mode error (Sprint 104 CPO C5)", () => {
  it("/send blocked on READ session shows session ID and fix options", async () => {
    const { getSessionRegistry } = await import("../../src/bridge/session-registry.js");
    vi.mocked(getSessionRegistry).mockReturnValue({
      get: vi.fn().mockReturnValue({
        id: "bridge_read_123",
        riskMode: "read",
        status: "active",
        agentType: "claude",
        tmuxTarget: "endiorbot:0",
        projectPath: "/tmp/test",
        actorId: "ceo@endiorbot",
        createdAt: Date.now(),
      }),
    } as never);

    const { handleSendCommand } = await import("../../src/commands/handlers.js");
    const result = await handleSendCommand(["bridge_read_123", "fix the bug"], "ceo@endiorbot");

    expect(result.success).toBe(false);
    expect(result.response).toContain("bridge_read_123");
    expect(result.response).toContain("/mode patch");
    expect(result.response).toContain("--risk patch");
  });
});

// ============================================================================
// /mode registration in command dispatcher
// ============================================================================

describe("/mode registration (Sprint 104)", () => {
  it("/mode is registered in command dispatcher", async () => {
    const { createCommandDispatcher } = await import("../../src/commands/index.js");
    const dispatcher = createCommandDispatcher();
    expect(dispatcher.has("mode")).toBe(true);
  });
});
