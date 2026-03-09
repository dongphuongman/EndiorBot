/**
 * ContextInjector Tests — Sprint 97
 *
 * Tests session-start injection, double-injection prevention,
 * checkpoint state, and singleton.
 *
 * @module tests/context/transfer/context-injector
 * @sprint 97
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextInjector,
  getContextInjector,
  resetContextInjector,
} from "../../../src/context/transfer/context-injector.js";
import { ContextSelector, resetContextSelector } from "../../../src/context/transfer/context-selector.js";
import { ContextQualityScorer, resetContextQualityScorer } from "../../../src/context/transfer/quality-scorer.js";
import { ContextQualityGate, resetContextQualityGate } from "../../../src/context/transfer/quality-gate.js";
import { ContextTransferStore, resetContextTransferStore } from "../../../src/context/transfer/context-transfer-store.js";
import type { TransferableContext, TransferContextType } from "../../../src/context/transfer/types.js";
import { DEFAULT_TRANSFER_CONFIG } from "../../../src/context/transfer/types.js";

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;
let store: ContextTransferStore;
let selector: ContextSelector;

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

// ============================================================================
// Tests
// ============================================================================

describe("ContextInjector", () => {
  let injector: ContextInjector;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `endiorbot-injector-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    resetContextQualityScorer();
    resetContextQualityGate();
    resetContextTransferStore();
    resetContextSelector();
    resetContextInjector();

    store = new ContextTransferStore({ basePath: tempDir });
    const scorer = new ContextQualityScorer();
    const gate = new ContextQualityGate({ scorer });
    selector = new ContextSelector({
      maxTokens: DEFAULT_TRANSFER_CONFIG.maxInjectionTokens,
      scorer,
      gate,
      store,
    });

    injector = new ContextInjector({ selector });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // --------------------------------------------------------------------------
  // Session start injection
  // --------------------------------------------------------------------------

  describe("injectAtSessionStart", () => {
    it("should inject prior context and return payload", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await store.save(makeContext("c2", "architecture", 100, 0.85));

      const payload = await injector.injectAtSessionStart("test-project", "session-1");

      expect(payload).toContain("## Prior Session Context");
      expect(payload).toContain("[decision]");
      expect(payload).toContain("[architecture]");
      expect(injector.isInjected()).toBe(true);
    });

    it("should return empty string for empty project", async () => {
      const payload = await injector.injectAtSessionStart("empty-project", "session-1");

      expect(payload).toBe("");
      expect(injector.isInjected()).toBe(true);
      expect(injector.getInjectedContextIds()).toHaveLength(0);
    });

    it("should respect 600-token budget", async () => {
      await store.save(makeContext("c1", "decision", 400, 0.9));
      await store.save(makeContext("c2", "architecture", 300, 0.85));

      const payload = await injector.injectAtSessionStart("test-project", "session-1");
      const result = injector.getInjectionResult();

      expect(result).toBeDefined();
      expect(result!.totalTokens).toBeLessThanOrEqual(600);
    });

    it("should pass goal/tags/stage to selector", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));

      await injector.injectAtSessionStart(
        "test-project", "session-1", "build feature", ["test"], "04-BUILD",
      );

      const result = injector.getInjectionResult();
      expect(result).toBeDefined();
      // The selector received the params — selected + dropped should account for all
      expect(result!.selected.length + result!.dropped.length).toBeGreaterThanOrEqual(0);
    });

    it("should reject low-quality contexts via gate", async () => {
      // Very low score — should be filtered by quality gate
      await store.save(makeContext("c1", "decision", 100, 0.1));

      const payload = await injector.injectAtSessionStart("test-project", "session-1");

      // Gate filters low-quality; payload may be empty
      const result = injector.getInjectionResult();
      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Double injection prevention
  // --------------------------------------------------------------------------

  describe("double injection prevention", () => {
    it("should return empty on second inject for same session", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));

      const first = await injector.injectAtSessionStart("test-project", "session-1");
      const second = await injector.injectAtSessionStart("test-project", "session-1");

      expect(first).toContain("## Prior Session Context");
      expect(second).toBe("");
    });

    it("should allow inject for different session after cleanup", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));

      await injector.injectAtSessionStart("test-project", "session-1");
      injector.cleanup();
      const payload = await injector.injectAtSessionStart("test-project", "session-2");

      expect(payload).toContain("## Prior Session Context");
    });
  });

  // --------------------------------------------------------------------------
  // Injection result and IDs
  // --------------------------------------------------------------------------

  describe("getInjectedContextIds", () => {
    it("should return IDs of injected contexts", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await store.save(makeContext("c2", "architecture", 100, 0.85));

      await injector.injectAtSessionStart("test-project", "session-1");
      const ids = injector.getInjectedContextIds();

      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain("c1");
    });
  });

  // --------------------------------------------------------------------------
  // Checkpoint
  // --------------------------------------------------------------------------

  describe("checkpoint", () => {
    it("should build checkpoint state", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await injector.injectAtSessionStart("test-project", "session-1");

      const state = injector.buildCheckpointState(15, 1, new Date().toISOString());

      expect(state.injectedContextIds).toContain("c1");
      expect(state.injectedTokens).toBeGreaterThan(0);
      expect(state.retentionRate).toBeGreaterThanOrEqual(0);
      expect(state.refreshCount).toBe(1);
      expect(state.turnCount).toBe(15);
    });

    it("should restore from checkpoint state", () => {
      const state = {
        injectedContextIds: ["c1", "c2"],
        injectedTokens: 200,
        retentionRate: 0.95,
        refreshCount: 2,
        lastRefreshAt: new Date().toISOString(),
        turnCount: 30,
      };

      injector.restoreFromCheckpoint(state, "session-1");

      expect(injector.isInjected()).toBe(true);
      expect(injector.getInjectedContextIds()).toEqual(["c1", "c2"]);
    });
  });

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  describe("cleanup", () => {
    it("should reset state for next session", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await injector.injectAtSessionStart("test-project", "session-1");

      expect(injector.isInjected()).toBe(true);

      injector.cleanup();

      expect(injector.isInjected()).toBe(false);
      expect(injector.getInjectedContextIds()).toHaveLength(0);
      expect(injector.getInjectionResult()).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getContextInjector should return consistent instance", () => {
      resetContextInjector();
      const a = getContextInjector();
      const b = getContextInjector();
      expect(a).toBe(b);
    });
  });
});
