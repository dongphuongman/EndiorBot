/**
 * Repos CLI Subcommand — TS-012, Sprint 146
 *
 * Thin wrapper around handleReposCommand for CLI parity.
 *
 * Subcommands:
 *   (default)         — List all registered repos
 *   add <name> <path> — Register a new repo
 *   remove <name>     — Unregister a repo
 *
 * Usage:
 *   endiorbot repos
 *   endiorbot repos add zpix /path/to/repo
 *   endiorbot repos remove zpix
 *
 * @module cli/commands/repos
 * @version 1.0.0
 * @date 2026-05-04
 * @status ACTIVE - Sprint 146 TS-012
 */

import type { Command } from "commander";
import { handleReposCommand } from "../../commands/remote-handlers.js";

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the repos command on a Commander program instance.
 *
 * Subcommands: (default=list), add, remove
 */
export function registerReposCommand(program: Command): void {
  const cmd = program
    .command("repos")
    .description("Manage registered repos (list, add, remove)");

  // Default action (no subcommand): list repos
  cmd.action(() => {
    const result = handleReposCommand([]);
    console.log(result.response);
    if (!result.success) {
      process.exit(1);
    }
  });

  // --- add ---
  cmd
    .command("add <name> <path>")
    .description("Register a new repo by name and absolute path")
    .action((name: string, repoPath: string) => {
      const result = handleReposCommand(["add", name, repoPath]);
      console.log(result.response);
      if (!result.success) {
        process.exit(1);
      }
    });

  // --- remove ---
  cmd
    .command("remove <name>")
    .description("Unregister a repo by name")
    .action((name: string) => {
      const result = handleReposCommand(["remove", name]);
      console.log(result.response);
      if (!result.success) {
        process.exit(1);
      }
    });
}
