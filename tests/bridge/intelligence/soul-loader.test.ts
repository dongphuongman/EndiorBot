/**
 * Tests for SoulLoader — Sprint 84 (ADR-025)
 *
 * Covers: load(), cache, hash, fallback, clearCache(), getValidRoles(),
 * templatesRoot override, and singleton helpers.
 *
 * @module tests/bridge/intelligence/soul-loader
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// ============================================================================
// Module under test — imported after mocks are set up
// ============================================================================

import {
  SoulLoader,
  createSoulLoader,
  getSoulLoader,
  resetSoulLoader,
} from "../../../src/bridge/intelligence/soul-loader.js";
import { VALID_AGENT_ROLES } from "../../../src/bridge/intelligence/envelope.js";

// ============================================================================
// Helpers
// ============================================================================

/** Compute SHA256 of a string — mirrors SoulLoader.computeHash() */
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Raw SOUL file with YAML frontmatter */
const MOCK_SOUL_RAW = `---
role: pm
category: executor
version: 1.0.0
---

# Test PM SOUL

You are a test PM agent.
`;

/** Expected body after frontmatter is stripped */
const MOCK_SOUL_BODY = `\n# Test PM SOUL\n\nYou are a test PM agent.\n`;

// ============================================================================
// Tests
// ============================================================================

describe("SoulLoader", () => {
  let tempDir: string;
  let soulsDir: string;

  beforeEach(() => {
    // Create isolated temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), "soul-loader-test-"));
    soulsDir = join(tempDir, "souls");
    mkdirSync(soulsDir, { recursive: true });

    // Write a real SOUL file for "pm"
    writeFileSync(join(soulsDir, "SOUL-pm.md"), MOCK_SOUL_RAW, "utf-8");
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
    // Reset global singleton between tests
    resetSoulLoader();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // load() — file path
  // --------------------------------------------------------------------------

  describe("load() — file source", () => {
    it("returns loaded=true, source='file', and correct content when SOUL file exists", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm");

      expect(result.loaded).toBe(true);
      expect(result.source).toBe("file");
      expect(result.fallback).toBe(false);
      expect(result.agentRole).toBe("pm");
      expect(result.content).toBe(MOCK_SOUL_BODY);
    });

    it("strips YAML frontmatter — content starts after the closing --- delimiter", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm");

      expect(result.content).not.toContain("role: pm");
      expect(result.content).not.toContain("category: executor");
      expect(result.content).not.toContain("---");
      expect(result.content).toContain("You are a test PM agent.");
    });

    it("contentHash is the SHA256 of the stripped body content", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm");

      const expected = sha256(MOCK_SOUL_BODY);
      expect(result.contentHash).toBe(expected);
      // SHA256 hex is always 64 chars
      expect(result.contentHash).toHaveLength(64);
    });

    it("resolvedPath is set when source is 'file'", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("pm");

      expect(result.resolvedPath).toBeDefined();
      expect(result.resolvedPath).toContain("SOUL-pm.md");
    });
  });

  // --------------------------------------------------------------------------
  // load() — cache
  // --------------------------------------------------------------------------

  describe("load() — cache", () => {
    it("returns the same object reference on second call (cache hit)", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const first = loader.load("pm");
      const second = loader.load("pm");

      expect(second).toBe(first);
    });

    it("clearCache() invalidates cache so next load re-reads from filesystem", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });

      const first = loader.load("pm");
      loader.clearCache();

      // Modify file content after clearing cache
      const updatedBody = "\n# Updated PM SOUL\n\nYou are an updated PM agent.\n";
      const updatedRaw = `---\nrole: pm\n---\n${updatedBody}`;
      writeFileSync(join(soulsDir, "SOUL-pm.md"), updatedRaw, "utf-8");

      const second = loader.load("pm");

      expect(second).not.toBe(first);
      expect(second.content).toContain("Updated PM SOUL");
    });
  });

  // --------------------------------------------------------------------------
  // load() — fallback paths
  // --------------------------------------------------------------------------

  describe("load() — fallback", () => {
    it("returns fallback with source='fallback-inline' when SOUL file is missing", () => {
      // Use temp dir with no SOUL files
      const emptyDir = mkdtempSync(join(tmpdir(), "soul-empty-"));
      mkdirSync(join(emptyDir, "souls"), { recursive: true });

      const loader = createSoulLoader({ templatesRoot: emptyDir });
      const result = loader.load("coder");

      expect(result.loaded).toBe(false);
      expect(result.source).toBe("fallback-inline");
      expect(result.fallback).toBe(true);
      expect(result.agentRole).toBe("coder");
      expect(result.content).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(10);

      rmSync(emptyDir, { recursive: true, force: true });
    });

    it("returns fallback for 'assistant' role when invalid role is provided", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const result = loader.load("invalid-role");

      expect(result.loaded).toBe(false);
      expect(result.fallback).toBe(true);
      // Invalid role → assistant fallback
      expect(result.agentRole).toBe("assistant");
      expect(result.source).toBe("fallback-inline");
    });

    it("fallback result still has a valid SHA256 contentHash", () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "soul-empty2-"));
      mkdirSync(join(emptyDir, "souls"), { recursive: true });

      const loader = createSoulLoader({ templatesRoot: emptyDir });
      const result = loader.load("architect");

      expect(result.contentHash).toHaveLength(64);
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);

      rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  // --------------------------------------------------------------------------
  // getValidRoles()
  // --------------------------------------------------------------------------

  describe("getValidRoles()", () => {
    it("returns all 14 valid agent roles", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir });
      const roles = loader.getValidRoles();

      expect(roles).toHaveLength(14);
      expect(roles).toEqual(VALID_AGENT_ROLES);
    });

    it("cso role loads fallback with security scope keywords", () => {
      const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
      const result = loader.load("cso");

      expect(result.agentRole).toBe("cso");
      expect(result.content).toContain("CSO");
      expect(result.content).toContain("security");
    });
  });

  // --------------------------------------------------------------------------
  // Preamble injection (Sprint 122 — gstack adoption T2-B)
  // --------------------------------------------------------------------------

  describe("preamble injection", () => {
    it("prepends PREAMBLE.md content to loaded SOUL", () => {
      // Create a PREAMBLE.md in the temp souls dir
      const preambleContent = "## Shared Context\n\nTest preamble content.";
      writeFileSync(join(soulsDir, "PREAMBLE.md"), preambleContent, "utf-8");

      const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
      const result = loader.load("pm");

      expect(result.content).toContain("Shared Context");
      expect(result.content).toContain("Test preamble content.");
      // SOUL body should come after preamble
      expect(result.content.indexOf("Shared Context")).toBeLessThan(
        result.content.indexOf("PM SOUL")
      );
    });

    it("sets preambleHash on result when PREAMBLE.md exists", () => {
      writeFileSync(join(soulsDir, "PREAMBLE.md"), "Preamble hash test", "utf-8");

      const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
      const result = loader.load("pm");

      expect(result.preambleHash).toBeDefined();
      expect(result.preambleHash).toHaveLength(64); // SHA256 hex
    });

    it("works without PREAMBLE.md (graceful fallback)", () => {
      // No PREAMBLE.md in soulsDir — should still load SOUL normally
      const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
      const result = loader.load("pm");

      expect(result.loaded).toBe(true);
      expect(result.content).toContain("PM SOUL");
      expect(result.preambleHash).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // templatesRoot override
  // --------------------------------------------------------------------------

  describe("templatesRoot override", () => {
    it("uses the custom templatesRoot to resolve SOUL files", () => {
      // Create a second temp dir with a different PM SOUL
      const altDir = mkdtempSync(join(tmpdir(), "soul-alt-"));
      const altSoulsDir = join(altDir, "souls");
      mkdirSync(altSoulsDir, { recursive: true });

      const altRaw = `---\nrole: pm\nversion: 9.9.9\n---\n\n# Alt PM SOUL\n\nAlternative content.\n`;
      writeFileSync(join(altSoulsDir, "SOUL-pm.md"), altRaw, "utf-8");

      const loader = createSoulLoader({ templatesRoot: altDir });
      const result = loader.load("pm");

      expect(result.content).toContain("Alt PM SOUL");
      expect(result.content).toContain("Alternative content.");
      expect(result.content).not.toContain("Test PM SOUL");

      rmSync(altDir, { recursive: true, force: true });
    });
  });

  // --------------------------------------------------------------------------
  // Singleton helpers
  // --------------------------------------------------------------------------

  describe("getSoulLoader() singleton", () => {
    it("returns the same instance on repeated calls", () => {
      resetSoulLoader();
      const a = getSoulLoader();
      const b = getSoulLoader();
      expect(a).toBe(b);
    });

    it("resetSoulLoader() causes getSoulLoader() to return a fresh instance", () => {
      const a = getSoulLoader();
      resetSoulLoader();
      const b = getSoulLoader();
      expect(a).not.toBe(b);
    });
  });
});
