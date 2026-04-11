/**
 * Command Catalog Tests — T1 (M0, Sprint 132)
 *
 * @module tests/commands/command-catalog
 * @sprint 132
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CommandDispatcher } from "../../src/commands/command-dispatcher.js";
import { createCommandDispatcher } from "../../src/commands/index.js";
import {
  buildCmdListResult,
  renderCmdListForChannel,
  type CmdListResult,
} from "../../src/commands/command-catalog.js";

describe("buildCmdListResult", () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
    dispatcher.register("agents", async () => ({ success: true, response: "ok" }));
    dispatcher.register("launch", async () => ({ success: true, response: "ok" }));
    dispatcher.register("help", async () => ({ success: true, response: "ok" }));
  });

  it("returns a CmdListResult envelope with meta fields populated", () => {
    const result = buildCmdListResult(dispatcher);

    expect(result).toHaveProperty("commands");
    expect(result).toHaveProperty("meta");
    expect(Array.isArray(result.commands)).toBe(true);

    const { meta } = result;
    expect(typeof meta.total).toBe("number");
    expect(typeof meta.filteredCount).toBe("number");
    expect(typeof meta.dispatcherVersion).toBe("string");
    expect(meta.dispatcherVersion).toHaveLength(8); // SHA-1 sliced to 8 chars
    expect(typeof meta.generatedAt).toBe("string");
    expect(new Date(meta.generatedAt).toISOString()).toBe(meta.generatedAt);
  });

  it("meta.total equals dispatcher.getRegisteredCommands().length", () => {
    const result = buildCmdListResult(dispatcher);
    expect(result.meta.total).toBe(dispatcher.getRegisteredCommands().length);
  });

  it("meta.filteredCount equals commands.length when no surface filter", () => {
    const result = buildCmdListResult(dispatcher);
    expect(result.meta.filteredCount).toBe(result.commands.length);
    expect(result.meta.surface).toBeNull();
  });

  it("commands array is non-empty when dispatcher has registered commands", () => {
    const result = buildCmdListResult(dispatcher);
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it("each entry has required fields", () => {
    const result = buildCmdListResult(dispatcher);
    for (const entry of result.commands) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(typeof entry.category).toBe("string");
      expect(Array.isArray(entry.parameters)).toBe(true);
      expect(typeof entry.sensitive).toBe("boolean");
      expect(typeof entry.requiresLink).toBe("boolean");
    }
  });

  it("surface filter sets meta.surface and filters commands", () => {
    // With surfaceAvailability: "all" for every command in v1,
    // filtering any valid surface should return all commands
    const result = buildCmdListResult(dispatcher, { surface: "telegram" });
    expect(result.meta.surface).toBe("telegram");
    // total is still UNFILTERED (that's the PoL invariant)
    expect(result.meta.total).toBe(dispatcher.getRegisteredCommands().length);
    // filteredCount may be <= total
    expect(result.meta.filteredCount).toBeLessThanOrEqual(result.meta.total);
    expect(result.meta.filteredCount).toBe(result.commands.length);
  });

  it("includeArgs: false strips parameters from entries", () => {
    const withArgs = buildCmdListResult(dispatcher);
    const withoutArgs = buildCmdListResult(dispatcher, { includeArgs: false });

    for (const entry of withoutArgs.commands) {
      expect(entry.parameters).toHaveLength(0);
    }
    // Totals unchanged
    expect(withoutArgs.meta.total).toBe(withArgs.meta.total);
  });

  it("dispatcherVersion is deterministic for same command set", () => {
    const r1 = buildCmdListResult(dispatcher);
    const r2 = buildCmdListResult(dispatcher);
    expect(r1.meta.dispatcherVersion).toBe(r2.meta.dispatcherVersion);
  });

  it("dispatcherVersion changes when command set changes", () => {
    const r1 = buildCmdListResult(dispatcher);
    dispatcher.register("new-cmd", async () => ({ success: true, response: "ok" }));
    const r2 = buildCmdListResult(dispatcher);
    expect(r1.meta.dispatcherVersion).not.toBe(r2.meta.dispatcherVersion);
  });

  it("full dispatcher: every registered command has an entry in the result", () => {
    const fullDispatcher = createCommandDispatcher();
    const result = buildCmdListResult(fullDispatcher);
    const names = new Set(result.commands.map((c) => c.name));
    for (const name of fullDispatcher.getRegisteredCommands()) {
      expect(names.has(name)).toBe(true);
    }
  });
});

describe("renderCmdListForChannel", () => {
  let result: CmdListResult;

  beforeEach(() => {
    const dispatcher = createCommandDispatcher();
    result = buildCmdListResult(dispatcher);
  });

  it("telegram output contains bold header", () => {
    const text = renderCmdListForChannel(result, "telegram");
    expect(text).toContain("*EndiorBot Commands*");
  });

  it("zalo/web output has plain header", () => {
    const text = renderCmdListForChannel(result, "web");
    expect(text).toContain("EndiorBot Commands");
    expect(text).not.toContain("*EndiorBot Commands*");
  });

  it("output lists every command name", () => {
    const text = renderCmdListForChannel(result, "telegram");
    for (const cmd of result.commands) {
      expect(text).toContain(`/${cmd.name}`);
    }
  });

  it("output includes total count", () => {
    const text = renderCmdListForChannel(result, "telegram");
    expect(text).toContain(`Total: ${result.meta.filteredCount}`);
  });
});
