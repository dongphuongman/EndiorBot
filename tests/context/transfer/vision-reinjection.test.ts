/**
 * Tests for Sprint 142 P0-1 — Turn-based vision re-injection.
 *
 * Verifies:
 *   1. Vision injected at turn 10 (summary)
 *   2. Vision injected at turn 20 (full)
 *   3. No injection at non-milestone turns
 *   4. CTO C2 dedup: turn 10 + simultaneous refresh → ONE injection
 *   5. incrementTurn() triggers check automatically
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies to isolate ContextLifecycleManager
vi.mock("../../../src/context/transfer/context-injector.js", () => ({
  ContextInjector: vi.fn().mockImplementation(() => ({
    injectAtSessionStart: vi.fn().mockResolvedValue("mock-payload"),
    getInjectionResult: vi.fn().mockReturnValue({ totalTokens: 100 }),
    isInjected: vi.fn().mockReturnValue(true),
    getInjectedContextIds: vi.fn().mockReturnValue([]),
    buildCheckpointState: vi.fn().mockReturnValue({}),
  })),
  getContextInjector: vi.fn().mockReturnValue({
    injectAtSessionStart: vi.fn().mockResolvedValue("mock-payload"),
    getInjectionResult: vi.fn().mockReturnValue({ totalTokens: 100 }),
    isInjected: vi.fn().mockReturnValue(true),
    getInjectedContextIds: vi.fn().mockReturnValue([]),
    buildCheckpointState: vi.fn().mockReturnValue({}),
  }),
}));

vi.mock("../../../src/context/transfer/context-selector.js", () => ({
  ContextSelector: vi.fn(),
  getContextSelector: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../src/context/transfer/context-transfer-store.js", () => ({
  ContextTransferStore: vi.fn(),
  getContextTransferStore: vi.fn().mockReturnValue({
    saveBatch: vi.fn(),
  }),
}));

vi.mock("../../../src/context/transfer/retention-tracker.js", () => ({
  RetentionTracker: vi.fn(),
  getRetentionTracker: vi.fn().mockReturnValue({
    recordInjection: vi.fn(),
    recordSessionEnd: vi.fn(),
    getSessionMetrics: vi.fn().mockReturnValue({ retentionRate: 0.95 }),
  }),
}));

vi.mock("../../../src/context/transfer/session-context-extractor.js", () => ({
  SessionContextExtractor: vi.fn(),
}));

import { ContextLifecycleManager } from "../../../src/context/transfer/context-lifecycle.js";

describe("Sprint 142 P0-1 — Turn-based vision re-injection", () => {
  let manager: ContextLifecycleManager;

  beforeEach(async () => {
    manager = new ContextLifecycleManager();
    await manager.onSessionStart("test-project", "test-session");
  });

  it("no injection at turns 1-9", () => {
    for (let i = 1; i <= 9; i++) {
      manager.incrementTurn();
      expect(manager.getVisionInjection()).toBeNull();
    }
  });

  it("summary injection at turn 10", () => {
    for (let i = 1; i <= 10; i++) {
      manager.incrementTurn();
    }
    const injection = manager.getVisionInjection();
    expect(injection).not.toBeNull();
    expect(injection).toContain("Turn 10");
    expect(injection).toContain("Sprint goals summary");
  });

  it("full injection at turn 20", () => {
    for (let i = 1; i <= 20; i++) {
      manager.incrementTurn();
    }
    const injection = manager.getVisionInjection();
    expect(injection).not.toBeNull();
    expect(injection).toContain("Turn 20");
    expect(injection).toContain("Full sprint goals");
  });

  it("no injection at turn 11 (non-milestone)", () => {
    for (let i = 1; i <= 11; i++) {
      manager.incrementTurn();
    }
    expect(manager.getVisionInjection()).toBeNull();
  });

  it("CTO C2 dedup: calling checkVisionReInjection twice at same turn → one injection", () => {
    for (let i = 1; i <= 10; i++) {
      manager.incrementTurn();
    }
    // First call returns content
    const first = manager.checkVisionReInjection();
    // Second call at same turn → null (dedup)
    const second = manager.checkVisionReInjection();

    expect(first).toBeNull(); // Already injected by incrementTurn
    expect(second).toBeNull();
    // But getVisionInjection still returns the content for this turn
    expect(manager.getVisionInjection()).not.toBeNull();
  });

  it("injection at turn 30 is summary (30 % 10 === 0 but 30 % 20 !== 0)", () => {
    for (let i = 1; i <= 30; i++) {
      manager.incrementTurn();
    }
    const injection = manager.getVisionInjection();
    expect(injection).not.toBeNull();
    expect(injection).toContain("Sprint goals summary");
    expect(injection).not.toContain("Full sprint goals");
  });

  it("injection at turn 40 is full (40 % 20 === 0)", () => {
    for (let i = 1; i <= 40; i++) {
      manager.incrementTurn();
    }
    const injection = manager.getVisionInjection();
    expect(injection).not.toBeNull();
    expect(injection).toContain("Full sprint goals");
  });

  it("no injection when session not active", () => {
    const inactive = new ContextLifecycleManager();
    // Don't call onSessionStart
    for (let i = 1; i <= 10; i++) {
      inactive.incrementTurn();
    }
    expect(inactive.getVisionInjection()).toBeNull();
  });
});
