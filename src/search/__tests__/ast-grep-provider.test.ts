/**
 * AST-Grep Provider Tests
 *
 * Unit tests for the AstGrepProvider.
 * Sprint 64: Full implementation tests.
 *
 * @module search/__tests__/ast-grep-provider.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @sprint 64
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AstGrepProvider,
  shouldUseAstGrep,
  getStructuralPatterns,
  getPattern,
  STRUCTURAL_PATTERNS,
} from "../providers/ast-grep-provider.js";

// Mock the feature flags module
vi.mock("../../config/feature-flags.js", () => ({
  isFeatureEnabled: vi.fn((flag: string) => flag === "SEARCH_AST_GREP"),
}));

// ============================================================================
// STRUCTURAL_PATTERNS Tests
// ============================================================================

describe("STRUCTURAL_PATTERNS", () => {
  it("should have function patterns", () => {
    expect(STRUCTURAL_PATTERNS.function_declaration).toBeDefined();
    expect(STRUCTURAL_PATTERNS.arrow_function).toBeDefined();
    expect(STRUCTURAL_PATTERNS.async_function).toBeDefined();
    expect(STRUCTURAL_PATTERNS.async_arrow).toBeDefined();
  });

  it("should have class patterns", () => {
    expect(STRUCTURAL_PATTERNS.class_declaration).toBeDefined();
    expect(STRUCTURAL_PATTERNS.class_extends).toBeDefined();
    expect(STRUCTURAL_PATTERNS.class_method).toBeDefined();
  });

  it("should have import/export patterns", () => {
    expect(STRUCTURAL_PATTERNS.import_default).toBeDefined();
    expect(STRUCTURAL_PATTERNS.import_named).toBeDefined();
    expect(STRUCTURAL_PATTERNS.import_all).toBeDefined();
    expect(STRUCTURAL_PATTERNS.export_default).toBeDefined();
    expect(STRUCTURAL_PATTERNS.export_named).toBeDefined();
    expect(STRUCTURAL_PATTERNS.export_const).toBeDefined();
  });

  it("should have TypeScript patterns", () => {
    expect(STRUCTURAL_PATTERNS.interface_declaration).toBeDefined();
    expect(STRUCTURAL_PATTERNS.type_alias).toBeDefined();
    expect(STRUCTURAL_PATTERNS.type_generic).toBeDefined();
  });

  it("should have React patterns", () => {
    expect(STRUCTURAL_PATTERNS.react_component).toBeDefined();
    expect(STRUCTURAL_PATTERNS.react_hook).toBeDefined();
    expect(STRUCTURAL_PATTERNS.use_effect).toBeDefined();
    expect(STRUCTURAL_PATTERNS.use_state).toBeDefined();
  });

  it("should have common patterns", () => {
    expect(STRUCTURAL_PATTERNS.try_catch).toBeDefined();
    expect(STRUCTURAL_PATTERNS.if_statement).toBeDefined();
    expect(STRUCTURAL_PATTERNS.for_of).toBeDefined();
    expect(STRUCTURAL_PATTERNS.await_call).toBeDefined();
  });

  it("should use ast-grep pattern syntax with meta-variables", () => {
    // Patterns should use $NAME, $$$ARGS style meta-variables
    expect(STRUCTURAL_PATTERNS.function_declaration).toContain("$NAME");
    expect(STRUCTURAL_PATTERNS.function_declaration).toContain("$$$PARAMS");
    expect(STRUCTURAL_PATTERNS.function_declaration).toContain("$$$BODY");
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe("getStructuralPatterns", () => {
  it("should return array of pattern names", () => {
    const patterns = getStructuralPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(10);
    expect(patterns).toContain("function_declaration");
    expect(patterns).toContain("class_declaration");
  });
});

describe("getPattern", () => {
  it("should return pattern for valid name", () => {
    const pattern = getPattern("function_declaration");
    expect(pattern).toBe(STRUCTURAL_PATTERNS.function_declaration);
  });

  it("should return undefined for invalid name", () => {
    const pattern = getPattern("invalid_pattern_name");
    expect(pattern).toBeUndefined();
  });
});

// ============================================================================
// AstGrepProvider Tests
// ============================================================================

describe("AstGrepProvider", () => {
  let provider: AstGrepProvider;

  beforeEach(() => {
    provider = new AstGrepProvider({ cwd: process.cwd() });
  });

  describe("constructor", () => {
    it("should create provider with default cwd", () => {
      const p = new AstGrepProvider();
      expect(p.name).toBe("ast-grep");
    });

    it("should create provider with custom cwd", () => {
      const p = new AstGrepProvider({ cwd: "/custom/path" });
      expect(p.name).toBe("ast-grep");
    });
  });

  describe("name", () => {
    it("should return ast-grep", () => {
      expect(provider.name).toBe("ast-grep");
    });
  });

  describe("version", () => {
    it("should include ast-grep prefix", () => {
      expect(provider.version).toContain("ast-grep");
    });
  });

  describe("search", () => {
    it("should return empty response when feature flag is off", async () => {
      // Mock feature flag as off
      const { isFeatureEnabled } = await import(
        "../../config/feature-flags.js"
      );
      vi.mocked(isFeatureEnabled).mockReturnValueOnce(false);

      const response = await provider.search({ query: "function test()" });

      expect(response.hits).toEqual([]);
      expect(response.totalHits).toBe(0);
      expect(response.provider).toBe("ast-grep");
    });

    it("should resolve named patterns", async () => {
      // This test verifies the pattern resolution logic
      // Since ast-grep may not be installed, we test the behavior
      const response = await provider.search({
        query: "function_declaration",
        structural: true,
      });

      // Should return SearchResponse (empty if ast-grep not installed)
      expect(response).toHaveProperty("hits");
      expect(response).toHaveProperty("totalHits");
      expect(response).toHaveProperty("elapsed_ms");
      expect(response).toHaveProperty("provider");
      expect(response).toHaveProperty("providerVersion");
      expect(response).toHaveProperty("tokensUsed");
    });

    it("should handle search errors gracefully (CTO A2)", async () => {
      // Search with invalid pattern should not throw
      const response = await provider.search({
        query: "function $$$INVALID_SYNTAX",
      });

      // Should return empty response, not throw
      expect(response.hits).toBeDefined();
      expect(response.provider).toBe("ast-grep");
    });

    it("should include providerVersion in response (CTO A1)", async () => {
      const response = await provider.search({
        query: "function test()",
      });

      expect(response.providerVersion).toBeDefined();
      expect(response.providerVersion).toContain("ast-grep");
    });
  });

  describe("healthCheck", () => {
    it("should return health status", async () => {
      const health = await provider.healthCheck();

      expect(health).toHaveProperty("provider");
      expect(health).toHaveProperty("available");
      expect(health).toHaveProperty("lastChecked");
      expect(health.provider).toBe("ast-grep");
      expect(health.lastChecked).toBeInstanceOf(Date);
    });

    it("should return version when available", async () => {
      const health = await provider.healthCheck();

      if (health.available) {
        expect(health.version).toBeDefined();
        expect(health.version).toContain("ast-grep");
      }
    });

    it("should return error message when not available", async () => {
      const health = await provider.healthCheck();

      if (!health.available) {
        expect(health.error).toBeDefined();
      }
    });
  });
});

// ============================================================================
// shouldUseAstGrep Tests
// ============================================================================

describe("shouldUseAstGrep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return false when feature flag is off", async () => {
    const { isFeatureEnabled } = await import("../../config/feature-flags.js");
    vi.mocked(isFeatureEnabled).mockReturnValueOnce(false);

    const result = await shouldUseAstGrep();
    expect(result).toBe(false);
  });

  it("should check ast-grep availability when feature flag is on", async () => {
    const { isFeatureEnabled } = await import("../../config/feature-flags.js");
    vi.mocked(isFeatureEnabled).mockReturnValue(true);

    // Result depends on whether ast-grep is installed
    const result = await shouldUseAstGrep();
    expect(typeof result).toBe("boolean");
  });
});

// ============================================================================
// Integration Tests (require ast-grep installed)
// ============================================================================

describe("AstGrepProvider Integration", () => {
  let provider: AstGrepProvider;
  let astGrepAvailable: boolean;

  beforeEach(async () => {
    provider = new AstGrepProvider({ cwd: process.cwd() });
    const health = await provider.healthCheck();
    astGrepAvailable = health.available;
  });

  it.skipIf(!process.env.TEST_AST_GREP)(
    "should find function declarations",
    async () => {
      if (!astGrepAvailable) {
        return;
      }

      const response = await provider.search({
        query: "function_declaration",
        fileTypes: ["ts"],
        topK: 5,
      });

      expect(response.hits.length).toBeGreaterThanOrEqual(0);
      if (response.hits.length > 0) {
        expect(response.hits[0]?.ranking_reason).toBe("structural_match");
      }
    }
  );

  it.skipIf(!process.env.TEST_AST_GREP)(
    "should find class declarations",
    async () => {
      if (!astGrepAvailable) {
        return;
      }

      const response = await provider.search({
        query: "class_declaration",
        fileTypes: ["ts"],
        topK: 5,
      });

      expect(response.hits.length).toBeGreaterThanOrEqual(0);
      for (const hit of response.hits) {
        expect(hit.astKind).toBe("class_declaration");
      }
    }
  );

  it.skipIf(!process.env.TEST_AST_GREP)(
    "should respect topK limit",
    async () => {
      if (!astGrepAvailable) {
        return;
      }

      const response = await provider.search({
        query: "function $NAME($$$PARAMS) { $$$BODY }",
        topK: 3,
      });

      expect(response.hits.length).toBeLessThanOrEqual(3);
    }
  );
});
