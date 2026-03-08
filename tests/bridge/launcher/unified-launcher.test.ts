/**
 * UnifiedLauncher Tests — Sprint 92 (ADR-024)
 *
 * Covers: start/stop lifecycle, lock acquisition, session recovery,
 * zombie pane detection (CTO F2), audit events.
 *
 * @module tests/bridge/launcher/unified-launcher
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { UnifiedLauncher } from "../../../src/bridge/launcher/unified-launcher.js";
import type { UnifiedLauncherDeps } from "../../../src/bridge/launcher/unified-launcher.js";

// ============================================================================
// Helpers
// ============================================================================

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "bridge_12345_abc",
    agentType: "claude-code" as const,
    tmuxTarget: "endiorbot:claudecode.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/project",
    workspaceFingerprint: "abc123",
    status: "active" as const,
    riskMode: "read" as const,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    providerPid: 12345,
    tmuxPaneId: "%0",
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<UnifiedLauncherDeps> = {}): UnifiedLauncherDeps {
  return {
    lockManager: {
      acquire: vi.fn().mockReturnValue({ acquired: true }),
      release: vi.fn(),
      isRunning: vi.fn().mockReturnValue({ running: false }),
    } as never,
    registry: {
      getAll: vi.fn().mockReturnValue([]),
      getActive: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      markStopped: vi.fn(),
      markError: vi.fn(),
    } as never,
    tmux: {
      isAvailable: vi.fn().mockResolvedValue("tmux 3.3a"),
      createSession: vi.fn(),
      sendKeys: vi.fn(),
      sendEnter: vi.fn(),
      capturePane: vi.fn().mockResolvedValue("some output"),
      killWindow: vi.fn(),
      listWindows: vi.fn(),
      sessionExists: vi.fn().mockResolvedValue(true),
      getPanePid: vi.fn().mockResolvedValue(12345),
      getPaneId: vi.fn().mockResolvedValue("%0"),
    } as never,
    agentLauncher: {
      launch: vi.fn().mockResolvedValue({ success: true, session: makeSession() }),
      kill: vi.fn().mockResolvedValue({ success: true }),
    } as never,
    audit: { log: vi.fn() },
    onNotify: vi.fn().mockResolvedValue(undefined),
    // Disable actual polling in tests
    pollIntervalMs: 999999,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("UnifiedLauncher — Start/Stop (Sprint 92)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should acquire lock and audit launcher_started on start", async () => {
    const deps = makeMockDeps();
    const launcher = new UnifiedLauncher(deps);

    const result = await launcher.start();
    expect(result.success).toBe(true);
    expect(deps.lockManager!.acquire).toHaveBeenCalled();
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "launcher_started" }),
    );

    await launcher.stop();
  });

  it("should fail start when lock cannot be acquired", async () => {
    const deps = makeMockDeps({
      lockManager: {
        acquire: vi.fn().mockReturnValue({
          acquired: false,
          error: "Launcher already running (PID 12345)",
        }),
        release: vi.fn(),
        isRunning: vi.fn(),
      } as never,
    });
    const launcher = new UnifiedLauncher(deps);

    const result = await launcher.start();
    expect(result.success).toBe(false);
    expect(result.error).toContain("already running");
  });

  it("should audit launcher_stopped and release lock on stop (CTO F1)", async () => {
    const deps = makeMockDeps();
    const launcher = new UnifiedLauncher(deps);

    await launcher.start();
    await launcher.stop();

    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "launcher_stopped" }),
    );
    expect(deps.lockManager!.release).toHaveBeenCalled();
  });
});

describe("UnifiedLauncher — Recovery (Sprint 92)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recover session when pane and PID alive", async () => {
    const session = makeSession({ id: "s1", providerPid: 12345 });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    const isAlive = vi.fn().mockReturnValue(true);

    const launcher = new UnifiedLauncher({ ...deps, isProcessAlive: isAlive });
    const result = await launcher.start();

    expect(result.recoveredSessions).toBe(1);
    expect(result.lostSessions).toBe(0);
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session_recovered", sessionId: "s1" }),
    );

    await launcher.stop();
  });

  it("should mark session lost when pane is gone", async () => {
    const session = makeSession({ id: "s1", providerPid: 12345 });
    const deps = makeMockDeps({
      tmux: {
        sessionExists: vi.fn().mockResolvedValue(false),
        capturePane: vi.fn().mockRejectedValue(new Error("pane not found")),
        killWindow: vi.fn(),
        getPanePid: vi.fn().mockResolvedValue(null),
        getPaneId: vi.fn().mockResolvedValue(null),
      } as never,
    });
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);

    const launcher = new UnifiedLauncher(deps);
    const result = await launcher.start();

    expect(result.recoveredSessions).toBe(0);
    expect(result.lostSessions).toBe(1);
    expect(deps.registry.markError).toHaveBeenCalledWith("s1", expect.stringContaining("lost"));
    expect(deps.onNotify).toHaveBeenCalled();

    await launcher.stop();
  });

  it("should kill zombie pane when PID dead but pane exists (CTO F2)", async () => {
    const session = makeSession({ id: "s1", providerPid: 99999 });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    const isAlive = vi.fn().mockReturnValue(false); // PID dead

    const launcher = new UnifiedLauncher({ ...deps, isProcessAlive: isAlive });
    const result = await launcher.start();

    // Zombie: pane exists (mock sessionExists true) but PID dead
    expect(result.lostSessions).toBe(1);
    expect(deps.tmux.killWindow).toHaveBeenCalledWith(session.tmuxTarget);
    expect(deps.registry.markError).toHaveBeenCalledWith(
      "s1",
      expect.stringContaining("Zombie pane"),
    );

    await launcher.stop();
  });

  it("should handle multiple sessions: 2 alive + 1 lost", async () => {
    const sessions = [
      makeSession({ id: "s1", providerPid: 111 }),
      makeSession({ id: "s2", providerPid: 222 }),
      makeSession({ id: "s3", providerPid: 333 }),
    ];
    const deps = makeMockDeps({
      tmux: {
        sessionExists: vi.fn().mockResolvedValue(true),
        capturePane: vi.fn()
          .mockResolvedValueOnce("output1")
          .mockResolvedValueOnce("output2")
          .mockRejectedValueOnce(new Error("pane gone")),
        killWindow: vi.fn(),
        getPanePid: vi.fn().mockResolvedValue(12345),
        getPaneId: vi.fn().mockResolvedValue("%0"),
      } as never,
    });
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue(sessions);

    // s1,s2 alive; s3 pane gone (capturePane throws)
    const isAlive = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      // s3 doesn't reach isProcessAlive since capturePane throws → paneExists = false

    const launcher = new UnifiedLauncher({ ...deps, isProcessAlive: isAlive });
    const result = await launcher.start();

    expect(result.recoveredSessions).toBe(2);
    expect(result.lostSessions).toBe(1);

    await launcher.stop();
  });
});

describe("UnifiedLauncher — Status (Sprint 92)", () => {
  it("should report running status after start", async () => {
    const deps = makeMockDeps();
    const launcher = new UnifiedLauncher(deps);

    await launcher.start();
    const status = launcher.status();

    expect(status.running).toBe(true);
    expect(status.uptime).toBeDefined();
    expect(status.activeSessions).toBe(0);

    await launcher.stop();
  });
});
