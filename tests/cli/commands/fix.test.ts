/**
 * Fix CLI Command Tests
 *
 * Tests for fix and fix-stats CLI commands.
 *
 * Per CTO Day 5-7 guidance:
 * - fix command supports stdin and --run modes
 * - --dry-run is mandatory for preview
 * - EXPERIMENTAL fixes require --allow-experimental flag
 * - fix-stats shows success rates vs targets
 *
 * @module tests/cli/commands/fix
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 5-7
 * @authority ADR-007 Budget Control, Phase 3
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerFixCommand } from "../../../src/cli/commands/fix.js";
import { registerFixStatsCommand } from "../../../src/cli/commands/fix-stats.js";
import {
  createFixLogger,
  type FixLoggerConfig,
} from "../../../src/self-correction/fix-logger.js";
import type { FixResult, ProposedFix } from "../../../src/self-correction/types.js";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Create a test program with fix commands.
 */
function createFixTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerFixCommand(program);
  return program;
}

/**
 * Create a test program with fix-stats command.
 */
function createStatsTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerFixStatsCommand(program);
  return program;
}

/**
 * Create a temporary directory.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fix-cli-test-"));
}

/**
 * Create a mock fix result.
 */
function createMockFixResult(
  category: "BUILD" | "LINT" | "TYPE" | "TEST",
  status: "success" | "failed" | "skipped" = "success",
  confidence: "high" | "medium" | "low" | "experimental" = "high"
): FixResult {
  const fix: ProposedFix = {
    id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    error: {
      category,
      code: `${category}001`,
      message: `Mock ${category} error`,
      filePath: "src/test.ts",
      line: 10,
      column: 5,
      raw: `Error: Mock ${category} error at src/test.ts:10:5`,
    },
    type: "auto",
    confidence,
    description: `Fix for ${category} error`,
    filePath: "src/test.ts",
    line: 10,
    originalCode: "const x = 1",
    fixedCode: "const x: number = 1",
    isMultiLine: false,
  };

  return {
    fix,
    status,
    duration: 100,
    verified: status === "success",
    strikes: status === "failed" ? 1 : 0,
  };
}

// ============================================================================
// Fix Command Registration
// ============================================================================

describe("Fix Command Registration", () => {
  it("should register fix command", () => {
    const program = createFixTestProgram();
    const fixCmd = program.commands.find((cmd) => cmd.name() === "fix");
    expect(fixCmd).toBeDefined();
  });

  it("should have required options", () => {
    const program = createFixTestProgram();
    const fixCmd = program.commands.find((cmd) => cmd.name() === "fix");
    expect(fixCmd).toBeDefined();

    const options = fixCmd!.options.map((opt) => opt.long);
    expect(options).toContain("--run");
    expect(options).toContain("--dry-run");
    expect(options).toContain("--category");
    expect(options).toContain("--allow-experimental");
    expect(options).toContain("--verbose");
  });
});

// ============================================================================
// Fix-Stats Command Registration
// ============================================================================

describe("Fix-Stats Command Registration", () => {
  it("should register fix-stats command", () => {
    const program = createStatsTestProgram();
    const statsCmd = program.commands.find((cmd) => cmd.name() === "fix-stats");
    expect(statsCmd).toBeDefined();
  });

  it("should have required options", () => {
    const program = createStatsTestProgram();
    const statsCmd = program.commands.find((cmd) => cmd.name() === "fix-stats");
    expect(statsCmd).toBeDefined();

    const options = statsCmd!.options.map((opt) => opt.long);
    expect(options).toContain("--category");
    expect(options).toContain("--session");
    expect(options).toContain("--export");
    expect(options).toContain("--verbose");
  });
});

// ============================================================================
// Fix Logger Integration
// ============================================================================

describe("Fix Logger Integration", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create logger with custom path", () => {
    const logger = createFixLogger({ logPath });
    expect(logger.getConfig().logPath).toBe(logPath);
  });

  it("should log fix results", () => {
    const logger = createFixLogger({ logPath });
    const result = createMockFixResult("BUILD");

    const entry = logger.logFix(result);
    expect(entry).toBeDefined();
    expect(entry.error.category).toBe("BUILD");
    expect(entry.result.status).toBe("success");
  });

  it("should persist entries to file", () => {
    const logger1 = createFixLogger({ logPath });
    logger1.logFix(createMockFixResult("BUILD"));

    // Create new logger reading same file
    const logger2 = createFixLogger({ logPath });
    const entries = logger2.getEntries();

    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("should track stats correctly", () => {
    const logger = createFixLogger({ logPath });

    // Log some fixes
    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("BUILD", "failed"));

    const stats = logger.getStats();
    expect(stats.totalErrors).toBe(3);
    expect(stats.successfulFixes).toBe(2);
    expect(stats.failedFixes).toBe(1);
  });
});

// ============================================================================
// Success Rate Analysis
// ============================================================================

describe("Success Rate Analysis", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should calculate overall success rate", () => {
    const logger = createFixLogger({ logPath });

    // 3 success, 1 failed = 75%
    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("LINT", "success"));
    logger.logFix(createMockFixResult("TYPE", "failed"));

    const analysis = logger.getSuccessRateAnalysis();
    expect(analysis.overall).toBe(0.75);
  });

  it("should calculate per-category success rate", () => {
    const logger = createFixLogger({ logPath });

    // BUILD: 2/2 = 100%
    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("BUILD", "success"));

    // LINT: 1/2 = 50%
    logger.logFix(createMockFixResult("LINT", "success"));
    logger.logFix(createMockFixResult("LINT", "failed"));

    const analysis = logger.getSuccessRateAnalysis();
    expect(analysis.byCategory.BUILD).toBe(1.0);
    expect(analysis.byCategory.LINT).toBe(0.5);
  });

  it("should compare against targets", () => {
    const logger = createFixLogger({ logPath });

    // BUILD target: 80%, actual: 100% = met
    logger.logFix(createMockFixResult("BUILD", "success"));

    // LINT target: 90%, actual: 50% = not met
    logger.logFix(createMockFixResult("LINT", "success"));
    logger.logFix(createMockFixResult("LINT", "failed"));

    const analysis = logger.getSuccessRateAnalysis();

    expect(analysis.vsTargets.BUILD.met).toBe(true);
    expect(analysis.vsTargets.LINT.met).toBe(false);
    expect(analysis.vsTargets.BUILD.target).toBe(0.8);
    expect(analysis.vsTargets.LINT.target).toBe(0.9);
  });

  it("should handle empty data", () => {
    const logger = createFixLogger({ logPath });
    const analysis = logger.getSuccessRateAnalysis();

    expect(analysis.overall).toBe(0);
    expect(analysis.byCategory.BUILD).toBe(0);
    expect(analysis.vsTargets.BUILD.met).toBe(false);
  });
});

// ============================================================================
// EXPERIMENTAL Fixes
// ============================================================================

describe("EXPERIMENTAL Fixes", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should log experimental fixes", () => {
    const logger = createFixLogger({ logPath });
    const result = createMockFixResult("TEST", "success", "experimental");

    const entry = logger.logFix(result);
    expect(entry.fix.confidence).toBe("experimental");
  });

  it("should track TEST category for experimental", () => {
    const logger = createFixLogger({ logPath });

    logger.logFix(createMockFixResult("TEST", "success", "experimental"));
    logger.logFix(createMockFixResult("TEST", "failed", "experimental"));

    const analysis = logger.getSuccessRateAnalysis();
    expect(analysis.vsTargets.TEST.target).toBe(0.3); // 30% target per CTO
    expect(analysis.byCategory.TEST).toBe(0.5); // 1/2 = 50%
    expect(analysis.vsTargets.TEST.met).toBe(true); // 50% > 30%
  });
});

// ============================================================================
// CSV Export
// ============================================================================

describe("CSV Export", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should export to CSV format", () => {
    const logger = createFixLogger({ logPath });

    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("LINT", "failed"));

    const csv = logger.exportCsv();

    // Check headers
    expect(csv).toContain("id,timestamp,sessionId,category");

    // Check data rows
    expect(csv).toContain("BUILD");
    expect(csv).toContain("LINT");
    expect(csv).toContain("success");
    expect(csv).toContain("failed");
  });

  it("should escape quotes in CSV", () => {
    const logger = createFixLogger({ logPath });

    const result = createMockFixResult("BUILD");
    result.fix.description = 'Fix with "quotes"';

    logger.logFix(result);
    const csv = logger.exportCsv();

    // Quotes should be doubled
    expect(csv).toContain('""quotes""');
  });
});

// ============================================================================
// Session Management
// ============================================================================

describe("Session Management", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should generate unique session ID", () => {
    const logger1 = createFixLogger({ logPath, sessionId: undefined });
    const logger2 = createFixLogger({ logPath: join(tempDir, "other.json"), sessionId: undefined });

    expect(logger1.getSessionId()).not.toBe(logger2.getSessionId());
  });

  it("should use provided session ID", () => {
    const sessionId = "test-session-123";
    const logger = createFixLogger({ logPath, sessionId });

    expect(logger.getSessionId()).toBe(sessionId);
  });

  it("should filter entries by session", () => {
    const sessionId = "test-session";
    const logger = createFixLogger({ logPath, sessionId });

    logger.logFix(createMockFixResult("BUILD"));
    logger.logFix(createMockFixResult("LINT"));

    const sessionEntries = logger.getSessionEntries();
    expect(sessionEntries).toHaveLength(2);
    expect(sessionEntries.every((e) => e.sessionId === sessionId)).toBe(true);
  });
});

// ============================================================================
// Log Rotation
// ============================================================================

describe("Log Rotation", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should rotate when max entries exceeded", () => {
    const logger = createFixLogger({
      logPath,
      maxEntries: 10,
      autoSave: true,
    });

    // Add 12 entries
    for (let i = 0; i < 12; i++) {
      logger.logFix(createMockFixResult("BUILD"));
    }

    // Should have rotated to 80% of max (8 entries)
    const entries = logger.getEntries();
    expect(entries.length).toBeLessThanOrEqual(10);
  });

  it("should keep recent entries after rotation", () => {
    const logger = createFixLogger({
      logPath,
      maxEntries: 5,
      autoSave: true,
    });

    // Add entries with identifiable data
    for (let i = 0; i < 7; i++) {
      const result = createMockFixResult("BUILD");
      result.fix.description = `Fix #${i}`;
      logger.logFix(result);
    }

    // Rotation keeps 80% = 4 entries, all should be recent
    const entries = logger.getEntries();
    const descriptions = entries.map((e) => e.fix.description);

    // Should have kept the most recent ones
    expect(descriptions).toContain("Fix #6");
  });
});

// ============================================================================
// Entry Filtering
// ============================================================================

describe("Entry Filtering", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should filter by category", () => {
    const logger = createFixLogger({ logPath });

    logger.logFix(createMockFixResult("BUILD"));
    logger.logFix(createMockFixResult("BUILD"));
    logger.logFix(createMockFixResult("LINT"));

    const buildEntries = logger.getEntriesByCategory("BUILD");
    expect(buildEntries).toHaveLength(2);
  });

  it("should filter by status", () => {
    const logger = createFixLogger({ logPath });

    logger.logFix(createMockFixResult("BUILD", "success"));
    logger.logFix(createMockFixResult("BUILD", "failed"));
    logger.logFix(createMockFixResult("LINT", "success"));

    const successEntries = logger.getEntriesByStatus("success");
    expect(successEntries).toHaveLength(2);
  });
});

// ============================================================================
// Clear and Reset
// ============================================================================

describe("Clear and Reset", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should clear all entries", () => {
    const logger = createFixLogger({ logPath });

    logger.logFix(createMockFixResult("BUILD"));
    logger.logFix(createMockFixResult("LINT"));

    logger.clear();

    expect(logger.getEntries()).toHaveLength(0);
    expect(logger.getStats().totalErrors).toBe(0);
  });

  it("should persist cleared state", () => {
    const logger1 = createFixLogger({ logPath });
    logger1.logFix(createMockFixResult("BUILD"));
    logger1.clear();

    const logger2 = createFixLogger({ logPath });
    expect(logger2.getEntries()).toHaveLength(0);
  });
});
