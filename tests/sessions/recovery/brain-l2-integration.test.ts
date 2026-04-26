/**
 * Sprint 143 A1 — Brain L2 Pattern Matching Integration Tests
 *
 * CPO requirement: prove that patternHint flows from RecoveryEngine
 * through RecoveryResult to the actual retry prompt.
 *
 * Tests:
 *   1. findMatchingPattern returns pattern when signature matches + count ≥ 2
 *   2. findMatchingPattern returns null for one-off patterns (count < 2)
 *   3. patternHint populated in RecoveryResult for RETRY action
 *   4. patternHint populated in RecoveryResult for FIX action
 *   5. patternHint is null when no pattern matches
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Brain L2 patterns
vi.mock("../../../src/brain/layers/patterns.js", () => ({
  getPatternsByType: vi.fn((type: string) => {
    if (type === "error") {
      return [
        {
          id: "p1",
          signature: "ECONNREFUSED",
          type: "error",
          fixHint: "Check if the target service is running. Retry after 5s.",
          count: 5,
          firstSeen: "2026-04-01",
          lastSeen: "2026-04-26",
        },
        {
          id: "p2",
          signature: "MODULE_NOT_FOUND",
          type: "error",
          fixHint: "Run npm install to restore missing dependencies.",
          count: 3,
          firstSeen: "2026-04-10",
          lastSeen: "2026-04-25",
        },
        {
          id: "p3",
          signature: "one-off-error",
          type: "error",
          fixHint: "This was a one-time thing.",
          count: 1, // Below threshold — should NOT match
          firstSeen: "2026-04-26",
          lastSeen: "2026-04-26",
        },
      ];
    }
    return [];
  }),
}));

vi.mock("../../../src/brain/types.js", () => ({}));

// Mock logging
vi.mock("../../../src/logging/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { RecoveryEngine } from "../../../src/sessions/recovery/engine.js";

describe("Sprint 143 A1 — Brain L2 Pattern Matching in RecoveryEngine", () => {
  let engine: RecoveryEngine;

  beforeEach(() => {
    engine = new RecoveryEngine({
      maxRetries: 3,
      maxFixAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
    });
  });

  it("RETRY: patternHint populated when error matches Brain L2 pattern", async () => {
    const error = new Error("Connection failed: ECONNREFUSED 127.0.0.1:8000");
    const result = await engine.handleFailure(error, {
      taskId: "task-1",
      taskType: "code_generation",
      stage: "BUILD",
    });

    expect(result.recovered).toBe(true);
    expect(result.action).toBe("RETRY");
    expect(result.patternHint).toBeDefined();
    expect(result.patternHint).toContain("Brain L2");
    expect(result.patternHint).toContain("ECONNREFUSED");
    expect(result.patternHint).toContain("Check if the target service is running");
    expect(result.patternHint).toContain("5×");
  });

  it("FIX: patternHint populated for fixable errors with matching pattern", async () => {
    const error = new Error("Cannot find module 'foo': MODULE_NOT_FOUND");
    const result = await engine.handleFailure(error, {
      taskId: "task-2",
      taskType: "code_generation",
      stage: "BUILD",
    });

    expect(result.recovered).toBe(true);
    expect(result.patternHint).toBeDefined();
    expect(result.patternHint).toContain("MODULE_NOT_FOUND");
    expect(result.patternHint).toContain("npm install");
  });

  it("no patternHint when error doesn't match any Brain L2 pattern", async () => {
    const error = new Error("Some completely new error nobody has seen");
    const result = await engine.handleFailure(error, {
      taskId: "task-3",
      taskType: "code_generation",
      stage: "BUILD",
    });

    expect(result.recovered).toBe(true);
    expect(result.patternHint).toBeUndefined();
  });

  it("no patternHint for one-off patterns (count < 2)", async () => {
    const error = new Error("one-off-error happened");
    const result = await engine.handleFailure(error, {
      taskId: "task-4",
      taskType: "code_generation",
      stage: "BUILD",
    });

    expect(result.recovered).toBe(true);
    expect(result.patternHint).toBeUndefined();
  });
});
