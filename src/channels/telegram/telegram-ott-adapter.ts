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
// Sprint 147 T1: getAgentModel import removed — progress message moved to callAI()
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

/**
 * Sprint 137 A8: progress-aware Telegram channel surface.
 *
 * Subset of TelegramChannel that buildProgressAwareReplyFn depends on. Letting
 * tests inject a stub keeps the unit isolated from the real Bot API.
 */
export interface ProgressAwareTelegramChannel {
  send(
    text: string,
    options?: {
      format?: string;
      correlationId?: string;
      isTrainableTurn?: boolean;
      provider?: string;
      request?: Array<{ role: string; content: string }>;
      tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    },
  ): Promise<boolean>;
  sendCapturingId(
    text: string,
    options?: { format?: string },
  ): Promise<number | null>;
  editMessage(
    messageId: number,
    text: string,
    options?: { format?: string },
  ): Promise<boolean>;
}

/**
 * Sprint 137 A8: build a Telegram replyFn that edits a placeholder message
 * in place when the BusConsumer flags an outbound as `isProgress: true`.
 *
 * Lifecycle (per `correlationId`):
 *   1. First `replyFn(text, { isProgress: true, correlationId })` →
 *      `channel.sendCapturingId()`; the captured Telegram message_id is
 *      stored under `correlationId` in `placeholders`.
 *   2. Subsequent `replyFn(text, { isProgress: true, correlationId })` →
 *      `channel.editMessage(id, text)`. On edit failure (message too old,
 *      transient API error) the placeholder is purged and a fresh
 *      `sendCapturingId()` is attempted so the heartbeat keeps going.
 *   3. Final `replyFn(text, …)` (isProgress not set, or false) →
 *      `channel.send()` and the placeholder for that `correlationId` is
 *      deleted.
 *
 * Single-owner invariant (CTO precondition): the placeholder map is owned by
 * THIS adapter; the bus payload still contains only generic `isProgress: true`.
 * Other channels can ignore the flag and fall through to their default send,
 * so no Telegram-specific message id ever leaks onto the bus.
 */
export function buildProgressAwareReplyFn(
  channel: ProgressAwareTelegramChannel,
  placeholders: Map<string, number>,
): ChannelSendFn {
  return async (text, opts) => {
    const truncated = truncateForTelegram(text);
    const cid = opts?.correlationId;

    // Progress path — try to edit the placeholder in place.
    if (opts?.isProgress && cid) {
      const existingId = placeholders.get(cid);
      if (existingId !== undefined) {
        const editOpts: { format?: string } = {};
        if (opts.format) editOpts.format = opts.format;
        const ok = await channel.editMessage(existingId, truncated, editOpts);
        if (ok) return true;
        // Edit failed (message too old, network blip) — fall through and
        // post a fresh placeholder so the heartbeat keeps going.
        placeholders.delete(cid);
      }
      const captureOpts: { format?: string } = {};
      if (opts.format) captureOpts.format = opts.format;
      const newId = await channel.sendCapturingId(truncated, captureOpts);
      if (newId !== null) {
        placeholders.set(cid, newId);
        return true;
      }
      // sendCapturingId failed — fall through to generic send so the user
      // still sees something. The next isProgress call will retry capture.
    }

    // Non-progress (final response / error / approval) — clear the
    // placeholder so a future correlationId of the same id starts clean.
    if (cid && !opts?.isProgress) placeholders.delete(cid);

    const sendOpts: Parameters<typeof channel.send>[1] = {};
    if (opts?.format) sendOpts.format = opts.format;
    if (opts?.correlationId) sendOpts.correlationId = opts.correlationId;
    if (opts?.isTrainableTurn !== undefined) sendOpts.isTrainableTurn = opts.isTrainableTurn;
    if (opts?.provider) sendOpts.provider = opts.provider;
    if (opts?.request) sendOpts.request = opts.request;
    // Sprint 114 (CTO C1): thread tokenUsage for RL pipeline
    if (opts?.tokenUsage) sendOpts.tokenUsage = opts.tokenUsage;
    return channel.send(truncated, sendOpts);
  };
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

  // Sprint 137 A8: progress-aware replyFn — see buildProgressAwareReplyFn
  // docstring for the lifecycle contract. The placeholder map is owned here
  // (single owner = THIS adapter; never escapes onto bus payload).
  const progressPlaceholders = new Map<string, number>();

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
        // Sprint 137 A8: handle isProgress edit-in-place via buildProgressAwareReplyFn.
        const replyFn = buildProgressAwareReplyFn(channel, progressPlaceholders);

        const busMsg: BusInboundMessage = {
          correlationId,
          channel: "telegram",
          senderId: msg.senderId,
          content: rawText,
          enqueuedAt: Date.now(),
          replyFn,
        };
        // Sprint 115 (T3): notifyFn = replyFn — CEO gets approval prompts via same channel
        busMsg.notifyFn = replyFn;

        // exactOptionalPropertyTypes — build metadata separately, assign only if populated
        const metadata: Record<string, unknown> = {
          chatId: msg.metadata?.chatId ?? msg.senderId,
          messageId: msg.messageId,
        };
        if (msg.metadata?.username) metadata.username = msg.metadata.username;
        // Sprint 107: set dedupKey for BusDedup in consumer (Telegram messageId is stable across retries)
        if (msg.messageId) metadata.dedupKey = `telegram-${msg.messageId}`;
        busMsg.metadata = metadata;

        // Sprint 147 T1: Removed eager "đang xử lý" progress message.
        // Previously sent here BEFORE session lock → caused duplicate progress messages.
        // Now sent from callAI() AFTER lock acquired (channel-router.ts).

        // Sprint 107: debounce path — last-message-wins within windowMs
        if (debounce) {
          debounce.debounce(busMsg, (m) => bus.publishInbound(m));
        } else {
          bus.publishInbound(busMsg);
        }
        return; // Non-blocking — BusConsumer calls replyFn() when done
      }

      // Sync fallback (bus=undefined — existing behavior, all current tests pass)

      // Sprint 147 T1: Removed eager "đang xử lý" from sync path too (same fix as bus path).
      // Progress sent from callAI() after lock acquired.
      const agentMatch = rawText.match(/^@([\w.]+)/);
      if (agentMatch) {
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
      const errMsg = (error as Error).message;
      console.error("[TelegramOTT] Message handling error:", errMsg);
      // Sprint 136 B4 (2026-04-18): surface the router's error message to CEO
      // instead of a blanket "Internal error" — router now throws specific,
      // actionable messages (Claude Code timed out / auth failed / rate-limited)
      // per Sprint 136 A11. Clamp at 800 chars to avoid leaking stack traces
      // and prefer the router message if it contains a recognizable user-facing
      // prefix (emoji, "Claude Code", etc.). Otherwise fall back to generic.
      const userFacingPrefixes = [
        "⚠️", "🔑", "Claude Code", "Claude Code request",
      ];
      const looksUserFacing =
        typeof errMsg === "string" &&
        errMsg.length > 0 &&
        errMsg.length <= 800 &&
        userFacingPrefixes.some((p) => errMsg.includes(p));
      const replyText = looksUserFacing
        ? errMsg
        : "Internal error. Please try again.";
      try {
        await channel.send(replyText);
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
