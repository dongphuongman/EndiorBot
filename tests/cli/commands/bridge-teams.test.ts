/**
 * CLI Tests for `bridge install-teams` — Sprint 89 (ADR-026)
 *
 * Covers: subcommand existence, help output, flag parsing.
 * Core logic tested in team-installer.test.ts.
 *
 * @module tests/cli/commands/bridge-teams
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const CLI = join(process.cwd(), "endiorbot.mjs");

function run(args: string[]): string {
  try {
    return execFileSync(CLI, args, {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch (err) {
    // Commander outputs help to stdout on success, stderr on error
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("CLI: bridge install-teams", () => {
  it("should show help for install-teams subcommand", () => {
    const output = run(["bridge", "install-teams", "--help"]);
    expect(output).toContain("install-teams");
    expect(output).toContain("<path>");
    expect(output).toContain("--force");
    expect(output).toContain("--tier");
  });

  it("should show install-teams in bridge help", () => {
    const output = run(["bridge", "--help"]);
    expect(output).toContain("install-teams");
    expect(output).toContain("team leader agent files");
  });

  it("should fail with clear error when AGENT_TEAMS flag is disabled", () => {
    const output = run(["bridge", "install-teams", "."]);
    expect(output).toContain("AGENT_TEAMS");
  });

  it("should fail for nonexistent path", () => {
    const output = run(["bridge", "install-teams", "/nonexistent/path/12345"]);
    expect(output).toContain("not found");
  });
});
