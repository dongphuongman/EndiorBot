/**
 * Tests for Turn-time Context Builder — Sprint 86 (ADR-024 §8.5)
 *
 * Covers: context building, active project loading, prefix cap, format.
 *
 * @module tests/bridge/intelligence/turn-context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockLoadActiveProject = vi.fn();

vi.mock("../../../src/config/paths.js", () => ({
  loadActiveProject: () => mockLoadActiveProject(),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  buildTurnContext,
  loadTurnContextFromActive,
  TURN_CONTEXT_MAX_CHARS,
  incrementTurnCount,
  shouldRefreshContext,
  resetTurnCount,
  resetAllTurnCounts,
  REFRESH_INTERVAL,
} from "../../../src/bridge/intelligence/turn-context.js";

// ============================================================================
// Tests
// ============================================================================

describe("buildTurnContext", () => {
  it("returns empty string when no data provided", () => {
    expect(buildTurnContext()).toBe("");
    expect(buildTurnContext(undefined)).toBe("");
  });

  it("builds context with all fields", () => {
    const result = buildTurnContext({
      sprint: "86 — /send Command",
      blockers: "none",
      task: "implement handleSendCommand",
    });

    expect(result).toContain("[EndiorBot Context]");
    expect(result).toContain("Sprint: 86 — /send Command");
    expect(result).toContain("Blockers: none");
    expect(result).toContain("Task: implement handleSendCommand");
    expect(result).toContain("[End Context]");
  });

  it("uses defaults for missing fields", () => {
    const result = buildTurnContext({});

    expect(result).toContain("Sprint: unknown");
    expect(result).toContain("Blockers: none");
    expect(result).toContain("Task: none");
  });

  it("handles partial fields", () => {
    const result = buildTurnContext({ sprint: "86" });

    expect(result).toContain("Sprint: 86");
    expect(result).toContain("Blockers: none");
    expect(result).toContain("Task: none");
  });

  it("caps output at TURN_CONTEXT_MAX_CHARS", () => {
    const longTask = "x".repeat(3000);
    const result = buildTurnContext({ sprint: "86", task: longTask });

    expect(result.length).toBeLessThanOrEqual(TURN_CONTEXT_MAX_CHARS);
  });

  it("ends with a trailing newline", () => {
    const result = buildTurnContext({ sprint: "86" });
    expect(result.endsWith("\n")).toBe(true);
  });
});

describe("loadTurnContextFromActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty object when no active project", () => {
    mockLoadActiveProject.mockReturnValue(undefined);
    const result = loadTurnContextFromActive();
    expect(result).toEqual({});
  });

  it("maps active project name to sprint", () => {
    mockLoadActiveProject.mockReturnValue({
      name: "EndiorBot",
      path: "/tmp/project",
      tier: "STANDARD",
      startedAt: Date.now(),
    });

    const result = loadTurnContextFromActive();
    expect(result.sprint).toBe("EndiorBot");
  });

  it("returns empty object on load error", () => {
    mockLoadActiveProject.mockImplementation(() => {
      throw new Error("file corrupted");
    });

    const result = loadTurnContextFromActive();
    expect(result).toEqual({});
  });
});

describe("TURN_CONTEXT_MAX_CHARS", () => {
  it("is 2048", () => {
    expect(TURN_CONTEXT_MAX_CHARS).toBe(2048);
  });
});

// ============================================================================
// Sprint 87: Turn Counter
// ============================================================================

describe("Turn Counter (Sprint 87)", () => {
  beforeEach(() => {
    resetAllTurnCounts();
  });

  it("REFRESH_INTERVAL is 10", () => {
    expect(REFRESH_INTERVAL).toBe(10);
  });

  it("incrementTurnCount starts at 1", () => {
    expect(incrementTurnCount("session_1")).toBe(1);
  });

  it("incrementTurnCount increments each call", () => {
    expect(incrementTurnCount("session_1")).toBe(1);
    expect(incrementTurnCount("session_1")).toBe(2);
    expect(incrementTurnCount("session_1")).toBe(3);
  });

  it("tracks counters independently per session", () => {
    incrementTurnCount("session_a");
    incrementTurnCount("session_a");
    incrementTurnCount("session_b");

    expect(incrementTurnCount("session_a")).toBe(3);
    expect(incrementTurnCount("session_b")).toBe(2);
  });

  it("shouldRefreshContext returns false before 10th turn", () => {
    for (let i = 0; i < 9; i++) {
      incrementTurnCount("session_1");
    }
    expect(shouldRefreshContext("session_1")).toBe(false);
  });

  it("shouldRefreshContext returns true at 10th turn", () => {
    for (let i = 0; i < 10; i++) {
      incrementTurnCount("session_1");
    }
    expect(shouldRefreshContext("session_1")).toBe(true);
  });

  it("shouldRefreshContext returns true at 20th turn", () => {
    for (let i = 0; i < 20; i++) {
      incrementTurnCount("session_1");
    }
    expect(shouldRefreshContext("session_1")).toBe(true);
  });

  it("shouldRefreshContext returns false for unknown session", () => {
    expect(shouldRefreshContext("nonexistent")).toBe(false);
  });

  it("resetTurnCount clears counter for a session", () => {
    incrementTurnCount("session_1");
    incrementTurnCount("session_1");
    resetTurnCount("session_1");

    expect(incrementTurnCount("session_1")).toBe(1);
  });

  it("resetAllTurnCounts clears all counters", () => {
    incrementTurnCount("session_a");
    incrementTurnCount("session_b");
    resetAllTurnCounts();

    expect(incrementTurnCount("session_a")).toBe(1);
    expect(incrementTurnCount("session_b")).toBe(1);
  });
});
