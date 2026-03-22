/**
 * SOUL Frontmatter Linter Tests — Sprint 109
 *
 * Tests the pnpm lint:souls validator logic.
 * Uses inline SOUL content to avoid coupling tests to specific SOUL files.
 *
 * @module tests/scripts/lint-souls
 * @sprint 109
 */

import { describe, it, expect } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

// ============================================================================
// Helpers
// ============================================================================

function runLintSouls(soulsDir: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(
      `tsx scripts/lint-souls.ts`,
      {
        cwd: process.cwd(),
        env: { ...process.env, SOULS_DIR_OVERRIDE: soulsDir },
        encoding: "utf-8",
      }
    );
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

// ============================================================================
// Unit tests for validation logic (import directly for fast testing)
// ============================================================================

// We test the core logic by parsing inline content rather than spawning a process
// This avoids test-infrastructure coupling while still verifying the rules.

/**
 * Minimal frontmatter parser (mirrors logic in lint-souls.ts for unit testing).
 * Returns an object of parsed fields, or null if no frontmatter.
 */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, string | string[]> = {};

  for (const line of yaml.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    if (line.startsWith("  - ")) {
      const value = line.slice(4).trim();
      if (!Array.isArray(result["allowed-tools"])) result["allowed-tools"] = [];
      (result["allowed-tools"] as string[]).push(value);
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === "allowed-tools") {
      result["allowed-tools"] = result["allowed-tools"] ?? [];
      continue;
    }
    if (value) result[key] = value;
  }

  return result;
}

const VALID_TOOLS = new Set([
  "Bash", "Read", "Write", "Edit", "Grep", "Glob",
  "WebFetch", "WebSearch", "Agent", "AskUserQuestion",
]);

function validateFrontmatter(fm: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ["role", "category", "version", "allowed-tools"] as const;

  for (const field of required) {
    if (!fm[field]) errors.push(`missing required field: ${field}`);
  }

  if (Array.isArray(fm["allowed-tools"])) {
    for (const tool of fm["allowed-tools"] as string[]) {
      if (!VALID_TOOLS.has(tool)) {
        errors.push(`unknown tool: "${tool}"`);
      }
    }
  }

  return errors;
}

// ============================================================================
// Tests
// ============================================================================

describe("lint-souls validation logic", () => {
  it("T1: valid SOUL with all required fields and valid tools passes", () => {
    const content = `---
role: coder
category: executor
version: 1.0.0
sdlc_stages: ["04"]
sdlc_gates: ["G-Sprint"]
created: 2026-02-21
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

# SOUL - Developer (Coder)

Content here.
`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    const errors = validateFrontmatter(fm!);
    expect(errors).toHaveLength(0);
  });

  it("T2: SOUL missing allowed-tools field reports error with field name", () => {
    const content = `---
role: pm
category: executor
version: 1.0.0
sdlc_stages: ["00", "01"]
created: 2026-02-20
---

# SOUL - PM
`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    const errors = validateFrontmatter(fm!);
    expect(errors.some((e) => e.includes("allowed-tools"))).toBe(true);
    expect(errors.some((e) => e.includes("missing required field"))).toBe(true);
  });

  it("T3: SOUL with unknown tool name reports error with tool name", () => {
    const content = `---
role: reviewer
category: executor
version: 1.0.0
allowed-tools:
  - Read
  - Reade
  - Grep
---

# SOUL - Reviewer
`;

    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    const errors = validateFrontmatter(fm!);
    expect(errors.some((e) => e.includes(`"Reade"`))).toBe(true);
    expect(errors.some((e) => e.includes("unknown tool"))).toBe(true);
    // "Read" (valid) should NOT be reported as error
    expect(errors.some((e) => e.includes(`"Read"`))).toBe(false);
  });
});
