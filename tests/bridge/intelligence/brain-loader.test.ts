/**
 * Tests for Brain L4 Loader — Sprint 87 (ADR-025)
 *
 * Covers: model loading, formatting, token budget, hashing, error handling.
 *
 * @module tests/bridge/intelligence/brain-loader
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

// ============================================================================
// Mocks
// ============================================================================

const mockGetAllModels = vi.fn();
const mockGetFormattedRules = vi.fn();

vi.mock("../../../src/brain/layers/mental-models.js", () => ({
  getAllModels: (...args: unknown[]) => mockGetAllModels(...args),
  getFormattedRules: (...args: unknown[]) => mockGetFormattedRules(...args),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { loadBrainL4, BRAIN_TOKEN_BUDGET } from "../../../src/bridge/intelligence/brain-loader.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockModel(domain: string, rule: string, confidence = 0.9) {
  return {
    id: `model_${Date.now()}`,
    domain,
    rule,
    source: "ceo_import" as const,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("loadBrainL4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Successful loading
  // --------------------------------------------------------------------------

  it("returns BrainEnvelope with formatted content when models exist", () => {
    mockGetAllModels.mockReturnValue([
      createMockModel("typescript", "Prefer const over let"),
      createMockModel("testing", "Use real implementations over mocks"),
    ]);
    mockGetFormattedRules.mockReturnValue(
      "[typescript] Prefer const over let (high)\n[testing] Use real implementations over mocks (high)",
    );

    const result = loadBrainL4();

    expect(result).not.toBeNull();
    expect(result!.content).toContain("[Brain L4 Mental Models]");
    expect(result!.content).toContain("[End Brain L4]");
    expect(result!.content).toContain("Prefer const over let");
    expect(result!.content).toContain("Use real implementations over mocks");
  });

  it("includes correct model count", () => {
    const models = [
      createMockModel("ts", "Rule 1"),
      createMockModel("ts", "Rule 2"),
      createMockModel("go", "Rule 3"),
    ];
    mockGetAllModels.mockReturnValue(models);
    mockGetFormattedRules.mockReturnValue("Rule 1\nRule 2\nRule 3");

    const result = loadBrainL4();

    expect(result!.modelCount).toBe(3);
  });

  it("sets source to 'mental-models.json'", () => {
    mockGetAllModels.mockReturnValue([createMockModel("ts", "Rule")]);
    mockGetFormattedRules.mockReturnValue("Rule (high)");

    const result = loadBrainL4();

    expect(result!.source).toBe("mental-models.json");
  });

  it("computes SHA256 hash of content", () => {
    mockGetAllModels.mockReturnValue([createMockModel("ts", "Rule")]);
    mockGetFormattedRules.mockReturnValue("Rule (high)");

    const result = loadBrainL4();

    const expectedHash = createHash("sha256")
      .update(result!.content)
      .digest("hex");
    expect(result!.contentHash).toBe(expectedHash);
    expect(result!.contentHash).toHaveLength(64);
  });

  // --------------------------------------------------------------------------
  // Empty / null returns
  // --------------------------------------------------------------------------

  it("returns null when no models exist", () => {
    mockGetAllModels.mockReturnValue([]);

    const result = loadBrainL4();

    expect(result).toBeNull();
  });

  it("returns null when getFormattedRules returns empty string", () => {
    mockGetAllModels.mockReturnValue([createMockModel("ts", "Rule")]);
    mockGetFormattedRules.mockReturnValue("");

    const result = loadBrainL4();

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Token budget
  // --------------------------------------------------------------------------

  it("caps content at BRAIN_TOKEN_BUDGET * 4 chars", () => {
    const longRule = "x".repeat(200);
    const models = Array.from({ length: 100 }, (_, i) =>
      createMockModel("domain", `Rule ${i}: ${longRule}`),
    );
    mockGetAllModels.mockReturnValue(models);
    mockGetFormattedRules.mockReturnValue(
      models.map((m) => m.rule).join("\n"),
    );

    const result = loadBrainL4();

    expect(result).not.toBeNull();
    expect(result!.content.length).toBeLessThanOrEqual(BRAIN_TOKEN_BUDGET * 4);
  });

  it("truncates at line boundary (no partial lines)", () => {
    const rules = Array.from({ length: 200 }, (_, i) => `Rule ${i}: Always follow best practices`);
    mockGetAllModels.mockReturnValue(
      rules.map((r) => createMockModel("domain", r)),
    );
    mockGetFormattedRules.mockReturnValue(rules.join("\n"));

    const result = loadBrainL4();

    const lines = result!.content.split("\n");
    // Every line should be complete (not truncated mid-line)
    for (const line of lines) {
      expect(line).not.toMatch(/^Rule \d+: Always follow best pract$/);
    }
    // Footer should be present
    expect(lines[lines.length - 1]).toBe("[End Brain L4]");
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  it("returns null on getAllModels error", () => {
    mockGetAllModels.mockImplementation(() => {
      throw new Error("Brain store corrupted");
    });

    const result = loadBrainL4();

    expect(result).toBeNull();
  });

  it("returns null on getFormattedRules error", () => {
    mockGetAllModels.mockReturnValue([createMockModel("ts", "Rule")]);
    mockGetFormattedRules.mockImplementation(() => {
      throw new Error("Formatting failed");
    });

    const result = loadBrainL4();

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  it("exports BRAIN_TOKEN_BUDGET as 2048", () => {
    expect(BRAIN_TOKEN_BUDGET).toBe(2048);
  });
});
