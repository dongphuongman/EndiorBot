/**
 * Tests for ReflectStep — reflect-after-tools pattern.
 *
 * @module tests/agents/quality/reflect-step
 * @sprint 121 — Track 2
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ReflectStep,
  REFLECT_PROMPT,
  getReflectStep,
  resetReflectStep,
  type ToolResult,
} from "../../../src/agents/quality/reflect-step.js";
import type { Message } from "../../../src/providers/types.js";

let step: ReflectStep;

beforeEach(() => {
  step = new ReflectStep();
  resetReflectStep();
});

const okResult: ToolResult = { tool: "Edit", success: true, output: "done" };
const errorResult: ToolResult = { tool: "Bash", success: false, error: "exit code 1" };
const failedResult: ToolResult = { tool: "Read", success: false };

// ============================================================================
// Constructor
// ============================================================================

describe("constructor", () => {
  it("defaults frequency to 1", () => {
    const s = new ReflectStep();
    expect(s.shouldReflect([okResult], 0)).toBe(true);
  });

  it("accepts custom frequency", () => {
    const s = new ReflectStep({ frequency: 3 });
    expect(s.shouldReflect([okResult], 0)).toBe(true);
    expect(s.shouldReflect([okResult], 1)).toBe(false);
    expect(s.shouldReflect([okResult], 2)).toBe(false);
    expect(s.shouldReflect([okResult], 3)).toBe(true);
  });

  it("accepts custom prompt", () => {
    const s = new ReflectStep({ customPrompt: "Check again" });
    const msg = s.createReflectionMessage([okResult]);
    expect(msg.content).toContain("Check again");
    expect(msg.content).not.toContain(REFLECT_PROMPT);
  });
});

// ============================================================================
// shouldReflect
// ============================================================================

describe("shouldReflect", () => {
  it("returns false when frequency is 0 (disabled)", () => {
    const s = new ReflectStep({ frequency: 0 });
    expect(s.shouldReflect([okResult], 0)).toBe(false);
    expect(s.shouldReflect([errorResult], 0)).toBe(false);
  });

  it("always reflects on error regardless of frequency", () => {
    const s = new ReflectStep({ frequency: 5 });
    expect(s.shouldReflect([errorResult], 1)).toBe(true);
    expect(s.shouldReflect([errorResult], 3)).toBe(true);
  });

  it("always reflects on failed (success=false) regardless of frequency", () => {
    const s = new ReflectStep({ frequency: 5 });
    expect(s.shouldReflect([failedResult], 2)).toBe(true);
  });

  it("reflects on batchIndex 0 with frequency 1", () => {
    expect(step.shouldReflect([okResult], 0)).toBe(true);
  });

  it("reflects on every batch with frequency 1", () => {
    expect(step.shouldReflect([okResult], 0)).toBe(true);
    expect(step.shouldReflect([okResult], 1)).toBe(true);
    expect(step.shouldReflect([okResult], 5)).toBe(true);
  });

  it("respects frequency schedule for success results", () => {
    const s = new ReflectStep({ frequency: 2 });
    expect(s.shouldReflect([okResult], 0)).toBe(true);
    expect(s.shouldReflect([okResult], 1)).toBe(false);
    expect(s.shouldReflect([okResult], 2)).toBe(true);
    expect(s.shouldReflect([okResult], 3)).toBe(false);
  });

  it("reflects if any result in batch has error", () => {
    const s = new ReflectStep({ frequency: 10 });
    expect(s.shouldReflect([okResult, errorResult], 7)).toBe(true);
  });

  it("handles empty results array (no tools → follows frequency)", () => {
    expect(step.shouldReflect([], 0)).toBe(true);
  });
});

// ============================================================================
// formatToolSummary
// ============================================================================

describe("formatToolSummary", () => {
  it("formats OK result", () => {
    const summary = step.formatToolSummary([okResult]);
    expect(summary).toBe("- Edit: OK");
  });

  it("formats error result", () => {
    const summary = step.formatToolSummary([errorResult]);
    expect(summary).toBe("- Bash: ERROR: exit code 1");
  });

  it("formats failed result (no error string)", () => {
    const summary = step.formatToolSummary([failedResult]);
    expect(summary).toBe("- Read: FAILED");
  });

  it("formats multiple results", () => {
    const summary = step.formatToolSummary([okResult, errorResult, failedResult]);
    const lines = summary.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Edit: OK");
    expect(lines[1]).toContain("Bash: ERROR");
    expect(lines[2]).toContain("Read: FAILED");
  });

  it("uses 'unknown' for tool with empty name", () => {
    const summary = step.formatToolSummary([{ tool: "", success: true }]);
    expect(summary).toBe("- unknown: OK");
  });
});

// ============================================================================
// createReflectionMessage
// ============================================================================

describe("createReflectionMessage", () => {
  it("returns Message with role=user", () => {
    const msg = step.createReflectionMessage([okResult]);
    expect(msg.role).toBe("user");
  });

  it("includes tool summary and default prompt", () => {
    const msg = step.createReflectionMessage([okResult]);
    expect(msg.content).toContain("Tool execution summary:");
    expect(msg.content).toContain("Edit: OK");
    expect(msg.content).toContain(REFLECT_PROMPT);
  });
});

// ============================================================================
// injectReflection
// ============================================================================

describe("injectReflection", () => {
  it("appends reflection message to messages array", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = step.injectReflection(messages, [okResult]);
    expect(result).toHaveLength(2);
    expect(result[1]!.role).toBe("user");
    expect(result[1]!.content).toContain("Tool execution summary:");
  });

  it("mutates the original array", () => {
    const messages: Message[] = [];
    step.injectReflection(messages, [okResult]);
    expect(messages).toHaveLength(1);
  });
});

// ============================================================================
// maybeInjectReflection
// ============================================================================

describe("maybeInjectReflection", () => {
  it("returns true and injects when reflection needed", () => {
    const messages: Message[] = [];
    const result = step.maybeInjectReflection(messages, [okResult], 0);
    expect(result).toBe(true);
    expect(messages).toHaveLength(1);
  });

  it("returns false and does not inject when not needed", () => {
    const s = new ReflectStep({ frequency: 2 });
    const messages: Message[] = [];
    const result = s.maybeInjectReflection(messages, [okResult], 1);
    expect(result).toBe(false);
    expect(messages).toHaveLength(0);
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe("singleton", () => {
  it("getReflectStep returns same instance", () => {
    const a = getReflectStep();
    const b = getReflectStep();
    expect(a).toBe(b);
  });

  it("resetReflectStep clears the singleton", () => {
    const a = getReflectStep();
    resetReflectStep();
    const b = getReflectStep();
    expect(a).not.toBe(b);
  });
});
