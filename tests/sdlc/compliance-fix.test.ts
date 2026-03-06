/**
 * Compliance Fix Tests
 *
 * Tests for Sprint 75 compliance auto-fix:
 * - Fix types & constants
 * - normalizeStageKey
 * - Project context collector
 * - Issue mapper
 * - Content generator (dry-run, deterministic fallback, post-write validation)
 * - Fix engine orchestration
 *
 * @module tests/sdlc/compliance-fix.test
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 75
 * @sprint 75
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock ClaudeCodeBridge to avoid subprocess spawning in tests
vi.mock("../../src/agents/invoke/claude-code-bridge.js", () => ({
  getClaudeCodeBridge: () => ({
    isAvailable: () => Promise.resolve(false),
  }),
  resetClaudeCodeBridge: () => {},
}));

// Fix types
import {
  STAGE_AGENT_MAP,
  STAGE_AGENT_FALLBACK,
  STAGE_PROCESSING_ORDER,
  STAGE_GATE_MAP,
  AGENT_SKILL_MAP,
  MAX_GENERATED_FILE_SIZE,
  normalizeStageKey,
  getAgentForStage,
} from "../../src/sdlc/compliance/fix-types.js";

// Content checker
import {
  STAGE_CONTENT_REQUIREMENTS,
  checkL2Compliance,
  type ContentIssue,
  type StageContentResult,
} from "../../src/sdlc/compliance/content-checker.js";

// Contracts
import { SDLC_STAGES, isValidStage } from "../../src/sdlc/contracts/types.js";
import { STAGE_CONTRACTS, ARCHIVE_ENTERPRISE_CONTRACT } from "../../src/sdlc/contracts/defaults.js";

// Project context collector
import { collectProjectContext } from "../../src/sdlc/compliance/project-context-collector.js";

// Issue mapper
import { mapIssuesToFixTasks } from "../../src/sdlc/compliance/issue-mapper.js";

// Content generator
import { generateContent } from "../../src/sdlc/compliance/content-generator.js";

// Fix engine
import { ComplianceFixEngine, createComplianceFixEngine } from "../../src/sdlc/compliance/fix-engine.js";

// Types
import type { ProjectSnapshot } from "../../src/sdlc/compliance/fix-types.js";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `endiorbot-fix-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createProjectStructure(projectPath: string, tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE"): void {
  // Create package.json
  writeFileSync(
    path.join(projectPath, "package.json"),
    JSON.stringify({
      name: "test-project",
      description: "A test project for compliance fix",
      dependencies: { express: "^4.18.0" },
      devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0" },
      scripts: { test: "vitest", build: "tsc" },
    }, null, 2),
  );

  // Create tsconfig.json
  writeFileSync(
    path.join(projectPath, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" } }),
  );

  // Create src/ modules
  mkdirSync(path.join(projectPath, "src", "api"), { recursive: true });
  writeFileSync(path.join(projectPath, "src", "api", "routes.ts"), "export const routes = {};");
  mkdirSync(path.join(projectPath, "src", "utils"), { recursive: true });
  writeFileSync(path.join(projectPath, "src", "utils", "helpers.ts"), "export function helper() {}");

  // Create tests/
  mkdirSync(path.join(projectPath, "tests"), { recursive: true });
  writeFileSync(path.join(projectPath, "tests", "api.test.ts"), "describe('api', () => {});");

  // Create docs/ stage dirs with placeholder content
  const stages = tier === "LITE"
    ? ["00-foundation", "01-planning", "02-design", "04-build"]
    : ["00-foundation", "01-planning", "02-design", "04-build", "05-test", "06-deploy", "08-collaborate"];

  for (const stage of stages) {
    const stagePath = path.join(projectPath, "docs", stage);
    mkdirSync(stagePath, { recursive: true });
    writeFileSync(
      path.join(stagePath, "README.md"),
      `# ${stage}\n\n<!-- Add stage-specific content -->\nTODO: Add real content\n`,
    );
  }
}

function createMockSnapshot(projectPath: string): ProjectSnapshot {
  return {
    name: "test-project",
    description: "A test project",
    tier: "STANDARD",
    techStack: {
      language: "TypeScript",
      framework: "Express",
      packageManager: "pnpm",
      hasTypeScript: true,
      hasDocker: false,
      hasCI: false,
      dependencies: ["express"],
      devDependencies: ["vitest", "typescript"],
      scripts: { test: "vitest", build: "tsc" },
    },
    codeModules: [
      { name: "api", path: "src/api", fileCount: 1, keyFiles: ["routes.ts"] },
      { name: "utils", path: "src/utils", fileCount: 1, keyFiles: ["helpers.ts"] },
    ],
    testFiles: [
      { path: "tests/api.test.ts", name: "api.test.ts", type: "unit" },
    ],
    existingDocs: [],
    projectPath,
  };
}

// ============================================================================
// Fix Types & Constants
// ============================================================================

describe("Fix Types & Constants", () => {
  it("should map all processing order stages to agents", () => {
    for (const stage of STAGE_PROCESSING_ORDER) {
      expect(STAGE_AGENT_MAP[stage]).toBeDefined();
    }
  });

  it("should have MAX_GENERATED_FILE_SIZE at 50KB", () => {
    expect(MAX_GENERATED_FILE_SIZE).toBe(50 * 1024);
  });

  it("should map tester to e2e-api-testing skill", () => {
    expect(AGENT_SKILL_MAP.tester).toEqual(["e2e-api-testing"]);
  });

  it("should not have skills for non-tester agents", () => {
    expect(AGENT_SKILL_MAP.pm).toBeUndefined();
    expect(AGENT_SKILL_MAP.architect).toBeUndefined();
    expect(AGENT_SKILL_MAP.coder).toBeUndefined();
  });

  it("should have correct gate mappings", () => {
    expect(STAGE_GATE_MAP["01-planning"]).toEqual(["G0.1", "G1"]);
    expect(STAGE_GATE_MAP["05-test"]).toEqual(["G3"]);
    expect(STAGE_GATE_MAP["04-build"]).toEqual(["G-Sprint"]);
  });

  it("should have fallback for tester in LITE and STANDARD tiers", () => {
    expect(STAGE_AGENT_FALLBACK["05-test"]).toBeDefined();
    expect(STAGE_AGENT_FALLBACK["05-test"]?.LITE).toBe("fullstack");
    expect(STAGE_AGENT_FALLBACK["05-test"]?.STANDARD).toBe("reviewer");
  });
});

// ============================================================================
// normalizeStageKey
// ============================================================================

describe("normalizeStageKey", () => {
  it("should convert UPPERCASE to lowercase", () => {
    expect(normalizeStageKey("00-FOUNDATION")).toBe("00-foundation");
    expect(normalizeStageKey("09-ARCHIVE")).toBe("09-archive");
  });

  it("should preserve already-lowercase keys", () => {
    expect(normalizeStageKey("01-planning")).toBe("01-planning");
    expect(normalizeStageKey("10-archive")).toBe("10-archive");
  });

  it("should handle mixed case", () => {
    expect(normalizeStageKey("02-Design")).toBe("02-design");
  });
});

// ============================================================================
// getAgentForStage (tier-aware fallback)
// ============================================================================

describe("getAgentForStage", () => {
  it("should return primary agent for PROFESSIONAL tier", () => {
    expect(getAgentForStage("05-test", "PROFESSIONAL")).toBe("tester");
  });

  it("should return fallback agent for STANDARD tier stage 05-test", () => {
    expect(getAgentForStage("05-test", "STANDARD")).toBe("reviewer");
  });

  it("should return fallback agent for LITE tier stage 05-test", () => {
    expect(getAgentForStage("05-test", "LITE")).toBe("fullstack");
  });

  it("should return PM for stages without fallback", () => {
    expect(getAgentForStage("00-foundation", "LITE")).toBe("pm");
    expect(getAgentForStage("01-planning", "STANDARD")).toBe("pm");
  });

  it("should default to PM for unknown stages", () => {
    expect(getAgentForStage("unknown-stage", "STANDARD")).toBe("pm");
  });
});

// ============================================================================
// Stage Key Standardization (10-ARCHIVE)
// ============================================================================

describe("Stage Key Standardization", () => {
  it("should include 10-ARCHIVE in SDLC_STAGES", () => {
    expect(SDLC_STAGES).toContain("10-ARCHIVE");
    expect(isValidStage("10-ARCHIVE")).toBe(true);
  });

  it("should have 10-ARCHIVE contract in STAGE_CONTRACTS", () => {
    expect(STAGE_CONTRACTS["10-ARCHIVE"]).toBeDefined();
    expect(STAGE_CONTRACTS["10-ARCHIVE"].name).toBe("Archive (Enterprise)");
    expect(STAGE_CONTRACTS["10-ARCHIVE"].minTier).toBe("ENTERPRISE");
  });

  it("should have 10-archive in STAGE_CONTENT_REQUIREMENTS", () => {
    expect(STAGE_CONTENT_REQUIREMENTS["10-archive"]).toBeDefined();
    expect(STAGE_CONTENT_REQUIREMENTS["10-archive"].requiredArtifacts).toContain("archive-checklist.md");
  });

  it("should keep 09-ARCHIVE separate from 10-ARCHIVE", () => {
    expect(SDLC_STAGES).toContain("09-ARCHIVE");
    expect(SDLC_STAGES).toContain("10-ARCHIVE");
    expect(STAGE_CONTRACTS["09-ARCHIVE"].name).toBe("Archive");
    expect(STAGE_CONTRACTS["10-ARCHIVE"].name).toBe("Archive (Enterprise)");
  });

  it("should export ARCHIVE_ENTERPRISE_CONTRACT", () => {
    expect(ARCHIVE_ENTERPRISE_CONTRACT).toBeDefined();
    expect(ARCHIVE_ENTERPRISE_CONTRACT.stage).toBe("10-ARCHIVE");
  });
});

// ============================================================================
// Project Context Collector
// ============================================================================

describe("Project Context Collector", () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should detect TypeScript project", async () => {
    createProjectStructure(tempDir, "STANDARD");
    const snapshot = await collectProjectContext(tempDir, "STANDARD");

    expect(snapshot.techStack.language).toBe("TypeScript");
    expect(snapshot.techStack.hasTypeScript).toBe(true);
  });

  it("should scan code modules", async () => {
    createProjectStructure(tempDir, "STANDARD");
    const snapshot = await collectProjectContext(tempDir, "STANDARD");

    expect(snapshot.codeModules.length).toBeGreaterThanOrEqual(2);
    const moduleNames = snapshot.codeModules.map((m) => m.name);
    expect(moduleNames).toContain("api");
    expect(moduleNames).toContain("utils");
  });

  it("should classify test files", async () => {
    createProjectStructure(tempDir, "STANDARD");
    const snapshot = await collectProjectContext(tempDir, "STANDARD");

    expect(snapshot.testFiles.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.testFiles[0].type).toBe("unit");
  });

  it("should scan existing docs", async () => {
    createProjectStructure(tempDir, "STANDARD");
    const snapshot = await collectProjectContext(tempDir, "STANDARD");

    expect(snapshot.existingDocs.length).toBeGreaterThan(0);
  });

  it("should detect framework from dependencies", async () => {
    createProjectStructure(tempDir, "STANDARD");
    const snapshot = await collectProjectContext(tempDir, "STANDARD");

    expect(snapshot.techStack.framework).toBe("Express");
  });

  it("should handle missing package.json gracefully", async () => {
    mkdirSync(tempDir, { recursive: true });
    const snapshot = await collectProjectContext(tempDir, "LITE");

    expect(snapshot.name).toBeTruthy();
    expect(snapshot.techStack.language).toBe("JavaScript");
    expect(snapshot.techStack.dependencies).toEqual([]);
  });
});

// ============================================================================
// Issue Mapper
// ============================================================================

describe("Issue Mapper", () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should assign correct agents to stages", () => {
    const snapshot = createMockSnapshot(tempDir);
    const issues: ContentIssue[] = [
      { type: "placeholder", severity: "warning", message: "Stage 00-foundation: 1 placeholder(s)", stage: "00-foundation" },
      { type: "missing_artifact", severity: "warning", message: "Missing requirements.md", stage: "01-planning", file: "requirements.md" },
    ];

    const stageResults: StageContentResult[] = [
      { stage: "00-foundation", hasRealContent: false, contentScore: 20, totalLines: 5, placeholdersFound: ["TODO: Add"], artifactsFound: ["README.md"], artifactsMissing: [] },
      { stage: "01-planning", hasRealContent: false, contentScore: 0, totalLines: 0, placeholdersFound: [], artifactsFound: [], artifactsMissing: ["requirements.md"] },
    ];

    const tasks = mapIssuesToFixTasks(issues, stageResults, snapshot);

    expect(tasks.length).toBe(2);
    expect(tasks[0].agent).toBe("pm"); // 00-foundation
    expect(tasks[1].agent).toBe("pm"); // 01-planning
  });

  it("should sort tasks by STAGE_PROCESSING_ORDER", () => {
    const snapshot = createMockSnapshot(tempDir);
    const issues: ContentIssue[] = [
      { type: "placeholder", severity: "warning", message: "test", stage: "05-test" },
      { type: "placeholder", severity: "warning", message: "test", stage: "00-foundation" },
      { type: "placeholder", severity: "warning", message: "test", stage: "02-design" },
    ];

    const stageResults: StageContentResult[] = [
      { stage: "05-test", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
      { stage: "00-foundation", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
      { stage: "02-design", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
    ];

    const tasks = mapIssuesToFixTasks(issues, stageResults, snapshot);
    const stages = tasks.map((t) => t.stage);

    expect(stages[0]).toBe("00-foundation");
    expect(stages[1]).toBe("02-design");
    expect(stages[2]).toBe("05-test");
  });

  it("should skip stages not in tier whitelist", () => {
    const snapshot = createMockSnapshot(tempDir);
    snapshot.tier = "LITE"; // LITE only has 4 stages

    const issues: ContentIssue[] = [
      { type: "placeholder", severity: "warning", message: "test", stage: "05-test" }, // Not in LITE
      { type: "placeholder", severity: "warning", message: "test", stage: "00-foundation" }, // In LITE
    ];

    const stageResults: StageContentResult[] = [
      { stage: "05-test", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
      { stage: "00-foundation", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
    ];

    const tasks = mapIssuesToFixTasks(issues, stageResults, snapshot);

    expect(tasks.length).toBe(1);
    expect(tasks[0].stage).toBe("00-foundation");
  });

  it("should include gates in prompt context", () => {
    const snapshot = createMockSnapshot(tempDir);
    const issues: ContentIssue[] = [
      { type: "placeholder", severity: "warning", message: "test", stage: "05-test" },
    ];

    const stageResults: StageContentResult[] = [
      { stage: "05-test", hasRealContent: false, contentScore: 0, totalLines: 3, placeholdersFound: ["TODO"], artifactsFound: ["README.md"], artifactsMissing: [] },
    ];

    const tasks = mapIssuesToFixTasks(issues, stageResults, snapshot);

    expect(tasks[0].gates).toEqual(["G3"]);
  });

  it("should build actions for missing artifacts", () => {
    const snapshot = createMockSnapshot(tempDir);
    const issues: ContentIssue[] = [
      { type: "missing_artifact", severity: "warning", message: "Missing problem-statement.md", stage: "00-foundation", file: "problem-statement.md" },
      { type: "missing_artifact", severity: "warning", message: "Missing business-case.md", stage: "00-foundation", file: "business-case.md" },
    ];

    const stageResults: StageContentResult[] = [
      { stage: "00-foundation", hasRealContent: false, contentScore: 0, totalLines: 0, placeholdersFound: [], artifactsFound: [], artifactsMissing: ["problem-statement.md", "business-case.md"] },
    ];

    const tasks = mapIssuesToFixTasks(issues, stageResults, snapshot);

    expect(tasks[0].actions.length).toBe(2);
    expect(tasks[0].actions[0].targetPath).toBe("docs/00-foundation/problem-statement.md");
    expect(tasks[0].actions[1].targetPath).toBe("docs/00-foundation/business-case.md");
  });
});

// ============================================================================
// Content Generator
// ============================================================================

describe("Content Generator", () => {
  beforeEach(() => {
    tempDir = createTempDir();
    createProjectStructure(tempDir, "STANDARD");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return preview in dry-run mode", async () => {
    const snapshot = createMockSnapshot(tempDir);
    const task = {
      stage: "00-foundation",
      agent: "pm" as const,
      actions: [],
      issues: [],
      gates: ["G0"],
      promptContext: "test context",
    };
    const action = {
      targetPath: "docs/00-foundation/problem-statement.md",
      stage: "00-foundation",
      artifactType: "problem-statement.md",
      description: "Generate problem statement",
    };

    const result = await generateContent(
      task,
      action,
      { projectPath: tempDir, tier: "STANDARD", dryRun: true, autoConfirm: false },
      new Map(),
      { bridge: null, snapshot },
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.content).toContain("[DRY-RUN]");
    expect(result.content).toContain("problem-statement.md");
  });

  it("should generate deterministic content when bridge unavailable", async () => {
    const snapshot = createMockSnapshot(tempDir);
    const task = {
      stage: "00-foundation",
      agent: "pm" as const,
      actions: [],
      issues: [],
      gates: ["G0"],
      promptContext: "test context",
    };
    const action = {
      targetPath: "docs/00-foundation/problem-statement.md",
      stage: "00-foundation",
      artifactType: "problem-statement.md",
      description: "Generate problem statement",
    };

    const result = await generateContent(
      task,
      action,
      { projectPath: tempDir, tier: "STANDARD", dryRun: false, autoConfirm: true },
      new Map(),
      { bridge: null, snapshot },
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.content).toContain("Problem Statement");
    expect(result.content).toContain("test-project");
    expect(result.content).toContain("TypeScript");
  });

  it("should include gates in deterministic content", async () => {
    const snapshot = createMockSnapshot(tempDir);
    const task = {
      stage: "01-planning",
      agent: "pm" as const,
      actions: [],
      issues: [],
      gates: ["G0.1", "G1"],
      promptContext: "test context",
    };
    const action = {
      targetPath: "docs/01-planning/requirements.md",
      stage: "01-planning",
      artifactType: "requirements.md",
      description: "Generate requirements",
    };

    const result = await generateContent(
      task,
      action,
      { projectPath: tempDir, tier: "STANDARD", dryRun: false, autoConfirm: true },
      new Map(),
      { bridge: null, snapshot },
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain("Quality Gates");
    expect(result.content).toContain("G0.1");
    expect(result.content).toContain("G1");
  });

  it("should include code modules in deterministic content", async () => {
    const snapshot = createMockSnapshot(tempDir);
    const task = {
      stage: "01-planning",
      agent: "pm" as const,
      actions: [],
      issues: [],
      gates: [],
      promptContext: "test context",
    };
    const action = {
      targetPath: "docs/01-planning/requirements.md",
      stage: "01-planning",
      artifactType: "requirements.md",
      description: "Generate requirements",
    };

    const result = await generateContent(
      task,
      action,
      { projectPath: tempDir, tier: "STANDARD", dryRun: false, autoConfirm: true },
      new Map(),
      { bridge: null, snapshot },
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain("api");
    expect(result.content).toContain("utils");
  });

  it("should NOT call invokeRead + fs.writeFile for bridge path", async () => {
    // This test verifies the architectural constraint (CTO B3):
    // Content generation uses invokePatch(), NOT invokeRead() + fs.writeFile()
    const snapshot = createMockSnapshot(tempDir);
    let invokePatchCalled = false;
    let invokeReadCalled = false;

    const mockBridge = {
      invokePatch: async () => {
        invokePatchCalled = true;
        return {
          output: "ok",
          exitCode: 0,
          durationMs: 100,
          success: true,
          mode: "PATCH" as const,
          diff: "--- /dev/null\n+++ b/test.md\n+content",
          affectedFiles: ["test.md"],
          applied: true,
          confirmed: true,
        };
      },
      invokeRead: async () => {
        invokeReadCalled = true;
        return { output: "", exitCode: 0, durationMs: 0, success: true, mode: "READ" as const };
      },
      isAvailable: async () => true,
    };

    const task = {
      stage: "00-foundation",
      agent: "pm" as const,
      actions: [],
      issues: [],
      gates: [],
      promptContext: "",
    };
    const action = {
      targetPath: "docs/00-foundation/test.md",
      stage: "00-foundation",
      artifactType: "test.md",
      description: "test",
    };

    // Create the file so post-write validation passes
    mkdirSync(path.join(tempDir, "docs", "00-foundation"), { recursive: true });
    writeFileSync(
      path.join(tempDir, "docs", "00-foundation", "test.md"),
      "# Real Content\n\nThis is real meaningful content that should pass validation.\n\n## Details\n\nMore details about the implementation.",
    );

    await generateContent(
      task,
      action,
      { projectPath: tempDir, tier: "STANDARD", dryRun: false, autoConfirm: true },
      new Map(),
      { bridge: mockBridge, snapshot },
    );

    expect(invokePatchCalled).toBe(true);
    expect(invokeReadCalled).toBe(false);
  });
});

// ============================================================================
// Fix Engine
// ============================================================================

describe("Fix Engine", () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return no-op result when no issues", async () => {
    createProjectStructure(tempDir, "STANDARD");

    // Create enough real content that there are no issues
    const stages = ["00-foundation", "01-planning", "02-design", "04-build", "05-test", "06-deploy", "08-collaborate"];
    for (const stage of stages) {
      const stagePath = path.join(tempDir, "docs", stage);
      mkdirSync(stagePath, { recursive: true });

      // Write real content (no placeholders, enough lines)
      const content = [
        `# Stage: ${stage}`,
        "",
        "## Overview",
        "",
        "This is real content for the stage documentation.",
        "It provides detailed information about the project.",
        "",
        "## Requirements",
        "",
        "All requirements have been met for this stage.",
        "The team has verified each checkpoint.",
        "",
        "## Implementation Details",
        "",
        "The implementation follows best practices.",
        "Each component has been tested and reviewed.",
        "",
        "## Results",
        "",
        "All checks have passed successfully.",
        "Coverage targets have been met.",
      ].join("\n");

      writeFileSync(path.join(stagePath, "README.md"), content);
    }

    // Add required artifacts
    writeFileSync(
      path.join(tempDir, "docs", "00-foundation", "problem-statement.md"),
      "# Problem Statement\n\nReal content for problem statement.\nThis describes the core problem.\nWith multiple meaningful lines.\nAnd more details here.\n\n## Context\n\nAdditional context about the problem.\nMore lines to meet minimum content threshold.\n",
    );
    writeFileSync(
      path.join(tempDir, "docs", "00-foundation", "business-case.md"),
      "# Business Case\n\nReal content for business case.\nThis justifies the project investment.\nWith ROI calculations and market analysis.\n\n## Justification\n\nBusiness justification details.\nMore meaningful content lines.\n",
    );
    writeFileSync(
      path.join(tempDir, "docs", "01-planning", "requirements.md"),
      "# Requirements\n\nFunctional and non-functional requirements.\nDetailed specifications for the project.\nEach requirement has acceptance criteria.\n\n## Functional\n\nCore functionality requirements.\nWith detailed descriptions.\n",
    );

    // Add required subdirs
    mkdirSync(path.join(tempDir, "docs", "02-design", "01-ADRs"), { recursive: true });
    writeFileSync(
      path.join(tempDir, "docs", "02-design", "01-ADRs", "ADR-001.md"),
      "# ADR-001: Architecture Decision\n\nDetailed architecture decision record.\nWith context and rationale.\n\n## Decision\n\nWe decided to use this approach.\nBased on careful analysis.\n",
    );
    mkdirSync(path.join(tempDir, "docs", "04-build", "sprints"), { recursive: true });
    writeFileSync(
      path.join(tempDir, "docs", "04-build", "sprints", "sprint-1.md"),
      "# Sprint 1\n\nSprint goals and deliverables.\nAll tasks completed.\n\n## Tasks\n\nDetailed task list.\nWith acceptance criteria.\n",
    );
    mkdirSync(path.join(tempDir, "docs", "05-test", "test-plans"), { recursive: true });
    writeFileSync(
      path.join(tempDir, "docs", "05-test", "test-plans", "test-plan.md"),
      "# Test Plan\n\nComprehensive test plan.\nWith coverage targets.\n\n## Strategy\n\nTesting strategy details.\nWith test types defined.\n",
    );

    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "STANDARD",
      dryRun: true,
    });

    const result = await engine.fix();
    expect(result.totalIssues).toBe(0);
    expect(result.taskResults.length).toBe(0);
  });

  it("should detect issues in placeholder-only project", async () => {
    createProjectStructure(tempDir, "STANDARD");

    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "STANDARD",
      dryRun: true,
    });

    const result = await engine.fix();
    expect(result.totalIssues).toBeGreaterThan(0);
    expect(result.scoreBefore).toBeLessThan(100);
    expect(result.dryRun).toBe(true);
  });

  it("should process in dry-run mode without writing files", async () => {
    createProjectStructure(tempDir, "STANDARD");

    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "STANDARD",
      dryRun: true,
    });

    const result = await engine.fix();

    // All results should be dry-run previews
    for (const taskResult of result.taskResults) {
      for (const actionResult of taskResult.actionResults) {
        expect(actionResult.dryRun).toBe(true);
      }
    }
  });

  it("should process deterministic fallback and write files", { timeout: 15000 }, async () => {
    createProjectStructure(tempDir, "STANDARD");

    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "STANDARD",
      dryRun: false,
      autoConfirm: true,
    });

    const result = await engine.fix();

    // Should have some fixed issues (deterministic fallback writes)
    expect(result.taskResults.length).toBeGreaterThan(0);

    // At least some actions should succeed
    const totalSuccess = result.taskResults.reduce(
      (sum, r) => sum + r.actionResults.filter((a) => a.success).length,
      0,
    );
    expect(totalSuccess).toBeGreaterThan(0);
  });

  it("should report score improvement after fix", { timeout: 15000 }, async () => {
    createProjectStructure(tempDir, "STANDARD");

    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "STANDARD",
      dryRun: false,
      autoConfirm: true,
    });

    const result = await engine.fix();

    // After deterministic fix, score should improve
    expect(result.scoreAfter).toBeGreaterThanOrEqual(result.scoreBefore);
  });

  it("should create engine with factory function", () => {
    const engine = createComplianceFixEngine({
      projectPath: tempDir,
      tier: "PROFESSIONAL",
      dryRun: true,
    });

    expect(engine).toBeInstanceOf(ComplianceFixEngine);
  });
});
