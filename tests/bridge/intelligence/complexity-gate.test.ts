/**
 * Tests for Complexity Gate — Sprint 90 (ADR-026)
 *
 * Covers: short task, no keywords, keywords present, empty string,
 * long task with keywords, case-insensitive matching.
 *
 * @module tests/bridge/intelligence/complexity-gate
 */

import { describe, it, expect } from "vitest";
import {
  assessComplexity,
  MIN_TASK_LENGTH,
  COMPLEXITY_KEYWORDS,
} from "../../../src/bridge/intelligence/complexity-gate.js";

describe("ComplexityGate — assessComplexity()", () => {
  // --------------------------------------------------------------------------
  // Simple tasks
  // --------------------------------------------------------------------------

  it("should flag empty string as simple", () => {
    const result = assessComplexity("");
    expect(result.level).toBe("simple");
    expect(result.reason).toContain("too short");
  });

  it("should flag short task as simple", () => {
    const result = assessComplexity("Fix typo");
    expect(result.level).toBe("simple");
    expect(result.reason).toContain("too short");
  });

  it("should flag task under MIN_TASK_LENGTH as simple", () => {
    const shortTask = "a".repeat(MIN_TASK_LENGTH - 1);
    const result = assessComplexity(shortTask);
    expect(result.level).toBe("simple");
  });

  it("should flag long task without keywords as simple", () => {
    // Long enough but no complexity keywords
    const task = "Please update the color of the button on the login page to blue instead of green now";
    expect(task.length).toBeGreaterThanOrEqual(MIN_TASK_LENGTH);
    const result = assessComplexity(task);
    expect(result.level).toBe("simple");
    expect(result.reason).toContain("no complexity indicators");
  });

  // --------------------------------------------------------------------------
  // Complex tasks
  // --------------------------------------------------------------------------

  it("should flag task with complexity keyword as complex", () => {
    const task = "Refactor the authentication module to use JWT tokens instead of sessions for better security";
    const result = assessComplexity(task);
    expect(result.level).toBe("complex");
    expect(result.reason).toContain("multi-step");
  });

  it("should detect keywords case-insensitively", () => {
    const task = "REFACTOR the authentication module to use JWT tokens instead of sessions for all users";
    const result = assessComplexity(task);
    expect(result.level).toBe("complex");
  });

  it("should detect 'and' keyword in multi-step task", () => {
    const task = "Fix the login bug and then update the tests to cover the new edge cases properly";
    const result = assessComplexity(task);
    expect(result.level).toBe("complex");
  });

  it("should detect 'integrate' keyword", () => {
    const task = "Integrate the payment gateway with Stripe API for processing customer subscriptions monthly";
    const result = assessComplexity(task);
    expect(result.level).toBe("complex");
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  it("should export MIN_TASK_LENGTH as 50", () => {
    expect(MIN_TASK_LENGTH).toBe(50);
  });

  it("should export COMPLEXITY_KEYWORDS with expected entries", () => {
    expect(COMPLEXITY_KEYWORDS).toContain("refactor");
    expect(COMPLEXITY_KEYWORDS).toContain("migrate");
    expect(COMPLEXITY_KEYWORDS).toContain("orchestrate");
    expect(COMPLEXITY_KEYWORDS.length).toBeGreaterThanOrEqual(10);
  });
});
