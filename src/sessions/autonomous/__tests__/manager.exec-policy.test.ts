/**
 * Integration tests for manager.ts exec-policy hook (Sprint 132 M1).
 *
 * Tests the checkCommand hook at manager.ts:666 — fires before requiresGateC.
 *
 * Per M1-exec-policy-design.md §7 integration test plan.
 *
 * @module sessions/autonomous/__tests__/manager.exec-policy
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { AutonomousSessionManager } from "../manager.js";
import { writeStore } from "../../../security/exec-approvals/store.js";
import { readAuditTail } from "../../../security/exec-approvals/audit.js";
import { ResilienceState } from "../../state-machine.js";

let tmpStateDir: string;

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-mgr-ep-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;
  process.env["NODE_ENV"] = "test";
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  delete process.env["ENDIORBOT_AUTO_HANDOFF"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

function makeManager(overrides: Record<string, unknown> = {}): AutonomousSessionManager {
  return new AutonomousSessionManager({
    projectRoot: tmpStateDir,
    projectId: "test-project",
    gate: "B",
    ...overrides,
  });
}

describe("manager exec-policy integration", () => {
  describe("originChannel field", () => {
    it("defaults to cli when not specified", () => {
      const manager = makeManager();
      const config = (manager as unknown as { config: { originChannel: string } }).config;
      expect(config.originChannel).toBe("cli");
    });

    it("accepts explicit telegram channel", () => {
      const manager = makeManager({ originChannel: "telegram" });
      const config = (manager as unknown as { config: { originChannel: string } }).config;
      expect(config.originChannel).toBe("telegram");
    });

    it("accepts explicit web channel", () => {
      const manager = makeManager({ originChannel: "web" });
      const config = (manager as unknown as { config: { originChannel: string } }).config;
      expect(config.originChannel).toBe("web");
    });
  });

  describe("exec-policy fires BEFORE requiresGateC (Gate B block)", () => {
    it("strict preset with deny promptFn causes task to fail/escalate before Gate C", async () => {
      writeStore({ preset: "strict", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      // Inject a deny promptFn so the test doesn't block on stdin
      const manager = makeManager({
        originChannel: "cli",
        gate: "B",
        promptFn: async () => false, // CEO denies
      });
      manager.addTask({
        type: "code_generation",
        description: "write some code",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });

      await manager.start();
      await manager.runLoop();

      // Exec-policy fired and denied (CEO rejected prompt) → task escalated
      const status = manager.getStatus();
      expect(status.tasksFailed + status.escalationCount).toBeGreaterThan(0);

      // Audit record shows exec-policy ran with strict preset
      const records = readAuditTail(10);
      const execPolicyRecords = records.filter((r) => r.preset === "strict");
      expect(execPolicyRecords.length).toBeGreaterThan(0);
    });

    it("open preset allows — audit shows allow + cli origin", async () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      const manager = makeManager({ originChannel: "cli", gate: "B" });
      manager.addTask({
        type: "documentation",
        description: "write docs for the module",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });

      await manager.start();
      await manager.runLoop();

      const records = readAuditTail(10);
      const allowRecords = records.filter((r) => r.decision === "allow" && r.originChannel === "cli");
      expect(allowRecords.length).toBeGreaterThan(0);
    });
  });

  describe("non-CLI origin: fail-closed (ADR-046 Amendment 1)", () => {
    it("telegram origin fails closed — audit shows deny + telegram", async () => {
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      const manager = makeManager({ originChannel: "telegram", gate: "B" });
      manager.addTask({
        type: "documentation",
        description: "write docs",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });

      await manager.start();
      await manager.runLoop();

      const records = readAuditTail(10);
      const deniedOTT = records.filter(
        (r) => r.decision === "deny" && r.originChannel === "telegram"
      );
      expect(deniedOTT.length).toBeGreaterThan(0);
    });

    it("audit log records originChannel:telegram correctly", async () => {
      writeStore({ preset: "balanced", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      const manager = makeManager({ originChannel: "telegram", gate: "B" });
      manager.addTask({
        type: "documentation",
        description: "write docs",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });

      await manager.start();
      await manager.runLoop();

      const records = readAuditTail(10);
      const telegramRecords = records.filter((r) => r.originChannel === "telegram");
      expect(telegramRecords.length).toBeGreaterThan(0);
      // All telegram records should be denied in M1
      for (const r of telegramRecords) {
        expect(r.decision).toBe("deny");
      }
    });
  });

  describe("autoHandoff in audit record", () => {
    it("records autoHandoff:false when env is unset", async () => {
      delete process.env["ENDIORBOT_AUTO_HANDOFF"];
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      const manager = makeManager({ originChannel: "cli", gate: "B" });
      manager.addTask({
        type: "documentation",
        description: "scan project",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });
      await manager.start();
      await manager.runLoop();

      const records = readAuditTail(10);
      expect(records.some((r) => r.autoHandoff === false)).toBe(true);
    });

    it("records autoHandoff:true when env is set", async () => {
      process.env["ENDIORBOT_AUTO_HANDOFF"] = "true";
      writeStore({ preset: "open", extraAllowlist: [], extraHardDeny: [], updatedAt: "2026-04-11T00:00:00.000Z" });

      const manager = makeManager({ originChannel: "cli", gate: "B" });
      manager.addTask({
        type: "documentation",
        description: "scan project",
        stage: ResilienceState.BUILD,
        priority: 1,
        estimatedCost: 0.01,
      });
      await manager.start();
      await manager.runLoop();

      const records = readAuditTail(10);
      expect(records.some((r) => r.autoHandoff === true)).toBe(true);
    });
  });
});
