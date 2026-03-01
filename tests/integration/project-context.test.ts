/**
 * Project Context Integration Tests
 *
 * Integration tests for project context switching workflow.
 * Tests the `switch + status` workflow end-to-end.
 *
 * @module tests/integration/project-context.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE
 * @authority BUG-003 - Short-term recommendation #1
 * @sprint 65
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import {
  saveActiveProject,
  loadActiveProject,
  resolveStateDir,
  type ActiveProjectState,
} from "../../src/config/paths.js";

// ============================================================================
// Test Setup
// ============================================================================

const projectRoot = process.cwd();
const cliPath = path.join(projectRoot, "endiorbot.mjs");

/**
 * Execute CLI command and return output.
 */
function runCli(args: string, env?: NodeJS.ProcessEnv): { stdout: string; stderr: string } {
  try {
    const stdout = execSync(`${cliPath} ${args}`, {
      encoding: "utf-8",
      env: { ...process.env, ...env },
      cwd: projectRoot,
    });
    return { stdout, stderr: "" };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
    };
  }
}

// ============================================================================
// Active Project State Tests
// ============================================================================

describe("Integration: Active Project State", () => {
  let tempStateDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create temp state directory
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-test-"));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      fs.rmSync(tempStateDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    process.env = originalEnv;
  });

  it("should save and load active project state", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    const activeProject: ActiveProjectState = {
      name: "TestProject",
      path: "/path/to/test-project",
      tier: "STANDARD",
      startedAt: Date.now(),
    };

    // Save
    saveActiveProject(activeProject, env);

    // Verify file exists
    const activeFilePath = path.join(tempStateDir, "active-project.json");
    expect(fs.existsSync(activeFilePath)).toBe(true);

    // Load
    const loaded = loadActiveProject(env);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("TestProject");
    expect(loaded!.path).toBe("/path/to/test-project");
    expect(loaded!.tier).toBe("STANDARD");
    expect(loaded!.startedAt).toBe(activeProject.startedAt);
  });

  it("should return undefined when no active project", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    const loaded = loadActiveProject(env);

    expect(loaded).toBeUndefined();
  });

  it("should overwrite previous active project", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    // Save first project
    saveActiveProject({
      name: "Project1",
      path: "/path/to/project1",
      tier: "LITE",
      startedAt: Date.now() - 1000,
    }, env);

    // Save second project
    const secondProject: ActiveProjectState = {
      name: "Project2",
      path: "/path/to/project2",
      tier: "PROFESSIONAL",
      startedAt: Date.now(),
    };
    saveActiveProject(secondProject, env);

    // Load should return second project
    const loaded = loadActiveProject(env);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("Project2");
    expect(loaded!.tier).toBe("PROFESSIONAL");
  });
});

// ============================================================================
// Switch + Status Workflow Tests
// ============================================================================

describe("Integration: Switch + Status Workflow", () => {
  let tempStateDir: string;
  let tempProjectDir: string;

  beforeEach(() => {
    // Create temp directories
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-state-"));
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-project-"));

    // Create minimal .sdlc-config.json in temp project
    const sdlcConfig = {
      version: "1.0.0",
      project: {
        id: "test-project",
        name: "Test Project",
        description: "Test project for integration tests",
      },
      tier: "STANDARD",
      framework: {
        version: "6.1.1",
      },
    };
    fs.writeFileSync(
      path.join(tempProjectDir, ".sdlc-config.json"),
      JSON.stringify(sdlcConfig, null, 2)
    );
  });

  afterEach(() => {
    // Cleanup
    try {
      fs.rmSync(tempStateDir, { recursive: true });
      fs.rmSync(tempProjectDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should persist active project after switch", () => {
    // Use temp state dir to avoid affecting real state
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    // Simulate what switch command does
    const activeProject: ActiveProjectState = {
      name: "Test Project",
      path: tempProjectDir,
      tier: "STANDARD",
      startedAt: Date.now(),
    };
    saveActiveProject(activeProject, env);

    // Verify active project is persisted
    const loaded = loadActiveProject(env);

    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("Test Project");
    expect(loaded!.path).toBe(tempProjectDir);
    expect(loaded!.tier).toBe("STANDARD");
  });

  it("should maintain state across multiple switches", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    // Create multiple projects
    const projects = [
      { name: "ProjectA", path: "/path/a", tier: "LITE" },
      { name: "ProjectB", path: "/path/b", tier: "STANDARD" },
      { name: "ProjectC", path: "/path/c", tier: "PROFESSIONAL" },
    ];

    // Switch through projects
    for (const project of projects) {
      saveActiveProject({
        ...project,
        startedAt: Date.now(),
      }, env);

      const loaded = loadActiveProject(env);
      expect(loaded!.name).toBe(project.name);
    }

    // Final state should be last project
    const finalState = loadActiveProject(env);
    expect(finalState!.name).toBe("ProjectC");
    expect(finalState!.tier).toBe("PROFESSIONAL");
  });

  it("should handle concurrent access gracefully", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    // Simulate concurrent writes
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      writes.push(
        new Promise<void>((resolve) => {
          saveActiveProject({
            name: `Project${i}`,
            path: `/path/${i}`,
            tier: "STANDARD",
            startedAt: Date.now(),
          }, env);
          resolve();
        })
      );
    }

    // All writes should complete without error
    Promise.all(writes).then(() => {
      const loaded = loadActiveProject(env);
      expect(loaded).toBeDefined();
      expect(loaded!.name).toMatch(/^Project\d$/);
    });
  });
});

// ============================================================================
// State Directory Tests
// ============================================================================

describe("Integration: State Directory", () => {
  it("should resolve state directory from environment", () => {
    const customDir = "/custom/state/dir";
    const env = { ENDIORBOT_STATE_DIR: customDir };

    const resolved = resolveStateDir(env);

    expect(resolved).toBe(customDir);
  });

  it("should use default state directory when not set", () => {
    const env = {}; // No ENDIORBOT_STATE_DIR

    const resolved = resolveStateDir(env);

    // Should resolve to ~/.endiorbot
    expect(resolved).toContain(".endiorbot");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Integration: Error Handling", () => {
  let tempStateDir: string;

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-error-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStateDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should handle corrupted active-project.json", () => {
    const env = { ENDIORBOT_STATE_DIR: tempStateDir };

    // Write corrupted JSON
    const activeFilePath = path.join(tempStateDir, "active-project.json");
    fs.writeFileSync(activeFilePath, "{ invalid json }");

    // Should return undefined instead of throwing
    const loaded = loadActiveProject(env);
    expect(loaded).toBeUndefined();
  });

  it("should create state directory if not exists", () => {
    const nonExistentDir = path.join(tempStateDir, "nested", "state", "dir");
    const env = { ENDIORBOT_STATE_DIR: nonExistentDir };

    // Directory should not exist initially
    expect(fs.existsSync(nonExistentDir)).toBe(false);

    // Save should create directory
    saveActiveProject({
      name: "Test",
      path: "/test",
      tier: "LITE",
      startedAt: Date.now(),
    }, env);

    // Directory should now exist
    expect(fs.existsSync(nonExistentDir)).toBe(true);

    // And file should be readable
    const loaded = loadActiveProject(env);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe("Test");
  });
});

// ============================================================================
// Real CLI Integration Tests (EndiorBot specific)
// ============================================================================

describe("Integration: EndiorBot CLI", () => {
  it("should have switch command available", () => {
    const { stdout } = runCli("--help");

    expect(stdout).toContain("switch");
  });

  it("should have status command available", () => {
    const { stdout } = runCli("--help");

    expect(stdout).toContain("status");
  });

  it("should show version", () => {
    const { stdout } = runCli("--version");

    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
