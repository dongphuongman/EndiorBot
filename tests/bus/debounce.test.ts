/**
 * BusDebounce Tests — Sprint 107
 *
 * Tests last-message-wins debounce per sender.
 * Uses fake timers to control setTimeout deterministically.
 *
 * @module tests/bus/debounce
 * @sprint 107
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BusDebounce } from "../../src/bus/debounce.js";
import type { BusInboundMessage } from "../../src/bus/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeMsg(override?: Partial<BusInboundMessage>): BusInboundMessage {
  return {
    correlationId: "test-cid",
    channel: "telegram",
    senderId: "ceo-1",
    content: "hello",
    enqueuedAt: Date.now(),
    replyFn: vi.fn().mockResolvedValue(true),
    ...override,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("BusDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T1: single message published after window expires", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();
    const msg = makeMsg();

    debounce.debounce(msg, publish);
    expect(publish).not.toHaveBeenCalled(); // not yet

    vi.advanceTimersByTime(500);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(msg);
  });

  it("T2: two rapid messages from same sender — only LAST published", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    const msg1 = makeMsg({ content: "first", correlationId: "cid-1" });
    const msg2 = makeMsg({ content: "second", correlationId: "cid-2" });

    debounce.debounce(msg1, publish);
    vi.advanceTimersByTime(200); // 200ms — msg1 timer still pending
    debounce.debounce(msg2, publish);
    vi.advanceTimersByTime(500); // msg2 window expires

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(msg2); // only last message
  });

  it("T3: three rapid messages — only LAST of three published", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    const msg1 = makeMsg({ correlationId: "cid-1", content: "a" });
    const msg2 = makeMsg({ correlationId: "cid-2", content: "b" });
    const msg3 = makeMsg({ correlationId: "cid-3", content: "c" });

    debounce.debounce(msg1, publish);
    vi.advanceTimersByTime(100);
    debounce.debounce(msg2, publish);
    vi.advanceTimersByTime(100);
    debounce.debounce(msg3, publish);
    vi.advanceTimersByTime(500);

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(msg3);
  });

  it("T4: messages from different senders are independent — both published", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    const msgA = makeMsg({ senderId: "ceo-1", content: "from ceo" });
    const msgB = makeMsg({ senderId: "cto-1", content: "from cto" });

    debounce.debounce(msgA, publish);
    debounce.debounce(msgB, publish);
    vi.advanceTimersByTime(500);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(msgA);
    expect(publish).toHaveBeenCalledWith(msgB);
  });

  it("T5: cancel(key) removes pending timer — message NOT published", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();
    const msg = makeMsg();

    debounce.debounce(msg, publish);
    debounce.cancel("telegram-ceo-1"); // matches key format "${channel}-${senderId}"
    vi.advanceTimersByTime(600);

    expect(publish).not.toHaveBeenCalled();
  });

  it("T6: cancel() without key flushes ALL pending timers", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    debounce.debounce(makeMsg({ senderId: "ceo-1" }), publish);
    debounce.debounce(makeMsg({ senderId: "cto-1" }), publish);
    expect(debounce.pendingCount).toBe(2);

    debounce.cancel(); // flush all
    vi.advanceTimersByTime(600);

    expect(publish).not.toHaveBeenCalled();
    expect(debounce.pendingCount).toBe(0);
  });

  it("T7: pendingCount reflects active timer count", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    expect(debounce.pendingCount).toBe(0);

    debounce.debounce(makeMsg({ senderId: "ceo-1" }), publish);
    debounce.debounce(makeMsg({ senderId: "cto-1" }), publish);
    expect(debounce.pendingCount).toBe(2);

    vi.advanceTimersByTime(500);
    expect(debounce.pendingCount).toBe(0);
  });

  it("T8: after window, new message from same sender starts fresh timer", () => {
    const debounce = new BusDebounce(500);
    const publish = vi.fn();

    const msg1 = makeMsg({ correlationId: "cid-1", content: "first wave" });
    debounce.debounce(msg1, publish);
    vi.advanceTimersByTime(500); // msg1 published
    expect(publish).toHaveBeenCalledOnce();

    const msg2 = makeMsg({ correlationId: "cid-2", content: "second wave" });
    debounce.debounce(msg2, publish);
    vi.advanceTimersByTime(500); // msg2 published
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(msg2);
  });
});
