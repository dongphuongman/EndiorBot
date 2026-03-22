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
export class BusConsumer {
  private _started: boolean;
  private readonly _handler: (msg: BusInboundMessage) => void;

  constructor(
    private readonly bus: IMessageBus,
    private readonly ingress: GatewayIngress,
    private readonly dedup?: BusDedup,
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

    try {
      const response = await this.ingress.handleInbound(inbound);

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
      // CTO C1 (BLOCKER, RESOLVED): Guard replyFn() — Telegram may be down,
      // bot may be blocked, or channel adapter may have disconnected.
      // Inner try-catch prevents unhandledRejection from crashing Node.js ≥ v15.
      try {
        // Sprint 110: Pass correlationId in error path too (isTrainableTurn=false)
        await msg.replyFn("Internal error. Please try again.", {
          correlationId: msg.correlationId,
          isTrainableTurn: false,
        });
      } catch {
        // replyFn threw — channel delivery failed silently
        // (network down, bot blocked, etc.)
      }

      this.bus.publishOutbound({
        correlationId: msg.correlationId,
        text: "Internal error.",
        isError: true,
      });
    }
  }
}
