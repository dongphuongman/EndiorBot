/**
 * Structure Generator Tests
 *
 * Unit tests for project structure scaffolding.
 *
 * @module tests/sdlc/scaffold/structure-generator
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scaffoldProject,
  slugify,
  createBackup,
} from "../../../src/sdlc/scaffold/structure-generator.js";
import type { ScaffoldConfig } from "../../../src/sdlc/scaffold/types.js";

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(tmpdir(), "endiorbot-scaffold-test-" + Date.now());

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// slugify Tests
// ============================================================================

describe("slugify", () => {
  it("should convert to lowercase", () => {
    expect(slugify("MyProject")).toBe("myproject");
    expect(slugify("UPPERCASE")).toBe("uppercase");
  });

  it("should replace spaces with hyphens", () => {
    expect(slugify("my project")).toBe("my-project");
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("should replace special characters with hyphens", () => {
    expect(slugify("my_project")).toBe("my-project");
    expect(slugify("my.project")).toBe("my-project");
    expect(slugify("my@project!")).toBe("my-project");
  });

  it("should remove leading and trailing hyphens", () => {
    expect(slugify("-myproject-")).toBe("myproject");
    expect(slugify("--test--")).toBe("test");
  });

  it("should collapse multiple hyphens", () => {
    expect(slugify("my---project")).toBe("my-project");
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  it("should handle empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ============================================================================
// scaffoldProject Tests - Dry Run
// ============================================================================

describe("scaffoldProject - Dry Run", () => {
  it("should not create files in dry run mode", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: true,
      force: false,
    };

    const result = await scaffoldProject(config);

    expect(result.success).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);

    // Should have would-create status
    const wouldCreate = result.steps.filter(
      (s) => s.status === "would-create"
    );
    expect(wouldCreate.length).toBeGreaterThan(0);

    // Files should not exist
    expect(existsSync(join(TEST_DIR, ".sdlc-config.json"))).toBe(false);
  });
});

// ============================================================================
// scaffoldProject Tests - LITE Tier
// ============================================================================

describe("scaffoldProject - LITE Tier", () => {
  it("should create .sdlc-config.json", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const configPath = join(TEST_DIR, ".sdlc-config.json");
    expect(existsSync(configPath)).toBe(true);

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.generator).toBe("endiorbot");
    expect(content.tier).toBe("LITE");
  });

  it("should create CLAUDE.md", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const claudePath = join(TEST_DIR, "CLAUDE.md");
    expect(existsSync(claudePath)).toBe(true);

    const content = readFileSync(claudePath, "utf-8");
    expect(content).toContain("CLAUDE.md");
    expect(content).toContain("lite-project");
  });

  it("should create IDENTITY.md", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const identityPath = join(TEST_DIR, "IDENTITY.md");
    expect(existsSync(identityPath)).toBe(true);
  });

  it("should NOT create AGENTS.md for LITE tier", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const agentsPath = join(TEST_DIR, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(false);
  });

  it("should create docs/ with LITE stages", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const docsPath = join(TEST_DIR, "docs");
    expect(existsSync(docsPath)).toBe(true);
    expect(existsSync(join(docsPath, "00-foundation"))).toBe(true);
    expect(existsSync(join(docsPath, "01-planning"))).toBe(true);
  });
});

// ============================================================================
// scaffoldProject Tests - STANDARD Tier
// ============================================================================

describe("scaffoldProject - STANDARD Tier", () => {
  it("should create AGENTS.md for STANDARD tier", async () => {
    const config: ScaffoldConfig = {
      projectName: "standard-project",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const agentsPath = join(TEST_DIR, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);

    const content = readFileSync(agentsPath, "utf-8");
    expect(content).toContain("Agent Roster");
    expect(content).toContain("STANDARD");
  });

  it("should create docs/ with STANDARD stages", async () => {
    const config: ScaffoldConfig = {
      projectName: "standard-project",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const docsPath = join(TEST_DIR, "docs");
    expect(existsSync(join(docsPath, "04-build"))).toBe(true);
    expect(existsSync(join(docsPath, "05-test"))).toBe(true);
  });
});

// ============================================================================
// scaffoldProject Tests - Existing Files
// ============================================================================

describe("scaffoldProject - Existing Files", () => {
  it("should preserve existing files without force flag", async () => {
    // Create existing file
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# Existing Content");

    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    const result = await scaffoldProject(config);

    // Should have preserved status
    const preserved = result.steps.filter((s) => s.status === "preserved");
    expect(preserved.length).toBeGreaterThan(0);

    // Original content should remain
    const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Existing Content");
  });

  it("should overwrite existing files with force flag", async () => {
    // Create existing file
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# Old Content");

    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: true,
    };

    await scaffoldProject(config);

    // Content should be updated
    const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content).not.toBe("# Old Content");
    expect(content).toContain("test-project");
  });

  it("should skip identical files", async () => {
    // First run
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    // Second run
    const result = await scaffoldProject(config);

    // Should have skipped status for identical files
    const skipped = result.steps.filter((s) => s.status === "skipped");
    expect(skipped.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// scaffoldProject Tests - Claude Structure
// ============================================================================

describe("scaffoldProject - Claude Structure", () => {
  it("should create .claude/ directory", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const claudePath = join(TEST_DIR, ".claude");
    expect(existsSync(claudePath)).toBe(true);
  });

  it("should create .claude/commands/", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const commandsPath = join(TEST_DIR, ".claude", "commands");
    expect(existsSync(commandsPath)).toBe(true);
    expect(existsSync(join(commandsPath, "gate.md"))).toBe(true);
    expect(existsSync(join(commandsPath, "consult.md"))).toBe(true);
  });

  it("should create .claude/hooks/", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const hooksPath = join(TEST_DIR, ".claude", "hooks");
    expect(existsSync(hooksPath)).toBe(true);
    expect(existsSync(join(hooksPath, "pre-tool-use.sh"))).toBe(true);
  });

  it("should create .claude/settings.json", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const settingsPath = join(TEST_DIR, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const content = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(content.hooks).toBeDefined();
    expect(content.commands).toBeDefined();
  });
});

// ============================================================================
// scaffoldProject Tests - Result
// ============================================================================

describe("scaffoldProject - Result", () => {
  it("should return success for valid scaffold", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    const result = await scaffoldProject(config);

    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("should include all steps in result", async () => {
    const config: ScaffoldConfig = {
      projectName: "test-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    const result = await scaffoldProject(config);

    expect(result.steps.length).toBeGreaterThan(5);

    // Each step should have required properties
    for (const step of result.steps) {
      expect(step.name).toBeDefined();
      expect(step.path).toBeDefined();
      expect(step.status).toBeDefined();
    }
  });
});

// ============================================================================
// Layered CLAUDE.md — Sprint 150 (ADR-055)
// ============================================================================

describe("scaffoldProject - Layered CLAUDE.md", () => {
  it("should NOT create subdir CLAUDE.md for LITE tier", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    expect(existsSync(join(TEST_DIR, "src", "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "tests", "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "docs", "CLAUDE.md"))).toBe(false);
  });

  it("should create src/ and tests/ CLAUDE.md for STANDARD tier", async () => {
    const config: ScaffoldConfig = {
      projectName: "std-project",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    expect(existsSync(join(TEST_DIR, "src", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "tests", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "docs", "CLAUDE.md"))).toBe(false);
  });

  it("should create src/, docs/, and tests/ CLAUDE.md for PROFESSIONAL tier", async () => {
    const config: ScaffoldConfig = {
      projectName: "pro-project",
      tier: "PROFESSIONAL",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    expect(existsSync(join(TEST_DIR, "src", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "tests", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "docs", "CLAUDE.md"))).toBe(true);
  });

  it("should include Context Files section in root CLAUDE.md for STANDARD+", async () => {
    const config: ScaffoldConfig = {
      projectName: "std-project",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const rootClaude = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(rootClaude).toContain("## Context Files");
    expect(rootClaude).toContain("src/CLAUDE.md");
    expect(rootClaude).toContain("tests/CLAUDE.md");
  });

  it("should NOT include Context Files section in root CLAUDE.md for LITE", async () => {
    const config: ScaffoldConfig = {
      projectName: "lite-project",
      tier: "LITE",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const rootClaude = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(rootClaude).not.toContain("## Context Files");
  });

  it("should generate subdir CLAUDE.md under 100 lines", async () => {
    const config: ScaffoldConfig = {
      projectName: "pro-project",
      tier: "PROFESSIONAL",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const srcLines = readFileSync(join(TEST_DIR, "src", "CLAUDE.md"), "utf-8").split("\n").length;
    const testsLines = readFileSync(join(TEST_DIR, "tests", "CLAUDE.md"), "utf-8").split("\n").length;
    const docsLines = readFileSync(join(TEST_DIR, "docs", "CLAUDE.md"), "utf-8").split("\n").length;

    expect(srcLines).toBeLessThan(100);
    expect(testsLines).toBeLessThan(100);
    expect(docsLines).toBeLessThan(100);
  });

  it("should preserve existing subdir CLAUDE.md on re-init without force", async () => {
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    writeFileSync(join(TEST_DIR, "src", "CLAUDE.md"), "# Custom src rules\n");

    const config: ScaffoldConfig = {
      projectName: "std-project",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      dryRun: false,
      force: false,
    };

    await scaffoldProject(config);

    const content = readFileSync(join(TEST_DIR, "src", "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Custom src rules\n");
  });
});

// ============================================================================
// createBackup Tests
// ============================================================================

describe("createBackup", () => {
  it("should create backup directory", async () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# Test");

    const backupPath = await createBackup(TEST_DIR, ["CLAUDE.md"]);

    expect(existsSync(backupPath)).toBe(true);
    expect(existsSync(join(backupPath, "CLAUDE.md"))).toBe(true);
  });

  it("should copy file contents", async () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# Original Content");

    const backupPath = await createBackup(TEST_DIR, ["CLAUDE.md"]);

    const content = readFileSync(join(backupPath, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# Original Content");
  });

  it("should handle nested files", async () => {
    mkdirSync(join(TEST_DIR, "docs"));
    writeFileSync(join(TEST_DIR, "docs", "README.md"), "# Docs");

    const backupPath = await createBackup(TEST_DIR, ["docs/README.md"]);

    expect(existsSync(join(backupPath, "docs", "README.md"))).toBe(true);
  });

  it("should skip non-existent files", async () => {
    const backupPath = await createBackup(TEST_DIR, ["non-existent.md"]);

    expect(existsSync(backupPath)).toBe(true);
    expect(existsSync(join(backupPath, "non-existent.md"))).toBe(false);
  });

  it("should skip directories (Bug #1 fix)", async () => {
    // Create a directory and a file
    mkdirSync(join(TEST_DIR, "docs"));
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# Test");

    // Include both directory and file in backup list
    const backupPath = await createBackup(TEST_DIR, ["docs", "CLAUDE.md"]);

    // Should succeed without throwing
    expect(existsSync(backupPath)).toBe(true);
    // Directory should not be copied (just skipped)
    expect(existsSync(join(backupPath, "docs"))).toBe(false);
    // File should be copied
    expect(existsSync(join(backupPath, "CLAUDE.md"))).toBe(true);
  });
});

// ============================================================================
// generateStageReadme — Sprint 80: Gate + Upstream + Artifact Checklist
// ============================================================================

describe("generateStageReadme — SDLC 6.1.1 enrichment (Sprint 80)", () => {
  async function scaffoldStandard() {
    const config: ScaffoldConfig = {
      projectName: "sprint80-test",
      tier: "STANDARD",
      targetPath: TEST_DIR,
      force: true,
    };
    await scaffoldProject(config);
  }

  it("02-design README contains G2 gate requirement checklist", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "02-design", "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("G2");
    expect(content).toContain("[ ]");
    expect(content).toContain("Quality Gate Requirements");
  });

  it("04-build README contains G-Sprint gate requirement checklist", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "04-build", "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("G-Sprint");
    expect(content).toContain("[ ]");
  });

  it("01-planning README links to ../00-foundation/ upstream", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "01-planning", "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("../00-foundation/");
    expect(content).toContain("Dependencies");
  });

  it("05-test README links to ../01-planning/ and ../04-build/ upstream", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "05-test", "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("../01-planning/");
    expect(content).toContain("../04-build/");
  });

  it("02-design README contains artifact checklist", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "02-design", "README.md");
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("Artifact Checklist");
    // architecture.md and api-spec.yaml are optional for 02-design
    expect(content).toMatch(/architecture\.md|api-spec\.yaml/);
  });

  it("00-foundation README contains required artifacts (problem-statement, business-case)", async () => {
    await scaffoldStandard();
    const readmePath = join(TEST_DIR, "docs", "00-foundation", "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("Artifact Checklist");
    expect(content).toContain("problem-statement.md");
    expect(content).toContain("✅ Required");
  });

  it("stage READMEs do NOT contain placeholder 'TODO: Add' markers", async () => {
    await scaffoldStandard();
    for (const stage of ["01-planning", "02-design", "04-build", "05-test"]) {
      const readmePath = join(TEST_DIR, "docs", stage, "README.md");
      if (existsSync(readmePath)) {
        const content = readFileSync(readmePath, "utf-8");
        // Old placeholder pattern should be gone
        expect(content).not.toContain("TODO: Add");
      }
    }
  });

  // Sprint 138 P3-03: gitignore template should cover .sdlc-framework
  // symlink/dir so VoiceOfVietnam-style scaffolds don't leave an untracked
  // entry on every `git status`.
  it("scaffolded .gitignore ignores .sdlc-framework without trailing slash", async () => {
    await scaffoldStandard();
    const gitignorePath = join(TEST_DIR, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf-8");
    // No trailing slash matches both symlink → dir and plain dir cases.
    expect(content).toMatch(/^\.sdlc-framework\s*$/m);
    // Ensure the original entries are still present (regression guard).
    expect(content).toContain(".claude/");
    expect(content).toContain(".endiorbot/");
  });
});
