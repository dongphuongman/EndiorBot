/**
 * Sprint 106: BusConsumer Tests
 *
 * Tests ADR-032 BusConsumer:
 * - start()/stop() wires/unwires onInbound
 * - _process() translates BusInboundMessage → ingress.handleInbound()
 * - replyFn() called with response text
 * - BusOutboundMessage published after processing
 * - Error path: replyFn("Internal error...") + isError=true published
 * - CTO C1: replyFn throwing inside catch does NOT produce unhandledRejection
 * - exactOptionalPropertyTypes: metadata conditionally assigned
 * - Fire-and-forget: start() returns before handler resolves
 *
 * @module tests/bus/consumer
 * @sprint 106
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitterBus, createCorrelationId } from "../../src/bus/message-bus.js";
import { BusConsumer } from "../../src/bus/consumer.js";
import type { BusInboundMessage } from "../../src/bus/types.js";
import type { GatewayIngress, InboundMessage, InboundResponse } from "../../src/gateway/ingress.js";

// ============================================================================
// Helpers
// ============================================================================

function makeIngress(response: InboundResponse): GatewayIngress {
  return {
    handleInbound: vi.fn().mockResolvedValue(response),
  } as unknown as GatewayIngress;
}

function makeInboundMsg(
  content = "hello",
  metadata?: Record<string, unknown>,
): BusInboundMessage {
  const replyFn = vi.fn().mockResolvedValue(true);
  const msg: BusInboundMessage = {
    correlationId: createCorrelationId("telegram", "user-1"),
    channel: "telegram",
    senderId: "user-1",
    content,
    enqueuedAt: Date.now(),
    replyFn,
  };
  if (metadata !== undefined) msg.metadata = metadata;
  return msg;
}

// Wait for all pending microtasks
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ============================================================================
// T11: start() / stop()
// ============================================================================

describe("BusConsumer — start/stop", () => {
  it("T11: start() registers on onInbound; stop() removes it (handler not called after stop)", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "response" });
    const consumer = new BusConsumer(bus, ingress);

    expect(consumer.started).toBe(false);

    consumer.start();
    expect(consumer.started).toBe(true);

    consumer.stop();
    expect(consumer.started).toBe(false);

    // Publish after stop — ingress should NOT be called
    const msg = makeInboundMsg();
    bus.publishInbound(msg);
    await flushPromises();

    expect(ingress.handleInbound).not.toHaveBeenCalled();
  });

  it("T11b: start() is idempotent — calling twice does not double-register", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "response" });
    const consumer = new BusConsumer(bus, ingress);

    consumer.start();
    consumer.start(); // second call — no-op

    const msg = makeInboundMsg();
    bus.publishInbound(msg);
    await flushPromises();

    // handleInbound called exactly once (not twice)
    expect(ingress.handleInbound).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// T12: Correct InboundMessage translation
// ============================================================================

describe("BusConsumer — InboundMessage translation", () => {
  it("T12: consumer calls ingress.handleInbound() with correct translated InboundMessage", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "result" });
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const metadata = { chatId: "chat-123", messageId: 42 };
    const msg = makeInboundMsg("@coder fix the bug", metadata);
    bus.publishInbound(msg);
    await flushPromises();

    expect(ingress.handleInbound).toHaveBeenCalledWith({
      channel: "telegram",
      senderId: "user-1",
      content: "@coder fix the bug",
      metadata: { chatId: "chat-123", messageId: 42 },
    } satisfies InboundMessage);
  });

  it("T16: metadata optional prop conditionally assigned (exactOptionalPropertyTypes)", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "result" });
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    // Message WITHOUT metadata
    const msg = makeInboundMsg("hello");
    delete msg.metadata; // ensure no metadata
    bus.publishInbound(msg);
    await flushPromises();

    const calledWith = (ingress.handleInbound as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as InboundMessage;
    // metadata should NOT be present on the InboundMessage
    expect(calledWith).not.toHaveProperty("metadata");
  });
});

// ============================================================================
// T13-T14: Happy path
// ============================================================================

describe("BusConsumer — happy path", () => {
  it("T13: consumer calls msg.replyFn() with response text and format", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "AI response", format: "markdown" });
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const msg = makeInboundMsg("@coder help");
    bus.publishInbound(msg);
    await flushPromises();

    // Sprint 110 (Step 0.5): consumer now passes correlationId + isTrainableTurn in sendOpts
    expect(msg.replyFn).toHaveBeenCalledWith("AI response", {
      format: "markdown",
      correlationId: msg.correlationId,
      isTrainableTurn: false,
    });
  });

  it("T14: consumer publishes BusOutboundMessage to bus after handleInbound resolves", async () => {
    const bus = new EventEmitterBus();
    const ingress = makeIngress({ text: "done", format: "plain" });
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const outboundHandler = vi.fn();
    bus.onOutbound(outboundHandler);

    const msg = makeInboundMsg("test");
    bus.publishInbound(msg);
    await flushPromises();

    expect(outboundHandler).toHaveBeenCalledOnce();
    const published = outboundHandler.mock.calls[0]?.[0];
    expect(published.correlationId).toBe(msg.correlationId);
    expect(published.text).toBe("done");
    expect(published.format).toBe("plain");
    expect(published.isError).toBeUndefined();
  });
});

// ============================================================================
// T15: Error path + CTO C1
// ============================================================================

describe("BusConsumer — error path (CTO C1)", () => {
  it("T15a: on handleInbound rejection, replyFn called with error text and isError=true published", async () => {
    const bus = new EventEmitterBus();
    const ingress = {
      handleInbound: vi.fn().mockRejectedValue(new Error("AI provider down")),
    } as unknown as GatewayIngress;
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const outboundHandler = vi.fn();
    bus.onOutbound(outboundHandler);

    const msg = makeInboundMsg("@coder crash");
    bus.publishInbound(msg);
    await flushPromises();

    // Sprint 110 (Step 0.5): error path also passes correlationId + isTrainableTurn
    expect(msg.replyFn).toHaveBeenCalledWith("Internal error. Please try again.", {
      correlationId: msg.correlationId,
      isTrainableTurn: false,
    });
    expect(outboundHandler).toHaveBeenCalledOnce();
    expect(outboundHandler.mock.calls[0]?.[0].isError).toBe(true);
  });

  it("T15b: replyFn throwing inside catch does NOT produce unhandledRejection (CTO C1)", async () => {
    const bus = new EventEmitterBus();
    const ingress = {
      handleInbound: vi.fn().mockRejectedValue(new Error("AI down")),
    } as unknown as GatewayIngress;
    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    // replyFn that throws — must be silently absorbed
    const msg = makeInboundMsg("@coder crash");
    (msg.replyFn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Telegram network error"));

    // If unhandledRejection is emitted, this test will fail
    const unhandledListener = vi.fn();
    process.on("unhandledRejection", unhandledListener);

    bus.publishInbound(msg);
    await flushPromises();
    // Extra tick to ensure any unhandled rejection would have fired
    await new Promise((resolve) => setTimeout(resolve, 50));

    process.off("unhandledRejection", unhandledListener);
    expect(unhandledListener).not.toHaveBeenCalled();
  });
});

// ============================================================================
// T17: Fire-and-forget
// ============================================================================

describe("BusConsumer — fire-and-forget", () => {
  it("T17: publishInbound() returns synchronously before handleInbound resolves", async () => {
    const bus = new EventEmitterBus();

    let resolveIngress!: (v: InboundResponse) => void;
    const ingressPromise = new Promise<InboundResponse>((r) => { resolveIngress = r; });
    const ingress = {
      handleInbound: vi.fn().mockReturnValue(ingressPromise),
    } as unknown as GatewayIngress;

    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    let publishReturned = false;
    const msg = makeInboundMsg("slow ai");

    bus.publishInbound(msg);
    publishReturned = true;

    // publishInbound returns synchronously — not awaited
    expect(publishReturned).toBe(true);
    // ingress has been invoked (fire-and-forget started), but not resolved yet
    expect(ingress.handleInbound).toHaveBeenCalled();
    expect(msg.replyFn).not.toHaveBeenCalled(); // still in-flight

    // Now resolve
    resolveIngress({ text: "finally done" });
    await flushPromises();

    expect(msg.replyFn).toHaveBeenCalledOnce();
  });
});
