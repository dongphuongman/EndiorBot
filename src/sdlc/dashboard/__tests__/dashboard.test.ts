/**
 * Compliance Dashboard Tests
 *
 * Unit tests for ComplianceDashboardEngine and ReportGenerator.
 *
 * @module sdlc/dashboard/__tests__/dashboard.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ComplianceDashboardEngine,
  resetComplianceDashboard,
  ReportGenerator,
} from "../index.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("ComplianceDashboardEngine", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetComplianceDashboard();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-test-"));
  });

  afterEach(async () => {
    resetComplianceDashboard();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe("constructor", () => {
    it("should create dashboard engine with project root", () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      expect(engine).toBeDefined();
    });

    it("should accept custom tier", () => {
      const engine = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        tier: "ENTERPRISE",
      });
      expect(engine).toBeDefined();
    });
  });

  // ============================================================================
  // Refresh Tests
  // ============================================================================

  describe("refresh", () => {
    it("should return dashboard data", async () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      const dashboard = await engine.refresh();

      expect(dashboard.overallScore).toBeGreaterThanOrEqual(0);
      expect(dashboard.overallScore).toBeLessThanOrEqual(100);
      expect(["compliant", "warning", "non-compliant"]).toContain(
        dashboard.status
      );
      expect(dashboard.stages).toHaveLength(10);
      expect(dashboard.refreshedAt).toBeDefined();
      expect(dashboard.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should evaluate all 10 stages", async () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      const dashboard = await engine.refresh();

      const expectedStages = [
        "00-FOUNDATION",
        "01-PLANNING",
        "02-DESIGN",
        "03-INTEGRATE",
        "04-BUILD",
        "05-TEST",
        "06-DEPLOY",
        "07-OPERATE",
        "08-COLLABORATE",
        "09-ARCHIVE",
      ];

      const actualStages = dashboard.stages.map((s) => s.stage);
      expect(actualStages).toEqual(expectedStages);
    });

    it("should use cache on subsequent calls", async () => {
      const engine = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        enableCache: true,
        cacheTtl: 10000,
      });

      const first = await engine.refresh();
      const second = await engine.refresh();

      expect(first.refreshedAt).toBe(second.refreshedAt);
    });

    it("should bypass cache with force flag", async () => {
      const engine = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        enableCache: true,
        cacheTtl: 10000,
      });

      const first = await engine.refresh();
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      const second = await engine.refresh(true);

      expect(first.refreshedAt).not.toBe(second.refreshedAt);
    });
  });

  // ============================================================================
  // Stage Compliance Tests
  // ============================================================================

  describe("getStageCompliance", () => {
    it("should return compliance for specific stage", async () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      const compliance = await engine.getStageCompliance("00-FOUNDATION");

      expect(compliance.stage).toBe("00-FOUNDATION");
      expect(compliance.name).toBe("Foundation");
      expect(compliance.score).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Issue Tests
  // ============================================================================

  describe("getIssues", () => {
    it("should return all issues", async () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      const issues = await engine.getIssues();

      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe("getIssuesBySeverity", () => {
    it("should filter issues by severity", async () => {
      const engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
      const errors = await engine.getIssuesBySeverity("error");

      for (const issue of errors) {
        expect(issue.severity).toBe("error");
      }
    });
  });

  // ============================================================================
  // Cache Tests
  // ============================================================================

  describe("clearCache", () => {
    it("should clear the dashboard cache", async () => {
      const engine = new ComplianceDashboardEngine({
        projectRoot: tempDir,
        enableCache: true,
        cacheTtl: 60000,
      });

      const first = await engine.refresh();
      engine.clearCache();
      // Small delay
      await new Promise((r) => setTimeout(r, 10));
      const second = await engine.refresh();

      expect(first.refreshedAt).not.toBe(second.refreshedAt);
    });
  });
});

// ============================================================================
// Report Generator Tests
// ============================================================================

describe("ReportGenerator", () => {
  let tempDir: string;
  let engine: ComplianceDashboardEngine;

  beforeEach(async () => {
    resetComplianceDashboard();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "report-test-"));
    engine = new ComplianceDashboardEngine({ projectRoot: tempDir });
  });

  afterEach(async () => {
    resetComplianceDashboard();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("generate", () => {
    it("should generate markdown report", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({ format: "markdown" });

      expect(report.format).toBe("markdown");
      expect(report.content).toContain("# SDLC Compliance Report");
      expect(report.content).toContain("| Stage | Score | Status | Issues |");
      expect(report.generatedAt).toBeDefined();
    });

    it("should generate JSON report", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({ format: "json" });

      expect(report.format).toBe("json");
      const parsed = JSON.parse(report.content);
      expect(parsed.title).toBe("SDLC Compliance Report");
      expect(parsed.summary).toBeDefined();
      expect(parsed.stages).toHaveLength(10);
    });

    it("should generate HTML report", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({ format: "html" });

      expect(report.format).toBe("html");
      expect(report.content).toContain("<!DOCTYPE html>");
      expect(report.content).toContain("SDLC Compliance Report");
    });

    it("should use custom title", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({
        format: "markdown",
        title: "Custom Report Title",
      });

      expect(report.title).toBe("Custom Report Title");
      expect(report.content).toContain("# Custom Report Title");
    });

    it("should include stage details when requested", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({
        format: "markdown",
        includeStageDetails: true,
      });

      expect(report.content).toContain("## Stage Details");
    });

    it("should limit issues when maxIssues specified", async () => {
      const generator = new ReportGenerator(engine);
      const report = await generator.generate({
        format: "json",
        maxIssues: 3,
      });

      const parsed = JSON.parse(report.content);
      expect(parsed.issues.length).toBeLessThanOrEqual(3);
    });
  });
});
