/**
 * Telegram Command Router
 *
 * Extracted from TelegramChannel — handles the /command switch dispatch,
 * approval queue commands (/approve, /reject, /help), and callback_query
 * routing (inline keyboard responses, RL feedback).
 *
 * Pure behaviour extraction: no API surface change on TelegramChannel.
 *
 * @module channels/telegram/command-router
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
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
  handleModeCommand,
  handleWebhookCommand,
  handleEvalCommand,
  handleComplexityGateCallback,
  handleTeamCostCallback,
  generateHelpMessage,
  type CommandResult,
} from "../../commands/handlers.js";
import { parseCallbackData } from "./keyboards.js";
import { getConversationStore } from "../conversation/store.js";
import type { RLFeedbackService } from "../../rl/index.js";
import type { FeedbackLabel } from "../../rl/types.js";
import type { Logger } from "../../logging/index.js";
import type { ApprovalQueueLike } from "./telegram-channel.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Subset of TelegramUpdate.callback_query needed by the router.
 * Defined locally to avoid importing the full TelegramUpdate type.
 */
export interface CallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  data?: string;
}

/**
 * Dependencies injected into TelegramCommandRouter by TelegramChannel.
 */
export interface CommandRouterDeps {
  /** Logger (shared with channel). */
  log: Logger;
  /** Current polling state accessor (live reference). */
  isPollingActive: () => boolean;
  /** Current mode accessor / mutator. */
  getMode: () => string;
  setMode: (mode: string) => void;
  /** Chat ID from config (may be undefined when unconfigured). */
  getChatId: () => string | undefined;
  /** Approval queue (may be null before setApprovalQueue is called). */
  getApprovalQueue: () => ApprovalQueueLike | null;
  /** RL feedback service (may be null). */
  getFeedbackService: () => RLFeedbackService | null;
  /**
   * Send a message via the Telegram API.
   * Maps to TelegramChannel's private sendMessage().
   */
  sendMessage: (
    text: string,
    useMarkdown: boolean,
    replyMarkup?: Record<string, unknown>,
  ) => Promise<boolean>;
  /**
   * Make a raw Telegram Bot API call.
   * Maps to TelegramChannel's private apiCall().
   */
  apiCall: <T>(
    method: string,
    httpMethod?: "GET" | "POST",
    body?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; result?: T; description?: string; error_code?: number }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Callback data prefix for RL feedback buttons (must match telegram-channel.ts) */
const RL_FB_PREFIX = "rl_fb";

// ============================================================================
// TelegramCommandRouter
// ============================================================================

/**
 * Routes incoming Telegram commands and callback queries to their handlers.
 *
 * Extracted from TelegramChannel to reduce class size. TelegramChannel
 * constructs one instance of this class and delegates handleCommand() and
 * handleCallbackQuery() to it.
 *
 * All state mutations go through the `deps` callbacks — the router itself
 * is stateless.
 */
export class TelegramCommandRouter {
  private deps: CommandRouterDeps;

  constructor(deps: CommandRouterDeps) {
    this.deps = deps;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Route a raw command string to its handler.
   * Returns CommandResult for known commands, null for unknown commands
   * (which TelegramChannel forwards to the onMessage handler).
   */
  async handleCommand(text: string): Promise<CommandResult | null> {
    const parts = text.trim().split(/\s+/);
    // Strip @botname suffix (Telegram sends "/link@Endior_bot" in group chats)
    const command = parts[0]?.toLowerCase().split("@")[0];
    const args = parts.slice(1);

    switch (command) {
      case "/start":
        return {
          success: true,
          response: "👋 EndiorBot — Solo Developer Power Tool\n\n"
            + "AI agents for solo developers. <30s answers.\n\n"
            + "Quick start:\n"
            + "• /help — all commands\n"
            + "• /agents — list 14 AI agents\n"
            + "• @pm plan next sprint — talk to agents\n"
            + "• /launch claude --as coder — tmux bridge\n\n"
            + "Type /help for the full command list.",
        };

      case "/approve":
        return this.handleApprove(args);

      case "/reject":
        return this.handleReject(args);

      // Sprint 144: /status now handled by CommandDispatcher (shows project context).
      // Legacy approval-queue status moved to /approval-status if needed.

      case "/help":
        return this.handleHelp();

      // Sprint 76: Extended OTT commands
      case "/agents":
        return handleAgentsCommand();

      case "/teams":
        return handleTeamsCommand();

      case "/gate":
        return handleGateCommand(args);

      case "/compliance":
        return handleComplianceCommand(args);

      case "/fix":
        return handleFixCommand(args);

      case "/consult":
        return handleConsultCommand(args);

      case "/config":
        return handleConfigCommand();

      case "/init":
        return handleInitCommand(args);

      case "/mode": {
        const modeResult = handleModeCommand(args, this.deps.getMode());
        // B2 fix: persist mode state when command succeeds
        const requestedMode = args[0]?.toLowerCase();
        if (modeResult.success && (requestedMode === "read" || requestedMode === "patch")) {
          this.deps.setMode(requestedMode.toUpperCase());
        }
        return modeResult;
      }

      case "/webhook":
        return handleWebhookCommand(args, this.deps.isPollingActive());

      case "/clear": {
        // B3: Clear conversation history for the configured CEO chat
        const chatId = this.deps.getChatId();
        if (chatId) {
          getConversationStore().clear(chatId);
        }
        return { success: true, response: "🗑 Conversation cleared." };
      }

      // Sprint 88: Evaluator command
      case "/eval":
        return handleEvalCommand(args, this.deps.getChatId() ?? "telegram");

      default:
        // Unknown command — return null to let onMessage handler process it
        // (bridge commands like /link, /launch, /sessions are handled by telegram-poll.mjs)
        return null;
    }
  }

  /**
   * Handle a callback_query from an inline keyboard (Sprint 90).
   * Answers the query to dismiss the loading indicator and,
   * if the callback produced a result, sends a reply message.
   */
  async handleCallbackQuery(query: CallbackQuery): Promise<void> {
    const data = query.data;
    if (!data) return;

    // Sprint 110: RL feedback callback — handled BEFORE parseCallbackData()
    // Format: "rl_fb:{label}:{correlationId}"
    // correlationId may contain ":" (channel-senderId-timestamp), so split at most 2 times.
    if (data.startsWith(`${RL_FB_PREFIX}:`)) {
      const firstColon = data.indexOf(":");
      const secondColon = data.indexOf(":", firstColon + 1);
      if (secondColon !== -1) {
        const label = data.slice(firstColon + 1, secondColon) as FeedbackLabel;
        const correlationId = data.slice(secondColon + 1);

        // Validate label (guard against corrupt callback data)
        if (label === "good" || label === "partial" || label === "bad") {
          const feedbackService = this.deps.getFeedbackService();
          if (feedbackService) {
            feedbackService.onFeedback(correlationId, label);
          } else {
            // Orphan: feedbackService not wired — log + drop silently
            this.deps.log.debug("RL feedback received but feedbackService not set", { correlationId, label });
          }
        }
      }
      // Answer callback query to dismiss loading indicator (no text shown)
      await this.deps.apiCall("answerCallbackQuery", "POST", {
        callback_query_id: query.id,
      });
      return;
    }

    const parsed = parseCallbackData(data);
    const actorId = this.deps.getChatId() ?? "telegram";

    let result: CommandResult | null = null;

    switch (parsed.action) {
      case "complexity_gate":
        result = await handleComplexityGateCallback(
          parsed.target, // "team" or "solo"
          parsed.data ?? "",
          actorId,
        );
        break;
      case "team_cost":
        result = await handleTeamCostCallback(
          parsed.target, // "extend" or "stop"
          parsed.data ?? "",
          actorId,
        );
        break;
      default:
        // Unknown callback — ignore
        break;
    }

    // Answer callback query to dismiss loading indicator
    await this.deps.apiCall("answerCallbackQuery", "POST", {
      callback_query_id: query.id,
    });

    if (result) {
      await this.deps.sendMessage(
        result.response,
        false,
        result.replyMarkup as Record<string, unknown> | undefined,
      );
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Handle /approve command.
   */
  private async handleApprove(args: string[]): Promise<CommandResult> {
    const approvalQueue = this.deps.getApprovalQueue();
    if (!approvalQueue) {
      return {
        success: false,
        response: "ApprovalQueue not available.",
      };
    }

    const id = args[0];
    if (!id) {
      return {
        success: false,
        response: "Usage: /approve <id>",
      };
    }

    try {
      const result = await approvalQueue.approve(id);
      if (result) {
        this.deps.log.info("Approved via Telegram", { id });
        return {
          success: true,
          response: `✅ Approved: \`${id}\`\nSession will continue.`,
        };
      } else {
        return {
          success: false,
          response: `⚠️ Approval failed: \`${id}\` not found or already processed.`,
        };
      }
    } catch (error) {
      return {
        success: false,
        response: `❌ Error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Handle /reject command.
   */
  private async handleReject(args: string[]): Promise<CommandResult> {
    const approvalQueue = this.deps.getApprovalQueue();
    if (!approvalQueue) {
      return {
        success: false,
        response: "ApprovalQueue not available.",
      };
    }

    const id = args[0];
    if (!id) {
      return {
        success: false,
        response: "Usage: /reject <id> [reason]",
      };
    }

    const reason = args.slice(1).join(" ") || "Rejected by CEO";

    try {
      const result = await approvalQueue.reject(id, reason);
      if (result) {
        this.deps.log.info("Rejected via Telegram", { id, reason });
        return {
          success: true,
          response: `❌ Rejected: \`${id}\`\nReason: ${reason}`,
        };
      } else {
        return {
          success: false,
          response: `⚠️ Rejection failed: \`${id}\` not found or already processed.`,
        };
      }
    } catch (error) {
      return {
        success: false,
        response: `❌ Error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Handle /help command.
   */
  private handleHelp(): CommandResult {
    return {
      success: true,
      response: generateHelpMessage(),
    };
  }
}
