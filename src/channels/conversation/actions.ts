/**
 * Action Handlers for CEO Intents
 *
 * Executes actions based on parsed intents.
 *
 * Per Sprint 46 Days 6-7 CTO direction:
 * - APPROVE/REJECT → ApprovalQueue
 * - STATUS → SessionManager.getActiveSession() summary
 * - SHOW_ERROR → Last error from session
 * - TRY_DIFFERENT → Orchestrator retry with different strategy
 *
 * @module channels/conversation/actions
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 6-7
 * @authority CTO Review
 * @stage 04 - BUILD
 */

import type { ParsedIntent, Intent } from "./intents.js";
import type { ApprovalQueue, ApprovalRequest } from "../../budget/approval-queue.js";
import type { SessionManager } from "../../sessions/session-manager.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Action result.
 */
export interface ActionResult {
  /** Whether action succeeded */
  success: boolean;
  /** Human-readable response message */
  message: string;
  /** Additional data (for programmatic use) */
  data?: Record<string, unknown>;
}

/**
 * Action context - dependencies for actions.
 */
export interface ActionContext {
  /** Approval queue for APPROVE/REJECT */
  approvalQueue?: ApprovalQueue;
  /** Session manager for STATUS */
  sessionManager?: SessionManager;
  /** Last error for SHOW_ERROR */
  lastError?: Error | string;
  /** Retry callback for TRY_DIFFERENT */
  onRetry?: (strategy?: string) => Promise<void>;
}

/**
 * Action handler function signature.
 */
export type ActionHandler = (
  intent: ParsedIntent,
  context: ActionContext,
) => Promise<ActionResult>;

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handle APPROVE intent.
 */
async function handleApprove(
  intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const { approvalQueue } = context;
  const { approvalId, reason } = intent.params;

  if (!approvalQueue) {
    return {
      success: false,
      message: "Approval queue not available.",
    };
  }

  // If no approval ID provided, check if there's exactly one pending
  let targetId = approvalId;
  if (!targetId) {
    const pending = approvalQueue.getPending();
    if (pending.length === 0) {
      return {
        success: false,
        message: "No pending approvals.",
      };
    }
    if (pending.length === 1 && pending[0]) {
      // Auto-select the only pending item
      targetId = pending[0].id;
    } else {
      // Multiple pending - need specific ID
      return {
        success: false,
        message: formatPendingList(pending),
      };
    }
  }

  const result = approvalQueue.approve(targetId, "CEO", reason);

  if (result) {
    return {
      success: true,
      message: `Approved: \`${targetId}\`\nSession will continue.`,
      data: { approvalId: targetId },
    };
  } else {
    return {
      success: false,
      message: `Approval failed: \`${targetId}\` not found or already processed.`,
    };
  }
}

/**
 * Handle REJECT intent.
 */
async function handleReject(
  intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const { approvalQueue } = context;
  const { approvalId, reason } = intent.params;

  if (!approvalQueue) {
    return {
      success: false,
      message: "Approval queue not available.",
    };
  }

  // If no approval ID provided, check if there's exactly one pending
  let targetId = approvalId;
  if (!targetId) {
    const pending = approvalQueue.getPending();
    if (pending.length === 0) {
      return {
        success: false,
        message: "No pending approvals to reject.",
      };
    }
    if (pending.length === 1 && pending[0]) {
      targetId = pending[0].id;
    } else {
      return {
        success: false,
        message: formatPendingList(pending),
      };
    }
  }

  const result = approvalQueue.reject(targetId, "CEO", reason ?? "Rejected by CEO");

  if (result) {
    return {
      success: true,
      message: `Rejected: \`${targetId}\`\nReason: ${reason ?? "Rejected by CEO"}`,
      data: { approvalId: targetId, reason },
    };
  } else {
    return {
      success: false,
      message: `Rejection failed: \`${targetId}\` not found or already processed.`,
    };
  }
}

/**
 * Handle STATUS intent.
 */
async function handleStatus(
  _intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const { sessionManager, approvalQueue } = context;

  const lines: string[] = ["**Status Report**", ""];

  // Session info
  if (sessionManager) {
    const session = sessionManager.getActiveSession();
    if (session) {
      lines.push(`**Session:** \`${session.id}\``);
      lines.push(`**Project:** ${session.projectId}`);
      lines.push(`**Stage:** ${session.sdlcStage}`);
      lines.push(`**Messages:** ${session.messages.length}`);
      lines.push(`**Tokens:** ${session.tokenCount.toLocaleString()} / ${session.maxTokens.toLocaleString()}`);
      lines.push("");
    } else {
      lines.push("No active session.");
      lines.push("");
    }
  } else {
    lines.push("Session manager not available.");
    lines.push("");
  }

  // Approval queue info
  if (approvalQueue) {
    const stats = approvalQueue.getStats();
    lines.push(`**Pending Approvals:** ${stats.pending}`);

    if (stats.pending > 0) {
      const pending = approvalQueue.getPending();
      for (const item of pending.slice(0, 5)) {
        const age = formatAge(new Date(item.createdAt));
        lines.push(`  • \`${item.id}\` - ${item.decisionType} (${age})`);
      }
      if (stats.pending > 5) {
        lines.push(`  ... and ${stats.pending - 5} more`);
      }
    }
    lines.push("");
  }

  // Commands help
  lines.push("**Commands:**");
  lines.push("  /approve <id> - Approve request");
  lines.push("  /reject <id> [reason] - Reject request");
  lines.push("  /status - Show this status");
  lines.push("  /error - Show last error");
  lines.push("  /retry - Retry with different approach");

  return {
    success: true,
    message: lines.join("\n"),
    data: {
      hasActiveSession: !!sessionManager?.getActiveSession(),
      pendingApprovals: approvalQueue?.getStats().pending ?? 0,
    },
  };
}

/**
 * Handle SHOW_ERROR intent.
 */
async function handleShowError(
  intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const { lastError } = context;

  if (!lastError) {
    return {
      success: true,
      message: "No recent errors.",
    };
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  const errorStack = lastError instanceof Error ? lastError.stack : undefined;

  const lines: string[] = [
    "**Last Error:**",
    "",
    `\`\`\``,
    errorMessage,
    `\`\`\``,
  ];

  if (errorStack && intent.params.errorIndex === undefined) {
    // Only show stack if not requesting specific error index
    lines.push("");
    lines.push("**Stack:**");
    lines.push("```");
    lines.push(errorStack.split("\n").slice(0, 5).join("\n"));
    lines.push("```");
  }

  return {
    success: true,
    message: lines.join("\n"),
    data: {
      error: errorMessage,
      hasStack: !!errorStack,
    },
  };
}

/**
 * Handle TRY_DIFFERENT intent.
 */
async function handleTryDifferent(
  intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const { onRetry } = context;
  const { strategy } = intent.params;

  if (!onRetry) {
    return {
      success: false,
      message: "Retry not available. No active operation to retry.",
    };
  }

  try {
    await onRetry(strategy);

    const strategyMsg = strategy ? ` with ${strategy}` : " with different approach";
    return {
      success: true,
      message: `Retrying${strategyMsg}...`,
      data: { strategy },
    };
  } catch (error) {
    return {
      success: false,
      message: `Retry failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Handle UNKNOWN intent.
 */
async function handleUnknown(
  intent: ParsedIntent,
  _context: ActionContext,
): Promise<ActionResult> {
  return {
    success: false,
    message: `I didn't understand: "${intent.originalMessage}"\n\nUse /help to see available commands.`,
  };
}

// ============================================================================
// Action Router
// ============================================================================

/**
 * Map of intent to handler.
 */
const ACTION_HANDLERS: Record<Intent, ActionHandler> = {
  APPROVE: handleApprove,
  REJECT: handleReject,
  STATUS: handleStatus,
  SHOW_ERROR: handleShowError,
  TRY_DIFFERENT: handleTryDifferent,
  UNKNOWN: handleUnknown,
};

/**
 * Execute action for parsed intent.
 *
 * @param intent - Parsed intent from message
 * @param context - Action context with dependencies
 * @returns Action result
 */
export async function executeAction(
  intent: ParsedIntent,
  context: ActionContext,
): Promise<ActionResult> {
  const handler = ACTION_HANDLERS[intent.intent];
  return handler(intent, context);
}

/**
 * Get action handler for intent.
 */
export function getActionHandler(intent: Intent): ActionHandler {
  return ACTION_HANDLERS[intent];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format pending approvals list.
 */
function formatPendingList(pending: ApprovalRequest[]): string {
  const lines = [
    `Multiple pending approvals (${pending.length}). Please specify ID:`,
    "",
  ];

  for (const item of pending.slice(0, 10)) {
    const age = formatAge(new Date(item.createdAt));
    lines.push(`  • \`${item.id}\` - ${item.decisionType} (${age})`);
  }

  if (pending.length > 10) {
    lines.push(`  ... and ${pending.length - 10} more`);
  }

  lines.push("");
  lines.push("Usage: /approve <id> or /reject <id> [reason]");

  return lines.join("\n");
}

/**
 * Format age of a date.
 */
function formatAge(date: Date): string {
  const ageMs = Date.now() - date.getTime();
  const minutes = Math.floor(ageMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
