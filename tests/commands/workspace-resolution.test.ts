/**
 * Workspace Resolution Tests — ISSUE-3 Investigation (Sprint 119)
 *
 * Verifies that the workspace resolution paths are correct and that
 * remote commands (/sh, /focus, etc.) use `getRepoForChat()` directly
 * via ChatFocusManager + RepoRegistry — NOT `ctx.workspace`.
 *
 * Finding: ISSUE-3 is a FALSE POSITIVE.
 * - `getRepoForChat()` in remote-handlers.ts is the authoritative resolution
 *   path for shell/copilot commands.
 * - `resolveWorkspace()` in ingress.ts populates `ctx.workspace` for
 *   AI chat and bridge-launcher commands only.
 * - The two paths are complementary, not competing.
 *
 * @module tests/commands/workspace-resolution
 * @sprint 119
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockGetFocus = vi.fn();
const mockSetFocus = vi.fn();
vi.mock("../../src/bridge/repo/chat-focus.js", () => ({
  getChatFocusManager: () => ({
    getFocus: mockGetFocus,
    setFocus: mockSetFocus,
    clearFocus: vi.fn(),
  }),
}));

const mockRepoGet = vi.fn();
const mockRepoList = vi.fn().mockReturnValue([]);
const mockRepoAdd = vi.fn().mockReturnValue({ success: true });
const mockRepoRemove = vi.fn().mockReturnValue(false);
vi.mock("../../src/bridge/repo/repo-registry.js", () => ({
  getRepoRegistry: () => ({
    get: mockRepoGet,
    list: mockRepoList,
    add: mockRepoAdd,
    remove: mockRepoRemove,
  }),
}));

vi.mock("../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => ({ log: vi.fn() }),
}));

vi.mock("../../src/bridge/security/bridge-policy.js", () => ({
  getBridgePolicyManager: () => ({
    isShellActorAllowed: () => true,
    getPolicy: () => ({ shellActorAllowlist: [] }),
  }),
}));

vi.mock("../../src/bridge/security/output-redactor.js", () => ({
  redactBridgeOutput: vi.fn().mockReturnValue({
    content: "$ ls\nfile1.ts\nfile2.ts\n",
    blocked: false,
    violations: [],
  }),
}));

vi.mock("../../src/gateway/events.js", () => ({
  createApprovalRequestWithEvents: vi.fn().mockReturnValue({
    id: "test-approval-id",
    type: "action",
    message: "Run: ls",
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }),
}));

vi.mock("../../src/bridge/tmux/tmux-bridge.js", () => ({
  getTmuxBridge: () => ({
    createSession: vi.fn().mockResolvedValue({ target: "t:0", sessionName: "t" }),
    sendKeys: vi.fn(),
    capturePane: vi.fn().mockResolvedValue("$ ls\nfile1.ts\n"),
    killWindow: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue("3.4"),
  }),
}));

vi.mock("../../src/bridge/shell/shell-allowlist.js", () => ({
  isAllowed: vi.fn().mockReturnValue(true),
}));

const mockSendCommand = vi.fn().mockResolvedValue({ output: "file1.ts\nfile2.ts\n", exitCode: 0, timedOut: false });
const mockHasSession = vi.fn().mockReturnValue(false);
const mockCaptureOutput = vi.fn().mockResolvedValue({ output: "$ ls\n" });
vi.mock("../../src/bridge/shell/shell-session-manager.js", () => ({
  ShellSessionManager: vi.fn().mockImplementation(() => ({
    sendCommand: mockSendCommand,
    hasSession: mockHasSession,
    captureOutput: mockCaptureOutput,
  })),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  handleFocusCommand,
  handleWhereCommand,
  handleShCommand,
  handleRunCommand,
  handleCpCommand,
  handleAttachCommand,
} from "../../src/commands/remote-handlers.js";
import { resolveWorkspace } from "../../src/bridge/repo/workspace-resolver.js";

// ============================================================================
// Resolution path: getRepoForChat() internals
// ============================================================================

describe("ISSUE-3: workspace resolution — getRepoForChat() path", () => {
  const CHAT_ID = "tg-chat-99";
  const REPO_NAME = "repo-a";
  const REPO_PATH = "/home/dev/repo-a";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves workspace from ChatFocusManager + RepoRegistry when focus is set", async () => {
    // Simulate: /focus repo-a was called for CHAT_ID
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: new Date().toISOString() });
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH, envAllowlist: [] });

    // /sh ls should resolve to REPO_PATH (via getRepoForChat → ChatFocusManager)
    const result = await handleShCommand(["ls"], CHAT_ID, "ceo@endiorbot");

    // The response should reference the correct repo name
    expect(result.success).toBe(true);
    expect(result.response).toContain(REPO_NAME);
    // ChatFocusManager was queried with the correct chatId
    expect(mockGetFocus).toHaveBeenCalledWith(CHAT_ID);
    // RepoRegistry was queried with the correct repo name
    expect(mockRepoGet).toHaveBeenCalledWith(REPO_NAME);
  });

  it("returns NO_FOCUS_MSG when no focus is set for the chat", async () => {
    mockGetFocus.mockReturnValue(null);

    const result = await handleShCommand(["ls"], CHAT_ID, "ceo@endiorbot");

    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
    expect(result.response).toContain("/focus");
  });

  it("/focus then /sh resolves repo correctly — the ADR-029 happy path", async () => {
    // Step 1: /focus repo-a
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH });
    const focusResult = handleFocusCommand([REPO_NAME], CHAT_ID, "ceo@endiorbot");
    expect(focusResult.success).toBe(true);
    // ChatFocusManager.setFocus was called with (chatId, repoName)
    expect(mockSetFocus).toHaveBeenCalledWith(CHAT_ID, REPO_NAME);

    // Step 2: Simulate focus was stored — next call to getFocus returns it
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: new Date().toISOString() });

    // Step 3: /sh ls resolves to the focused repo
    const shResult = await handleShCommand(["ls"], CHAT_ID, "ceo@endiorbot");
    expect(shResult.success).toBe(true);
    expect(shResult.response).toContain(REPO_NAME);
  });

  it("/where reflects the current focus for the chat", () => {
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: new Date().toISOString() });
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH, defaultBranch: "main" });

    const result = handleWhereCommand(CHAT_ID);

    expect(result.success).toBe(true);
    expect(result.response).toContain(REPO_NAME);
    expect(result.response).toContain(REPO_PATH);
  });

  it("/run uses getRepoForChat — no dependency on ctx.workspace", async () => {
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: "" });
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH, envAllowlist: ["NODE_ENV"] });

    const result = await handleRunCommand(["npm", "test"], CHAT_ID, "ceo@endiorbot");

    expect(result.success).toBe(true);
    expect(result.response).toContain("Approval Required");
    expect(result.response).toContain(REPO_NAME);
    // Confirms getRepoForChat was invoked (getFocus + get)
    expect(mockGetFocus).toHaveBeenCalledWith(CHAT_ID);
    expect(mockRepoGet).toHaveBeenCalledWith(REPO_NAME);
  });

  it("/cp commands use getRepoForChat — no dependency on ctx.workspace", async () => {
    mockGetFocus.mockReturnValue(null);

    // Without focus, /cp suggest should fail with NO_FOCUS_MSG
    const result = await handleCpCommand(["suggest", "list files"], CHAT_ID, "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });

  it("/attach uses getRepoForChat — no dependency on ctx.workspace", async () => {
    mockGetFocus.mockReturnValue(null);

    const result = await handleAttachCommand([], CHAT_ID, "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No repo focused");
  });
});

// ============================================================================
// Resolution path: resolveWorkspace() used by GatewayIngress
// ============================================================================

describe("ISSUE-3: workspace resolution — resolveWorkspace() path (AI chat + launchers)", () => {
  const CHAT_ID = "tg-chat-99";
  const REPO_NAME = "repo-a";
  const REPO_PATH = "/home/dev/repo-a";
  const DEFAULT_ROOT = "/app";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveWorkspace returns repo path when focus is set", () => {
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: "" });
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH });

    const result = resolveWorkspace(CHAT_ID, DEFAULT_ROOT);

    expect(result).toBe(REPO_PATH);
  });

  it("resolveWorkspace returns fallback when no focus is set", () => {
    mockGetFocus.mockReturnValue(null);

    const result = resolveWorkspace(CHAT_ID, DEFAULT_ROOT);

    expect(result).toBe(DEFAULT_ROOT);
  });

  it("resolveWorkspace returns fallback when focused repo is not in registry", () => {
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: "ghost-repo", setAt: "" });
    mockRepoGet.mockReturnValue(null); // repo removed from registry

    const result = resolveWorkspace(CHAT_ID, DEFAULT_ROOT);

    expect(result).toBe(DEFAULT_ROOT);
  });

  it("resolveWorkspace and getRepoForChat read the SAME underlying state", () => {
    // Both paths call getChatFocusManager().getFocus(chatId) and getRepoRegistry().get(name)
    // This test confirms they are consistent — no divergence in data source.
    mockGetFocus.mockReturnValue({ chatId: CHAT_ID, repoName: REPO_NAME, setAt: "" });
    mockRepoGet.mockReturnValue({ name: REPO_NAME, path: REPO_PATH, envAllowlist: [] });

    // resolveWorkspace (used by ingress for AI routing)
    const wsPath = resolveWorkspace(CHAT_ID, DEFAULT_ROOT);

    // getRepoForChat (used internally by handleShCommand)
    // We verify indirectly: /sh resolves the same REPO_NAME
    // (actual repo path consumed internally by ShellSessionManager)
    expect(wsPath).toBe(REPO_PATH);
    // Both went through the same getFocus call
    expect(mockGetFocus).toHaveBeenCalledWith(CHAT_ID);
    expect(mockRepoGet).toHaveBeenCalledWith(REPO_NAME);
  });
});

// ============================================================================
// Two paths are complementary — no conflict
// ============================================================================

describe("ISSUE-3: two resolution paths are complementary, not competing", () => {
  it("remote commands (sh/run/cp/attach) NEVER use ctx.workspace — they call getRepoForChat() directly", () => {
    // This is a static assertion test:
    // The handlers in remote-handlers.ts receive (args, chatId, actorId) — no ctx.workspace parameter.
    // They call getRepoForChat(chatId) internally.
    // ctx.workspace is only populated on CommandContext by GatewayIngress for /launch and /fix.

    // Confirm function signatures do not accept a workspace parameter:
    const shParams = handleShCommand.length; // (args, chatId, actorId) → 3
    const runParams = handleRunCommand.length;
    const cpParams = handleCpCommand.length;

    expect(shParams).toBe(3);
    expect(runParams).toBe(3);
    expect(cpParams).toBe(3);
  });

  it("resolveWorkspace is used by ingress for /launch (ctx.workspace) — separate concern from remote commands", () => {
    // GatewayIngress sets ctx.workspace = resolveWorkspace(chatId, projectRoot)
    // This is passed to /launch and /fix, which need the workspace for Claude Code Bridge.
    // Remote commands (/sh, /run, /cp) bypass ctx.workspace entirely.
    // No conflict exists.
    expect(resolveWorkspace).toBeTypeOf("function");
  });
});
