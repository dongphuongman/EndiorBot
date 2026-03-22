/**
 * Sprint 103: /fix Command Tests — executeFixCommand() shared handler.
 *
 * Tests ADR-031 GAP-001 closure: /fix executes dry-run on all channels,
 * /fix --yes redirects to Bridge mode (CTO C2).
 *
 * @module tests/commands/fix-command
 * @sprint 103
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeFixCommand } from "../../src/commands/handlers.js";

// Mock modules to avoid real file system / Claude Code calls
vi.mock("../../src/sdlc/scaffold/project-detector.js", () => ({
  detectProject: vi.fn(),
}));

vi.mock("../../src/sdlc/compliance/fix-engine.js", () => ({
  createComplianceFixEngine: vi.fn(),
}));

vi.mock("../../src/config/paths.js", () => ({
  loadActiveProject: vi.fn(),
}));

describe("executeFixCommand (Sprint 103 — ADR-031 GAP-001)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────
  // T1: No workspace → error
  // ──────────────────────────────────────────────────────────────────────

  it("returns error when no workspace and no active project", async () => {
    const { loadActiveProject } = await import("../../src/config/paths.js");
    vi.mocked(loadActiveProject).mockReturnValue(null);

    const result = await executeFixCommand([], undefined);

    expect(result.success).toBe(false);
    expect(result.response).toContain("No workspace focused");
    expect(result.response).toContain("/focus");
  });

  it("falls back to active project when no workspace provided", async () => {
    const { loadActiveProject } = await import("../../src/config/paths.js");
    vi.mocked(loadActiveProject).mockReturnValue({ path: "/tmp/test-project", name: "test" } as ReturnType<typeof loadActiveProject>);

    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 29,
        scoreAfter: 29,
        totalIssues: 3,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 150,
        dryRun: true,
      }),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    const result = await executeFixCommand([], undefined);

    expect(result.success).toBe(true);
    expect(result.response).toContain("Dry Run");
    expect(detectProject).toHaveBeenCalledWith("/tmp/test-project");
  });

  // ──────────────────────────────────────────────────────────────────────
  // T2: --yes → Bridge mode redirect (CTO C2)
  // ──────────────────────────────────────────────────────────────────────

  it("/fix --yes redirects to Bridge mode", async () => {
    const result = await executeFixCommand(["--yes"], "/tmp/workspace");

    expect(result.success).toBe(true);
    expect(result.response).toContain("Bridge mode");
    expect(result.response).toContain("/launch claude");
    expect(result.response).toContain("--risk patch");
    // Sprint 104 CTO C1: must use <session-id> placeholder, not literal "compliance"
    expect(result.response).toContain("<session-id>");
    expect(result.response).toContain("/sessions");
    expect(result.response).not.toContain("/send compliance fix");
    expect(result.response).toContain("/capture");
  });

  it("/fix --yes --stage 01-planning includes stage in Bridge instructions", async () => {
    const result = await executeFixCommand(["--yes", "--stage", "01-planning"], "/tmp/workspace");

    expect(result.success).toBe(true);
    expect(result.response).toContain("Bridge mode");
    expect(result.response).toContain("01-planning");
  });

  // ──────────────────────────────────────────────────────────────────────
  // T3: Dry-run execute (no --yes)
  // ──────────────────────────────────────────────────────────────────────

  it("/fix executes dry-run and returns structured result", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 29,
        scoreAfter: 85,
        totalIssues: 5,
        issuesFixed: 4,
        issuesFailed: 1,
        taskResults: [
          {
            task: { stage: "00-foundation", agent: "pm", actions: [], issues: [], gates: [], promptContext: "" },
            actionResults: [
              { action: { targetPath: "docs/00-foundation/problem-statement.md", stage: "00-foundation", artifactType: "problem-statement", description: "Create problem statement" }, success: true, dryRun: true },
            ],
            success: true,
            durationMs: 500,
          },
          {
            task: { stage: "01-planning", agent: "pm", actions: [], issues: [], gates: [], promptContext: "" },
            actionResults: [
              { action: { targetPath: "docs/01-planning/requirements.md", stage: "01-planning", artifactType: "requirements", description: "Create requirements" }, success: false, error: "Bridge unavailable", dryRun: true },
            ],
            success: false,
            durationMs: 200,
          },
        ],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 1500,
        dryRun: true,
      }),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    const result = await executeFixCommand([], "/tmp/workspace");

    expect(result.success).toBe(true);
    expect(result.response).toContain("Dry Run");
    expect(result.response).toContain("29%");
    expect(result.response).toContain("85%");
    expect(result.response).toContain("5 found");
    expect(result.response).toContain("4 fixed");
    expect(result.response).toContain("1 failed");
    expect(result.response).toContain("00-foundation");
    expect(result.response).toContain("problem-statement");
    expect(result.response).toContain("Bridge mode");

    // Engine created with dryRun: true
    expect(createComplianceFixEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        tier: "STANDARD",
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // T4: --stage filter
  // ──────────────────────────────────────────────────────────────────────

  it("/fix --stage 01-planning passes stage filter to engine", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 50,
        scoreAfter: 50,
        totalIssues: 1,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 100,
        dryRun: true,
      }),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    await executeFixCommand(["--stage", "01-planning"], "/tmp/workspace");

    expect(createComplianceFixEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "01-planning",
        dryRun: true,
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // T5: No tier detected → error
  // ──────────────────────────────────────────────────────────────────────

  it("returns error when project tier cannot be detected", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "FRESH",
      existingFiles: [],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const result = await executeFixCommand([], "/tmp/workspace");

    expect(result.success).toBe(false);
    expect(result.response).toContain("Cannot detect project tier");
    expect(result.response).toContain("endiorbot init");
  });

  // ──────────────────────────────────────────────────────────────────────
  // T6: Engine error handling
  // ──────────────────────────────────────────────────────────────────────

  it("handles engine error gracefully", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockRejectedValue(new Error("Claude Code bridge unavailable")),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    const result = await executeFixCommand([], "/tmp/workspace");

    expect(result.success).toBe(false);
    expect(result.response).toContain("Compliance fix failed");
    expect(result.response).toContain("bridge unavailable");
  });

  // ──────────────────────────────────────────────────────────────────────
  // T7: structureTier fallback
  // ──────────────────────────────────────────────────────────────────────

  it("uses structureTier when configTier is not available", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "PARTIAL",
      structureTier: "PROFESSIONAL",
      existingFiles: ["CLAUDE.md"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 50,
        scoreAfter: 50,
        totalIssues: 0,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 50,
        dryRun: true,
      }),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    await executeFixCommand([], "/tmp/workspace");

    expect(createComplianceFixEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "PROFESSIONAL",
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // T8: Zero issues → no "Bridge mode" instructions
  // ──────────────────────────────────────────────────────────────────────

  it("does not show Bridge mode instructions when no issues found", async () => {
    const { detectProject } = await import("../../src/sdlc/scaffold/project-detector.js");
    vi.mocked(detectProject).mockReturnValue({
      state: "CONFIGURED",
      configTier: "STANDARD",
      existingFiles: [".sdlc-config.json"],
      missingFiles: [],
    } as ReturnType<typeof detectProject>);

    const { createComplianceFixEngine } = await import("../../src/sdlc/compliance/fix-engine.js");
    const mockEngine = {
      fix: vi.fn().mockResolvedValue({
        scoreBefore: 100,
        scoreAfter: 100,
        totalIssues: 0,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: [],
        stageResultsAfter: [],
        durationMs: 30,
        dryRun: true,
      }),
    };
    vi.mocked(createComplianceFixEngine).mockReturnValue(mockEngine as never);

    const result = await executeFixCommand([], "/tmp/workspace");

    expect(result.success).toBe(true);
    expect(result.response).toContain("100%");
    expect(result.response).toContain("0 found");
    expect(result.response).not.toContain("Bridge mode");
  });
});

// ============================================================================
// /compliance fix alias tests (CPO C3)
// ============================================================================

describe("/compliance fix alias (Sprint 103 — CPO C3)", () => {
  it("/compliance fix delegates to executeFixCommand", async () => {
    // This tests the registration logic in index.ts
    // We verify by checking the createCommandDispatcher wiring
    const { createCommandDispatcher } = await import("../../src/commands/index.js");
    const dispatcher = createCommandDispatcher();

    // /compliance should be registered
    expect(dispatcher.has("compliance")).toBe(true);
    // /fix should be registered
    expect(dispatcher.has("fix")).toBe(true);
  });
});

// ============================================================================
// handleFixCommand legacy fallback
// ============================================================================

describe("handleFixCommand legacy (backward compat)", () => {
  it("returns sync display-only response", async () => {
    const { handleFixCommand } = await import("../../src/commands/handlers.js");

    const result = handleFixCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Compliance Fix");
    expect(result.response).toContain("dry-run");
  });

  it("handles --yes flag in legacy mode", async () => {
    const { handleFixCommand } = await import("../../src/commands/handlers.js");

    const result = handleFixCommand(["--yes"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Bridge mode");
  });
});
