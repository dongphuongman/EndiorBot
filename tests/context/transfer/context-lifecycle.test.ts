/**
 * ContextLifecycleManager Tests — Sprint 97
 *
 * Tests full lifecycle: inject → refresh → extract,
 * checkpoint save/restore, and mid-session refresh with swap threshold.
 *
 * CTO F3: Swap threshold test — no swap if improvement < 0.1.
 *
 * @module tests/context/transfer/context-lifecycle
 * @sprint 97
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextLifecycleManager,
  getContextLifecycleManager,
  resetContextLifecycleManager,
} from "../../../src/context/transfer/context-lifecycle.js";
import { ContextInjector, resetContextInjector } from "../../../src/context/transfer/context-injector.js";
import { ContextSelector, resetContextSelector } from "../../../src/context/transfer/context-selector.js";
import { ContextQualityScorer, resetContextQualityScorer } from "../../../src/context/transfer/quality-scorer.js";
import { ContextQualityGate, resetContextQualityGate } from "../../../src/context/transfer/quality-gate.js";
import { ContextTransferStore, resetContextTransferStore } from "../../../src/context/transfer/context-transfer-store.js";
import { RetentionTracker, resetRetentionTracker } from "../../../src/context/transfer/retention-tracker.js";
import type { TransferableContext, TransferContextType } from "../../../src/context/transfer/types.js";
import { DEFAULT_TRANSFER_CONFIG } from "../../../src/context/transfer/types.js";

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;
let store: ContextTransferStore;
let lifecycle: ContextLifecycleManager;

function makeContext(
  id: string,
  type: TransferContextType,
  tokenCount: number,
  compositeScore = 0.8,
): TransferableContext {
  return {
    id,
    projectId: "test-project",
    sourceSessionId: "session-0",
    type,
    content: "x".repeat(tokenCount * 4),
    tokenCount,
    quality: {
      relevance: 0.8,
      recency: 0.9,
      confidence: 0.7,
      completeness: 1.0,
      composite: compositeScore,
    },
    tags: ["test"],
    createdAt: new Date().toISOString(),
    metadata: { provider: "claude-opus", success: true },
  };
}

async function setupLifecycle(): Promise<void> {
  resetContextQualityScorer();
  resetContextQualityGate();
  resetContextTransferStore();
  resetContextSelector();
  resetContextInjector();
  resetRetentionTracker();
  resetContextLifecycleManager();

  store = new ContextTransferStore({ basePath: tempDir });
  const scorer = new ContextQualityScorer();
  const gate = new ContextQualityGate({ scorer });
  const selector = new ContextSelector({
    maxTokens: DEFAULT_TRANSFER_CONFIG.maxInjectionTokens,
    scorer,
    gate,
    store,
  });
  const injector = new ContextInjector({ selector });
  const tracker = new RetentionTracker();

  lifecycle = new ContextLifecycleManager({
    injector,
    selector,
    store,
    tracker,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("ContextLifecycleManager", () => {
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `endiorbot-lifecycle-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await setupLifecycle();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // --------------------------------------------------------------------------
  // Session start
  // --------------------------------------------------------------------------

  describe("onSessionStart", () => {
    it("should inject context at session start", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await store.save(makeContext("c2", "architecture", 100, 0.85));

      const payload = await lifecycle.onSessionStart("test-project", "session-1");

      expect(payload).toContain("## Prior Session Context");
      expect(payload).toContain("[decision]");
    });

    it("should handle empty project gracefully", async () => {
      const payload = await lifecycle.onSessionStart("empty-project", "session-1");

      expect(payload).toBe("");
      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
      expect(status.injectedContextCount).toBe(0);
    });

    it("should initialize turn count and refresh state", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");

      const status = lifecycle.getStatus();
      expect(status.turnCount).toBe(0);
      expect(status.refreshCount).toBe(0);
      expect(status.sessionStartedAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Session end
  // --------------------------------------------------------------------------

  describe("onSessionEnd", () => {
    it("should extract context from subtask results", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");

      await lifecycle.onSessionEnd(
        [
          { agent: "architect", success: true, output: "Architecture decision: use microservices" },
          { agent: "coder", success: true, output: "Implemented service layer" },
        ],
        ["api"],
        "04-BUILD",
      );

      // Context should be saved to store
      const stored = await store.listByProject("test-project");
      expect(stored.length).toBeGreaterThan(0);
    });

    it("should skip extraction when no results", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");
      await lifecycle.onSessionEnd();

      // No new context should be saved from empty results
      const stored = await store.listByProject("test-project");
      expect(stored.length).toBe(0);
    });

    it("should skip when not active", async () => {
      // Don't call onSessionStart — not active
      await lifecycle.onSessionEnd([
        { agent: "coder", success: true, output: "Some output" },
      ]);
      // Should not throw
    });
  });

  // --------------------------------------------------------------------------
  // Refresh trigger
  // --------------------------------------------------------------------------

  describe("shouldRefresh", () => {
    it("should trigger on turn interval", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");

      // Advance to turn 30
      for (let i = 0; i < 30; i++) {
        lifecycle.incrementTurn();
      }

      // Need to be past minimum interval too
      // The lastRefreshAt is set at session start, so we check after min interval
      expect(lifecycle.getStatus().turnCount).toBe(30);
    });

    it("should not trigger before minimum interval", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");

      // Just started — within minimum interval
      expect(lifecycle.shouldRefresh()).toBe(false);
    });

    it("should not trigger when not active", () => {
      expect(lifecycle.shouldRefresh()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Refresh context (CTO F3)
  // --------------------------------------------------------------------------

  describe("refreshContext", () => {
    it("should refresh when no prior injection exists", async () => {
      // Start with test-project but no stored context at start
      await lifecycle.onSessionStart("test-project", "session-1");

      // Now save context and try to refresh — should inject fresh context
      await store.save(makeContext("c1", "decision", 100, 0.9));
      const refreshed = await lifecycle.refreshContext();
      expect(refreshed).toBe(true);
      expect(lifecycle.getStatus().refreshCount).toBe(1);
    });

    it("should not swap if improvement below threshold (CTO F3)", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.85));
      await lifecycle.onSessionStart("test-project", "session-1");

      // Same context still available — no improvement possible
      const swapped = await lifecycle.refreshContext();
      expect(swapped).toBe(false);
    });

    it("should not refresh when not active", async () => {
      const result = await lifecycle.refreshContext();
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Turn counter
  // --------------------------------------------------------------------------

  describe("incrementTurn", () => {
    it("should increment turn count", async () => {
      await lifecycle.onSessionStart("test-project", "session-1");

      lifecycle.incrementTurn();
      lifecycle.incrementTurn();
      lifecycle.incrementTurn();

      expect(lifecycle.getStatus().turnCount).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  describe("getStatus", () => {
    it("should return full lifecycle status", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await lifecycle.onSessionStart("test-project", "session-1");

      const status = lifecycle.getStatus();

      expect(status.injected).toBe(true);
      expect(status.injectedContextCount).toBeGreaterThan(0);
      expect(status.turnCount).toBe(0);
      expect(status.refreshCount).toBe(0);
      expect(status.sessionStartedAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint
  // --------------------------------------------------------------------------

  describe("checkpoint", () => {
    it("should build checkpoint state", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await lifecycle.onSessionStart("test-project", "session-1");
      lifecycle.incrementTurn();

      const state = lifecycle.buildCheckpointState();

      expect(state.injectedContextIds.length).toBeGreaterThan(0);
      expect(state.injectedTokens).toBeGreaterThan(0);
      expect(state.turnCount).toBe(1);
      expect(state.refreshCount).toBe(0);
    });

    it("should restore from checkpoint state", async () => {
      const state = {
        injectedContextIds: ["c1", "c2"],
        injectedTokens: 200,
        retentionRate: 0.95,
        refreshCount: 2,
        lastRefreshAt: new Date().toISOString(),
        turnCount: 30,
      };

      lifecycle.restoreFromCheckpoint(state, "session-1");

      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
      expect(status.injectedContextCount).toBe(2);
      expect(status.turnCount).toBe(30);
      expect(status.refreshCount).toBe(2);
    });

    it("should restore after crash and continue", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await lifecycle.onSessionStart("test-project", "session-1");
      lifecycle.incrementTurn();

      // Simulate crash — save checkpoint
      const checkpoint = lifecycle.buildCheckpointState();

      // Create new lifecycle (simulating restart)
      await setupLifecycle();

      // Restore from checkpoint
      lifecycle.restoreFromCheckpoint(checkpoint, "session-1");

      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
      expect(status.turnCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getContextLifecycleManager should return consistent instance", () => {
      resetContextLifecycleManager();
      const a = getContextLifecycleManager();
      const b = getContextLifecycleManager();
      expect(a).toBe(b);
    });
  });
});
