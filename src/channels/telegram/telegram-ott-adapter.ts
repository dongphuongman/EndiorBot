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
import type { IMessageBus, BusInboundMessage, ChannelSendFn } from "../../bus/types.js";
import { createCorrelationId } from "../../bus/message-bus.js";
import { BusDebounce } from "../../bus/debounce.js";
import { TelegramChannel } from "./telegram-channel.js";
import { loadTelegramConfig } from "./telegram-config.js";
import { getAgentModel } from "../../agents/channel-router.js";
import type { RLFeedbackService } from "../../rl/feedback-service.js";

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

/** Interval for refreshing "typing..." action (Telegram shows it for ~5s) */
const TYPING_INTERVAL_MS = 4000;

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
 *
 * Sprint 106 (ADR-032): Optional bus parameter enables async path.
 * - With bus: publishes to bus non-blocking → BusConsumer delivers response
 * - Without bus: existing sync await path (backward compatible)
 *
 * Sprint 107 (ADR-032): Optional debounce parameter — last-message-wins.
 * - With debounce: rapid messages from same sender are coalesced (500ms)
 * - Without debounce: every message published immediately (backward compat)
 *
 * Sprint 110.5: Optional feedbackService parameter — wires RL keyboard into production.
 * - With feedbackService: channel.setFeedbackService() called → 👍/🔄/👎 keyboard live
 * - Without feedbackService: backward compat (no RL keyboard)
 */
export function createTelegramOttAdapter(
  ingress: GatewayIngress,
  bus?: IMessageBus,
  debounce?: BusDebounce,
  feedbackService?: RLFeedbackService,
): OttAdapter | null {
  const config = loadTelegramConfig();
  if (!config) return null;

  const channel = new TelegramChannel(config);
  // Sprint 110.5: Wire RL feedback service (if provided)
  if (feedbackService) channel.setFeedbackService(feedbackService);

  // Register message handler — routes ALL messages through Gateway ingress
  channel.onMessage(async (msg) => {
    let typingInterval: ReturnType<typeof setInterval> | null = null;

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

      // Sprint 106 (ADR-032): Async bus path — non-blocking
      if (bus) {
        const correlationId = createCorrelationId("telegram", msg.senderId);

        // replyFn: channel-specific send, called by BusConsumer after processing
        // Sprint 110 (Step 0.5): Forward correlationId + RL hints from opts to channel.send()
        const replyFn: ChannelSendFn = async (text, opts) => {
          const sendOpts: Parameters<typeof channel.send>[1] = {};
          if (opts?.format) sendOpts.format = opts.format;
          if (opts?.correlationId) sendOpts.correlationId = opts.correlationId;
          if (opts?.isTrainableTurn !== undefined) sendOpts.isTrainableTurn = opts.isTrainableTurn;
          if (opts?.provider) sendOpts.provider = opts.provider;
          if (opts?.request) sendOpts.request = opts.request;
          return channel.send(truncateForTelegram(text), sendOpts);
        };

        const busMsg: BusInboundMessage = {
          correlationId,
          channel: "telegram",
          senderId: msg.senderId,
          content: rawText,
          enqueuedAt: Date.now(),
          replyFn,
        };
        // exactOptionalPropertyTypes — build metadata separately, assign only if populated
        const metadata: Record<string, unknown> = {
          chatId: msg.metadata?.chatId ?? msg.senderId,
          messageId: msg.messageId,
        };
        if (msg.metadata?.username) metadata.username = msg.metadata.username;
        // Sprint 107: set dedupKey for BusDedup in consumer (Telegram messageId is stable across retries)
        if (msg.messageId) metadata.dedupKey = `telegram-${msg.messageId}`;
        busMsg.metadata = metadata;

        // CTO C2 (non-blocking): best-effort progress message — don't block enqueue
        const agentMatchBus = rawText.match(/^@(\w+)/);
        if (agentMatchBus) {
          const agentName = agentMatchBus[1] ?? "agent";
          const model = getAgentModel(agentName) ?? "sonnet";
          channel.send(`⏳ @${agentName} đang xử lý... (${model})`).catch(() => {});
        }

        // Sprint 107: debounce path — last-message-wins within windowMs
        if (debounce) {
          debounce.debounce(busMsg, (m) => bus.publishInbound(m));
        } else {
          bus.publishInbound(busMsg);
        }
        return; // Non-blocking — BusConsumer calls replyFn() when done
      }

      // Sync fallback (bus=undefined — existing behavior, all current tests pass)

      // UX: Send progress status for AI chat (agent mentions take 30-60s)
      const agentMatch = rawText.match(/^@(\w+)/);
      if (agentMatch) {
        const agentName = agentMatch[1] ?? "agent";
        // OTT adapter: no workspace context → ENTERPRISE default (CTO F1: cosmetic, same behavior)
        const model = getAgentModel(agentName) ?? "sonnet";
        await channel.send(`⏳ @${agentName} đang xử lý... (${model})`);
        // Keep "typing..." indicator alive every 4s while waiting
        typingInterval = setInterval(() => {
          void channel.sendChatAction().catch(() => {});
        }, TYPING_INTERVAL_MS);
      }

      // Single entry point — Gateway decides command vs chat
      const response = await ingress.handleInbound(inbound);

      // Clear typing indicator
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }

      // Format for Telegram vendor constraints + respect response.format (Sprint 98 OTT-007)
      const formattedText = truncateForTelegram(response.text);
      const sendOptions: { format?: string } = {};
      if (response.format) sendOptions.format = response.format;
      const sent = await channel.send(formattedText, sendOptions);

      if (!sent) {
        console.error("[TelegramOTT] Failed to send response to Telegram");
      }
    } catch (error) {
      // Clear typing indicator on error
      if (typingInterval) {
        clearInterval(typingInterval);
      }

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
