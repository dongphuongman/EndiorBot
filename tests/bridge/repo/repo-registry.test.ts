/**
 * RepoRegistry Tests (Sprint 83)
 *
 * Tests for file-backed repo CRUD with path validation (CPO CA4).
 *
 * @module tests/bridge/repo/repo-registry
 * @authority ADR-024 D4, Sprint 83
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RepoRegistry, validateRepoPath } from "../../../src/bridge/repo/repo-registry.js";

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;
let registryPath: string;

function createFakeRepo(name: string): string {
  const repoDir = join(tempDir, name);
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, ".git"));
  return repoDir;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "repo-registry-test-"));
  registryPath = join(tempDir, "repos.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ============================================================================
// Path Validation
// ============================================================================

describe("validateRepoPath", () => {
  it("rejects relative paths", () => {
    const result = validateRepoPath("relative/path");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("absolute");
  });

  it("rejects path traversal", () => {
    const result = validateRepoPath("/home/user/../etc");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("traversal");
  });

  it("rejects non-existent directory", () => {
    const result = validateRepoPath("/tmp/nonexistent_repo_12345");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("rejects directory without .git", () => {
    const noGitDir = join(tempDir, "no-git");
    mkdirSync(noGitDir);
    const result = validateRepoPath(noGitDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(".git");
  });

  it("accepts valid repo directory", () => {
    const repoDir = createFakeRepo("valid-repo");
    const result = validateRepoPath(repoDir);
    expect(result.valid).toBe(true);
  });

  it("rejects file path (not directory)", () => {
    const filePath = join(tempDir, "some-file.txt");
    writeFileSync(filePath, "hello");
    const result = validateRepoPath(filePath);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not a directory");
  });
});

// ============================================================================
// RepoRegistry CRUD
// ============================================================================

describe("RepoRegistry", () => {
  it("lists empty registry", () => {
    const registry = new RepoRegistry(registryPath);
    expect(registry.list()).toEqual([]);
  });

  it("adds a repo and retrieves it", () => {
    const repoDir = createFakeRepo("myrepo");
    const registry = new RepoRegistry(registryPath);
    const result = registry.add("myrepo", repoDir);
    expect(result.success).toBe(true);

    const repo = registry.get("myrepo");
    expect(repo).not.toBeNull();
    expect(repo!.name).toBe("myrepo");
    expect(repo!.path).toBe(repoDir);
    expect(repo!.registeredAt).toBeTruthy();
  });

  it("adds repo with optional fields", () => {
    const repoDir = createFakeRepo("optrepo");
    const registry = new RepoRegistry(registryPath);
    registry.add("optrepo", repoDir, {
      defaultBranch: "develop",
      riskProfile: "dev",
      envAllowlist: ["NODE_ENV"],
    });

    const repo = registry.get("optrepo");
    expect(repo!.defaultBranch).toBe("develop");
    expect(repo!.riskProfile).toBe("dev");
    expect(repo!.envAllowlist).toEqual(["NODE_ENV"]);
  });

  it("rejects duplicate repo name", () => {
    const repoDir = createFakeRepo("dup");
    const registry = new RepoRegistry(registryPath);
    registry.add("dup", repoDir);
    const result = registry.add("dup", repoDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("rejects invalid path", () => {
    const registry = new RepoRegistry(registryPath);
    const result = registry.add("bad", "relative/path");
    expect(result.success).toBe(false);
    expect(result.error).toContain("absolute");
  });

  it("lists multiple repos", () => {
    const repo1 = createFakeRepo("repo1");
    const repo2 = createFakeRepo("repo2");
    const registry = new RepoRegistry(registryPath);
    registry.add("repo1", repo1);
    registry.add("repo2", repo2);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.name).sort()).toEqual(["repo1", "repo2"]);
  });

  it("removes a repo", () => {
    const repoDir = createFakeRepo("removeme");
    const registry = new RepoRegistry(registryPath);
    registry.add("removeme", repoDir);
    expect(registry.get("removeme")).not.toBeNull();

    const removed = registry.remove("removeme");
    expect(removed).toBe(true);
    expect(registry.get("removeme")).toBeNull();
  });

  it("remove returns false for nonexistent repo", () => {
    const registry = new RepoRegistry(registryPath);
    expect(registry.remove("nonexistent")).toBe(false);
  });

  it("get returns null for nonexistent repo", () => {
    const registry = new RepoRegistry(registryPath);
    expect(registry.get("nonexistent")).toBeNull();
  });

  it("persists across instances", () => {
    const repoDir = createFakeRepo("persist");
    const registry1 = new RepoRegistry(registryPath);
    registry1.add("persist", repoDir);

    const registry2 = new RepoRegistry(registryPath);
    expect(registry2.get("persist")).not.toBeNull();
  });

  it("increments version on each write", () => {
    const repoDir1 = createFakeRepo("v1");
    const repoDir2 = createFakeRepo("v2");
    const registry = new RepoRegistry(registryPath);
    registry.add("v1", repoDir1);
    registry.add("v2", repoDir2);

    // Read raw file to check version
    const raw = JSON.parse(readFileSync(registryPath, "utf-8"));
    expect(raw.version).toBe(2);
    expect(raw.checksum).toBeTruthy();
  });
});
