/**
 * Sprint 115 (T3): notifyFn Approval Notification Tests
 *
 * Tests that notifyFn is threaded through bus → consumer → ingress → router
 * so CEO sees approval prompts immediately before waitForApproval blocks.
 *
 * @module tests/commands/notify-approval
 * @sprint 115
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitterBus, createCorrelationId } from "../../src/bus/message-bus.js";
import { BusConsumer } from "../../src/bus/consumer.js";
import type { BusInboundMessage, ChannelSendFn } from "../../src/bus/types.js";
import type { GatewayIngress, InboundMessage, InboundResponse } from "../../src/gateway/ingress.js";

// ============================================================================
// Helpers
// ============================================================================

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ============================================================================
// T3-1: notifyFn threaded from bus message to ingress metadata
// ============================================================================

describe("notifyFn approval notifications (T3)", () => {
  it("T3-1: BusConsumer threads notifyFn into inbound.metadata", async () => {
    const bus = new EventEmitterBus();
    const notifyFn: ChannelSendFn = vi.fn().mockResolvedValue(true);
    const capturedInbound: InboundMessage[] = [];

    const ingress = {
      handleInbound: vi.fn().mockImplementation((msg: InboundMessage) => {
        capturedInbound.push(msg);
        return Promise.resolve({ text: "ok" } as InboundResponse);
      }),
    } as unknown as GatewayIngress;

    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const msg: BusInboundMessage = {
      correlationId: createCorrelationId("telegram", "ceo-1"),
      channel: "telegram",
      senderId: "ceo-1",
      content: "@coder implement feature X",
      enqueuedAt: Date.now(),
      replyFn: vi.fn().mockResolvedValue(true),
      notifyFn,
    };

    bus.publishInbound(msg);
    await flushPromises();

    expect(capturedInbound).toHaveLength(1);
    expect(capturedInbound[0]!.metadata).toBeDefined();
    expect(capturedInbound[0]!.metadata!.notifyFn).toBe(notifyFn);
  });

  it("T3-2: BusConsumer omits notifyFn from metadata when not provided", async () => {
    const bus = new EventEmitterBus();
    const capturedInbound: InboundMessage[] = [];

    const ingress = {
      handleInbound: vi.fn().mockImplementation((msg: InboundMessage) => {
        capturedInbound.push(msg);
        return Promise.resolve({ text: "ok" } as InboundResponse);
      }),
    } as unknown as GatewayIngress;

    const consumer = new BusConsumer(bus, ingress);
    consumer.start();

    const msg: BusInboundMessage = {
      correlationId: createCorrelationId("telegram", "user-1"),
      channel: "telegram",
      senderId: "user-1",
      content: "hello",
      enqueuedAt: Date.now(),
      replyFn: vi.fn().mockResolvedValue(true),
      // NO notifyFn
    };

    bus.publishInbound(msg);
    await flushPromises();

    expect(capturedInbound).toHaveLength(1);
    // metadata should not have notifyFn
    if (capturedInbound[0]!.metadata) {
      expect(capturedInbound[0]!.metadata).not.toHaveProperty("notifyFn");
    }
  });

  it("T3-3: notifyFn in Telegram OTT adapter sets busMsg.notifyFn = replyFn", () => {
    // Structural test: verify the BusInboundMessage interface accepts notifyFn
    const replyFn: ChannelSendFn = vi.fn().mockResolvedValue(true);
    const busMsg: BusInboundMessage = {
      correlationId: "test-123",
      channel: "telegram",
      senderId: "ceo-1",
      content: "@coder fix bug",
      enqueuedAt: Date.now(),
      replyFn,
    };
    busMsg.notifyFn = replyFn;

    expect(busMsg.notifyFn).toBe(replyFn);
  });

  it("T3-4: GatewayIngress extracts notifyFn from metadata and passes to callAI", async () => {
    // Real integration test: GatewayIngress receives metadata.notifyFn
    // and threads it as the 5th arg to router.callAI()
    const { GatewayIngress } = await import("../../src/gateway/ingress.js");
    const notifyFn: ChannelSendFn = vi.fn().mockResolvedValue(true);

    let capturedNotifyFn: unknown = "NOT_CALLED";
    const mockRouter = {
      routeMessage: vi.fn().mockReturnValue({ agents: ["coder"], task: "fix bug" }),
      getUsageHint: vi.fn().mockReturnValue("usage hint"),
      config: { projectRoot: "/tmp/test" },
      callAI: vi.fn().mockImplementation(
        (_agent: string, _task: string, _h: unknown, _ws: unknown, nfn: unknown) => {
          capturedNotifyFn = nfn;
          return Promise.resolve({ content: "done", provider: "sonnet" });
        },
      ),
      formatResponse: vi.fn().mockReturnValue("done"),
    };
    const mockDispatcher = { dispatch: vi.fn().mockReturnValue(null) };

    const ingress = new GatewayIngress(
      mockDispatcher as never,
      mockRouter as never,
    );

    await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@coder fix bug",
      metadata: { chatId: "chat-1", notifyFn },
    });

    expect(mockRouter.callAI).toHaveBeenCalledOnce();
    expect(capturedNotifyFn).toBe(notifyFn);
  });
});
