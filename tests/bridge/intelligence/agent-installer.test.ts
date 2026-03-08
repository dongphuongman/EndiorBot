/**
 * Tests for AgentInstaller — Sprint 84 (ADR-025)
 *
 * Covers: creates 13 agent files in .claude/agents/, correct frontmatter
 * fields per role, skip-existing behaviour, force=true overwrite, and
 * fallback content when SOUL template is absent.
 *
 * @module tests/bridge/intelligence/agent-installer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { installAgents } from "../../../src/bridge/intelligence/agent-installer.js";
import { VALID_AGENT_ROLES } from "../../../src/bridge/intelligence/envelope.js";

// ============================================================================
// Helpers
// ============================================================================

/** Parse a simple YAML frontmatter block (single-line values only). */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1]!.split("\n");
  const out: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    out[key] = value;
  }
  return out;
}

// ============================================================================
// Tests
// ============================================================================

describe("AgentInstaller — installAgents()", () => {
  let projectDir: string;
  let templatesDir: string;
  let soulsDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "agent-installer-project-"));
    templatesDir = mkdtempSync(join(tmpdir(), "agent-installer-templates-"));
    soulsDir = join(templatesDir, "souls");
    mkdirSync(soulsDir, { recursive: true });

    // Write SOUL template for "pm" only (others will use fallback)
    const pmSoul = [
      "---",
      "role: pm",
      "category: executor",
      "version: 1.0.0",
      "---",
      "",
      "# PM SOUL",
      "",
      "You are the Product Manager agent.",
    ].join("\n");
    writeFileSync(join(soulsDir, "SOUL-pm.md"), pmSoul, "utf-8");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(templatesDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Creates 13 files
  // --------------------------------------------------------------------------

  describe("creates agent files", () => {
    it("creates exactly 13 agent files in .claude/agents/", () => {
      const result = installAgents(projectDir, { templatesRoot: templatesDir });

      expect(result.created).toBe(13);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(13);
    });

    it("creates a file for every role in VALID_AGENT_ROLES", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      for (const role of VALID_AGENT_ROLES) {
        const filePath = join(projectDir, ".claude", "agents", `${role}.md`);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it("creates the .claude/agents/ directory when it does not exist", () => {
      const agentsDir = join(projectDir, ".claude", "agents");
      expect(existsSync(agentsDir)).toBe(false);

      installAgents(projectDir, { templatesRoot: templatesDir });

      expect(existsSync(agentsDir)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Frontmatter correctness
  // --------------------------------------------------------------------------

  describe("frontmatter fields per role", () => {
    it("pm.md has correct name, model=sonnet, allowed-tools, max-turns=15", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "pm.md"),
        "utf-8",
      );
      const fm = parseFrontmatter(content);

      expect(fm["name"]).toBe("PM");
      expect(fm["model"]).toBe("sonnet");
      expect(fm["max-turns"]).toBe("15");
      expect(fm["allowed-tools"]).toContain("Read");
      expect(fm["allowed-tools"]).toContain("WebSearch");
    });

    it("architect.md has model=opus (architecture decisions use elite tier)", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "architect.md"),
        "utf-8",
      );
      const fm = parseFrontmatter(content);

      expect(fm["name"]).toBe("Architect");
      expect(fm["model"]).toBe("opus");
    });

    it("cto.md has model=opus (executive technical decisions use elite tier)", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "cto.md"),
        "utf-8",
      );
      const fm = parseFrontmatter(content);

      expect(fm["name"]).toBe("CTO");
      expect(fm["model"]).toBe("opus");
    });

    it("coder.md has Bash in allowed-tools and max-turns=20", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "coder.md"),
        "utf-8",
      );
      const fm = parseFrontmatter(content);

      expect(fm["allowed-tools"]).toContain("Bash");
      expect(fm["max-turns"]).toBe("20");
    });
  });

  // --------------------------------------------------------------------------
  // Skip existing files (no force)
  // --------------------------------------------------------------------------

  describe("skip existing files when force is not set", () => {
    it("skips an existing agent file and does not overwrite it", () => {
      // Pre-create pm.md with custom content
      const agentsDir = join(projectDir, ".claude", "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "pm.md"), "# My custom PM\n", "utf-8");

      const result = installAgents(projectDir, { templatesRoot: templatesDir });

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(12);

      // Custom content must be preserved
      const content = readFileSync(join(agentsDir, "pm.md"), "utf-8");
      expect(content).toBe("# My custom PM\n");
    });

    it("reports status='skipped' in details for the existing file", () => {
      const agentsDir = join(projectDir, ".claude", "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "coder.md"), "# Custom Coder\n", "utf-8");

      const result = installAgents(projectDir, { templatesRoot: templatesDir });

      const skippedDetail = result.details.find((d) => d.role === "coder");
      expect(skippedDetail?.status).toBe("skipped");
    });
  });

  // --------------------------------------------------------------------------
  // Force overwrite
  // --------------------------------------------------------------------------

  describe("force=true overwrites existing files", () => {
    it("overwrites existing agent file when force=true", () => {
      const agentsDir = join(projectDir, ".claude", "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "pm.md"), "# My custom PM\n", "utf-8");

      const result = installAgents(projectDir, {
        templatesRoot: templatesDir,
        force: true,
      });

      expect(result.created).toBe(13);
      expect(result.skipped).toBe(0);

      // File must now have installer-generated frontmatter
      const content = readFileSync(join(agentsDir, "pm.md"), "utf-8");
      expect(content).toContain("name: PM");
    });
  });

  // --------------------------------------------------------------------------
  // Missing SOUL template — minimal fallback
  // --------------------------------------------------------------------------

  describe("missing SOUL template uses minimal fallback", () => {
    it("creates agent file with minimal fallback body when SOUL-{role}.md is absent", () => {
      // coder has no SOUL file in our templatesDir
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "coder.md"),
        "utf-8",
      );

      // Must still have frontmatter
      expect(content).toContain("name: Coder");
      // Must have fallback body
      expect(content).toContain("Coder");
    });

    it("pm.md uses real SOUL content when SOUL-pm.md is present", () => {
      installAgents(projectDir, { templatesRoot: templatesDir });

      const content = readFileSync(
        join(projectDir, ".claude", "agents", "pm.md"),
        "utf-8",
      );

      // Body from the real SOUL template must be present
      expect(content).toContain("You are the Product Manager agent.");
      // Frontmatter from SOUL template must be stripped
      expect(content).not.toContain("category: executor");
    });
  });
});
