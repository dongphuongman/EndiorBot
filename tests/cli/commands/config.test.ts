/**
 * Config Command Tests
 *
 * @module tests/cli/commands/config.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerConfigCommand } from "../../../src/cli/commands/config.js";

describe("Config Command", () => {
  let program: Command;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit
    registerConfigCommand(program);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("config set", () => {
    it("should register set subcommand", async () => {
      const configCmd = program.commands.find((c) => c.name() === "config");
      expect(configCmd).toBeDefined();

      const setCmd = configCmd?.commands.find((c) => c.name() === "set");
      expect(setCmd).toBeDefined();
    });

    it("should reject apiKey with helpful error", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "apiKey", "test123"])
      ).rejects.toThrow("process.exit called");

      const output = consoleErrorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("API keys must not be stored in config");
      expect(output).toContain("endiorbot setup github");
    });

    it("should reject api_key variations", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "api_key", "test"])
      ).rejects.toThrow("process.exit called");
    });

    it("should reject accessToken", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "accessToken", "test"])
      ).rejects.toThrow("process.exit called");
    });

    it("should reject secret variations", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "mySecret", "test"])
      ).rejects.toThrow("process.exit called");
    });

    it("should reject token variations", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "botToken", "test"])
      ).rejects.toThrow("process.exit called");
    });

    it("should reject password", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "password", "test"])
      ).rejects.toThrow("process.exit called");
    });

    it("should reject pat variations", async () => {
      await expect(
        program.parseAsync(["node", "test", "config", "set", "githubPat", "test"])
      ).rejects.toThrow("process.exit called");
    });
  });
});
