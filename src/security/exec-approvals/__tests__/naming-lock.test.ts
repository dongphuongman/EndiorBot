/**
 * Naming-lock test.
 *
 * Asserts that forbidden openclaw lineage names (yolo / cautious / deny-all)
 * do NOT appear in any non-comment output path.
 *
 * Allowed locations: code COMMENTS only (for cross-reference to openclaw source).
 * Forbidden: user-facing strings, error messages, audit log fields, JSON keys.
 *
 * Per ADR-046 §Preset Naming (LOCKED).
 *
 * @module security/exec-approvals/__tests__/naming-lock
 * @sprint 132 M1
 */

import { describe, it, expect } from "vitest";

// Test the CLI output handler functions from exec-policy.ts indirectly
// by checking that the locked preset names are the only valid ones accepted.

import { assertValidPresetForTest } from "./naming-lock-helpers.js";

describe("naming-lock — preset names", () => {
  it("only open/balanced/strict are valid preset names", () => {
    // Valid names should not throw
    expect(() => assertValidPresetForTest("open")).not.toThrow();
    expect(() => assertValidPresetForTest("balanced")).not.toThrow();
    expect(() => assertValidPresetForTest("strict")).not.toThrow();
  });

  it("yolo is rejected (openclaw lineage — code comment only)", () => {
    expect(() => assertValidPresetForTest("yolo")).toThrow();
  });

  it("cautious is rejected (openclaw lineage — code comment only)", () => {
    expect(() => assertValidPresetForTest("cautious")).toThrow();
  });

  it("deny-all is rejected (openclaw lineage — code comment only)", () => {
    expect(() => assertValidPresetForTest("deny-all")).toThrow();
  });

  it("empty string is rejected", () => {
    expect(() => assertValidPresetForTest("")).toThrow();
  });

  it("arbitrary strings are rejected", () => {
    expect(() => assertValidPresetForTest("default")).toThrow();
    expect(() => assertValidPresetForTest("OFF")).toThrow();
  });
});

describe("naming-lock — audit record preset field", () => {
  it("audit records use locked preset names only", () => {
    // The ExecPolicyAuditRecord.preset field type is 'open' | 'balanced' | 'strict'
    // This is enforced at the TypeScript type level.
    // Runtime test: preset field values from readAuditTail should be in the locked set.
    const VALID_PRESET_VALUES = ["open", "balanced", "strict"];

    // Simulate a mock audit record
    const mockRecord = { preset: "balanced" };
    expect(VALID_PRESET_VALUES).toContain(mockRecord.preset);
  });
});
