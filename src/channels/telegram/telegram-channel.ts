/**
 * Telegram Channel
 *
 * Telegram bot integration for CEO escalation notifications.
 *
 * Per Sprint 38 Week 1 requirements:
 * - Send alerts to CEO via Telegram
 * - Poll for /approve, /reject, /status commands
 * - Secure: only process messages from configured chatId
 *
 * @module channels/telegram/telegram-channel
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Week 1
 * @authority Sprint 38 Plan - OTT Escalation
 * @stage 04 - BUILD
 */

import type { BidirectionalChannel, EscalationAlert, IncomingMessage, IncomingMessageHandler } from "../types.js";
import { formatAlertMarkdown } from "../types.js";
import type { TelegramChannelConfig } from "./telegram-config.js";
import { loadTelegramConfig, isValidBotToken, isValidChatId } from "./telegram-config.js";
import { createLogger, type Logger } from "../../logging/index.js";
import { getInputSanitizer } from "../../security/input-sanitizer.js";
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

// ============================================================================
// Types
// ============================================================================

/**
 * Telegram API response.
 */
interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Telegram Update object.
 */
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
  /** Sprint 90: Inline keyboard callback */
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    data?: string;
  };
}

/**
 * Approval queue interface (minimal, for DI).
 */
export interface ApprovalQueueLike {
  approve(id: string): Promise<boolean>;
  reject(id: string, reason?: string): Promise<boolean>;
  listPending(): Promise<Array<{ id: string; description?: string }>>;
}

// ============================================================================
// Constants
// ============================================================================

/** Telegram Bot API base URL */
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/** Request timeout in ms (must be > LONG_POLLING_TIMEOUT for getUpdates) */
const REQUEST_TIMEOUT_MS = 35000;

/** Long polling timeout in seconds (Telegram server-side wait) */
const LONG_POLLING_TIMEOUT = 25;

// ============================================================================
// Sprint 110: RL Feedback Keyboard helpers
// ============================================================================

/** Callback data prefix for RL feedback buttons */
const RL_FB_PREFIX = "rl_fb";

/**
 * Build 3-button RL feedback inline keyboard.
 * Callback data: "rl_fb:{label}:{correlationId}"
 * Sprint 110: good/partial/bad. Hint capture in Sprint 112.
 */
function makeRlFeedbackKeyboard(correlationId: string): Record<string, unknown> {
  return {
    inline_keyboard: [
      [
        { text: "👍 Good", callback_data: `${RL_FB_PREFIX}:good:${correlationId}` },
        { text: "🔄 Partial", callback_data: `${RL_FB_PREFIX}:partial:${correlationId}` },
        { text: "👎 Bad", callback_data: `${RL_FB_PREFIX}:bad:${correlationId}` },
      ],
    ],
  };
}

// ============================================================================
// TelegramChannel
// ============================================================================

/**
 * Telegram notification channel (bidirectional).
 *
 * Features:
 * - Send plain text and formatted alerts
 * - Poll for CEO commands (/approve, /reject, /status)
 * - Receive incoming messages via polling
 * - Markdown formatting for rich alerts
 * - Security: only process messages from configured chatId
 *
 * Sprint 46: Now implements BidirectionalChannel for two-way communication.
 */
export class TelegramChannel implements BidirectionalChannel {
  readonly name = "telegram";

  private config: TelegramChannelConfig | null;
  private log: Logger;
  private lastUpdateId = 0;
  private pollingActive = false;
  private pollingTimeout: ReturnType<typeof setTimeout> | null = null;
  private approvalQueue: ApprovalQueueLike | null = null;
  private messageHandler: IncomingMessageHandler | null = null;
  private pendingMessages: IncomingMessage[] = [];
  private currentMode: string = "READ";
  /** Sprint 110: RL feedback service (optional — set via setFeedbackService()) */
  private feedbackService: RLFeedbackService | null = null;

  constructor(config?: TelegramChannelConfig) {
    this.config = config ?? loadTelegramConfig();
    this.log = createLogger("telegram-channel");

    if (this.config) {
      this.log.info("TelegramChannel initialized", {
        hasToken: !!this.config.botToken,
        hasChatId: !!this.config.chatId,
        pollingEnabled: this.config.enablePolling,
      });
    } else {
      this.log.warn("TelegramChannel not configured");
    }
  }

  // ==========================================================================
  // Sprint 110: RL Feedback Service injection
  // ==========================================================================

  /**
   * Inject RL feedback service for feedback keyboard attachment.
   * Optional — channel works without it (keyboards not attached if null).
   * Called from serve.ts after channel + feedbackService are constructed.
   * See ADR-033 D3 (hook location in channel adapter).
   */
  setFeedbackService(service: RLFeedbackService): void {
    this.feedbackService = service;
  }

  // ==========================================================================
  // IChannel Implementation
  // ==========================================================================

  /**
   * Send a message with optional format and RL feedback hints.
   * @param options.format - "markdown" enables Telegram Markdown parse_mode; "plain" (default) sends as-is.
   * @param options.correlationId - Sprint 110: app-level ID for RL feedback keyboard linking (Step 0.5).
   * @param options.isTrainableTurn - Sprint 110: true for agent responses eligible for RL training.
   * @param options.provider - Sprint 110: AI provider/model name (for JSONL record).
   */
  async send(
    message: string,
    options?: {
      format?: string;
      correlationId?: string;
      isTrainableTurn?: boolean;
      provider?: string;
      /** Sprint 111a: inbound conversation context for RL training record */
      request?: Array<{ role: string; content: string }>;
      /** Sprint 114 (CTO C1): Token usage from AI call for RL pipeline */
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    },
  ): Promise<boolean> {
    if (!this.config) {
      this.log.warn("Cannot send: Telegram not configured");
      return false;
    }

    try {
      const useMarkdown = options?.format === "markdown";

      // Sprint 110 (Step 8): RL feedback keyboard path
      // When correlationId + isTrainableTurn: attach 3-button keyboard via sendMessageWithId().
      // Feedback scope guard (CPO C4): keyboard attached only after addTurn + setMessageId succeed.
      if (options?.correlationId && options?.isTrainableTurn) {
        const keyboard = makeRlFeedbackKeyboard(options.correlationId);
        const messageId = await this.sendMessageWithId(message, useMarkdown, keyboard);
        if (messageId && this.feedbackService) {
          const agentParams: import("../../rl/feedback-service.js").AgentResponseParams = {
            chatId: String(this.config.chatId),
            correlationId: options.correlationId,
            telegramMessageId: messageId,
            provider: options.provider ?? "unknown",
            isTrainableTurn: true,
            response: message,
            durationMs: 0, // Sprint 111+: thread actual durationMs through opts
          };
          if (options.request) agentParams.request = options.request;
          // Sprint 114 (CTO C1): thread tokenUsage for RL pipeline
          if (options.tokenUsage) agentParams.tokenUsage = options.tokenUsage;
          this.feedbackService.onAgentResponse(agentParams);
        }
        return messageId !== null;
      }

      const result = await this.sendMessage(message, useMarkdown);
      return result;
    } catch (error) {
      this.log.error("Failed to send message", {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Send a structured escalation alert.
   */
  async sendAlert(alert: EscalationAlert): Promise<boolean> {
    if (!this.config) {
      this.log.warn("Cannot send alert: Telegram not configured");
      return false;
    }

    try {
      const formattedMessage = formatAlertMarkdown(alert);
      const result = await this.sendMessage(formattedMessage, true);

      if (result) {
        this.log.info("Alert sent", {
          type: alert.type,
          priority: alert.priority,
          approvalId: alert.approvalId,
        });
      }

      return result;
    } catch (error) {
      this.log.error("Failed to send alert", {
        type: alert.type,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Check if Telegram channel is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    // Validate config
    if (!isValidBotToken(this.config.botToken)) {
      this.log.warn("Invalid bot token format");
      return false;
    }

    if (!isValidChatId(this.config.chatId)) {
      this.log.warn("Invalid chat ID format");
      return false;
    }

    // Test API connection
    try {
      const response = await this.apiCall<{ id: number; username: string }>("getMe");
      if (response.ok && response.result) {
        this.log.debug("Telegram API available", {
          botUsername: response.result.username,
        });
        return true;
      }
      return false;
    } catch (error) {
      this.log.warn("Telegram API not available", {
        error: (error as Error).message,
      });
      return false;
    }
  }

  // ==========================================================================
  // Polling & Command Handling
  // ==========================================================================

  /**
   * Set the approval queue for command handling.
   */
  setApprovalQueue(queue: ApprovalQueueLike): void {
    this.approvalQueue = queue;
    this.log.info("ApprovalQueue attached to TelegramChannel");
  }

  /**
   * Start polling for updates.
   */
  startPolling(): void {
    if (!this.config?.enablePolling) {
      this.log.info("Polling disabled in config");
      return;
    }

    if (this.pollingActive) {
      this.log.warn("Polling already active");
      return;
    }

    this.pollingActive = true;
    this.log.info("Starting Telegram polling");
    this.pollLoop();
  }

  /**
   * Stop polling.
   */
  stopPolling(): void {
    this.pollingActive = false;
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
    this.log.info("Telegram polling stopped");
  }

  /**
   * Polling loop.
   */
  private async pollLoop(): Promise<void> {
    if (!this.pollingActive || !this.config) {
      return;
    }

    try {
      const updates = await this.getUpdates();

      for (const update of updates) {
        await this.handleUpdate(update);
      }
    } catch (error) {
      this.log.error("Polling error", {
        error: (error as Error).message,
      });
    }

    // Schedule next poll
    if (this.pollingActive) {
      this.pollingTimeout = setTimeout(
        () => this.pollLoop(),
        this.config.pollingInterval
      );
    }
  }

  /**
   * Get updates from Telegram.
   */
  private async getUpdates(): Promise<TelegramUpdate[]> {
    const params = new URLSearchParams({
      offset: String(this.lastUpdateId + 1),
      timeout: String(LONG_POLLING_TIMEOUT),
      allowed_updates: JSON.stringify(["message", "callback_query"]),
    });

    const response = await this.apiCall<TelegramUpdate[]>(
      `getUpdates?${params.toString()}`
    );

    if (!response.ok || !response.result) {
      return [];
    }

    // Update offset
    if (response.result.length > 0) {
      const lastUpdate = response.result[response.result.length - 1];
      if (lastUpdate) {
        this.lastUpdateId = lastUpdate.update_id;
      }
    }

    return response.result;
  }

  /**
   * Handle a single update.
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    // Sprint 90: Handle callback_query (inline keyboard responses)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message || !message.text) {
      return;
    }

    // Security: only process messages from configured chat
    const chatId = String(message.chat.id);
    if (chatId !== this.config?.chatId) {
      this.log.warn("Ignoring message from unauthorized chat", {
        chatId,
        expectedChatId: this.config?.chatId,
      });
      return;
    }

    // Detect commands BEFORE sanitization (use raw text for command detection)
    const rawText = message.text;
    const isCommand = rawText.startsWith("/");

    // Security: Sanitize incoming message text (Sprint 49 Day 6)
    // Commands are processed without wrapping; non-commands get defense-in-depth tags
    const sanitizer = getInputSanitizer();
    const sanitizeResult = sanitizer.sanitizeExternalInput(rawText, "telegram");

    // Check for injection attempts - log violations for audit
    if (sanitizeResult.violations.length > 0) {
      this.log.warn("Injection attempt detected", {
        chatId,
        violations: sanitizeResult.violations,
      });
    }

    // For commands: use raw text (commands are trusted CEO input)
    // For non-commands: use sanitized text (wrapped for defense-in-depth)
    //
    // SECURITY NOTE: Command sanitization bypass is ONLY safe because the
    // chatId guard above (lines 338-345) already verified this is from the
    // authorized CEO chat. If chatId authorization is removed/weakened,
    // commands become vulnerable to injection. Do not remove chatId check
    // without also adding command input sanitization.
    const processedText = isCommand ? rawText : sanitizeResult.sanitized;

    // Convert to IncomingMessage for BidirectionalChannel
    const incoming = this.toIncomingMessage(update, processedText);
    if (incoming) {
      // Queue for receive() polling
      this.pendingMessages.push(incoming);

      // Dispatch to handler if registered (non-command messages only)
      if (this.messageHandler && !isCommand) {
        try {
          await this.messageHandler(incoming);
        } catch (error) {
          this.log.error("Message handler error", {
            error: (error as Error).message,
          });
        }
      }
    }

    // Process commands (existing logic)
    if (!isCommand) {
      return;
    }

    this.log.info("Received command", {
      command: rawText,
      from: message.from?.username,
    });

    const result = await this.handleCommand(rawText);
    if (result) {
      await this.sendMessage(
        result.response,
        false,
        result.replyMarkup as Record<string, unknown> | undefined,
      );
    } else if (incoming && this.messageHandler) {
      // Unknown command — forward to onMessage handler (bridge commands like /link, /launch)
      try {
        await this.messageHandler(incoming);
      } catch (error) {
        this.log.error("Message handler error (forwarded command)", {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Handle a command message.
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

      case "/status":
        return this.handleStatus();

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
        const modeResult = handleModeCommand(args, this.currentMode);
        // B2 fix: persist mode state when command succeeds
        const requestedMode = args[0]?.toLowerCase();
        if (modeResult.success && (requestedMode === "read" || requestedMode === "patch")) {
          this.currentMode = requestedMode.toUpperCase();
        }
        return modeResult;
      }

      case "/webhook":
        return handleWebhookCommand(args, this.pollingActive);

      case "/clear": {
        // B3: Clear conversation history for the configured CEO chat
        if (this.config?.chatId) {
          getConversationStore().clear(this.config.chatId);
        }
        return { success: true, response: "🗑 Conversation cleared." };
      }

      // Sprint 88: Evaluator command
      case "/eval":
        return handleEvalCommand(args, this.config?.chatId ?? "telegram");

      default:
        // Unknown command — return null to let onMessage handler process it
        // (bridge commands like /link, /launch, /sessions are handled by telegram-poll.mjs)
        return null;
    }
  }

  /**
   * Handle /approve command.
   */
  private async handleApprove(args: string[]): Promise<CommandResult> {
    if (!this.approvalQueue) {
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
      const result = await this.approvalQueue.approve(id);
      if (result) {
        this.log.info("Approved via Telegram", { id });
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
    if (!this.approvalQueue) {
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
      const result = await this.approvalQueue.reject(id, reason);
      if (result) {
        this.log.info("Rejected via Telegram", { id, reason });
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
   * Handle /status command.
   */
  private async handleStatus(): Promise<CommandResult> {
    if (!this.approvalQueue) {
      return {
        success: true,
        response: "📋 Status: No ApprovalQueue attached.",
      };
    }

    try {
      const pending = await this.approvalQueue.listPending();

      if (pending.length === 0) {
        return {
          success: true,
          response: "📋 Status: No pending approvals.",
        };
      }

      let response = `📋 Pending: ${pending.length}\n\n`;
      for (const item of pending) {
        response += `• \`${item.id}\``;
        if (item.description) {
          response += `: ${item.description}`;
        }
        response += "\n";
      }
      response += "\nUse /approve <id> or /reject <id>";

      return {
        success: true,
        response,
      };
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

  /**
   * Handle callback_query from inline keyboard (Sprint 90).
   */
  private async handleCallbackQuery(query: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
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
          if (this.feedbackService) {
            this.feedbackService.onFeedback(correlationId, label);
          } else {
            // Orphan: feedbackService not wired — log + drop silently
            this.log.debug("RL feedback received but feedbackService not set", { correlationId, label });
          }
        }
      }
      // Answer callback query to dismiss loading indicator (no text shown)
      await this.apiCall("answerCallbackQuery", "POST", {
        callback_query_id: query.id,
      });
      return;
    }

    const parsed = parseCallbackData(data);
    const actorId = this.config?.chatId ?? "telegram";

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
    await this.apiCall("answerCallbackQuery", "POST", {
      callback_query_id: query.id,
    });

    if (result) {
      await this.sendMessage(
        result.response,
        false,
        result.replyMarkup as Record<string, unknown> | undefined,
      );
    }
  }

  // ==========================================================================
  // Telegram API
  // ==========================================================================

  /**
   * Send a "typing..." chat action indicator.
   * Telegram displays this for ~5 seconds per call.
   */
  async sendChatAction(action = "typing"): Promise<boolean> {
    if (!this.config) return false;

    const response = await this.apiCall("sendChatAction", "POST", {
      chat_id: this.config.chatId,
      action,
    });
    return response.ok;
  }

  /**
   * Send a message to the configured chat.
   */
  private async sendMessage(
    text: string,
    useMarkdown = false,
    replyMarkup?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    const body: Record<string, unknown> = {
      chat_id: this.config.chatId,
      text,
    };

    if (useMarkdown) {
      body.parse_mode = this.config.parseMode;
    }

    if (this.config.disableNotification) {
      body.disable_notification = true;
    }

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await this.apiCall("sendMessage", "POST", body);

    // Sprint 143 R03: Telegram rejects messages with invalid Markdown
    // (unclosed *, unmatched `, table pipes, etc.). When parse fails,
    // retry WITHOUT parse_mode so CEO always sees the response (plain text
    // is better than no response).
    if (!response.ok && useMarkdown) {
      this.log.warn("Markdown parse failed — retrying as plain text");
      const plainBody: Record<string, unknown> = {
        chat_id: this.config.chatId,
        text,
      };
      if (this.config.disableNotification) {
        plainBody.disable_notification = true;
      }
      if (replyMarkup) {
        plainBody.reply_markup = replyMarkup;
      }
      const plainResponse = await this.apiCall("sendMessage", "POST", plainBody);
      return plainResponse.ok;
    }

    return response.ok;
  }

  /**
   * Send a message and return the Telegram message_id for RL feedback linking.
   * Returns null if not configured, API fails, or result lacks message_id.
   * Used by send() when correlationId is present (Sprint 110 RL feedback capture).
   *
   * Design choice: separate from sendMessage() to preserve existing callers' boolean API.
   * See ADR-033 D4 and sprint-110-rl-feedback-capture.md Step 0.
   */
  private async sendMessageWithId(
    text: string,
    useMarkdown = false,
    replyMarkup?: Record<string, unknown>,
  ): Promise<number | null> {
    if (!this.config) return null;

    const body: Record<string, unknown> = {
      chat_id: this.config.chatId,
      text,
    };

    if (useMarkdown) {
      body.parse_mode = this.config.parseMode;
    }

    if (this.config.disableNotification) {
      body.disable_notification = true;
    }

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await this.apiCall<{ message_id: number }>("sendMessage", "POST", body);

    // Sprint 143 R03: same plain-text fallback as sendMessage()
    if (!response.ok && useMarkdown) {
      this.log.warn("Markdown parse failed in sendMessageWithId — retrying as plain text");
      const plainBody: Record<string, unknown> = {
        chat_id: this.config.chatId,
        text,
      };
      if (this.config.disableNotification) plainBody.disable_notification = true;
      if (replyMarkup) plainBody.reply_markup = replyMarkup;
      const plainResponse = await this.apiCall<{ message_id: number }>("sendMessage", "POST", plainBody);
      if (!plainResponse.ok || !plainResponse.result?.message_id) return null;
      return plainResponse.result.message_id;
    }

    if (!response.ok || !response.result?.message_id) return null;
    return response.result.message_id;
  }


  /**
   * Sprint 137 A8: send a plain message and return its Telegram message_id.
   * No RL keyboard, no feedback wiring — designed for placeholder/progress
   * messages where the OTT adapter wants to remember the id so it can
   * editMessageText() later.
   *
   * Returns null on failure (channel not configured, API error).
   */
  async sendCapturingId(
    text: string,
    options?: { format?: string },
  ): Promise<number | null> {
    if (!this.config) return null;
    const useMarkdown = options?.format === "markdown";
    return this.sendMessageWithId(text, useMarkdown);
  }

  /**
   * Sprint 137 A8: edit an existing message in place (Bot API editMessageText).
   * Used by telegram-ott-adapter to update a placeholder progress message
   * instead of appending one new "⏳ still working…" message per tick.
   *
   * Returns true on success, false otherwise (silent — caller falls back to
   * a fresh send if the edit fails, e.g. message too old / API rate-limited).
   */
  async editMessage(
    messageId: number,
    text: string,
    options?: { format?: string },
  ): Promise<boolean> {
    if (!this.config) return false;

    const useMarkdown = options?.format === "markdown";
    const body: Record<string, unknown> = {
      chat_id: this.config.chatId,
      message_id: messageId,
      text,
    };
    if (useMarkdown) {
      body.parse_mode = this.config.parseMode;
    }

    const response = await this.apiCall("editMessageText", "POST", body);
    return response.ok;
  }

  /**
   * Make an API call to Telegram.
   */
  private async apiCall<T>(
    method: string,
    httpMethod: "GET" | "POST" = "GET",
    body?: Record<string, unknown>
  ): Promise<TelegramResponse<T>> {
    if (!this.config) {
      return { ok: false, description: "Not configured" };
    }

    const url = `${TELEGRAM_API_BASE}${this.config.botToken}/${method}`;

    try {
      const options: RequestInit = {
        method: httpMethod,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      };

      if (body) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = (await response.json()) as TelegramResponse<T>;

      if (!data.ok) {
        this.log.warn("Telegram API error", {
          method,
          error: data.description,
          errorCode: data.error_code,
        });
      }

      return data;
    } catch (error) {
      this.log.error("Telegram API request failed", {
        method,
        error: (error as Error).message,
      });
      return {
        ok: false,
        description: (error as Error).message,
      };
    }
  }

  // ==========================================================================
  // BidirectionalChannel Implementation (Sprint 46)
  // ==========================================================================

  /**
   * Poll for incoming messages.
   * Returns messages since last poll, clears pending queue.
   */
  async receive(): Promise<IncomingMessage[]> {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    return messages;
  }

  /**
   * Register handler for incoming messages.
   */
  onMessage(handler: IncomingMessageHandler): void {
    this.messageHandler = handler;
    this.log.info("Message handler registered");
  }

  /**
   * Remove registered message handler.
   */
  offMessage(): void {
    this.messageHandler = null;
    this.log.info("Message handler removed");
  }

  /**
   * Start receiving messages (starts polling).
   */
  async start(): Promise<void> {
    this.startPolling();
  }

  /**
   * Stop receiving messages (stops polling).
   */
  async stop(): Promise<void> {
    this.stopPolling();
  }

  /**
   * Check if channel is actively receiving messages.
   */
  isReceiving(): boolean {
    return this.pollingActive;
  }

  /**
   * Convert TelegramUpdate to IncomingMessage.
   * @param update - Telegram update object
   * @param sanitizedText - Optional pre-sanitized text (Sprint 49 security)
   */
  private toIncomingMessage(update: TelegramUpdate, sanitizedText?: string): IncomingMessage | null {
    const message = update.message;
    if (!message || !message.text) {
      return null;
    }

    // Security: only process messages from configured chat
    const chatId = String(message.chat.id);
    if (chatId !== this.config?.chatId) {
      return null;
    }

    const incoming: IncomingMessage = {
      messageId: String(message.message_id),
      senderId: chatId,
      content: sanitizedText ?? message.text, // Use sanitized text if provided
      receivedAt: new Date(message.date * 1000),
      metadata: {
        updateId: update.update_id,
        username: message.from?.username,
        isBot: message.from?.is_bot,
        chatType: message.chat.type,
      },
    };

    // Conditionally add optional properties (exactOptionalPropertyTypes)
    if (message.from?.first_name !== undefined) {
      incoming.senderName = message.from.first_name;
    }

    return incoming;
  }

  // ==========================================================================
  // Webhook Mode (Sprint 76)
  // ==========================================================================

  /**
   * Set Telegram webhook URL via Bot API.
   * Requires valid HTTPS URL (or ngrok for dev).
   */
  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    if (!this.config) {
      this.log.warn("Cannot set webhook: not configured");
      return false;
    }

    const body: Record<string, unknown> = {
      url,
      allowed_updates: ["message", "callback_query"],
    };
    if (secretToken) {
      body.secret_token = secretToken;
    }

    const response = await this.apiCall("setWebhook", "POST", body);
    if (response.ok) {
      this.log.info("Webhook set", { url });
    } else {
      this.log.error("Failed to set webhook", { error: response.description });
    }
    return response.ok;
  }

  /**
   * Delete Telegram webhook.
   */
  async deleteWebhook(): Promise<boolean> {
    if (!this.config) return false;

    const response = await this.apiCall("deleteWebhook", "POST", {});
    if (response.ok) {
      this.log.info("Webhook deleted");
    }
    return response.ok;
  }

  /**
   * Start webhook mode: set webhook URL and stop polling.
   */
  async startWebhook(webhookUrl: string, secretToken?: string): Promise<boolean> {
    const result = await this.setWebhook(webhookUrl, secretToken);
    if (result) {
      this.stopPolling();
      this.log.info("Switched to webhook mode", { url: webhookUrl });
    }
    return result;
  }

  /**
   * Stop webhook mode: delete webhook and resume polling.
   */
  async stopWebhook(): Promise<boolean> {
    const result = await this.deleteWebhook();
    if (result) {
      this.startPolling();
      this.log.info("Switched back to polling mode");
    }
    return result;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.stopPolling();
    this.approvalQueue = null;
    this.messageHandler = null;
    this.pendingMessages = [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create TelegramChannel instance.
 */
export function createTelegramChannel(
  config?: TelegramChannelConfig
): TelegramChannel {
  return new TelegramChannel(config);
}

/**
 * Create TelegramChannel from environment/config.
 */
export function createTelegramChannelFromEnv(): TelegramChannel | null {
  const config = loadTelegramConfig();
  if (!config) {
    return null;
  }
  return new TelegramChannel(config);
}
