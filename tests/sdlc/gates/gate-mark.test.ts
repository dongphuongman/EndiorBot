/**
 * Gate Mark Tests (Sprint 143 A3)
 *
 * Tests the team-level manual item completion flow:
 *   mark item → evaluate gate → confirm without --force
 *
 * CEO bug report: "đã confirm mà phải dùng force luôn luôn là không đúng"
 *
 * @module tests/sdlc/gates/gate-mark
 * @version 1.0.0
 * @date 2026-04-26
 * @status ACTIVE — Sprint 143
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  saveGateItemMark,
  loadGateMarks,
  isItemMarked,
  getItemMark,
  removeGateItemMark,
  type GateItemMark,
} from "../../../src/sdlc/gates/gate-mark-store.js";
import { GateEngine } from "../../../src/sdlc/gates/gate-engine.js";

// ============================================================================
// Helpers
// ============================================================================

let tmpStateDir: string;
let tmpProjectDir: string;

function createTempProject(): string {
  const dir = join(tmpdir(), `gate-mark-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-mark-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;

  tmpProjectDir = createTempProject();

  // Create minimal SDLC structure for G0 auto-checks
  mkdirSync(join(tmpProjectDir, "docs", "00-foundation"), { recursive: true });
  writeFileSync(join(tmpProjectDir, "docs", "00-foundation", "problem-statement.md"), "# Problem\nTest problem.");
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
    rmSync(tmpProjectDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

// ============================================================================
// Mark Store CRUD
// ============================================================================

describe("gate-mark-store CRUD", () => {
  it("saves and loads a mark", () => {
    const mark: GateItemMark = {
      gateId: "G1",
      itemId: "g1-stakeholder-signoff",
      status: "pass",
      evidence: "CEO approved via Telegram 2026-04-26",
      markedAt: "2026-04-26T10:00:00.000Z",
      markedBy: "team",
    };

    saveGateItemMark("test-project", mark);
    const loaded = loadGateMarks("test-project");

    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.gateId).toBe("G1");
    expect(loaded[0]!.itemId).toBe("g1-stakeholder-signoff");
    expect(loaded[0]!.evidence).toBe("CEO approved via Telegram 2026-04-26");
  });

  it("isItemMarked returns true after save", () => {
    saveGateItemMark("test-project", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "CEO said go",
      markedAt: new Date().toISOString(),
      markedBy: "team",
    });

    expect(isItemMarked("test-project", "G0", "g0-ceo-approval")).toBe(true);
    expect(isItemMarked("test-project", "G0", "nonexistent")).toBe(false);
  });

  it("getItemMark returns the mark details", () => {
    saveGateItemMark("test-project", {
      gateId: "G1",
      itemId: "g1-acceptance-criteria",
      status: "pass",
      evidence: "ACs in requirements.md v1.1",
      markedAt: "2026-04-26T11:00:00.000Z",
      markedBy: "team",
    });

    const mark = getItemMark("test-project", "G1", "g1-acceptance-criteria");
    expect(mark).toBeDefined();
    expect(mark!.evidence).toBe("ACs in requirements.md v1.1");
  });

  it("replaces existing mark for same gate+item", () => {
    saveGateItemMark("test-project", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "First approval",
      markedAt: "2026-04-26T10:00:00.000Z",
      markedBy: "team",
    });

    saveGateItemMark("test-project", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "Updated approval with more detail",
      markedAt: "2026-04-26T12:00:00.000Z",
      markedBy: "team",
    });

    const marks = loadGateMarks("test-project");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.evidence).toBe("Updated approval with more detail");
  });

  it("removeGateItemMark clears a mark", () => {
    saveGateItemMark("test-project", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "Approved",
      markedAt: new Date().toISOString(),
      markedBy: "team",
    });

    expect(isItemMarked("test-project", "G0", "g0-ceo-approval")).toBe(true);

    const removed = removeGateItemMark("test-project", "G0", "g0-ceo-approval");
    expect(removed).toBe(true);
    expect(isItemMarked("test-project", "G0", "g0-ceo-approval")).toBe(false);
  });

  it("removeGateItemMark returns false for nonexistent mark", () => {
    expect(removeGateItemMark("test-project", "G0", "nonexistent")).toBe(false);
  });

  it("loadGateMarks returns empty array for unknown project", () => {
    expect(loadGateMarks("no-such-project")).toEqual([]);
  });
});

// ============================================================================
// Gate Engine Integration — mark → evaluate → PASS without --force
// ============================================================================

describe("GateEngine + marks: evaluate respects persisted marks", () => {
  it("G0 with CEO approval marked → evaluates as PASS (SSC-6 core test)", async () => {
    // G0 has: problem-statement (auto, file), business-case (auto, STANDARD), ceo-approval (manual)
    // We create the auto-check file + mark the manual item → should PASS

    // Auto-check: problem-statement.md exists (created in beforeEach)
    // Mark: g0-ceo-approval
    saveGateItemMark("test-proj", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "CEO approved via Telegram",
      markedAt: new Date().toISOString(),
      markedBy: "team",
    });

    const engine = new GateEngine({
      projectRoot: tmpProjectDir,
      tier: "LITE", // LITE tier: business-case is not required (minTier: STANDARD)
    });

    const evaluation = await engine.evaluate("G0", "default", "test-proj");

    // With LITE tier: only problem-statement (auto, pass) + ceo-approval (marked, pass)
    expect(evaluation.result).toBe("PASS");
    expect(evaluation.summary.passed).toBeGreaterThanOrEqual(2);
  });

  it("G0 without mark → evaluates as PENDING (manual items block)", async () => {
    // Same setup but WITHOUT marking ceo-approval
    const engine = new GateEngine({
      projectRoot: tmpProjectDir,
      tier: "LITE",
    });

    const evaluation = await engine.evaluate("G0", "default", "test-proj-no-mark");

    // ceo-approval is still manual/pending → gate is PENDING
    expect(evaluation.result).toBe("PENDING");
  });

  it("marking auto-checkable item has no effect (auto-checks take precedence)", async () => {
    // Mark an auto-check item — engine should use auto-check result, not the mark
    saveGateItemMark("test-proj", {
      gateId: "G0",
      itemId: "g0-problem-statement",
      status: "pass",
      evidence: "Manually marked but this is auto-checkable",
      markedAt: new Date().toISOString(),
      markedBy: "team",
    });

    const engine = new GateEngine({
      projectRoot: tmpProjectDir,
      tier: "LITE",
    });

    const evaluation = await engine.evaluate("G0", "default", "test-proj");

    // problem-statement passes via auto-check (file exists), mark is ignored
    // ceo-approval is NOT marked for this project → PENDING
    expect(evaluation.result).toBe("PENDING");
  });
});

// ============================================================================
// File permissions
// ============================================================================

describe("gate-mark-store file security", () => {
  it("creates mark file with 0o600 permissions", () => {
    const { statSync } = require("node:fs");

    saveGateItemMark("perm-test", {
      gateId: "G0",
      itemId: "g0-ceo-approval",
      status: "pass",
      evidence: "Permission test",
      markedAt: new Date().toISOString(),
      markedBy: "team",
    });

    const storePath = join(tmpStateDir, "gate-marks", "perm-test.json");
    const stats = statSync(storePath);
    // 0o600 = owner read+write only (octal 384 = 0o600)
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
