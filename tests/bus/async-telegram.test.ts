/**
 * Sprint 106: Async Telegram OTT Adapter Tests
 *
 * Tests ADR-032 async publish path in telegram-ott-adapter.ts:
 * T18: With bus provided — adapter calls bus.publishInbound() and returns immediately
 * T19: With bus=undefined — adapter still awaits ingress.handleInbound() (backward compat)
 * T20: replyFn registered in bus message calls channel.send() with truncated text
 *
 * @module tests/bus/async-telegram
 * @sprint 106
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitterBus } from "../../src/bus/message-bus.js";
import type { BusInboundMessage } from "../../src/bus/types.js";
import type { GatewayIngress, InboundResponse } from "../../src/gateway/ingress.js";

// ============================================================================
// Mocks
// ============================================================================

// Mock TelegramChannel and config
vi.mock("../../src/channels/telegram/telegram-channel.js", () => {
  return {
    TelegramChannel: vi.fn().mockImplementation(() => ({
      onMessage: vi.fn(),
      send: vi.fn().mockResolvedValue(true),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
    })),
  };
});

vi.mock("../../src/channels/telegram/telegram-config.js", () => ({
  loadTelegramConfig: vi.fn().mockReturnValue({
    botToken: "test-token",
    chatId: "test-chat",
    allowedChatIds: ["test-chat"],
  }),
  isValidBotToken: vi.fn().mockReturnValue(true),
  isValidChatId: vi.fn().mockReturnValue(true),
}));

vi.mock("../../src/agents/channel-router.js", () => ({
  getAgentModel: vi.fn().mockReturnValue("sonnet"),
  createChannelRouter: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

async function getAdapter() {
  const { createTelegramOttAdapter } = await import("../../src/channels/telegram/telegram-ott-adapter.js");
  const { TelegramChannel } = await import("../../src/channels/telegram/telegram-channel.js");
  return { createTelegramOttAdapter, TelegramChannel };
}

function makeIngress(response: InboundResponse): GatewayIngress {
  return {
    handleInbound: vi.fn().mockResolvedValue(response),
  } as unknown as GatewayIngress;
}

function makeMockMessage(text: string) {
  return {
    senderId: "user-telegram-1",
    messageId: 123,
    content: text,
    metadata: { chatId: "chat-456", username: "ceo_user" },
  };
}

// Wait for all pending microtasks
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ============================================================================
// T18: Async path — returns immediately
// ============================================================================

describe("createTelegramOttAdapter — async bus path (T18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T18: with bus provided, adapter calls bus.publishInbound() and onMessage returns before handleInbound resolves", async () => {
    const { createTelegramOttAdapter, TelegramChannel } = await getAdapter();

    const bus = new EventEmitterBus();
    const publishSpy = vi.spyOn(bus, "publishInbound");

    // ingress that never resolves until we tell it to
    let resolveIngress!: (v: InboundResponse) => void;
    const pendingIngress = new Promise<InboundResponse>((r) => { resolveIngress = r; });
    const ingress = {
      handleInbound: vi.fn().mockReturnValue(pendingIngress),
    } as unknown as GatewayIngress;

    createTelegramOttAdapter(ingress, bus);

    const channelInstance = vi.mocked(TelegramChannel).mock.results[0]?.value;
    const onMessageFn: (msg: ReturnType<typeof makeMockMessage>) => Promise<void> =
      channelInstance.onMessage.mock.calls[0]?.[0];

    let handlerReturned = false;

    // Simulate incoming Telegram message
    const handlerPromise = onMessageFn(makeMockMessage("@coder how does auth work?"));
    handlerPromise.then(() => { handlerReturned = true; });

    // Yield to microtasks — handler should return immediately (publishInbound is sync)
    await flushPromises();

    // bus.publishInbound called
    expect(publishSpy).toHaveBeenCalledOnce();

    // handler returned BEFORE ingress resolved
    expect(handlerReturned).toBe(true);
    expect(ingress.handleInbound).not.toHaveBeenCalled(); // consumer hasn't started

    // Cleanup
    resolveIngress({ text: "done" });
  });
});

// ============================================================================
// T19: Sync fallback
// ============================================================================

describe("createTelegramOttAdapter — sync fallback (T19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T19: with bus=undefined, adapter awaits ingress.handleInbound() (backward compat)", async () => {
    const { createTelegramOttAdapter, TelegramChannel } = await getAdapter();

    const ingress = makeIngress({ text: "sync response" });
    createTelegramOttAdapter(ingress);  // NO bus

    const channelInstance = vi.mocked(TelegramChannel).mock.results[0]?.value;
    const onMessageFn: (msg: ReturnType<typeof makeMockMessage>) => Promise<void> =
      channelInstance.onMessage.mock.calls[0]?.[0];

    await onMessageFn(makeMockMessage("hello world"));

    // ingress.handleInbound was called (sync path)
    expect(ingress.handleInbound).toHaveBeenCalledOnce();
    // channel.send called with response text
    expect(channelInstance.send).toHaveBeenCalledWith(
      expect.stringContaining("sync response"),
      expect.any(Object),
    );
  });
});

// ============================================================================
// T20: replyFn → channel.send()
// ============================================================================

describe("createTelegramOttAdapter — replyFn → channel.send (T20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T20: replyFn registered in bus message calls channel.send() with text", async () => {
    const { createTelegramOttAdapter, TelegramChannel } = await getAdapter();

    const bus = new EventEmitterBus();
    let capturedMsg: BusInboundMessage | null = null;
    bus.onInbound((msg) => { capturedMsg = msg; });

    const ingress = makeIngress({ text: "irrelevant" }); // not used via bus directly
    createTelegramOttAdapter(ingress, bus);

    const channelInstance = vi.mocked(TelegramChannel).mock.results[0]?.value;
    const onMessageFn: (msg: ReturnType<typeof makeMockMessage>) => Promise<void> =
      channelInstance.onMessage.mock.calls[0]?.[0];

    await onMessageFn(makeMockMessage("/help"));

    // replyFn should be present on the captured bus message
    expect(capturedMsg).not.toBeNull();
    expect(typeof capturedMsg!.replyFn).toBe("function");

    // Calling replyFn should delegate to channel.send()
    await capturedMsg!.replyFn("Hello from async response");

    expect(channelInstance.send).toHaveBeenCalledWith(
      "Hello from async response",
      expect.any(Object),
    );
  });
});
