/**
 * Secrets Command Tests
 *
 * @module tests/cli/commands/secrets.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerSecretsCommand } from "../../../src/cli/commands/secrets.js";

// Mock keytar
vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
  },
}));

describe("Secrets Command", () => {
  let program: Command;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit
    registerSecretsCommand(program);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("secrets list", () => {
    it("should register list subcommand", async () => {
      const secretsCmd = program.commands.find((c) => c.name() === "secrets");
      expect(secretsCmd).toBeDefined();

      const listCmd = secretsCmd?.commands.find((c) => c.name() === "list");
      expect(listCmd).toBeDefined();
    });

    it("should execute list command without error", async () => {
      await program.parseAsync(["node", "test", "secrets", "list"]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should show keychain section", async () => {
      await program.parseAsync(["node", "test", "secrets", "list"]);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Keychain (OS Secure Storage)");
    });

    it("should show environment variables section", async () => {
      await program.parseAsync(["node", "test", "secrets", "list"]);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Environment Variables");
    });

    it("should show GitHub PAT status", async () => {
      await program.parseAsync(["node", "test", "secrets", "list"]);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("GitHub Models PAT");
    });

    it("should show ANTHROPIC_API_KEY status", async () => {
      await program.parseAsync(["node", "test", "secrets", "list"]);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("ANTHROPIC_API_KEY");
    });
  });
});
