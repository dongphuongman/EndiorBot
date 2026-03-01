/**
 * Git Context Manager
 *
 * Provides git context for context anchoring and time-travel queries.
 * Sprint 65: T5.10 - Git time-travel (branch context).
 *
 * Features:
 * - Branch context injection
 * - Commit history queries
 * - Time-travel file content
 * - Working tree change detection
 *
 * @module context/git-context
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.10
 * @sprint 65
 */

import { execSync } from "node:child_process";
import type { Logger } from "../logging/index.js";
import { createLogger } from "../logging/index.js";
import {
  isGitRepository,
  getCurrentBranch,
  getCurrentCommit,
  getGitState,
  type GitCheckpointState,
} from "../sessions/checkpoint/git-automation.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Git branch info.
 */
export interface GitBranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  isCurrent: boolean;
  /** Last commit SHA */
  lastCommit: string;
  /** Tracking remote branch */
  trackingRemote?: string;
  /** Ahead/behind count */
  aheadBehind?: {
    ahead: number;
    behind: number;
  };
}

/**
 * Git commit info.
 */
export interface GitCommitInfo {
  /** Commit SHA */
  sha: string;
  /** Short SHA (7 chars) */
  shortSha: string;
  /** Commit message (first line) */
  message: string;
  /** Full commit message */
  fullMessage?: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string;
  /** Commit date */
  date: Date;
  /** Files changed */
  filesChanged?: string[];
}

/**
 * Git context for injection.
 */
export interface GitContext {
  /** Whether in a git repo */
  isGitRepo: boolean;
  /** Current branch */
  branch: string;
  /** Current commit */
  commit: string;
  /** Short commit (7 chars) */
  shortCommit: string;
  /** Working tree state */
  workingTreeState: "clean" | "modified" | "untracked" | "mixed";
  /** Uncommitted file count */
  uncommittedCount: number;
  /** Recent commits */
  recentCommits: GitCommitInfo[];
  /** Time since last commit */
  timeSinceLastCommit?: string;
}

/**
 * Time-travel query result.
 */
export interface TimeTravelResult {
  /** Whether query succeeded */
  success: boolean;
  /** File path */
  path: string;
  /** Target commit/ref */
  ref: string;
  /** File content at that point */
  content?: string;
  /** File existed at that point */
  existed: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// GitContextManager Class
// ============================================================================

/**
 * Git Context Manager.
 *
 * Provides git context for context injection and time-travel queries.
 *
 * @example
 * ```typescript
 * const manager = new GitContextManager();
 *
 * // Get git context
 * const context = await manager.getContext();
 * console.log(`On branch: ${context.branch}`);
 *
 * // Time-travel query
 * const oldContent = await manager.getFileAtCommit("src/index.ts", "HEAD~5");
 * ```
 */
export class GitContextManager {
  private readonly logger: Logger;
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.logger = createLogger("GitContextManager");
  }

  /**
   * Log debug message.
   */
  private debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data);
  }

  // =========================================================================
  // Context Retrieval
  // =========================================================================

  /**
   * Get full git context.
   */
  async getContext(recentCommitCount = 5): Promise<GitContext> {
    this.debug("Getting git context", { recentCommitCount });

    const isGitRepo = isGitRepository(this.projectRoot);

    if (!isGitRepo) {
      return {
        isGitRepo: false,
        branch: "none",
        commit: "none",
        shortCommit: "none",
        workingTreeState: "clean",
        uncommittedCount: 0,
        recentCommits: [],
      };
    }

    const state = getGitState(this.projectRoot);
    const recentCommits = await this.getRecentCommits(recentCommitCount);

    // Determine working tree state
    let workingTreeState: GitContext["workingTreeState"] = "clean";
    if (state.uncommittedFiles.length > 0) {
      const hasModified = state.uncommittedFiles.some((f) =>
        f.startsWith("M") || f.startsWith(" M")
      );
      const hasUntracked = state.uncommittedFiles.some((f) =>
        f.startsWith("?")
      );

      if (hasModified && hasUntracked) {
        workingTreeState = "mixed";
      } else if (hasUntracked) {
        workingTreeState = "untracked";
      } else {
        workingTreeState = "modified";
      }
    }

    // Calculate time since last commit
    let timeSinceLastCommit: string | undefined;
    if (recentCommits.length > 0) {
      const lastCommitDate = recentCommits[0]!.date;
      const now = new Date();
      const diffMs = now.getTime() - lastCommitDate.getTime();
      timeSinceLastCommit = this.formatTimeDiff(diffMs);
    }

    const context: GitContext = {
      isGitRepo,
      branch: state.branch,
      commit: state.commitSha,
      shortCommit: state.commitSha.slice(0, 7),
      workingTreeState,
      uncommittedCount: state.uncommittedFiles.length,
      recentCommits,
    };

    if (timeSinceLastCommit) {
      context.timeSinceLastCommit = timeSinceLastCommit;
    }

    return context;
  }

  /**
   * Get current branch info.
   */
  async getCurrentBranchInfo(): Promise<GitBranchInfo | null> {
    if (!isGitRepository(this.projectRoot)) {
      return null;
    }

    const name = getCurrentBranch(this.projectRoot);
    const lastCommit = getCurrentCommit(this.projectRoot);

    // Get tracking info
    let trackingRemote: string | undefined;
    let aheadBehind: { ahead: number; behind: number } | undefined;

    try {
      const upstream = execSync(
        `git rev-parse --abbrev-ref ${name}@{upstream}`,
        {
          cwd: this.projectRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      ).trim();

      if (upstream) {
        trackingRemote = upstream;

        // Get ahead/behind counts
        const counts = execSync(
          `git rev-list --left-right --count ${name}...${upstream}`,
          {
            cwd: this.projectRoot,
            encoding: "utf8",
            stdio: "pipe",
          }
        ).trim();

        const [ahead, behind] = counts.split("\t").map(Number);
        aheadBehind = { ahead: ahead ?? 0, behind: behind ?? 0 };
      }
    } catch {
      // No upstream tracking
    }

    const info: GitBranchInfo = {
      name,
      isCurrent: true,
      lastCommit,
    };

    if (trackingRemote) {
      info.trackingRemote = trackingRemote;
    }
    if (aheadBehind) {
      info.aheadBehind = aheadBehind;
    }

    return info;
  }

  /**
   * Get recent commits.
   */
  async getRecentCommits(count = 10): Promise<GitCommitInfo[]> {
    if (!isGitRepository(this.projectRoot)) {
      return [];
    }

    try {
      // Use --format with delimiters for reliable parsing
      const format = "%H|%h|%s|%an|%ae|%aI";
      const output = execSync(
        `git log -${count} --format="${format}"`,
        {
          cwd: this.projectRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      ).trim();

      if (!output) {
        return [];
      }

      return output.split("\n").map((line) => {
        const [sha, shortSha, message, author, authorEmail, dateStr] =
          line.split("|");
        return {
          sha: sha ?? "",
          shortSha: shortSha ?? "",
          message: message ?? "",
          author: author ?? "",
          authorEmail: authorEmail ?? "",
          date: new Date(dateStr ?? ""),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get commits affecting a specific file.
   */
  async getFileHistory(
    filepath: string,
    count = 10
  ): Promise<GitCommitInfo[]> {
    if (!isGitRepository(this.projectRoot)) {
      return [];
    }

    try {
      const format = "%H|%h|%s|%an|%ae|%aI";
      const output = execSync(
        `git log -${count} --format="${format}" -- "${filepath}"`,
        {
          cwd: this.projectRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      ).trim();

      if (!output) {
        return [];
      }

      return output.split("\n").map((line) => {
        const [sha, shortSha, message, author, authorEmail, dateStr] =
          line.split("|");
        return {
          sha: sha ?? "",
          shortSha: shortSha ?? "",
          message: message ?? "",
          author: author ?? "",
          authorEmail: authorEmail ?? "",
          date: new Date(dateStr ?? ""),
        };
      });
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Time Travel
  // =========================================================================

  /**
   * Get file content at a specific commit/ref.
   */
  async getFileAtCommit(
    filepath: string,
    ref: string
  ): Promise<TimeTravelResult> {
    if (!isGitRepository(this.projectRoot)) {
      return {
        success: false,
        path: filepath,
        ref,
        existed: false,
        error: "Not a git repository",
      };
    }

    try {
      const content = execSync(`git show ${ref}:"${filepath}"`, {
        cwd: this.projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      });

      return {
        success: true,
        path: filepath,
        ref,
        content,
        existed: true,
      };
    } catch (error) {
      // Check if file didn't exist at that commit
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      if (
        errorMsg.includes("does not exist") ||
        errorMsg.includes("fatal: path")
      ) {
        return {
          success: true,
          path: filepath,
          ref,
          existed: false,
        };
      }

      return {
        success: false,
        path: filepath,
        ref,
        existed: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Get diff between two refs for a file.
   */
  async getFileDiff(
    filepath: string,
    fromRef: string,
    toRef = "HEAD"
  ): Promise<string | null> {
    if (!isGitRepository(this.projectRoot)) {
      return null;
    }

    try {
      return execSync(`git diff ${fromRef}..${toRef} -- "${filepath}"`, {
        cwd: this.projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch {
      return null;
    }
  }

  /**
   * List files changed between two refs.
   */
  async getChangedFiles(
    fromRef: string,
    toRef = "HEAD"
  ): Promise<string[]> {
    if (!isGitRepository(this.projectRoot)) {
      return [];
    }

    try {
      const output = execSync(
        `git diff --name-only ${fromRef}..${toRef}`,
        {
          cwd: this.projectRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      ).trim();

      return output ? output.split("\n") : [];
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Context Injection
  // =========================================================================

  /**
   * Format git context for AI injection.
   */
  formatForContext(context: GitContext): string {
    if (!context.isGitRepo) {
      return "**Git:** Not a git repository";
    }

    const lines: string[] = [
      `## Git Context`,
      "",
      `**Branch:** ${context.branch}`,
      `**Commit:** ${context.shortCommit}`,
      `**State:** ${this.formatWorkingTreeState(context.workingTreeState)}`,
    ];

    if (context.uncommittedCount > 0) {
      lines.push(`**Uncommitted Files:** ${context.uncommittedCount}`);
    }

    if (context.timeSinceLastCommit) {
      lines.push(`**Time Since Commit:** ${context.timeSinceLastCommit}`);
    }

    if (context.recentCommits.length > 0) {
      lines.push("");
      lines.push("### Recent Commits");
      lines.push("");

      for (const commit of context.recentCommits.slice(0, 3)) {
        lines.push(
          `- \`${commit.shortSha}\` ${commit.message} (${this.formatRelativeDate(commit.date)})`
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Get compact git context (for token budget).
   */
  getCompactContext(context: GitContext): string {
    if (!context.isGitRepo) {
      return "Git: N/A";
    }

    const parts: string[] = [
      `branch:${context.branch}`,
      `commit:${context.shortCommit}`,
    ];

    if (context.workingTreeState !== "clean") {
      parts.push(`state:${context.workingTreeState}`);
    }

    if (context.uncommittedCount > 0) {
      parts.push(`uncommitted:${context.uncommittedCount}`);
    }

    return `Git: ${parts.join(" | ")}`;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Format time difference as human-readable string.
   */
  private formatTimeDiff(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    }
    if (hours > 0) {
      return `${hours}h ago`;
    }
    if (minutes > 0) {
      return `${minutes}m ago`;
    }
    return `${seconds}s ago`;
  }

  /**
   * Format relative date.
   */
  private formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return this.formatTimeDiff(diffMs);
  }

  /**
   * Format working tree state.
   */
  private formatWorkingTreeState(
    state: GitContext["workingTreeState"]
  ): string {
    switch (state) {
      case "clean":
        return "Clean";
      case "modified":
        return "Modified files";
      case "untracked":
        return "Untracked files";
      case "mixed":
        return "Modified + untracked";
    }
  }

  /**
   * Get git state (re-export from git-automation).
   */
  getGitState(): GitCheckpointState {
    return getGitState(this.projectRoot);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: GitContextManager | null = null;

/**
 * Get the default GitContextManager instance.
 */
export function getGitContextManager(
  projectRoot?: string
): GitContextManager {
  if (!defaultManager || (projectRoot && projectRoot !== process.cwd())) {
    defaultManager = new GitContextManager(projectRoot);
  }
  return defaultManager;
}

/**
 * Reset the default manager.
 */
export function resetGitContextManager(): void {
  defaultManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get current git context.
 */
export async function getGitContext(
  recentCommitCount = 5
): Promise<GitContext> {
  const manager = getGitContextManager();
  return manager.getContext(recentCommitCount);
}

/**
 * Get file at specific commit.
 */
export async function getFileAtRef(
  filepath: string,
  ref: string
): Promise<TimeTravelResult> {
  const manager = getGitContextManager();
  return manager.getFileAtCommit(filepath, ref);
}

/**
 * Format git context for injection.
 */
export async function formatGitContext(): Promise<string> {
  const manager = getGitContextManager();
  const context = await manager.getContext();
  return manager.formatForContext(context);
}
