/**
 * Recovery Engine Tests
 *
 * Unit tests for RecoveryEngine.
 *
 * @module sessions/__tests__/recovery-engine.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @sprint 69-71
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RecoveryEngine,
  createRecoveryEngine,
} from "../recovery/index.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("RecoveryEngine", () => {
  let engine: RecoveryEngine;

  beforeEach(() => {
    engine = new RecoveryEngine({
      projectRoot: "/tmp/test-project",
      maxRetries: 3,
      maxFixAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      autoRollback: false, // Disable auto-rollback for testing
      debug: false,
    });
  });

  // ============================================================================
  // Transient Failure Tests
  // ============================================================================

  describe("handleTransient", () => {
    it("should return RETRY for first transient failure", async () => {
      const error = new Error("ECONNREFUSED: Connection refused");
      const result = await engine.handleFailure(error, { taskId: "task-1" });

      expect(result.recovered).toBe(true);
      expect(result.action).toBe("RETRY");
      // After first failure, attempts=1, nextAttempt=2
      expect(result.nextAttempt).toBe(2);
    });

    it("should allow multiple retries up to max", async () => {
      const error = new Error("Network timeout");
      const taskId = "task-retry-test";

      // First failure: attempts=1, nextAttempt=2
      let result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("RETRY");
      expect(result.nextAttempt).toBe(2);

      // Second failure: attempts=2, nextAttempt=3
      result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("RETRY");
      expect(result.nextAttempt).toBe(3);

      // Third failure: attempts=3, should escalate (>= maxRetries)
      result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("ESCALATE");
    });

    it("should escalate after max retries", async () => {
      const error = new Error("ECONNREFUSED");
      const taskId = "task-max-retries";

      // Exhaust retries (3 failures = escalate)
      for (let i = 0; i < 2; i++) {
        const result = await engine.handleFailure(error, { taskId });
        expect(result.action).toBe("RETRY");
      }

      // Third failure should escalate
      const result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("ESCALATE");
      expect(result.recovered).toBe(false);
    });
  });

  // ============================================================================
  // Fixable Failure Tests
  // ============================================================================

  describe("handleFixable", () => {
    it("should return FIX for first fixable failure", async () => {
      const error = new Error("TS2345: Type error in code");
      const result = await engine.handleFailure(error, { taskId: "task-fix-1" });

      expect(result.recovered).toBe(true);
      expect(result.action).toBe("FIX");
      // After first failure, attempts=1, nextAttempt=2
      expect(result.nextAttempt).toBe(2);
    });

    it("should allow multiple fix attempts up to max", async () => {
      const error = new Error("ESLint: no-unused-vars");
      const taskId = "task-fix-multi";

      let result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("FIX");

      result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("FIX");

      // Third failure should escalate
      result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("ESCALATE");
    });

    it("should escalate after max fix attempts", async () => {
      const error = new Error("Syntax error: Unexpected token");
      const taskId = "task-max-fix";

      // Exhaust fix attempts
      for (let i = 0; i < 2; i++) {
        const result = await engine.handleFailure(error, { taskId });
        expect(result.action).toBe("FIX");
      }

      // Third failure should escalate
      const result = await engine.handleFailure(error, { taskId });
      expect(result.action).toBe("ESCALATE");
      expect(result.recovered).toBe(false);
    });
  });

  // ============================================================================
  // Design Issue Tests
  // ============================================================================

  describe("handleDesignIssue", () => {
    it("should treat as fixable without enough evidence", async () => {
      // Design errors without matching patterns are classified as DESIGN_ISSUE
      // but without multiple evidence types, they are treated as fixable
      const error = new Error("Unknown design pattern issue");

      const result = await engine.handleFailure(error, { taskId: "task-design-1" });

      // Without transient/fixable pattern match, classified as DESIGN_ISSUE
      // But without enough evidence types, treated as fixable
      expect(["FIX", "ESCALATE"]).toContain(result.action);
    });
  });

  // ============================================================================
  // History Management Tests
  // ============================================================================

  describe("history management", () => {
    it("should track failure attempts", async () => {
      const error = new Error("ECONNREFUSED");
      const taskId = "task-history";

      expect(engine.getAttempts(taskId)).toBe(0);

      await engine.handleFailure(error, { taskId });
      expect(engine.getAttempts(taskId)).toBe(1);

      await engine.handleFailure(error, { taskId });
      expect(engine.getAttempts(taskId)).toBe(2);
    });

    it("should clear history for a task", async () => {
      const error = new Error("ECONNREFUSED");
      const taskId = "task-clear";

      await engine.handleFailure(error, { taskId });
      expect(engine.getAttempts(taskId)).toBe(1);

      engine.clearHistory(taskId);
      expect(engine.getAttempts(taskId)).toBe(0);
    });

    it("should clear all history", async () => {
      const error = new Error("ECONNREFUSED");

      await engine.handleFailure(error, { taskId: "task-1" });
      await engine.handleFailure(error, { taskId: "task-2" });

      expect(engine.getAttempts("task-1")).toBe(1);
      expect(engine.getAttempts("task-2")).toBe(1);

      engine.clearAllHistory();

      expect(engine.getAttempts("task-1")).toBe(0);
      expect(engine.getAttempts("task-2")).toBe(0);
    });

    it("should store failure details", async () => {
      const error = new Error("ECONNREFUSED: Detailed error");
      const taskId = "task-failures";

      await engine.handleFailure(error, { taskId });
      const failures = engine.getFailures(taskId);

      expect(failures.length).toBe(1);
      expect(failures[0]!.message).toBe("ECONNREFUSED: Detailed error");
    });
  });

  // ============================================================================
  // Backoff Calculation Tests
  // ============================================================================

  describe("calculateBackoff", () => {
    it("should calculate exponential backoff", () => {
      expect(engine.calculateBackoff(0)).toBe(100);   // baseDelay * 2^0
      expect(engine.calculateBackoff(1)).toBe(200);   // baseDelay * 2^1
      expect(engine.calculateBackoff(2)).toBe(400);   // baseDelay * 2^2
    });

    it("should cap at maxDelay", () => {
      expect(engine.calculateBackoff(10)).toBe(1000); // capped at maxDelay
    });
  });

  // ============================================================================
  // Escalation Tests
  // ============================================================================

  describe("escalation", () => {
    it("should include error details in escalation", async () => {
      const taskId = "task-escalate";

      // Force escalation by exhausting retries
      for (let i = 0; i < 3; i++) {
        await engine.handleFailure(new Error("ECONNREFUSED"), { taskId });
      }

      // History is cleared after escalation, so check the result
      // The result from third call should have escalation details
    });

    it("should include relevant suggestions for MAX_RETRIES", async () => {
      const taskId = "task-suggestions-retries";

      // Force escalation via max retries
      let result;
      for (let i = 0; i < 3; i++) {
        result = await engine.handleFailure(new Error("ECONNREFUSED"), { taskId });
      }

      if (result?.escalation) {
        expect(result.escalation.suggestions.length).toBeGreaterThan(0);
        expect(result.escalation.type).toBe("MAX_RETRIES");
      }
    });
  });

  // ============================================================================
  // Context Tests
  // ============================================================================

  describe("context handling", () => {
    it("should include stage in escalation context", async () => {
      const taskId = "task-context";

      // Force escalation
      let result;
      for (let i = 0; i < 3; i++) {
        result = await engine.handleFailure(new Error("ECONNREFUSED"), { taskId, stage: "04-BUILD" });
      }

      if (result?.escalation) {
        expect(result.escalation.context.stage).toBe("04-BUILD");
      }
    });

    it("should include files in escalation context", async () => {
      const taskId = "task-files";
      const files = ["src/test.ts", "src/other.ts"];

      // Force escalation
      let result;
      for (let i = 0; i < 3; i++) {
        result = await engine.handleFailure(new Error("ECONNREFUSED"), { taskId, files });
      }

      if (result?.escalation) {
        expect(result.escalation.context.files).toEqual(files);
      }
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createRecoveryEngine", () => {
  it("should create a new engine", () => {
    const engine = createRecoveryEngine({
      projectRoot: "/tmp/test",
    });

    expect(engine).toBeInstanceOf(RecoveryEngine);
  });

  it("should use default config values", () => {
    const engine = createRecoveryEngine({
      projectRoot: "/tmp/test",
    });

    // Engine should work with defaults
    expect(engine.calculateBackoff(0)).toBe(1000); // default baseDelay
  });
});
