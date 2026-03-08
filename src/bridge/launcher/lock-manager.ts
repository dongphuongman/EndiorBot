/**
 * Lock Manager — Launcher singleton enforcement.
 *
 * Manages ~/.endiorbot/launcher.lock to prevent duplicate launcher instances.
 * Detects stale locks (dead PIDs) and removes them automatically.
 *
 * @module bridge/launcher/lock-manager
 * @version 1.0.0
 * @authority ADR-024 (Sprint 92)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export interface LockFileContent {
  pid: number;
  startTime: number;
}

export interface LockManagerDeps {
  /** Override lock file path (default: ~/.endiorbot/launcher.lock) */
  lockPath?: string;
  /** Injectable liveness check (default: process.kill(pid, 0)) */
  isProcessAlive?: (pid: number) => boolean;
}

export interface AcquireResult {
  acquired: boolean;
  error?: string;
  staleLockRemoved?: boolean;
}

// ============================================================================
// Default Liveness Check
// ============================================================================

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Lock Manager
// ============================================================================

const DEFAULT_LOCK_PATH = join(homedir(), ".endiorbot", "launcher.lock");

export class LockManager {
  private readonly lockPath: string;
  private readonly isProcessAlive: (pid: number) => boolean;

  constructor(deps?: LockManagerDeps) {
    this.lockPath = deps?.lockPath ?? DEFAULT_LOCK_PATH;
    this.isProcessAlive = deps?.isProcessAlive ?? defaultIsProcessAlive;
  }

  /**
   * Acquire the launcher lock.
   *
   * - If lock exists and PID alive → fail (already running)
   * - If lock exists and PID dead → remove stale lock, acquire
   * - If no lock → acquire
   */
  acquire(): AcquireResult {
    const existing = this.readLock();
    let staleLockRemoved = false;

    if (existing) {
      if (this.isProcessAlive(existing.pid)) {
        return {
          acquired: false,
          error: `Launcher already running (PID ${existing.pid})`,
        };
      }

      // Stale lock — process is dead
      try {
        unlinkSync(this.lockPath);
      } catch {
        // Already gone
      }
      staleLockRemoved = true;
    }

    // Write new lock file (atomic)
    const content: LockFileContent = {
      pid: process.pid,
      startTime: Date.now(),
    };

    const dir = dirname(this.lockPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = this.lockPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(content, null, 2), "utf-8");
    renameSync(tmpPath, this.lockPath);

    const result: AcquireResult = { acquired: true };
    if (staleLockRemoved) result.staleLockRemoved = true;
    return result;
  }

  /**
   * Release the launcher lock. Idempotent.
   */
  release(): void {
    try {
      unlinkSync(this.lockPath);
    } catch {
      // Already gone — that's fine
    }
  }

  /**
   * Check if another launcher is running.
   */
  isRunning(): { running: boolean; pid?: number; startTime?: number } {
    const content = this.readLock();
    if (!content) {
      return { running: false };
    }

    if (!this.isProcessAlive(content.pid)) {
      return { running: false };
    }

    return {
      running: true,
      pid: content.pid,
      startTime: content.startTime,
    };
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private readLock(): LockFileContent | null {
    if (!existsSync(this.lockPath)) {
      return null;
    }

    try {
      const raw = readFileSync(this.lockPath, "utf-8");
      const parsed = JSON.parse(raw) as LockFileContent;
      if (typeof parsed.pid !== "number" || typeof parsed.startTime !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
