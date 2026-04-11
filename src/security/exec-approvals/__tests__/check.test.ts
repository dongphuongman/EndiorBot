/**
 * Unit tests for check.ts
 *
 * @module security/exec-approvals/__tests__/check
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { checkCommand } from "../check.js";
import { writeStore } from "../store.js";
import type { PolicyContext } from "../types.js";

let tmpStateDir: string;

function makeCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    sessionId: "test-session",
    agent: "coder",
    gate: "B",
    autoHandoff: false,
    originChannel: "cli",
    ...overrides,
  };
}

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-check-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe("checkCommand", () => {
  describe("non-CLI origin: fail-closed (ADR-046 Amendment 1)", () => {
    it("denies telegram origin", () => {
      const result = checkCommand("git status", makeCtx({ originChannel: "telegram" }));
      expect(result.decision).toBe("deny");
      expect(result.reason).toContain("OTT prompt routing deferred");
    });

    it("denies web origin", () => {
      const result = checkCommand("ls -la", makeCtx({ originChannel: "web" }));
      expect(result.decision).toBe("deny");
    });

    it("denies zalo origin", () => {
      const result = checkCommand("cat README.md", makeCtx({ originChannel: "zalo" }));
      expect(result.decision).toBe("deny");
    });
  });

  describe("hard-deny wins over allowlist", () => {
    it("denies rm -rf / even on open preset", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("rm -rf /", makeCtx());
      expect(result.decision).toBe("deny");
      expect(result.reason).toContain("hard-deny matched");
      expect(result.matchedPattern).toBe("rm -rf /");
    });

    it("denies fork bomb", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand(":(){ :|:& };:", makeCtx());
      expect(result.decision).toBe("deny");
    });

    it("denies git push --force origin/main", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("git push --force origin/main", makeCtx());
      expect(result.decision).toBe("deny");
    });

    it("denies sudo apt-get install", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("sudo apt-get install vim", makeCtx());
      expect(result.decision).toBe("deny");
    });
  });

  describe("allowlist match: allow", () => {
    it("allows git status on balanced", () => {
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("git status", makeCtx());
      expect(result.decision).toBe("allow");
      expect(result.reason).toContain("allowlist matched");
    });

    it("allows pnpm test on balanced", () => {
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("pnpm test", makeCtx());
      expect(result.decision).toBe("allow");
    });

    it("allows git add * on open", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("git add src/foo.ts", makeCtx());
      expect(result.decision).toBe("allow");
    });
  });

  describe("askMode: prompt behavior", () => {
    it("prompts for unknown command on balanced (askMode: on-miss)", () => {
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("some-unknown-cmd --arg", makeCtx());
      expect(result.decision).toBe("prompt");
      expect(result.reason).toContain("askMode:on-miss");
    });

    it("prompts for known command on strict (askMode: always)", () => {
      writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      // strict has empty allowlist, so this won't match allowlist
      const result = checkCommand("git status", makeCtx());
      expect(result.decision).toBe("prompt");
      expect(result.reason).toContain("askMode:always");
    });

    it("allows unknown command on open (askMode: off)", () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      const result = checkCommand("some-custom-command --flag", makeCtx());
      expect(result.decision).toBe("allow");
      expect(result.reason).toContain("askMode:off");
    });
  });

  describe("audit side-effect", () => {
    it("writes audit record for allow decision", async () => {
      const { readAuditTail } = await import("../audit.js");
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      checkCommand("git status", makeCtx({ taskId: "task-1" }));
      const records = readAuditTail(1);
      expect(records).toHaveLength(1);
      expect(records[0]?.decision).toBe("allow");
      expect(records[0]?.taskId).toBe("task-1");
    });

    it("records originChannel in audit", async () => {
      const { readAuditTail } = await import("../audit.js");
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });
      checkCommand("git status", makeCtx({ originChannel: "cli" }));
      const records = readAuditTail(1);
      expect(records[0]?.originChannel).toBe("cli");
    });
  });
});
