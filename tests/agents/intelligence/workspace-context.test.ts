/**
 * Workspace Context Tests — Sprint 114
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before import
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import {
  getWorkspaceContext,
  formatWorkspaceContext,
  clearWorkspaceContextCache,
} from "../../../src/agents/intelligence/workspace-context.js";
import { execFileSync } from "node:child_process";

const mockExecFileSync = vi.mocked(execFileSync);

describe("WorkspaceContext", () => {
  beforeEach(() => {
    clearWorkspaceContextCache();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getWorkspaceContext", () => {
    it("returns context for a git repo", () => {
      mockExecFileSync
        .mockReturnValueOnce("feature/sprint-114\n") // branch
        .mockReturnValueOnce("fix: token tracking\nfeat: cost command\nrefactor: types\n") // log
        .mockReturnValueOnce(" 5 files changed, 120 insertions(+), 30 deletions(-)\n"); // diff stat

      const ctx = getWorkspaceContext("/test/repo");
      expect(ctx).not.toBeNull();
      expect(ctx!.branch).toBe("feature/sprint-114");
      expect(ctx!.recentCommits).toEqual(["fix: token tracking", "feat: cost command", "refactor: types"]);
      expect(ctx!.diffStats).toEqual({ filesChanged: 5, insertions: 120, deletions: 30 });
    });

    it("returns null for non-git directory", () => {
      mockExecFileSync.mockImplementation(() => { throw new Error("not a git repo"); });
      const ctx = getWorkspaceContext("/tmp/not-git");
      expect(ctx).toBeNull();
    });

    it("returns null when branch command fails", () => {
      mockExecFileSync.mockReturnValueOnce(""); // empty branch = not a git repo
      const ctx = getWorkspaceContext("/tmp/empty");
      expect(ctx).toBeNull();
    });

    it("caches results for 60s", () => {
      mockExecFileSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("commit1\n")
        .mockReturnValueOnce("");

      const ctx1 = getWorkspaceContext("/test/cached");
      const ctx2 = getWorkspaceContext("/test/cached");

      expect(ctx1).toEqual(ctx2);
      // execSync called 3 times for first call, 0 times for second (cached)
      expect(mockExecFileSync).toHaveBeenCalledTimes(3);
    });

    it("handles empty diff stats", () => {
      mockExecFileSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("commit1\n")
        .mockReturnValueOnce(""); // no uncommitted changes

      const ctx = getWorkspaceContext("/test/clean");
      expect(ctx!.diffStats).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
    });

    it("handles single file changed in diff stats", () => {
      mockExecFileSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("")
        .mockReturnValueOnce(" 1 file changed, 3 insertions(+)\n");

      const ctx = getWorkspaceContext("/test/single");
      expect(ctx!.diffStats.filesChanged).toBe(1);
      expect(ctx!.diffStats.insertions).toBe(3);
      expect(ctx!.diffStats.deletions).toBe(0);
    });
  });

  describe("formatWorkspaceContext", () => {
    it("formats context as compact string", () => {
      const ctx = {
        branch: "feature/sprint-114",
        recentCommits: ["fix: tokens", "feat: cost"],
        diffStats: { filesChanged: 3, insertions: 50, deletions: 10 },
      };

      const formatted = formatWorkspaceContext(ctx);
      expect(formatted).toContain("[Workspace]");
      expect(formatted).toContain("Branch: feature/sprint-114");
      expect(formatted).toContain("Recent: fix: tokens | feat: cost");
      expect(formatted).toContain("Uncommitted: 3 files (+50/-10)");
    });

    it("returns empty string for null context", () => {
      expect(formatWorkspaceContext(null)).toBe("");
    });

    it("omits uncommitted section when no changes", () => {
      const ctx = {
        branch: "main",
        recentCommits: ["initial"],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      };

      const formatted = formatWorkspaceContext(ctx);
      expect(formatted).not.toContain("Uncommitted");
    });

    it("limits recent commits to 3", () => {
      const ctx = {
        branch: "main",
        recentCommits: ["c1", "c2", "c3", "c4", "c5"],
        diffStats: { filesChanged: 0, insertions: 0, deletions: 0 },
      };

      const formatted = formatWorkspaceContext(ctx);
      expect(formatted).toContain("c1 | c2 | c3");
      expect(formatted).not.toContain("c4");
    });
  });
});
