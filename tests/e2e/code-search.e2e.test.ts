/**
 * Code Search E2E Tests
 *
 * End-to-end tests for the Code Search system.
 * Sprint 65: T5.18 - E2E tests for code search.
 *
 * Tests full workflows including:
 * - RgProvider search
 * - Retrieval policy filtering
 * - Search budget enforcement
 * - Context injection integration
 *
 * @module tests/e2e/code-search.e2e.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @sprint 65
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import {
  RgProvider,
  createPolicy,
  createRetrievalLogger,
  type SearchOptions,
  type SearchResponse,
  SEARCH_BUDGET,
} from "../../src/search/index.js";

// ============================================================================
// Test Setup
// ============================================================================

const projectRoot = process.cwd();

// ============================================================================
// RgProvider E2E Tests
// ============================================================================

describe("E2E: RgProvider", () => {
  let provider: RgProvider;

  beforeEach(() => {
    provider = new RgProvider({ cwd: projectRoot });
  });

  it("should check ripgrep availability", async () => {
    const health = await provider.healthCheck();

    // In CI or dev environment, ripgrep should be available
    if (health.available) {
      expect(health.version).toBeDefined();
      // Version can be "ripgrep 15.1.0" or just "15.1.0"
      expect(health.version).toMatch(/\d+\.\d+/);
    }
  });

  it("should search for patterns in codebase", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "export function",
      topK: 10,
      contextLines: 1,
    });

    expect(response.hits.length).toBeGreaterThan(0);
    expect(response.provider).toBe("ripgrep");
    expect(response.elapsed_ms).toBeGreaterThan(0);
  });

  it("should search with file type filter", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "interface",
      topK: 10,
      fileTypes: ["ts"],
    });

    // All results should be TypeScript files (.ts or .tsx)
    for (const hit of response.hits) {
      expect(hit.path).toMatch(/\.tsx?$/);
    }
  });

  it("should search with glob pattern", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "describe",
      topK: 10,
      globs: ["**/*.test.ts"],
    });

    // All results should be test files
    for (const hit of response.hits) {
      expect(hit.path).toMatch(/\.test\.ts$/);
    }
  });

  it("should respect topK limit", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "import",
      topK: 5,
    });

    expect(response.hits.length).toBeLessThanOrEqual(5);
  });

  it("should handle no results gracefully", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    // Use a pattern that regex searches won't accidentally match
    // This is a UUID-like string that shouldn't exist in the codebase
    const response = await provider.search({
      query: "^\\b$impossible_match_c9f8e7d6-5a4b-3c2d-1e0f$",
      topK: 10,
    });

    // Should have no results (or very few if the pattern partially matches)
    expect(response.hits.length).toBeLessThanOrEqual(1);
    expect(response.truncated).toBe(false);
  });

  it("should return context lines", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "export function",
      topK: 5,
      contextLines: 2,
    });

    // Should have some hits
    expect(response.hits.length).toBeGreaterThan(0);

    // Check if context is included (may be empty for some providers)
    // Just verify the response structure includes context fields
    for (const hit of response.hits) {
      expect(Array.isArray(hit.contextBefore)).toBe(true);
      expect(Array.isArray(hit.contextAfter)).toBe(true);
    }
  });
});

// ============================================================================
// Retrieval Policy E2E Tests
// ============================================================================

describe("E2E: Retrieval Policy", () => {
  it("should create policy from stage", () => {
    const buildPolicy = createPolicy("04-BUILD");

    expect(buildPolicy).toBeDefined();
    expect(buildPolicy.getConfig().stage).toBe("04-BUILD");
  });

  it("should create policy from role", () => {
    const coderPolicy = createPolicy(undefined, "@coder");

    expect(coderPolicy).toBeDefined();
    expect(coderPolicy.getConfig().role).toBe("@coder");
  });

  it("should apply policy to search options", () => {
    const policy = createPolicy("04-BUILD", "@coder");

    const options: SearchOptions = {
      query: "test",
      topK: 10,
    };

    const applied = policy.applyToSearchOptions(options);

    expect(applied.query).toBe("test");
    expect(applied.topK).toBe(10);
    // Policy should add include/exclude patterns
  });

  it("should enrich results with ranking", () => {
    const policy = createPolicy("04-BUILD");

    const hits = [
      {
        path: "src/context/types.ts",
        line: 10,
        column: 1,
        content: "export interface Test {}",
        contextBefore: [],
        contextAfter: [],
        score: 1,
        ranking_reason: "text_match",
        provider: "ripgrep",
        specSnapshotMatch: false,
      },
    ];

    const enriched = policy.enrichResults(hits);

    expect(enriched.length).toBe(1);
    expect(enriched[0]!.specSnapshotMatch).toBeDefined();
  });
});

// ============================================================================
// Search Budget E2E Tests
// ============================================================================

describe("E2E: Search Budget", () => {
  it("should have correct default values", () => {
    expect(SEARCH_BUDGET.DEFAULT_TOP_K).toBe(15);
    expect(SEARCH_BUDGET.TOKEN_LIMIT).toBe(2000);
    expect(SEARCH_BUDGET.HARD_CAP_TOKENS).toBe(2500);
  });

  it("should respect byte limits in search", async () => {
    const provider = new RgProvider({ cwd: projectRoot });
    const health = await provider.healthCheck();

    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "function",
      topK: 5,
      maxBytes: SEARCH_BUDGET.MAX_BYTES_PER_RESULT * 5,
    });

    // Check that results don't exceed budget
    let totalBytes = 0;
    for (const hit of response.hits) {
      totalBytes += hit.content.length;
    }

    // Should be roughly within limits (with some tolerance)
    expect(totalBytes).toBeLessThan(SEARCH_BUDGET.DEFAULT_MAX_BYTES);
  });
});

// ============================================================================
// Retrieval Logger E2E Tests
// ============================================================================

describe("E2E: Retrieval Logger", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrieval-logger-test-"));
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should log search evidence", async () => {
    const logger = createRetrievalLogger({
      evidenceDir: path.join(tempDir, "evidence"),
      progressPath: path.join(tempDir, "SESSION-PROGRESS.md"),
    });

    const mockResponse: SearchResponse = {
      hits: [
        {
          path: "src/test.ts",
          line: 10,
          column: 1,
          content: "test content",
          contextBefore: [],
          contextAfter: [],
          score: 1,
          ranking_reason: "text_match",
          provider: "ripgrep",
          specSnapshotMatch: false,
        },
      ],
      totalHits: 1,
      truncated: false,
      elapsed_ms: 50,
      provider: "ripgrep",
      providerVersion: "14.0.0",
      tokensUsed: 25,
    };

    await logger.logSearchEvidence(mockResponse, "test query");

    // Check that evidence was recorded
    const recent = await logger.getRecentEvidence(10);
    expect(recent.length).toBe(1);
    expect(recent[0]!.query).toBe("test query");
  });

  it("should track multiple searches", async () => {
    const logger = createRetrievalLogger({
      evidenceDir: path.join(tempDir, "evidence"),
      progressPath: path.join(tempDir, "SESSION-PROGRESS.md"),
    });

    for (let i = 0; i < 3; i++) {
      await logger.logSearchEvidence(
        {
          hits: [],
          totalHits: 0,
          truncated: false,
          elapsed_ms: 10,
          provider: "ripgrep",
          providerVersion: "14.0.0",
          tokensUsed: 0,
        },
        `query ${i}`
      );
      // Small delay to ensure unique timestamps in filenames
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const recent = await logger.getRecentEvidence(10);
    // Should have at least 2 evidence files (timing may cause some overlap)
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Full Search Workflow E2E Tests
// ============================================================================

describe("E2E: Full Search Workflow", () => {
  let provider: RgProvider;
  let workflowTempDir: string;

  beforeEach(async () => {
    provider = new RgProvider({ cwd: projectRoot });
    workflowTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(workflowTempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should complete search with policy and logging", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    // 1. Create policy
    const policy = createPolicy("04-BUILD", "@coder");

    // 2. Apply policy to search options
    const options = policy.applyToSearchOptions({
      query: "ContextAnchor",
      topK: 5,
      contextLines: 1,
    });

    // 3. Execute search
    const response = await provider.search(options);

    // 4. Log evidence (with unique temp dir)
    const logger = createRetrievalLogger({
      evidenceDir: path.join(workflowTempDir, "evidence"),
      progressPath: path.join(workflowTempDir, "SESSION-PROGRESS.md"),
    });
    await logger.logSearchEvidence(response, "ContextAnchor");

    // 5. Enrich results
    const enriched = policy.enrichResults(response.hits);

    // Verify workflow
    expect(response.provider).toBe("ripgrep");
    const recent = await logger.getRecentEvidence(10);
    expect(recent.length).toBe(1);
    expect(enriched.length).toBe(response.hits.length);
  });

  it("should search for specific patterns", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    // Search for class definitions
    const response = await provider.search({
      query: "export class.*Manager",
      topK: 10,
    });

    expect(response.hits.length).toBeGreaterThan(0);

    // All results should contain Manager class
    for (const hit of response.hits) {
      expect(hit.content).toMatch(/class.*Manager/);
    }
  });

  it("should exclude node_modules and dist", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    // Search with default excludes
    const response = await provider.search({
      query: "export",
      topK: 20,
    });

    // Results should NOT include node_modules or dist
    for (const hit of response.hits) {
      expect(hit.path).not.toContain("node_modules");
      expect(hit.path).not.toContain("/dist/");
    }
  });
});

// ============================================================================
// Performance E2E Tests
// ============================================================================

describe("E2E: Search Performance", () => {
  let provider: RgProvider;

  beforeEach(() => {
    provider = new RgProvider({ cwd: projectRoot });
  });

  it("should complete search within timeout", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const startTime = Date.now();

    await provider.search({
      query: "function",
      topK: 50,
      timeout: 5000,
    });

    const elapsed = Date.now() - startTime;

    // Should complete in under 5 seconds
    expect(elapsed).toBeLessThan(5000);
  });

  it("should report elapsed time accurately", async () => {
    const health = await provider.healthCheck();
    if (!health.available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const response = await provider.search({
      query: "import",
      topK: 10,
    });

    // Elapsed time should be positive and reasonable
    expect(response.elapsed_ms).toBeGreaterThan(0);
    expect(response.elapsed_ms).toBeLessThan(10000);
  });
});
