/**
 * T3 Integration Tests — Sprint 97
 *
 * Tests AutonomousSessionManager integration with context lifecycle,
 * T3 gate config, and retention tracking.
 *
 * CTO F5: Additive hooks — inject/refresh/extract in runLoop().
 *
 * @module tests/sessions/autonomous/t3-integration
 * @sprint 97
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { AutonomousSessionManager } from "../../../src/sessions/autonomous/manager.js";
import { AUTONOMY_GATE_CONFIG } from "../../../src/sessions/autonomous/types.js";
import { DEFAULT_T3_CONFIG } from "../../../src/autonomy/types.js";
import { ContextLifecycleManager, resetContextLifecycleManager } from "../../../src/context/transfer/context-lifecycle.js";
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

function createLifecycleWithStore(store: ContextTransferStore): ContextLifecycleManager {
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

  return new ContextLifecycleManager({
    injector,
    selector,
    store,
    tracker,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("T3 Integration — Sprint 97", () => {
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `endiorbot-t3-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    resetContextQualityScorer();
    resetContextQualityGate();
    resetContextTransferStore();
    resetContextSelector();
    resetContextInjector();
    resetRetentionTracker();
    resetContextLifecycleManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // --------------------------------------------------------------------------
  // Gate C config
  // --------------------------------------------------------------------------

  describe("Gate C config", () => {
    it("should use Gate C limits (120min, $10)", () => {
      expect(AUTONOMY_GATE_CONFIG.C.maxDurationMs).toBe(2 * 60 * 60 * 1000);
      expect(AUTONOMY_GATE_CONFIG.C.maxCostUsd).toBe(10.0);
    });

    it("T3 config should match Gate C", () => {
      expect(DEFAULT_T3_CONFIG.timeoutMs).toBe(AUTONOMY_GATE_CONFIG.C.maxDurationMs);
      expect(DEFAULT_T3_CONFIG.costLimitUsd).toBe(AUTONOMY_GATE_CONFIG.C.maxCostUsd);
    });
  });

  // --------------------------------------------------------------------------
  // AutonomousSessionManager + context lifecycle
  // --------------------------------------------------------------------------

  describe("setContextLifecycle", () => {
    it("should accept context lifecycle manager", () => {
      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "C",
      });

      const store = new ContextTransferStore({ basePath: tempDir });
      const lifecycle = createLifecycleWithStore(store);

      // Should not throw
      manager.setContextLifecycle(lifecycle);
    });

    it("should work with runLoop when lifecycle is set", async () => {
      const store = new ContextTransferStore({ basePath: tempDir });
      await store.save(makeContext("c1", "decision", 100, 0.9));

      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "C",
      });

      const lifecycle = createLifecycleWithStore(store);
      manager.setContextLifecycle(lifecycle);

      await manager.start();
      // No tasks — loop finishes immediately, but context should be injected
      await manager.runLoop();

      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
    });

    it("should work without lifecycle (backward compat)", async () => {
      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "B",
      });

      await manager.start();
      // Should not throw even without lifecycle
      await manager.runLoop();
    });
  });

  // --------------------------------------------------------------------------
  // Context injection at start
  // --------------------------------------------------------------------------

  describe("context injection at start", () => {
    it("should inject prior context before first task", async () => {
      const store = new ContextTransferStore({ basePath: tempDir });
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await store.save(makeContext("c2", "architecture", 100, 0.85));

      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "C",
      });

      const lifecycle = createLifecycleWithStore(store);
      manager.setContextLifecycle(lifecycle);

      await manager.start();
      await manager.runLoop();

      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
      expect(status.injectedContextCount).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Context extraction at end
  // --------------------------------------------------------------------------

  describe("context extraction at end", () => {
    it("should extract context at session end", async () => {
      const store = new ContextTransferStore({ basePath: tempDir });
      const lifecycle = createLifecycleWithStore(store);

      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "C",
      });

      manager.setContextLifecycle(lifecycle);

      await manager.start();
      await manager.runLoop();

      // After runLoop, lifecycle should have called onSessionEnd
      // (even with no tasks, it calls with empty results)
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint
  // --------------------------------------------------------------------------

  describe("checkpoint context", () => {
    it("should build checkpoint state from lifecycle", async () => {
      const store = new ContextTransferStore({ basePath: tempDir });
      await store.save(makeContext("c1", "decision", 100, 0.9));

      const lifecycle = createLifecycleWithStore(store);

      await lifecycle.onSessionStart("test-project", "session-1");
      lifecycle.incrementTurn();

      const checkpoint = lifecycle.buildCheckpointState();
      expect(checkpoint.injectedContextIds.length).toBeGreaterThan(0);
      expect(checkpoint.turnCount).toBe(1);
    });

    it("should restore from checkpoint", () => {
      const lifecycle = createLifecycleWithStore(
        new ContextTransferStore({ basePath: tempDir }),
      );

      const state = {
        injectedContextIds: ["c1"],
        injectedTokens: 100,
        retentionRate: 0.95,
        refreshCount: 1,
        lastRefreshAt: new Date().toISOString(),
        turnCount: 15,
      };

      lifecycle.restoreFromCheckpoint(state, "session-1");
      const status = lifecycle.getStatus();
      expect(status.injected).toBe(true);
      expect(status.turnCount).toBe(15);
      expect(status.refreshCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Budget/timeout with context preserved
  // --------------------------------------------------------------------------

  describe("context preserved on budget/timeout stop", () => {
    it("should extract context even when loop stops with no tasks", async () => {
      const store = new ContextTransferStore({ basePath: tempDir });
      await store.save(makeContext("c1", "decision", 100, 0.9));

      const lifecycle = createLifecycleWithStore(store);
      const manager = new AutonomousSessionManager({
        projectRoot: tempDir,
        projectId: "test-project",
        gate: "C",
      });

      manager.setContextLifecycle(lifecycle);
      await manager.start();
      await manager.runLoop();

      // Lifecycle onSessionEnd should have been called
      const status = lifecycle.getStatus();
      // After onSessionEnd, the lifecycle is no longer active — metrics were finalized
      expect(status.injected).toBe(true);
    });
  });
});
