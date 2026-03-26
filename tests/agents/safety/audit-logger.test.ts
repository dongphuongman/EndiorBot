/**
 * Audit Logger Tests
 *
 * @module tests/agents/safety/audit-logger
 * @date 2026-03-26
 * @sprint 119
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuditLogger,
  createAuditLogger,
  getAuditLogger,
  resetAuditLogger,
  DEFAULT_AUDIT_CONFIG,
} from "../../../src/agents/safety/audit-logger.js";
import type { AuditEntry, AuditConfig } from "../../../src/agents/safety/audit-logger.js";

// ============================================================================
// Helpers
// ============================================================================

let testDir: string;

function makeTmpDir(suffix: string): string {
  const dir = join(tmpdir(), `audit-logger-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeLogger(overrides: Partial<AuditConfig> = {}): AuditLogger {
  return new AuditLogger({
    logPath: join(testDir, "audit.jsonl"),
    consoleLog: false,
    ...overrides,
  });
}

function readLines(logPath: string): AuditEntry[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AuditEntry);
}

function baseEntry(): Omit<AuditEntry, "ts" | "id" | "session_id"> {
  return {
    agent: "pm",
    task: "plan payment gateway",
    mode: "READ",
    tier: "LITE",
    duration_ms: 100,
    risk: "LOW",
    status: "success",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("AuditLogger", () => {
  beforeEach(() => {
    testDir = makeTmpDir("main");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("logEntry() — basic write", () => {
    it("writes a JSONL line to the log file", () => {
      const logger = makeLogger();
      logger.logEntry(baseEntry());

      const lines = readLines(join(testDir, "audit.jsonl"));
      expect(lines.length).toBe(1);
    });

    it("written entry is valid JSON", () => {
      const logger = makeLogger();
      logger.logEntry(baseEntry());

      const raw = readFileSync(join(testDir, "audit.jsonl"), "utf-8");
      expect(() => JSON.parse(raw.trim())).not.toThrow();
    });

    it("returned entry contains ts (ISO 8601 timestamp)", () => {
      const logger = makeLogger();
      const entry = logger.logEntry(baseEntry());

      expect(entry.ts).toBeDefined();
      expect(() => new Date(entry.ts)).not.toThrow();
      expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
    });

    it("returned entry contains unique id starting with 'inv_'", () => {
      const logger = makeLogger();
      const entry = logger.logEntry(baseEntry());

      expect(entry.id).toMatch(/^inv_/);
    });

    it("returned entry contains session_id starting with 'sess_'", () => {
      const logger = makeLogger();
      const entry = logger.logEntry(baseEntry());

      expect(entry.session_id).toMatch(/^sess_/);
    });

    it("entry contains all provided fields: agent, task, mode, tier, risk, status", () => {
      const logger = makeLogger();
      const entry = logger.logEntry(baseEntry());

      expect(entry.agent).toBe("pm");
      expect(entry.task).toBe("plan payment gateway");
      expect(entry.mode).toBe("READ");
      expect(entry.tier).toBe("LITE");
      expect(entry.risk).toBe("LOW");
      expect(entry.status).toBe("success");
    });

    it("entry written to file matches returned entry fields", () => {
      const logger = makeLogger();
      const returned = logger.logEntry(baseEntry());

      const lines = readLines(join(testDir, "audit.jsonl"));
      expect(lines[0]!.id).toBe(returned.id);
      expect(lines[0]!.agent).toBe(returned.agent);
      expect(lines[0]!.ts).toBe(returned.ts);
    });
  });

  describe("logEntry() — auto-create log file and directory", () => {
    it("auto-creates log file if it does not exist", () => {
      const logPath = join(testDir, "audit.jsonl");
      // File does not exist yet
      expect(existsSync(logPath)).toBe(false);

      const logger = makeLogger({ logPath });
      logger.logEntry(baseEntry());

      expect(existsSync(logPath)).toBe(true);
    });

    it("auto-creates log directory if it does not exist", () => {
      const nestedDir = join(testDir, "nested", "deeper");
      const logPath = join(nestedDir, "audit.jsonl");

      expect(existsSync(nestedDir)).toBe(false);

      const logger = new AuditLogger({ logPath, consoleLog: false });
      logger.logEntry(baseEntry());

      expect(existsSync(logPath)).toBe(true);
    });
  });

  describe("logEntry() — multiple entries appended", () => {
    it("writes multiple entries on separate lines (not overwritten)", () => {
      const logger = makeLogger();
      logger.logEntry(baseEntry());
      logger.logEntry({ ...baseEntry(), task: "second task" });
      logger.logEntry({ ...baseEntry(), task: "third task" });

      const lines = readLines(join(testDir, "audit.jsonl"));
      expect(lines.length).toBe(3);
    });

    it("each entry has a unique id", () => {
      const logger = makeLogger();
      const a = logger.logEntry(baseEntry());
      const b = logger.logEntry(baseEntry());

      expect(a.id).not.toBe(b.id);
    });

    it("all entries share the same session_id within a logger instance", () => {
      const logger = makeLogger();
      const a = logger.logEntry(baseEntry());
      const b = logger.logEntry(baseEntry());

      expect(a.session_id).toBe(b.session_id);
    });
  });

  describe("logEntry() — consoleLog option", () => {
    it("does not write to console when consoleLog=false", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const logger = makeLogger({ consoleLog: false });
      logger.logEntry(baseEntry());

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("writes to console when consoleLog=true", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const logger = makeLogger({ consoleLog: true });
      logger.logEntry(baseEntry());

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe("logEntry() — cost calculation", () => {
    it("calculates cost_usd when tokens_in and tokens_out provided", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        tokens_in: 1000,
        tokens_out: 500,
      });

      expect(entry.cost_usd).toBeDefined();
      expect(entry.cost_usd).toBeGreaterThan(0);
    });

    it("does not overwrite cost_usd when already provided", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        tokens_in: 1000,
        tokens_out: 500,
        cost_usd: 9.99,
      });

      expect(entry.cost_usd).toBe(9.99);
    });

    it("no cost_usd when tokens not provided", () => {
      const logger = makeLogger();
      const entry = logger.logEntry(baseEntry());
      expect(entry.cost_usd).toBeUndefined();
    });
  });

  describe("logEntry() — optional fields", () => {
    it("preserves optional fields: project, branch, commit", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        project: "EndiorBot",
        branch: "main",
        commit: "abc123",
      });

      expect(entry.project).toBe("EndiorBot");
      expect(entry.branch).toBe("main");
      expect(entry.commit).toBe("abc123");
    });

    it("preserves handoff_to field", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        handoff_to: "coder",
      });

      expect(entry.handoff_to).toBe("coder");
    });

    it("preserves files_affected field", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        files_affected: ["src/index.ts", "src/types.ts"],
      });

      expect(entry.files_affected).toEqual(["src/index.ts", "src/types.ts"]);
    });

    it("preserves context_manifest field", () => {
      const logger = makeLogger();
      const entry = logger.logEntry({
        ...baseEntry(),
        context_manifest: { tier1: true, tier2: false, tokens: 1500 },
      });

      expect(entry.context_manifest).toEqual({ tier1: true, tier2: false, tokens: 1500 });
    });
  });

  describe("logEntry() — sanitization (includeSensitive=false default)", () => {
    it("truncates task longer than 200 chars", () => {
      const logger = makeLogger({ includeSensitive: false });
      const longTask = "a".repeat(250);
      const entry = logger.logEntry({ ...baseEntry(), task: longTask });

      // Returned entry has full task; file entry is sanitized
      const lines = readLines(join(testDir, "audit.jsonl"));
      expect(lines[0]!.task.length).toBeLessThanOrEqual(200);
    });

    it("passes through when includeSensitive=true without truncation", () => {
      const logger = makeLogger({ includeSensitive: true });
      const longTask = "a".repeat(250);
      logger.logEntry({ ...baseEntry(), task: longTask });

      const lines = readLines(join(testDir, "audit.jsonl"));
      expect(lines[0]!.task.length).toBe(250);
    });
  });

  describe("logSuccess() convenience method", () => {
    it("writes entry with status='success'", () => {
      const logger = makeLogger();
      const entry = logger.logSuccess({
        agent: "coder",
        task: "implement auth",
        mode: "PATCH",
        tier: "STANDARD",
        duration_ms: 5000,
        risk: "HIGH",
      });

      expect(entry.status).toBe("success");
    });

    it("logSuccess returns valid AuditEntry with ts and id", () => {
      const logger = makeLogger();
      const entry = logger.logSuccess({
        agent: "coder",
        task: "test",
        mode: "READ",
        tier: "LITE",
        duration_ms: 100,
        risk: "LOW",
      });

      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.id).toMatch(/^inv_/);
    });
  });

  describe("logError() convenience method", () => {
    it("writes entry with status='error'", () => {
      const logger = makeLogger();
      const entry = logger.logError({
        agent: "coder",
        task: "failing task",
        mode: "READ",
        tier: "LITE",
        duration_ms: 100,
        risk: "LOW",
        error: "Something went wrong",
      });

      expect(entry.status).toBe("error");
      expect(entry.error).toBe("Something went wrong");
    });
  });

  describe("logTimeout() convenience method", () => {
    it("writes entry with status='timeout'", () => {
      const logger = makeLogger();
      const entry = logger.logTimeout({
        agent: "coder",
        task: "slow task",
        mode: "READ",
        tier: "LITE",
        duration_ms: 30000,
        risk: "LOW",
      });

      expect(entry.status).toBe("timeout");
    });
  });

  describe("logCancelled() convenience method", () => {
    it("writes entry with status='cancelled'", () => {
      const logger = makeLogger();
      const entry = logger.logCancelled({
        agent: "coder",
        task: "cancelled task",
        mode: "READ",
        tier: "LITE",
        duration_ms: 200,
        risk: "LOW",
      });

      expect(entry.status).toBe("cancelled");
    });
  });

  describe("getLogPath()", () => {
    it("returns the configured log path", () => {
      const logPath = join(testDir, "my-audit.jsonl");
      const logger = new AuditLogger({ logPath, consoleLog: false });
      expect(logger.getLogPath()).toBe(logPath);
    });
  });

  describe("getSessionId()", () => {
    it("returns a session id starting with 'sess_'", () => {
      const logger = makeLogger();
      expect(logger.getSessionId()).toMatch(/^sess_/);
    });

    it("session id is consistent for the same logger instance", () => {
      const logger = makeLogger();
      const a = logger.getSessionId();
      const b = logger.getSessionId();
      expect(a).toBe(b);
    });
  });

  describe("file rotation", () => {
    it("rotates log file when maxFileSize is exceeded", () => {
      const logPath = join(testDir, "rotate.jsonl");

      // Pre-fill file to exceed maxFileSize of 100 bytes
      const bigContent = "x".repeat(200) + "\n";
      writeFileSync(logPath, bigContent, "utf-8");

      const logger = new AuditLogger({ logPath, maxFileSize: 100, consoleLog: false });
      logger.logEntry(baseEntry());

      // Original file should have been rotated to .1
      expect(existsSync(`${logPath}.1`)).toBe(true);
      // New log file should exist with the new entry
      expect(existsSync(logPath)).toBe(true);
    });

    it("does not rotate when file is under maxFileSize", () => {
      const logPath = join(testDir, "no-rotate.jsonl");
      writeFileSync(logPath, "x\n", "utf-8"); // very small

      const logger = new AuditLogger({ logPath, maxFileSize: 10 * 1024 * 1024, consoleLog: false });
      logger.logEntry(baseEntry());

      expect(existsSync(`${logPath}.1`)).toBe(false);
    });
  });
});

describe("getAuditLogger / resetAuditLogger (singleton)", () => {
  beforeEach(() => {
    testDir = makeTmpDir("singleton");
    resetAuditLogger();
  });

  afterEach(() => {
    resetAuditLogger();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns the same instance on repeated calls", () => {
    const logPath = join(testDir, "audit.jsonl");
    const a = getAuditLogger({ logPath, consoleLog: false });
    const b = getAuditLogger({ logPath, consoleLog: false });
    expect(a).toBe(b);
  });

  it("after reset, returns a new instance", () => {
    const logPath = join(testDir, "audit.jsonl");
    const a = getAuditLogger({ logPath, consoleLog: false });
    resetAuditLogger();
    const b = getAuditLogger({ logPath, consoleLog: false });
    expect(a).not.toBe(b);
  });
});

describe("createAuditLogger", () => {
  beforeEach(() => {
    testDir = makeTmpDir("factory");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates a fresh AuditLogger instance", () => {
    const logger = createAuditLogger({ logPath: join(testDir, "a.jsonl"), consoleLog: false });
    expect(logger).toBeInstanceOf(AuditLogger);
  });

  it("creates separate instances on each call", () => {
    const a = createAuditLogger({ logPath: join(testDir, "a.jsonl"), consoleLog: false });
    const b = createAuditLogger({ logPath: join(testDir, "b.jsonl"), consoleLog: false });
    expect(a).not.toBe(b);
  });
});

describe("DEFAULT_AUDIT_CONFIG", () => {
  it("maxFileSize is 10MB", () => {
    expect(DEFAULT_AUDIT_CONFIG.maxFileSize).toBe(10 * 1024 * 1024);
  });

  it("consoleLog is false by default", () => {
    expect(DEFAULT_AUDIT_CONFIG.consoleLog).toBe(false);
  });

  it("includeSensitive is false by default", () => {
    expect(DEFAULT_AUDIT_CONFIG.includeSensitive).toBe(false);
  });

  it("logPath includes .endiorbot/logs/audit.jsonl", () => {
    expect(DEFAULT_AUDIT_CONFIG.logPath).toContain(".endiorbot");
    expect(DEFAULT_AUDIT_CONFIG.logPath).toContain("audit.jsonl");
  });

  it("maxBackups is 5", () => {
    expect(DEFAULT_AUDIT_CONFIG.maxBackups).toBe(5);
  });
});
