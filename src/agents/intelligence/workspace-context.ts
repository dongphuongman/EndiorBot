/**
 * Workspace Context — Sprint 114
 *
 * Lightweight git-based workspace context for agent calls.
 * Extracts branch, recent commits, and diff stats.
 * Cached for 60s to avoid repeated git spawns.
 *
 * @module agents/intelligence/workspace-context
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE — Sprint 114
 */

import { execFileSync } from "node:child_process";

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceContext {
  branch: string;
  recentCommits: string[];
  diffStats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

// ============================================================================
// Cache
// ============================================================================

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  context: WorkspaceContext;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/** Clear cache (for testing). @internal */
export function clearWorkspaceContextCache(): void {
  cache.clear();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get workspace context for a repository path.
 * Returns null for non-git directories or on any git error.
 * Results are cached for 60s per repo path.
 */
export function getWorkspaceContext(repoPath: string): WorkspaceContext | null {
  // Check cache
  const cached = cache.get(repoPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.context;
  }

  try {
    const branch = gitExec("rev-parse --abbrev-ref HEAD", repoPath);
    if (!branch) return null; // not a git repo

    const commitOutput = gitExec("log -5 --format=%s", repoPath);
    const recentCommits = commitOutput
      ? commitOutput.split("\n").filter(Boolean)
      : [];

    const diffStats = parseDiffStats(
      gitExec("diff --stat HEAD", repoPath) ?? "",
    );

    const context: WorkspaceContext = { branch, recentCommits, diffStats };
    cache.set(repoPath, { context, timestamp: Date.now() });
    return context;
  } catch {
    return null;
  }
}

/**
 * Format workspace context as a compact string for system prompt injection.
 * Returns empty string if context is null.
 */
export function formatWorkspaceContext(ctx: WorkspaceContext | null): string {
  if (!ctx) return "";

  const parts = [`Branch: ${ctx.branch}`];

  if (ctx.recentCommits.length > 0) {
    parts.push(`Recent: ${ctx.recentCommits.slice(0, 3).join(" | ")}`);
  }

  const { filesChanged, insertions, deletions } = ctx.diffStats;
  if (filesChanged > 0) {
    parts.push(`Uncommitted: ${filesChanged} files (+${insertions}/-${deletions})`);
  }

  return `[Workspace] ${parts.join(" / ")}`;
}

// ============================================================================
// Private
// ============================================================================

function gitExec(args: string, cwd: string): string | null {
  try {
    return execFileSync("git", args.split(/\s+/), {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function parseDiffStats(raw: string): WorkspaceContext["diffStats"] {
  const result = { filesChanged: 0, insertions: 0, deletions: 0 };
  if (!raw) return result;

  // Last line of `git diff --stat` looks like:
  // " 5 files changed, 120 insertions(+), 30 deletions(-)"
  const summary = raw.split("\n").filter(Boolean).pop() ?? "";
  const filesMatch = summary.match(/(\d+)\s+files?\s+changed/);
  const insMatch = summary.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = summary.match(/(\d+)\s+deletions?\(-\)/);

  if (filesMatch) result.filesChanged = parseInt(filesMatch[1]!, 10);
  if (insMatch) result.insertions = parseInt(insMatch[1]!, 10);
  if (delMatch) result.deletions = parseInt(delMatch[1]!, 10);

  return result;
}
