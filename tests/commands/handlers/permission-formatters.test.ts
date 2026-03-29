/**
 * Tests for permission message formatters.
 *
 * @module tests/commands/handlers/permission-formatters
 * @sprint 120 — Track A3
 */

import { describe, it, expect, vi } from "vitest";

// Mock the keyboard module (it imports Telegram SDK types)
vi.mock("../../../src/channels/telegram/keyboards.js", () => ({
  createPermissionKeyboard: (id: string) => ({
    inline_keyboard: [[{ text: "Approve", callback_data: `perm_approve_${id}` }]],
  }),
}));

import {
  formatPermissionMessage,
  formatPermissionDecisionMessage,
  formatPermissionTimeoutMessage,
} from "../../../src/commands/handlers/permission-formatters.js";

import type { PermissionRequest } from "../../../src/bridge/types.js";

function makeRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "perm_12345_abc",
    sessionId: "sess-001",
    tmuxTarget: "endiorbot-sess-001",
    agentType: "claude-code",
    toolName: "Edit",
    riskMode: "PATCH",
    nonce: "nonce-123",
    createdAt: "2026-03-26T00:00:00Z",
    expiresAt: "2026-03-26T00:05:00Z",
    ...overrides,
  };
}

describe("formatPermissionMessage", () => {
  it("includes session ID, tool name, and risk mode", () => {
    const req = makeRequest();
    const { text } = formatPermissionMessage(req);
    expect(text).toContain("sess-001");
    expect(text).toContain("Edit");
    expect(text).toContain("PATCH");
  });

  it("includes file path when provided", () => {
    const req = makeRequest({ filePath: "/src/index.ts" });
    const { text } = formatPermissionMessage(req);
    expect(text).toContain("/src/index.ts");
  });

  it("omits file info when no file path", () => {
    const req = makeRequest();
    const { text } = formatPermissionMessage(req);
    expect(text).not.toContain("File:");
  });

  it("returns keyboard with correct permission ID", () => {
    const req = makeRequest({ id: "perm_99_xyz" });
    const { keyboard } = formatPermissionMessage(req);
    expect(keyboard.inline_keyboard[0][0].callback_data).toContain("perm_99_xyz");
  });

  it("truncates long file paths to 60 chars via sanitizeForEcho", () => {
    const longPath = "/very/long/path/" + "x".repeat(100) + "/file.ts";
    const req = makeRequest({ filePath: longPath });
    const { text } = formatPermissionMessage(req);
    // The path is sliced to 60 chars before sanitizeForEcho truncates to 80
    // so it should not contain the full 100 x's
    expect(text).not.toContain("x".repeat(100));
  });
});

describe("formatPermissionDecisionMessage", () => {
  it("shows checkmark icon for approve", () => {
    const msg = formatPermissionDecisionMessage("perm_1", "approve", "Bash");
    expect(msg).toContain("✅");
    expect(msg).toContain("Approved");
  });

  it("shows X icon for deny", () => {
    const msg = formatPermissionDecisionMessage("perm_1", "deny", "Bash");
    expect(msg).toContain("❌");
    expect(msg).toContain("Denied");
  });

  it("shows clock icon for unknown decision (timeout)", () => {
    const msg = formatPermissionDecisionMessage("perm_1", "timeout", "Edit");
    expect(msg).toContain("⏰");
    expect(msg).toContain("Timed out");
  });

  it("includes tool name and permission ID", () => {
    const msg = formatPermissionDecisionMessage("perm_abc", "approve", "Write");
    expect(msg).toContain("Write");
    expect(msg).toContain("perm_abc");
  });
});

describe("formatPermissionTimeoutMessage", () => {
  it("includes tool name and session ID", () => {
    const req = makeRequest({ toolName: "Bash", sessionId: "sess-timeout" });
    const msg = formatPermissionTimeoutMessage(req);
    expect(msg).toContain("Bash");
    expect(msg).toContain("sess-timeout");
  });

  it("contains timed out label", () => {
    const req = makeRequest();
    const msg = formatPermissionTimeoutMessage(req);
    expect(msg).toContain("timed out");
  });
});
