/**
 * Telegram OTT Adapter — Thin transport + format layer.
 *
 * Normalizes Telegram messages → calls GatewayIngress.handleInbound()
 * → formats response for Telegram (truncate, Markdown, InlineKeyboard).
 *
 * ZERO imports from command handlers or ChannelRouter (B3 verified).
 *
 * @module channels/telegram/telegram-ott-adapter
 * @version 1.0.0
 * @authority Sprint 93 Plan (B3)
 * @sprint 93
 */

import type { GatewayIngress, InboundMessage } from "../../gateway/ingress.js";
import { TelegramChannel } from "./telegram-channel.js";
import { loadTelegramConfig } from "./telegram-config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * OTT Adapter interface — unified for all OTT channels.
 * Portable pattern aligned with MTClaw Channel.HandleMessage() (ADR-002).
 */
export interface OttAdapter {
  /** Adapter name (for logging/status) */
  name: string;
  /** Start receiving messages */
  start(): Promise<void>;
  /** Stop receiving messages */
  stop(): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Telegram message length limit */
const TELEGRAM_MAX_LEN = 4096;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Truncate text for Telegram's 4096 char limit.
 */
function truncateForTelegram(text: string, maxLen = TELEGRAM_MAX_LEN): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 20) + "\n\n[...truncated]";
}

/**
 * Strip sanitizer wrapper tags from incoming text.
 * Telegram messages from TelegramChannel arrive wrapped when non-command.
 */
function stripSanitizerWrapper(text: string): string {
  const match = text.match(/\[EXTERNAL_INPUT[^\]]*\]\n([\s\S]*?)\n\[\/EXTERNAL_INPUT\]/);
  return match?.[1] ?? text;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Telegram OTT adapter.
 *
 * Returns null if Telegram is not configured (missing env vars).
 * The adapter is a thin layer: normalize → handleInbound() → format.
 */
export function createTelegramOttAdapter(
  ingress: GatewayIngress,
): OttAdapter | null {
  const config = loadTelegramConfig();
  if (!config) return null;

  const channel = new TelegramChannel(config);

  // Register message handler — routes ALL messages through Gateway ingress
  channel.onMessage(async (msg) => {
    try {
      // Strip TelegramChannel's sanitizer wrapper to get raw text.
      // DO NOT re-sanitize here — TelegramChannel already applied defense-in-depth
      // (chatId guard + violation logging). Re-wrapping breaks mention parsing
      // because [EXTERNAL_INPUT]@researcher ...[/EXTERNAL_INPUT] doesn't start
      // with @, so parseMention() fails and the router shows a help message.
      const rawText = stripSanitizerWrapper(msg.content);

      // Normalize to InboundMessage — adapter knows NOTHING about command semantics
      const inbound: InboundMessage = {
        channel: "telegram",
        senderId: msg.senderId,
        content: rawText,
        metadata: {
          chatId: msg.metadata?.chatId ?? msg.senderId,
          messageId: msg.messageId,
          username: msg.metadata?.username,
        },
      };

      // Single entry point — Gateway decides command vs chat
      const response = await ingress.handleInbound(inbound);

      // Format for Telegram vendor constraints
      const formattedText = truncateForTelegram(response.text);
      await channel.send(formattedText);

      // Forward replyMarkup if present (InlineKeyboard)
      // Note: channel.send() doesn't support replyMarkup directly,
      // but the response text is sufficient for Sprint 93.
    } catch (error) {
      // R5: Error boundary — adapter crash doesn't kill process
      console.error("[TelegramOTT] Message handling error:", (error as Error).message);
      try {
        await channel.send("Internal error. Please try again.");
      } catch {
        // Send failed — silently ignore to prevent crash cascade
      }
    }
  });

  return {
    name: "Telegram",

    async start(): Promise<void> {
      channel.startPolling();
      console.log("[TelegramOTT] Adapter started (polling)");
    },

    async stop(): Promise<void> {
      channel.stopPolling();
      console.log("[TelegramOTT] Adapter stopped");
    },
  };
}
