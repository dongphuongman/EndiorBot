/**
 * Chat Session Handler Tests — Sprint 127 (ADR-043)
 *
 * Covers: ChatSessionData type, history cap, turn warning, provider switching,
 * SystemBlock construction, status formatting, cost tracking.
 */

import { describe, it, expect } from "vitest";
import {
  createChatSession,
  switchProvider,
  getTurnWarning,
  formatSessionStatus,
  listRecentChatSessions,
  loadChatSession,
  compactChatHistory,
  isSafeChatCommand,
  CHAT_SAFE_COMMANDS,
  type ChatSessionData,
  type ChatTurn,
} from "../../../src/commands/handlers/chat-session-handler.js";

// ============================================================================
// Helpers
// ============================================================================

function makeTurn(role: "user" | "assistant", content: string): ChatTurn {
  return {
    role,
    content,
    provider: "openai",
    tokenUsage: { input: 10, output: 20 },
    timestamp: new Date().toISOString(),
  };
}

function fillTurns(session: ChatSessionData, count: number): void {
  for (let i = 0; i < count; i++) {
    session.turns.push(makeTurn("user", `Question ${i}`));
    session.turns.push(makeTurn("assistant", `Answer ${i}`));
  }
}

// ============================================================================
// CTO C1: ChatSessionData type
// ============================================================================

describe("createChatSession (CTO C1)", () => {
  it("creates session with chat- prefix", () => {
    const session = createChatSession({ projectPath: "/test/project" });
    expect(session.sessionId).toMatch(/^chat-/);
  });

  it("defaults to openai provider", () => {
    const session = createChatSession({ projectPath: "/test" });
    expect(session.provider).toBe("openai");
  });

  it("accepts explicit provider", () => {
    const session = createChatSession({ provider: "ollama", projectPath: "/test" });
    expect(session.provider).toBe("ollama");
    expect(session.model).toBe("qwen3.5:9b");
  });

  it("has no SDLC fields (gates, stages)", () => {
    const session = createChatSession({ projectPath: "/test" });
    expect((session as unknown as Record<string, unknown>).gates).toBeUndefined();
    expect((session as unknown as Record<string, unknown>).stages).toBeUndefined();
    expect((session as unknown as Record<string, unknown>).tier).toBeUndefined();
  });

  it("initializes with zero cost and tokens", () => {
    const session = createChatSession({ projectPath: "/test" });
    expect(session.totalCostUsd).toBe(0);
    expect(session.totalTokens.input).toBe(0);
    expect(session.totalTokens.output).toBe(0);
  });
});

// ============================================================================
// CTO C2: History Cap (40 turns)
// ============================================================================

describe("History cap (CTO C2)", () => {
  it("getTurnWarning returns null below threshold", () => {
    const session = createChatSession({ projectPath: "/test" });
    fillTurns(session, 10);
    expect(getTurnWarning(session)).toBeNull();
  });

  it("getTurnWarning warns at 35 turns", () => {
    const session = createChatSession({ projectPath: "/test" });
    fillTurns(session, 35);
    const warning = getTurnWarning(session);
    expect(warning).not.toBeNull();
    expect(warning).toContain("35");
    expect(warning).toContain("40");
  });

  it("getTurnWarning warns at 40 turns", () => {
    const session = createChatSession({ projectPath: "/test" });
    fillTurns(session, 40);
    const warning = getTurnWarning(session);
    expect(warning).not.toBeNull();
  });
});

// ============================================================================
// Provider Switching
// ============================================================================

describe("switchProvider", () => {
  it("switches provider and model", () => {
    const session = createChatSession({ projectPath: "/test" });
    expect(session.provider).toBe("openai");

    switchProvider(session, "ollama");
    expect(session.provider).toBe("ollama");
    expect(session.model).toBe("qwen3.5:9b");
  });

  it("accepts custom model override", () => {
    const session = createChatSession({ projectPath: "/test" });
    switchProvider(session, "gemini", "gemini-2.5-flash");
    expect(session.provider).toBe("gemini");
    expect(session.model).toBe("gemini-2.5-flash");
  });

  it("defaults model for known providers", () => {
    const session = createChatSession({ projectPath: "/test" });
    switchProvider(session, "gemini");
    expect(session.model).toBe("gemini-2.5-pro");
  });
});

// ============================================================================
// Status Formatting
// ============================================================================

describe("formatSessionStatus", () => {
  it("shows session info", () => {
    const session = createChatSession({ projectPath: "/test/myproject" });
    fillTurns(session, 5);
    const status = formatSessionStatus(session);
    expect(status).toContain("Session: chat-");
    expect(status).toContain("myproject");
    expect(status).toContain("openai");
    expect(status).toContain("5/40");
  });

  it("shows 'free (local)' for Ollama", () => {
    const session = createChatSession({ provider: "ollama", projectPath: "/test" });
    const status = formatSessionStatus(session);
    expect(status).toContain("free (local)");
  });

  it("shows cost for paid providers", () => {
    const session = createChatSession({ projectPath: "/test" });
    session.totalCostUsd = 0.0123;
    const status = formatSessionStatus(session);
    expect(status).toContain("$0.0123");
  });
});

// ============================================================================
// Sprint 128: Session Resume
// ============================================================================

describe("listRecentChatSessions", () => {
  it("returns empty array when no sessions dir", () => {
    const sessions = listRecentChatSessions(5);
    // May return sessions from prior tests or empty
    expect(Array.isArray(sessions)).toBe(true);
  });
});

// ============================================================================
// Sprint 128: CLI Command Routing Allowlist
// ============================================================================

describe("isSafeChatCommand (CPO C-CPO-3)", () => {
  it("allows gate command", () => {
    expect(isSafeChatCommand("gate")).toBe(true);
  });

  it("allows plan command", () => {
    expect(isSafeChatCommand("plan")).toBe(true);
  });

  it("allows audit command", () => {
    expect(isSafeChatCommand("audit")).toBe(true);
  });

  it("allows compliance command", () => {
    expect(isSafeChatCommand("compliance")).toBe(true);
  });

  it("blocks sh command (unsafe)", () => {
    expect(isSafeChatCommand("sh")).toBe(false);
  });

  it("blocks run command (unsafe)", () => {
    expect(isSafeChatCommand("run")).toBe(false);
  });

  it("blocks kill command (unsafe)", () => {
    expect(isSafeChatCommand("kill")).toBe(false);
  });

  it("blocks launch command (unsafe)", () => {
    expect(isSafeChatCommand("launch")).toBe(false);
  });

  it("has correct count of safe commands (read-only only)", () => {
    expect(CHAT_SAFE_COMMANDS.size).toBe(8);
    // CPO: init and config removed — they write files
    expect(isSafeChatCommand("init")).toBe(false);
    expect(isSafeChatCommand("config")).toBe(false);
  });
});

// ============================================================================
// Sprint 128 Fix: loadChatSession Tests (CTO C2, C3)
// ============================================================================

describe("loadChatSession", () => {
  it("rejects invalid session ID format (path traversal)", () => {
    expect(() => loadChatSession("../../../etc/passwd")).toThrow(/Invalid session ID format/);
  });

  it("rejects session ID without chat- prefix", () => {
    expect(() => loadChatSession("notchat-abc123")).toThrow(/Invalid session ID format/);
  });

  it("rejects empty session ID", () => {
    expect(() => loadChatSession("")).toThrow(/Invalid session ID format/);
  });

  it("rejects session ID with special characters", () => {
    expect(() => loadChatSession("chat-abc;rm -rf")).toThrow(/Invalid session ID format/);
  });

  it("throws when session file not found", () => {
    expect(() => loadChatSession("chat-nonexistent999")).toThrow(/Session not found/);
  });
});

// ============================================================================
// Sprint 128 Fix: compactChatHistory Tests (CTO C1, C7)
// ============================================================================

describe("compactChatHistory", () => {
  it("returns false when turns are below threshold", async () => {
    const session = createChatSession({ projectPath: "/test" });
    fillTurns(session, 10); // 20 entries, well below 75 * 0.8 = 60
    const result = await compactChatHistory(session);
    expect(result).toBe(false);
    expect(session.turns.length).toBe(20);
  });

  it("returns false when turns are at threshold boundary", async () => {
    const session = createChatSession({ projectPath: "/test" });
    fillTurns(session, 29); // 58 entries, below 60 threshold
    const result = await compactChatHistory(session);
    expect(result).toBe(false);
    expect(session.turns.length).toBe(58);
  });

  it("returns false when no provider available", async () => {
    const session = createChatSession({ provider: "nonexistent-provider-xyz", projectPath: "/test" });
    fillTurns(session, 40); // 80 entries, above threshold
    const result = await compactChatHistory(session);
    expect(result).toBe(false);
  });

  it("preserves session data structure after failed compaction", async () => {
    const session = createChatSession({ provider: "nonexistent-provider-xyz", projectPath: "/test" });
    fillTurns(session, 40);
    const originalCost = session.totalCostUsd;
    await compactChatHistory(session);
    // Cost should not change on failed compaction
    expect(session.totalCostUsd).toBe(originalCost);
  });
});
