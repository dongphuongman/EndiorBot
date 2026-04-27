/**
 * Bus Consumer — Processes inbound bus messages via GatewayIngress.
 *
 * Sprint 106 (ADR-032):
 *   bus.onInbound() → _process() → ingress.handleInbound() → msg.replyFn()
 *                                                            → bus.publishOutbound()
 *
 * Sprint 107 (ADR-032): Optional dedup parameter — silent skip for Telegram
 * webhook retries (same messageId). Dedup guard at top of _process(), before
 * any work begins, so no replyFn("Internal error") is sent to the retry.
 *
 * MTClaw equivalent: cmd/gateway_consumer.go consumeInboundMessages()
 *
 * Fire-and-forget: onMessage handler is non-blocking.
 * The channel adapter returns immediately; this consumer runs in background.
 *
 * CTO C1 (BLOCKER, RESOLVED): replyFn() inside catch is guarded with inner
 * try-catch to prevent unhandledRejection from crashing Node.js ≥ v15.
 *
 * @module bus/consumer
 * @version 1.1.0
 * @authority ADR-032
 * @sprint 107
 */

import type { IMessageBus, BusInboundMessage, BusOutboundMessage } from "./types.js";
import type { GatewayIngress, InboundMessage } from "../gateway/ingress.js";
import type { BusDedup } from "./dedup.js";
import { applyActiveMemoryHook } from "../agents/intelligence/active-memory.js";
import type { SessionLike, ActiveMemoryConfig } from "../agents/intelligence/active-memory.js";

// ============================================================================
// BusConsumer
// ============================================================================

/**
 * Processes inbound bus messages asynchronously.
 *
 * Usage:
 *   const consumer = new BusConsumer(bus, ingress);
 *   consumer.start();   // begins consuming
 *   consumer.stop();    // stops consuming (for clean shutdown)
 *
 * Sprint 107: Optional dedup parameter. If provided, messages with a
 * previously-seen metadata.dedupKey are silently skipped (no double-processing
 * from Telegram webhook retries).
 *
 * NOTE: _handler is bound in constructor (not anonymous function).
 * This enables clean offInbound() removal via bus.offInbound(this._handler).
 */
/** Sprint 147 T2: Content dedup window — same sender+agent+text within 5 minutes → skip */
const CONTENT_DEDUP_WINDOW_MS = 5 * 60_000;

export class BusConsumer {
  private _started: boolean;
  private readonly _handler: (msg: BusInboundMessage) => void;
  /** Sprint 147 T2: Content dedup map — key: senderId:agent:normalizedText, value: timestamp */
  private readonly contentDedupMap = new Map<string, number>();

  /**
   * @param bus               Message bus
   * @param ingress           Gateway ingress for message dispatch
   * @param dedup             Optional dedup guard (Sprint 107)
   * @param sessionResolver   Optional: resolves a SessionLike from a BusInboundMessage
   *                          for Active Memory pre-dispatch hook (Sprint 133 S1).
   *                          If not provided, Active Memory hook is a no-op even when enabled.
   * @param activeMemoryConfig Optional Active Memory config overrides
   */
  constructor(
    private readonly bus: IMessageBus,
    private readonly ingress: GatewayIngress,
    private readonly dedup?: BusDedup,
    private readonly sessionResolver?: (msg: BusInboundMessage) => SessionLike | undefined,
    private readonly activeMemoryConfig?: Partial<ActiveMemoryConfig>,
  ) {
    this._started = false;
    // Bind in constructor so offInbound() can remove the exact same reference
    this._handler = (msg: BusInboundMessage): void => {
      void this._process(msg);
    };
  }

  /** Whether this consumer is currently active */
  get started(): boolean {
    return this._started;
  }

  /**
   * Start consuming inbound bus messages.
   * Idempotent — safe to call multiple times.
   */
  start(): void {
    if (this._started) return;
    this.bus.onInbound(this._handler);
    this._started = true;
  }

  /**
   * Stop consuming messages.
   * Idempotent — safe to call multiple times.
   * In-flight messages already being processed will complete normally.
   */
  stop(): void {
    if (!this._started) return;
    this.bus.offInbound(this._handler);
    this._started = false;
  }

  // ============================================================================
  // Private: message processing
  // ============================================================================

  /**
   * Process one inbound bus message.
   *
   * Flow (MTClaw gateway_consumer.go alignment):
   * 1. Translate BusInboundMessage → InboundMessage (gateway type)
   * 2. Call ingress.handleInbound() — may take 30–120s for AI
   * 3. Deliver response via msg.replyFn() (channel-specific send)
   * 4. Publish outbound message to bus (for WebSocket clients)
   *
   * CTO C1: replyFn() in catch block is guarded with inner try-catch.
   * If replyFn throws (Telegram down, bot blocked, etc.),
   * the inner catch silently absorbs it.
   * Without this guard: unhandledRejection → process crash in Node.js ≥ v15.
   */
  private async _process(msg: BusInboundMessage): Promise<void> {
    // Sprint 107: Dedup guard — skip if this messageId was already seen
    // (Telegram webhook retries send the same messageId; silent skip prevents double-response)
    if (this.dedup) {
      const dedupKey = msg.metadata?.dedupKey as string | undefined;
      if (dedupKey !== undefined) {
        if (this.dedup.isDuplicate(dedupKey)) return; // silent skip
        this.dedup.markSeen(dedupKey);
      }
    }

    // Sprint 147 T2: Content dedup — same sender + same agent + similar text within 5min → skip
    // Prevents CEO sending @pm 3 times → 3 identical agent calls.
    // Transport dedup (above) only catches webhook retries (same messageId).
    // CPO fix: key is cleared on failure so retries work after upstream errors.
    let contentDedupKey: string | undefined;
    const agentMentionMatch = msg.content.match(/^@([\w.]+)/);
    if (agentMentionMatch) {
      contentDedupKey = `${msg.senderId}:${agentMentionMatch[1]}:${msg.content.toLowerCase().trim().replace(/\s+/g, " ")}`;
      const now = Date.now();
      const prev = this.contentDedupMap.get(contentDedupKey);
      if (prev && now - prev < CONTENT_DEDUP_WINDOW_MS) {
        // Duplicate intent — skip with notice
        void msg.replyFn(
          `⏳ Request tương tự đang xử lý hoặc vừa hoàn thành. Chờ kết quả hoặc gửi lại sau 5 phút.`,
          { correlationId: msg.correlationId, isTrainableTurn: false },
        ).catch(() => {});
        return;
      }
      this.contentDedupMap.set(contentDedupKey, now);
      // Evict expired entries (prevent memory leak)
      if (this.contentDedupMap.size > 100) {
        for (const [k, ts] of this.contentDedupMap) {
          if (now - ts > CONTENT_DEDUP_WINDOW_MS) this.contentDedupMap.delete(k);
        }
      }
    }

    // Sprint 133 S1: Active Memory pre-dispatch hook
    // Fetches recent context (cache-first, circuit-breaker-wrapped) and
    // injects ActiveMemoryPayload into msg.metadata.activeMemoryContext
    // BEFORE ingress.handleInbound(). No-op when feature flag is disabled.
    if (this.sessionResolver) {
      const session = this.sessionResolver(msg);
      if (session) {
        await applyActiveMemoryHook(msg, session, this.activeMemoryConfig);
      }
    }

    // Build InboundMessage — outside try-catch since this is synchronous
    // and cannot throw in practice (pure object construction)
    const inbound: InboundMessage = {
      channel: msg.channel,
      senderId: msg.senderId,
      content: msg.content,
    };
    // exactOptionalPropertyTypes — only assign metadata when present
    if (msg.metadata !== undefined) {
      inbound.metadata = msg.metadata;
    }
    // Sprint 115 (T3): Thread notifyFn into metadata for channel-router approval notifications
    if (msg.notifyFn !== undefined) {
      if (inbound.metadata === undefined) {
        inbound.metadata = {};
      }
      inbound.metadata.notifyFn = msg.notifyFn;
    }
    // Sprint 136 A7 (2026-04-18): thread progressFn into metadata so the router
    // can announce fallback transitions ("⚡ Claude Code rate-limited —
    // switching to Gemini..."). Sprint 137 P0-01 (2026-04-19): closure delivers
    // exclusively via replyFn (single owner = originating channel). Previously
    // also published an `isProgress: true` outbound bus event, but no surface
    // currently consumes those for OTT-originated messages, and any future
    // surface that did would observe duplicate progress text alongside what the
    // channel adapter already rendered. Keep delivery surface = 1.
    if (inbound.metadata === undefined) {
      inbound.metadata = {};
    }
    inbound.metadata.progressFn = (text: string): void => {
      // Sprint 137 A8: isProgress flag lets the channel adapter edit a
      // placeholder message in place (Telegram) vs sending a new one.
      void msg
        .replyFn(text, {
          correlationId: msg.correlationId,
          isTrainableTurn: false,
          isProgress: true,
        })
        .catch(() => {});
    };

    // Sprint 136 A6 (2026-04-18): periodic progress ticker so CEO is never
    // left staring at a blank placeholder for minutes. Fires at 20s and then
    // every 30s afterwards while handleInbound is in flight. Sprint 137 P0-01
    // (2026-04-19): ticker now delivers exclusively via msg.replyFn() — the
    // originating channel adapter (Telegram/Zalo) is the single owner of the
    // user-visible heartbeat. The `isProgress: true` outbound bus publish was
    // dead-code for current surfaces (only WebSocket subscribed, but Web UI
    // doesn't render OTT-originated ticks) and risked double delivery the
    // moment a future surface mirrored OTT chat content. A8 (editMessageText
    // instead of new message) remains follow-up work; the simple append
    // pattern is acceptable given CEO's "better spam than silence" preference.
    const startedAt = Date.now();
    let tickCount = 0;
    const tickIntervalMs = 30_000;
    const firstTickDelayMs = 20_000;
    const firstTickTimer = setTimeout(() => {
      tickCount = 1;
      emitTick();
      progressTicker = setInterval(() => {
        tickCount += 1;
        emitTick();
      }, tickIntervalMs);
    }, firstTickDelayMs);
    let progressTicker: ReturnType<typeof setInterval> | null = null;

    const emitTick = (): void => {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const text = `⏳ still working… (${elapsedSec}s elapsed, tick ${tickCount})`;
      // Best-effort replyFn — swallow errors so a dead channel doesn't break processing.
      // Sprint 137 A8: isProgress flag lets the channel adapter edit a
      // placeholder message in place (Telegram) vs appending each tick.
      void msg
        .replyFn(text, {
          correlationId: msg.correlationId,
          isTrainableTurn: false,
          isProgress: true,
        })
        .catch(() => {});
    };

    const cancelTicker = (): void => {
      clearTimeout(firstTickTimer);
      if (progressTicker) clearInterval(progressTicker);
      progressTicker = null;
    };

    try {
      const response = await this.ingress.handleInbound(inbound);
      cancelTicker();

      // Direct channel delivery via replyFn (MTClaw: consumer → channel.Send())
      // Sprint 110 (Step 0.5): Pass correlationId + RL hints for feedback keyboard linking.
      // See ADR-033 D4 and sprint-110-rl-feedback-capture.md Step 0.5.
      const sendOpts: Parameters<typeof msg.replyFn>[1] = {
        correlationId: msg.correlationId,
      };
      if (response.format) sendOpts.format = response.format;
      // isTrainableTurn: agent response (not a system/error message)
      if (response.metadata?.agent !== undefined) {
        sendOpts.isTrainableTurn = true;
        sendOpts.provider = (response.metadata.model as string | undefined) ?? "unknown";
        // Sprint 111a: thread inbound content as conversation context for RL training records
        sendOpts.request = [{ role: "user", content: msg.content }];
        // Sprint 114 (CTO C1): thread tokenUsage for RL pipeline
        const tu = response.metadata.tokenUsage as { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
        if (tu) sendOpts.tokenUsage = tu;
      } else {
        sendOpts.isTrainableTurn = false;
      }
      await msg.replyFn(response.text, sendOpts);

      // Also publish to outbound bus for WebSocket clients (Web UI, desktop)
      const outbound: BusOutboundMessage = {
        correlationId: msg.correlationId,
        text: response.text,
      };
      // exactOptionalPropertyTypes — conditionally add optional fields
      if (response.format) outbound.format = response.format;
      if (response.metadata) outbound.processingMeta = response.metadata;
      this.bus.publishOutbound(outbound);

    } catch (err) {
      // Sprint 136 A6: stop progress ticker before reporting error.
      cancelTicker();
      // Sprint 147 CPO fix: clear content dedup key on failure so CEO can retry
      // the same request after an upstream error (CC timeout, provider down, etc.)
      if (contentDedupKey) this.contentDedupMap.delete(contentDedupKey);
      // CTO C1 (BLOCKER, RESOLVED): Guard replyFn() — Telegram may be down,
      // bot may be blocked, or channel adapter may have disconnected.
      // Inner try-catch prevents unhandledRejection from crashing Node.js ≥ v15.
      //
      // Sprint 136 B4 (2026-04-18): surface the router's specific error text
      // to users instead of a blanket "Internal error". Sprint 136 A11 + B3
      // made ChannelRouter.callAI() throw actionable messages (Claude Code
      // timed out / auth failed / rate-limited). Previously, THIS catch
      // swallowed those messages on the async bus path — the only path used
      // by Telegram/Zalo/WebUI in production. Now we recognize user-facing
      // prefixes and relay them through, clamped to keep stack traces /
      // secrets from leaking into chat.
      const errMsg = err instanceof Error ? err.message : String(err);
      const userFacingPrefixes = [
        "⚠️",
        "🔑",
        "⚡",
        "⏳",
        "Claude Code",
        "Claude Code request",
      ];
      const looksUserFacing =
        typeof errMsg === "string" &&
        errMsg.length > 0 &&
        errMsg.length <= 800 &&
        userFacingPrefixes.some((p) => errMsg.includes(p));
      const replyText = looksUserFacing ? errMsg : "Internal error. Please try again.";

      try {
        // Sprint 110: Pass correlationId in error path too (isTrainableTurn=false)
        await msg.replyFn(replyText, {
          correlationId: msg.correlationId,
          isTrainableTurn: false,
        });
      } catch {
        // replyFn threw — channel delivery failed silently
        // (network down, bot blocked, etc.)
      }

      this.bus.publishOutbound({
        correlationId: msg.correlationId,
        text: looksUserFacing ? errMsg : "Internal error.",
        isError: true,
      });
    }
  }
}
