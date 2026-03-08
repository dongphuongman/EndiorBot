/**
 * ProcessMonitor Tests — Sprint 92 (ADR-024)
 *
 * Covers: PID liveness, crash detection, auto-restart,
 * team context preservation, crash-loop cap (CTO MF-1).
 *
 * @module tests/bridge/launcher/process-monitor
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ProcessMonitor,
  MAX_RESTARTS,
  RESTART_WINDOW_MS,
  type ProcessMonitorDeps,
} from "../../../src/bridge/launcher/process-monitor.js";

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
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<ProcessMonitorDeps> = {}): ProcessMonitorDeps {
  return {
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
    launcher: {
      launch: vi.fn().mockResolvedValue({
        success: true,
        session: makeSession({ id: "bridge_new_session" }),
      }),
      kill: vi.fn(),
    } as never,
    audit: { log: vi.fn() },
    isProcessAlive: vi.fn().mockReturnValue(true),
    onNotify: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("ProcessMonitor — Liveness (Sprint 92)", () => {
  it("should count alive sessions when PID is alive", async () => {
    const session = makeSession({ providerPid: 12345 });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    (deps.isProcessAlive as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const monitor = new ProcessMonitor(deps);
    const result = await monitor.poll();

    expect(result.checked).toBe(1);
    expect(result.alive).toBe(1);
    expect(result.crashed).toBe(0);
  });

  it("should detect solo crash when PID is dead", async () => {
    const session = makeSession({ id: "s1", providerPid: 99999, agentRole: "coder" });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    (deps.isProcessAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const monitor = new ProcessMonitor(deps);
    const result = await monitor.poll();

    expect(result.crashed).toBe(1);
    expect(result.restarted).toBe(1);
    expect(deps.registry.markError).toHaveBeenCalledWith("s1", expect.stringContaining("crashed"));
  });

  it("should auto-restart with same agentRole", async () => {
    const session = makeSession({ id: "s1", providerPid: 99999, agentRole: "reviewer" });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    (deps.isProcessAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const monitor = new ProcessMonitor(deps);
    await monitor.poll();

    expect(deps.launcher.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: "claude-code",
        agentRole: "reviewer",
        projectPath: "/tmp/project",
      }),
    );
  });

  it("should preserve teamId on team leader crash restart", async () => {
    const session = makeSession({
      id: "s1",
      providerPid: 99999,
      agentRole: "coder",
      teamId: "dev",
    });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    (deps.isProcessAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const monitor = new ProcessMonitor(deps);
    await monitor.poll();

    expect(deps.launcher.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "dev",
        agentRole: "coder",
      }),
    );
  });

  it("should return correct poll result counts", async () => {
    const sessions = [
      makeSession({ id: "s1", providerPid: 111 }),
      makeSession({ id: "s2", providerPid: 222 }),
      makeSession({ id: "s3", providerPid: 333 }),
    ];
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue(sessions);
    // s1 alive, s2 dead, s3 alive
    (deps.isProcessAlive as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const monitor = new ProcessMonitor(deps);
    const result = await monitor.poll();

    expect(result.checked).toBe(3);
    expect(result.alive).toBe(2);
    expect(result.crashed).toBe(1);
    expect(result.restarted).toBe(1);
  });
});

describe("ProcessMonitor — Crash-Loop Cap (Sprint 92, CTO MF-1)", () => {
  it("should give up after MAX_RESTARTS within window", async () => {
    const session = makeSession({ id: "s1", providerPid: 99999 });
    const deps = makeMockDeps();
    (deps.registry.getActive as ReturnType<typeof vi.fn>).mockReturnValue([session]);
    (deps.isProcessAlive as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const monitor = new ProcessMonitor(deps);

    // Exhaust restarts
    for (let i = 0; i < MAX_RESTARTS; i++) {
      await monitor.poll();
    }

    // Reset mocks to check the next call
    vi.mocked(deps.launcher.launch).mockClear();
    vi.mocked(deps.registry.markError).mockClear();

    // Next poll should give up
    const result = await monitor.poll();
    expect(result.exhausted).toBe(1);
    expect(result.restarted).toBe(0);
    expect(deps.launcher.launch).not.toHaveBeenCalled();
    expect(deps.registry.markError).toHaveBeenCalledWith(
      "s1",
      expect.stringContaining("Restart cap exceeded"),
    );
  });

  it("should export restart constants", () => {
    expect(MAX_RESTARTS).toBe(3);
    expect(RESTART_WINDOW_MS).toBe(5 * 60_000);
  });
});
