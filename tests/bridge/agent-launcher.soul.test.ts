/**
 * SOUL-Aware Tests for AgentLauncher — Sprint 84 (ADR-025)
 *
 * Covers Strategy A (--agent flag) and Strategy B (--append-system-prompt-file),
 * bare launch (no agentRole), invalid role handling, session SOUL field
 * persistence, and SOUL temp file cleanup on kill.
 *
 * @module tests/bridge/agent-launcher.soul
 * @authority ADR-025
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentRole } from "../../src/bridge/intelligence/envelope.js";

// ============================================================================
// Mocks — vi.mock factories may only reference vi.fn() directly (hoisting).
// Use vi.hoisted() for values that need to be shared between factory and tests.
// ============================================================================

const {
  mockExistsSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockUnlinkSync,
  mockSoulLoad,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockSoulLoad: vi.fn().mockReturnValue({
    loaded: false,
    content: "You are the PM agent (fallback).",
    fallback: true,
    agentRole: "pm",
    contentHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    source: "fallback-inline",
  }),
}));

// Mock node:fs — existsSync controls project path + agent file existence
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    unlinkSync: mockUnlinkSync,
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
      cb: (e: Error | null, out: string, err: string) => void,
    ) => {
      cb(null, "", "");
      return { stdin: { write: vi.fn(), end: vi.fn() } };
    }),
  };
});

// Mock bridge-audit — suppress disk writes
vi.mock("../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({
    log: vi.fn(),
  }),
}));

// Mock SoulLoader — deterministic SOUL content without filesystem
vi.mock("../../src/bridge/intelligence/soul-loader.js", () => ({
  getSoulLoader: () => ({
    load: mockSoulLoad,
  }),
  resetSoulLoader: vi.fn(),
  createSoulLoader: vi.fn(),
}));

// ============================================================================
// Static imports — resolved after mocks are hoisted
// ============================================================================

import { AgentLauncher } from "../../src/bridge/agent-launcher.js";
import { TmuxBridge } from "../../src/bridge/tmux/tmux-bridge.js";
import { SessionRegistry } from "../../src/bridge/session-registry.js";
import { BridgePolicyManager } from "../../src/bridge/security/bridge-policy.js";
import type { BridgeSession } from "../../src/bridge/types.js";

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

/** Build a stub TmuxBridge that captures the last command passed to createSession. */
function makeMockTmux(): TmuxBridge & { lastCommand: string } {
  const tmux = {
    lastCommand: "",
    isAvailable: vi.fn().mockResolvedValue("tmux 3.3a"),
    createSession: vi.fn().mockImplementation((_windowName: string, command: string) => {
      tmux.lastCommand = command;
      return Promise.resolve({
        sessionName: "endiorbot",
        windowName: "claudecode",
        paneIndex: 0,
        target: "endiorbot:claudecode.0",
      });
    }),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    sendEnter: vi.fn().mockResolvedValue(undefined),
    capturePane: vi.fn().mockResolvedValue(""),
    killWindow: vi.fn().mockResolvedValue(undefined),
    listWindows: vi.fn().mockResolvedValue([]),
    sessionExists: vi.fn().mockResolvedValue(false),
  } as unknown as TmuxBridge & { lastCommand: string };
  return tmux;
}

function makeMockRegistry(): SessionRegistry {
  return {
    getAll: vi.fn().mockReturnValue([]),
    getActive: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    add: vi.fn(),
    update: vi.fn().mockReturnValue(true),
    remove: vi.fn().mockReturnValue(true),
    markStopped: vi.fn().mockReturnValue(true),
    markError: vi.fn().mockReturnValue(true),
  } as unknown as SessionRegistry;
}

function makeMockPolicy(): BridgePolicyManager {
  return {
    canCreateSession: vi.fn().mockReturnValue({ allowed: true, reason: "OK" }),
    isAgentTypeAllowed: vi.fn().mockReturnValue(true),
  } as unknown as BridgePolicyManager;
}

// ============================================================================
// Tests
// ============================================================================

describe("AgentLauncher — SOUL-aware launch (Sprint 84)", () => {
  let mockTmux: TmuxBridge & { lastCommand: string };
  let mockRegistry: SessionRegistry;
  let mockPolicy: BridgePolicyManager;
  let launcher: AgentLauncher;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-attach default after clearAllMocks
    mockExistsSync.mockReturnValue(true);
    mockSoulLoad.mockReturnValue({
      loaded: false,
      content: "You are the PM agent (fallback).",
      fallback: true,
      agentRole: "pm",
      contentHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      source: "fallback-inline",
    });

    mockTmux = makeMockTmux();
    mockRegistry = makeMockRegistry();
    mockPolicy = makeMockPolicy();
    launcher = new AgentLauncher(mockTmux, mockRegistry, mockPolicy);
  });

  // --------------------------------------------------------------------------
  // Strategy A — native --agent flag
  // --------------------------------------------------------------------------

  describe("Strategy A: --agent flag (agent file exists)", () => {
    it("uses '--agent pm' when .claude/agents/pm.md exists", async () => {
      // existsSync returns true for everything (project path + agent file)
      mockExistsSync.mockReturnValue(true);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      expect(result.success).toBe(true);
      expect(mockTmux.lastCommand).toContain("--agent 'pm'");
      // Strategy A does NOT write a temp file
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("does not call SoulLoader when Strategy A is selected", async () => {
      mockExistsSync.mockReturnValue(true);

      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      expect(mockSoulLoad).not.toHaveBeenCalled();
    });

    it("sets agentRole on the registered session when Strategy A is used", async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "architect",
      });

      expect(result.success).toBe(true);
      const addedSession = (mockRegistry.add as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as BridgeSession;
      expect(addedSession.agentRole).toBe("architect");
    });
  });

  // --------------------------------------------------------------------------
  // Strategy B — --append-system-prompt-file
  // --------------------------------------------------------------------------

  describe("Strategy B: --append-system-prompt-file (no agent file)", () => {
    beforeEach(() => {
      // Project path exists, agent files do NOT, soul temp check uses true
      mockExistsSync.mockImplementation((p: string) => {
        const path = String(p);
        if (path.includes(".claude/agents/")) return false;
        return true;
      });
    });

    it("uses '--append-system-prompt-file' when agent file is missing", async () => {
      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      expect(result.success).toBe(true);
      expect(mockTmux.lastCommand).toContain("--append-system-prompt-file");
      expect(mockTmux.lastCommand).not.toContain("--agent pm");
    });

    it("calls SoulLoader.load() to get SOUL content for Strategy B", async () => {
      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      expect(mockSoulLoad).toHaveBeenCalledWith("pm");
    });

    it("writes SOUL content to a temp soul.md file via writeFileSync", async () => {
      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const [writePath, writeContent] = (mockWriteFileSync as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string, unknown];
      expect(writePath).toContain("soul.md");
      expect(writeContent).toBe("You are the PM agent (fallback).");
    });

    it("persists soulContentHash on the registered session", async () => {
      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "pm",
      });

      const addedSession = (mockRegistry.add as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as BridgeSession;
      expect(addedSession.soulContentHash).toBe(
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      );
    });
  });

  // --------------------------------------------------------------------------
  // Bare launch — no agentRole
  // --------------------------------------------------------------------------

  describe("bare launch — no agentRole provided", () => {
    it("uses plain command without SOUL --agent flag when agentRole is not given", async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        // no agentRole
      });

      expect(result.success).toBe(true);
      expect(mockTmux.lastCommand).not.toContain("--agent");
      // Sprint 87: brain-context is always injected for claude-code launches
      // so --append-system-prompt-file may be present (brain-context.md)
    });

    it("does not set agentRole or soulContentHash on session for bare launch", async () => {
      mockExistsSync.mockReturnValue(true);

      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
      });

      const addedSession = (mockRegistry.add as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as BridgeSession;
      expect(addedSession.agentRole).toBeUndefined();
      expect(addedSession.soulContentHash).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Invalid agentRole — bare launch fallback
  // --------------------------------------------------------------------------

  describe("invalid agentRole — falls back to bare launch", () => {
    it("uses bare launch when agentRole fails isValidAgentRole check", async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "not-a-real-role" as AgentRole,
      });

      expect(result.success).toBe(true);
      expect(mockTmux.lastCommand).not.toContain("--agent");
      // Sprint 87: brain-context still injected even for invalid roles
    });

    it("does not set agentRole on session for invalid role", async () => {
      mockExistsSync.mockReturnValue(true);

      await launcher.launch({
        agentType: "claude-code",
        projectPath: "/tmp/project",
        actorId: "user123",
        agentRole: "hacker" as AgentRole,
      });

      const addedSession = (mockRegistry.add as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as BridgeSession;
      expect(addedSession.agentRole).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // kill — SOUL temp file cleanup
  // --------------------------------------------------------------------------

  describe("kill — SOUL temp file cleanup", () => {
    it("attempts to clean up the SOUL temp file on session kill", async () => {
      const session = makeActiveSession({ id: "bridge_soul_001" });
      (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(session);

      // temp soul.md exists
      mockExistsSync.mockImplementation((p: string) => {
        if (String(p).includes("soul.md")) return true;
        return true;
      });

      const result = await launcher.kill("bridge_soul_001", "user123");

      expect(result.success).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalled();
      const unlinkedPath = (mockUnlinkSync as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as string;
      expect(unlinkedPath).toContain("soul.md");
    });

    it("still marks session stopped even if soul temp file does not exist", async () => {
      const session = makeActiveSession({ id: "bridge_soul_002" });
      (mockRegistry.get as ReturnType<typeof vi.fn>).mockReturnValue(session);

      // soul.md and brain-context.md do not exist
      mockExistsSync.mockImplementation((p: string) => {
        const path = String(p);
        if (path.includes("soul.md") || path.includes("brain-context.md")) return false;
        return true;
      });

      const result = await launcher.kill("bridge_soul_002", "user123");

      expect(result.success).toBe(true);
      expect(mockRegistry.markStopped).toHaveBeenCalledWith("bridge_soul_002");
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
