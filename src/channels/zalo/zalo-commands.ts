/**
 * Zalo Command Handler
 *
 * Dispatches slash commands for Zalo channel by reusing shared handlers
 * from telegram-commands.ts and stripping Markdown for plain text output.
 *
 * Sprint 77 — ADR-020: OTT Channel Completion
 *
 * @module channels/zalo/zalo-commands
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 77
 * @authority ADR-020 OTT Channel Completion
 * @sprint 77
 */

import {
  handleAgentsCommand,
  handleTeamsCommand,
  handleGateCommand,
  handleComplianceCommand,
  handleFixCommand,
  handleConsultCommand,
  handleConfigCommand,
  handleInitCommand,
  sanitizeForEcho,
  type CommandResult,
} from "../telegram/telegram-commands.js";
import type { ZaloSendFn } from "./agent-handler.js";
import { getConversationStore } from "../conversation/store.js";

// ============================================================================
// Markdown Stripping (Telegram → Zalo Plain Text)
// ============================================================================

/**
 * Strip Telegram Markdown formatting for Zalo plain text.
 *
 * Zalo Bot Platform (zapps.me) is plain-text only — no formatting support.
 * This function converts Telegram Markdown to readable plain text.
 *
 * ADR-020 §4: stripMarkdown() Specification
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) =>       // ```fenced code``` → inner content
      m.slice(3, -3).replace(/^\w*\n/, ""))   // strip language hint line
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // **bold** → bold (before single-star)
    .replace(/\*([^*]+)\*/g, "$1")            // *bold* → bold
    .replace(/_([^_]+)_/g, "$1")              // _italic_ → italic
    .replace(/`([^`]+)`/g, "$1")              // `code` → code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [link](url) → link
    .replace(/\\([*_`\[\]()~>#+\-=|{}.!])/g, "$1"); // unescape
}

// ============================================================================
// Zalo Help Message (Plain Text)
// ============================================================================

/**
 * Generate plain-text help message for Zalo.
 * No Markdown formatting — Zalo Bot Platform is plain text only.
 */
export function generateZaloHelpMessage(): string {
  return `EndiorBot Commands

Workflow:
  /approve <id> - Approve pending request
  /reject <id> [reason] - Reject pending request
  /status - Show pending approvals

SDLC:
  /gate [gateId] - Quality gate status
  /compliance [score|check] - Compliance score
  /fix [--dry-run] [--stage <stage>] - Compliance fix
  /init - Project init status

AI:
  /consult <query> - Multi-model consultation
  /agents - List all agents
  /teams - List tier teams

System:
  /config - Project config
  /help - This message

Agent mention:
  @agent task or [@agent: task]
  Example: @pm plan payment gateway

Team mention:
  @team task (routes to leader)
  Example: @planning review sprint goals

Note: /mode and /webhook are Telegram-only.
  /clear - Clear conversation history`;
}

// ============================================================================
// Zalo OTT Workflow Handlers (approve/reject/status)
// ============================================================================

/**
 * Handle /approve on Zalo — info message directing to Telegram/CLI.
 *
 * Zalo does not have ApprovalQueue integration (Telegram-specific).
 * ADR-020 §2: lightweight Zalo equivalents return info messages.
 */
function handleZaloApprove(args: string[]): CommandResult {
  const id = args[0];
  if (!id) {
    return {
      success: true,
      response: "Approve - Usage: /approve <id>\n\nTo approve, use Telegram or CLI:\n  endiorbot approve <id>",
    };
  }

  const safeId = sanitizeForEcho(id);
  return {
    success: true,
    response: `Approve request: ${safeId}\n\nApproval actions are available via:\n  - Telegram: /approve ${safeId}\n  - CLI: endiorbot approve ${safeId}`,
  };
}

/**
 * Handle /reject on Zalo — info message directing to Telegram/CLI.
 */
function handleZaloReject(args: string[]): CommandResult {
  const id = args[0];
  if (!id) {
    return {
      success: true,
      response: "Reject - Usage: /reject <id> [reason]\n\nTo reject, use Telegram or CLI:\n  endiorbot reject <id> [reason]",
    };
  }

  const safeId = sanitizeForEcho(id);
  const safeReason = sanitizeForEcho(args.slice(1).join(" ") || "(no reason)");
  return {
    success: true,
    response: `Reject request: ${safeId}\nReason: ${safeReason}\n\nRejection actions are available via:\n  - Telegram: /reject ${safeId} ${safeReason}\n  - CLI: endiorbot reject ${safeId} "${safeReason}"`,
  };
}

/**
 * Handle /status on Zalo — info message directing to Telegram/CLI.
 */
function handleZaloStatus(): CommandResult {
  return {
    success: true,
    response: "Status: Check pending approvals via:\n  - Telegram: /status\n  - CLI: endiorbot status\n\nZalo channel is READ-only (no direct approval actions).",
  };
}

// ============================================================================
// Main Command Dispatcher
// ============================================================================

/**
 * Handle a slash command from Zalo.
 *
 * Parses command + args, routes to shared handler, strips Markdown.
 * Returns true if command was handled, false if unknown (falls through to mention handler).
 *
 * ADR-020 §1: Command detection before agent mention check.
 */
export async function handleZaloCommand(
  text: string,
  sendFn: ZaloSendFn,
  chatId?: string,
): Promise<boolean> {
  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  let result: CommandResult | null = null;

  switch (command) {
    case "/help":
      result = { success: true, response: generateZaloHelpMessage() };
      break;
    case "/agents":
      result = handleAgentsCommand();
      break;
    case "/teams":
      result = handleTeamsCommand();
      break;
    case "/gate":
      result = handleGateCommand(args);
      break;
    case "/compliance":
      result = handleComplianceCommand(args);
      break;
    case "/fix":
      result = handleFixCommand(args);
      break;
    case "/consult":
      result = handleConsultCommand(args);
      break;
    case "/config":
      result = handleConfigCommand();
      break;
    case "/init":
      result = handleInitCommand();
      break;
    case "/approve":
      result = handleZaloApprove(args);
      break;
    case "/reject":
      result = handleZaloReject(args);
      break;
    case "/status":
      result = handleZaloStatus();
      break;
    case "/clear": {
      // B3: Clear conversation history for this chat
      if (chatId) {
        getConversationStore().clear(chatId);
      }
      result = { success: true, response: "🗑 Conversation cleared." };
      break;
    }
    default:
      return false; // Unknown command — fall through to mention handler
  }

  if (result?.response) {
    await sendFn(stripMarkdown(result.response));
    return true;
  }

  return false;
}
