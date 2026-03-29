/**
 * Tests for eval command handler.
 *
 * @module tests/commands/handlers/eval-commands
 * @sprint 120 — Track A2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/bridge/session-registry.js", () => ({
  getSessionRegistry: vi.fn(),
}));

vi.mock("../../../src/commands/handlers/ott-commands.js", () => ({
  runEvaluation: vi.fn(),
  getTurnCount: vi.fn(),
}));

import { handleEvalCommand } from "../../../src/commands/handlers/eval-commands.js";
import { getSessionRegistry } from "../../../src/bridge/session-registry.js";
import { runEvaluation, getTurnCount } from "../../../src/commands/handlers/ott-commands.js";

const mockRegistry = {
  get: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionRegistry).mockReturnValue(mockRegistry as never);
  vi.mocked(getTurnCount).mockReturnValue(1);
});

describe("handleEvalCommand", () => {
  it("returns usage message when no args", async () => {
    const result = await handleEvalCommand([], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage: /eval");
  });

  it("returns not found for unknown session ID", async () => {
    mockRegistry.get.mockReturnValue(undefined);
    const result = await handleEvalCommand(["unknown-sess"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found or inactive");
  });

  it("returns not found for inactive session", async () => {
    mockRegistry.get.mockReturnValue({ id: "sess-1", status: "stopped" });
    const result = await handleEvalCommand(["sess-1"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("not found or inactive");
  });

  it("returns no evaluatable output when runEvaluation returns null", async () => {
    mockRegistry.get.mockReturnValue({
      id: "sess-2",
      status: "active",
      tmuxTarget: "target-2",
      riskMode: "PATCH",
      agentType: "claude-code",
    });
    vi.mocked(runEvaluation).mockResolvedValue(null as never);

    const result = await handleEvalCommand(["sess-2"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("No evaluatable output");
  });

  it("returns formatted score card on success", async () => {
    mockRegistry.get.mockReturnValue({
      id: "sess-3",
      status: "active",
      tmuxTarget: "target-3",
      riskMode: "PATCH",
      agentType: "claude-code",
    });
    vi.mocked(runEvaluation).mockResolvedValue("Score: 8.5/10\nQuality: High");

    const result = await handleEvalCommand(["sess-3"], "user1");
    expect(result.success).toBe(true);
    expect(result.response).toContain("Evaluation");
    expect(result.response).toContain("sess-3");
    expect(result.response).toContain("Score: 8.5/10");
  });

  it("returns error when runEvaluation throws", async () => {
    mockRegistry.get.mockReturnValue({
      id: "sess-4",
      status: "active",
      tmuxTarget: "target-4",
      riskMode: "PATCH",
      agentType: "claude-code",
    });
    vi.mocked(runEvaluation).mockRejectedValue(new Error("tmux capture failed"));

    const result = await handleEvalCommand(["sess-4"], "user1");
    expect(result.success).toBe(false);
    expect(result.response).toContain("Evaluation failed");
    expect(result.response).toContain("tmux capture failed");
  });

  it("truncates session ID to 40 chars in error messages", async () => {
    const longId = "a".repeat(60);
    mockRegistry.get.mockReturnValue(undefined);
    const result = await handleEvalCommand([longId], "user1");
    // sanitizeForEcho slices sessionId to 40 chars first
    expect(result.response).not.toContain("a".repeat(60));
  });
});
