/**
 * Telegram Inline Keyboards
 *
 * Creates inline keyboard markup for Telegram bot interactions.
 * Used for handoff buttons, confirmations, and quick actions.
 *
 * @module channels/telegram/keyboards
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 57
 * @authority Master Plan v3.1
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import type { AgentRole } from "../../agents/types/handoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Telegram inline keyboard button.
 */
export interface InlineKeyboardButton {
  /** Button label */
  text: string;
  /** Callback data (for callback_query) */
  callback_data?: string;
  /** URL to open */
  url?: string;
}

/**
 * Telegram inline keyboard markup.
 */
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Callback data prefix for parsing.
 */
export const CALLBACK_PREFIX = {
  HANDOFF: "handoff:",
  CONFIRM: "confirm:",
  REJECT: "reject:",
  CANCEL: "cancel:",
} as const;

// ============================================================================
// Keyboard Builders
// ============================================================================

/**
 * Create handoff inline keyboard.
 *
 * Shows buttons to continue to suggested agents.
 */
export function createHandoffKeyboard(
  handoffs: Array<{
    agent: AgentRole;
    intent: string;
    priority: string;
  }>
): InlineKeyboardMarkup {
  const buttons: InlineKeyboardButton[][] = [];

  // Add handoff buttons (one per row for better visibility on mobile)
  for (const handoff of handoffs) {
    const icon = getAgentIcon(handoff.agent);
    const priorityTag = handoff.priority === "HIGH" ? "⚡" : "";

    buttons.push([
      {
        text: `${icon} Continue to @${handoff.agent} ${priorityTag}`,
        callback_data: `${CALLBACK_PREFIX.HANDOFF}${handoff.agent}:${encodeIntent(handoff.intent)}`,
      },
    ]);
  }

  // Add cancel button
  buttons.push([
    {
      text: "❌ Cancel Workflow",
      callback_data: `${CALLBACK_PREFIX.CANCEL}workflow`,
    },
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Create confirmation keyboard for patch application.
 */
export function createPatchConfirmKeyboard(
  patchId: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Apply Patch",
          callback_data: `${CALLBACK_PREFIX.CONFIRM}${patchId}`,
        },
        {
          text: "❌ Reject",
          callback_data: `${CALLBACK_PREFIX.REJECT}${patchId}`,
        },
      ],
    ],
  };
}

/**
 * Create quick agent selection keyboard.
 */
export function createAgentSelectionKeyboard(): InlineKeyboardMarkup {
  const agents: AgentRole[] = ["pm", "architect", "coder", "reviewer"];

  const buttons: InlineKeyboardButton[][] = [];

  // Two agents per row
  for (let i = 0; i < agents.length; i += 2) {
    const row: InlineKeyboardButton[] = [];

    for (let j = 0; j < 2 && i + j < agents.length; j++) {
      const agent = agents[i + j];
      if (agent) {
        row.push({
          text: `${getAgentIcon(agent)} @${agent}`,
          callback_data: `${CALLBACK_PREFIX.HANDOFF}${agent}:start`,
        });
      }
    }

    buttons.push(row);
  }

  return { inline_keyboard: buttons };
}

/**
 * Create yes/no confirmation keyboard.
 */
export function createYesNoKeyboard(
  actionId: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Yes",
          callback_data: `${CALLBACK_PREFIX.CONFIRM}${actionId}`,
        },
        {
          text: "❌ No",
          callback_data: `${CALLBACK_PREFIX.REJECT}${actionId}`,
        },
      ],
    ],
  };
}

/**
 * Create workflow status keyboard with actions.
 */
export function createWorkflowKeyboard(
  workflowId: string,
  hasHandoff: boolean
): InlineKeyboardMarkup {
  const buttons: InlineKeyboardButton[][] = [];

  if (hasHandoff) {
    buttons.push([
      {
        text: "🔄 Continue Handoff",
        callback_data: `${CALLBACK_PREFIX.HANDOFF}continue:${workflowId}`,
      },
    ]);
  }

  buttons.push([
    {
      text: "📊 View Status",
      callback_data: `status:${workflowId}`,
    },
    {
      text: "❌ Cancel",
      callback_data: `${CALLBACK_PREFIX.CANCEL}${workflowId}`,
    },
  ]);

  return { inline_keyboard: buttons };
}

// ============================================================================
// Callback Data Parser
// ============================================================================

/**
 * Parsed callback data.
 */
export interface ParsedCallback {
  /** Action type */
  action: "handoff" | "confirm" | "reject" | "cancel" | "status" | "unknown";
  /** Target (agent, patchId, workflowId) */
  target: string;
  /** Additional data (intent, etc.) */
  data?: string;
}

/**
 * Parse callback data from button press.
 */
export function parseCallbackData(callbackData: string): ParsedCallback {
  // Handoff format: handoff:agent:intent
  if (callbackData.startsWith(CALLBACK_PREFIX.HANDOFF)) {
    const parts = callbackData.slice(CALLBACK_PREFIX.HANDOFF.length).split(":");
    const result: ParsedCallback = {
      action: "handoff",
      target: parts[0] ?? "",
    };
    if (parts[1]) {
      result.data = decodeIntent(parts[1]);
    }
    return result;
  }

  // Confirm format: confirm:id
  if (callbackData.startsWith(CALLBACK_PREFIX.CONFIRM)) {
    return {
      action: "confirm",
      target: callbackData.slice(CALLBACK_PREFIX.CONFIRM.length),
    };
  }

  // Reject format: reject:id
  if (callbackData.startsWith(CALLBACK_PREFIX.REJECT)) {
    return {
      action: "reject",
      target: callbackData.slice(CALLBACK_PREFIX.REJECT.length),
    };
  }

  // Cancel format: cancel:id
  if (callbackData.startsWith(CALLBACK_PREFIX.CANCEL)) {
    return {
      action: "cancel",
      target: callbackData.slice(CALLBACK_PREFIX.CANCEL.length),
    };
  }

  // Status format: status:id
  if (callbackData.startsWith("status:")) {
    return {
      action: "status",
      target: callbackData.slice(7),
    };
  }

  return {
    action: "unknown",
    target: callbackData,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Encode intent for callback data (limited to 64 bytes in Telegram).
 */
function encodeIntent(intent: string): string {
  // Truncate and base64 encode
  const truncated = intent.slice(0, 40);
  return Buffer.from(truncated).toString("base64").replace(/=/g, "");
}

/**
 * Decode intent from callback data.
 */
function decodeIntent(encoded: string): string {
  try {
    // Pad base64 if needed
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return encoded;
  }
}

/**
 * Get agent icon.
 */
function getAgentIcon(agent: AgentRole): string {
  const icons: Record<string, string> = {
    researcher: "🔍",
    pm: "📋",
    pjm: "📊",
    architect: "🏗️",
    coder: "💻",
    reviewer: "👀",
    tester: "🧪",
    devops: "🚀",
    assistant: "🤖",
    ceo: "👔",
    cpo: "🎯",
    cto: "⚙️",
  };
  return icons[agent] ?? "🔹";
}
