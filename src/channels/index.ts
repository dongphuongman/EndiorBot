/**
 * Channels Module
 *
 * Notification channel abstraction for OTT escalation.
 *
 * Per Sprint 38 requirements:
 * - Channel interface for multiple notification targets
 * - Telegram channel for CEO escalation
 * - Future: Zalo, WhatsApp, etc.
 *
 * @module channels
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Week 1
 * @authority Sprint 38 Plan - OTT Escalation
 * @stage 04 - BUILD
 */

// Types
export type {
  EscalationAlertType,
  AlertPriority,
  EscalationAlert,
  IChannel,
  ChannelConfig,
  NotificationChannelsConfig,
  RegisteredChannel,
  IChannelRegistry,
} from "./types.js";

export {
  formatAlert,
  formatAlertMarkdown,
  getAlertEmoji,
  getPriorityIndicator,
} from "./types.js";

// Telegram Channel
export type {
  TelegramChannelConfig,
  TelegramChannelConfigPartial,
} from "./telegram/telegram-config.js";

export {
  loadTelegramConfig,
  isTelegramConfigured,
  isValidBotToken,
  isValidChatId,
  ENV_TELEGRAM_BOT_TOKEN,
  ENV_TELEGRAM_CHAT_ID,
  ENV_TELEGRAM_PARSE_MODE,
  ENV_TELEGRAM_POLLING,
  DEFAULT_CONFIG_PATH,
  DEFAULT_TELEGRAM_CONFIG,
} from "./telegram/telegram-config.js";

export type { ApprovalQueueLike } from "./telegram/telegram-channel.js";

export {
  TelegramChannel,
  createTelegramChannel,
  createTelegramChannelFromEnv,
} from "./telegram/telegram-channel.js";

// Telegram NotificationSystem Adapter
export {
  TelegramChannelAdapter,
  createTelegramAdapter,
  shouldSendToTelegram,
} from "./telegram/notification-adapter.js";

// ============================================================================
// Channel Registry
// ============================================================================

import type { IChannel, RegisteredChannel, EscalationAlert } from "./types.js";

/**
 * Simple channel registry for managing multiple channels.
 */
export class ChannelRegistry {
  private channels: Map<string, RegisteredChannel> = new Map();

  /**
   * Register a channel.
   */
  register(channel: IChannel, priority = 100): void {
    this.channels.set(channel.name, { channel, priority });
  }

  /**
   * Unregister a channel by name.
   */
  unregister(name: string): boolean {
    return this.channels.delete(name);
  }

  /**
   * Get all registered channels sorted by priority.
   */
  getChannels(): RegisteredChannel[] {
    return Array.from(this.channels.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  /**
   * Get a specific channel by name.
   */
  getChannel(name: string): IChannel | undefined {
    return this.channels.get(name)?.channel;
  }

  /**
   * Broadcast an alert to all available channels.
   */
  async broadcast(alert: EscalationAlert): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const { channel } of this.getChannels()) {
      const available = await channel.isAvailable();
      if (available) {
        const sent = await channel.sendAlert(alert);
        results.set(channel.name, sent);
      } else {
        results.set(channel.name, false);
      }
    }

    return results;
  }

  /**
   * Send a message to all available channels.
   */
  async broadcastMessage(message: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const { channel } of this.getChannels()) {
      const available = await channel.isAvailable();
      if (available) {
        const sent = await channel.send(message);
        results.set(channel.name, sent);
      } else {
        results.set(channel.name, false);
      }
    }

    return results;
  }
}

/**
 * Global channel registry instance.
 */
let globalRegistry: ChannelRegistry | null = null;

/**
 * Get the global channel registry.
 */
export function getChannelRegistry(): ChannelRegistry {
  if (!globalRegistry) {
    globalRegistry = new ChannelRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global channel registry.
 */
export function resetChannelRegistry(): void {
  globalRegistry = null;
}
