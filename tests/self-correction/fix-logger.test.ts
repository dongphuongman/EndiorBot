/**
 * Fix Logger Tests
 *
 * Tests for fix-log.json persistence.
 *
 * Per Sprint 37 requirements:
 * - Persist fix history to file
 * - Track statistics
 * - Support session-based logging
 *
 * @module tests/self-correction/fix-logger
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  FixLogger,
  createFixLogger,
  getDefaultLogPath,
} from "../../src/self-correction/fix-logger.js";
import type {
  FixResult,
  ProposedFix,
  LintError,
  TypeScriptError,
} from "../../src/self-correction/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestError(category: "LINT" | "TYPE"): LintError | TypeScriptError {
  if (category === "LINT") {
    return {
      category: "LINT",
      code: "semi",
      message: "Missing semicolon",
      severity: "error",
      filePath: "src/test.ts",
      line: 1,
      raw: "src/test.ts:1:5: error Missing semicolon semi",
      rule: "semi",
      fixable: true,
    };
  }
  return {
    category: "TYPE",
    code: "TS6133",
    message: "'unused' is declared but never read",
    severity: "warning",
    filePath: "src/test.ts",
    line: 1,
    raw: "src/test.ts(1,5): error TS6133: message",
    tsCode: 6133,
  };
}

function createTestFix(error: LintError | TypeScriptError): ProposedFix {
  return {
    id: `fix-${Date.now()}`,
    error,
    type: "fix_lint_rule",
    confidence: "high",
    description: "Add missing semicolon",
    filePath: error.filePath,
    line: error.line,
    originalCode: "const x = 5",
    fixedCode: "const x = 5;",
    isMultiLine: false,
  };
}

function createTestFixResult(
  error: LintError | TypeScriptError,
  status: "success" | "failed" = "success"
): FixResult {
  return {
    fix: createTestFix(error),
    status,
    duration: 10,
    verified: status === "success",
    strikes: status === "failed" ? 1 : 0,
  };
}

// ============================================================================
// Basic Tests
// ============================================================================

describe("FixLogger - Basic Operations", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fix-logger-test-"));
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create logger with default config", () => {
    const logger = createFixLogger({ logPath });

    expect(logger).toBeInstanceOf(FixLogger);
    expect(logger.getConfig().logPath).toBe(logPath);
    expect(logger.getSessionId()).toBeTruthy();
  });

  it("should create logger with custom session ID", () => {
    const logger = createFixLogger({
      logPath,
      sessionId: "custom-session",
    });

    expect(logger.getSessionId()).toBe("custom-session");
  });

  it("should log a fix result", () => {
    const logger = createFixLogger({ logPath, autoSave: false });
    const error = createTestError("LINT");
    const result = createTestFixResult(error);

    const entry = logger.logFix(result);

    expect(entry).toBeDefined();
    expect(entry.error.category).toBe("LINT");
    expect(entry.result.status).toBe("success");
    expect(logger.getEntries()).toHaveLength(1);
  });

  it("should log multiple fix results", () => {
    const logger = createFixLogger({ logPath, autoSave: false });
    const results = [
      createTestFixResult(createTestError("LINT")),
      createTestFixResult(createTestError("TYPE")),
      createTestFixResult(createTestError("LINT"), "failed"),
    ];

    const entries = logger.logFixes(results);

    expect(entries).toHaveLength(3);
    expect(logger.getEntries()).toHaveLength(3);
  });

  it("should generate unique entry IDs", () => {
    const logger = createFixLogger({ logPath, autoSave: false });
    const result1 = createTestFixResult(createTestError("LINT"));
    const result2 = createTestFixResult(createTestError("LINT"));

    const entry1 = logger.logFix(result1);
    const entry2 = logger.logFix(result2);

    expect(entry1.id).not.toBe(entry2.id);
  });
});

// ============================================================================
// Persistence Tests
// ============================================================================

describe("FixLogger - Persistence", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fix-logger-test-"));
    logPath = join(tempDir, "fix-log.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should save log to file", () => {
    const logger = createFixLogger({ logPath, autoSave: true });
    const result = createTestFixResult(createTestError("LINT"));

    logger.logFix(result);

    expect(existsSync(logPath)).toBe(true);

    const content = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(content.version).toBe("1.0.0");
    expect(content.entries).toHaveLength(1);
  });

  it("should load existing entries from file", () => {
    // Create and save
    const logger1 = createFixLogger({ logPath, autoSave: true });
    logger1.logFix(createTestFixResult(createTestError("LINT")));
    logger1.logFix(createTestFixResult(createTestError("TYPE")));

    // Load in new instance
    const logger2 = createFixLogger({ logPath });

    expect(logger2.getEntries()).toHaveLength(2);
  });

  it("should create directory if it does not exist", () => {
    const deepPath = join(tempDir, "nested", "dir", "fix-log.json");
    const logger = createFixLogger({ logPath: deepPath, autoSave: true });

    logger.logFix(createTestFixResult(createTestError("LINT")));

    expect(existsSync(deepPath)).toBe(true);
  });

  it("should include session information in saved file", () => {
    const logger = createFixLogger({ logPath, sessionId: "test-session" });
    logger.logFix(createTestFixResult(createTestError("LINT")));
    logger.save();

    const content = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(content.sessions["test-session"]).toBeDefined();
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe("FixLogger - Statistics", () => {
  let logger: FixLogger;

  beforeEach(() => {
    logger = createFixLogger({ logPath: "./temp-log.json", autoSave: false });
  });

  it("should track total errors", () => {
    logger.logFix(createTestFixResult(createTestError("LINT")));
    logger.logFix(createTestFixResult(createTestError("TYPE")));

    const stats = logger.getStats();
    expect(stats.totalErrors).toBe(2);
  });

  it("should track errors by category", () => {
    logger.logFix(createTestFixResult(createTestError("LINT")));
    logger.logFix(createTestFixResult(createTestError("LINT")));
    logger.logFix(createTestFixResult(createTestError("TYPE")));

    const stats = logger.getStats();
    expect(stats.byCategory.LINT).toBe(2);
    expect(stats.byCategory.TYPE).toBe(1);
  });

  it("should track successful and failed fixes", () => {
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "failed"));

    const stats = logger.getStats();
    expect(stats.successfulFixes).toBe(2);
    expect(stats.failedFixes).toBe(1);
  });

  it("should calculate average fix time", () => {
    const result1 = createTestFixResult(createTestError("LINT"));
    result1.duration = 10;
    const result2 = createTestFixResult(createTestError("LINT"));
    result2.duration = 20;

    logger.logFix(result1);
    logger.logFix(result2);

    const stats = logger.getStats();
    expect(stats.averageFixTime).toBe(15);
  });

  it("should track success rate by category", () => {
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "failed"));
    logger.logFix(createTestFixResult(createTestError("TYPE"), "success"));

    const stats = logger.getStats();
    expect(stats.successRateByCategory.LINT).toBe(0.5);
    expect(stats.successRateByCategory.TYPE).toBe(1);
  });

  it("should include session start time", () => {
    const stats = logger.getStats();
    expect(stats.sessionStart).toBeInstanceOf(Date);
    expect(stats.sessionId).toBeTruthy();
  });
});

// ============================================================================
// Query Tests
// ============================================================================

describe("FixLogger - Query Operations", () => {
  let logger: FixLogger;

  beforeEach(() => {
    logger = createFixLogger({
      logPath: "./temp-log.json",
      autoSave: false,
      sessionId: "query-test-session",
    });

    // Add test entries
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "failed"));
    logger.logFix(createTestFixResult(createTestError("TYPE"), "success"));
  });

  it("should get entries by category", () => {
    const lintEntries = logger.getEntriesByCategory("LINT");
    const typeEntries = logger.getEntriesByCategory("TYPE");

    expect(lintEntries).toHaveLength(2);
    expect(typeEntries).toHaveLength(1);
  });

  it("should get entries by status", () => {
    const successEntries = logger.getEntriesByStatus("success");
    const failedEntries = logger.getEntriesByStatus("failed");

    expect(successEntries).toHaveLength(2);
    expect(failedEntries).toHaveLength(1);
  });

  it("should get session entries", () => {
    const sessionEntries = logger.getSessionEntries();

    expect(sessionEntries).toHaveLength(3);
    expect(sessionEntries.every((e) => e.sessionId === "query-test-session")).toBe(true);
  });
});

// ============================================================================
// Analysis Tests
// ============================================================================

describe("FixLogger - Analysis", () => {
  let logger: FixLogger;

  beforeEach(() => {
    logger = createFixLogger({ logPath: "./temp-log.json", autoSave: false });
  });

  it("should analyze success rates vs targets", () => {
    // Add entries to achieve known rates
    // LINT: 2 success, 0 failed = 100% (target 90%)
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));

    // TYPE: 1 success, 1 failed = 50% (target 70%)
    logger.logFix(createTestFixResult(createTestError("TYPE"), "success"));
    logger.logFix(createTestFixResult(createTestError("TYPE"), "failed"));

    const analysis = logger.getSuccessRateAnalysis();

    expect(analysis.byCategory.LINT).toBe(1); // 100%
    expect(analysis.byCategory.TYPE).toBe(0.5); // 50%

    expect(analysis.vsTargets.LINT.met).toBe(true);
    expect(analysis.vsTargets.TYPE.met).toBe(false);
  });

  it("should calculate overall success rate", () => {
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("LINT"), "failed"));

    const analysis = logger.getSuccessRateAnalysis();
    expect(analysis.overall).toBeCloseTo(0.667, 2);
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe("FixLogger - Export", () => {
  let logger: FixLogger;

  beforeEach(() => {
    logger = createFixLogger({ logPath: "./temp-log.json", autoSave: false });
    logger.logFix(createTestFixResult(createTestError("LINT"), "success"));
    logger.logFix(createTestFixResult(createTestError("TYPE"), "failed"));
  });

  it("should export entries as CSV", () => {
    const csv = logger.exportCsv();

    expect(csv).toContain("id,timestamp,sessionId");
    expect(csv).toContain("LINT");
    expect(csv).toContain("TYPE");
    expect(csv).toContain("success");
    expect(csv).toContain("failed");
  });

  it("should handle special characters in CSV", () => {
    const errorWithQuotes = createTestError("LINT") as LintError;
    errorWithQuotes.message = 'Message with "quotes"';

    logger.logFix(createTestFixResult(errorWithQuotes));
    const csv = logger.exportCsv();

    expect(csv).toContain('""quotes""'); // Escaped quotes
  });
});

// ============================================================================
// Rotation Tests
// ============================================================================

describe("FixLogger - Rotation", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fix-logger-test-"));
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
      autoSave: false,
    });

    // Add more than maxEntries
    for (let i = 0; i < 15; i++) {
      logger.logFix(createTestFixResult(createTestError("LINT")));
    }

    // Should have rotated to ~80% of max
    expect(logger.getEntries().length).toBeLessThanOrEqual(10);
  });

  it("should clear all entries", () => {
    const logger = createFixLogger({ logPath, autoSave: false });
    logger.logFix(createTestFixResult(createTestError("LINT")));
    logger.logFix(createTestFixResult(createTestError("TYPE")));

    logger.clear();

    expect(logger.getEntries()).toHaveLength(0);
    expect(logger.getStats().totalErrors).toBe(0);
  });
});

// ============================================================================
// Code Snippet Tests
// ============================================================================

describe("FixLogger - Code Snippets", () => {
  let logger: FixLogger;

  beforeEach(() => {
    logger = createFixLogger({
      logPath: "./temp-log.json",
      autoSave: false,
      includeCodeSnippets: true,
    });
  });

  it("should include code snippets when configured", () => {
    const result = createTestFixResult(createTestError("LINT"));
    const entry = logger.logFix(result);

    expect(entry.originalCode).toBe("const x = 5");
    expect(entry.fixedCode).toBe("const x = 5;");
  });

  it("should exclude code snippets when disabled", () => {
    const loggerNoSnippets = createFixLogger({
      logPath: "./temp-log.json",
      autoSave: false,
      includeCodeSnippets: false,
    });

    const result = createTestFixResult(createTestError("LINT"));
    const entry = loggerNoSnippets.logFix(result);

    expect(entry.originalCode).toBeUndefined();
    expect(entry.fixedCode).toBeUndefined();
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("FixLogger - Factory Functions", () => {
  it("should create logger with factory function", () => {
    const logger = createFixLogger();
    expect(logger).toBeInstanceOf(FixLogger);
  });

  it("should return default log path", () => {
    const path = getDefaultLogPath();
    expect(path).toContain("fix-log.json");
  });
});
