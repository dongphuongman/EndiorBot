/**
 * Permission Message Formatters
 *
 * Format permission requests, decisions, and timeouts for Telegram display.
 *
 * @module commands/handlers/permission-formatters
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-024 Notification Bridge §8.4
 */

import type { PermissionRequest } from "../../bridge/types.js";
import { createPermissionKeyboard } from "../../channels/telegram/keyboards.js";
import type { InlineKeyboardMarkup } from "../../channels/telegram/keyboards.js";

import { sanitizeForEcho } from "./shared.js";

// ============================================================================
// Permission Approval (Sprint 85 — ADR-024 §8.4)
// ============================================================================

/**
 * Format a permission request as a Telegram message with inline keyboard.
 *
 * Returns the message text and InlineKeyboardMarkup for the bot to send.
 */
export function formatPermissionMessage(
  request: PermissionRequest,
): { text: string; keyboard: InlineKeyboardMarkup } {
  const fileInfo = request.filePath
    ? `\nFile: \`${sanitizeForEcho(request.filePath.slice(0, 60))}\``
    : "";

  const text = `🔐 *Permission Request*

Session: \`${request.sessionId}\`
Tool: *${sanitizeForEcho(request.toolName)}*${fileInfo}
Mode: ${request.riskMode}
Expires: 5 minutes

Approve or deny this operation:`;

  return {
    text,
    keyboard: createPermissionKeyboard(request.id),
  };
}

/**
 * Format a permission decision confirmation message.
 */
export function formatPermissionDecisionMessage(
  permissionId: string,
  decision: string,
  toolName: string,
): string {
  const icon = decision === "approve" ? "✅" : decision === "deny" ? "❌" : "⏰";
  const label = decision === "approve" ? "Approved" : decision === "deny" ? "Denied" : "Timed out";
  return `${icon} Permission *${label}*\n\nTool: ${sanitizeForEcho(toolName)}\nID: \`${permissionId}\``;
}

/**
 * Format a permission timeout notification.
 */
export function formatPermissionTimeoutMessage(
  request: PermissionRequest,
): string {
  return `⏰ Permission *timed out* (auto-denied)

Tool: ${sanitizeForEcho(request.toolName)}
Session: \`${request.sessionId}\``;
}
