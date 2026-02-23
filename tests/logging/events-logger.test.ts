/**
 * Events Logger Tests
 *
 * Unit tests for event logging functionality (Sprint 35 Day 1).
 *
 * @module tests/logging/events-logger
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 1
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  // Event Types
  type EventLog,
  type EventPhase,
  type EventOutcome,
  createCheckpointEvent,
  createResumeEvent,
  createToolCallEvent,
  createGateEvent,
  createConflictEvent,
  createRollbackEvent,
  serializeEvent,
  deserializeEvent,
} from "../../src/logging/event-types.js";
import { EventsWriter, createEventsWriter } from "../../src/logging/events-writer.js";
import {
  EventsLogger,
  getEventsLogger,
  createEventsLogger,
} from "../../src/logging/events-logger.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDir(): string {
  const testDir = path.join(os.tmpdir(), `endiorbot-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDir(testDir: string): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Event Types Tests
// ============================================================================

describe("Event Types", () => {
  describe("createCheckpointEvent", () => {
    it("should create checkpoint event with correct fields", () => {
      const event = createCheckpointEvent("save_checkpoint", "success", 12, {
        reason: "gate_pass",
        gate: "G1",
      });

      expect(event.phase).toBe("checkpoint");
      expect(event.action).toBe("save_checkpoint");
      expect(event.outcome).toBe("success");
      expect(event.files_touched_count).toBe(12);
      expect(event.retry_count).toBe(0);
      expect(event.context).toEqual({ reason: "gate_pass", gate: "G1" });
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it("should create checkpoint event without context", () => {
      const event = createCheckpointEvent("compress", "success", 5);

      expect(event.phase).toBe("checkpoint");
      expect(event.action).toBe("compress");
      expect(event.context).toBeUndefined();
    });
  });

  describe("createResumeEvent", () => {
    it("should create resume event with retry count", () => {
      const event = createResumeEvent("restore_session", "success", 8, 2, {
        checkpoint_id: "ckpt-123",
      });

      expect(event.phase).toBe("resume");
      expect(event.action).toBe("restore_session");
      expect(event.outcome).toBe("success");
      expect(event.files_touched_count).toBe(8);
      expect(event.retry_count).toBe(2);
      expect(event.context).toEqual({ checkpoint_id: "ckpt-123" });
    });
  });

  describe("createToolCallEvent", () => {
    it("should create tool call event with cost delta", () => {
      const event = createToolCallEvent("file_write", "write_config", "success", 0.001, 0, {
        path: "config.json",
      });

      expect(event.phase).toBe("tool_call");
      expect(event.tool).toBe("file_write");
      expect(event.action).toBe("write_config");
      expect(event.outcome).toBe("success");
      expect(event.cost_delta).toBe(0.001);
      expect(event.retry_count).toBe(0);
    });

    it("should create tool call event without cost", () => {
      const event = createToolCallEvent("git_status", "check_status", "success");

      expect(event.phase).toBe("tool_call");
      expect(event.tool).toBe("git_status");
      expect(event.cost_delta).toBeUndefined();
    });
  });

  describe("createGateEvent", () => {
    it("should create gate evaluation event", () => {
      const event = createGateEvent("G1", "success", { evidence_count: "5" });

      expect(event.phase).toBe("gate_eval");
      expect(event.action).toBe("evaluate_G1");
      expect(event.outcome).toBe("success");
      expect(event.context?.gate).toBe("G1");
      expect(event.context?.evidence_count).toBe("5");
    });
  });

  describe("createConflictEvent", () => {
    it("should create conflict detection event", () => {
      const event = createConflictEvent("detect_conflicts", "partial", 3, {
        trivial: "2",
        semantic: "1",
      });

      expect(event.phase).toBe("conflict");
      expect(event.action).toBe("detect_conflicts");
      expect(event.outcome).toBe("partial");
      expect(event.files_touched_count).toBe(3);
    });
  });

  describe("createRollbackEvent", () => {
    it("should create rollback event", () => {
      const event = createRollbackEvent("git_reset", "success", 10, {
        commit: "abc123",
      });

      expect(event.phase).toBe("rollback");
      expect(event.action).toBe("git_reset");
      expect(event.outcome).toBe("success");
      expect(event.files_touched_count).toBe(10);
    });
  });

  describe("serializeEvent / deserializeEvent", () => {
    it("should serialize and deserialize event correctly", () => {
      const original = createCheckpointEvent("save_checkpoint", "success", 12, {
        reason: "gate_pass",
      });

      const json = serializeEvent(original);
      const parsed = deserializeEvent(json);

      expect(parsed.phase).toBe(original.phase);
      expect(parsed.action).toBe(original.action);
      expect(parsed.outcome).toBe(original.outcome);
      expect(parsed.files_touched_count).toBe(original.files_touched_count);
      expect(parsed.retry_count).toBe(original.retry_count);
      expect(parsed.context).toEqual(original.context);
      expect(parsed.timestamp.getTime()).toBe(original.timestamp.getTime());
    });

    it("should handle event without optional fields", () => {
      const original: EventLog = {
        timestamp: new Date(),
        phase: "execute",
        action: "test_action",
        outcome: "success",
        files_touched_count: 0,
        retry_count: 0,
      };

      const json = serializeEvent(original);
      const parsed = deserializeEvent(json);

      expect(parsed.tool).toBeUndefined();
      expect(parsed.cost_delta).toBeUndefined();
      expect(parsed.context).toBeUndefined();
    });

    it("should preserve tool and cost_delta fields", () => {
      const original = createToolCallEvent("api_call", "fetch_data", "success", 0.05);

      const json = serializeEvent(original);
      const parsed = deserializeEvent(json);

      expect(parsed.tool).toBe("api_call");
      expect(parsed.cost_delta).toBe(0.05);
    });
  });
});

// ============================================================================
// Events Writer Tests
// ============================================================================

describe("EventsWriter", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("basic operations", () => {
    it("should create events writer with file path", () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      expect(writer.getFilePath()).toBe(filePath);
      expect(writer.isClosed()).toBe(false);
    });

    it("should write event to file", async () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      const event = createCheckpointEvent("test", "success", 1);
      await writer.write(event);
      await writer.close();

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.trim().split("\n");

      expect(lines.length).toBe(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.action).toBe("test");
      expect(parsed.outcome).toBe("success");
    });

    it("should write multiple events in append mode", async () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      await writer.write(createCheckpointEvent("event1", "success", 1));
      await writer.write(createCheckpointEvent("event2", "success", 2));
      await writer.write(createCheckpointEvent("event3", "failure", 3));
      await writer.close();

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.trim().split("\n");

      expect(lines.length).toBe(3);

      const events = lines.map((line) => JSON.parse(line));
      expect(events[0].action).toBe("event1");
      expect(events[1].action).toBe("event2");
      expect(events[2].action).toBe("event3");
      expect(events[2].outcome).toBe("failure");
    });

    it("should create directory if not exists", async () => {
      const filePath = path.join(testDir, "nested", "dir", "events.jsonl");
      const writer = new EventsWriter(filePath);

      await writer.write(createCheckpointEvent("test", "success", 1));
      await writer.close();

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("writeBatch", () => {
    it("should write batch of events", async () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      const events = [
        createCheckpointEvent("batch1", "success", 1),
        createCheckpointEvent("batch2", "success", 2),
        createCheckpointEvent("batch3", "success", 3),
      ];

      await writer.writeBatch(events);
      await writer.close();

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.trim().split("\n");

      expect(lines.length).toBe(3);
    });
  });

  describe("flush and close", () => {
    it("should flush pending writes", async () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      await writer.write(createCheckpointEvent("test", "success", 1));
      await writer.flush();

      // File should exist and have content
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");
      expect(content.length).toBeGreaterThan(0);

      await writer.close();
    });

    it("should prevent writes after close", async () => {
      const filePath = path.join(testDir, "events.jsonl");
      const writer = new EventsWriter(filePath);

      await writer.close();

      await expect(writer.write(createCheckpointEvent("test", "success", 1))).rejects.toThrow(
        "EventsWriter is closed",
      );
    });
  });
});

// ============================================================================
// Events Logger Tests
// ============================================================================

describe("EventsLogger", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("basic operations", () => {
    it("should create events logger with default options", () => {
      const logger = new EventsLogger({ writeToFile: false });

      expect(logger.getLogger()).toBeDefined();
      expect(logger.getWriter()).toBeNull();
    });

    it("should create events logger with file writing", async () => {
      const logger = new EventsLogger({ stateDir: testDir });

      expect(logger.getWriter()).not.toBeNull();
      expect(logger.getEventsFilePath()).toBe(`${testDir}/events.jsonl`);

      await logger.close();
    });
  });

  describe("event logging methods", () => {
    it("should log checkpoint event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.checkpoint("save_checkpoint", "success", 12, {
        reason: "gate_pass",
      });
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("checkpoint");
      expect(event.action).toBe("save_checkpoint");
      expect(event.outcome).toBe("success");
      expect(event.files_touched_count).toBe(12);
      expect(event.context.reason).toBe("gate_pass");
    });

    it("should log resume event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.resume("restore_session", "success", 8, 1, { checkpoint_id: "ckpt-123" });
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("resume");
      expect(event.action).toBe("restore_session");
      expect(event.retry_count).toBe(1);
    });

    it("should log tool call event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.toolCall("file_write", "write_config", "success", 0.001);
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("tool_call");
      expect(event.tool).toBe("file_write");
      expect(event.cost_delta).toBe(0.001);
    });

    it("should log gate event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.gate("G2", "success", { evidence_count: "10" });
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("gate_eval");
      expect(event.action).toBe("evaluate_G2");
      expect(event.context.gate).toBe("G2");
    });

    it("should log conflict event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.conflict("detect_conflicts", "partial", 3);
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("conflict");
      expect(event.files_touched_count).toBe(3);
    });

    it("should log rollback event", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.rollback("git_reset", "success", 10);
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("rollback");
      expect(event.files_touched_count).toBe(10);
    });

    it("should log execute event with all options", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.execute("execute", "custom_action", "success", {
        tool: "custom_tool",
        costDelta: 0.5,
        filesTouchedCount: 5,
        retryCount: 2,
        context: { key: "value" },
      });
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.phase).toBe("execute");
      expect(event.action).toBe("custom_action");
      expect(event.tool).toBe("custom_tool");
      expect(event.cost_delta).toBe(0.5);
      expect(event.files_touched_count).toBe(5);
      expect(event.retry_count).toBe(2);
      expect(event.context.key).toBe("value");
    });
  });

  describe("multiple events", () => {
    it("should log multiple events in sequence", async () => {
      const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

      await logger.checkpoint("start_checkpoint", "success", 0);
      await logger.toolCall("file_read", "read_state", "success");
      await logger.toolCall("file_write", "save_state", "success", 0.001);
      await logger.checkpoint("complete_checkpoint", "success", 12);
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      const lines = content.trim().split("\n");

      expect(lines.length).toBe(4);

      const events = lines.map((line) => JSON.parse(line));
      expect(events[0].action).toBe("start_checkpoint");
      expect(events[1].tool).toBe("file_read");
      expect(events[2].tool).toBe("file_write");
      expect(events[3].action).toBe("complete_checkpoint");
    });
  });

  describe("factory functions", () => {
    it("should create named events logger", async () => {
      const logger = createEventsLogger("test-logger", {
        stateDir: testDir,
        logToConsole: false,
      });

      await logger.checkpoint("test", "success", 1);
      await logger.close();

      const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
      expect(content.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Events Logger Integration", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it("should handle complete checkpoint flow", async () => {
    const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

    // Simulate checkpoint creation flow
    await logger.checkpoint("start_checkpoint", "success", 0, { reason: "manual" });
    await logger.toolCall("git_status", "check_uncommitted", "success");
    await logger.toolCall("file_hash", "compute_hashes", "success");
    await logger.checkpoint("save_state", "success", 15);
    await logger.checkpoint("compress", "success", 1);
    await logger.checkpoint("complete_checkpoint", "success", 0, { checkpoint_id: "ckpt-123" });
    await logger.close();

    const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events.length).toBe(6);

    // Verify flow
    expect(events[0].action).toBe("start_checkpoint");
    expect(events[0].context?.reason).toBe("manual");
    expect(events[5].action).toBe("complete_checkpoint");
    expect(events[5].context?.checkpoint_id).toBe("ckpt-123");
  });

  it("should handle resume flow with conflicts", async () => {
    const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

    // Simulate resume with conflicts
    await logger.resume("load_checkpoint", "success", 0, 0, { checkpoint_id: "ckpt-123" });
    await logger.resume("version_check", "success", 0);
    await logger.conflict("detect_conflicts", "partial", 3, { trivial: "2", semantic: "1" });
    await logger.conflict("auto_resolve_trivial", "success", 2);
    await logger.resume("prompt_user", "success", 1, 0, { resolution: "merge_manual" });
    await logger.resume("restore_session", "success", 0);
    await logger.resume("complete_resume", "success", 0);
    await logger.close();

    const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events.length).toBe(7);

    // Verify conflict handling
    const conflictEvent = events.find((e) => e.action === "detect_conflicts");
    expect(conflictEvent?.outcome).toBe("partial");
    expect(conflictEvent?.files_touched_count).toBe(3);
  });

  it("should handle failure events", async () => {
    const logger = new EventsLogger({ stateDir: testDir, logToConsole: false });

    await logger.checkpoint("start_checkpoint", "success", 0);
    await logger.toolCall("file_write", "save_state", "failure", undefined, 3, {
      error: "ENOSPC",
    });
    await logger.rollback("revert_changes", "success", 5);
    await logger.checkpoint("abort_checkpoint", "failure", 0);
    await logger.close();

    const content = fs.readFileSync(`${testDir}/events.jsonl`, "utf8");
    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    const failureEvent = events.find((e) => e.action === "save_state");
    expect(failureEvent?.outcome).toBe("failure");
    expect(failureEvent?.retry_count).toBe(3);
  });
});
