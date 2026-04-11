/**
 * Commands List CLI Subcommand — M0, Sprint 132
 *
 * Exposes `endiorbot commands` to the CLI surface.
 * Calls buildCmdListResult() directly against a fresh dispatcher — no HTTP
 * round-trip — preserving the five-equal-numbers PoL invariant via shared
 * function, not shared endpoint.
 *
 * Usage:
 *   endiorbot commands                     # human-readable grouped table
 *   endiorbot commands --json              # raw JSON envelope
 *   endiorbot commands --surface cli       # filter by surface
 *   endiorbot commands --category bridge   # filter by category
 *
 * @module cli/commands/commands-list
 * @version 1.0.0
 * @sprint 132
 */

import type { Command } from "commander";
import { createCommandDispatcher } from "../../commands/index.js";
import {
  buildCmdListResult,
  type CmdEntry,
  type CmdListResult,
} from "../../commands/command-catalog.js";

// ============================================================================
// Output formatting
// ============================================================================

const CATEGORY_ORDER = ["workflow", "sdlc", "ai", "bridge", "remote", "system", "uncategorized"];

/**
 * Human-readable grouped table output.
 * Groups by category in the canonical ordering.
 */
function formatHumanReadable(result: CmdListResult, categoryFilter?: string): void {
  const byCategory = new Map<string, CmdEntry[]>();
  for (const entry of result.commands) {
    if (categoryFilter && entry.category !== categoryFilter) continue;
    const bucket = byCategory.get(entry.category) ?? [];
    bucket.push(entry);
    byCategory.set(entry.category, bucket);
  }

  const allCategories = [...CATEGORY_ORDER, ...byCategory.keys()].filter(
    (c, i, arr) => arr.indexOf(c) === i,
  );

  console.log("");
  console.log("EndiorBot Commands");
  console.log("=".repeat(50));

  let shown = 0;
  for (const cat of allCategories) {
    const cmds = byCategory.get(cat);
    if (!cmds || cmds.length === 0) continue;

    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    console.log(`\n${label}:`);

    for (const cmd of cmds) {
      const flags: string[] = [];
      if (cmd.sensitive) flags.push("sensitive");
      if (cmd.requiresLink) flags.push("requires-link");
      const flagStr = flags.length > 0 ? `  [${flags.join(", ")}]` : "";
      console.log(`  /${cmd.name.padEnd(14)} ${cmd.description}${flagStr}`);
      shown++;
    }
  }

  console.log("");
  console.log(`Total: ${shown} command${shown !== 1 ? "s" : ""}  |  dispatcher v${result.meta.dispatcherVersion}`);
  console.log("");
}

// ============================================================================
// Command registration
// ============================================================================

/**
 * Register `endiorbot commands` subcommand on the Commander program.
 */
export function registerCommandsListCommand(program: Command): void {
  program
    .command("commands")
    .description("List all available commands (M0 unified command discovery)")
    .option("--json", "Output raw JSON envelope instead of formatted table")
    .option(
      "--surface <surface>",
      "Filter by surface (web, telegram, zalo, cli)",
    )
    .option("--category <category>", "Filter output by category")
    .action(
      (options: { json?: boolean; surface?: string; category?: string }) => {
        const dispatcher = createCommandDispatcher();

        // Validate surface option if provided
        const validSurfaces = ["web", "telegram", "zalo", "cli"] as const;
        type ValidSurface = (typeof validSurfaces)[number];

        // exactOptionalPropertyTypes: build params object conditionally
        const params: { surface?: ValidSurface } = {};
        if (options.surface) {
          if (!validSurfaces.includes(options.surface as ValidSurface)) {
            console.error(
              `Error: --surface must be one of: ${validSurfaces.join(", ")}`,
            );
            process.exit(1);
          }
          params.surface = options.surface as ValidSurface;
        }

        const result = buildCmdListResult(dispatcher, params);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        formatHumanReadable(result, options.category);
      },
    );
}
