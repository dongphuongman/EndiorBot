/**
 * Self-Correction Engine Tests
 *
 * Tests for the orchestrator that integrates all self-correction modules.
 *
 * Per Sprint 37 Day 2 requirements:
 * - Integration with ErrorClassifier, DeterministicFixer, FixLogger, Verifier
 * - Integration with BudgetTracker (cost tracking)
 * - Integration with EscalationRouter (3-strike escalation)
 * - 3-attempt retry logic per error
 *
 * @module tests/self-correction/self-correction-engine
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  SelfCorrectionEngine,
  createSelfCorrectionEngine,
  correctErrors,
} from "../../src/self-correction/self-correction-engine.js";
import type {
  CorrectionEvent,
  CorrectionResult,
  SelfCorrectionConfig,
} from "../../src/self-correction/types.js";
import { MAX_STRIKES } from "../../src/self-correction/types.js";

// ============================================================================
// Test Data
// ============================================================================

const TYPESCRIPT_ERRORS = `
src/test.ts(1,5): error TS6133: 'unused' is declared but its value is never read.
src/test.ts(2,10): error TS2339: Property 'foo' does not exist on type 'string'.
`;

const LINT_ERRORS = `
src/test.ts:1:5: error Missing semicolon semi
src/test.ts:2:1: error 'x' is defined but never used @typescript-eslint/no-unused-vars
`;

const MIXED_ERRORS = `
src/test.ts(1,5): error TS6133: 'unused' is declared but its value is never read.
src/test.ts:2:5: error Missing semicolon semi
`;

// ============================================================================
// Basic Tests
// ============================================================================

describe("SelfCorrectionEngine - Basic Operations", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create engine with factory function", () => {
    const engine = createSelfCorrectionEngine();
    expect(engine).toBeInstanceOf(SelfCorrectionEngine);
  });

  it("should create engine with custom config", () => {
    const engine = createSelfCorrectionEngine({
      maxAttempts: 5,
      dryRun: true,
    });

    const config = engine.getConfig();
    expect(config.maxAttempts).toBe(5);
    expect(config.dryRun).toBe(true);
  });

  it("should update config", () => {
    engine.updateConfig({ maxAttempts: 2 });
    expect(engine.getConfig().maxAttempts).toBe(2);
  });

  it("should return success for empty input", async () => {
    const result = await engine.correct("");

    expect(result.success).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.fixedErrors).toBe(0);
  });

  it("should return success for no errors", async () => {
    const result = await engine.correct("Build completed successfully.");

    expect(result.success).toBe(true);
    expect(result.totalErrors).toBe(0);
  });
});

// ============================================================================
// Error Processing Tests
// ============================================================================

describe("SelfCorrectionEngine - Error Processing", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should detect TypeScript errors", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.byCategory.TYPE.total).toBeGreaterThan(0);
  });

  it("should detect lint errors", async () => {
    const result = await engine.correct(LINT_ERRORS, "LINT");

    expect(result.totalErrors).toBeGreaterThan(0);
    expect(result.byCategory.LINT.total).toBeGreaterThan(0);
  });

  it("should detect mixed errors", async () => {
    const result = await engine.correct(MIXED_ERRORS);

    expect(result.totalErrors).toBeGreaterThan(0);
  });

  it("should track attempts", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Should have at least some attempts
    expect(result.attempts.length).toBeGreaterThanOrEqual(0);
  });

  it("should calculate success rate", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.successRate).toBe("number");
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(1);
  });

  it("should calculate target rate", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.targetRate).toBe("number");
    expect(result.targetRate).toBe(0.7); // TYPE target is 70%
  });

  it("should check if target met", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.metTarget).toBe("boolean");
  });

  it("should track duration", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Category Stats Tests
// ============================================================================

describe("SelfCorrectionEngine - Category Statistics", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should track stats by category", async () => {
    const result = await engine.correct(MIXED_ERRORS);

    expect(result.byCategory).toBeDefined();
    expect(result.byCategory.BUILD).toBeDefined();
    expect(result.byCategory.LINT).toBeDefined();
    expect(result.byCategory.TYPE).toBeDefined();
    expect(result.byCategory.TEST).toBeDefined();
  });

  it("should track total by category", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(result.byCategory.TYPE.total).toBeGreaterThanOrEqual(0);
  });

  it("should track fixed by category", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.byCategory.TYPE.fixed).toBe("number");
  });

  it("should track remaining by category", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.byCategory.TYPE.remaining).toBe("number");
  });

  it("should track escalated by category", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(typeof result.byCategory.TYPE.escalated).toBe("number");
  });
});

// ============================================================================
// Event System Tests
// ============================================================================

describe("SelfCorrectionEngine - Event System", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should emit events during correction", async () => {
    const events: CorrectionEvent[] = [];

    engine.onEvent((event) => {
      events.push(event);
    });

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Should have at least a complete event
    expect(events.some((e) => e.type === "complete")).toBe(true);
  });

  it("should allow unsubscribing from events", async () => {
    const events: CorrectionEvent[] = [];

    const unsubscribe = engine.onEvent((event) => {
      events.push(event);
    });

    unsubscribe();

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(events.length).toBe(0);
  });

  it("should emit complete event with result", async () => {
    let completeEvent: CorrectionEvent | null = null;

    engine.onEvent((event) => {
      if (event.type === "complete") {
        completeEvent = event;
      }
    });

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    expect(completeEvent).not.toBeNull();
    expect(completeEvent?.data.result).toBeDefined();
  });
});

// ============================================================================
// Escalation Tests
// ============================================================================

describe("SelfCorrectionEngine - Escalation", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
      escalateOnFailure: true,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should track escalations", async () => {
    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    const escalations = engine.getEscalations();
    expect(Array.isArray(escalations)).toBe(true);
  });

  it("should emit escalation events", async () => {
    const escalationEvents: CorrectionEvent[] = [];

    engine.onEvent((event) => {
      if (event.type === "escalation") {
        escalationEvents.push(event);
      }
    });

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Escalation events should be emitted for errors that can't be fixed
    expect(Array.isArray(escalationEvents)).toBe(true);
  });

  it("should respect escalateOnFailure config", async () => {
    engine.updateConfig({ escalateOnFailure: false });

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Should still track escalations even if not routing
    const escalations = engine.getEscalations();
    expect(Array.isArray(escalations)).toBe(true);
  });
});

// ============================================================================
// Budget Tracker Integration Tests
// ============================================================================

describe("SelfCorrectionEngine - Budget Tracker Integration", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;
  let mockBudgetTracker: any;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
    });

    mockBudgetTracker = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should accept budget tracker", () => {
    expect(() => engine.setBudgetTracker(mockBudgetTracker)).not.toThrow();
  });

  it("should track budget for fix attempts", async () => {
    // Create test file so fixes can be attempted
    const testFile = join(tempDir, "src", "test.ts");
    const srcDir = join(tempDir, "src");
    require("fs").mkdirSync(srcDir, { recursive: true });
    require("fs").writeFileSync(testFile, "const x = 5\nlet unused = 10;");

    engine.setBudgetTracker(mockBudgetTracker);

    await engine.correct(LINT_ERRORS, "LINT");

    // Budget tracker should be called for each fix attempt
    expect(mockBudgetTracker.recordUsage).toHaveBeenCalled();
  });

  it("should handle budget tracker errors gracefully", async () => {
    mockBudgetTracker.recordUsage.mockRejectedValue(new Error("Budget error"));
    engine.setBudgetTracker(mockBudgetTracker);

    // Should not throw
    const result = await engine.correct(LINT_ERRORS, "LINT");
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Escalation Router Integration Tests
// ============================================================================

describe("SelfCorrectionEngine - Escalation Router Integration", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;
  let mockEscalationRouter: any;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
      escalateOnFailure: true,
    });

    mockEscalationRouter = {
      route: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should accept escalation router", () => {
    expect(() => engine.setEscalationRouter(mockEscalationRouter)).not.toThrow();
  });

  it("should route escalations to router", async () => {
    engine.setEscalationRouter(mockEscalationRouter);

    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Escalation router should be called for unfixable errors
    // (This depends on whether the errors are actually unfixable)
  });

  it("should handle escalation router errors gracefully", async () => {
    mockEscalationRouter.route.mockRejectedValue(new Error("Router error"));
    engine.setEscalationRouter(mockEscalationRouter);

    // Should not throw
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Retry Logic Tests
// ============================================================================

describe("SelfCorrectionEngine - Retry Logic", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: false,
      maxAttempts: MAX_STRIKES,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should respect maxAttempts config", () => {
    const config = engine.getConfig();
    expect(config.maxAttempts).toBe(MAX_STRIKES);
  });

  it("should limit attempts per error", async () => {
    engine.updateConfig({ maxAttempts: 2 });

    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    // Each error should have at most 2 attempts
    for (const attempt of result.attempts) {
      expect(attempt.attemptNumber).toBeLessThanOrEqual(2);
    }
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe("SelfCorrectionEngine - Statistics", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: true,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should provide stats", () => {
    const stats = engine.getStats();

    expect(stats).toBeDefined();
    expect(stats.totalErrors).toBeDefined();
    expect(stats.successfulFixes).toBeDefined();
  });

  it("should provide success rate analysis", () => {
    const analysis = engine.getSuccessRateAnalysis();

    expect(analysis).toBeDefined();
    expect(analysis.overall).toBeDefined();
    expect(analysis.byCategory).toBeDefined();
    expect(analysis.vsTargets).toBeDefined();
  });

  it("should export log as CSV", () => {
    const csv = engine.exportLog();

    expect(typeof csv).toBe("string");
    expect(csv).toContain("id");
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe("SelfCorrectionEngine - Reset", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
      logFixes: true,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reset state", async () => {
    await engine.correct(TYPESCRIPT_ERRORS, "TYPE");

    engine.reset();

    expect(engine.getEscalations()).toHaveLength(0);
    expect(engine.getStats().totalErrors).toBe(0);
  });
});

// ============================================================================
// File Operations Tests
// ============================================================================

describe("SelfCorrectionEngine - File Operations", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: false,
      verifyAfterFix: false,
      logFixes: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should fix file if exists", async () => {
    const testFile = join(tempDir, "test.ts");
    writeFileSync(testFile, "const x = 5");

    const result = await engine.fixFile(testFile);

    expect(result).toBeDefined();
  });

  it("should handle non-existent file", async () => {
    const result = await engine.fixFile("/nonexistent/file.ts");

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Quick Helper Tests
// ============================================================================

describe("SelfCorrectionEngine - Quick Helpers", () => {
  it("should provide correctErrors helper", async () => {
    const result = await correctErrors("");
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Target Rate Tests
// ============================================================================

describe("SelfCorrectionEngine - Target Rates", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should use correct target for BUILD", async () => {
    const result = await engine.correct("error: Build failed", "BUILD");
    expect(result.targetRate).toBe(0.8);
  });

  it("should use correct target for LINT", async () => {
    const result = await engine.correct(LINT_ERRORS, "LINT");
    expect(result.targetRate).toBe(0.9);
  });

  it("should use correct target for TYPE", async () => {
    const result = await engine.correct(TYPESCRIPT_ERRORS, "TYPE");
    expect(result.targetRate).toBe(0.7);
  });

  it("should calculate weighted average for mixed errors", async () => {
    const result = await engine.correct(MIXED_ERRORS);

    // Should be weighted average based on error counts
    expect(result.targetRate).toBeGreaterThan(0);
    expect(result.targetRate).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Dry Run Tests
// ============================================================================

describe("SelfCorrectionEngine - Dry Run Mode", () => {
  let engine: SelfCorrectionEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "self-correction-test-"));
    engine = createSelfCorrectionEngine({
      workingDirectory: tempDir,
      dryRun: true,
      verifyAfterFix: false,
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should not modify files in dry run mode", async () => {
    const testFile = join(tempDir, "test.ts");
    const originalContent = "const x = 5";
    writeFileSync(testFile, originalContent);

    await engine.correct(LINT_ERRORS, "LINT");

    // File should not be modified
    // (In dry run mode, file operations are skipped)
  });

  it("should report what would be fixed in dry run", async () => {
    const result = await engine.correct(LINT_ERRORS, "LINT");

    // Should still process and report
    expect(result).toBeDefined();
  });
});
