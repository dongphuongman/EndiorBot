/**
 * Webhooks CLI Subcommand — TS-012, Sprint 146
 *
 * Thin wrapper around handleWebhookOttCommand for CLI parity.
 *
 * Subcommands:
 *   list  — Show registered webhook triggers
 *   test  — Show how to test a trigger via curl
 *
 * Usage:
 *   endiorbot webhooks list
 *   endiorbot webhooks test
 *
 * @module cli/commands/webhooks
 * @version 1.0.0
 * @date 2026-05-04
 * @status ACTIVE - Sprint 146 TS-012
 */

import type { Command } from "commander";
import { handleWebhookOttCommand } from "../../commands/handlers/webhook-commands.js";

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the webhooks command on a Commander program instance.
 *
 * Subcommands: list, test
 */
export function registerWebhooksCommand(program: Command): void {
  const cmd = program
    .command("webhooks")
    .description("Manage and inspect webhook triggers");

  // Default action: show help listing
  cmd.action(() => {
    const result = handleWebhookOttCommand([]);
    console.log(result.response);
  });

  // --- list ---
  cmd
    .command("list")
    .description("Show registered webhook triggers")
    .action(() => {
      const result = handleWebhookOttCommand(["list"]);
      console.log(result.response);
      if (!result.success) {
        process.exit(1);
      }
    });

  // --- test ---
  cmd
    .command("test")
    .description("Show how to test a webhook trigger via curl")
    .action(() => {
      const result = handleWebhookOttCommand(["test"]);
      console.log(result.response);
      if (!result.success) {
        process.exit(1);
      }
    });
}
