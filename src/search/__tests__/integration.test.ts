/**
 * Search Integration Tests
 *
 * Integration tests for the Code Search Layer.
 * Tests retrieval policy, logging, and context injection.
 *
 * @module search/__tests__/integration.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @sprint 63
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RetrievalPolicy,
  STAGE_FILTERS,
  ROLE_FILTERS,
  createStagePolicy,
  createRolePolicy,
  createPolicy,
  getAvailableStages,
  getAvailableRoles,
} from "../retrieval-policy.js";
import {
  RetrievalLogger,
  createRetrievalLogger,
} from "../retrieval-logger.js";
import {
  type SearchResponse,
  type SearchResult,
} from "../types.js";

// ============================================================================
// Retrieval Policy Tests
// ============================================================================

describe("RetrievalPolicy", () => {
  describe("STAGE_FILTERS", () => {
    it("should have filters for all 10 SDLC stages", () => {
      const stages = getAvailableStages();
      expect(stages.length).toBeGreaterThanOrEqual(10);
      expect(stages).toContain("00-FOUNDATION");
      expect(stages).toContain("04-BUILD");
      expect(stages).toContain("05-TEST");
    });

    it("should have correct BUILD stage configuration", () => {
      const buildFilter = STAGE_FILTERS["04-BUILD"];
      expect(buildFilter).toBeDefined();
      expect(buildFilter!.priorityPatterns).toContain("src/**/*.ts");
      expect(buildFilter!.excludePatterns).toContain("node_modules/**");
      expect(buildFilter!.contextDepth).toBe(3);
    });

    it("should have correct PLANNING stage configuration", () => {
      const planFilter = STAGE_FILTERS["01-PLANNING"];
      expect(planFilter).toBeDefined();
      expect(planFilter!.priorityPatterns).toContain("docs/01-planning/**/*");
      expect(planFilter!.excludePatterns).toContain("src/**/*.ts");
    });
  });

  describe("ROLE_FILTERS", () => {
    it("should have filters for all agent roles", () => {
      const roles = getAvailableRoles();
      expect(roles.length).toBeGreaterThanOrEqual(5);
      expect(roles).toContain("@coder");
      expect(roles).toContain("@architect");
      expect(roles).toContain("@reviewer");
    });

    it("should have correct @coder role configuration", () => {
      const coderFilter = ROLE_FILTERS["@coder"];
      expect(coderFilter).toBeDefined();
      expect(coderFilter!.focusPaths).toContain("src/**/*");
      expect(coderFilter!.contextDepth).toBe(4);
      expect(coderFilter!.tokenBudget).toBe(4000);
    });

    it("should have correct @architect role configuration", () => {
      const architectFilter = ROLE_FILTERS["@architect"];
      expect(architectFilter).toBeDefined();
      expect(architectFilter!.focusPaths).toContain("ADR-*.md");
      expect(architectFilter!.tokenBudget).toBe(3000);
    });
  });

  describe("createPolicy", () => {
    it("should create policy with stage only", () => {
      const policy = createStagePolicy("04-BUILD");
      expect(policy.getStageFilter()).not.toBeNull();
      expect(policy.getRoleFilter()).toBeNull();
    });

    it("should create policy with role only", () => {
      const policy = createRolePolicy("@coder");
      expect(policy.getStageFilter()).toBeNull();
      expect(policy.getRoleFilter()).not.toBeNull();
    });

    it("should create policy with stage and role", () => {
      const policy = createPolicy("04-BUILD", "@coder");
      expect(policy.getStageFilter()).not.toBeNull();
      expect(policy.getRoleFilter()).not.toBeNull();
    });

    it("should handle empty config", () => {
      const policy = createPolicy();
      expect(policy.getStageFilter()).toBeNull();
      expect(policy.getRoleFilter()).toBeNull();
    });
  });

  describe("applyToSearchOptions", () => {
    it("should apply stage filter to search options", () => {
      const policy = createStagePolicy("04-BUILD");
      const options = policy.applyToSearchOptions({ query: "test" });

      expect(options.query).toBe("test");
      expect(options.glob).toBe("src/**/*.ts");
      expect(options.contextLines).toBe(3);
      expect(options.stage).toBe("04-BUILD");
    });

    it("should apply role filter to search options", () => {
      const policy = createRolePolicy("@coder");
      const options = policy.applyToSearchOptions({ query: "test" });

      expect(options.query).toBe("test");
      // Note: ripgrep's --type ts includes .tsx, --type js includes .jsx
      expect(options.fileTypes).toEqual(["ts", "js"]);
      expect(options.contextLines).toBe(4);
      expect(options.role).toBe("@coder");
    });

    it("should not override existing options", () => {
      const policy = createStagePolicy("04-BUILD");
      const options = policy.applyToSearchOptions({
        query: "test",
        glob: "tests/**/*",
        contextLines: 1,
      });

      expect(options.glob).toBe("tests/**/*"); // Not overridden
      expect(options.contextLines).toBe(1); // Not overridden
    });
  });

  describe("getExcludePatterns", () => {
    it("should always include common excludes", () => {
      const policy = createPolicy();
      const excludes = policy.getExcludePatterns();

      expect(excludes).toContain("node_modules/**");
      expect(excludes).toContain("dist/**");
      expect(excludes).toContain(".git/**");
    });

    it("should include stage-specific excludes", () => {
      const policy = createStagePolicy("01-PLANNING");
      const excludes = policy.getExcludePatterns();

      expect(excludes).toContain("src/**/*.ts");
    });
  });

  describe("getTokenBudget", () => {
    it("should return role-specific budget", () => {
      const coderPolicy = createRolePolicy("@coder");
      expect(coderPolicy.getTokenBudget()).toBe(4000);

      const reviewerPolicy = createRolePolicy("@reviewer");
      expect(reviewerPolicy.getTokenBudget()).toBe(3500);
    });

    it("should return default budget without role", () => {
      const policy = createPolicy();
      expect(policy.getTokenBudget()).toBe(2500);
    });
  });

  describe("enrichResults", () => {
    it("should mark spec snapshot matches", () => {
      const policy = new RetrievalPolicy({
        specSnapshotPaths: ["src/api/routes.ts"],
      });

      const results: SearchResult[] = [
        {
          path: "src/api/routes.ts",
          line: 10,
          column: 0,
          content: "test",
          contextBefore: [],
          contextAfter: [],
          score: 100,
          ranking_reason: "default",
          provider: "ripgrep",
          specSnapshotMatch: false,
        },
        {
          path: "src/other.ts",
          line: 5,
          column: 0,
          content: "test",
          contextBefore: [],
          contextAfter: [],
          score: 90,
          ranking_reason: "default",
          provider: "ripgrep",
          specSnapshotMatch: false,
        },
      ];

      const enriched = policy.enrichResults(results);

      expect(enriched[0]!.specSnapshotMatch).toBe(true);
      expect(enriched[0]!.ranking_reason).toBe("spec_snapshot_match");
      expect(enriched[1]!.specSnapshotMatch).toBe(false);
    });

    it("should apply stage boost", () => {
      const policy = createStagePolicy("04-BUILD");

      const results: SearchResult[] = [
        {
          path: "src/utils/test.ts", // With subdirectory to match src/**/*.ts
          line: 10,
          column: 0,
          content: "test",
          contextBefore: [],
          contextAfter: [],
          score: 100,
          ranking_reason: "default",
          provider: "ripgrep",
          specSnapshotMatch: false,
        },
      ];

      const enriched = policy.enrichResults(results);

      expect(enriched[0]!.ranking_reason).toBe("stage_boost");
    });
  });
});

// ============================================================================
// Retrieval Logger Tests
// ============================================================================

describe("RetrievalLogger", () => {
  let logger: RetrievalLogger;
  const testConfig = {
    progressPath: "/tmp/test-session-progress.md",
    evidenceDir: "/tmp/test-evidence",
    maxEntries: 10,
    verbose: false,
  };

  beforeEach(() => {
    logger = createRetrievalLogger(testConfig);
  });

  afterEach(async () => {
    await logger.clearEvidence();
  });

  describe("logSearchEvidence", () => {
    it("should log evidence without throwing", async () => {
      const response: SearchResponse = {
        hits: [
          {
            path: "test.ts",
            line: 10,
            column: 0,
            content: "test content",
            contextBefore: [],
            contextAfter: [],
            score: 100,
            ranking_reason: "exact_match",
            provider: "ripgrep",
            specSnapshotMatch: false,
          },
        ],
        totalHits: 1,
        truncated: false,
        elapsed_ms: 50,
        provider: "ripgrep",
        providerVersion: "ripgrep 14.1.0",
        tokensUsed: 50,
      };

      // Should not throw
      await expect(
        logger.logSearchEvidence(response, "test query")
      ).resolves.not.toThrow();
    });
  });

  describe("getRecentEvidence", () => {
    it("should return empty array when no evidence", async () => {
      const recent = await logger.getRecentEvidence(5);
      expect(Array.isArray(recent)).toBe(true);
    });
  });

  describe("getSessionSummary", () => {
    it("should return summary with zeros when no evidence", async () => {
      const summary = await logger.getSessionSummary();

      expect(summary.totalSearches).toBe(0);
      expect(summary.totalHits).toBe(0);
      expect(summary.avgLatency).toBe(0);
      expect(summary.providers).toEqual({});
    });
  });
});

// ============================================================================
// Feature Flag Integration Tests
// ============================================================================

describe("Feature Flag Integration", () => {
  it("should have SEARCH_ENABLED flag available", async () => {
    const { isFeatureEnabled } = await import("../../config/feature-flags.js");
    expect(typeof isFeatureEnabled("SEARCH_ENABLED")).toBe("boolean");
  });

  it("should have RETRIEVAL_LOGGER flag available", async () => {
    const { isFeatureEnabled } = await import("../../config/feature-flags.js");
    expect(typeof isFeatureEnabled("RETRIEVAL_LOGGER")).toBe("boolean");
  });

  it("should have SEARCH_AST_GREP flag available", async () => {
    const { isFeatureEnabled } = await import("../../config/feature-flags.js");
    expect(typeof isFeatureEnabled("SEARCH_AST_GREP")).toBe("boolean");
  });
});
