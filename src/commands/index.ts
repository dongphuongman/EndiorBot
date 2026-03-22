/**
 * Commands Module — barrel export + factory.
 *
 * Creates a CommandDispatcher with all 17+ commands registered.
 * Wraps shared handlers from handlers.ts and remote-handlers.ts.
 *
 * @module commands
 * @version 1.0.0
 * @sprint 93
 */

export {
  CommandDispatcher,
  SENSITIVE_COMMANDS,
  requireLinkedActor,
  type CommandResult,
  type CommandContext,
  type CommandHandler,
} from "./command-dispatcher.js";

import { CommandDispatcher, requireLinkedActor } from "./command-dispatcher.js";
import type { CommandContext, CommandResult } from "./command-dispatcher.js";

// Import shared command handlers
import {
  handleAgentsCommand,
  handleTeamsCommand,
  handleGateCommand,
  handleComplianceCommand,
  executeFixCommand,
  handleConsultCommand,
  handleConfigCommand,
  handleInitCommand,
  handleModeCommand,
  handleWebhookCommand,
  handleLinkCommand,
  handleLaunchCommand,
  handleSessionsCommand,
  handleSwitchCommand,
  handleCaptureCommand,
  handleKillCommand,
  handleSendCommand,
  handleEvalCommand,
  handleTeamStatusCommand,
  handleKillTeamCommand,
  handleCostCommand,
  generateHelpMessage,
  getLinkedActorId,
} from "./handlers.js";

// Import remote command handlers
import {
  handleReposCommand,
  handleFocusCommand,
  handleWhereCommand,
  handleCpCommand,
  handleShCommand,
  handleAttachCommand,
  handleRunCommand,
  executeApprovedRun,
} from "./remote-handlers.js";

// Import approval queue (Sprint 94: /approve + /reject migration)
import {
  getApprovalQueue,
  type ApprovalRequest,
} from "../gateway/methods/approval.js";

// ============================================================================
// Adapter helpers
// ============================================================================

/**
 * Wrap a sync/async handler that needs actorId from linked identity.
 * Uses requireLinkedActor (CTO F3) to avoid repeating the check 17 times.
 */
function withLinkedActor(
  fn: (ctx: CommandContext, actorId: string) => Promise<CommandResult> | CommandResult,
): (ctx: CommandContext) => Promise<CommandResult> {
  return async (ctx) => {
    const check = requireLinkedActor(ctx, getLinkedActorId);
    if ("response" in check) return check; // Error — not linked
    return fn(ctx, check.actorId);
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CommandDispatcher with all commands registered.
 */
export function createCommandDispatcher(): CommandDispatcher {
  const d = new CommandDispatcher();

  // ── OTT info commands (no auth needed) ──

  d.register("agents", async () => handleAgentsCommand());

  d.register("teams", async () => handleTeamsCommand());

  d.register("gate", async (ctx) => handleGateCommand(ctx.args));

  d.register("compliance", async (ctx) => {
    // Sprint 103 (CPO C3): "compliance fix" → delegate to executeFixCommand
    if (ctx.args[0] === "fix") {
      return executeFixCommand(ctx.args.slice(1), ctx.workspace);
    }
    return handleComplianceCommand(ctx.args);
  });

  d.register("fix", async (ctx) => executeFixCommand(ctx.args, ctx.workspace));

  d.register("consult", async (ctx) => handleConsultCommand(ctx.args));

  d.register("config", async () => handleConfigCommand());

  d.register("init", async (ctx) => handleInitCommand(ctx.args, ctx.workspace));

  // Sprint 104: /mode now mutates session.riskMode via actorId lookup (GAP-004)
  // Breaking change: unlinked users get "No active session" instead of help text.
  d.register("mode", withLinkedActor(async (ctx, actorId) => {
    return handleModeCommand(ctx.args, actorId);
  }));

  d.register("webhook", async (ctx) => {
    // Webhook state is per-adapter; default to false when called from Gateway
    return handleWebhookCommand(ctx.args, false);
  });

  // ── Identity linking ──

  d.register("link", async (ctx) => handleLinkCommand(ctx.userId, ctx.username, ctx.channel));

  // ── Bridge commands (require linked identity) ──

  d.register("launch", withLinkedActor(async (ctx, actorId) => {
    // Sprint 99: Pass workspace from CommandContext (ADR-029 AD-6)
    return handleLaunchCommand(ctx.args, actorId, ctx.workspace);
  }));

  d.register("sessions", withLinkedActor(async () => {
    return handleSessionsCommand();
  }));

  d.register("switch", withLinkedActor(async (ctx, actorId) => {
    return handleSwitchCommand(ctx.args, actorId);
  }));

  d.register("capture", withLinkedActor(async (ctx, actorId) => {
    return handleCaptureCommand(ctx.args, actorId, ctx.userId);
  }));

  d.register("kill", withLinkedActor(async (ctx, actorId) => {
    return handleKillCommand(ctx.args, actorId);
  }));

  // ── Sprint 86: Send command ──

  d.register("send", withLinkedActor(async (ctx, actorId) => {
    return handleSendCommand(ctx.args, actorId);
  }));

  // ── Sprint 88: Eval command ──

  d.register("eval", withLinkedActor(async (ctx, actorId) => {
    return handleEvalCommand(ctx.args, actorId);
  }));

  // ── Sprint 91: Team monitoring commands ──

  d.register("team-status", withLinkedActor(async (ctx, actorId) => {
    return handleTeamStatusCommand(ctx.args, actorId);
  }));

  d.register("kill-team", withLinkedActor(async (ctx, actorId) => {
    return handleKillTeamCommand(ctx.args, actorId);
  }));

  // ── Remote commands (require linked identity + chatId) ──

  d.register("repos", async (ctx) => handleReposCommand(ctx.args));

  d.register("focus", withLinkedActor(async (ctx, actorId) => {
    return handleFocusCommand(ctx.args, ctx.chatId ?? ctx.userId, actorId, ctx.channel);
  }));

  d.register("where", async (ctx) => {
    return handleWhereCommand(ctx.chatId ?? ctx.userId);
  });

  d.register("cp", withLinkedActor(async (ctx, actorId) => {
    return handleCpCommand(ctx.args, ctx.chatId ?? ctx.userId, actorId);
  }));

  d.register("sh", withLinkedActor(async (ctx, actorId) => {
    return handleShCommand(ctx.args, ctx.chatId ?? ctx.userId, actorId);
  }));

  d.register("attach", withLinkedActor(async (ctx, actorId) => {
    return handleAttachCommand(ctx.args, ctx.chatId ?? ctx.userId, actorId);
  }));

  d.register("run", withLinkedActor(async (ctx, actorId) => {
    return handleRunCommand(ctx.args, ctx.chatId ?? ctx.userId, actorId);
  }));

  // ── Sprint 94: Approval commands (migrated from telegram-poll.mjs) ──

  d.register("approve", withLinkedActor(async (ctx, actorId) => {
    const approvalId = ctx.args[0];
    if (!approvalId) {
      return { success: false, response: "Usage: /approve <approval-id>" };
    }
    const queue = getApprovalQueue();
    const request = queue.get(approvalId) as (ApprovalRequest & { details?: Record<string, unknown> }) | undefined;
    if (!request) {
      return { success: false, response: `Approval "${approvalId}" not found.` };
    }
    if (request.status !== "pending") {
      return { success: false, response: `Request already ${request.status}.` };
    }
    // Mark as approved (F2: full executeApprovedRun integration)
    request.status = "approved";
    request.respondedAt = Date.now();
    request.respondedBy = actorId;
    const details = request.details ?? {};
    if (details.cmd && details.repoPath && details.repo) {
      const chatId = String(details.chatId ?? ctx.chatId ?? ctx.userId);
      const envAllowlist = Array.isArray(details.envAllowlist) ? details.envAllowlist as string[] : [];
      const runResult = await executeApprovedRun(
        String(details.cmd),
        String(details.repoPath),
        String(details.repo),
        actorId,
        chatId,
        envAllowlist,
      );
      return runResult;
    }
    return { success: true, response: "Approved (no executable command attached)." };
  }));

  d.register("reject", withLinkedActor(async (ctx, actorId) => {
    const approvalId = ctx.args[0];
    if (!approvalId) {
      return { success: false, response: "Usage: /reject <approval-id>" };
    }
    const queue = getApprovalQueue();
    const request = queue.get(approvalId);
    if (!request) {
      return { success: false, response: `Approval "${approvalId}" not found.` };
    }
    if (request.status !== "pending") {
      return { success: false, response: `Request already ${request.status}.` };
    }
    request.status = "rejected";
    request.respondedAt = Date.now();
    request.respondedBy = actorId;
    return { success: true, response: `Rejected: ${request.message}` };
  }));

  // ── Sprint 114: Cost command (no auth needed — info only) ──

  d.register("cost", async (ctx) => handleCostCommand(ctx.args));

  // ── Help command (F3: reuse generateHelpMessage from handlers) ──

  d.register("help", async () => ({
    success: true,
    response: generateHelpMessage(),
  }));

  return d;
}
