/**
 * Sprint 105: Patch Intent Classifier Tests
 *
 * Tests ADR-031 GAP-003 closure:
 * - Conservative classifier: only PATCH for high-signal patterns
 * - READ default for ambiguous / advisory / question messages
 * - CPO C7: log all classifications (tested separately via integration)
 * - CTO C1: confirmation timeout (tested in channel-router integration)
 *
 * @module tests/agents/intelligence/patch-intent-classifier
 * @sprint 105
 */

import { describe, it, expect } from "vitest";
import { classifyPatchIntent } from "../../../src/agents/intelligence/patch-intent-classifier.js";

// ============================================================================
// T1-T5: PATCH triggers (high-signal only)
// ============================================================================

describe("classifyPatchIntent — PATCH triggers", () => {
  it("T1: 'apply this fix to login.ts' → PATCH (confidence ≥ 0.8)", () => {
    const result = classifyPatchIntent("@coder apply this fix to login.ts");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.matchedPattern).toBeDefined();
  });

  it("T1b: 'apply the changes' → PATCH", () => {
    const result = classifyPatchIntent("@coder please apply the changes");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T2: 'create a test file for auth' → PATCH", () => {
    const result = classifyPatchIntent("@coder create a test file for the auth module");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T3b: 'write to file' → PATCH", () => {
    const result = classifyPatchIntent("@coder write to file the updated config");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T4: 'update package.json' → PATCH (explicit named file)", () => {
    const result = classifyPatchIntent("@coder update package.json with the new dependencies");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T5a: 'refactor auth module and apply' → PATCH", () => {
    const result = classifyPatchIntent("@coder refactor the auth module and apply");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T5b: 'implement and save' → PATCH", () => {
    const result = classifyPatchIntent("@coder implement the fix and save it");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T6: 'fix the bug in src/auth.ts' → PATCH (explicit file path)", () => {
    const result = classifyPatchIntent("@coder fix the bug in src/auth.ts");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("T6b: 'modify src/index.ts' → PATCH", () => {
    const result = classifyPatchIntent("@coder modify src/index.ts to export the new module");
    expect(result.intent).toBe("PATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

// ============================================================================
// T7-T9: READ default (questions, analysis, advisory)
// ============================================================================

describe("classifyPatchIntent — READ defaults", () => {
  it("T7: 'how does auth work?' → READ", () => {
    const result = classifyPatchIntent("@coder how does auth work?");
    expect(result.intent).toBe("READ");
  });

  it("T8: '@reviewer check this code' → READ (advisory)", () => {
    const result = classifyPatchIntent("@reviewer check this code for security issues");
    expect(result.intent).toBe("READ");
  });

  it("T9: 'suggest improvements to auth' → READ", () => {
    const result = classifyPatchIntent("@coder suggest improvements to the auth module");
    expect(result.intent).toBe("READ");
  });

  it("T9b: ambiguous 'fix the auth' (no explicit file target) → READ", () => {
    // "fix" without a file path is ambiguous — CPO C7 conservative default
    const result = classifyPatchIntent("@coder fix the auth");
    expect(result.intent).toBe("READ");
  });

  it("T9c: 'analyze this codebase' → READ", () => {
    const result = classifyPatchIntent("@architect analyze this codebase");
    expect(result.intent).toBe("READ");
  });

  it("T9d: 'review my PR' → READ", () => {
    const result = classifyPatchIntent("@reviewer review my PR changes");
    expect(result.intent).toBe("READ");
  });

  it("T9e: 'explain the auth flow' → READ", () => {
    const result = classifyPatchIntent("@coder explain the auth flow");
    expect(result.intent).toBe("READ");
  });

  it("T9f: 'what does login.ts do?' → READ", () => {
    const result = classifyPatchIntent("@coder what does login.ts do?");
    expect(result.intent).toBe("READ");
  });

  it("empty message → READ with confidence 1.0", () => {
    const result = classifyPatchIntent("");
    expect(result.intent).toBe("READ");
    expect(result.confidence).toBe(1.0);
  });
});

// ============================================================================
// T10: Read override takes priority even with PATCH keywords
// ============================================================================

describe("classifyPatchIntent — READ override priority", () => {
  it("'suggest fix to src/auth.ts' → READ (suggest overrides file path)", () => {
    const result = classifyPatchIntent("@coder suggest fix to src/auth.ts");
    // "suggest" is a READ override that should block PATCH even with file path
    expect(result.intent).toBe("READ");
  });

  it("'review and apply changes' — review keyword → READ", () => {
    // "review" is an override keyword
    const result = classifyPatchIntent("@reviewer review and apply changes to the file");
    expect(result.intent).toBe("READ");
  });
});

// ============================================================================
// Result shape
// ============================================================================

describe("classifyPatchIntent — result shape", () => {
  it("PATCH result has correct fields", () => {
    const result = classifyPatchIntent("@coder apply this fix to login.ts");
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reason");
    expect(typeof result.intent).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.reason).toBe("string");
  });

  it("READ result has correct fields", () => {
    const result = classifyPatchIntent("@coder how does auth work?");
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reason");
    expect(result.matchedPattern).toBeUndefined();
  });
});
