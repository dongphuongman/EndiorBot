/**
 * Serve Command Tests — Sprint 93
 *
 * Tests the unified startup command registration and options.
 *
 * @module tests/cli/serve-command
 * @sprint 93
 */

import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerServeCommand } from "../../src/cli/commands/serve.js";

describe("registerServeCommand", () => {
  it("registers serve command on program", () => {
    const program = new Command();
    registerServeCommand(program);

    const serveCmd = program.commands.find(
      (cmd) => cmd.name() === "serve",
    );

    expect(serveCmd).toBeDefined();
    expect(serveCmd!.description()).toContain("unified");
  });

  it("has --no-telegram and --no-zalo options", () => {
    const program = new Command();
    registerServeCommand(program);

    const serveCmd = program.commands.find(
      (cmd) => cmd.name() === "serve",
    )!;

    const options = serveCmd.options.map((o) => o.long);
    expect(options).toContain("--no-telegram");
    expect(options).toContain("--no-zalo");
  });

  it("has --port option", () => {
    const program = new Command();
    registerServeCommand(program);

    const serveCmd = program.commands.find(
      (cmd) => cmd.name() === "serve",
    )!;

    const portOpt = serveCmd.options.find((o) => o.long === "--port");
    expect(portOpt).toBeDefined();
  });

  it("does not collide with start command (B1)", () => {
    const program = new Command();
    program.command("start").description("Existing start command");
    registerServeCommand(program);

    const commands = program.commands.map((cmd) => cmd.name());
    expect(commands).toContain("start");
    expect(commands).toContain("serve");
    expect(commands.filter((c) => c === "start").length).toBe(1);
    expect(commands.filter((c) => c === "serve").length).toBe(1);
  });
});
