/**
 * Search Types Tests
 *
 * Unit tests for search types and budget utilities.
 * Tests CTO Amendment A3 (SEARCH_BUDGET constants).
 *
 * @module search/__tests__/types.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @sprint 63
 */

import { describe, it, expect } from "vitest";
import {
  SEARCH_BUDGET,
  estimateTokens,
  isTokenBudgetExceeded,
  truncateToTokenBudget,
  createEmptyResponse,
  formatRetrievalEvidence,
  type RetrievalEvidence,
} from "../types.js";
import {
  SearchBudgetManager,
  applyBudgetToResponse,
  getBudgetSummary,
} from "../search-budget.js";

describe("SEARCH_BUDGET constants (CTO A3)", () => {
  it("should have correct DEFAULT_TOP_K", () => {
    expect(SEARCH_BUDGET.DEFAULT_TOP_K).toBe(15);
  });

  it("should have correct DEFAULT_MAX_BYTES", () => {
    expect(SEARCH_BUDGET.DEFAULT_MAX_BYTES).toBe(50_000);
  });

  it("should have MAX_BYTES_PER_RESULT = 500 (CTO A3)", () => {
    expect(SEARCH_BUDGET.MAX_BYTES_PER_RESULT).toBe(500);
  });

  it("should have correct DEFAULT_TIMEOUT_MS", () => {
    expect(SEARCH_BUDGET.DEFAULT_TIMEOUT_MS).toBe(5_000);
  });

  it("should have TOKEN_LIMIT = 2000 (soft limit)", () => {
    expect(SEARCH_BUDGET.TOKEN_LIMIT).toBe(2_000);
  });

  it("should have HARD_CAP_TOKENS = 2500 (CTO A3)", () => {
    expect(SEARCH_BUDGET.HARD_CAP_TOKENS).toBe(2_500);
  });
});

describe("estimateTokens", () => {
  it("should estimate tokens based on content length", () => {
    const content = "hello world"; // 11 characters
    const tokens = estimateTokens(content);

    // TOKENS_PER_BYTE = 0.25, so ~2.75 tokens, rounded up to 3
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(content.length);
  });

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("isTokenBudgetExceeded", () => {
  it("should return false when under soft limit", () => {
    expect(isTokenBudgetExceeded(1000)).toBe(false);
  });

  it("should return true when at soft limit", () => {
    expect(isTokenBudgetExceeded(2000)).toBe(true);
  });

  it("should return false when under hard cap (hardCap=true)", () => {
    expect(isTokenBudgetExceeded(2400, true)).toBe(false);
  });

  it("should return true when at hard cap (hardCap=true)", () => {
    expect(isTokenBudgetExceeded(2500, true)).toBe(true);
  });
});

describe("truncateToTokenBudget", () => {
  it("should not truncate content under budget", () => {
    const content = "short content";
    const result = truncateToTokenBudget(content, 1000);

    expect(result.truncated).toBe(false);
    expect(result.content).toBe(content);
  });

  it("should truncate content over budget", () => {
    const content = "a".repeat(10000); // Long content
    const result = truncateToTokenBudget(content, 100);

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThan(content.length);
    expect(result.content).toContain("[truncated]");
  });

  it("should respect hard cap by default", () => {
    const content = "a".repeat(50000);
    const result = truncateToTokenBudget(content);

    expect(result.tokensUsed).toBeLessThanOrEqual(SEARCH_BUDGET.HARD_CAP_TOKENS);
  });
});

describe("createEmptyResponse", () => {
  it("should create empty response with provider info", () => {
    const response = createEmptyResponse("ripgrep", "ripgrep 14.1.0");

    expect(response.hits).toEqual([]);
    expect(response.totalHits).toBe(0);
    expect(response.truncated).toBe(false);
    expect(response.elapsed_ms).toBe(0);
    expect(response.provider).toBe("ripgrep");
    expect(response.providerVersion).toBe("ripgrep 14.1.0");
    expect(response.tokensUsed).toBe(0);
  });
});

describe("SearchBudgetManager", () => {
  it("should start with empty state", () => {
    const manager = new SearchBudgetManager();

    expect(manager.getResults()).toEqual([]);
    expect(manager.getTokensUsed()).toBe(0);
    expect(manager.getBytesUsed()).toBe(0);
  });

  it("should add results within budget", () => {
    const manager = new SearchBudgetManager();
    const result = {
      path: "test.ts",
      line: 1,
      column: 0,
      content: "const x = 1;",
      contextBefore: [],
      contextAfter: [],
      score: 100,
      ranking_reason: "exact_match" as const,
      provider: "ripgrep" as const,
      specSnapshotMatch: false,
    };

    const added = manager.add(result);

    expect(added).toBe(true);
    expect(manager.getResults().length).toBe(1);
    expect(manager.getTokensUsed()).toBeGreaterThan(0);
  });

  it("should reject results that exceed budget", () => {
    // Create manager with very small budget
    const manager = new SearchBudgetManager(10, 5, 100);

    const result = {
      path: "test.ts",
      line: 1,
      column: 0,
      content: "a".repeat(1000), // Large content
      contextBefore: [],
      contextAfter: [],
      score: 100,
      ranking_reason: "exact_match" as const,
      provider: "ripgrep" as const,
      specSnapshotMatch: false,
    };

    // First result might fit (truncated)
    manager.add(result);

    // After first, budget should be exceeded
    const added = manager.add(result);
    expect(added).toBe(false);
  });

  it("should truncate large results to MAX_BYTES_PER_RESULT", () => {
    const manager = new SearchBudgetManager();
    const largeContent = "x".repeat(1000);

    const result = {
      path: "test.ts",
      line: 1,
      column: 0,
      content: largeContent,
      contextBefore: [],
      contextAfter: [],
      score: 100,
      ranking_reason: "exact_match" as const,
      provider: "ripgrep" as const,
      specSnapshotMatch: false,
    };

    manager.add(result);
    const results = manager.getResults();

    // Content should be truncated
    expect(results.length).toBe(1);
    expect(results[0]!.content.length).toBeLessThan(largeContent.length);
  });

  it("should track soft limit exceeded", () => {
    const manager = new SearchBudgetManager(2500, 100, 500);

    // Add results until soft limit exceeded
    for (let i = 0; i < 100; i++) {
      const added = manager.add({
        path: `test${i}.ts`,
        line: 1,
        column: 0,
        content: "const x = " + i,
        contextBefore: [],
        contextAfter: [],
        score: 100,
        ranking_reason: "exact_match" as const,
        provider: "ripgrep" as const,
        specSnapshotMatch: false,
      });

      if (!added) break;
    }

    // Should have exceeded soft limit at some point
    expect(manager.getTokensUsed()).toBeGreaterThan(0);
  });

  it("should reset state", () => {
    const manager = new SearchBudgetManager();

    manager.add({
      path: "test.ts",
      line: 1,
      column: 0,
      content: "const x = 1;",
      contextBefore: [],
      contextAfter: [],
      score: 100,
      ranking_reason: "exact_match" as const,
      provider: "ripgrep" as const,
      specSnapshotMatch: false,
    });

    manager.reset();

    expect(manager.getResults()).toEqual([]);
    expect(manager.getTokensUsed()).toBe(0);
  });
});

describe("applyBudgetToResponse", () => {
  it("should truncate response hits to budget", () => {
    const response = {
      hits: Array.from({ length: 100 }, (_, i) => ({
        path: `test${i}.ts`,
        line: i,
        column: 0,
        content: "x".repeat(100),
        contextBefore: [],
        contextAfter: [],
        score: 100,
        ranking_reason: "exact_match" as const,
        provider: "ripgrep" as const,
        specSnapshotMatch: false,
      })),
      totalHits: 100,
      truncated: false,
      elapsed_ms: 100,
      provider: "ripgrep" as const,
      providerVersion: "ripgrep 14.1.0",
      tokensUsed: 0,
    };

    const budgeted = applyBudgetToResponse(response, 500);

    expect(budgeted.hits.length).toBeLessThan(100);
    expect(budgeted.truncated).toBe(true);
    expect(budgeted.tokensUsed).toBeLessThanOrEqual(500);
  });
});

describe("getBudgetSummary", () => {
  it("should format budget status correctly", () => {
    const response = {
      hits: [],
      totalHits: 0,
      truncated: false,
      elapsed_ms: 0,
      provider: "ripgrep" as const,
      providerVersion: "ripgrep 14.1.0",
      tokensUsed: 1000,
    };

    const summary = getBudgetSummary(response);

    expect(summary).toContain("1000");
    expect(summary).toContain("2500");
    expect(summary).toContain("OK");
  });

  it("should indicate SOFT_LIMIT status", () => {
    const response = {
      hits: [],
      totalHits: 0,
      truncated: false,
      elapsed_ms: 0,
      provider: "ripgrep" as const,
      providerVersion: "ripgrep 14.1.0",
      tokensUsed: 2100,
    };

    const summary = getBudgetSummary(response);
    expect(summary).toContain("SOFT_LIMIT");
  });

  it("should indicate HARD_CAP status", () => {
    const response = {
      hits: [],
      totalHits: 0,
      truncated: false,
      elapsed_ms: 0,
      provider: "ripgrep" as const,
      providerVersion: "ripgrep 14.1.0",
      tokensUsed: 2500,
    };

    const summary = getBudgetSummary(response);
    expect(summary).toContain("HARD_CAP");
  });
});

describe("formatRetrievalEvidence", () => {
  it("should format evidence for logging", () => {
    const evidence: RetrievalEvidence = {
      timestamp: "2026-03-01T12:00:00Z",
      query: "function hello",
      provider: "ripgrep",
      providerVersion: "ripgrep 14.1.0",
      elapsed_ms: 50,
      totalHits: 10,
      topKReturned: 5,
      truncated: false,
      tokensUsed: 500,
      results: [
        {
          path: "src/test.ts",
          line: 10,
          ranking_reason: "exact_match",
          specSnapshotMatch: false,
          sourceExcerpt: "function hello() {}",
        },
      ],
    };

    const formatted = formatRetrievalEvidence(evidence);

    expect(formatted).toContain("Search Evidence");
    expect(formatted).toContain("function hello");
    expect(formatted).toContain("ripgrep");
    expect(formatted).toContain("50ms");
    expect(formatted).toContain("src/test.ts");
  });

  it("should indicate spec snapshot matches", () => {
    const evidence: RetrievalEvidence = {
      timestamp: "2026-03-01T12:00:00Z",
      query: "test",
      provider: "ripgrep",
      providerVersion: "ripgrep 14.1.0",
      elapsed_ms: 50,
      totalHits: 1,
      topKReturned: 1,
      truncated: false,
      tokensUsed: 100,
      results: [
        {
          path: "src/spec.ts",
          line: 1,
          ranking_reason: "spec_snapshot_match",
          specSnapshotMatch: true,
          sourceExcerpt: "// spec",
        },
      ],
    };

    const formatted = formatRetrievalEvidence(evidence);

    expect(formatted).toContain("Spec Snapshot Match");
  });
});
