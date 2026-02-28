/**
 * ContextBudget Unit Tests
 *
 * Tests for CEO Tool MVP ContextBudget governance (Sprint 54).
 * Covers: token limits, turn tracking, layer priority, reset logic.
 *
 * @module tests/brain/context-budget.test
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 54
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextBudget,
  getContextBudget,
  resetContextBudget,
  DEFAULT_CONTEXT_BUDGET_CONFIG,
  type ContextBlock,
} from "../../src/brain/context-budget.js";

describe("ContextBudget", () => {
  let budget: ContextBudget;

  beforeEach(() => {
    resetContextBudget();
    budget = getContextBudget();
  });

  describe("Configuration", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_CONTEXT_BUDGET_CONFIG.maxTokensPerTurn).toBe(2000);
      expect(DEFAULT_CONTEXT_BUDGET_CONFIG.maxBlocksPerTurn).toBe(3);
      expect(DEFAULT_CONTEXT_BUDGET_CONFIG.hardResetAfterTurns).toBe(30);
    });

    it("should use custom config when provided", () => {
      resetContextBudget();
      const customBudget = new ContextBudget({
        maxTokensPerTurn: 3000,
        maxBlocksPerTurn: 5,
        hardResetAfterTurns: 50,
      });

      expect(customBudget.getConfig().maxTokensPerTurn).toBe(3000);
      expect(customBudget.getConfig().maxBlocksPerTurn).toBe(5);
      expect(customBudget.getConfig().hardResetAfterTurns).toBe(50);
    });
  });

  describe("Turn Tracking", () => {
    it("should record turns for a session", () => {
      const sessionId = "test-session-1";

      budget.recordTurn(sessionId, 500);
      budget.recordTurn(sessionId, 600);
      budget.recordTurn(sessionId, 400);

      const state = budget.getSession(sessionId);
      expect(state.turnCount).toBe(3);
      expect(state.tokensUsed).toBe(1500);
    });

    it("should track sessions independently", () => {
      budget.recordTurn("session-a", 1000);
      budget.recordTurn("session-b", 500);
      budget.recordTurn("session-a", 800);

      const stateA = budget.getSession("session-a");
      const stateB = budget.getSession("session-b");

      expect(stateA.turnCount).toBe(2);
      expect(stateA.tokensUsed).toBe(1800);
      expect(stateB.turnCount).toBe(1);
      expect(stateB.tokensUsed).toBe(500);
    });
  });

  describe("Reset Logic", () => {
    it("should indicate reset needed after max turns", () => {
      const sessionId = "test-session-reset";

      // Record 30 turns (the default limit)
      for (let i = 0; i < 30; i++) {
        budget.recordTurn(sessionId, 100);
      }

      expect(budget.needsReset(sessionId)).toBe(true);
    });

    it("should not indicate reset before max turns", () => {
      const sessionId = "test-session-no-reset";

      for (let i = 0; i < 29; i++) {
        budget.recordTurn(sessionId, 100);
      }

      expect(budget.needsReset(sessionId)).toBe(false);
    });

    it("should reset session state", () => {
      const sessionId = "test-session-clear";

      budget.recordTurn(sessionId, 500);
      budget.recordTurn(sessionId, 600);
      budget.reset(sessionId);

      const state = budget.getSession(sessionId);
      expect(state.turnCount).toBe(0);
      expect(state.tokensUsed).toBe(0);
    });
  });

  describe("Budget Allocation", () => {
    it("should allocate budget with layer priority", () => {
      const blocks: ContextBlock[] = [
        budget.createBlock("b1", "mental_models", "Mental models content", 4),
        budget.createBlock("b2", "structures", "Structures content", 3),
        budget.createBlock("b3", "patterns", "Patterns content", 2),
      ];

      const allocation = budget.allocate(blocks);

      expect(allocation.totalTokens).toBeLessThanOrEqual(2000);
      expect(allocation.blocks.length).toBeGreaterThan(0);
    });

    it("should prioritize L4 over L3 over L2", () => {
      const blocks: ContextBlock[] = [
        budget.createBlock("b2", "structures", "x".repeat(6000), 3),  // 1500 tokens
        budget.createBlock("b4", "mental_models", "x".repeat(6000), 4),  // 1500 tokens
        budget.createBlock("b3", "patterns", "x".repeat(6000), 2),  // 1500 tokens
      ];

      const allocation = budget.allocate(blocks);

      // L4 should be included first (has priority 1)
      const includedLayers = allocation.blocks.map((b) => b.layer);
      expect(includedLayers[0]).toBe(4);
    });

    it("should never include L1 (events)", () => {
      const blocks: ContextBlock[] = [
        budget.createBlock("b1", "events", "Events content", 1),
        budget.createBlock("b4", "mental_models", "Mental models content", 4),
      ];

      const allocation = budget.allocate(blocks);

      const includedLayers = allocation.blocks.map((b) => b.layer);
      expect(includedLayers).not.toContain(1);
    });

    it("should respect max blocks per turn", () => {
      const blocks: ContextBlock[] = [
        budget.createBlock("b1", "mental_models", "Block 1", 4),
        budget.createBlock("b2", "mental_models", "Block 2", 4),
        budget.createBlock("b3", "structures", "Block 3", 3),
        budget.createBlock("b4", "structures", "Block 4", 3),
        budget.createBlock("b5", "patterns", "Block 5", 2),
      ];

      const allocation = budget.allocate(blocks);

      expect(allocation.blocks.length).toBeLessThanOrEqual(3);
    });

    it("should track dropped blocks", () => {
      const blocks: ContextBlock[] = [
        budget.createBlock("b1", "mental_models", "x".repeat(7200), 4),  // ~1800 tokens
        budget.createBlock("b2", "structures", "x".repeat(2000), 3),  // ~500 tokens - will be dropped
      ];

      const allocation = budget.allocate(blocks);

      // Second block should be dropped (exceeds budget)
      expect(allocation.droppedBlocks.length).toBeGreaterThan(0);
    });
  });

  describe("Token Estimation", () => {
    it("should estimate tokens from content length", () => {
      // ~4 chars per token
      expect(budget.estimateTokens("a".repeat(100))).toBe(25);
      expect(budget.estimateTokens("a".repeat(400))).toBe(100);
    });
  });

  describe("Approaching Limit", () => {
    it("should detect when approaching token limit", () => {
      // Default is 2000 tokens, 80% = 1600
      expect(budget.isApproachingLimit(1700)).toBe(true);
      expect(budget.isApproachingLimit(1500)).toBe(false);
    });
  });

  describe("Budget Status", () => {
    it("should return full status", () => {
      const sessionId = "test-status-session";
      budget.recordTurn(sessionId, 500);

      const status = budget.getStatus(sessionId);

      expect(status.session.turnCount).toBe(1);
      expect(status.config.maxTokensPerTurn).toBe(2000);
      expect(status.needsReset).toBe(false);
    });
  });

  describe("Singleton", () => {
    it("should return same instance", () => {
      const instance1 = getContextBudget();
      const instance2 = getContextBudget();

      expect(instance1).toBe(instance2);
    });

    it("should reset singleton", () => {
      const instance1 = getContextBudget();
      resetContextBudget();
      const instance2 = getContextBudget();

      expect(instance1).not.toBe(instance2);
    });
  });
});
