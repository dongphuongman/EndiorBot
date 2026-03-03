/**
 * Compliance Command Tests
 *
 * Unit tests for SDLC compliance checking command.
 *
 * @module tests/cli/commands/compliance
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-compliance-test-"));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function runCompliance(args: string, cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ./dist/cli/index.js compliance ${args}`, {
      cwd: process.cwd(),
      env: { ...process.env, ENDIORBOT_STATE_DIR: tempDir },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || error.message,
      exitCode: error.status || 1,
    };
  }
}

function createProjectStructure(
  projectDir: string,
  tier: "LITE" | "STANDARD" = "LITE"
): void {
  // Create config
  const config = {
    schema_version: "1.0.0",
    framework_version: "6.1.1",
    generator: "endiorbot",
    generated_at: new Date().toISOString(),
    project: {
      id: "test-project",
      name: "Test Project",
    },
    tier,
  };
  fs.writeFileSync(
    path.join(projectDir, ".sdlc-config.json"),
    JSON.stringify(config, null, 2)
  );

  // Create root files based on tier
  // LITE requires: CLAUDE.md, IDENTITY.md
  // STANDARD requires: CLAUDE.md, IDENTITY.md, AGENTS.md
  fs.writeFileSync(path.join(projectDir, "CLAUDE.md"), "# CLAUDE.md");
  fs.writeFileSync(path.join(projectDir, "IDENTITY.md"), "# IDENTITY.md");
  if (tier !== "LITE") {
    fs.writeFileSync(path.join(projectDir, "AGENTS.md"), "# AGENTS.md");
  }

  // Create .claude directory
  fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, ".claude", "settings.local.json"),
    "{}"
  );

  // Create docs structure
  const stages =
    tier === "LITE"
      ? ["00-foundation", "01-planning", "02-design", "04-build"]
      : [
          "00-foundation",
          "01-planning",
          "02-design",
          "04-build",
          "05-test",
          "06-deploy",
          "08-collaborate",
        ];

  for (const stage of stages) {
    fs.mkdirSync(path.join(projectDir, "docs", stage), { recursive: true });
  }
}

// ============================================================================
// Command Tests
// ============================================================================

describe("compliance check", () => {
  it("should show help", () => {
    const result = runCompliance("check --help", process.cwd());
    expect(result.stdout).toContain("Check project compliance");
  });

  it("should check compliance in current directory", () => {
    const result = runCompliance("check", process.cwd());
    expect(result.stdout).toContain("L1 Structure:");
  });

  it("should support --path option", () => {
    createProjectStructure(tempDir, "LITE");

    const result = runCompliance(`check --path "${tempDir}"`, process.cwd());
    expect(result.stdout).toContain("L1 Structure:");
    expect(result.stdout).toContain("100%");
  });

  it("should support --tier option", () => {
    createProjectStructure(tempDir, "LITE");

    // Check with STANDARD tier (should fail - missing stages)
    const result = runCompliance(
      `check --path "${tempDir}" --tier STANDARD`,
      process.cwd()
    );
    expect(result.stdout).toContain("Missing stage:");
  });

  it("should support --json option", () => {
    createProjectStructure(tempDir, "LITE");

    const result = runCompliance(`check --path "${tempDir}" --json`, process.cwd());

    // Should be valid JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();

    const parsed = JSON.parse(result.stdout);
    expect(parsed.passed).toBe(true);
    expect(parsed.score).toBe(100);
    expect(parsed.tier).toBe("LITE");
  });

  it("should detect missing files", () => {
    // Create partial structure (no IDENTITY.md - required for LITE)
    fs.writeFileSync(
      path.join(tempDir, ".sdlc-config.json"),
      JSON.stringify({ generator: "endiorbot", tier: "LITE" })
    );
    fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# CLAUDE");
    // Missing IDENTITY.md (required for LITE)

    const result = runCompliance(`check --path "${tempDir}" --json`, process.cwd());
    const parsed = JSON.parse(result.stdout);

    expect(parsed.passed).toBe(false);
    expect(parsed.missingFiles).toContain("IDENTITY.md");
  });

  it("should detect missing stages", () => {
    createProjectStructure(tempDir, "LITE");

    // Remove one stage
    fs.rmSync(path.join(tempDir, "docs", "04-build"), { recursive: true });

    const result = runCompliance(`check --path "${tempDir}" --json`, process.cwd());
    const parsed = JSON.parse(result.stdout);

    expect(parsed.passed).toBe(false);
    expect(parsed.missingStages).toContain("04-build");
  });
});

describe("compliance score", () => {
  it("should show help", () => {
    const result = runCompliance("score --help", process.cwd());
    expect(result.stdout).toContain("Show compliance score");
  });

  it("should show score for current directory", () => {
    const result = runCompliance("score", process.cwd());
    // L2 mode shows: "L1: X% (structure) | L2: Y% (content)"
    expect(result.stdout).toContain("(structure)");
  });

  it("should show 100% for complete project", () => {
    createProjectStructure(tempDir, "LITE");

    const result = runCompliance(`score --path "${tempDir}"`, process.cwd());
    expect(result.stdout).toContain("100%");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("compliance edge cases", () => {
  it("should handle empty directory", () => {
    const result = runCompliance(`check --path "${tempDir}"`, process.cwd());
    // Should fail gracefully - outputs error via console.error
    expect(result.exitCode).toBe(1);
  });

  it("should handle --strict mode", () => {
    // Create incomplete project
    fs.writeFileSync(
      path.join(tempDir, ".sdlc-config.json"),
      JSON.stringify({ generator: "endiorbot", tier: "LITE" })
    );

    const result = runCompliance(`check --path "${tempDir}" --strict`, process.cwd());
    expect(result.exitCode).toBe(1);
  });

  it("should calculate correct score", () => {
    createProjectStructure(tempDir, "LITE");

    // LITE tier has 2 required files + 4 stages = 6 total checks
    // Remove 1 stage
    fs.rmSync(path.join(tempDir, "docs", "04-build"), { recursive: true });

    const result = runCompliance(`check --path "${tempDir}" --json`, process.cwd());
    const parsed = JSON.parse(result.stdout);

    // 5 passed / 6 total = 83%
    expect(parsed.score).toBe(83);
  });
});
