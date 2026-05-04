/**
 * Reject CLI Subcommand — TS-012, Sprint 146
 *
 * Thin wrapper for rejecting a pending approval request from CLI.
 * CLI actor defaults to "cli-user" (solo dev tool — one user, no ambiguity).
 *
 * Usage:
 *   endiorbot reject <approval-id>
 *
 * @module cli/commands/reject
 * @version 1.0.0
 * @date 2026-05-04
 * @status ACTIVE - Sprint 146 TS-012
 */

import type { Command } from "commander";
import { getApprovalQueue } from "../../approval/queue.js";

/** CLI actor identifier (D2: implicit actor for solo-dev tool). */
const CLI_ACTOR = "cli-user";

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the reject command on a Commander program instance.
 */
export function registerRejectCommand(program: Command): void {
  program
    .command("reject <approval-id>")
    .description("Reject a pending approval request")
    .action((approvalId: string) => {
      const queue = getApprovalQueue();
      const request = queue.get(approvalId);

      if (!request) {
        console.error(`Approval "${approvalId}" not found.`);
        process.exit(1);
      }

      if (request.status !== "pending") {
        console.error(`Request already ${request.status}.`);
        process.exit(1);
      }

      request.status = "rejected";
      request.respondedAt = Date.now();
      request.respondedBy = CLI_ACTOR;

      console.log(`Rejected: ${request.message}`);
    });
}
