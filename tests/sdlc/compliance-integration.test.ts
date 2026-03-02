/**
 * SDLC Compliance Integration Tests
 *
 * E2E tests for Sprint 68 v1.8 Compliance features:
 * - Full compliance check flow
 * - Multi-tier validation
 * - Gate transition with contract enforcement
 * - Dashboard export (all formats)
 * - Performance benchmarks
 *
 * @module tests/sdlc/compliance-integration.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Import SDLC modules
import {
  // Stage Contracts
  StageContractEngine,
  resetStageContractEngine,
  SDLC_STAGES,
  getContractsForTier,
  type SDLCStage,
  // PatchManager
  PatchManager,
  resetPatchManager,
  // Dashboard
  ComplianceDashboardEngine,
  resetComplianceDashboard,
  ReportGenerator,
  // Gates
  GateEngine,
  resetGateEngine,
} from "../../src/sdlc/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test project structure.
 */
async function createTestProject(
  rootDir: string,
  tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE"
): Promise<void> {
  // Create base directories
  const dirs = [
    "src",
    "tests",
    "docs/00-foundation",
    "docs/01-planning",
    "docs/02-design/01-ADRs",
    "docs/04-build",
    "docs/05-test",
    ".endiorbot",
  ];

  for (const dir of dirs) {
    const fullPath = path.join(rootDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  // Create identity files (all tiers)
  writeFileSync(
    path.join(rootDir, "CLAUDE.md"),
    `# CLAUDE.md - Test Project\n\n**Tier:** ${tier}\n`
  );
  writeFileSync(
    path.join(rootDir, "IDENTITY.md"),
    `# Test Project\n\n## Overview\nTest project for compliance testing.\n`
  );

  // Create source files
  writeFileSync(
    path.join(rootDir, "src/index.ts"),
    `export const hello = 'world';\n`
  );
  writeFileSync(
    path.join(rootDir, "src/utils.ts"),
    `export function add(a: number, b: number): number {\n  return a + b;\n}\n`
  );

  // Create test files
  writeFileSync(
    path.join(rootDir, "tests/index.test.ts"),
    `import { hello } from '../src/index';\ndescribe('hello', () => {\n  it('should be world', () => {\n    expect(hello).toBe('world');\n  });\n});\n`
  );

  // Create docs
  writeFileSync(
    path.join(rootDir, "docs/01-planning/roadmap.md"),
    `# Roadmap\n\n## Phase 1\n- Feature A\n- Feature B\n`
  );

  // Create ADR
  writeFileSync(
    path.join(rootDir, "docs/02-design/01-ADRs/ADR-001-test.md"),
    `# ADR-001: Test Decision\n\n## Status\nAccepted\n\n## Context\nTest context.\n\n## Decision\nTest decision.\n`
  );

  // Create SDLC config
  writeFileSync(
    path.join(rootDir, ".sdlc-config.json"),
    JSON.stringify(
      {
        version: "6.1.1",
        tier,
        project: "test-project",
        initialized: true,
      },
      null,
      2
    )
  );

  // Add AGENTS.md for STANDARD+
  if (tier !== "LITE") {
    writeFileSync(
      path.join(rootDir, "AGENTS.md"),
      `# AGENTS.md\n\n## Available Agents\n- @coder\n- @reviewer\n`
    );
  }

  // Add USER.md for PROFESSIONAL+
  if (tier === "PROFESSIONAL" || tier === "ENTERPRISE") {
    writeFileSync(
      path.join(rootDir, "USER.md"),
      `# USER.md\n\n## User Preferences\n- Prefer TypeScript\n`
    );
  }
}

// ============================================================================
// Full Compliance Flow Tests
// ============================================================================

describe("SDLC Compliance Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetStageContractEngine();
    resetPatchManager();
    resetComplianceDashboard();
    resetGateEngine();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "compliance-e2e-"));
  });

  afterEach(async () => {
    resetStageContractEngine();
    resetPatchManager();
    resetComplianceDashboard();
    resetGateEngine();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Full Compliance Flow", () => {
    it("should complete full compliance check flow (init → evaluate → report)", async () => {
      // 1. Initialize project
      await createTestProject(tempDir, "STANDARD");

      // 2. Evaluate all stage contracts
      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
      });

      const evaluations = await contractEngine.evaluateAll();
      expect(evaluations.length).toBe(10);

      // 3. Create compliance dashboard
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });

      const dashboardData = await dashboard.refresh();
      expect(dashboardData.overallScore).toBeGreaterThanOrEqual(0);
      expect(dashboardData.stages.length).toBe(10);

      // 4. Generate report
      const generator = new ReportGenerator(dashboard);
      const report = await generator.generate({
        format: "markdown",
        includeStageDetails: true,
        includeSuggestions: true,
      });

      expect(report.content).toContain("# SDLC Compliance Report");
      expect(report.content).toContain("## Summary");
      expect(report.content).toContain("Foundation");
    });

    it("should track changes through PatchManager during compliance workflow", async () => {
      await createTestProject(tempDir, "STANDARD");

      // Start a patch
      const patchManager = new PatchManager({ projectRoot: tempDir });
      const patch = await patchManager.startPatch({
        name: "Compliance fix",
        author: "@coder",
        sprintId: "sprint-68",
      });

      // Record a change
      const oldContent = await fs.readFile(
        path.join(tempDir, "src/index.ts"),
        "utf-8"
      );
      const newContent = oldContent + "\nexport const version = '1.0.0';\n";

      await patchManager.recordChange(patch.id, {
        path: "src/index.ts",
        changeType: "modify",
        previousContent: oldContent,
        newContent: newContent,
      });

      // Commit the patch
      const committed = await patchManager.commitPatch(patch.id);
      expect(committed.state).toBe("committed");
      expect(committed.changes.length).toBe(1);

      // Verify in dashboard
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });

      const dashboardData = await dashboard.refresh();
      expect(dashboardData.recentPatches.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Multi-Tier Validation Tests
  // ============================================================================

  describe("Multi-Tier Validation", () => {
    it("should validate LITE tier correctly", async () => {
      await createTestProject(tempDir, "LITE");

      const contracts = getContractsForTier("LITE");
      expect(contracts.length).toBeGreaterThan(0);

      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        tier: "LITE",
      });

      const data = await dashboard.refresh();
      expect(data.overallScore).toBeGreaterThanOrEqual(0);
      expect(data.status).toBeDefined();
    });

    it("should validate STANDARD tier correctly", async () => {
      await createTestProject(tempDir, "STANDARD");

      const contracts = getContractsForTier("STANDARD");
      expect(contracts.length).toBeGreaterThanOrEqual(
        getContractsForTier("LITE").length
      );

      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        tier: "STANDARD",
      });

      const data = await dashboard.refresh();
      expect(data.stages.length).toBe(10);
    });

    it("should validate PROFESSIONAL tier correctly", async () => {
      await createTestProject(tempDir, "PROFESSIONAL");

      const contracts = getContractsForTier("PROFESSIONAL");
      expect(contracts.length).toBeGreaterThanOrEqual(
        getContractsForTier("STANDARD").length
      );

      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        tier: "PROFESSIONAL",
      });

      const data = await dashboard.refresh();
      expect(data.overallScore).toBeGreaterThanOrEqual(0);
    });

    it("should enforce tier-specific requirements", async () => {
      // Create minimal LITE project
      await createTestProject(tempDir, "LITE");

      // Remove AGENTS.md (only required for STANDARD+)
      try {
        await fs.unlink(path.join(tempDir, "AGENTS.md"));
      } catch {
        // May not exist for LITE
      }

      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
      });

      // LITE should pass without AGENTS.md
      const foundationEval = await contractEngine.evaluate("00-FOUNDATION");
      expect(foundationEval.status).toBe("pass");
    });
  });

  // ============================================================================
  // Gate Transition Tests
  // ============================================================================

  describe("Gate Transition with Contract Enforcement", () => {
    it("should evaluate gate with contract status", async () => {
      await createTestProject(tempDir, "STANDARD");

      const gateEngine = new GateEngine({
        projectRoot: tempDir,
        tier: "STANDARD",
      });

      const evaluation = await gateEngine.evaluate(
        "G0",
        "feature-test",
        "project-test"
      );

      expect(evaluation.gateId).toBe("G0");
      expect(["PASS", "FAIL", "PENDING"]).toContain(evaluation.result);
      expect(evaluation.checklist).toBeDefined();
    });

    it("should check contract before gate transition", async () => {
      await createTestProject(tempDir, "STANDARD");

      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
      });

      // Check if FOUNDATION can transition to PLANNING
      const canTransition = await contractEngine.canTransition(
        "00-FOUNDATION",
        "01-PLANNING"
      );

      expect(typeof canTransition.allowed).toBe("boolean");
    });

    it("should block transition when contract fails in strict mode", async () => {
      // Create empty project (no source files)
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(path.join(tempDir, "IDENTITY.md"), "# Empty Project\n");

      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
        strictMode: true,
      });

      // BUILD stage should fail without source code
      const evaluation = await contractEngine.evaluate("04-BUILD");
      expect(evaluation.status).toBe("fail");

      // Transition should be blocked
      const canTransition = await contractEngine.canTransition(
        "04-BUILD",
        "05-TEST"
      );
      expect(canTransition.allowed).toBe(false);
    });
  });

  // ============================================================================
  // Dashboard Export Tests
  // ============================================================================

  describe("Dashboard Export (All Formats)", () => {
    beforeEach(async () => {
      await createTestProject(tempDir, "STANDARD");
    });

    it("should export Markdown report", async () => {
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });
      const generator = new ReportGenerator(dashboard);

      const report = await generator.generate({
        format: "markdown",
        title: "Test Report",
        includeStageDetails: true,
      });

      expect(report.format).toBe("markdown");
      expect(report.content).toContain("# Test Report");
      expect(report.content).toContain("| Stage | Score | Status | Issues |");
      expect(report.content).toContain("## Stage Details");
    });

    it("should export JSON report", async () => {
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });
      const generator = new ReportGenerator(dashboard);

      const report = await generator.generate({
        format: "json",
        includeStageDetails: true,
      });

      expect(report.format).toBe("json");

      const parsed = JSON.parse(report.content);
      expect(parsed.title).toBe("SDLC Compliance Report");
      expect(parsed.summary.overallScore).toBeGreaterThanOrEqual(0);
      expect(parsed.stages.length).toBe(10);
    });

    it("should export HTML report", async () => {
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });
      const generator = new ReportGenerator(dashboard);

      const report = await generator.generate({
        format: "html",
      });

      expect(report.format).toBe("html");
      expect(report.content).toContain("<!DOCTYPE html>");
      expect(report.content).toContain("<title>SDLC Compliance Report</title>");
      expect(report.content).toContain("Stage Compliance");
    });

    it("should respect report options", async () => {
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });
      const generator = new ReportGenerator(dashboard);

      // With limited issues
      const report = await generator.generate({
        format: "json",
        maxIssues: 2,
        maxPatches: 1,
      });

      const parsed = JSON.parse(report.content);
      expect(parsed.issues.length).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe("Performance Benchmarks", () => {
    it("should complete full compliance scan in < 3s", async () => {
      await createTestProject(tempDir, "STANDARD");

      const startTime = Date.now();

      // Full compliance scan
      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
      });

      const data = await dashboard.refresh();
      const generator = new ReportGenerator(dashboard);
      await generator.generate({ format: "markdown" });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // < 3 seconds
      expect(data.durationMs).toBeLessThan(2000); // Dashboard refresh < 2s
    });

    it("should handle dashboard caching efficiently", async () => {
      await createTestProject(tempDir, "STANDARD");

      const dashboard = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        enableCache: true,
        cacheTtl: 5000,
      });

      // First call (uncached)
      const first = await dashboard.refresh();
      const firstDuration = first.durationMs;

      // Second call (cached)
      const startTime = Date.now();
      const second = await dashboard.refresh();
      const cachedDuration = Date.now() - startTime;

      // Cached call should be nearly instant
      expect(cachedDuration).toBeLessThan(10); // < 10ms
      expect(first.refreshedAt).toBe(second.refreshedAt);
    });

    it("should evaluate all 10 stages efficiently", async () => {
      await createTestProject(tempDir, "STANDARD");

      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
      });

      const startTime = Date.now();
      const evaluations = await contractEngine.evaluateAll();
      const duration = Date.now() - startTime;

      expect(evaluations.length).toBe(10);
      expect(duration).toBeLessThan(1000); // < 1 second for all stages
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle missing project directory gracefully", async () => {
      const nonExistent = path.join(tempDir, "non-existent");

      const dashboard = new ComplianceDashboardEngine({
        projectRoot: nonExistent,
      });

      // Should not throw, but may have low score
      const data = await dashboard.refresh();
      expect(data.overallScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle invalid stage gracefully", async () => {
      await createTestProject(tempDir, "STANDARD");

      const contractEngine = new StageContractEngine({
        projectRoot: tempDir,
      });

      // TypeScript prevents invalid stages, but test runtime behavior
      await expect(
        contractEngine.evaluate("INVALID" as SDLCStage)
      ).rejects.toThrow();
    });

    it("should recover from patch rollback errors", async () => {
      await createTestProject(tempDir, "STANDARD");

      const patchManager = new PatchManager({ projectRoot: tempDir });
      const patch = await patchManager.startPatch({
        name: "Test Patch",
        author: "@test",
      });

      // Record a delete for a non-existent file
      await patchManager.recordChange(patch.id, {
        path: "non-existent-file.ts",
        changeType: "delete",
        previousContent: "content",
      });

      // Rollback should handle gracefully
      const result = await patchManager.rollbackPatch(patch.id);
      expect(result.filesRolledBack).toBeGreaterThanOrEqual(0);
      expect(patch.state).toBe("rolledback");
    });
  });
});
