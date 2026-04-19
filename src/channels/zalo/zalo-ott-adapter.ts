/**
 * Zalo OTT Adapter — Thin transport + format layer.
 *
 * Normalizes Zalo messages → calls GatewayIngress.handleInbound()
 * → formats response for Zalo (truncate 2000 chars, plain text, no buttons).
 *
 * ZERO imports from command handlers or ChannelRouter (B3 verified).
 *
 * @module channels/zalo/zalo-ott-adapter
 * @version 1.0.0
 * @authority Sprint 93 Plan (B3)
 * @sprint 93
 */

import type { GatewayIngress, InboundMessage } from "../../gateway/ingress.js";
import type { IMessageBus, BusInboundMessage, ChannelSendFn } from "../../bus/types.js";
import type { BusDebounce } from "../../bus/debounce.js";
import { createCorrelationId } from "../../bus/message-bus.js";
import {
  getUpdates,
  sendMessage,
  getMe,
  type ZaloBotUpdate,
} from "./zalo-bot-api.js";
import type { OttAdapter } from "../telegram/telegram-ott-adapter.js";

// ============================================================================
// Constants
// ============================================================================

/** Zalo message length limit (stricter than Telegram) */
const ZALO_MAX_LEN = 2000;

/** Zalo polling interval in ms */
const ZALO_POLL_INTERVAL_MS = 1000;

/** Zalo long polling timeout in seconds */
const ZALO_POLL_TIMEOUT_SEC = 25;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Truncate text for Zalo's 2000 char limit.
 */
function truncateForZalo(text: string, maxLen = ZALO_MAX_LEN): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 20) + "\n\n[...truncated]";
}

/**
 * Strip Markdown formatting for Zalo (plain text only).
 * Basic stripping — removes common Markdown syntax.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")   // **bold** → bold
    .replace(/\*(.*?)\*/g, "$1")       // *italic* → italic
    .replace(/`([^`]+)`/g, "$1")       // `code` → code
    .replace(/```[\s\S]*?```/g, (m) => // ```block``` → block
      m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [text](url) → text
}

/**
 * Sprint 137 A9: Zalo Bot API does not expose `editMessageText` in our
 * integration, so we cannot do the in-place edit Telegram does (A8). Instead
 * we throttle progress messages — only the FIRST progress tick per
 * correlationId reaches Zalo, plus a fresh tick at most once per
 * ZALO_PROGRESS_THROTTLE_MS afterwards. Final responses always go through.
 *
 * Override at runtime: ENDIORBOT_ZALO_PROGRESS_THROTTLE_MS (default 60_000).
 */
const ZALO_PROGRESS_THROTTLE_MS = (() => {
  const raw = process.env.ENDIORBOT_ZALO_PROGRESS_THROTTLE_MS;
  if (!raw) return 60_000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
})();

/**
 * Decide whether a Zalo progress tick should be sent or dropped.
 *
 * Returns the new `lastSentMs` value to record, or `null` if the tick
 * should be skipped (already sent within the throttle window).
 *
 * Exported for unit testing — pure function, no side effects.
 */
export function decideZaloProgressEmit(
  lastSentMs: number | undefined,
  nowMs: number,
  throttleMs: number = ZALO_PROGRESS_THROTTLE_MS,
): number | null {
  if (lastSentMs === undefined) return nowMs;
  if (nowMs - lastSentMs >= throttleMs) return nowMs;
  return null;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Zalo OTT adapter.
 *
 * Returns null if Zalo bot token is not configured.
 * Uses long polling (getUpdates) for dev/testing.
 *
 * Zalo constraints vs Telegram:
 * - 2000 char limit (vs 4096)
 * - Plain text only (no Markdown)
 * - No inline keyboard / buttons
 * - Single update per poll (not array)
 */
export function createZaloOttAdapter(
  ingress: GatewayIngress,
  bus?: IMessageBus,
  debounce?: BusDebounce,
): OttAdapter | null {
  const envToken = process.env.ENDIORBOT_ZALO_BOT_TOKEN;
  if (!envToken) return null;
  // Capture as const string (not string | undefined) for closure use
  const token: string = envToken;

  let pollingActive = false;
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;

  // Sprint 137 A9: per-correlationId last-progress-sent timestamps.
  // Adapter-owned (single-owner invariant — never on bus payload). Zalo lacks
  // editMessage support so we throttle to one progress message per window.
  const zaloProgressLastSent = new Map<string, number>();

  async function handleUpdate(update: ZaloBotUpdate): Promise<void> {
    if (update.event_name !== "message.text.received") return;
    const msg = update.message;
    if (!msg?.text) return;

    try {
      const inbound: InboundMessage = {
        channel: "zalo",
        senderId: msg.from.id,
        content: msg.text,
        metadata: {
          chatId: msg.chat.id,
          messageId: msg.message_id,
          chatType: msg.chat.chat_type,
        },
      };

      // Sprint 115 (T4): Async bus path — non-blocking (mirrors Telegram pattern)
      if (bus) {
        const correlationId = createCorrelationId("zalo", msg.from.id);

        // Sprint 137 A9: Zalo replyFn. Honors `isProgress` by throttling
        // progress messages — Zalo Bot API lacks editMessageText, so the
        // alternative to Telegram's in-place edit (A8) is "drop the
        // intermediate ticks, keep one heartbeat per ZALO_PROGRESS_THROTTLE_MS".
        // Final responses always go through (they hit the non-progress branch).
        // Zalo remains excluded from RL pipeline (no keyboard).
        const replyFn: ChannelSendFn = async (text, opts) => {
          const plainText = stripMarkdown(text);
          const formattedText = truncateForZalo(plainText);
          const cid = opts?.correlationId;

          if (opts?.isProgress && cid) {
            const decision = decideZaloProgressEmit(
              zaloProgressLastSent.get(cid),
              Date.now(),
            );
            if (decision === null) return true; // throttled — pretend delivered
            zaloProgressLastSent.set(cid, decision);
          } else if (cid && !opts?.isProgress) {
            // Final response or error — clear throttle state for the cid.
            zaloProgressLastSent.delete(cid);
          }

          await sendMessage(token, { chat_id: msg.chat.id, text: formattedText });
          return true;
        };

        const busMsg: BusInboundMessage = {
          correlationId,
          channel: "zalo",
          senderId: msg.from.id,
          content: msg.text,
          enqueuedAt: Date.now(),
          replyFn,
        };
        // Sprint 115 (T3): notifyFn = replyFn for approval notifications
        busMsg.notifyFn = replyFn;

        const metadata: Record<string, unknown> = {
          chatId: msg.chat.id,
          messageId: msg.message_id,
        };
        if (msg.chat.chat_type) metadata.chatType = msg.chat.chat_type;
        if (msg.message_id) metadata.dedupKey = `zalo-${msg.message_id}`;
        busMsg.metadata = metadata;

        if (debounce) {
          debounce.debounce(busMsg, (m) => bus.publishInbound(m));
        } else {
          bus.publishInbound(busMsg);
        }
        return; // Non-blocking — BusConsumer calls replyFn() when done
      }

      const response = await ingress.handleInbound(inbound);

      // Zalo constraints: plain text, 2000 chars
      const plainText = stripMarkdown(response.text);
      const formattedText = truncateForZalo(plainText);

      await sendMessage(token, {
        chat_id: msg.chat.id,
        text: formattedText,
      });
    } catch (error) {
      // R5: Error boundary — adapter crash doesn't kill process
      console.error("[ZaloOTT] Message handling error:", (error as Error).message);
      try {
        await sendMessage(token, {
          chat_id: msg.chat.id,
          text: "Internal error. Please try again.",
        });
      } catch {
        // Send failed — silently ignore
      }
    }
  }

  async function pollLoop(): Promise<void> {
    if (!pollingActive) return;

    try {
      const result = await getUpdates(token, { timeout: ZALO_POLL_TIMEOUT_SEC });
      if (result.ok && result.result) {
        await handleUpdate(result.result);
      }
    } catch (error) {
      // Polling timeout (408) is normal — just continue
      const err = error as Error & { isPollingTimeout?: boolean };
      if (!err.isPollingTimeout) {
        console.error("[ZaloOTT] Polling error:", err.message);
      }
    }

    if (pollingActive) {
      pollTimeout = setTimeout(() => void pollLoop(), ZALO_POLL_INTERVAL_MS);
    }
  }

  return {
    name: "Zalo",

    async start(): Promise<void> {
      // Verify token first
      try {
        const info = await getMe(token, 5000);
        if (info.ok && info.result) {
          console.log(`[ZaloOTT] Bot verified: ${info.result.name}`);
        }
      } catch (error) {
        console.warn("[ZaloOTT] Bot verification failed:", (error as Error).message);
      }

      pollingActive = true;
      void pollLoop();
      console.log("[ZaloOTT] Adapter started (polling)");
    },

    async stop(): Promise<void> {
      pollingActive = false;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }
      console.log("[ZaloOTT] Adapter stopped");
    },
  };
}
