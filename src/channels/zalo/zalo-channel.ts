/**
 * Zalo Channel
 *
 * Zalo OA (Official Account) integration for CEO escalation notifications.
 *
 * Per Sprint 46 Days 4-5 requirements:
 * - Send alerts to CEO via Zalo OA
 * - Bidirectional communication support
 * - Webhook/polling for incoming messages
 * - Wire through OTTMessageRouter for security
 *
 * @module channels/zalo/zalo-channel
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 4-5
 * @authority ADR-005 Python-to-TypeScript Porting
 * @stage 04 - BUILD
 */

import type { BidirectionalChannel, EscalationAlert, IncomingMessage, IncomingMessageHandler } from "../types.js";
import { formatAlert } from "../types.js";
import type { ZaloChannelConfig } from "./zalo-config.js";
import { loadZaloConfig, isValidOaId, isValidUserId, ZALO_API_BASE } from "./zalo-config.js";
import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Zalo API response.
 */
interface ZaloResponse<T = unknown> {
  error: number;
  message: string;
  data?: T;
}

/**
 * Zalo message sent response.
 */
interface ZaloMessageSent {
  message_id: string;
}

/**
 * Zalo webhook event (incoming message).
 */
interface ZaloWebhookEvent {
  event_name: string;
  app_id: string;
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  message?: {
    msg_id: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;
  };
  timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Request timeout in ms */
const REQUEST_TIMEOUT_MS = 10_000;

// ============================================================================
// ZaloChannel
// ============================================================================

/**
 * Zalo OA notification channel (bidirectional).
 *
 * Features:
 * - Send plain text and formatted alerts
 * - Receive incoming messages via webhook
 * - Two-way communication with CEO
 * - Security: validate OA ID and user ID
 *
 * Sprint 46: Implements BidirectionalChannel for two-way communication.
 */
export class ZaloChannel implements BidirectionalChannel {
  readonly name = "zalo";

  private config: ZaloChannelConfig | null;
  private log: Logger;
  private messageHandler: IncomingMessageHandler | null = null;
  private pendingMessages: IncomingMessage[] = [];
  private receiving = false;

  constructor(config?: ZaloChannelConfig) {
    this.config = config ?? loadZaloConfig();
    this.log = createLogger("zalo-channel");

    if (this.config) {
      this.log.info("ZaloChannel initialized", {
        hasToken: !!this.config.accessToken,
        hasUserId: !!this.config.userId,
        oaId: this.config.oaId,
        webhookEnabled: this.config.enableWebhook,
      });
    } else {
      this.log.warn("ZaloChannel not configured");
    }
  }

  // ==========================================================================
  // IChannel Implementation
  // ==========================================================================

  /**
   * Send a plain text message.
   */
  async send(message: string): Promise<boolean> {
    if (!this.config) {
      this.log.warn("Cannot send: Zalo not configured");
      return false;
    }

    try {
      const result = await this.sendTextMessage(message);
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
      this.log.warn("Cannot send alert: Zalo not configured");
      return false;
    }

    try {
      // Zalo doesn't support Markdown, use plain text format
      const formattedMessage = formatAlert(alert);
      const result = await this.sendTextMessage(formattedMessage);

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
   * Check if Zalo channel is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    // Validate config
    if (!isValidOaId(this.config.oaId)) {
      this.log.warn("Invalid OA ID format");
      return false;
    }

    if (!isValidUserId(this.config.userId)) {
      this.log.warn("Invalid user ID format");
      return false;
    }

    // Test API connection
    try {
      const response = await this.apiCall<{ oa_id: string }>("oa/getoa");
      if (response.error === 0 && response.data) {
        this.log.debug("Zalo API available", {
          oaId: response.data.oa_id,
        });
        return true;
      }
      return false;
    } catch (error) {
      this.log.warn("Zalo API not available", {
        error: (error as Error).message,
      });
      return false;
    }
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
   * Start receiving messages.
   * For Zalo, this enables webhook event processing.
   */
  async start(): Promise<void> {
    this.receiving = true;
    this.log.info("Zalo channel started (webhook mode)");
  }

  /**
   * Stop receiving messages.
   */
  async stop(): Promise<void> {
    this.receiving = false;
    this.log.info("Zalo channel stopped");
  }

  /**
   * Check if channel is actively receiving messages.
   */
  isReceiving(): boolean {
    return this.receiving;
  }

  // ==========================================================================
  // Webhook Event Handling
  // ==========================================================================

  /**
   * Handle incoming webhook event from Zalo.
   * This should be called by the webhook endpoint.
   *
   * @param event - Zalo webhook event
   */
  async handleWebhookEvent(event: ZaloWebhookEvent): Promise<void> {
    if (!this.receiving) {
      this.log.debug("Ignoring webhook event (not receiving)");
      return;
    }

    // Only process message events
    if (event.event_name !== "user_send_text") {
      this.log.debug("Ignoring non-text event", { eventName: event.event_name });
      return;
    }

    // Security: validate OA ID matches config
    if (event.recipient.id !== this.config?.oaId) {
      this.log.warn("Ignoring event for different OA", {
        eventOaId: event.recipient.id,
        configOaId: this.config?.oaId,
      });
      return;
    }

    // Convert to IncomingMessage
    const incoming = this.toIncomingMessage(event);
    if (!incoming) {
      return;
    }

    // Queue for receive() polling
    this.pendingMessages.push(incoming);

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

  /**
   * Convert Zalo webhook event to IncomingMessage.
   */
  private toIncomingMessage(event: ZaloWebhookEvent): IncomingMessage | null {
    if (!event.message?.text) {
      return null;
    }

    return {
      messageId: event.message.msg_id,
      senderId: event.sender.id,
      content: event.message.text,
      receivedAt: new Date(parseInt(event.timestamp, 10)),
      metadata: {
        eventName: event.event_name,
        appId: event.app_id,
        recipientId: event.recipient.id,
        attachments: event.message.attachments,
      },
    };
  }

  // ==========================================================================
  // Zalo API
  // ==========================================================================

  /**
   * Send a text message to the configured user.
   */
  private async sendTextMessage(text: string): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    const body = {
      recipient: {
        user_id: this.config.userId,
      },
      message: {
        text,
      },
    };

    const response = await this.apiCall<ZaloMessageSent>("oa/message/text", "POST", body);
    return response.error === 0;
  }

  /**
   * Make an API call to Zalo OA.
   */
  private async apiCall<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>
  ): Promise<ZaloResponse<T>> {
    if (!this.config) {
      return { error: -1, message: "Not configured" };
    }

    const url = `${ZALO_API_BASE}/${endpoint}`;
    const timeoutMs = this.config.timeoutMs ?? REQUEST_TIMEOUT_MS;

    try {
      const options: RequestInit = {
        method,
        headers: {
          "access_token": this.config.accessToken,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = (await response.json()) as ZaloResponse<T>;

      if (data.error !== 0) {
        this.log.warn("Zalo API error", {
          endpoint,
          error: data.error,
          message: data.message,
        });
      }

      return data;
    } catch (error) {
      this.log.error("Zalo API request failed", {
        endpoint,
        error: (error as Error).message,
      });
      return {
        error: -1,
        message: (error as Error).message,
      };
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
    this.messageHandler = null;
    this.pendingMessages = [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create ZaloChannel instance.
 */
export function createZaloChannel(config?: ZaloChannelConfig): ZaloChannel {
  return new ZaloChannel(config);
}

/**
 * Create ZaloChannel from environment/config.
 */
export function createZaloChannelFromEnv(): ZaloChannel | null {
  const config = loadZaloConfig();
  if (!config) {
    return null;
  }
  return new ZaloChannel(config);
}
