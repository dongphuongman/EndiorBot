/**
 * Audit CLI Subcommand — TS-012, Sprint 146
 *
 * Thin wrapper around handleAuditCommand for CLI parity.
 *
 * Subcommands:
 *   permissions [--limit N]  — Permission decisions
 *   exec-policy [--limit N]  — Exec-policy allow/deny/prompt records
 *   ssrf [--limit N]         — SSRF blocked requests
 *   webhooks [--limit N]     — Webhook dispatch events
 *
 * Usage:
 *   endiorbot audit
 *   endiorbot audit exec-policy --limit 5
 *   endiorbot audit ssrf --limit 20
 *
 * @module cli/commands/audit
 * @version 1.0.0
 * @date 2026-05-04
 * @status ACTIVE - Sprint 146 TS-012
 */

import type { Command } from "commander";
import { handleAuditCommand } from "../../commands/handlers/audit-commands.js";

// ============================================================================
// Helpers
// ============================================================================

function buildArgs(subcommand: string, options: { limit?: string }): string[] {
  const args: string[] = [subcommand];
  if (options.limit !== undefined) {
    args.push("--limit", options.limit);
  }
  return args;
}

function dispatch(args: string[]): void {
  const result = handleAuditCommand(args);
  console.log(result.response);
  if (!result.success) {
    process.exit(1);
  }
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the audit command on a Commander program instance.
 *
 * Subcommands: permissions, exec-policy, ssrf, webhooks
 */
export function registerAuditCommand(program: Command): void {
  const cmd = program
    .command("audit")
    .description("View audit logs (permissions, exec-policy, ssrf, webhooks)");

  // Default action: show help listing
  cmd.action(() => {
    const result = handleAuditCommand([]);
    console.log(result.response);
  });

  // --- permissions ---
  cmd
    .command("permissions")
    .description("Show permission decision audit log")
    .option("--limit <n>", "Number of records to show")
    .action((opts: { limit?: string }) => {
      dispatch(buildArgs("permissions", opts));
    });

  // --- exec-policy ---
  cmd
    .command("exec-policy")
    .description("Show exec-policy allow/deny/prompt audit log")
    .option("--limit <n>", "Number of records to show")
    .action((opts: { limit?: string }) => {
      dispatch(buildArgs("exec-policy", opts));
    });

  // --- ssrf ---
  cmd
    .command("ssrf")
    .description("Show SSRF blocked requests audit log")
    .option("--limit <n>", "Number of records to show")
    .action((opts: { limit?: string }) => {
      dispatch(buildArgs("ssrf", opts));
    });

  // --- webhooks ---
  cmd
    .command("webhooks")
    .description("Show webhook dispatch events audit log")
    .option("--limit <n>", "Number of records to show")
    .action((opts: { limit?: string }) => {
      dispatch(buildArgs("webhooks", opts));
    });
}
