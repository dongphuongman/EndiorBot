/**
 * BusConsumer + BusDedup Integration Tests — Sprint 107
 *
 * Tests that the optional dedup guard correctly prevents double-processing
 * from Telegram webhook retries, while keeping backward compat.
 *
 * @module tests/bus/consumer-dedup
 * @sprint 107
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusConsumer } from "../../src/bus/consumer.js";
import { BusDedup } from "../../src/bus/dedup.js";
import { EventEmitterBus } from "../../src/bus/message-bus.js";
import type { BusInboundMessage } from "../../src/bus/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeMsg(override?: Partial<BusInboundMessage>): BusInboundMessage {
  return {
    correlationId: "test-cid",
    channel: "telegram",
    senderId: "ceo-1",
    content: "@pm plan sprint",
    enqueuedAt: Date.now(),
    replyFn: vi.fn().mockResolvedValue(true),
    metadata: { dedupKey: "telegram-111" },
    ...override,
  };
}

function makeIngress(responseText = "Processed") {
  return {
    handleInbound: vi.fn().mockResolvedValue({
      text: responseText,
      format: "markdown" as const,
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("BusConsumer + BusDedup integration", () => {
  let bus: EventEmitterBus;

  beforeEach(() => {
    bus = new EventEmitterBus();
  });

  it("T16: consumer WITH dedup — duplicate dedupKey → handleInbound NOT called", async () => {
    const dedup = new BusDedup();
    const ingress = makeIngress();
    const consumer = new BusConsumer(bus, ingress as never, dedup);
    consumer.start();

    const msg1 = makeMsg({ correlationId: "cid-1" });
    const msg2 = makeMsg({ correlationId: "cid-2", metadata: { dedupKey: "telegram-111" } });

    // First message: processed normally
    bus.publishInbound(msg1);
    await new Promise((r) => setTimeout(r, 20));
    expect(ingress.handleInbound).toHaveBeenCalledOnce();

    // Second message with SAME dedupKey: silently skipped
    bus.publishInbound(msg2);
    await new Promise((r) => setTimeout(r, 20));
    expect(ingress.handleInbound).toHaveBeenCalledOnce(); // still only 1 call
    expect(msg2.replyFn).not.toHaveBeenCalled(); // no response to duplicate
  });

  it("T17: consumer WITH dedup — first message processed, outbound published", async () => {
    const dedup = new BusDedup();
    const ingress = makeIngress("Result text");
    const consumer = new BusConsumer(bus, ingress as never, dedup);
    consumer.start();

    const outboundMsgs: unknown[] = [];
    bus.onOutbound((m) => outboundMsgs.push(m));

    const msg = makeMsg();
    bus.publishInbound(msg);
    await new Promise((r) => setTimeout(r, 30));

    expect(ingress.handleInbound).toHaveBeenCalledOnce();
    // Sprint 110 (Step 0.5): consumer now passes correlationId + isTrainableTurn in sendOpts
    expect(msg.replyFn).toHaveBeenCalledWith("Result text", {
      format: "markdown",
      correlationId: "test-cid",
      isTrainableTurn: false,
    });
    expect(outboundMsgs).toHaveLength(1);
  });

  it("T18: consumer WITHOUT dedup (dedup=undefined) — same dedupKey processed twice", async () => {
    // Backward compat: no dedup means all messages go through
    const ingress = makeIngress();
    const consumer = new BusConsumer(bus, ingress as never); // no dedup
    consumer.start();

    const msg1 = makeMsg({ correlationId: "cid-1" });
    const msg2 = makeMsg({ correlationId: "cid-2", metadata: { dedupKey: "telegram-111" } });

    bus.publishInbound(msg1);
    bus.publishInbound(msg2);
    await new Promise((r) => setTimeout(r, 30));

    // Both processed — no dedup guard
    expect(ingress.handleInbound).toHaveBeenCalledTimes(2);
  });

  it("T19: consumer WITH dedup — metadata.dedupKey absent → processed (no dedup check)", async () => {
    const dedup = new BusDedup();
    const ingress = makeIngress();
    const consumer = new BusConsumer(bus, ingress as never, dedup);
    consumer.start();

    // Message with no dedupKey in metadata
    const msg = makeMsg({ metadata: { chatId: "chat-1" } }); // no dedupKey
    bus.publishInbound(msg);
    await new Promise((r) => setTimeout(r, 20));

    expect(ingress.handleInbound).toHaveBeenCalledOnce(); // processed normally
  });

  it("T20: after duplicate skip, bus does NOT publish outbound (silent skip)", async () => {
    const dedup = new BusDedup();
    const ingress = makeIngress();
    const consumer = new BusConsumer(bus, ingress as never, dedup);
    consumer.start();

    const outboundMsgs: unknown[] = [];
    bus.onOutbound((m) => outboundMsgs.push(m));

    // First: mark as seen
    const msg1 = makeMsg({ correlationId: "cid-1" });
    bus.publishInbound(msg1);
    await new Promise((r) => setTimeout(r, 20));
    expect(outboundMsgs).toHaveLength(1);

    // Second: same dedupKey — silent skip
    const msg2 = makeMsg({ correlationId: "cid-2" });
    bus.publishInbound(msg2);
    await new Promise((r) => setTimeout(r, 20));
    expect(outboundMsgs).toHaveLength(1); // no additional outbound
  });
});
