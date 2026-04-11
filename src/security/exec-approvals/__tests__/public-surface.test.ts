/**
 * Public surface enforcement test.
 *
 * Assert that src/security/exec-approvals/index.ts exports exactly the
 * locked symbol set defined in M1-exec-policy-design.md §2.2.
 *
 * Any addition to the public surface must go through an ADR amendment.
 *
 * @module security/exec-approvals/__tests__/public-surface
 * @sprint 132 M1
 */

import { describe, it, expect } from "vitest";
import * as execApprovals from "../index.js";

describe("exec-approvals public surface", () => {
  it("exports exactly the locked symbol set", () => {
    const exported = Object.keys(execApprovals).sort();

    // Locked per M1-exec-policy-design.md §2.2
    // Type-only exports are not visible at runtime (TS erases them).
    // Runtime-visible exports:
    const expected = [
      "checkCommand",
      "setPreset",
      "getPreset",
      "getEffectivePolicy",
      "readAuditTail",
    ].sort();

    expect(exported).toEqual(expected);
  });

  it("checkCommand is a function", () => {
    expect(typeof execApprovals.checkCommand).toBe("function");
  });

  it("setPreset is a function", () => {
    expect(typeof execApprovals.setPreset).toBe("function");
  });

  it("getPreset is a function", () => {
    expect(typeof execApprovals.getPreset).toBe("function");
  });

  it("getEffectivePolicy is a function", () => {
    expect(typeof execApprovals.getEffectivePolicy).toBe("function");
  });

  it("readAuditTail is a function", () => {
    expect(typeof execApprovals.readAuditTail).toBe("function");
  });
});
