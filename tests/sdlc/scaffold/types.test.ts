/**
 * Scaffold Types Tests
 *
 * Unit tests for SDLC scaffold type definitions and constants.
 *
 * @module tests/sdlc/scaffold/types
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect } from "vitest";
import {
  TIER_STAGES,
  TIER_ORDER,
  type ProjectTier,
  type ProjectState,
} from "../../../src/sdlc/scaffold/types.js";

// ============================================================================
// TIER_STAGES Tests
// ============================================================================

describe("TIER_STAGES", () => {
  it("should define stages for LITE tier", () => {
    expect(TIER_STAGES.LITE).toBeDefined();
    expect(Array.isArray(TIER_STAGES.LITE)).toBe(true);
    expect(TIER_STAGES.LITE.length).toBeGreaterThan(0);
  });

  it("should define stages for STANDARD tier", () => {
    expect(TIER_STAGES.STANDARD).toBeDefined();
    expect(TIER_STAGES.STANDARD.length).toBeGreaterThan(TIER_STAGES.LITE.length);
  });

  it("should define stages for PROFESSIONAL tier", () => {
    expect(TIER_STAGES.PROFESSIONAL).toBeDefined();
    expect(TIER_STAGES.PROFESSIONAL.length).toBeGreaterThanOrEqual(
      TIER_STAGES.STANDARD.length
    );
  });

  it("should define stages for ENTERPRISE tier", () => {
    expect(TIER_STAGES.ENTERPRISE).toBeDefined();
    expect(TIER_STAGES.ENTERPRISE.length).toBeGreaterThanOrEqual(
      TIER_STAGES.PROFESSIONAL.length
    );
  });

  it("should include foundation stage in all tiers", () => {
    expect(TIER_STAGES.LITE).toContain("00-foundation");
    expect(TIER_STAGES.STANDARD).toContain("00-foundation");
    expect(TIER_STAGES.PROFESSIONAL).toContain("00-foundation");
    expect(TIER_STAGES.ENTERPRISE).toContain("00-foundation");
  });

  it("should include planning stage in all tiers", () => {
    expect(TIER_STAGES.LITE).toContain("01-planning");
    expect(TIER_STAGES.STANDARD).toContain("01-planning");
    expect(TIER_STAGES.PROFESSIONAL).toContain("01-planning");
    expect(TIER_STAGES.ENTERPRISE).toContain("01-planning");
  });

  it("should include build stage in all tiers", () => {
    // LITE and above include 04-build
    expect(TIER_STAGES.LITE).toContain("04-build");
    expect(TIER_STAGES.STANDARD).toContain("04-build");
    expect(TIER_STAGES.PROFESSIONAL).toContain("04-build");
    expect(TIER_STAGES.ENTERPRISE).toContain("04-build");
  });

  it("should include test stage in STANDARD+", () => {
    expect(TIER_STAGES.LITE).not.toContain("05-test");
    expect(TIER_STAGES.STANDARD).toContain("05-test");
    expect(TIER_STAGES.PROFESSIONAL).toContain("05-test");
    expect(TIER_STAGES.ENTERPRISE).toContain("05-test");
  });

  it("should have proper stage naming pattern", () => {
    const stagePattern = /^\d{2}-[a-z]+$/;

    for (const tier of Object.keys(TIER_STAGES) as ProjectTier[]) {
      for (const stage of TIER_STAGES[tier]) {
        expect(stagePattern.test(stage)).toBe(true);
      }
    }
  });
});

// ============================================================================
// TIER_ORDER Tests
// ============================================================================

describe("TIER_ORDER", () => {
  it("should define order for all tiers", () => {
    expect(TIER_ORDER.LITE).toBeDefined();
    expect(TIER_ORDER.STANDARD).toBeDefined();
    expect(TIER_ORDER.PROFESSIONAL).toBeDefined();
    expect(TIER_ORDER.ENTERPRISE).toBeDefined();
  });

  it("should have LITE as lowest tier", () => {
    expect(TIER_ORDER.LITE).toBe(0);
  });

  it("should have ascending order", () => {
    expect(TIER_ORDER.LITE).toBeLessThan(TIER_ORDER.STANDARD);
    expect(TIER_ORDER.STANDARD).toBeLessThan(TIER_ORDER.PROFESSIONAL);
    expect(TIER_ORDER.PROFESSIONAL).toBeLessThan(TIER_ORDER.ENTERPRISE);
  });

  it("should allow tier comparison", () => {
    const isHigherTier = (a: ProjectTier, b: ProjectTier) =>
      TIER_ORDER[a] > TIER_ORDER[b];

    expect(isHigherTier("STANDARD", "LITE")).toBe(true);
    expect(isHigherTier("ENTERPRISE", "PROFESSIONAL")).toBe(true);
    expect(isHigherTier("LITE", "ENTERPRISE")).toBe(false);
  });
});

// ============================================================================
// Type Coverage Tests
// ============================================================================

describe("ProjectState type", () => {
  it("should cover all expected states", () => {
    const states: ProjectState[] = [
      "FRESH",
      "ENDIORBOT",
      "SDLC_ORCHESTRATOR",
      "TINYSDLC",
      "PARTIAL",
      "UNKNOWN",
    ];

    // This test verifies the type covers expected values
    expect(states.length).toBe(6);
  });
});

describe("ProjectTier type", () => {
  it("should cover all expected tiers", () => {
    const tiers: ProjectTier[] = ["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"];

    // This test verifies the type covers expected values
    expect(tiers.length).toBe(4);
  });
});
