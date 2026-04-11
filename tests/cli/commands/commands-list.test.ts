/**
 * commands-list CLI Subcommand Tests — T3 (M0, Sprint 132)
 *
 * @module tests/cli/commands/commands-list
 * @sprint 132
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCommandDispatcher } from "../../../src/commands/index.js";
import {
  buildCmdListResult,
  type CmdListResult,
} from "../../../src/commands/command-catalog.js";

// ============================================================================
// Tests: buildCmdListResult CLI code path (no HTTP round-trip)
// ============================================================================

describe("commands CLI subcommand code path", () => {
  it("buildCmdListResult --json path: returns parseable JSON envelope", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);

    // Simulate --json output
    const jsonStr = JSON.stringify(result, null, 2);
    const parsed = JSON.parse(jsonStr) as CmdListResult;

    expect(parsed).toHaveProperty("commands");
    expect(parsed).toHaveProperty("meta");
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.meta.total).toBeGreaterThan(0);
  });

  it("meta.total equals dispatcher.getRegisteredCommands().length", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    expect(result.meta.total).toBe(dispatcher.getRegisteredCommands().length);
  });

  it("human-mode: groups by category covering all commands", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);

    const categories = new Set(result.commands.map((c) => c.category));
    expect(categories.size).toBeGreaterThan(1);

    // Check at least known categories are present
    const knownCategories = ["workflow", "sdlc", "ai", "bridge", "remote", "system"];
    for (const cat of knownCategories) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it("human-mode: every command name appears at least once in commands array", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    const registeredNames = new Set(dispatcher.getRegisteredCommands());
    const catalogNames = new Set(result.commands.map((c) => c.name));

    for (const name of registeredNames) {
      expect(catalogNames.has(name)).toBe(true);
    }
  });

  it("--surface cli filter: returns subset or equal set of commands", () => {
    const dispatcher = createCommandDispatcher();
    const allResult = buildCmdListResult(dispatcher);
    const cliResult = buildCmdListResult(dispatcher, { surface: "cli" });

    // total is still unfiltered
    expect(cliResult.meta.total).toBe(allResult.meta.total);
    // filtered count <= total
    expect(cliResult.meta.filteredCount).toBeLessThanOrEqual(cliResult.meta.total);
    expect(cliResult.meta.surface).toBe("cli");
  });

  it("--json output: commands array is non-empty", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("all commands registered: 'commands' command itself is present", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    const names = result.commands.map((c) => c.name);
    expect(names).toContain("commands");
  });

  it("help command is present", () => {
    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    const names = result.commands.map((c) => c.name);
    expect(names).toContain("help");
  });
});

describe("commands CLI subcommand stdout capture", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("console.log emits JSON string when --json flag would be used", () => {
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const dispatcher = createCommandDispatcher();
    const result = buildCmdListResult(dispatcher);
    console.log(JSON.stringify(result, null, 2));

    consoleSpy.mockRestore();

    expect(logs.length).toBeGreaterThan(0);
    const output = logs.join("\n");
    const parsed = JSON.parse(output) as CmdListResult;
    expect(parsed.meta.total).toBe(dispatcher.getRegisteredCommands().length);
  });
});
