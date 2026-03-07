/**
 * Tests for AgentLauncher
 *
 * Launches AI agents in tmux panes and registers sessions.
 * Validates policy, tmux availability, and project path existence before launch.
 *
 * @module tests/bridge/agent-launcher
 * @authority ADR-024
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks — declared before imports so vi.mock hoisting takes effect
// ============================================================================

// Mock fs.existsSync used by AgentLauncher to check project path
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Mock execFile used by AgentLauncher.getGitRemote
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return {
    ...original,
    execFile: vi.fn((
      _bin: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out: string, err: string) => void
    ) => {
      cb(null, "", "");
      return { stdin: { write: vi.fn(), end: vi.fn() } };
    }),
  };
});

// Mock bridge-audit so tests don't write audit logs to disk
vi.mock("../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({
    log: vi.fn(),
  }),
}));

// Static imports resolved after mocks are hoisted
import { existsSync } from "node:fs";
import { AgentLauncher } from "../../src/bridge/agent-launcher.js";
import { TmuxBridge } from "../../src/bridge/tmux/tmux-bridge.js";
import { SessionRegistry } from "../../src/bridge/session-registry.js";
import { BridgePolicyManager } from "../../src/bridge/security/bridge-policy.js";
import type { BridgeSession } from "../../src/bridge/types.js";

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;

// ============================================================================
// Helpers
// ============================================================================

function makeActiveSession(overrides: Partial<BridgeSession> = {}): BridgeSession {
  const now = new Date().toISOString();
  return {
    id: SessionRegistry.generateId(),
    agentType: "claude-code",
    tmuxTarget: "endiorbot:claudecode.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/project",
    workspaceFingerprint: "abc1234567890abc",
    status: "active",
    riskMode: "read",
    createdAt: now,
    lastActivityAt: now,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("AgentLauncher", () => {
  let mockTmux: TmuxBridge;
  let mockRegistry: SessionRegistry;
  let mockPolicy: BridgePolicyManager;
  let launcher: AgentLauncher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);

    // Stub TmuxBridge
    mockTmux = {
      isAvailable: vi.fn().mockResolvedValue("tmux 3.3a"),
      createSession: vi.fn().mockResolvedValue({
        sessionName: "endiorbot",
        windowName: "claudecode",
        paneIndex: 0,
        target: "endiorbot:claudecode.0",
      }),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      sendEnter: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue(""),
      killWindow: vi.fn().mockResolvedValue(undefined),
      listWindows: vi.fn().mockResolvedValue([]),
      sessionExists: vi.fn().mockResolvedValue(false),
    } as unknown as TmuxBridge;

    // Stub SessionRegistry
    mockRegistry = {
      getAll: vi.fn().mockReturnValue([]),
      getActive: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(undefined),
      add: vi.fn(),
      update: vi.fn().mockReturnValue(true),
      remove: vi.fn().mockReturnValue(true),
      markStopped: vi.fn().mockReturnValue(true),
      markError: vi.fn().mockReturnValue(true),
    } as unknown as SessionRegistry;

    // Stub BridgePolicyManager — allow by default
    mockPolicy = {
      canCreateSession: vi.fn().mockReturnValue({ allowed: true, reason: "OK" }),
      isAgentTypeAllowed: vi.fn().mockReturnValue(true),
    } as unknown as BridgePolicyManager;

    launcher = new AgentLauncher(mockTmux, mockRegistry, mockPolicy);
  });

  // --------------------------------------------------------------------------
  // launch — validation errors
  // --------------------------------------------------------------------------

  describe("launch — validation errors", () => {
    it("returns error for unknown agent type", async () => {
      const result = await launcher.launch({
        agentType: "unknown-agent" as never,
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown agent type");
    });

    it("returns error when tmux is not available", async () => {
      (mockTmux.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("tmux not found");
    });

    it("returns error when project path does not exist on disk", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/nonexistent/path",
        actorId: "user123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Project path not found");
    });

    it("returns error when policy blocks session creation (max sessions reached)", async () => {
      (mockPolicy.canCreateSession as ReturnType<typeof vi.fn>).mockReturnValue({
        allowed: false,
        reason: "Max sessions reached for claude-code (2/2). Kill a session first.",
      });

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Max sessions reached");
    });
  });

  // --------------------------------------------------------------------------
  // launch — success path
  // --------------------------------------------------------------------------

  describe("launch — success path", () => {
    it("creates tmux session and registers it in the registry on success", async () => {
      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.agentType).toBe("claude-code");
      expect(result.session?.status).toBe("active");
      expect(result.session?.tmuxTarget).toBe("endiorbot:claudecode.0");
      expect(result.session?.projectPath).toBe("/tmp/project");

      expect(mockRegistry.add).toHaveBeenCalledOnce();
      const addedSession = (mockRegistry.add as ReturnType<typeof vi.fn>).mock.calls[0]![0] as BridgeSession;
      expect(addedSession.id).toMatch(/^bridge_/);
    });

    it("computes a non-empty workspaceFingerprint on the registered session", async () => {
      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.success).toBe(true);
      expect(result.session?.workspaceFingerprint).toBeTruthy();
      expect(result.session?.workspaceFingerprint).toMatch(/^[0-9a-f]{16}$/);
    });

    it("defaults riskMode to read when not provided", async () => {
      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      expect(result.session?.riskMode).toBe("read");
    });

    it("uses the caller-provided riskMode when specified", async () => {
      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        riskMode: "patch",
      });

      expect(result.session?.riskMode).toBe("patch");
    });

    it("passes active sessions to policy.canCreateSession", async () => {
      const activeSessions = [makeActiveSession()];
      (mockRegistry.getActive as ReturnType<typeof vi.fn>).mockReturnValue(activeSessions);

      await launcher.launch({
        agentType: "cursor",
        projectPath: "/tmp/project",
        actorId: "user456",
      });

      expect(mockPolicy.canCreateSession).toHaveBeenCalledWith("cursor", activeSessions);
    });
  });

  // --------------------------------------------------------------------------
  // kill
  // --------------------------------------------------------------------------

  describe("kill", () => {
    it("returns error when session ID is not found in registry", async () => {
      (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await launcher.kill("bridge_unknown_999", "user123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session not found");
    });

    it("kills the tmux window and marks session as stopped", async () => {
      const session = makeActiveSession({ id: "bridge_kill_001" });
      (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(session);

      const result = await launcher.kill("bridge_kill_001", "user123");

      expect(result.success).toBe(true);
      expect(mockTmux.killWindow).toHaveBeenCalledWith(session.tmuxTarget);
      expect(mockRegistry.markStopped).toHaveBeenCalledWith("bridge_kill_001");
    });

    it("still marks session stopped when killWindow throws (window already gone)", async () => {
      const session = makeActiveSession({ id: "bridge_kill_002" });
      (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(session);
      (mockTmux.killWindow as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("tmux window already gone")
      );

      const result = await launcher.kill("bridge_kill_002", "user123");

      expect(result.success).toBe(true);
      expect(mockRegistry.markStopped).toHaveBeenCalledWith("bridge_kill_002");
    });
  });
});
