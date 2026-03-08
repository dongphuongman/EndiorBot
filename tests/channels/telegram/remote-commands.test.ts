/**
 * Remote Commands Tests (Sprint 83)
 *
 * Tests for /repos, /focus, /where, /cp, /sh, /attach, /run handlers.
 * All handlers require actor identity (mocked).
 *
 * @module tests/channels/telegram/remote-commands
 * @authority ADR-024 D4/D5, Sprint 83
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks (declared before imports)
// ============================================================================

const mockAuditLog = vi.fn();
vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({ log: mockAuditLog }),
}));

vi.mock("../../../src/bridge/security/bridge-policy.js", () => ({
  getBridgePolicyManager: () => ({
    isShellActorAllowed: () => true,
    getPolicy: () => ({ shellActorAllowlist: [] }),
  }),
}));

const mockRepoAdd = vi.fn().mockReturnValue({ success: true });
const mockRepoGet = vi.fn().mockReturnValue(null);
const mockRepoList = vi.fn().mockReturnValue([]);
const mockRepoRemove = vi.fn().mockReturnValue(false);
vi.mock("../../../src/bridge/repo/repo-registry.js", () => ({
  getRepoRegistry: () => ({
    add: mockRepoAdd,
    get: mockRepoGet,
    list: mockRepoList,
    remove: mockRepoRemove,
  }),
}));

const mockGetFocus = vi.fn().mockReturnValue(null);
const mockSetFocus = vi.fn();
const mockClearFocus = vi.fn();
vi.mock("../../../src/bridge/repo/chat-focus.js", () => ({
  getChatFocusManager: () => ({
    getFocus: mockGetFocus,
    setFocus: mockSetFocus,
    clearFocus: mockClearFocus,
  }),
}));

vi.mock("../../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    createSession: vi.fn().mockResolvedValue({ target: "endiorbot-shell:0", sessionName: "endiorbot-shell" }),
    sendKeys: vi.fn(),
    capturePane: vi.fn().mockResolvedValue("$ git status\nclean\n"),
    killWindow: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue("3.4"),
  }),
}));

vi.mock("../../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({
    content: "redacted output",
    blocked: false,
    violations: [],
  }),
}));

vi.mock("../../../src/gateway/events.js", () => ({
  createApprovalRequestWithEvents: vi.fn().mockReturnValue({
    id: "approval_test_123",
    type: "action",
    message: "Run: test",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }),
}));

vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: () => ({
    getTeam: vi.fn().mockReturnValue({ found: false }),
    getTier: vi.fn().mockReturnValue("STANDARD"),
  }),
}));

vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  getAgentIcon: (role: string) => `[${role}]`,
}));

// Mock child_process.execFile for executeApprovedRun (MF-5)
const { mockExecFile } = vi.hoisted(() => {
  const mockExecFile = vi.fn();
  return { mockExecFile };
});
vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

// ============================================================================
// Imports
// ============================================================================

import {
  handleReposCommand,
  handleFocusCommand,
  handleWhereCommand,
  handleCpCommand,
  handleShCommand,
  handleAttachCommand,
  handleRunCommand,
  executeApprovedRun,
} from "../../../src/channels/telegram/remote-commands.js";

// ============================================================================
// /repos
// ============================================================================

describe("Remote Commands — /repos", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lists empty repos", () => {
    mockRepoList.mockReturnValue([]);
    const result = handleReposCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("No repos registered");
  });

  it("lists registered repos", () => {
    mockRepoList.mockReturnValue([
      { name: "endiorbot", path: "/home/deploy/EndiorBot", registeredAt: new Date().toISOString() },
    ]);
    const result = handleReposCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("endiorbot");
  });

  it("adds a repo", () => {
    mockRepoAdd.mockReturnValue({ success: true });
    const result = handleReposCommand(["add", "myrepo", "/home/user/myrepo"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("registered");
  });

  it("reports add failure", () => {
    mockRepoAdd.mockReturnValue({ success: false, error: "Path must be absolute" });
    const result = handleReposCommand(["add", "bad", "relative"]);
    expect(result.success).toBe(false);
    expect(result.response).toContain("absolute");
  });

  it("removes a repo", () => {
    mockRepoRemove.mockReturnValue(true);
    const result = handleReposCommand(["remove", "old"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("removed");
  });
});

// ============================================================================
// /focus, /where
// ============================================================================

describe("Remote Commands — /focus", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("sets focus when repo exists", () => {
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    const result = handleFocusCommand(["endiorbot"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(result.response).toContain("endiorbot");
    expect(mockSetFocus).toHaveBeenCalledWith("chat123", "endiorbot");
  });

  it("rejects when repo not found", () => {
    mockRepoGet.mockReturnValue(null);
    const result = handleFocusCommand(["nonexistent"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found");
  });

  it("shows usage without args", () => {
    const result = handleFocusCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("logs audit event", () => {
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    handleFocusCommand(["endiorbot"], "chat123", "ceo@endiorbot");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "repo_focus" }),
    );
  });
});

describe("Remote Commands — /where", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows no-focus message when not focused", () => {
    mockGetFocus.mockReturnValue(null);
    const result = handleWhereCommand("chat123");
    expect(result.response).toContain("No repo focused");
  });

  it("shows focus when set", () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: new Date().toISOString() });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot", defaultBranch: "main" });
    const result = handleWhereCommand("chat123");
    expect(result.response).toContain("endiorbot");
    expect(result.response).toContain("main");
  });
});

// ============================================================================
// /cp (Copilot CLI)
// ============================================================================

describe("Remote Commands — /cp", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows usage without subcommand", async () => {
    const result = await handleCpCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("suggest");
  });

  it("/cp suggest without focus returns no-focus message (CA6)", async () => {
    mockGetFocus.mockReturnValue(null);
    const result = await handleCpCommand(["suggest", "list files"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });

  it("/cp explain without focus returns no-focus message (CA6)", async () => {
    mockGetFocus.mockReturnValue(null);
    const result = await handleCpCommand(["explain", "find"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });
});

// ============================================================================
// /sh (Read-Only Shell)
// ============================================================================

describe("Remote Commands — /sh", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows usage without command", async () => {
    const result = await handleShCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("returns no-focus message without focus (CA6)", async () => {
    mockGetFocus.mockReturnValue(null);
    const result = await handleShCommand(["git", "status"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });

  it("blocks non-allowlisted command", async () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: "" });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    const result = await handleShCommand(["rm", "-rf", "/"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not in read-only allowlist");
  });

  it("blocks find -exec", async () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: "" });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    const result = await handleShCommand(["find", ".", "-exec", "cat", "{}", ";"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not in read-only allowlist");
  });
});

// ============================================================================
// /attach
// ============================================================================

describe("Remote Commands — /attach", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns no-focus message without focus (CA6)", async () => {
    mockGetFocus.mockReturnValue(null);
    const result = await handleAttachCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });

  it("returns error when no shell session", async () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: "" });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    const result = await handleAttachCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No shell session");
  });
});

// ============================================================================
// /run (Approval-Gated)
// ============================================================================

describe("Remote Commands — /run", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows usage without command", async () => {
    const result = await handleRunCommand([], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("returns no-focus message without focus (CA6)", async () => {
    mockGetFocus.mockReturnValue(null);
    const result = await handleRunCommand(["npm", "test"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });

  it("creates approval request with full command (CTO W-3)", async () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: "" });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    const result = await handleRunCommand(["npm", "test"], "chat123", "ceo@endiorbot");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Approval Required");
    expect(result.response).toContain("npm test");
    expect(result.response).toContain("approval_test_123");
  });

  it("logs run_request audit event", async () => {
    mockGetFocus.mockReturnValue({ chatId: "chat123", repoName: "endiorbot", setAt: "" });
    mockRepoGet.mockReturnValue({ name: "endiorbot", path: "/home/deploy/EndiorBot" });
    await handleRunCommand(["npm", "test"], "chat123", "ceo@endiorbot");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "run_request" }),
    );
  });
});

// ============================================================================
// executeApprovedRun (MF-5)
// ============================================================================

describe("Remote Commands — executeApprovedRun", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("executes command and returns success on exit 0", async () => {
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], _o: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
        cb(null, "tests passed\n", "");
      },
    );
    const result = await executeApprovedRun("npm test", "/home/deploy/EndiorBot", "endiorbot", "ceo@endiorbot", "chat123");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Run Complete");
  });

  it("returns exit code on failure", async () => {
    const err = Object.assign(new Error("exit 1"), { stdout: "FAIL", stderr: "error", code: 1 });
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], _o: unknown, cb: (err: Error) => void) => { cb(err); },
    );
    const result = await executeApprovedRun("npm test", "/home/deploy/EndiorBot", "endiorbot", "ceo@endiorbot", "chat123");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Exit: 1");
  });

  it("passes buildCleanEnv with PATH, HOME, LANG", async () => {
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], opts: { env?: Record<string, string> }, cb: (err: null, stdout: string, stderr: string) => void) => {
        expect(opts.env).toBeDefined();
        expect(opts.env!["PATH"]).toBeDefined();
        expect(opts.env!["HOME"]).toBeDefined();
        expect(opts.env!["LANG"]).toBeDefined();
        cb(null, "ok\n", "");
      },
    );
    await executeApprovedRun("echo hi", "/tmp", "test", "actor", "chat", []);
  });

  it("passes envAllowlist keys from repo config", async () => {
    process.env["MY_TOKEN"] = "secret123";
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], opts: { env?: Record<string, string> }, cb: (err: null, stdout: string, stderr: string) => void) => {
        expect(opts.env!["MY_TOKEN"]).toBe("secret123");
        cb(null, "ok\n", "");
      },
    );
    await executeApprovedRun("echo hi", "/tmp", "test", "actor", "chat", ["MY_TOKEN"]);
    delete process.env["MY_TOKEN"];
  });

  it("logs run_executed audit event", async () => {
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], _o: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
        cb(null, "done\n", "");
      },
    );
    await executeApprovedRun("npm test", "/home/deploy/EndiorBot", "endiorbot", "ceo@endiorbot", "chat123");
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "run_executed" }),
    );
  });

  it("calls redactBridgeOutput on result", async () => {
    mockExecFile.mockImplementation(
      (_b: string, _a: string[], _o: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
        cb(null, "sensitive output\n", "");
      },
    );
    const result = await executeApprovedRun("cmd", "/tmp", "repo", "actor", "chat");
    // redactBridgeOutput is mocked to return "redacted output"
    expect(result.response).toContain("redacted output");
  });
});
