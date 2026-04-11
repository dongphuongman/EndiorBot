/**
 * Unit tests for effective-policy.ts
 *
 * @module security/exec-approvals/__tests__/effective-policy
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getEffectivePolicy } from "../effective-policy.js";
import { writeStore } from "../store.js";
import { HARD_DENY_BASE } from "../presets.js";

let tmpStateDir: string;

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-ep-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe("effective-policy", () => {
  it("returns balanced by default (no store file)", () => {
    const p = getEffectivePolicy();
    expect(p.preset).toBe("balanced");
    expect(p.askMode).toBe("on-miss");
  });

  it("returns strict when preset is strict", () => {
    writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const p = getEffectivePolicy();
    expect(p.preset).toBe("strict");
    expect(p.allowlist).toHaveLength(0);
    expect(p.askMode).toBe("always");
  });

  it("returns open when preset is open", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const p = getEffectivePolicy();
    expect(p.preset).toBe("open");
    expect(p.askMode).toBe("off");
  });

  it("merges extraAllowlist on top of preset allowlist", () => {
    writeStore({ preset: "balanced", extraAllowlist: ["echo *", "my-custom-cmd"], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const p = getEffectivePolicy();
    expect(p.allowlist).toContain("echo *");
    expect(p.allowlist).toContain("my-custom-cmd");
    // preset entries still present
    expect(p.allowlist).toContain("git status");
  });

  it("merges extraHardDeny on top of preset hardDeny", () => {
    writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: ["danger *"], updatedAt: "2026-04-11T00:00:00.000Z" });
    const p = getEffectivePolicy();
    expect(p.hardDeny).toContain("danger *");
    // HARD_DENY_BASE still present
    for (const d of HARD_DENY_BASE) {
      expect(p.hardDeny).toContain(d);
    }
  });

  it("hard-deny takes precedence (ordering: hardDeny checked first in check.ts)", () => {
    // This test verifies the effective policy has both lists correctly set;
    // the precedence rule is enforced in check.ts (tested separately).
    writeStore({ preset: "open", extraAllowlist: ["rm -rf /"], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const p = getEffectivePolicy();
    // rm -rf / is in extraAllowlist but also in HARD_DENY_BASE (via preset hardDeny)
    expect(p.allowlist).toContain("rm -rf /");
    expect(p.hardDeny).toContain("rm -rf /");
    // check.ts will check hardDeny first and deny it — that's tested in check.test.ts
  });
});
