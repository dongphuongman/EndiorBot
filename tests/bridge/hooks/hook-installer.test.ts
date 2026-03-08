/**
 * Tests for Hook Installer — Sprint 86 (ADR-024 §8.5)
 *
 * Covers: install fresh, idempotent skip, force overwrite,
 * settings.json merge, directory creation, chmod.
 *
 * @module tests/bridge/hooks/hook-installer
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { installHooks } from "../../../src/bridge/hooks/hook-installer.js";

// ============================================================================
// Helpers
// ============================================================================

function createTempDir(): string {
  const dir = join(tmpdir(), `endiorbot-test-hooks-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("installHooks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  // --------------------------------------------------------------------------
  // Fresh install
  // --------------------------------------------------------------------------

  it("installs hooks into fresh project (no .claude dir)", () => {
    const result = installHooks(tempDir);

    expect(result.installed).toBe(2); // stop.sh + pre-tool-use.sh
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Hook scripts exist
    expect(existsSync(join(tempDir, ".claude/hooks/stop.sh"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude/hooks/pre-tool-use.sh"))).toBe(true);

    // Settings.json exists with hooks
    const settings = JSON.parse(readFileSync(join(tempDir, ".claude/settings.json"), "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it("creates .claude directory if missing", () => {
    expect(existsSync(join(tempDir, ".claude"))).toBe(false);
    installHooks(tempDir);
    expect(existsSync(join(tempDir, ".claude"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude/hooks"))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Idempotent
  // --------------------------------------------------------------------------

  it("skips existing hook scripts on re-run", () => {
    // First install
    const first = installHooks(tempDir);
    expect(first.installed).toBe(2);

    // Second install (no force)
    const second = installHooks(tempDir);
    expect(second.installed).toBe(0);
    expect(second.skipped).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Force overwrite
  // --------------------------------------------------------------------------

  it("overwrites existing hooks with --force", () => {
    // First install
    installHooks(tempDir);

    // Modify a hook
    writeFileSync(join(tempDir, ".claude/hooks/stop.sh"), "# modified", "utf-8");

    // Force re-install
    const result = installHooks(tempDir, { force: true });
    expect(result.installed).toBe(2);
    expect(result.skipped).toBe(0);

    // Content restored
    const content = readFileSync(join(tempDir, ".claude/hooks/stop.sh"), "utf-8");
    expect(content).toContain("EndiorBot Bridge");
  });

  // --------------------------------------------------------------------------
  // Settings.json preservation
  // --------------------------------------------------------------------------

  it("preserves existing settings.json keys", () => {
    // Create existing settings.json with other keys
    mkdirSync(join(tempDir, ".claude"), { recursive: true });
    writeFileSync(
      join(tempDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Read"] }, defaultModel: "sonnet" }, null, 2),
      "utf-8",
    );

    installHooks(tempDir);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions).toEqual({ allow: ["Read"] });
    expect(settings.defaultModel).toBe("sonnet");
    expect(settings.hooks).toBeDefined();
  });

  it("merges hooks into existing settings.json without overwriting existing hooks", () => {
    mkdirSync(join(tempDir, ".claude"), { recursive: true });
    writeFileSync(
      join(tempDir, ".claude/settings.json"),
      JSON.stringify({ hooks: { CustomHook: [{ matcher: "", hooks: [] }] } }, null, 2),
      "utf-8",
    );

    // Need to remove hook scripts so they get installed
    installHooks(tempDir);

    const settings = JSON.parse(readFileSync(join(tempDir, ".claude/settings.json"), "utf-8"));
    // Custom hook preserved
    expect(settings.hooks.CustomHook).toBeDefined();
    // New hooks added
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Hook script content
  // --------------------------------------------------------------------------

  it("hook scripts contain correct shebang and jq parsing", () => {
    installHooks(tempDir);

    const stopContent = readFileSync(join(tempDir, ".claude/hooks/stop.sh"), "utf-8");
    expect(stopContent).toContain("#!/bin/bash");
    expect(stopContent).toContain("cat /dev/stdin");
    expect(stopContent).toContain("jq");

    const preContent = readFileSync(join(tempDir, ".claude/hooks/pre-tool-use.sh"), "utf-8");
    expect(preContent).toContain("#!/bin/bash");
    expect(preContent).toContain("TOOL_NAME");
    expect(preContent).toContain("FILE_PATH");
  });

  // --------------------------------------------------------------------------
  // CTO W2: chmod
  // --------------------------------------------------------------------------

  it("hook scripts are executable (chmod 755)", () => {
    installHooks(tempDir);

    const stopStat = statSync(join(tempDir, ".claude/hooks/stop.sh"));
    // Check executable bit (owner execute = 0o100)
    // eslint-disable-next-line no-bitwise
    expect(stopStat.mode & 0o111).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Result details
  // --------------------------------------------------------------------------

  it("returns detailed per-hook status", () => {
    const result = installHooks(tempDir);

    expect(result.details).toHaveLength(2);
    expect(result.details[0]).toMatchObject({ hook: "Stop", status: "installed" });
    expect(result.details[1]).toMatchObject({ hook: "PreToolUse", status: "installed" });
  });
});
