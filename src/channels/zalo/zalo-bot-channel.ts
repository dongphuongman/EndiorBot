/**
 * Zalo Bot Channel
 *
 * Zalo Bot Platform integration for CEO escalation notifications.
 * Uses Zapps.me / bot.zaloplatforms.com for personal account bots.
 *
 * Per Sprint 51 requirements:
 * - Send alerts to CEO via Zalo Bot
 * - Bidirectional communication support
 * - Long polling for incoming messages
 * - Wire through OTTMessageRouter for security
 *
 * @module channels/zalo/zalo-bot-channel
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 51
 * @authority ADR-005 Python-to-TypeScript Porting
 * @stage 04 - BUILD
 */

import type { BidirectionalChannel, EscalationAlert, IncomingMessage, IncomingMessageHandler } from "../types.js";
import { formatAlert } from "../types.js";
import {
  getMe,
  sendMessage,
  getUpdates,
  ZaloBotApiError,
  type ZaloBotInfo,
  type ZaloBotUpdate,
  type ZaloBotMessage,
} from "./zalo-bot-api.js";
import { createLogger, type Logger } from "../../logging/index.js";
import { getInputSanitizer } from "../../security/input-sanitizer.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Zalo Bot channel configuration.
 */
export interface ZaloBotChannelConfig {
  /** Bot token from Zapps.me (format: botId:secretPart) */
  botToken: string;
  /** Chat ID for CEO (Zalo user ID) - numeric string */
  chatId?: string;
  /** Enable polling for incoming messages */
  enablePolling: boolean;
  /** Polling timeout in seconds */
  pollingTimeout: number;
  /** Request timeout in ms */
  timeoutMs: number;
}

/**
 * Partial config for overrides.
 */
export type ZaloBotChannelConfigPartial = Partial<ZaloBotChannelConfig>;

// ============================================================================
// Constants
// ============================================================================

/** Environment variable names */
export const ENV_ZALO_BOT_TOKEN = "ZALO_BOT_TOKEN";
export const ENV_ZALO_BOT_CHAT_ID = "ZALO_BOT_CHAT_ID";

/** Default configuration values */
export const DEFAULT_ZALO_BOT_CONFIG: Omit<ZaloBotChannelConfig, "botToken"> = {
  enablePolling: true,
  pollingTimeout: 30,
  timeoutMs: 10_000,
};

/** Text message limit (Zalo API limit) */
const ZALO_TEXT_LIMIT = 2000;

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load Zalo Bot configuration from environment.
 */
export function loadZaloBotConfig(): ZaloBotChannelConfig | null {
  const botToken = process.env[ENV_ZALO_BOT_TOKEN];
  if (!botToken) {
    return null;
  }

  const config: ZaloBotChannelConfig = {
    ...DEFAULT_ZALO_BOT_CONFIG,
    botToken,
  };

  const chatId = process.env[ENV_ZALO_BOT_CHAT_ID];
  if (chatId) {
    config.chatId = chatId;
  }

  return config;
}

/**
 * Check if Zalo Bot is configured.
 */
export function isZaloBotConfigured(): boolean {
  return !!process.env[ENV_ZALO_BOT_TOKEN];
}

// ============================================================================
// ZaloBotChannel
// ============================================================================

/**
 * Zalo Bot Platform notification channel (bidirectional).
 *
 * Features:
 * - Send plain text and formatted alerts via Zalo Bot
 * - Receive incoming messages via long polling
 * - Two-way communication with CEO
 * - Security: sanitize incoming messages
 *
 * Sprint 51: Implements BidirectionalChannel for two-way communication.
 */
export class ZaloBotChannel implements BidirectionalChannel {
  readonly name = "zalo-bot";

  private config: ZaloBotChannelConfig | null;
  private botInfo: ZaloBotInfo | null = null;
  private log: Logger;
  private messageHandler: IncomingMessageHandler | null = null;
  private pendingMessages: IncomingMessage[] = [];
  private receiving = false;
  private pollingAbort: AbortController | null = null;

  constructor(config?: ZaloBotChannelConfig) {
    this.config = config ?? loadZaloBotConfig();
    this.log = createLogger("zalo-bot-channel");

    if (this.config) {
      this.log.info("ZaloBotChannel initialized", {
        hasToken: !!this.config.botToken,
        hasChatId: !!this.config.chatId,
        pollingEnabled: this.config.enablePolling,
      });
    } else {
      this.log.warn("ZaloBotChannel not configured");
    }
  }

  // ==========================================================================
  // IChannel Implementation
  // ==========================================================================

  /**
   * Send a plain text message to the configured chat.
   */
  async send(message: string): Promise<boolean> {
    if (!this.config?.chatId) {
      this.log.warn("Cannot send: Zalo Bot not configured or no chatId");
      return false;
    }

    try {
      return await this.sendTextMessage(this.config.chatId, message);
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
    if (!this.config?.chatId) {
      this.log.warn("Cannot send alert: Zalo Bot not configured or no chatId");
      return false;
    }

    try {
      // Zalo doesn't support Markdown, use plain text format
      const formattedMessage = formatAlert(alert);
      const result = await this.sendTextMessage(this.config.chatId, formattedMessage);

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
   * Check if Zalo Bot channel is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    // Try getMe first (short timeout — zapps.me returns 502 intermittently)
    try {
      const response = await getMe(this.config.botToken, 5000);
      if (response.ok && response.result) {
        this.botInfo = response.result;
        this.log.debug("Zalo Bot API available", {
          botId: response.result.id,
          botName: response.result.name,
        });
        return true;
      }
    } catch {
      // getMe failed — expected on zapps.me (502 intermittent)
    }

    // Fallback: try getUpdates with 1s poll timeout as a connectivity check
    try {
      await getUpdates(this.config.botToken, { timeout: 1 });
      this.log.debug("Zalo Bot API available (via getUpdates fallback)");
      return true;
    } catch (fallbackError) {
      if (fallbackError instanceof ZaloBotApiError && fallbackError.isPollingTimeout) {
        // 408 = API is reachable, just no pending updates
        this.log.debug("Zalo Bot API available (408 polling timeout)");
        return true;
      }
      this.log.warn("Zalo Bot API not available", {
        error: (fallbackError as Error).message,
      });
      return false;
    }
  }

  /**
   * Get bot info (cached after first isAvailable call).
   */
  getBotInfo(): ZaloBotInfo | null {
    return this.botInfo;
  }

  // ==========================================================================
  // BidirectionalChannel Implementation
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
   * Start receiving messages via long polling.
   */
  async start(): Promise<void> {
    if (!this.config || !this.config.enablePolling) {
      this.log.warn("Cannot start: Zalo Bot not configured or polling disabled");
      return;
    }

    this.receiving = true;
    this.pollingAbort = new AbortController();
    this.log.info("Zalo Bot channel started (polling mode)");

    // Start polling loop
    this.startPollingLoop();
  }

  /**
   * Stop receiving messages.
   */
  async stop(): Promise<void> {
    this.receiving = false;
    this.pollingAbort?.abort();
    this.pollingAbort = null;
    this.log.info("Zalo Bot channel stopped");
  }

  /**
   * Check if channel is actively receiving messages.
   */
  isReceiving(): boolean {
    return this.receiving;
  }

  // ==========================================================================
  // Polling
  // ==========================================================================

  /**
   * Start the long polling loop.
   */
  private startPollingLoop(): void {
    const poll = async (): Promise<void> => {
      if (!this.receiving || !this.config || this.pollingAbort?.signal.aborted) {
        return;
      }

      try {
        const response = await getUpdates(this.config.botToken, {
          timeout: this.config.pollingTimeout,
        });

        if (response.ok && response.result) {
          await this.processUpdate(response.result);
        }
      } catch (error) {
        if (error instanceof ZaloBotApiError && error.isPollingTimeout) {
          // No updates available - this is normal
          this.log.debug("Polling timeout (no updates)");
        } else if (this.receiving && !this.pollingAbort?.signal.aborted) {
          this.log.error("Polling error", { error: (error as Error).message });
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // Continue polling
      if (this.receiving && !this.pollingAbort?.signal.aborted) {
        setImmediate(poll);
      }
    };

    void poll();
  }

  /**
   * Process an update from the API.
   */
  private async processUpdate(update: ZaloBotUpdate): Promise<void> {
    const { event_name, message } = update;
    if (!message) {
      return;
    }

    switch (event_name) {
      case "message.text.received":
        await this.handleTextMessage(message);
        break;
      case "message.image.received":
        this.log.info("Received image message", { from: message.from.id });
        break;
      case "message.sticker.received":
        this.log.debug("Received sticker", { from: message.from.id });
        break;
      case "message.unsupported.received":
        this.log.debug("Received unsupported message type", { from: message.from.id });
        break;
    }
  }

  /**
   * Handle incoming text message.
   */
  private async handleTextMessage(message: ZaloBotMessage): Promise<void> {
    const { text, from, chat, message_id, date } = message;
    if (!text?.trim()) {
      return;
    }

    // Security: Sanitize incoming message text
    const sanitizer = getInputSanitizer();
    const sanitizeResult = sanitizer.sanitizeExternalInput(text, "zalo-bot");

    // Check for injection attempts
    if (sanitizeResult.violations.length > 0) {
      this.log.warn("Injection attempt detected", {
        senderId: from.id,
        violations: sanitizeResult.violations,
      });
    }

    // Convert to IncomingMessage
    const incoming: IncomingMessage = {
      messageId: message_id,
      senderId: from.id,
      content: sanitizeResult.sanitized,
      receivedAt: new Date(date * 1000),
      metadata: {
        senderName: from.name,
        senderAvatar: from.avatar,
        chatId: chat.id,
        chatType: chat.chat_type,
      },
    };

    // Queue for receive() polling
    this.pendingMessages.push(incoming);

    this.log.info("Message received", {
      from: from.name || from.id,
      chatId: chat.id,
      textLength: text.length,
    });

    // Dispatch to handler if registered
    if (this.messageHandler) {
      try {
        await this.messageHandler(incoming);
      } catch (error) {
        this.log.error("Message handler error", {
          error: (error as Error).message,
        });
      }
    }
  }

  // ==========================================================================
  // Zalo Bot API
  // ==========================================================================

  /**
   * Send a text message to a chat.
   */
  private async sendTextMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    // Chunk long messages
    const chunks = this.chunkText(text, ZALO_TEXT_LIMIT);

    for (const chunk of chunks) {
      try {
        const response = await sendMessage(this.config.botToken, {
          chat_id: chatId,
          text: chunk,
        });
        if (!response.ok) {
          this.log.error("Failed to send message chunk", {
            errorCode: response.error_code,
            description: response.description,
          });
          return false;
        }
      } catch (error) {
        this.log.error("sendMessage error", { error: (error as Error).message });
        return false;
      }
    }

    return true;
  }

  /**
   * Chunk text into smaller pieces.
   */
  private chunkText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to find a good break point
      let breakIndex = remaining.lastIndexOf("\n", maxLength);
      if (breakIndex === -1 || breakIndex < maxLength / 2) {
        breakIndex = remaining.lastIndexOf(" ", maxLength);
      }
      if (breakIndex === -1 || breakIndex < maxLength / 2) {
        breakIndex = maxLength;
      }

      chunks.push(remaining.substring(0, breakIndex));
      remaining = remaining.substring(breakIndex).trim();
    }

    return chunks;
  }

  // ==========================================================================
  // Public API for sending to specific users
  // ==========================================================================

  /**
   * Send a message to a specific chat ID.
   * Useful for replying to a specific user.
   */
  async sendToChat(chatId: string, message: string): Promise<boolean> {
    if (!this.config) {
      this.log.warn("Cannot sendToChat: Zalo Bot not configured");
      return false;
    }

    try {
      return await this.sendTextMessage(chatId, message);
    } catch (error) {
      this.log.error("Failed to sendToChat", {
        chatId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.receiving = false;
    this.pollingAbort?.abort();
    this.pollingAbort = null;
    this.messageHandler = null;
    this.pendingMessages = [];
    this.botInfo = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create ZaloBotChannel instance.
 */
export function createZaloBotChannel(config?: ZaloBotChannelConfig): ZaloBotChannel {
  return new ZaloBotChannel(config);
}

/**
 * Create ZaloBotChannel from environment.
 */
export function createZaloBotChannelFromEnv(): ZaloBotChannel | null {
  const config = loadZaloBotConfig();
  if (!config) {
    return null;
  }
  return new ZaloBotChannel(config);
}
