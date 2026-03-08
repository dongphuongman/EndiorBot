/**
 * Agent Launcher Team Tests — Sprint 89 (ADR-026)
 *
 * Covers team file detection (Strategy A with team file), fallback to solo
 * file (C4), solo path unchanged (C5), and Agent tool isolation (C7).
 *
 * @module tests/bridge/agent-launcher.team
 * @authority ADR-026
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const {
  mockExistsSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockUnlinkSync,
  mockSoulLoad,
  mockGetFeatureFlag,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockSoulLoad: vi.fn().mockReturnValue({
    loaded: false,
    content: "You are the Coder agent (fallback).",
    fallback: true,
    agentRole: "coder",
    contentHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    source: "fallback-inline",
  }),
  mockGetFeatureFlag: vi.fn().mockReturnValue(true),
}));

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

vi.mock("../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({
    log: vi.fn(),
  }),
}));

vi.mock("../../src/bridge/intelligence/soul-loader.js", () => ({
  getSoulLoader: () => ({
    load: mockSoulLoad,
  }),
  resetSoulLoader: vi.fn(),
  createSoulLoader: vi.fn(),
}));

// Mock envelope-builder (Sprint 87)
vi.mock("../../src/bridge/intelligence/envelope-builder.js", () => ({
  buildFullEnvelope: vi.fn().mockReturnValue({ persona: { agentRole: "coder", soulContent: "", soulContentHash: "" } }),
  serializeEnvelopeForInjection: vi.fn().mockReturnValue(""),
}));

// Mock feature flags
vi.mock("../../src/config/feature-flags.js", () => ({
  getFeatureFlagWithEnvOverride: (...args: unknown[]) => mockGetFeatureFlag(...args),
}));

// ============================================================================
// Imports
// ============================================================================

import { AgentLauncher } from "../../src/bridge/agent-launcher.js";
import { TmuxBridge } from "../../src/bridge/tmux/tmux-bridge.js";
import { SessionRegistry } from "../../src/bridge/session-registry.js";
import { BridgePolicyManager } from "../../src/bridge/security/bridge-policy.js";

// ============================================================================
// Helpers
// ============================================================================

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
    add: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    getActive: vi.fn().mockReturnValue([]),
    remove: vi.fn(),
    markActive: vi.fn().mockReturnValue(true),
    markError: vi.fn().mockReturnValue(true),
  } as unknown as SessionRegistry;
}

function makeMockPolicy(): BridgePolicyManager {
  return {
    canCreateSession: vi.fn().mockReturnValue({ allowed: true, reason: "OK" }),
    isAgentTypeAllowed: vi.fn().mockReturnValue(true),
  } as unknown as BridgePolicyManager;
}

function makeLauncher(tmux: TmuxBridge): AgentLauncher {
  return new AgentLauncher(tmux, makeMockRegistry(), makeMockPolicy());
}

// ============================================================================
// Tests
// ============================================================================

describe("AgentLauncher — Team File Detection (Sprint 89)", () => {
  let tmux: TmuxBridge & { lastCommand: string };
  let launcher: AgentLauncher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true); // projectPath exists, agent files exist
    mockGetFeatureFlag.mockReturnValue(true);
    tmux = makeMockTmux();
    launcher = makeLauncher(tmux);
  });

  it("should use team file when team file exists and flag enabled", async () => {
    // coder leads dev team → dev-team.md should be used
    const result = await launcher.launch({
      agentType: "claude-code",
      projectPath: "/tmp/project",
      actorId: "user1",
      agentRole: "coder",
    });

    expect(result.success).toBe(true);
    // Command should reference dev-team, not just coder
    expect(tmux.lastCommand).toContain("dev-team");
  });

  it("should fallback to solo file when team flag is disabled (C4)", async () => {
    mockGetFeatureFlag.mockReturnValue(false);

    const result = await launcher.launch({
      agentType: "claude-code",
      projectPath: "/tmp/project",
      actorId: "user1",
      agentRole: "coder",
    });

    expect(result.success).toBe(true);
    // Should use solo agent file, not team file
    expect(tmux.lastCommand).toContain("--agent");
    expect(tmux.lastCommand).not.toContain("dev-team");
  });

  it("should fallback to solo file when team file doesn't exist", async () => {
    // Only solo agent file exists, not team file
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("-team.md")) return false;
      return true; // projectPath and solo agent file exist
    });

    const result = await launcher.launch({
      agentType: "claude-code",
      projectPath: "/tmp/project",
      actorId: "user1",
      agentRole: "coder",
    });

    expect(result.success).toBe(true);
    expect(tmux.lastCommand).toContain("--agent");
    expect(tmux.lastCommand).not.toContain("dev-team");
  });

  it("should not affect solo launch for roles without teams (C5)", async () => {
    // assistant has no team → should use solo file as before
    const result = await launcher.launch({
      agentType: "claude-code",
      projectPath: "/tmp/project",
      actorId: "user1",
      agentRole: "assistant",
    });

    expect(result.success).toBe(true);
    expect(tmux.lastCommand).toContain("--agent");
    expect(tmux.lastCommand).not.toContain("-team");
  });

  it("should use Strategy B when neither team nor solo file exists", async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === "string" && path.endsWith(".md")) return false; // no agent files
      return true; // project path exists
    });

    const result = await launcher.launch({
      agentType: "claude-code",
      projectPath: "/tmp/project",
      actorId: "user1",
      agentRole: "coder",
    });

    expect(result.success).toBe(true);
    expect(tmux.lastCommand).toContain("--append-system-prompt-file");
  });
});
