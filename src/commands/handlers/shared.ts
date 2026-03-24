/**
 * Shared utilities for command handlers.
 *
 * @module commands/handlers/shared
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 */

import type { TeamId } from "../../agents/types/team.js";

/**
 * Sanitize user input for safe echo in Telegram Markdown responses.
 * Strips Markdown special chars and limits length to prevent injection.
 */
export function sanitizeForEcho(input: string): string {
  return input
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // Markdown links → text only
    .replace(/https?:\/\/\S+/g, "")           // Strip http(s) URLs
    .replace(/www\.\S+/g, "")                  // Strip www. URLs
    .replace(/[*_`\[\]()~>#+|{}\\]/g, "")     // Strip markdown chars
    .replace(/\s+/g, " ")                       // Collapse whitespace
    .trim()
    .slice(0, 80);
}

// ============================================================================
// Agent & Team Icons
// ============================================================================

export const TEAM_ICONS: Record<TeamId, string> = {
  fullstack: "🛠️",
  planning: "📋",
  design: "🎨",
  dev: "💻",
  qa: "🧪",
  ops: "🚀",
  executive: "👔",
};
