/**
 * Sprint 137 A9: Zalo progress throttle tests.
 *
 * Zalo Bot API doesn't expose `editMessageText`, so the A8 in-place edit
 * pattern doesn't apply. Instead we throttle: the first progress tick per
 * correlationId reaches Zalo, then at most one fresh tick per
 * `ZALO_PROGRESS_THROTTLE_MS` window. Final responses always go through.
 *
 * `decideZaloProgressEmit` is a pure helper that encodes the throttle decision
 * — exporting it lets us assert the contract without booting the polling loop.
 */

import { describe, it, expect } from "vitest";
import { decideZaloProgressEmit } from "../../../src/channels/zalo/zalo-ott-adapter.js";

describe("decideZaloProgressEmit", () => {
  it("first tick (no prior send) always emits and records the timestamp", () => {
    expect(decideZaloProgressEmit(undefined, 1_000_000, 60_000)).toBe(1_000_000);
  });

  it("subsequent tick within the throttle window is dropped (returns null)", () => {
    expect(decideZaloProgressEmit(1_000_000, 1_010_000, 60_000)).toBeNull();
    expect(decideZaloProgressEmit(1_000_000, 1_059_999, 60_000)).toBeNull();
  });

  it("subsequent tick after the throttle window emits with new timestamp", () => {
    expect(decideZaloProgressEmit(1_000_000, 1_060_000, 60_000)).toBe(1_060_000);
    expect(decideZaloProgressEmit(1_000_000, 1_120_000, 60_000)).toBe(1_120_000);
  });

  it("custom throttle window honored", () => {
    expect(decideZaloProgressEmit(1_000_000, 1_005_000, 10_000)).toBeNull();
    expect(decideZaloProgressEmit(1_000_000, 1_010_000, 10_000)).toBe(1_010_000);
  });

  it("zero-elapsed tick is dropped (rapid double-fire safety)", () => {
    expect(decideZaloProgressEmit(1_000_000, 1_000_000, 60_000)).toBeNull();
  });
});
