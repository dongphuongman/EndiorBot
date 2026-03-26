/**
 * Bridge Command Handlers Tests
 *
 * @module tests/commands/handlers/bridge-commands
 * @date 2026-03-26
 * @sprint 119
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks — must be defined before any imports of the module under test
// ============================================================================

const mockLauncher = {
  launch: vi.fn(),
  kill: vi.fn(),
};

const mockRegistry = {
  getActive: vi.fn(() => []),
  get: vi.fn(() => null),
};

const mockAuditLogger = {
  log: vi.fn(),
};

vi.mock("../../../src/bridge/agent-launcher.js", () => ({
  getAgentLauncher: () => mockLauncher,
}));

vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: () => mockRegistry,
}));

vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: () => mockAuditLogger,
}));

vi.mock("../../../src/bridge/intelligence/complexity-gate.js", () => ({
  assessComplexity: vi.fn(() => ({ level: "complex", reason: "complex task" })),
}));

vi.mock("../../../src/bridge/intelligence/team-installer.js", () => ({
  TEAM_LEADER_ROLES: {
    dev: "coder",
    planning: "pjm",
    design: "architect",
    qa: "tester",
    ops: "devops",
    executive: "ceo",
    fullstack: "fullstack",
  },
}));

vi.mock("../../../src/config/feature-flags.js", () => ({
  getFeatureFlagWithEnvOverride: vi.fn(() => true),
}));

vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  createComplexityGateKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
  getAgentIcon: vi.fn((role: string) => "🤖"),
}));

// ============================================================================
// Import module under test AFTER mocks
// ============================================================================

import {
  handleLaunchCommand,
  handleLinkCommand,
  handleSessionsCommand,
  handleSwitchCommand,
  handleModeCommand,
  handleWebhookCommand,
  activeSessionMap,
} from "../../../src/commands/handlers/bridge-commands.js";

// ============================================================================
// Helpers
// ============================================================================

const TEST_ACTOR = "ceo@endiorbot";
const HOME_DIR = process.env["HOME"] ?? "/Users/test";

function makeSession(overrides: Partial<{
  id: string;
  agentType: string;
  agentRole: string;
  teamId: string | undefined;
  tmuxTarget: string;
  projectPath: string;
  riskMode: string;
  status: string;
}> = {}): {
  id: string;
  agentType: string;
  agentRole: string | undefined;
  teamId: string | undefined;
  tmuxTarget: string;
  projectPath: string;
  riskMode: string;
  status: string;
} {
  return {
    id: "bridge_123_abc",
    agentType: "claude-code",
    agentRole: undefined,
    teamId: undefined,
    tmuxTarget: "endiorbot:bridge_123_abc",
    projectPath: `${HOME_DIR}/project`,
    riskMode: "read",
    status: "active",
    ...overrides,
  };
}

// ============================================================================
// handleLinkCommand
// ============================================================================

describe("handleLinkCommand", () => {
  it("returns success with actorId info", () => {
    const result = handleLinkCommand("user123", "alice", "telegram");
    expect(result.success).toBe(true);
    expect(result.response).toContain("ceo@endiorbot");
  });

  it("includes /launch in help text", () => {
    const result = handleLinkCommand("user123");
    expect(result.response).toContain("/launch");
  });

  it("logs identity_link audit event", () => {
    mockAuditLogger.log.mockClear();
    handleLinkCommand("user456", "bob", "telegram");
    expect(mockAuditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "identity_link" }),
    );
  });
});

// ============================================================================
// handleLaunchCommand — arg parsing
// ============================================================================

describe("handleLaunchCommand — help when no args", () => {
  it("returns usage help when args is empty", async () => {
    const result = await handleLaunchCommand([], TEST_ACTOR);
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
    expect(result.response).toContain("/launch");
  });
});

describe("handleLaunchCommand — --as flag parsing", () => {
  beforeEach(() => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession({ agentRole: "coder" }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses --as coder and sets agentRole on launch options", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as", "coder"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ agentRole: "coder" }),
    );
  });

  it("returns error for unknown role", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as", "invalid-role"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown role");
    expect(result.response).toContain("invalid-role");
  });

  it("returns error for empty role value", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as", ""],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown role");
  });
});

describe("handleLaunchCommand — --risk flag parsing", () => {
  beforeEach(() => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession({ riskMode: "patch" }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses --risk patch and sets riskMode on launch options", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--risk", "patch"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ riskMode: "patch" }),
    );
  });

  it("parses --risk read and sets riskMode=read", async () => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession({ riskMode: "read" }),
    });
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--risk", "read"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ riskMode: "read" }),
    );
  });

  it("returns error for unknown risk mode", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--risk", "invalid"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown risk mode");
  });
});

describe("handleLaunchCommand — --mode alias (Sprint 119 deprecation)", () => {
  beforeEach(() => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession({ riskMode: "patch" }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts --mode patch as alias for --risk patch", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--mode", "patch"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
  });

  it("includes deprecation warning when --mode is used", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--mode", "patch"],
      TEST_ACTOR,
    );
    expect(result.response).toContain("deprecated");
  });

  it("returns error for unknown mode value", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--mode", "unknown"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown risk mode");
  });
});

describe("handleLaunchCommand — mutual exclusion --as and --as-team", () => {
  it("returns error when both --as and --as-team are provided", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as", "coder", "--as-team", "dev"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Cannot use --as and --as-team together");
  });
});

describe("handleLaunchCommand — --as-team flag parsing", () => {
  beforeEach(() => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession({ teamId: "dev", agentRole: "coder" }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses --as-team dev and sets teamId", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as-team", "dev"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
    expect(mockLauncher.launch).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "dev" }),
    );
  });

  it("returns error for unknown team", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`, "--as-team", "invalid-team"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown team");
  });
});

describe("handleLaunchCommand — unknown agent type", () => {
  it("returns error for unrecognized agent", async () => {
    const result = await handleLaunchCommand(
      ["unknownagent", `${HOME_DIR}/project`],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown agent");
  });
});

// ============================================================================
// handleLaunchCommand — path traversal protection (MF-2)
// ============================================================================

describe("handleLaunchCommand — path traversal protection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks path outside $HOME and /tmp", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/etc/passwd"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toMatch(/path must be under/i);
  });

  it("blocks /var/log path", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/var/log/syslog"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toMatch(/path must be under/i);
  });

  it("blocks root path /", async () => {
    const result = await handleLaunchCommand(
      ["claude", "/"],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toMatch(/path must be under/i);
  });

  it("allows path under $HOME", async () => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession(),
    });
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/my-project`],
      TEST_ACTOR,
    );
    // Should not be blocked by path check (may fail for other reasons but not path)
    expect(result.response).not.toMatch(/path must be under/i);
    activeSessionMap.clear();
  });

  it("allows path under /tmp", async () => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession(),
    });
    const result = await handleLaunchCommand(
      ["claude", "/tmp/test-project"],
      TEST_ACTOR,
    );
    expect(result.response).not.toMatch(/path must be under/i);
    activeSessionMap.clear();
  });
});

describe("handleLaunchCommand — successful launch", () => {
  beforeEach(() => {
    mockLauncher.launch.mockResolvedValue({
      success: true,
      session: makeSession(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    activeSessionMap.clear();
  });

  it("returns success with session info", async () => {
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`],
      TEST_ACTOR,
    );
    expect(result.success).toBe(true);
    expect(result.response).toContain("Agent Launched");
  });

  it("sets activeSessionMap for actorId after launch", async () => {
    activeSessionMap.clear();
    await handleLaunchCommand(["claude", `${HOME_DIR}/project`], TEST_ACTOR);
    expect(activeSessionMap.get(TEST_ACTOR)).toBeDefined();
  });

  it("handles launch failure", async () => {
    mockLauncher.launch.mockResolvedValueOnce({
      success: false,
      error: "tmux not found",
    });
    const result = await handleLaunchCommand(
      ["claude", `${HOME_DIR}/project`],
      TEST_ACTOR,
    );
    expect(result.success).toBe(false);
    expect(result.response).toContain("Launch failed");
  });
});

// ============================================================================
// handleSessionsCommand
// ============================================================================

describe("handleSessionsCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'No active sessions' when registry is empty", () => {
    mockRegistry.getActive.mockReturnValue([]);
    const result = handleSessionsCommand();
    expect(result.success).toBe(true);
    expect(result.response).toContain("No active sessions");
  });

  it("lists sessions when registry has sessions", () => {
    mockRegistry.getActive.mockReturnValue([makeSession()]);
    const result = handleSessionsCommand();
    expect(result.success).toBe(true);
    expect(result.response).toContain("bridge_123_abc");
  });
});

// ============================================================================
// handleSwitchCommand
// ============================================================================

describe("handleSwitchCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeSessionMap.clear();
  });

  it("shows current session when no args provided", () => {
    activeSessionMap.set(TEST_ACTOR, "bridge_999");
    const result = handleSwitchCommand([], TEST_ACTOR);
    expect(result.success).toBe(true);
    expect(result.response).toContain("bridge_999");
  });

  it("shows 'No active session' when no args and no active session", () => {
    activeSessionMap.delete(TEST_ACTOR);
    const result = handleSwitchCommand([], TEST_ACTOR);
    expect(result.success).toBe(true);
    expect(result.response).toContain("No active session");
  });

  it("switches to valid session", () => {
    mockRegistry.get.mockReturnValue(makeSession({ id: "bridge_new_abc" }));
    const result = handleSwitchCommand(["bridge_new_abc"], TEST_ACTOR);
    expect(result.success).toBe(true);
    expect(result.response).toContain("bridge_new_abc");
    expect(activeSessionMap.get(TEST_ACTOR)).toBe("bridge_new_abc");
  });

  it("returns error when session not found", () => {
    mockRegistry.get.mockReturnValue(null);
    const result = handleSwitchCommand(["nonexistent"], TEST_ACTOR);
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found");
  });
});

// ============================================================================
// handleModeCommand
// ============================================================================

describe("handleModeCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeSessionMap.clear();
  });

  it("returns error when no active session", () => {
    activeSessionMap.delete(TEST_ACTOR);
    mockRegistry.get.mockReturnValue(null);
    const result = handleModeCommand([], TEST_ACTOR);
    expect(result.success).toBe(false);
    expect(result.response).toContain("No active session");
  });

  it("shows current mode when no args provided", () => {
    const session = makeSession({ riskMode: "read" });
    activeSessionMap.set(TEST_ACTOR, session.id);
    mockRegistry.get.mockReturnValue(session);
    const result = handleModeCommand([], TEST_ACTOR);
    expect(result.success).toBe(true);
    expect(result.response).toContain("READ");
  });

  it("transitions from read to patch", () => {
    const session = makeSession({ riskMode: "read" });
    activeSessionMap.set(TEST_ACTOR, session.id);
    mockRegistry.get.mockReturnValue(session);
    const result = handleModeCommand(["patch"], TEST_ACTOR);
    expect(result.success).toBe(true);
    expect(result.response).toContain("READ");
    expect(result.response).toContain("PATCH");
  });

  it("returns error for unknown mode", () => {
    const session = makeSession({ riskMode: "read" });
    activeSessionMap.set(TEST_ACTOR, session.id);
    mockRegistry.get.mockReturnValue(session);
    const result = handleModeCommand(["unknown"], TEST_ACTOR);
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown mode");
  });
});

// ============================================================================
// handleWebhookCommand
// ============================================================================

describe("handleWebhookCommand", () => {
  it("shows webhook status when no args", () => {
    const result = handleWebhookCommand([], false);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Webhook");
  });

  it("shows INACTIVE when isWebhookActive=false", () => {
    const result = handleWebhookCommand([], false);
    expect(result.response).toContain("INACTIVE");
  });

  it("shows ACTIVE when isWebhookActive=true", () => {
    const result = handleWebhookCommand([], true);
    expect(result.response).toContain("ACTIVE");
  });

  it("returns info about HTTPS config for 'on' action", () => {
    const result = handleWebhookCommand(["on"], false);
    expect(result.success).toBe(true);
    expect(result.response).toContain("HTTPS");
  });

  it("returns 'will be disabled' for 'off' action", () => {
    const result = handleWebhookCommand(["off"], true);
    expect(result.success).toBe(true);
    expect(result.response).toContain("disabled");
  });

  it("returns error for unknown webhook action", () => {
    const result = handleWebhookCommand(["unknown"], false);
    expect(result.success).toBe(false);
    expect(result.response).toContain("Unknown webhook action");
  });
});
