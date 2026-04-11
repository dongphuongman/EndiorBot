/**
 * PoL (Proof-of-Life) Probes for exec-policy M1.
 *
 * Three required probes per M1-exec-policy-design.md §7:
 *   1. strict preset blocks Bash BEFORE Gate A time accrues
 *   2. open preset allows under Gate A/B/C bounds
 *   3. open preset + rm -rf / → still hard-denies
 *
 * @module tests/security/exec-policy-pol
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { checkCommand } from "../../src/security/exec-approvals/check.js";
import { writeStore } from "../../src/security/exec-approvals/store.js";
import { readAuditTail } from "../../src/security/exec-approvals/audit.js";
import type { PolicyContext } from "../../src/security/exec-approvals/types.js";

let tmpStateDir: string;

function makeCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    sessionId: "pol-session",
    taskId: "pol-task",
    agent: "coder",
    gate: "A",
    autoHandoff: false,
    originChannel: "cli",
    ...overrides,
  };
}

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-pol-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe("PoL probe 1 — strict blocks BEFORE Gate A time accrues", () => {
  it("strict preset + Gate A: command returns prompt (not allow) — exec-policy fires first", () => {
    writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

    const startTime = Date.now();
    const result = checkCommand("ls -la", makeCtx({ gate: "A" }));
    const elapsed = Date.now() - startTime;

    // Decision must be prompt (strict prompts everything)
    expect(result.decision).toBe("prompt");

    // Audit record shows preset:strict, gate:A, deny-or-prompt BEFORE any gate time
    const records = readAuditTail(1);
    expect(records[0]?.preset).toBe("strict");
    expect(records[0]?.gate).toBe("A");
    expect(records[0]?.decision).toBe("prompt");

    // Sanity: check fired in < 100ms (no gate A time logic ran)
    expect(elapsed).toBeLessThan(100);
  });

  it("strict + hard-deny denies BEFORE gate evaluation (< 100ms)", () => {
    writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

    const startTime = Date.now();
    const result = checkCommand("rm -rf /", makeCtx({ gate: "A" }));
    const elapsed = Date.now() - startTime;

    expect(result.decision).toBe("deny");
    expect(elapsed).toBeLessThan(100);
  });
});

describe("PoL probe 2 — open preset allows under Gate A/B/C bounds", () => {
  it("open preset: git status → allow (Gate A)", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("git status", makeCtx({ gate: "A" }));
    expect(result.decision).toBe("allow");

    const records = readAuditTail(1);
    expect(records[0]?.decision).toBe("allow");
    expect(records[0]?.preset).toBe("open");
    expect(records[0]?.gate).toBe("A");
  });

  it("open preset: pnpm test → allow (Gate B)", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("pnpm test", makeCtx({ gate: "B" }));
    expect(result.decision).toBe("allow");
  });

  it("open preset: custom-cmd → allow (Gate C, askMode:off)", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("my-custom-build-script --fast", makeCtx({ gate: "C" }));
    expect(result.decision).toBe("allow");
  });
});

describe("PoL probe 3 — open preset + rm -rf / → still hard-denies", () => {
  it("rm -rf / is hard-denied even with open preset", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("rm -rf /", makeCtx());
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("hard-deny matched");

    const records = readAuditTail(1);
    expect(records[0]?.decision).toBe("deny");
    expect(records[0]?.preset).toBe("open");
    expect(records[0]?.reason).toContain("hard-deny matched");
  });

  it("rm -rf /* is also hard-denied on open", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("rm -rf /*", makeCtx());
    expect(result.decision).toBe("deny");
  });

  it("git push --force origin is hard-denied on open", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("git push --force origin", makeCtx());
    expect(result.decision).toBe("deny");
  });

  it("DROP DATABASE production is hard-denied on open", () => {
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
    const result = checkCommand("DROP DATABASE production", makeCtx());
    expect(result.decision).toBe("deny");
  });
});
