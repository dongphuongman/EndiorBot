/**
 * Gate Engine Tests (Sprint 80 Supplement — Steps 12-14)
 *
 * Tests for:
 * - gate: checker queries gate-store (not a stub)
 * - commandRunner injection makes command: checks functional
 * - Without commandRunner, command: checks return pending
 * - coverage: checker returns pending (explicit stub, CTO C3)
 * - OTT gate info message references "gate recommend"
 * - G-Sprint checklist path aligned with docs/04-build/sprints/
 *
 * @module tests/sdlc/gates/gate-engine
 * @version 1.0.0
 * @date 2026-03-06
 * @status ACTIVE - Sprint 80
 * @authority ADR-023 SDLC-Aligned Content Quality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock gate-store BEFORE importing gate-engine so the mock is picked up
const mockIsGateConfirmed = vi.fn().mockReturnValue(false);
vi.mock("../../../src/sdlc/gates/gate-store.js", () => ({
  isGateConfirmed: (...args: unknown[]) => mockIsGateConfirmed(...args),
}));

import { GateEngine, resetGateEngine } from "../../../src/sdlc/gates/gate-engine.js";
import { getChecklist } from "../../../src/sdlc/gates/gate-checklist.js";
import { handleGateCommand } from "../../../src/channels/telegram/telegram-commands.js";

// ============================================================================
// Helpers
// ============================================================================

function createTempProject(): string {
  const dir = join(tmpdir(), `gate-engine-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================================================================
// gate: checker (Step 12b)
// ============================================================================

describe("GateEngine — gate: checker", () => {
  let projectDir: string;

  beforeEach(() => {
    resetGateEngine();
    mockIsGateConfirmed.mockReturnValue(false);
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("gate:G3 checker returns 'pass' when G3 is confirmed in gate-store", async () => {
    // Mock isGateConfirmed to return true for G3
    mockIsGateConfirmed.mockReturnValue(true);

    const engine = new GateEngine({ projectRoot: projectDir, tier: "STANDARD" });

    // G4 checklist has g4-g3-passed item with checker "gate:G3"
    const evaluation = await engine.evaluate("G4", "default", "test-project");
    const g3Item = evaluation.checklist.find((i) => i.id === "g4-g3-passed");

    expect(g3Item).toBeDefined();
    expect(g3Item!.status).toBe("pass");
    // Evidence should be collected
    const gateEvidence = evaluation.evidence.find((e) => e.path === "gate-confirmation:G3");
    expect(gateEvidence).toBeDefined();
    expect(gateEvidence!.description).toContain("Gate G3 confirmed");
  });

  it("gate:G3 checker returns 'pending' when G3 is not confirmed", async () => {
    mockIsGateConfirmed.mockReturnValue(false);

    const engine = new GateEngine({ projectRoot: projectDir, tier: "STANDARD" });
    const evaluation = await engine.evaluate("G4", "default", "test-project");
    const g3Item = evaluation.checklist.find((i) => i.id === "g4-g3-passed");

    expect(g3Item).toBeDefined();
    expect(g3Item!.status).toBe("pending");
  });

  it("gate: checker uses basename(projectRoot) for projectId", async () => {
    mockIsGateConfirmed.mockReturnValue(false);
    const customDir = join(tmpdir(), "my-project-abc");
    mkdirSync(customDir, { recursive: true });

    const engine = new GateEngine({ projectRoot: customDir, tier: "STANDARD" });
    await engine.evaluate("G4", "default", "test-project");

    // isGateConfirmed should have been called with basename of projectRoot
    expect(mockIsGateConfirmed).toHaveBeenCalledWith("my-project-abc", "G3");

    rmSync(customDir, { recursive: true, force: true });
  });
});

// ============================================================================
// command: checker + commandRunner (Step 12c)
// ============================================================================

describe("GateEngine — command: checker", () => {
  let projectDir: string;

  beforeEach(() => {
    resetGateEngine();
    mockIsGateConfirmed.mockReturnValue(false);
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("command: checks return 'pending' without commandRunner", async () => {
    const engine = new GateEngine({ projectRoot: projectDir, tier: "STANDARD" });
    const evaluation = await engine.evaluate("G3", "default", "test-project");

    // G3 has command:pnpm build, command:pnpm lint, command:pnpm test
    const buildItem = evaluation.checklist.find((i) => i.id === "g3-build-passes");
    const lintItem = evaluation.checklist.find((i) => i.id === "g3-lint-passes");
    const testsItem = evaluation.checklist.find((i) => i.id === "g3-tests-pass");

    expect(buildItem).toBeDefined();
    expect(buildItem!.status).toBe("pending");
    expect(lintItem!.status).toBe("pending");
    expect(testsItem!.status).toBe("pending");
  });

  it("commandRunner injection makes command: checks functional (pass)", async () => {
    const mockRunner = vi.fn().mockResolvedValue({ success: true, output: "ok" });
    const engine = new GateEngine({
      projectRoot: projectDir,
      tier: "STANDARD",
      commandRunner: mockRunner,
    });

    const evaluation = await engine.evaluate("G3", "default", "test-project");

    const buildItem = evaluation.checklist.find((i) => i.id === "g3-build-passes");
    expect(buildItem!.status).toBe("pass");

    // commandRunner should have been called for each command: checker
    expect(mockRunner).toHaveBeenCalledWith("pnpm build");
    expect(mockRunner).toHaveBeenCalledWith("pnpm lint");
    expect(mockRunner).toHaveBeenCalledWith("pnpm test");
  });

  it("commandRunner returns fail when command fails", async () => {
    const mockRunner = vi.fn().mockResolvedValue({ success: false, output: "error" });
    const engine = new GateEngine({
      projectRoot: projectDir,
      tier: "STANDARD",
      commandRunner: mockRunner,
    });

    const evaluation = await engine.evaluate("G3", "default", "test-project");

    const buildItem = evaluation.checklist.find((i) => i.id === "g3-build-passes");
    expect(buildItem!.status).toBe("fail");
  });
});

// ============================================================================
// coverage: checker (CTO C3 — explicit stub)
// ============================================================================

describe("GateEngine — coverage: checker", () => {
  let projectDir: string;

  beforeEach(() => {
    resetGateEngine();
    mockIsGateConfirmed.mockReturnValue(false);
    projectDir = createTempProject();
  });

  afterEach(() => {
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("coverage: checker returns 'pending' (stub, CTO C3 out-of-scope)", async () => {
    const engine = new GateEngine({ projectRoot: projectDir, tier: "STANDARD" });
    const evaluation = await engine.evaluate("G3", "default", "test-project");

    const coverageItem = evaluation.checklist.find((i) => i.id === "g3-coverage");
    expect(coverageItem).toBeDefined();
    expect(coverageItem!.status).toBe("pending");
  });
});

// ============================================================================
// OTT /gate command (Step 12a)
// ============================================================================

describe("OTT /gate command — Telegram-native response", () => {
  it("gate info message uses @pm agent mention (not CLI reference)", () => {
    const result = handleGateCommand(["G2"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("@pm check gate");
    expect(result.response).not.toContain("endiorbot");
  });

  it("gate help message shows usage example", () => {
    const result = handleGateCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("/gate <gateId>");
  });
});

// ============================================================================
// G-Sprint checklist path alignment (Step 13)
// ============================================================================

describe("G-Sprint checklist path alignment", () => {
  it("G-Sprint documentation checker targets docs/04-build/sprints/", () => {
    const checklist = getChecklist("G-Sprint", "STANDARD");
    const docItem = checklist.items.find((i) => i.id === "gsprint-documentation");
    expect(docItem).toBeDefined();
    expect(docItem!.checker).toBe("glob:docs/04-build/sprints/sprint-*-plan.md");
  });

  it("G-Sprint documentation checker does NOT target docs/01-planning/", () => {
    const checklist = getChecklist("G-Sprint", "STANDARD");
    const docItem = checklist.items.find((i) => i.id === "gsprint-documentation");
    expect(docItem!.checker).not.toContain("01-planning");
  });
});
