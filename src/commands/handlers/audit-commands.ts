/**
 * Audit Commands — /audit permissions
 *
 * Sprint 125 scope: ONLY /audit permissions [--limit N]
 * No generic /audit taxonomy until defined (CPO condition).
 *
 * @module commands/handlers/audit-commands
 * @version 1.0.0
 * @date 2026-04-01
 * @status ACTIVE — Sprint 125
 * @authority ADR-041 Permission Audit Trail
 * @sdlc SDLC Framework 6.3.0
 */

import { queryRecentDecisions, formatAuditEntries } from "../../security/permission-audit.js";
import type { CommandResult } from "../command-dispatcher.js";

/**
 * Handle /audit permissions [--limit N]
 */
export function handleAuditCommand(args: string[]): CommandResult {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand !== "permissions") {
    return {
      success: false,
      response: "Usage: /audit permissions [--limit N]\nOnly `/audit permissions` is available in Sprint 125.",
    };
  }

  // Parse --limit flag
  let limit = 10;
  const limitIdx = args.indexOf("--limit");
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    const parsed = parseInt(args[limitIdx + 1]!, 10);
    if (!isNaN(parsed) && parsed > 0) limit = Math.min(parsed, 50);
  }

  const entries = queryRecentDecisions(limit);
  const formatted = formatAuditEntries(entries);

  return {
    success: true,
    response: `📋 *Permission Audit*\n\n${formatted}`,
  };
}
