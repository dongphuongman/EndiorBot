/**
 * Zalo Commands Tests
 *
 * Tests for Zalo slash command handling: dispatch, stripMarkdown,
 * help message, and all 12 supported commands.
 *
 * Sprint 77 — ADR-020: OTT Channel Completion
 *
 * @module tests/channels/zalo/zalo-commands
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 77
 * @authority ADR-020 OTT Channel Completion
 * @stage 05 - TEST
 * @sdlc SDLC Framework 6.1.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleZaloCommand,
  stripMarkdown,
  generateZaloHelpMessage,
} from "../../../src/channels/zalo/zalo-commands.js";

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock team-registry (required by handleTeamsCommand)
vi.mock("../../../src/agents/orchestrator/team-registry.js", () => ({
  getTeamRegistry: vi.fn(() => ({
    getTeam: vi.fn((id: string) => ({
      found: true,
      team: { id, leader: "pm", isActive: true },
    })),
    getAllTeams: vi.fn(() => []),
    getTeamForAgent: vi.fn(),
    getTier: vi.fn(() => "STANDARD"),
  })),
}));

// Mock keyboards (required by handleAgentsCommand)
vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  getAgentIcon: vi.fn((agent: string) => {
    const icons: Record<string, string> = {
      researcher: "🔍", pm: "📋", pjm: "📊", architect: "🏗️",
      coder: "💻", reviewer: "👁️", tester: "🧪", devops: "🚀",
      fullstack: "🛠️", ceo: "👔", cpo: "🎯", cto: "⚙️",
    };
    return icons[agent] ?? "🤖";
  }),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createSendFn(): { sendFn: (msg: string) => Promise<boolean>; messages: string[] } {
  const messages: string[] = [];
  const sendFn = vi.fn(async (msg: string): Promise<boolean> => {
    messages.push(msg);
    return true;
  });
  return { sendFn, messages };
}

// ============================================================================
// stripMarkdown Tests
// ============================================================================

describe("stripMarkdown", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should remove bold formatting", () => {
    expect(stripMarkdown("*bold text*")).toBe("bold text");
  });

  it("should remove double-star bold formatting", () => {
    expect(stripMarkdown("**bold text**")).toBe("bold text");
  });

  it("should handle fenced code blocks", () => {
    expect(stripMarkdown("```\ncode line\n```")).toBe("code line\n");
  });

  it("should strip language hint from fenced code blocks", () => {
    expect(stripMarkdown("```typescript\nconst x = 1;\n```")).toBe("const x = 1;\n");
  });

  it("should remove italic formatting", () => {
    expect(stripMarkdown("_italic text_")).toBe("italic text");
  });

  it("should remove inline code formatting", () => {
    expect(stripMarkdown("`code here`")).toBe("code here");
  });

  it("should remove link formatting", () => {
    expect(stripMarkdown("[link text](https://example.com)")).toBe("link text");
  });

  it("should unescape special characters", () => {
    expect(stripMarkdown("\\#heading")).toBe("#heading");
    expect(stripMarkdown("a \\> b")).toBe("a > b");
    expect(stripMarkdown("100\\!")).toBe("100!");
  });

  it("should handle mixed formatting", () => {
    const input = "*bold* and _italic_ and `code` and [link](url)";
    const expected = "bold and italic and code and link";
    expect(stripMarkdown(input)).toBe(expected);
  });

  it("should handle text with no formatting", () => {
    expect(stripMarkdown("plain text")).toBe("plain text");
  });

  it("should handle empty string", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("should handle nested formatting patterns", () => {
    expect(stripMarkdown("*Available Agents*")).toBe("Available Agents");
  });

  it("should handle multiline text", () => {
    const input = "*Title*\n`code`\n_italic_";
    const expected = "Title\ncode\nitalic";
    expect(stripMarkdown(input)).toBe(expected);
  });
});

// ============================================================================
// generateZaloHelpMessage Tests
// ============================================================================

describe("generateZaloHelpMessage", () => {
  it("should return plain text (no Markdown)", () => {
    const help = generateZaloHelpMessage();
    // No bold *text* or italic _text_ or code `text`
    expect(help).not.toMatch(/\*[A-Za-z][^*]+\*/);
    expect(help).not.toContain("`");
    // No Markdown links [text](url) — plain [] in usage syntax is OK
    expect(help).not.toMatch(/\[[^\]]+\]\([^)]+\)/);
  });

  it("should list all 12 supported commands", () => {
    const help = generateZaloHelpMessage();
    const commands = [
      "/approve", "/reject", "/status",
      "/gate", "/compliance", "/fix", "/init",
      "/consult", "/agents", "/teams",
      "/config", "/help",
    ];
    for (const cmd of commands) {
      expect(help).toContain(cmd);
    }
  });

  it("should mention Telegram-only commands", () => {
    const help = generateZaloHelpMessage();
    expect(help).toContain("/mode");
    expect(help).toContain("/webhook");
    expect(help).toContain("Telegram-only");
  });

  it("should include agent mention usage", () => {
    const help = generateZaloHelpMessage();
    expect(help).toContain("@agent task");
  });

  it("should include team mention usage", () => {
    const help = generateZaloHelpMessage();
    expect(help).toContain("@team task");
  });
});

// ============================================================================
// handleZaloCommand Tests — Command Dispatch
// ============================================================================

describe("handleZaloCommand", () => {
  let sendFn: (msg: string) => Promise<boolean>;
  let messages: string[];

  beforeEach(() => {
    const result = createSendFn();
    sendFn = result.sendFn;
    messages = result.messages;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // /help
  // ========================================================================

  describe("/help", () => {
    it("should return plain text command list", async () => {
      const handled = await handleZaloCommand("/help", sendFn);
      expect(handled).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("EndiorBot Commands");
      // Should not have Markdown
      expect(messages[0]).not.toMatch(/\*[^*]+\*/);
    });
  });

  // ========================================================================
  // /agents
  // ========================================================================

  describe("/agents", () => {
    it("should return agent list without Markdown", async () => {
      const handled = await handleZaloCommand("/agents", sendFn);
      expect(handled).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("Available Agents");
      // No bold Markdown
      expect(messages[0]).not.toContain("*Available Agents*");
    });

    it("should include agent icons", async () => {
      await handleZaloCommand("/agents", sendFn);
      expect(messages[0]).toContain("@researcher");
      expect(messages[0]).toContain("@pm");
    });
  });

  // ========================================================================
  // /teams
  // ========================================================================

  describe("/teams", () => {
    it("should return team list without Markdown", async () => {
      const handled = await handleZaloCommand("/teams", sendFn);
      expect(handled).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("Available Teams");
      expect(messages[0]).not.toContain("*Available Teams*");
    });
  });

  // ========================================================================
  // /gate
  // ========================================================================

  describe("/gate", () => {
    it("should show gate help when no args", async () => {
      const handled = await handleZaloCommand("/gate", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Quality Gates");
    });

    it("should show gate info for specific gate", async () => {
      const handled = await handleZaloCommand("/gate G2", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Gate G2");
    });

    it("should strip Markdown from gate response", async () => {
      await handleZaloCommand("/gate", sendFn);
      // No inline code backticks
      expect(messages[0]).not.toContain("`");
    });
  });

  // ========================================================================
  // /compliance
  // ========================================================================

  describe("/compliance", () => {
    it("should show compliance info", async () => {
      const handled = await handleZaloCommand("/compliance", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Compliance");
    });

    it("should handle subcommand", async () => {
      const handled = await handleZaloCommand("/compliance score", sendFn);
      expect(handled).toBe(true);
    });
  });

  // ========================================================================
  // /fix
  // ========================================================================

  describe("/fix", () => {
    it("should show fix preview (dry-run default)", async () => {
      const handled = await handleZaloCommand("/fix", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Compliance Fix");
      expect(messages[0]).toContain("dry-run");
    });

    it("should handle --yes flag", async () => {
      const handled = await handleZaloCommand("/fix --yes", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("live");
    });

    it("should handle --stage flag with sanitized output", async () => {
      const handled = await handleZaloCommand("/fix --stage 01-planning", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Stage");
    });
  });

  // ========================================================================
  // /consult
  // ========================================================================

  describe("/consult", () => {
    it("should show help when no query", async () => {
      const handled = await handleZaloCommand("/consult", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Consultation");
    });

    it("should handle query", async () => {
      const handled = await handleZaloCommand("/consult Redis vs PostgreSQL", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Consultation");
    });

    it("should sanitize query in response", async () => {
      await handleZaloCommand('/consult <script>alert("xss")</script>', sendFn);
      // sanitizeForEcho strips special chars, then stripMarkdown handles remaining
      expect(messages[0]).not.toContain("<script>");
    });
  });

  // ========================================================================
  // /config
  // ========================================================================

  describe("/config", () => {
    it("should show config info", async () => {
      const handled = await handleZaloCommand("/config", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Project Config");
    });
  });

  // ========================================================================
  // /init
  // ========================================================================

  describe("/init", () => {
    it("should show workspace-required message when no workspace", async () => {
      const handled = await handleZaloCommand("/init", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toMatch(/focus|workspace/i);
    });
  });

  // ========================================================================
  // /approve (Zalo OTT handler)
  // ========================================================================

  describe("/approve", () => {
    it("should show usage when no id", async () => {
      const handled = await handleZaloCommand("/approve", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Usage: /approve <id>");
    });

    it("should direct user to Telegram/CLI for approval", async () => {
      const handled = await handleZaloCommand("/approve test123", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("test123");
      expect(messages[0]).toContain("Telegram");
      expect(messages[0]).toContain("CLI");
    });

    it("should sanitize malicious id (P1-1)", async () => {
      // args splits by whitespace: args[0] = 'abc";' — only id is used
      // sanitizeForEcho strips Markdown chars and truncates to 50 chars
      await handleZaloCommand('/approve abc*`[test](http://evil)rm', sendFn);
      // Markdown special chars stripped by sanitizeForEcho
      expect(messages[0]).not.toContain("*");
      expect(messages[0]).not.toContain("`");
      expect(messages[0]).not.toContain("[test]");
      expect(messages[0]).not.toContain("(http://evil)");
    });
  });

  // ========================================================================
  // /reject (Zalo OTT handler)
  // ========================================================================

  describe("/reject", () => {
    it("should show usage when no id", async () => {
      const handled = await handleZaloCommand("/reject", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Usage: /reject <id>");
    });

    it("should direct user to Telegram/CLI for rejection", async () => {
      const handled = await handleZaloCommand("/reject test123 bad quality", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("test123");
      expect(messages[0]).toContain("bad quality");
      expect(messages[0]).toContain("Telegram");
    });
  });

  // ========================================================================
  // /status (Zalo OTT handler)
  // ========================================================================

  describe("/status", () => {
    it("should direct user to Telegram/CLI for status", async () => {
      const handled = await handleZaloCommand("/status", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("Telegram");
      expect(messages[0]).toContain("CLI");
      expect(messages[0]).toContain("READ-only");
    });
  });

  // ========================================================================
  // Unknown Commands
  // ========================================================================

  describe("unknown commands", () => {
    it("should return false for unknown command", async () => {
      const handled = await handleZaloCommand("/unknown", sendFn);
      expect(handled).toBe(false);
      expect(messages).toHaveLength(0);
    });

    it("should return false for /mode (Telegram-only)", async () => {
      const handled = await handleZaloCommand("/mode read", sendFn);
      expect(handled).toBe(false);
    });

    it("should return false for /webhook (Telegram-only)", async () => {
      const handled = await handleZaloCommand("/webhook on", sendFn);
      expect(handled).toBe(false);
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe("edge cases", () => {
    it("should handle case-insensitive commands", async () => {
      const handled = await handleZaloCommand("/HELP", sendFn);
      expect(handled).toBe(true);
      expect(messages[0]).toContain("EndiorBot Commands");
    });

    it("should handle extra whitespace", async () => {
      const handled = await handleZaloCommand("  /help  ", sendFn);
      expect(handled).toBe(true);
    });

    it("should not have Markdown in any response", async () => {
      const commands = [
        "/help", "/agents", "/teams", "/gate", "/gate G2",
        "/compliance", "/fix", "/consult query", "/config", "/init",
        "/approve", "/reject", "/status",
      ];

      for (const cmd of commands) {
        const result = createSendFn();
        await handleZaloCommand(cmd, result.sendFn);
        if (result.messages.length > 0) {
          // Check no bold Markdown *text*
          expect(result.messages[0]).not.toMatch(/\*[A-Za-z][^*]+\*/);
          // Check no inline code backticks
          expect(result.messages[0]).not.toMatch(/`[^`]+`/);
        }
      }
    });
  });
});

// ============================================================================
// Command Dispatch Integration (via createZaloAgentHandler)
// ============================================================================

describe("createZaloAgentHandler command dispatch", () => {
  // This is tested implicitly through handleZaloCommand above.
  // Full integration with createZaloAgentHandler is in zalo-agent-handler.test.ts.
  // Here we verify the dispatch contract.

  it("should handle 12 commands and return true", async () => {
    const commands = [
      "/help", "/agents", "/teams", "/gate", "/compliance",
      "/fix", "/consult", "/config", "/init",
      "/approve", "/reject", "/status",
    ];

    for (const cmd of commands) {
      const { sendFn } = createSendFn();
      const handled = await handleZaloCommand(cmd, sendFn);
      expect(handled).toBe(true);
    }
  });

  it("should return false for excluded commands", async () => {
    const excluded = ["/mode", "/webhook", "/unknown", "/foo"];
    for (const cmd of excluded) {
      const { sendFn } = createSendFn();
      const handled = await handleZaloCommand(cmd, sendFn);
      expect(handled).toBe(false);
    }
  });
});
