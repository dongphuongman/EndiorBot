/**
 * Fix Logger Tests
 *
 * @module tests/agents/fix-logging/fix-logger
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  FixLogger,
  createFixLogger,
  type LogFixParams,
} from "../../../src/agents/fix-logging/fix-logger.js";

describe("FixLogger", () => {
  let logger: FixLogger;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fix-logger-test-"));
    logger = createFixLogger({ storageDir: tempDir });
    await logger.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("logFix", () => {
    it("should log a fix entry", async () => {
      const params: LogFixParams = {
        sessionId: "test-session",
        error: {
          category: "TYPE",
          code: "TS2304",
          message: "Cannot find name 'foo'",
          file: "/src/test.ts",
          line: 10,
          severity: "error",
        },
        fix: {
          type: "add_import",
          description: "Add import for foo",
          confidence: "high",
          filesModified: ["/src/test.ts"],
          isAiAssisted: false,
        },
        outcome: {
          status: "success",
          verified: true,
          durationMs: 150,
          strikesUsed: 1,
          escalated: false,
          antiCheatViolation: false,
          newErrorsCount: 0,
        },
      };

      const entryId = await logger.logFix(params);

      expect(entryId).toBeDefined();
      expect(entryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      const count = await logger.getCount();
      expect(count).toBe(1);
    });

    it("should generate pattern ID automatically", async () => {
      const params: LogFixParams = {
        sessionId: "test-session",
        error: {
          category: "LINT",
          code: "prefer-const",
          message: "Use const instead of let",
          file: "/src/test.ts",
          line: 5,
          severity: "warning",
        },
        fix: {
          type: "fix_lint_rule",
          description: "Change let to const",
          confidence: "high",
          filesModified: ["/src/test.ts"],
          isAiAssisted: false,
        },
        outcome: {
          status: "success",
          verified: true,
          durationMs: 50,
          strikesUsed: 1,
          escalated: false,
          antiCheatViolation: false,
          newErrorsCount: 0,
        },
      };

      await logger.logFix(params);

      const entries = await logger.query({});
      expect(entries.length).toBe(1);
      expect(entries[0]!.fix.patternId).toBe("LINT:prefer-const:fix_lint_rule");
    });

    it("should not log when disabled", async () => {
      const disabledLogger = createFixLogger({
        storageDir: tempDir,
        enabled: false,
      });

      const result = await disabledLogger.logFix({
        sessionId: "test",
        error: {
          category: "TYPE",
          code: "TS2304",
          message: "test",
          file: "/test.ts",
          line: 1,
          severity: "error",
        },
        fix: {
          type: "add_import",
          description: "test",
          confidence: "high",
          filesModified: [],
          isAiAssisted: false,
        },
        outcome: {
          status: "success",
          verified: true,
          durationMs: 0,
          strikesUsed: 0,
          escalated: false,
          antiCheatViolation: false,
          newErrorsCount: 0,
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("getWeeklySummary", () => {
    it("should return empty summary when no data", async () => {
      const summary = await logger.getWeeklySummary();

      expect(summary.totalAttempts).toBe(0);
      expect(summary.successfulFixes).toBe(0);
      expect(summary.successRate).toBe(0);
    });

    it("should calculate summary from entries", async () => {
      // Add some entries
      for (let i = 0; i < 5; i++) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: "TYPE",
            code: "TS2304",
            message: "test",
            file: "/test.ts",
            line: i,
            severity: "error",
          },
          fix: {
            type: "add_import",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: i < 4 ? "success" : "failed",
            verified: true,
            durationMs: 100,
            strikesUsed: 1,
            escalated: false,
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }

      const summary = await logger.getWeeklySummary();

      expect(summary.totalAttempts).toBe(5);
      expect(summary.successfulFixes).toBe(4);
      expect(summary.failedFixes).toBe(1);
      expect(summary.successRate).toBe(0.8);
    });

    it("should calculate by category", async () => {
      // Add TYPE entries
      for (let i = 0; i < 3; i++) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: "TYPE",
            code: "TS2304",
            message: "test",
            file: "/test.ts",
            line: i,
            severity: "error",
          },
          fix: {
            type: "add_import",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: "success",
            verified: true,
            durationMs: 100,
            strikesUsed: 1,
            escalated: false,
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }

      // Add LINT entries
      for (let i = 0; i < 2; i++) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: "LINT",
            code: "prefer-const",
            message: "test",
            file: "/test.ts",
            line: i,
            severity: "warning",
          },
          fix: {
            type: "fix_lint_rule",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: i === 0 ? "success" : "failed",
            verified: true,
            durationMs: 50,
            strikesUsed: 1,
            escalated: false,
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }

      const summary = await logger.getWeeklySummary();

      expect(summary.byCategory.TYPE.total).toBe(3);
      expect(summary.byCategory.TYPE.fixed).toBe(3);
      expect(summary.byCategory.TYPE.successRate).toBe(1);

      expect(summary.byCategory.LINT.total).toBe(2);
      expect(summary.byCategory.LINT.fixed).toBe(1);
      expect(summary.byCategory.LINT.successRate).toBe(0.5);
    });
  });

  describe("getRecurringPatterns", () => {
    it("should return empty when not enough data", async () => {
      // Add only 2 entries
      for (let i = 0; i < 2; i++) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: "TYPE",
            code: "TS2304",
            message: "test",
            file: "/test.ts",
            line: i,
            severity: "error",
          },
          fix: {
            type: "add_import",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: "success",
            verified: true,
            durationMs: 100,
            strikesUsed: 1,
            escalated: false,
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }

      const patterns = await logger.getRecurringPatterns(3);
      expect(patterns.length).toBe(0);
    });

    it("should identify recurring patterns", async () => {
      // Add 5 entries with same error code
      for (let i = 0; i < 5; i++) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: "TYPE",
            code: "TS2304",
            message: "test",
            file: "/test.ts",
            line: i,
            severity: "error",
          },
          fix: {
            type: "add_import",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: i < 4 ? "success" : "failed",
            verified: true,
            durationMs: 100,
            strikesUsed: 1,
            escalated: false,
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }

      const patterns = await logger.getRecurringPatterns(3);

      expect(patterns.length).toBe(1);
      expect(patterns[0]!.errorCode).toBe("TS2304");
      expect(patterns[0]!.count).toBe(5);
      expect(patterns[0]!.successRate).toBe(0.8);
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      // Add mixed entries
      const entries = [
        { category: "TYPE" as const, code: "TS2304", status: "success" as const },
        { category: "TYPE" as const, code: "TS2339", status: "failed" as const },
        { category: "LINT" as const, code: "prefer-const", status: "success" as const },
        { category: "BUILD" as const, code: "MODULE_NOT_FOUND", status: "escalated" as const },
      ];

      for (const entry of entries) {
        await logger.logFix({
          sessionId: "test",
          error: {
            category: entry.category,
            code: entry.code,
            message: "test",
            file: "/test.ts",
            line: 1,
            severity: "error",
          },
          fix: {
            type: "add_import",
            description: "test",
            confidence: "high",
            filesModified: [],
            isAiAssisted: false,
          },
          outcome: {
            status: entry.status,
            verified: true,
            durationMs: 100,
            strikesUsed: 1,
            escalated: entry.status === "escalated",
            antiCheatViolation: false,
            newErrorsCount: 0,
          },
        });
      }
    });

    it("should filter by category", async () => {
      const results = await logger.query({ category: "TYPE" });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.error.category === "TYPE")).toBe(true);
    });

    it("should filter by status", async () => {
      const results = await logger.query({ status: "success" });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.outcome.status === "success")).toBe(true);
    });

    it("should sort by timestamp desc by default", async () => {
      const results = await logger.query({});
      expect(results.length).toBe(4);

      // Check sorted desc
      for (let i = 1; i < results.length; i++) {
        expect(
          new Date(results[i - 1]!.timestamp).getTime()
        ).toBeGreaterThanOrEqual(new Date(results[i]!.timestamp).getTime());
      }
    });

    it("should apply limit and offset", async () => {
      const results = await logger.query({ limit: 2, offset: 1 });
      expect(results.length).toBe(2);
    });
  });

  describe("export", () => {
    beforeEach(async () => {
      await logger.logFix({
        sessionId: "test",
        error: {
          category: "TYPE",
          code: "TS2304",
          message: "test",
          file: "/test.ts",
          line: 1,
          severity: "error",
        },
        fix: {
          type: "add_import",
          description: "test",
          confidence: "high",
          filesModified: [],
          isAiAssisted: false,
        },
        outcome: {
          status: "success",
          verified: true,
          durationMs: 100,
          strikesUsed: 1,
          escalated: false,
          antiCheatViolation: false,
          newErrorsCount: 0,
        },
      });
    });

    it("should export to JSON", async () => {
      const json = await logger.exportJson();
      const data = JSON.parse(json);

      expect(data.schemaVersion).toBeDefined();
      expect(data.entries).toHaveLength(1);
    });

    it("should export to CSV", async () => {
      const csv = await logger.exportCsv();
      const lines = csv.split("\n");

      expect(lines.length).toBe(2); // header + 1 entry
      expect(lines[0]).toContain("id,timestamp,sessionId");
    });
  });

  describe("getSuccessRates", () => {
    it("should return rates by category", async () => {
      // Add some entries
      await logger.logFix({
        sessionId: "test",
        error: {
          category: "TYPE",
          code: "TS2304",
          message: "test",
          file: "/test.ts",
          line: 1,
          severity: "error",
        },
        fix: {
          type: "add_import",
          description: "test",
          confidence: "high",
          filesModified: [],
          isAiAssisted: false,
        },
        outcome: {
          status: "success",
          verified: true,
          durationMs: 100,
          strikesUsed: 1,
          escalated: false,
          antiCheatViolation: false,
          newErrorsCount: 0,
        },
      });

      const rates = await logger.getSuccessRates(7);

      expect(rates.TYPE.rate).toBe(1);
      expect(rates.TYPE.target).toBe(0.7);
      expect(rates.TYPE.met).toBe(true);
    });
  });
});
