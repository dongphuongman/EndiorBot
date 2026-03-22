/**
 * Session Handoff
 *
 * Creates, saves, and loads session handoff documents.
 * Captures agent intent (workingOn, blocked, nextSteps) for session continuity.
 *
 * Adapted from ClawVault's sleep command (src/commands/sleep.ts).
 *
 * @module memory/session-handoff
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 * @origin ClawVault v3.2.0 (src/commands/sleep.ts)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionHandoff } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Base directory for handoff storage. */
const MEMORY_BASE_DIR = join(homedir(), ".endiorbot", "memory");

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a session handoff document.
 * Generates a timestamp automatically.
 *
 * @param data - Handoff data (sessionId, workingOn, blocked, etc.)
 * @returns Complete SessionHandoff with createdAt timestamp
 */
export function createHandoff(
  data: Omit<SessionHandoff, "createdAt">,
): SessionHandoff {
  return {
    ...data,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Save a handoff document to disk.
 * Storage: ~/.endiorbot/memory/{projectId}/handoffs/{sessionId}.json
 *
 * @param projectId - Project identifier for scoping
 * @param handoff - The handoff document to save
 */
export function saveHandoff(projectId: string, handoff: SessionHandoff): void {
  const handoffDir = getHandoffDir(projectId);

  if (!existsSync(handoffDir)) {
    mkdirSync(handoffDir, { recursive: true });
  }

  const filePath = join(handoffDir, `${handoff.sessionId}.json`);
  writeFileSync(filePath, JSON.stringify(handoff, null, 2), "utf-8");
}

/**
 * Load the most recent handoff document for a project.
 * Uses filesystem mtime to find the newest file — O(1) reads instead of O(n).
 * (CTO F1: loadLatestHandoff perf optimization)
 *
 * @param projectId - Project identifier
 * @returns Latest SessionHandoff or null if none exists
 */
export function loadLatestHandoff(projectId: string): SessionHandoff | null {
  const handoffDir = getHandoffDir(projectId);

  if (!existsSync(handoffDir)) return null;

  const files = readdirSync(handoffDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  // Find newest file by mtime — avoids reading all files (CTO F1)
  let newestFile = files[0]!;
  let newestMtime = 0;
  for (const file of files) {
    try {
      const mtime = statSync(join(handoffDir, file)).mtimeMs;
      if (mtime > newestMtime) {
        newestMtime = mtime;
        newestFile = file;
      }
    } catch {
      // Skip files we can't stat
    }
  }

  try {
    const content = readFileSync(join(handoffDir, newestFile), "utf-8");
    return JSON.parse(content) as SessionHandoff;
  } catch {
    console.warn(`[SessionHandoff] Skipping malformed handoff: ${newestFile}`);
    return null;
  }
}

/**
 * Load all handoff documents for a project.
 * Sorted by createdAt ascending (oldest first).
 *
 * @param projectId - Project identifier
 * @returns Array of SessionHandoff documents
 */
export function loadAllHandoffs(projectId: string): SessionHandoff[] {
  const handoffDir = getHandoffDir(projectId);

  if (!existsSync(handoffDir)) return [];

  const files = readdirSync(handoffDir).filter((f) => f.endsWith(".json"));
  const handoffs: SessionHandoff[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(handoffDir, file), "utf-8");
      handoffs.push(JSON.parse(content) as SessionHandoff);
    } catch {
      console.warn(`[SessionHandoff] Skipping malformed handoff: ${file}`);
    }
  }

  handoffs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return handoffs;
}

// ============================================================================
// Internal
// ============================================================================

function getHandoffDir(projectId: string): string {
  return join(MEMORY_BASE_DIR, projectId, "handoffs");
}
