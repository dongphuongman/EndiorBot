/**
 * Bus Debounce — Last-message-wins per sender within a time window.
 *
 * Sprint 107 (ADR-032 Phase 2):
 * Prevents rapid-fire duplicate messages from the same sender being processed
 * multiple times. If a new message arrives before the window expires, the
 * previous pending message is cancelled and replaced with the new one.
 *
 * MTClaw equivalent: internal/bus/inbound_debounce.go
 *
 * Key format: "${channel}-${senderId}" — per-sender, channel-scoped.
 * This means CEO on Telegram and CEO on Web are debounced independently.
 *
 * @module bus/debounce
 * @version 1.0.0
 * @authority ADR-032
 * @sprint 107
 */

import type { BusInboundMessage } from "./types.js";

// ============================================================================
// BusDebounce
// ============================================================================

/**
 * Debounces inbound bus messages per sender.
 *
 * Usage (in OTT adapter):
 *   debounce.debounce(busMsg, (msg) => bus.publishInbound(msg));
 *
 * Effect: if CEO sends 3 messages within 500ms, only the LAST is published.
 * Earlier pending messages are silently cancelled.
 */
export class BusDebounce {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * @param windowMs Debounce window in milliseconds (default: 500ms)
   */
  constructor(readonly windowMs = 500) {}

  /**
   * Schedule a publish after the debounce window.
   * If another message from the same sender arrives before the window expires,
   * the earlier timer is cancelled (last-message-wins).
   *
   * @param msg The inbound bus message to debounce
   * @param publish Callback to call when window expires (typically bus.publishInbound)
   */
  debounce(msg: BusInboundMessage, publish: (msg: BusInboundMessage) => void): void {
    const key = `${msg.channel}-${msg.senderId}`;

    // Cancel any pending timer for this sender
    const existing = this.timers.get(key);
    if (existing !== undefined) clearTimeout(existing);

    // Schedule new publish after window
    const timer = setTimeout(() => {
      this.timers.delete(key);
      publish(msg);
    }, this.windowMs);
    this.timers.set(key, timer);
  }

  /**
   * Cancel pending timer(s) without publishing.
   *
   * @param key If provided, cancel only that sender key (format: "channel-senderId").
   *            If omitted, cancel ALL pending timers (use on shutdown/flush).
   */
  cancel(key?: string): void {
    if (key !== undefined) {
      const timer = this.timers.get(key);
      if (timer !== undefined) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    } else {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    }
  }

  /** Number of pending (not yet published) timers */
  get pendingCount(): number {
    return this.timers.size;
  }
}
