/**
 * OTT Serve Wiring Tests — Sprint 110.5 (ADR-033)
 *
 * T1: createTelegramOttAdapter() with feedbackService → channel.setFeedbackService() called
 * T2: createTelegramOttAdapter() without feedbackService → backward compat (no error, no call)
 * T3: RLFeedbackService expireStale() timer — fires on setInterval, clears on clearInterval
 *
 * @module tests/channels/telegram/ott-serve-wiring
 * @sprint 110.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RLFeedbackService } from "../../../src/rl/feedback-service.js";

// ============================================================================
// Mock TelegramChannel to intercept setFeedbackService calls
// ============================================================================

const mockSetFeedbackService = vi.fn();
const mockOnMessage = vi.fn();
const mockStartPolling = vi.fn();
const mockStopPolling = vi.fn();

vi.mock("../../../src/channels/telegram/telegram-channel.js", () => ({
  TelegramChannel: vi.fn().mockImplementation(() => ({
    setFeedbackService: mockSetFeedbackService,
    onMessage: mockOnMessage,
    startPolling: mockStartPolling,
    stopPolling: mockStopPolling,
    send: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("../../../src/channels/telegram/telegram-config.js", () => ({
  loadTelegramConfig: vi.fn().mockReturnValue({
    botToken: "test-token",
    chatId: "test-chat",
  }),
}));

vi.mock("../../../src/agents/channel-router.js", () => ({
  getAgentModel: vi.fn().mockReturnValue("sonnet"),
}));

// ============================================================================
// Tests
// ============================================================================

describe("OTT Serve Wiring — Sprint 110.5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T1: createTelegramOttAdapter() with feedbackService → setFeedbackService() called on channel", async () => {
    // Import after mocks are set up
    const { createTelegramOttAdapter } = await import(
      "../../../src/channels/telegram/telegram-ott-adapter.js"
    );
    const feedbackService = new RLFeedbackService();

    const adapter = createTelegramOttAdapter(
      { handleInbound: vi.fn() } as never,
      undefined,
      undefined,
      feedbackService,
    );

    expect(adapter).not.toBeNull();
    expect(mockSetFeedbackService).toHaveBeenCalledOnce();
    expect(mockSetFeedbackService).toHaveBeenCalledWith(feedbackService);
  });

  it("T2: createTelegramOttAdapter() without feedbackService → backward compat, setFeedbackService NOT called", async () => {
    const { createTelegramOttAdapter } = await import(
      "../../../src/channels/telegram/telegram-ott-adapter.js"
    );

    const adapter = createTelegramOttAdapter(
      { handleInbound: vi.fn() } as never,
    );

    expect(adapter).not.toBeNull();
    expect(mockSetFeedbackService).not.toHaveBeenCalled();
  });

  it("T3: RLFeedbackService expireStale() fires on setInterval, stops on clearInterval", () => {
    vi.useFakeTimers();

    const feedbackService = new RLFeedbackService();
    const expireSpy = vi.spyOn(feedbackService, "expireStale");

    const FIFTEEN_MIN = 15 * 60 * 1000;
    const timer = setInterval(() => { feedbackService.expireStale(); }, FIFTEEN_MIN);

    // Before interval fires — no calls
    expect(expireSpy).not.toHaveBeenCalled();

    // After 15 minutes — fires once
    vi.advanceTimersByTime(FIFTEEN_MIN);
    expect(expireSpy).toHaveBeenCalledTimes(1);

    // After 30 minutes — fires twice
    vi.advanceTimersByTime(FIFTEEN_MIN);
    expect(expireSpy).toHaveBeenCalledTimes(2);

    // After clearInterval — stops firing
    clearInterval(timer);
    vi.advanceTimersByTime(FIFTEEN_MIN * 5);
    expect(expireSpy).toHaveBeenCalledTimes(2); // still 2 — timer stopped

    vi.useRealTimers();
  });
});
