/**
 * ContextSelector Tests — Sprint 96
 *
 * Tests budget-constrained selection, priority ordering,
 * 600-token cap (CTO F1), retention rate, and edge cases.
 *
 * @module tests/context/transfer/context-selector
 * @sprint 96
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ContextSelector,
  getContextSelector,
  resetContextSelector,
} from "../../../src/context/transfer/context-selector.js";
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

function makeContext(
  id: string,
  type: TransferContextType,
  tokenCount: number,
  compositeScore = 0.8,
): TransferableContext {
  const ctx: TransferableContext = {
    id,
    projectId: "test-project",
    sourceSessionId: "session-1",
    type,
    content: "x".repeat(tokenCount * 4), // ~4 chars per token
    tokenCount,
    quality: {
      relevance: 0.8,
      recency: 0.9,
      confidence: 0.7,
      completeness: 1.0,
      composite: compositeScore,
    },
    tags: ["test", "api"],
    createdAt: new Date().toISOString(),
    metadata: { provider: "claude-opus", success: true },
  };

  return ctx;
}

// ============================================================================
// Tests
// ============================================================================

describe("ContextSelector", () => {
  let selector: ContextSelector;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `endiorbot-selector-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    resetContextQualityScorer();
    resetContextQualityGate();
    resetContextTransferStore();
    resetContextSelector();

    store = new ContextTransferStore({ basePath: tempDir });
    const scorer = new ContextQualityScorer();
    const gate = new ContextQualityGate({ scorer });

    selector = new ContextSelector({
      maxTokens: DEFAULT_TRANSFER_CONFIG.maxInjectionTokens, // 600
      scorer,
      gate,
      store,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // --------------------------------------------------------------------------
  // Budget-constrained selection
  // --------------------------------------------------------------------------

  describe("budget-constrained selection", () => {
    it("should select contexts within 600-token budget (CTO F1)", async () => {
      // Save 3 contexts totaling 900 tokens — should only select up to 600
      await store.save(makeContext("c1", "decision", 200, 0.9));
      await store.save(makeContext("c2", "architecture", 250, 0.85));
      await store.save(makeContext("c3", "task_output", 300, 0.7));

      const result = await selector.selectForSession("test-project", undefined, ["test"]);

      expect(result.totalTokens).toBeLessThanOrEqual(600);
      expect(result.selected.length).toBeGreaterThan(0);
      expect(result.selected.length).toBeLessThan(3); // Can't fit all
    });

    it("should select all when under budget", async () => {
      await store.save(makeContext("c1", "decision", 100, 0.9));
      await store.save(makeContext("c2", "architecture", 100, 0.85));

      const result = await selector.selectForSession("test-project", undefined, ["test"]);

      expect(result.selected.length).toBe(2);
      expect(result.totalTokens).toBe(200);
    });

    it("should respect maxInjectionTokens = 600", async () => {
      // One large context that fits
      await store.save(makeContext("c1", "decision", 500, 0.9));
      // One that pushes over budget
      await store.save(makeContext("c2", "task_output", 200, 0.7));

      const result = await selector.selectForSession("test-project", undefined, ["test"]);

      expect(result.totalTokens).toBeLessThanOrEqual(600);
    });
  });

  // --------------------------------------------------------------------------
  // Priority ordering
  // --------------------------------------------------------------------------

  describe("priority ordering", () => {
    it("should prioritize decisions over task_output", async () => {
      await store.save(makeContext("task", "task_output", 100, 0.9));
      await store.save(makeContext("dec", "decision", 100, 0.9));

      const result = await selector.selectForSession("test-project", undefined, ["test"]);

      // Both should be selected (under budget)
      expect(result.selected.length).toBe(2);
      // Decision should come first in sorted order
      expect(result.selected[0]!.type).toBe("decision");
    });
  });

  // --------------------------------------------------------------------------
  // Empty project
  // --------------------------------------------------------------------------

  describe("empty project", () => {
    it("should handle empty project gracefully", async () => {
      const result = await selector.selectForSession("empty-project");

      expect(result.selected).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.budgetUtilization).toBe(0);
      expect(result.retentionRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Retention rate
  // --------------------------------------------------------------------------

  describe("retention rate", () => {
    it("should calculate retention rate correctly", async () => {
      await store.save(makeContext("c1", "decision", 200, 0.9));
      await store.save(makeContext("c2", "architecture", 200, 0.85));

      const result = await selector.selectForSession("test-project", undefined, ["test"]);

      // 400 total tokens, all selected → retention = 1.0
      if (result.selected.length === 2) {
        expect(result.retentionRate).toBeCloseTo(1.0, 1);
      } else {
        expect(result.retentionRate).toBeGreaterThan(0);
      }
    });

    it("estimateRetentionRate should return 0 for empty total", () => {
      const rate = selector.estimateRetentionRate([], []);
      expect(rate).toBe(0);
    });

    it("estimateRetentionRate should calculate correctly", () => {
      const selected = [makeContext("c1", "decision", 100)];
      const total = [
        makeContext("c1", "decision", 100),
        makeContext("c2", "task_output", 100),
      ];

      const rate = selector.estimateRetentionRate(selected, total);
      expect(rate).toBeCloseTo(0.5, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Injection payload
  // --------------------------------------------------------------------------

  describe("buildInjectionPayload", () => {
    it("should build formatted payload from selected contexts", () => {
      const contexts = [
        makeContext("c1", "decision", 10),
        makeContext("c2", "architecture", 10),
      ];

      const payload = selector.buildInjectionPayload(contexts);

      expect(payload).toContain("## Prior Session Context");
      expect(payload).toContain("[decision]");
      expect(payload).toContain("[architecture]");
    });

    it("should return empty string for no selected contexts", () => {
      const payload = selector.buildInjectionPayload([]);
      expect(payload).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // Singleton
  // --------------------------------------------------------------------------

  describe("singleton", () => {
    it("getContextSelector should return consistent instance", () => {
      resetContextSelector();
      const a = getContextSelector();
      const b = getContextSelector();
      expect(a).toBe(b);
    });
  });
});
