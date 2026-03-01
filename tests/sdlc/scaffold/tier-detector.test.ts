/**
 * Tier Detector Tests
 *
 * Unit tests for project tier detection from docs/ structure.
 *
 * @module tests/sdlc/scaffold/tier-detector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectTierFromDocs,
  compareTiers,
  isTierAtLeast,
  maxTier,
  getStagesForTier,
  getMissingStages,
  getExtraStages,
  isValidStage,
  getStageNumber,
  getStageName,
  formatStageName,
  getStageQuestion,
} from "../../../src/sdlc/scaffold/tier-detector.js";
import type { ProjectTier } from "../../../src/sdlc/scaffold/types.js";

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(tmpdir(), "endiorbot-tier-test-" + Date.now());

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// detectTierFromDocs Tests
// ============================================================================

describe("detectTierFromDocs", () => {
  it("should return undefined when docs/ does not exist", () => {
    const result = detectTierFromDocs(TEST_DIR);
    expect(result).toBeUndefined();
  });

  it("should return undefined when docs/ has no stage directories", () => {
    mkdirSync(join(TEST_DIR, "docs"));
    const result = detectTierFromDocs(TEST_DIR);
    expect(result).toBeUndefined();
  });

  it("should detect LITE tier with minimal stages", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "01-planning"));
    mkdirSync(join(docsDir, "02-design"));

    const result = detectTierFromDocs(TEST_DIR);
    expect(result).toBe("LITE");
  });

  it("should detect STANDARD tier with all STANDARD stages", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    // STANDARD requires: foundation, planning, design, build, test, deploy, collaborate
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "01-planning"));
    mkdirSync(join(docsDir, "02-design"));
    mkdirSync(join(docsDir, "04-build"));
    mkdirSync(join(docsDir, "05-test"));
    mkdirSync(join(docsDir, "06-deploy"));
    mkdirSync(join(docsDir, "08-collaborate"));

    const result = detectTierFromDocs(TEST_DIR);
    expect(result).toBe("STANDARD");
  });

  it("should ignore non-stage directories", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "01-planning"));
    mkdirSync(join(docsDir, "random-folder")); // Should be ignored
    mkdirSync(join(docsDir, "images")); // Should be ignored

    const result = detectTierFromDocs(TEST_DIR);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// compareTiers Tests
// ============================================================================

describe("compareTiers", () => {
  it("should return positive when first tier is higher", () => {
    expect(compareTiers("STANDARD", "LITE")).toBeGreaterThan(0);
    expect(compareTiers("ENTERPRISE", "PROFESSIONAL")).toBeGreaterThan(0);
  });

  it("should return negative when first tier is lower", () => {
    expect(compareTiers("LITE", "STANDARD")).toBeLessThan(0);
    expect(compareTiers("PROFESSIONAL", "ENTERPRISE")).toBeLessThan(0);
  });

  it("should return zero when tiers are equal", () => {
    expect(compareTiers("STANDARD", "STANDARD")).toBe(0);
    expect(compareTiers("ENTERPRISE", "ENTERPRISE")).toBe(0);
  });
});

// ============================================================================
// isTierAtLeast Tests
// ============================================================================

describe("isTierAtLeast", () => {
  it("should return true when actual tier meets requirement", () => {
    expect(isTierAtLeast("STANDARD", "STANDARD")).toBe(true);
    expect(isTierAtLeast("PROFESSIONAL", "STANDARD")).toBe(true);
    expect(isTierAtLeast("ENTERPRISE", "LITE")).toBe(true);
  });

  it("should return false when actual tier is below requirement", () => {
    expect(isTierAtLeast("LITE", "STANDARD")).toBe(false);
    expect(isTierAtLeast("STANDARD", "PROFESSIONAL")).toBe(false);
    expect(isTierAtLeast("PROFESSIONAL", "ENTERPRISE")).toBe(false);
  });
});

// ============================================================================
// maxTier Tests
// ============================================================================

describe("maxTier", () => {
  it("should return the higher tier", () => {
    expect(maxTier("LITE", "STANDARD")).toBe("STANDARD");
    expect(maxTier("PROFESSIONAL", "STANDARD")).toBe("PROFESSIONAL");
    expect(maxTier("ENTERPRISE", "LITE")).toBe("ENTERPRISE");
  });

  it("should return either when tiers are equal", () => {
    expect(maxTier("STANDARD", "STANDARD")).toBe("STANDARD");
  });
});

// ============================================================================
// getStagesForTier Tests
// ============================================================================

describe("getStagesForTier", () => {
  it("should return stages for LITE tier", () => {
    const stages = getStagesForTier("LITE");
    expect(stages).toContain("00-foundation");
    expect(stages).toContain("01-planning");
    expect(stages).toContain("04-build"); // LITE includes build
    expect(stages).not.toContain("05-test"); // But not test
  });

  it("should return stages for STANDARD tier", () => {
    const stages = getStagesForTier("STANDARD");
    expect(stages).toContain("00-foundation");
    expect(stages).toContain("04-build");
    expect(stages).toContain("05-test");
  });

  it("should return a copy, not the original array", () => {
    const stages1 = getStagesForTier("LITE");
    const stages2 = getStagesForTier("LITE");
    expect(stages1).not.toBe(stages2);
    expect(stages1).toEqual(stages2);
  });
});

// ============================================================================
// getMissingStages Tests
// ============================================================================

describe("getMissingStages", () => {
  it("should return all stages when none exist", () => {
    const missing = getMissingStages("LITE", []);
    expect(missing.length).toBeGreaterThan(0);
  });

  it("should return empty when all stages exist", () => {
    const existing = getStagesForTier("LITE");
    const missing = getMissingStages("LITE", existing);
    expect(missing).toEqual([]);
  });

  it("should return only missing stages", () => {
    const existing = ["00-foundation", "01-planning"];
    const missing = getMissingStages("LITE", existing);
    expect(missing).not.toContain("00-foundation");
    expect(missing).not.toContain("01-planning");
  });
});

// ============================================================================
// getExtraStages Tests
// ============================================================================

describe("getExtraStages", () => {
  it("should return extra stages not required for tier", () => {
    // LITE includes: foundation, planning, design, build
    // Adding test (05-test) is extra for LITE
    const existing = ["00-foundation", "01-planning", "04-build", "05-test"];
    const extra = getExtraStages("LITE", existing);
    expect(extra).toContain("05-test");
  });

  it("should return empty when no extra stages", () => {
    const existing = getStagesForTier("LITE");
    const extra = getExtraStages("LITE", existing);
    expect(extra).toEqual([]);
  });
});

// ============================================================================
// isValidStage Tests
// ============================================================================

describe("isValidStage", () => {
  it("should accept valid stage names", () => {
    expect(isValidStage("00-foundation")).toBe(true);
    expect(isValidStage("04-build")).toBe(true);
    expect(isValidStage("10-archive")).toBe(true);
  });

  it("should reject invalid stage names", () => {
    expect(isValidStage("foundation")).toBe(false);
    expect(isValidStage("0-build")).toBe(false);
    expect(isValidStage("build-04")).toBe(false);
    expect(isValidStage("04-Build")).toBe(false); // uppercase not allowed
    expect(isValidStage("04-build-extra")).toBe(false);
  });
});

// ============================================================================
// getStageNumber Tests
// ============================================================================

describe("getStageNumber", () => {
  it("should extract stage number", () => {
    expect(getStageNumber("00-foundation")).toBe("00");
    expect(getStageNumber("04-build")).toBe("04");
    expect(getStageNumber("10-archive")).toBe("10");
  });

  it("should return undefined for invalid stage", () => {
    expect(getStageNumber("foundation")).toBeUndefined();
    expect(getStageNumber("invalid")).toBeUndefined();
  });
});

// ============================================================================
// getStageName Tests
// ============================================================================

describe("getStageName", () => {
  it("should extract stage name", () => {
    expect(getStageName("00-foundation")).toBe("foundation");
    expect(getStageName("04-build")).toBe("build");
    expect(getStageName("08-collaborate")).toBe("collaborate");
  });

  it("should return undefined for invalid stage", () => {
    expect(getStageName("foundation")).toBeUndefined();
    expect(getStageName("invalid")).toBeUndefined();
  });
});

// ============================================================================
// formatStageName Tests
// ============================================================================

describe("formatStageName", () => {
  it("should capitalize stage name", () => {
    expect(formatStageName("00-foundation")).toBe("Foundation");
    expect(formatStageName("04-build")).toBe("Build");
    expect(formatStageName("08-collaborate")).toBe("Collaborate");
  });

  it("should return original for invalid stage", () => {
    expect(formatStageName("invalid")).toBe("invalid");
  });
});

// ============================================================================
// getStageQuestion Tests
// ============================================================================

describe("getStageQuestion", () => {
  it("should return question for known stages", () => {
    expect(getStageQuestion("00-foundation")).toBe("WHY?");
    expect(getStageQuestion("01-planning")).toBe("WHAT?");
    expect(getStageQuestion("02-design")).toBe("HOW?");
    expect(getStageQuestion("04-build")).toBe("Building right?");
  });

  it("should return empty string for unknown stages", () => {
    expect(getStageQuestion("99-unknown")).toBe("");
  });
});
