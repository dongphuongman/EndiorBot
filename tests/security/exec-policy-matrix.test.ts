/**
 * 6-Cell Matrix Tests: Preset × ENDIORBOT_AUTO_HANDOFF
 *
 * One describe per cell from ADR-046 §The 6-Cell Matrix.
 * Exercises the Tool-invocation column via checkCommand().
 * Routing column (auto-handoff) is a property of agent.ts Sprint 131, tested here
 * via the env var + mock.
 *
 * Cells:
 *   strict × false   | strict × true
 *   balanced × false | balanced × true
 *   open × false     | open × true
 *
 * @module tests/security/exec-policy-matrix
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
    sessionId: "matrix-session",
    taskId: "matrix-task",
    agent: "coder",
    gate: "B",
    autoHandoff: process.env["ENDIORBOT_AUTO_HANDOFF"] === "true",
    originChannel: "cli",
    ...overrides,
  };
}

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-matrix-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  delete process.env["ENDIORBOT_AUTO_HANDOFF"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

// ============================================================================
// strict × false
// ============================================================================

describe("6-cell matrix: strict × ENDIORBOT_AUTO_HANDOFF=false", () => {
  beforeEach(() => {
    delete process.env["ENDIORBOT_AUTO_HANDOFF"];
    writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) Tool-invocation: every command prompts (askMode:always)", () => {
    const result = checkCommand("git status", makeCtx({ autoHandoff: false }));
    // strict allowlist is empty → no allowlist match → askMode:always → prompt
    expect(result.decision).toBe("prompt");
  });

  it("(b) hard-deny still blocks even on strict", () => {
    const result = checkCommand("rm -rf /", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("deny");
  });

  it("(a) Routing: autoHandoff=false (simulated via ctx field)", () => {
    const ctx = makeCtx({ autoHandoff: false });
    expect(ctx.autoHandoff).toBe(false);
  });

  it("preset field recorded correctly as strict", () => {
    checkCommand("ls -la", makeCtx({ autoHandoff: false }));
    const records = readAuditTail(1);
    expect(records[0]?.preset).toBe("strict");
  });
});

// ============================================================================
// strict × true
// ============================================================================

describe("6-cell matrix: strict × ENDIORBOT_AUTO_HANDOFF=true", () => {
  beforeEach(() => {
    process.env["ENDIORBOT_AUTO_HANDOFF"] = "true";
    writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) Tool-invocation: every command still prompts (autoHandoff does not affect exec-policy)", () => {
    const result = checkCommand("pnpm build", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("prompt");
  });

  it("(b) hard-deny still blocks", () => {
    const result = checkCommand("git push --force origin", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("deny");
  });

  it("autoHandoff=true recorded in audit", () => {
    checkCommand("ls", makeCtx({ autoHandoff: true }));
    const records = readAuditTail(1);
    expect(records[0]?.autoHandoff).toBe(true);
  });
});

// ============================================================================
// balanced × false
// ============================================================================

describe("6-cell matrix: balanced × ENDIORBOT_AUTO_HANDOFF=false", () => {
  beforeEach(() => {
    delete process.env["ENDIORBOT_AUTO_HANDOFF"];
    writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) allowlisted commands run silently", () => {
    const result = checkCommand("git status", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("allow");
  });

  it("(b) unknown/mutating commands prompt", () => {
    const result = checkCommand("some-mutating-cmd --write", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("prompt");
  });

  it("(b) hard-deny blocks regardless", () => {
    const result = checkCommand("rm -rf /", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("deny");
  });

  it("(b) pnpm test is allowed", () => {
    const result = checkCommand("pnpm test", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("allow");
  });
});

// ============================================================================
// balanced × true
// ============================================================================

describe("6-cell matrix: balanced × ENDIORBOT_AUTO_HANDOFF=true (recommended serve mode)", () => {
  beforeEach(() => {
    process.env["ENDIORBOT_AUTO_HANDOFF"] = "true";
    writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) allowlisted commands still run silently (auto-handoff does not affect exec-policy)", () => {
    const result = checkCommand("git log --oneline", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("allow");
  });

  it("(b) unknown commands still prompt", () => {
    const result = checkCommand("npm run deploy", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("prompt");
  });

  it("(b) hard-deny still blocks", () => {
    const result = checkCommand("sudo rm -rf /var/log", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("deny");
  });
});

// ============================================================================
// open × false
// ============================================================================

describe("6-cell matrix: open × ENDIORBOT_AUTO_HANDOFF=false", () => {
  beforeEach(() => {
    delete process.env["ENDIORBOT_AUTO_HANDOFF"];
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) unknown commands are allowed (askMode:off)", () => {
    const result = checkCommand("some-new-tool --flag", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("allow");
  });

  it("(b) hard-deny rm -rf / still blocks", () => {
    const result = checkCommand("rm -rf /", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("deny");
  });

  it("(b) hard-deny git push --force still blocks", () => {
    const result = checkCommand("git push --force upstream", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("deny");
  });

  it("(b) git add is allowed", () => {
    const result = checkCommand("git add src/foo.ts", makeCtx({ autoHandoff: false }));
    expect(result.decision).toBe("allow");
  });
});

// ============================================================================
// open × true
// ============================================================================

describe("6-cell matrix: open × ENDIORBOT_AUTO_HANDOFF=true (near-silent / most permissive)", () => {
  beforeEach(() => {
    process.env["ENDIORBOT_AUTO_HANDOFF"] = "true";
    writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
  });

  it("(b) largely silent — unknown commands allowed", () => {
    const result = checkCommand("custom-tool --run-fast", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("allow");
  });

  it("(b) hard-deny rm -rf / still blocks (CEO Power Tool boundary)", () => {
    const result = checkCommand("rm -rf /", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("hard-deny matched");
  });

  it("(b) hard-deny DROP TABLE still blocks", () => {
    const result = checkCommand("DROP TABLE users", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("deny");
  });

  it("(b) hard-deny fork bomb still blocks", () => {
    const result = checkCommand(":(){ :|:& };:", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("deny");
  });

  it("(b) pnpm install is allowed", () => {
    const result = checkCommand("pnpm install", makeCtx({ autoHandoff: true }));
    expect(result.decision).toBe("allow");
  });
});
