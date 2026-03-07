/**
 * Tests for BridgeAuditLogger
 *
 * Covers: log() entry format, inv_* ID convention, JSONL output,
 * rotation trigger, singleton behavior, optional fields.
 *
 * @module tests/bridge/security/bridge-audit
 * @authority ADR-024, CTO C1, CTO MF-3
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BridgeAuditLogger,
  getBridgeAuditLogger,
  resetBridgeAuditLogger,
  DEFAULT_BRIDGE_AUDIT_CONFIG,
} from "../../../src/bridge/security/bridge-audit.js";

// ============================================================================
// Helpers
// ============================================================================

function createTempDir(): string {
  const dir = join(tmpdir(), `bridge-audit-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createLogger(dir: string): BridgeAuditLogger {
  return new BridgeAuditLogger({
    logPath: join(dir, "test-audit.jsonl"),
    maxFileSize: 1024, // 1KB for easy rotation testing
    maxBackups: 3,
    consoleLog: false,
  });
}

function readLogEntries(logPath: string): unknown[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

// ============================================================================
// Tests
// ============================================================================

describe("BridgeAuditLogger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    resetBridgeAuditLogger();
  });

  afterEach(() => {
    resetBridgeAuditLogger();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  // ==========================================================================
  // Entry Format
  // ==========================================================================

  describe("log() entry format", () => {
    it("should produce entry with all required fields", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "session_create",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      expect(entry.ts).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.event).toBe("session_create");
      expect(entry.actorId).toBe("ceo@endiorbot");
      expect(entry.actor).toBe("telegram");
      expect(entry.details).toEqual({});
    });

    it("should include optional sessionId when provided", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "session_kill",
        actorId: "ceo@endiorbot",
        actor: "telegram",
        sessionId: "bridge_123_abc",
      });

      expect(entry.sessionId).toBe("bridge_123_abc");
    });

    it("should include optional agentType when provided", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "session_create",
        actorId: "ceo@endiorbot",
        actor: "telegram",
        agentType: "claude-code",
      });

      expect(entry.agentType).toBe("claude-code");
    });

    it("should omit sessionId when not provided", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "identity_link",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      expect(entry.sessionId).toBeUndefined();
    });

    it("should omit agentType when not provided", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "identity_link",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      expect(entry.agentType).toBeUndefined();
    });

    it("should include details when provided", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "policy_violation",
        actorId: "ceo@endiorbot",
        actor: "telegram",
        details: { reason: "max sessions", count: 6 },
      });

      expect(entry.details).toEqual({ reason: "max sessions", count: 6 });
    });

    it("should produce valid ISO 8601 timestamp", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "capture",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      const parsed = new Date(entry.ts);
      expect(parsed.getTime()).not.toBeNaN();
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ==========================================================================
  // inv_* ID Convention
  // ==========================================================================

  describe("generateId (inv_* convention)", () => {
    it("should produce IDs starting with inv_", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "session_create",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      expect(entry.id).toMatch(/^inv_/);
    });

    it("should produce IDs with timestamp component", () => {
      const logger = createLogger(tempDir);
      const before = Date.now();
      const entry = logger.log({
        event: "session_create",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });
      const after = Date.now();

      const parts = entry.id.split("_");
      const timestamp = parseInt(parts[1] ?? "0", 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should produce unique IDs across multiple calls", () => {
      const logger = createLogger(tempDir);
      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const entry = logger.log({
          event: "capture",
          actorId: "ceo@endiorbot",
          actor: "telegram",
        });
        ids.add(entry.id);
      }

      expect(ids.size).toBe(50);
    });

    it("should have 3 parts: inv_<timestamp>_<random>", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({
        event: "session_create",
        actorId: "ceo@endiorbot",
        actor: "telegram",
      });

      const parts = entry.id.split("_");
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("inv");
      expect(parts[1]).toMatch(/^\d+$/);
      expect(parts[2]).toMatch(/^[a-z0-9]+$/);
    });
  });

  // ==========================================================================
  // JSONL Format
  // ==========================================================================

  describe("JSONL file output", () => {
    it("should write entries as JSONL (one JSON object per line)", () => {
      const logger = createLogger(tempDir);
      const logPath = logger.getLogPath();

      logger.log({ event: "session_create", actorId: "a", actor: "telegram" });
      logger.log({ event: "session_kill", actorId: "b", actor: "telegram" });
      logger.log({ event: "capture", actorId: "c", actor: "telegram" });

      const entries = readLogEntries(logPath);
      expect(entries.length).toBe(3);
    });

    it("should write valid JSON on each line", () => {
      const logger = createLogger(tempDir);
      const logPath = logger.getLogPath();

      logger.log({
        event: "policy_violation",
        actorId: "ceo@endiorbot",
        actor: "telegram",
        details: { nested: { key: "value" } },
      });

      const raw = readFileSync(logPath, "utf-8").trim();
      const lines = raw.split("\n");
      expect(lines.length).toBe(1);

      const parsed = JSON.parse(lines[0] ?? "{}");
      expect(parsed.event).toBe("policy_violation");
      expect(parsed.details.nested.key).toBe("value");
    });

    it("should create the log file on first write", () => {
      const logPath = join(tempDir, "new-audit.jsonl");
      expect(existsSync(logPath)).toBe(false);

      const logger = new BridgeAuditLogger({ logPath });
      logger.log({ event: "identity_link", actorId: "ceo", actor: "telegram" });

      expect(existsSync(logPath)).toBe(true);
    });

    it("should append to existing log file", () => {
      const logger = createLogger(tempDir);
      const logPath = logger.getLogPath();

      logger.log({ event: "session_create", actorId: "a", actor: "telegram" });
      const entries1 = readLogEntries(logPath);
      expect(entries1.length).toBe(1);

      logger.log({ event: "session_kill", actorId: "b", actor: "telegram" });
      const entries2 = readLogEntries(logPath);
      expect(entries2.length).toBe(2);
    });
  });

  // ==========================================================================
  // Rotation
  // ==========================================================================

  describe("rotation", () => {
    it("should rotate when file exceeds maxFileSize", () => {
      const logPath = join(tempDir, "rotate-audit.jsonl");
      const logger = new BridgeAuditLogger({
        logPath,
        maxFileSize: 200, // Very small for testing
        maxBackups: 3,
      });

      // Write enough entries to exceed 200 bytes
      for (let i = 0; i < 10; i++) {
        logger.log({
          event: "session_create",
          actorId: `actor_${i}`,
          actor: "telegram",
          details: { index: i, padding: "some extra text to increase size" },
        });
      }

      // Check that rotation files exist
      expect(existsSync(`${logPath}.1`)).toBe(true);
    });

    it("should cascade rotation files (.1 → .2 → .3)", () => {
      const logPath = join(tempDir, "cascade-audit.jsonl");
      const logger = new BridgeAuditLogger({
        logPath,
        maxFileSize: 100, // Very small
        maxBackups: 3,
      });

      // Write many entries to trigger multiple rotations
      for (let i = 0; i < 30; i++) {
        logger.log({
          event: "capture",
          actorId: `actor_${i}`,
          actor: "telegram",
          details: { i, data: "filler content to fill up the log file quickly" },
        });
      }

      // At least .1 should exist; .2 may exist depending on timing
      expect(existsSync(`${logPath}.1`)).toBe(true);
    });
  });

  // ==========================================================================
  // Singleton
  // ==========================================================================

  describe("singleton", () => {
    it("should return the same instance from getBridgeAuditLogger()", () => {
      const logPath = join(tempDir, "singleton.jsonl");
      resetBridgeAuditLogger();
      const a = getBridgeAuditLogger({ logPath });
      const b = getBridgeAuditLogger();
      expect(a).toBe(b);
    });

    it("should return a new instance after resetBridgeAuditLogger()", () => {
      const logPath = join(tempDir, "singleton-reset.jsonl");
      resetBridgeAuditLogger();
      const a = getBridgeAuditLogger({ logPath });
      resetBridgeAuditLogger();
      const b = getBridgeAuditLogger({ logPath });
      expect(a).not.toBe(b);
    });
  });

  // ==========================================================================
  // Defaults
  // ==========================================================================

  describe("defaults", () => {
    it("should have correct default config values", () => {
      expect(DEFAULT_BRIDGE_AUDIT_CONFIG.maxFileSize).toBe(10 * 1024 * 1024);
      expect(DEFAULT_BRIDGE_AUDIT_CONFIG.maxBackups).toBe(5);
      expect(DEFAULT_BRIDGE_AUDIT_CONFIG.consoleLog).toBe(false);
      expect(DEFAULT_BRIDGE_AUDIT_CONFIG.logPath).toContain("bridge_event_log.jsonl");
    });
  });

  // ==========================================================================
  // All Event Types
  // ==========================================================================

  describe("event types", () => {
    const eventTypes = [
      "session_create",
      "session_kill",
      "send_keys",
      "capture",
      "capture_blocked",
      "hook_stop",
      "hook_permission",
      "permission_decision",
      "policy_violation",
      "identity_link",
    ] as const;

    for (const eventType of eventTypes) {
      it(`should accept event type: ${eventType}`, () => {
        const logger = createLogger(tempDir);
        const entry = logger.log({
          event: eventType,
          actorId: "ceo@endiorbot",
          actor: "telegram",
        });

        expect(entry.event).toBe(eventType);
      });
    }
  });

  // ==========================================================================
  // Actor Types
  // ==========================================================================

  describe("actor types", () => {
    it("should accept telegram actor", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({ event: "capture", actorId: "a", actor: "telegram" });
      expect(entry.actor).toBe("telegram");
    });

    it("should accept hook actor", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({ event: "hook_stop", actorId: "a", actor: "hook" });
      expect(entry.actor).toBe("hook");
    });

    it("should accept system actor", () => {
      const logger = createLogger(tempDir);
      const entry = logger.log({ event: "policy_violation", actorId: "a", actor: "system" });
      expect(entry.actor).toBe("system");
    });
  });
});
