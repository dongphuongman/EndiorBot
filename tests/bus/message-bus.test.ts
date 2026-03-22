/**
 * Sprint 106: Message Bus Tests
 *
 * Tests ADR-032 EventEmitterBus implementation:
 * - Pub/sub: publishInbound/onInbound, publishOutbound/onOutbound
 * - Subscriber management: multiple subs, offInbound/offOutbound
 * - Stats: totalInbound, totalOutbound, inFlight
 * - isProgress: does NOT decrement inFlight
 * - reset(): clears all state
 * - createCorrelationId(): format + uniqueness
 * - getMessageBus(): singleton; resetMessageBus(): fresh instance
 *
 * @module tests/bus/message-bus
 * @sprint 106
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EventEmitterBus,
  getMessageBus,
  resetMessageBus,
  createCorrelationId,
} from "../../src/bus/message-bus.js";
import type { BusInboundMessage, BusOutboundMessage } from "../../src/bus/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeInbound(
  channel = "telegram",
  senderId = "user-1",
  correlationId?: string,
): BusInboundMessage {
  const replyFn = vi.fn().mockResolvedValue(true);
  return {
    correlationId: correlationId ?? createCorrelationId(channel, senderId),
    channel,
    senderId,
    content: "test message",
    enqueuedAt: Date.now(),
    replyFn,
  };
}

function makeOutbound(correlationId = "corr-1"): BusOutboundMessage {
  return { correlationId, text: "test response" };
}

// ============================================================================
// T1-T4: Pub/sub
// ============================================================================

describe("EventEmitterBus — pub/sub", () => {
  let bus: EventEmitterBus;

  beforeEach(() => {
    bus = new EventEmitterBus();
  });

  it("T1: publishInbound() calls registered onInbound handler with correct msg", () => {
    const handler = vi.fn();
    bus.onInbound(handler);

    const msg = makeInbound();
    bus.publishInbound(msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("T2: publishOutbound() calls registered onOutbound handler with correct msg", () => {
    const handler = vi.fn();
    bus.onOutbound(handler);

    const msg = makeOutbound();
    bus.publishOutbound(msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("T3: multiple onInbound subscribers all receive the same message", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const h3 = vi.fn();
    bus.onInbound(h1);
    bus.onInbound(h2);
    bus.onInbound(h3);

    const msg = makeInbound();
    bus.publishInbound(msg);

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(h3).toHaveBeenCalledOnce();
    // All received the same message
    expect(h1.mock.calls[0]?.[0]).toBe(msg);
    expect(h2.mock.calls[0]?.[0]).toBe(msg);
  });

  it("T4: offInbound() removes only the specified handler; others still receive", () => {
    const keep = vi.fn();
    const remove = vi.fn();
    bus.onInbound(keep);
    bus.onInbound(remove);

    bus.offInbound(remove);
    bus.publishInbound(makeInbound());

    expect(keep).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });
});

// ============================================================================
// T5-T7: Stats + inFlight
// ============================================================================

describe("EventEmitterBus — stats", () => {
  let bus: EventEmitterBus;

  beforeEach(() => {
    bus = new EventEmitterBus();
  });

  it("T5: getStats() tracks totalInbound and totalOutbound correctly", () => {
    bus.publishInbound(makeInbound("t", "u1", "c1"));
    bus.publishInbound(makeInbound("t", "u2", "c2"));
    bus.publishOutbound(makeOutbound("c1")); // final response
    bus.publishOutbound(makeOutbound("c2")); // final response

    const stats = bus.getStats();
    expect(stats.totalInbound).toBe(2);
    expect(stats.totalOutbound).toBe(2);
  });

  it("T6: inFlight increases on publishInbound, decreases on final publishOutbound", () => {
    expect(bus.getStats().inFlight).toBe(0);

    bus.publishInbound(makeInbound("t", "u1", "c1"));
    expect(bus.getStats().inFlight).toBe(1);

    bus.publishInbound(makeInbound("t", "u2", "c2"));
    expect(bus.getStats().inFlight).toBe(2);

    bus.publishOutbound(makeOutbound("c1"));
    expect(bus.getStats().inFlight).toBe(1);

    bus.publishOutbound(makeOutbound("c2"));
    expect(bus.getStats().inFlight).toBe(0);
  });

  it("T7: isProgress=true publishOutbound does NOT decrement inFlight or increment totalOutbound", () => {
    bus.publishInbound(makeInbound("t", "u1", "corr-progress"));
    expect(bus.getStats().inFlight).toBe(1);

    // Progress update — not the final response
    bus.publishOutbound({ correlationId: "corr-progress", text: "thinking...", isProgress: true });
    expect(bus.getStats().inFlight).toBe(1);    // still in flight
    expect(bus.getStats().totalOutbound).toBe(0); // not counted yet

    // Final response
    bus.publishOutbound({ correlationId: "corr-progress", text: "done!" });
    expect(bus.getStats().inFlight).toBe(0);    // resolved
    expect(bus.getStats().totalOutbound).toBe(1);
  });
});

// ============================================================================
// T8: reset()
// ============================================================================

describe("EventEmitterBus — reset", () => {
  it("T8: reset() clears all listeners and resets stats to zero", () => {
    const bus = new EventEmitterBus();
    const handler = vi.fn();
    bus.onInbound(handler);

    bus.publishInbound(makeInbound("t", "u", "c1"));
    expect(bus.getStats().totalInbound).toBe(1);

    bus.reset();

    // Stats cleared
    expect(bus.getStats().totalInbound).toBe(0);
    expect(bus.getStats().inFlight).toBe(0);

    // Handler no longer registered
    bus.publishInbound(makeInbound("t", "u", "c2"));
    expect(handler).toHaveBeenCalledOnce(); // only before reset
  });
});

// ============================================================================
// T9-T10: createCorrelationId + singleton
// ============================================================================

describe("createCorrelationId", () => {
  it("T9: returns 'channel-senderId-{timestamp}' format", () => {
    const id = createCorrelationId("telegram", "user-123");
    expect(id).toMatch(/^telegram-user-123-\d+$/);
  });

  it("T10a: different channels produce different IDs", () => {
    const a = createCorrelationId("telegram", "user-1");
    const b = createCorrelationId("web", "user-1");
    expect(a).not.toBe(b);
  });
});

describe("getMessageBus / resetMessageBus", () => {
  beforeEach(() => {
    resetMessageBus();
  });

  it("T10b: getMessageBus() returns the same instance on repeated calls", () => {
    const a = getMessageBus();
    const b = getMessageBus();
    expect(a).toBe(b);
  });

  it("T10c: resetMessageBus() creates a fresh instance on next call", () => {
    const a = getMessageBus();
    resetMessageBus();
    const b = getMessageBus();
    expect(a).not.toBe(b);
  });
});
