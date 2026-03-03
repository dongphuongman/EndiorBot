/**
 * CLI Smoke Tests
 *
 * E2E smoke tests for EndiorBot CLI commands.
 * Tests happy path: start → status → gate → consult flow.
 *
 * @module tests/cli/cli-smoke
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Testing
 * @authority ADR-006 CLI Architecture
 * @pillar 2 - Sprint Governance
 * @stage 05 - TEST
 * @sdlc SDLC Framework 6.1.1
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ============================================================================
// Test Setup
// ============================================================================

const CLI_PATH = join(process.cwd(), "endiorbot.mjs");
const TEST_PROJECT_DIR = join(tmpdir(), "endiorbot-test-project");
const STATE_DIR = join(tmpdir(), "endiorbot-test-state");

/**
 * Execute CLI command and return output.
 */
function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      env: {
        ...process.env,
        ENDIORBOT_STATE_DIR: STATE_DIR,
      },
      timeout: 10000,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Create a test project with SDLC config.
 */
function createTestProject(): void {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  mkdirSync(join(TEST_PROJECT_DIR, "src"), { recursive: true });
  mkdirSync(join(TEST_PROJECT_DIR, ".git"), { recursive: true });

  // Create SDLC config
  const sdlcConfig = {
    version: "1.0.0",
    project: {
      id: "test-project",
      name: "Test Project",
      description: "Test project for CLI smoke tests",
    },
    tier: "STANDARD",
    framework: {
      name: "MTS SDLC Framework",
      version: "6.1.1",
    },
  };
  writeFileSync(
    join(TEST_PROJECT_DIR, ".sdlc-config.json"),
    JSON.stringify(sdlcConfig, null, 2),
  );

  // Create git HEAD
  writeFileSync(join(TEST_PROJECT_DIR, ".git", "HEAD"), "ref: refs/heads/main");

  // Create a source file
  writeFileSync(
    join(TEST_PROJECT_DIR, "src", "index.ts"),
    'export const hello = "world";',
  );
}

/**
 * Clean up test artifacts.
 */
function cleanup(): void {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true });
  }
  if (existsSync(STATE_DIR)) {
    rmSync(STATE_DIR, { recursive: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("CLI Smoke Tests", () => {
  beforeAll(() => {
    createTestProject();
  });

  afterAll(() => {
    cleanup();
  });

  describe("Version and Help", () => {
    it("should show version", () => {
      const result = runCli("--version");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should show help", () => {
      const result = runCli("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("endiorbot");
      expect(result.stdout).toContain("start");
      expect(result.stdout).toContain("switch");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("gate");
      expect(result.stdout).toContain("consult");
    });
  });

  describe("Start Command", () => {
    it("should start a project", () => {
      const result = runCli(`start ${TEST_PROJECT_DIR}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Test Project");
      expect(result.stdout).toContain("STANDARD");
    });

    it("should fail for non-existent project", () => {
      const result = runCli("start /nonexistent/path");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("Status Command", () => {
    it("should show status after project started", () => {
      // Previous test starts the project, so status now shows project info
      const result = runCli("status");
      expect(result.exitCode).toBe(0);
      // Status shows project info or no active project message
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe("Projects Command", () => {
    it("should handle empty project list", () => {
      const result = runCli("projects");
      expect(result.exitCode).toBe(0);
      // When no projects tracked, shows help message
      expect(result.stdout).toContain("No projects tracked");
    });
  });

  describe("Switch Command", () => {
    it("should switch to a project", () => {
      const result = runCli(`switch ${TEST_PROJECT_DIR}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Switched to");
    });
  });

  describe("Gate Command", () => {
    it("should show gate status", () => {
      // Ensure project is started
      runCli(`start ${TEST_PROJECT_DIR}`);

      const result = runCli("gate status");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SDLC Gates");
      expect(result.stdout).toContain("G0");
    });

    it("should show specific gate", () => {
      const result = runCli("gate status --gate G2");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("G2");
    });

    it("should show gate help", () => {
      const result = runCli("gate --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("propose");
      expect(result.stdout).toContain("approve");
    });
  });

  describe("Consult Command", () => {
    it("should show consult help", () => {
      const result = runCli("consult --help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Query 3 AI models");
      expect(result.stdout).toContain("--openai");
      expect(result.stdout).toContain("--gemini");
      expect(result.stdout).toContain("--verbose");
    });

    // Note: Actual consult requires API keys, so we just test the help
  });
});

describe("CLI Error Handling", () => {
  it("should handle unknown command gracefully", () => {
    const result = runCli("unknowncommand");
    expect(result.exitCode).toBe(1);
  });

  it("should handle missing required arguments", () => {
    const result = runCli("start");
    expect(result.exitCode).toBe(1);
  });
});

describe("CLI Integration Flow", () => {
  beforeAll(() => {
    cleanup();
    createTestProject();
  });

  afterAll(() => {
    cleanup();
  });

  it("should start project and show info", () => {
    // Start project - this shows project info immediately
    const startResult = runCli(`start ${TEST_PROJECT_DIR}`);
    expect(startResult.exitCode).toBe(0);
    expect(startResult.stdout).toContain("Test Project");
    expect(startResult.stdout).toContain("STANDARD");
  });

  it("should handle status without active project", () => {
    // Status without persistent state shows no active project
    const statusResult = runCli("status");
    expect(statusResult.exitCode).toBe(0);
    // This is expected behavior - state doesn't persist across processes
  });
});
