/**
 * Sprint 137 A8: Telegram editMessageText for progress ticks.
 *
 * Tests `buildProgressAwareReplyFn` — the helper that turns a stream of
 * `replyFn(text, { isProgress: true, correlationId })` calls into one
 * placeholder message + N in-place edits per correlationId.
 *
 * CRITICAL invariant (CTO precondition for A8):
 *   Each replyFn call results in EXACTLY ONE outbound API call to Telegram
 *   (sendCapturingId, editMessage, or send) — never two. This is the
 *   single-owner invariant established by P0-01: progress text travels
 *   through the originating channel only, never through both replyFn AND a
 *   bus.publishOutbound side-channel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildProgressAwareReplyFn,
  type ProgressAwareTelegramChannel,
} from "../../../src/channels/telegram/telegram-ott-adapter.js";

function makeChannel(overrides?: Partial<ProgressAwareTelegramChannel>) {
  const channel: ProgressAwareTelegramChannel = {
    send: vi.fn(async () => true),
    sendCapturingId: vi.fn(async () => 1001),
    editMessage: vi.fn(async () => true),
    ...overrides,
  };
  return channel;
}

function callCount(channel: ProgressAwareTelegramChannel): number {
  return (
    (channel.send as ReturnType<typeof vi.fn>).mock.calls.length +
    (channel.sendCapturingId as ReturnType<typeof vi.fn>).mock.calls.length +
    (channel.editMessage as ReturnType<typeof vi.fn>).mock.calls.length
  );
}

describe("buildProgressAwareReplyFn — first progress tick", () => {
  let channel: ProgressAwareTelegramChannel;
  let placeholders: Map<string, number>;

  beforeEach(() => {
    channel = makeChannel();
    placeholders = new Map();
  });

  it("captures the message id via sendCapturingId on first isProgress call", async () => {
    const reply = buildProgressAwareReplyFn(channel, placeholders);
    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });

    expect(channel.sendCapturingId).toHaveBeenCalledTimes(1);
    expect(channel.sendCapturingId).toHaveBeenCalledWith("⏳ tick 1", {});
    expect(channel.editMessage).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(placeholders.get("cid-A")).toBe(1001);
  });

  it("forwards format option through sendCapturingId", async () => {
    const reply = buildProgressAwareReplyFn(channel, placeholders);
    await reply("⏳ markdown", {
      correlationId: "cid-A",
      isProgress: true,
      format: "markdown",
    });
    expect(channel.sendCapturingId).toHaveBeenCalledWith("⏳ markdown", {
      format: "markdown",
    });
  });

  it("single-owner invariant: only one Telegram API call per first-tick", async () => {
    const reply = buildProgressAwareReplyFn(channel, placeholders);
    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    expect(callCount(channel)).toBe(1);
  });
});

describe("buildProgressAwareReplyFn — subsequent progress ticks", () => {
  it("edits the captured placeholder in place on subsequent isProgress calls", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    await reply("⏳ tick 2", { correlationId: "cid-A", isProgress: true });
    await reply("⏳ tick 3", { correlationId: "cid-A", isProgress: true });

    expect(channel.sendCapturingId).toHaveBeenCalledTimes(1);
    expect(channel.editMessage).toHaveBeenCalledTimes(2);
    expect(channel.editMessage).toHaveBeenNthCalledWith(1, 1001, "⏳ tick 2", {});
    expect(channel.editMessage).toHaveBeenNthCalledWith(2, 1001, "⏳ tick 3", {});
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("single-owner invariant: each subsequent tick = exactly one API call", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    expect(callCount(channel)).toBe(1);
    await reply("⏳ tick 2", { correlationId: "cid-A", isProgress: true });
    expect(callCount(channel)).toBe(2);
    await reply("⏳ tick 3", { correlationId: "cid-A", isProgress: true });
    expect(callCount(channel)).toBe(3);
  });

  it("falls back to a fresh sendCapturingId when editMessage fails", async () => {
    const channel = makeChannel({
      editMessage: vi.fn(async () => false),
      sendCapturingId: vi.fn().mockResolvedValueOnce(1001).mockResolvedValueOnce(2002),
    });
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    await reply("⏳ tick 2", { correlationId: "cid-A", isProgress: true });

    expect(channel.editMessage).toHaveBeenCalledTimes(1);
    expect(channel.sendCapturingId).toHaveBeenCalledTimes(2);
    expect(placeholders.get("cid-A")).toBe(2002);
    // Call count = 1 (first tick) + 1 (failed edit) + 1 (recovery send) = 3 across two ticks.
    expect(callCount(channel)).toBe(3);
  });
});

describe("buildProgressAwareReplyFn — final response", () => {
  it("sends a normal message and clears the placeholder when isProgress is absent", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    expect(placeholders.has("cid-A")).toBe(true);

    await reply("Final answer", {
      correlationId: "cid-A",
      isTrainableTurn: true,
      provider: "claude-code",
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith("Final answer", {
      correlationId: "cid-A",
      isTrainableTurn: true,
      provider: "claude-code",
    });
    expect(placeholders.has("cid-A")).toBe(false);
  });

  it("clears the placeholder when isProgress is explicitly false", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    await reply("error", { correlationId: "cid-A", isProgress: false });

    expect(placeholders.has("cid-A")).toBe(false);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it("a fresh correlationId after final response starts clean", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });
    await reply("Final answer", { correlationId: "cid-A", isTrainableTurn: true });

    // Same correlationId reused (paranoid check) — should sendCapturingId again.
    await reply("⏳ tick 1 again", { correlationId: "cid-A", isProgress: true });
    expect(channel.sendCapturingId).toHaveBeenCalledTimes(2);
  });
});

describe("buildProgressAwareReplyFn — multiple correlationIds in flight", () => {
  it("isolates placeholder state per correlationId", async () => {
    const channel = makeChannel({
      sendCapturingId: vi
        .fn()
        .mockResolvedValueOnce(1001)
        .mockResolvedValueOnce(2002),
    });
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ A", { correlationId: "cid-A", isProgress: true });
    await reply("⏳ B", { correlationId: "cid-B", isProgress: true });
    await reply("⏳ A2", { correlationId: "cid-A", isProgress: true });
    await reply("⏳ B2", { correlationId: "cid-B", isProgress: true });

    expect(channel.sendCapturingId).toHaveBeenCalledTimes(2);
    expect(channel.editMessage).toHaveBeenCalledTimes(2);
    expect(channel.editMessage).toHaveBeenNthCalledWith(1, 1001, "⏳ A2", {});
    expect(channel.editMessage).toHaveBeenNthCalledWith(2, 2002, "⏳ B2", {});
  });
});

describe("buildProgressAwareReplyFn — degenerate cases", () => {
  it("isProgress without correlationId falls through to channel.send (no edit attempted)", async () => {
    const channel = makeChannel();
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ no cid", { isProgress: true });

    expect(channel.sendCapturingId).not.toHaveBeenCalled();
    expect(channel.editMessage).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it("recovers when sendCapturingId returns null (Telegram down) — falls through to channel.send", async () => {
    const channel = makeChannel({
      sendCapturingId: vi.fn(async () => null),
    });
    const placeholders = new Map<string, number>();
    const reply = buildProgressAwareReplyFn(channel, placeholders);

    await reply("⏳ tick 1", { correlationId: "cid-A", isProgress: true });

    expect(channel.sendCapturingId).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledTimes(1);
    // Placeholder map empty so the next tick will retry capture.
    expect(placeholders.has("cid-A")).toBe(false);
  });
});
