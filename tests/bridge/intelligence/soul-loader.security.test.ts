/**
 * Security Tests for SoulLoader — Sprint 84 (ADR-025)
 *
 * Covers: path traversal prevention, content integrity (no sanitization),
 * and invalid character rejection in role names.
 *
 * CTO security requirement: SOUL content is NOT sanitized — backticks,
 * shell metacharacters, and code blocks must be preserved verbatim.
 * File-based injection strategies (--agent, --append-system-prompt-file)
 * never pass content through a shell interpreter.
 *
 * @module tests/bridge/intelligence/soul-loader.security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createSoulLoader,
  resetSoulLoader,
} from "../../../src/bridge/intelligence/soul-loader.js";

// ============================================================================
// Tests
// ============================================================================

describe("SoulLoader — security", () => {
  let tempDir: string;
  let soulsDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "soul-security-test-"));
    soulsDir = join(tempDir, "souls");
    mkdirSync(soulsDir, { recursive: true });
    // Write a benign coder SOUL so real-role lookups succeed in tempDir
    writeFileSync(
      join(soulsDir, "SOUL-coder.md"),
      "---\nrole: coder\n---\n\n# Coder\n\nYou are the Coder.\n",
      "utf-8",
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    resetSoulLoader();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Path traversal — invalid roles that look like paths
  // --------------------------------------------------------------------------

  describe("path traversal prevention", () => {
    it("rejects '../../etc/passwd' — returns assistant fallback, never reads outside souls/", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("../../etc/passwd");

      // Must not attempt to read /etc/passwd — role is invalid so fallback fires
      expect(result.fallback).toBe(true);
      expect(result.source).toBe("fallback-inline");
      expect(result.agentRole).toBe("assistant");
      // Content must NOT look like /etc/passwd format
      expect(result.content).not.toMatch(/root:x:0:0/);
    });

    it("rejects '../../../etc/shadow' — returns assistant fallback", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("../../../etc/shadow");

      expect(result.fallback).toBe(true);
      expect(result.source).toBe("fallback-inline");
      expect(result.agentRole).toBe("assistant");
    });

    it("rejects role names containing path separators", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });

      for (const traversal of [
        "pm/../coder",
        "./pm",
        "/etc/hosts",
        "pm/../../root",
      ]) {
        const result = loader.load(traversal);
        expect(result.fallback).toBe(true);
        expect(result.source).toBe("fallback-inline");
      }
    });
  });

  // --------------------------------------------------------------------------
  // Content integrity — no sanitization
  // --------------------------------------------------------------------------

  describe("content integrity — no metacharacter stripping", () => {
    it("preserves backticks and code blocks in SOUL content verbatim", () => {
      // Write SOUL file containing backticks and code examples
      const rawWithBackticks = [
        "---",
        "role: coder",
        "version: 1.0.0",
        "---",
        "",
        "# Coder SOUL",
        "",
        "You must use `git commit -m 'message'` for commits.",
        "",
        "```typescript",
        "const x = `template ${literal}`;",
        "```",
        "",
        "Also: `rm -rf /tmp/test` should be called carefully.",
      ].join("\n");

      writeFileSync(join(soulsDir, "SOUL-coder.md"), rawWithBackticks, "utf-8");

      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("coder");

      expect(result.loaded).toBe(true);
      expect(result.source).toBe("file");
      // Backticks must be preserved
      expect(result.content).toContain("`git commit -m 'message'`");
      expect(result.content).toContain("```typescript");
      expect(result.content).toContain("`rm -rf /tmp/test`");
    });

    it("preserves $(command) shell substitution syntax in SOUL content", () => {
      const rawWithSubstitution = [
        "---",
        "role: coder",
        "version: 1.0.0",
        "---",
        "",
        "# Coder SOUL",
        "",
        "Example: run $(date) or $(git log --oneline -5) to inspect.",
        "Environment: ${HOME} and ${PATH} are useful variables.",
      ].join("\n");

      writeFileSync(join(soulsDir, "SOUL-coder.md"), rawWithSubstitution, "utf-8");

      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("coder");

      expect(result.loaded).toBe(true);
      // Shell substitution syntax must NOT be stripped
      expect(result.content).toContain("$(date)");
      expect(result.content).toContain("$(git log --oneline -5)");
      expect(result.content).toContain("${HOME}");
      expect(result.content).toContain("${PATH}");
    });

    it("preserves special characters: semicolons, pipes, ampersands, redirects", () => {
      const rawWithSpecialChars = [
        "---",
        "role: coder",
        "---",
        "",
        "Run: npm install && npm test || echo 'failed'",
        "Pipe: cat file.txt | grep pattern",
        "Redirect: echo output > file.txt",
        "Semicolons: cd /tmp; ls -la; pwd",
      ].join("\n");

      writeFileSync(join(soulsDir, "SOUL-coder.md"), rawWithSpecialChars, "utf-8");

      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("coder");

      expect(result.loaded).toBe(true);
      expect(result.content).toContain("npm install && npm test || echo 'failed'");
      expect(result.content).toContain("cat file.txt | grep pattern");
      expect(result.content).toContain("echo output > file.txt");
      expect(result.content).toContain("cd /tmp; ls -la; pwd");
    });
  });

  // --------------------------------------------------------------------------
  // Invalid characters in role names
  // --------------------------------------------------------------------------

  describe("invalid characters in role names", () => {
    it("rejects role name with null byte — returns assistant fallback", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm\0coder");

      expect(result.fallback).toBe(true);
      expect(result.agentRole).toBe("assistant");
    });

    it("rejects role name with newline character — returns assistant fallback", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm\ncoder");

      expect(result.fallback).toBe(true);
      expect(result.agentRole).toBe("assistant");
    });

    it("rejects role name with SQL injection pattern — returns assistant fallback", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("'; DROP TABLE users;--");

      expect(result.fallback).toBe(true);
      expect(result.source).toBe("fallback-inline");
      expect(result.agentRole).toBe("assistant");
    });

    it("rejects numeric-looking role names", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("123");

      expect(result.fallback).toBe(true);
      expect(result.agentRole).toBe("assistant");
    });
  });
});
