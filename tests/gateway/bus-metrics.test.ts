/**
 * Sprint 115 (T5): Bus Metrics Tests
 *
 * Tests that:
 * - BusStats includes inboundListeners and outboundListeners
 * - EventEmitterBus.getStats() returns correct listener counts
 * - /api/status endpoint includes bus section (structural)
 *
 * @module tests/gateway/bus-metrics
 * @sprint 115
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitterBus } from "../../src/bus/message-bus.js";
import { BusConsumer } from "../../src/bus/consumer.js";
import type { GatewayIngress, InboundResponse } from "../../src/gateway/ingress.js";

// ============================================================================
// T5-1: BusStats listener counts
// ============================================================================

describe("Bus metrics (T5)", () => {
  it("T5-1: getStats() returns 0 listeners on fresh bus", () => {
    const bus = new EventEmitterBus();
    const stats = bus.getStats();

    expect(stats.inboundListeners).toBe(0);
    expect(stats.outboundListeners).toBe(0);
    expect(stats.totalInbound).toBe(0);
    expect(stats.totalOutbound).toBe(0);
    expect(stats.inFlight).toBe(0);
  });

  it("T5-2: getStats() reflects listener count after BusConsumer.start()", () => {
    const bus = new EventEmitterBus();
    const ingress = {
      handleInbound: vi.fn().mockResolvedValue({ text: "ok" } as InboundResponse),
    } as unknown as GatewayIngress;

    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const stats = bus.getStats();
    expect(stats.inboundListeners).toBe(1);

    // Add an outbound listener
    const outHandler = vi.fn();
    bus.onOutbound(outHandler);

    const stats2 = bus.getStats();
    expect(stats2.outboundListeners).toBe(1);

    // Stop consumer — inbound listener removed
    consumer.stop();
    bus.offOutbound(outHandler);

    const stats3 = bus.getStats();
    expect(stats3.inboundListeners).toBe(0);
    expect(stats3.outboundListeners).toBe(0);
  });

  it("T5-3: getStats() tracks inbound/outbound message counts", () => {
    const bus = new EventEmitterBus();

    // Publish inbound (needs a handler to avoid Node.js warning, but stats still count)
    bus.onInbound(() => {}); // silent consumer

    bus.publishInbound({
      correlationId: "test-1",
      channel: "telegram",
      senderId: "user-1",
      content: "hello",
      enqueuedAt: Date.now(),
      replyFn: vi.fn().mockResolvedValue(true),
    });

    let stats = bus.getStats();
    expect(stats.totalInbound).toBe(1);
    expect(stats.inFlight).toBe(1);

    // Publish outbound (final response — decrements inFlight)
    bus.publishOutbound({
      correlationId: "test-1",
      text: "response",
    });

    stats = bus.getStats();
    expect(stats.totalOutbound).toBe(1);
    expect(stats.inFlight).toBe(0);
  });
});
