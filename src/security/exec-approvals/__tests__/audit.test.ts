/**
 * Unit tests for audit.ts
 *
 * @module security/exec-approvals/__tests__/audit
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeAuditRecord, readAuditTail, getAuditLogPath } from "../audit.js";
import type { ExecPolicyAuditRecord } from "../types.js";

let tmpStateDir: string;

function makeRecord(overrides: Partial<ExecPolicyAuditRecord> = {}): ExecPolicyAuditRecord {
  return {
    timestamp: "2026-04-11T00:00:00.000Z",
    sessionId: "test-session-1",
    agent: "coder",
    command: "git status",
    preset: "balanced",
    decision: "allow",
    gate: "B",
    autoHandoff: false,
    originChannel: "cli",
    ...overrides,
  };
}

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe("audit", () => {
  describe("getAuditLogPath", () => {
    it("uses ENDIORBOT_STATE_DIR env var", () => {
      const logPath = getAuditLogPath();
      expect(logPath).toContain(tmpStateDir);
      expect(logPath).toContain("exec-policy.log");
    });
  });

  describe("writeAuditRecord", () => {
    it("creates the log file on first write", () => {
      const logPath = getAuditLogPath();
      expect(existsSync(logPath)).toBe(false);
      writeAuditRecord(makeRecord());
      expect(existsSync(logPath)).toBe(true);
    });

    it("appends JSONL records", () => {
      writeAuditRecord(makeRecord({ command: "git status" }));
      writeAuditRecord(makeRecord({ command: "ls -la" }));

      const records = readAuditTail(50);
      expect(records).toHaveLength(2);
      expect(records[0]?.command).toBe("git status");
      expect(records[1]?.command).toBe("ls -la");
    });

    it("scrubs secrets from command field", () => {
      // output-scrubber should redact token patterns
      writeAuditRecord(makeRecord({ command: "curl -H token:secret123 https://api.example.com" }));
      const records = readAuditTail(1);
      expect(records[0]?.command).not.toContain("secret123");
    });

    it("includes taskId when provided", () => {
      writeAuditRecord(makeRecord({ taskId: "task-42" }));
      const records = readAuditTail(1);
      expect(records[0]?.taskId).toBe("task-42");
    });

    it("includes originChannel in the record", () => {
      writeAuditRecord(makeRecord({ originChannel: "telegram" }));
      const records = readAuditTail(1);
      expect(records[0]?.originChannel).toBe("telegram");
    });
  });

  describe("readAuditTail", () => {
    it("returns empty array when no log file exists", () => {
      expect(readAuditTail(50)).toHaveLength(0);
    });

    it("returns up to n records", () => {
      for (let i = 0; i < 10; i++) {
        writeAuditRecord(makeRecord({ command: `cmd-${i}` }));
      }
      const tail = readAuditTail(5);
      expect(tail).toHaveLength(5);
    });

    it("returns last N records (tail behavior)", () => {
      for (let i = 0; i < 10; i++) {
        writeAuditRecord(makeRecord({ command: `cmd-${i}` }));
      }
      const tail = readAuditTail(3);
      // Last 3 written: cmd-7, cmd-8, cmd-9
      expect(tail[0]?.command).toBe("cmd-7");
      expect(tail[2]?.command).toBe("cmd-9");
    });

    it("skips corrupt lines gracefully", () => {
      const logPath = getAuditLogPath();
      const dir = logPath.slice(0, logPath.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(logPath, '{"valid":"line"}\n{BROKEN}\n{"valid":"line2"}\n', "utf-8");
      // Should return 2 valid records (the broken line is skipped)
      const records = readAuditTail(50);
      expect(records.length).toBe(2);
    });

    it("returns all records when n > total", () => {
      writeAuditRecord(makeRecord());
      writeAuditRecord(makeRecord());
      const records = readAuditTail(100);
      expect(records.length).toBe(2);
    });
  });

  describe("rotation", () => {
    it("rotates when file exceeds 10MB", () => {
      const logPath = getAuditLogPath();
      const dir = logPath.slice(0, logPath.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });

      // Create a 10MB+ file
      const bigContent = "x".repeat(10 * 1024 * 1024 + 1) + "\n";
      writeFileSync(logPath, bigContent, "utf-8");

      // Write one more record to trigger rotation
      writeAuditRecord(makeRecord());

      // Original file should now exist as .1
      expect(existsSync(`${logPath}.1`)).toBe(true);
      // New file should have the fresh record
      expect(existsSync(logPath)).toBe(true);
      const newStats = statSync(logPath);
      expect(newStats.size).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
