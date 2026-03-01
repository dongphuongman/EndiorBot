/**
 * RgProvider Tests
 *
 * Unit tests for the ripgrep search provider.
 * Tests CTO Amendment A2 (error handling) and A1 (providerVersion).
 *
 * @module search/__tests__/rg-provider.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @sprint 63
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RgProvider } from "../providers/rg-provider.js";
import { SEARCH_BUDGET } from "../types.js";

describe("RgProvider", () => {
  let provider: RgProvider;

  beforeEach(() => {
    provider = new RgProvider({ cwd: process.cwd() });
  });

  // =========================================================================
  // Basic Properties
  // =========================================================================

  describe("properties", () => {
    it("should have correct name", () => {
      expect(provider.name).toBe("ripgrep");
    });

    it("should have version string (CTO A1)", () => {
      // Version format: "ripgrep X.Y.Z" or "ripgrep unknown"
      expect(provider.version).toMatch(/^ripgrep\s+(\d+\.\d+\.\d+|unknown)$/);
    });
  });

  // =========================================================================
  // Health Check
  // =========================================================================

  describe("healthCheck", () => {
    it("should return health status with version", async () => {
      const health = await provider.healthCheck();

      expect(health).toHaveProperty("provider", "ripgrep");
      expect(health).toHaveProperty("available");
      expect(health).toHaveProperty("lastChecked");

      if (health.available) {
        expect(health.version).toMatch(/^ripgrep\s+\d+\.\d+\.\d+$/);
      }
    });

    it("should detect rg availability", async () => {
      const health = await provider.healthCheck();

      // On most dev machines, rg should be available
      // This test may fail in minimal CI environments
      expect(typeof health.available).toBe("boolean");
    });
  });

  // =========================================================================
  // Search - Success Cases
  // =========================================================================

  describe("search - success", () => {
    it("should return SearchResponse with required fields", async () => {
      const response = await provider.search({
        query: "export",
        topK: 5,
      });

      // Check response structure
      expect(response).toHaveProperty("hits");
      expect(response).toHaveProperty("totalHits");
      expect(response).toHaveProperty("truncated");
      expect(response).toHaveProperty("elapsed_ms");
      expect(response).toHaveProperty("provider", "ripgrep");
      expect(response).toHaveProperty("providerVersion"); // CTO A1
      expect(response).toHaveProperty("tokensUsed");

      // Types
      expect(Array.isArray(response.hits)).toBe(true);
      expect(typeof response.totalHits).toBe("number");
      expect(typeof response.elapsed_ms).toBe("number");
      expect(typeof response.tokensUsed).toBe("number");
    });

    it("should include providerVersion in response (CTO A1)", async () => {
      const response = await provider.search({ query: "function" });

      expect(response.providerVersion).toBeDefined();
      expect(response.providerVersion).toMatch(/^ripgrep\s+/);
    });

    it("should return results with correct structure", async () => {
      const response = await provider.search({
        query: "import",
        topK: 3,
      });

      if (response.hits.length > 0) {
        const hit = response.hits[0];

        expect(hit).toHaveProperty("path");
        expect(hit).toHaveProperty("line");
        expect(hit).toHaveProperty("column");
        expect(hit).toHaveProperty("content");
        expect(hit).toHaveProperty("score");
        expect(hit).toHaveProperty("ranking_reason");
        expect(hit).toHaveProperty("provider", "ripgrep");
        expect(hit).toHaveProperty("specSnapshotMatch");
      }
    });

    it("should respect topK limit", async () => {
      const response = await provider.search({
        query: "const",
        topK: 3,
      });

      expect(response.hits.length).toBeLessThanOrEqual(3);
    });
  });

  // =========================================================================
  // Search - Error Handling (CTO A2)
  // =========================================================================

  describe("search - error handling (CTO A2)", () => {
    it("should return empty response for empty query", async () => {
      const response = await provider.search({ query: "" });

      expect(response.hits).toEqual([]);
      expect(response.totalHits).toBe(0);
      expect(response.provider).toBe("ripgrep");
    });

    it("should return empty response for whitespace query", async () => {
      const response = await provider.search({ query: "   " });

      expect(response.hits).toEqual([]);
      expect(response.totalHits).toBe(0);
    });

    it("should NOT throw on invalid regex (CTO A2)", async () => {
      // Invalid regex should not throw, just return empty or handle gracefully
      const response = await provider.search({ query: "[invalid(regex" });

      // Should return a response, not throw
      expect(response).toBeDefined();
      expect(response.provider).toBe("ripgrep");
    });

    it("should NOT throw on timeout", async () => {
      // Very short timeout
      const response = await provider.search({
        query: "export",
        timeout: 1, // 1ms timeout - should trigger timeout
      });

      // Should return a response, not throw
      expect(response).toBeDefined();
      expect(response.provider).toBe("ripgrep");
    });

    it("should NOT throw when rg not found", async () => {
      // Create provider with invalid rg path
      const badProvider = new RgProvider({ rgPath: "/nonexistent/rg" });

      const response = await badProvider.search({ query: "test" });

      // Should return empty response, not throw
      expect(response).toBeDefined();
      expect(response.hits).toEqual([]);
      expect(response.totalHits).toBe(0);
    });
  });

  // =========================================================================
  // Token Budget (CTO A3)
  // =========================================================================

  describe("token budget (CTO A3)", () => {
    it("should track tokensUsed in response", async () => {
      const response = await provider.search({
        query: "function",
        topK: 5,
      });

      expect(response.tokensUsed).toBeDefined();
      expect(typeof response.tokensUsed).toBe("number");
      expect(response.tokensUsed).toBeGreaterThanOrEqual(0);
    });

    it("should not exceed HARD_CAP_TOKENS", async () => {
      const response = await provider.search({
        query: "const", // Common pattern, many results
        topK: 100, // Request many results
      });

      expect(response.tokensUsed).toBeLessThanOrEqual(
        SEARCH_BUDGET.HARD_CAP_TOKENS
      );
    });

    it("should set truncated flag when budget exceeded", async () => {
      const response = await provider.search({
        query: "const",
        topK: 1000, // Request many results
      });

      // If totalHits > hits.length, truncated should be true
      if (response.totalHits > response.hits.length) {
        expect(response.truncated).toBe(true);
      }
    });
  });

  // =========================================================================
  // File Type Filtering
  // =========================================================================

  describe("file type filtering", () => {
    it("should filter by file type", async () => {
      const response = await provider.search({
        query: "export",
        fileTypes: ["ts"],
        topK: 10,
      });

      // All results should be .ts files
      for (const hit of response.hits) {
        expect(hit.path).toMatch(/\.ts$/);
      }
    });

    it("should filter by glob pattern", async () => {
      const response = await provider.search({
        query: "test",
        glob: "**/__tests__/**",
        topK: 10,
      });

      // All results should be in __tests__ directories
      for (const hit of response.hits) {
        expect(hit.path).toContain("__tests__");
      }
    });
  });

  // =========================================================================
  // Streaming Search
  // =========================================================================

  describe("searchStream", () => {
    it("should yield results as generator", async () => {
      const results: Awaited<ReturnType<typeof provider.search>>["hits"] = [];

      for await (const result of provider.searchStream({
        query: "import",
        topK: 3,
      })) {
        results.push(result);
        if (results.length >= 3) break;
      }

      expect(results.length).toBeLessThanOrEqual(3);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty("path");
        expect(results[0]).toHaveProperty("line");
        expect(results[0]).toHaveProperty("content");
      }
    });

    it("should not throw on empty query", async () => {
      const results: unknown[] = [];

      for await (const result of provider.searchStream({ query: "" })) {
        results.push(result);
      }

      expect(results).toEqual([]);
    });
  });
});
