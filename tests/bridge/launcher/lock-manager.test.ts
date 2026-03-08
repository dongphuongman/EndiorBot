/**
 * LockManager Tests — Sprint 92 (ADR-024)
 *
 * Covers: acquire, release, stale lock removal, duplicate prevention.
 *
 * @module tests/bridge/launcher/lock-manager
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { LockManager } from "../../../src/bridge/launcher/lock-manager.js";

// ============================================================================
// Helpers
// ============================================================================

function makeTempLockPath(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return join(tmpdir(), `launcher-lock-test-${rand}.lock`);
}

// ============================================================================
// Tests
// ============================================================================

describe("LockManager — acquire (Sprint 92)", () => {
  let lockPath: string;

  beforeEach(() => {
    lockPath = makeTempLockPath();
  });

  afterEach(() => {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    const tmpFile = lockPath + ".tmp";
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  it("should acquire lock on clean start", () => {
    const manager = new LockManager({ lockPath });

    const result = manager.acquire();
    expect(result.acquired).toBe(true);
    expect(result.staleLockRemoved).toBeUndefined();
    expect(existsSync(lockPath)).toBe(true);
  });

  it("should remove stale lock and acquire (dead PID)", () => {
    // Create lock with a fake PID that doesn't exist
    const manager = new LockManager({
      lockPath,
      isProcessAlive: () => false, // PID is dead
    });

    // First acquire
    manager.acquire();

    // Second acquire with another instance — stale lock
    const manager2 = new LockManager({
      lockPath,
      isProcessAlive: () => false,
    });

    const result = manager2.acquire();
    expect(result.acquired).toBe(true);
    expect(result.staleLockRemoved).toBe(true);
  });

  it("should prevent duplicate when PID is alive", () => {
    const manager1 = new LockManager({
      lockPath,
      isProcessAlive: () => true, // PID is alive
    });

    manager1.acquire();

    const manager2 = new LockManager({
      lockPath,
      isProcessAlive: () => true,
    });

    const result = manager2.acquire();
    expect(result.acquired).toBe(false);
    expect(result.error).toContain("already running");
  });
});

describe("LockManager — release (Sprint 92)", () => {
  it("should release lock file", () => {
    const lockPath = makeTempLockPath();
    const manager = new LockManager({ lockPath });

    manager.acquire();
    expect(existsSync(lockPath)).toBe(true);

    manager.release();
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe("LockManager — isRunning (Sprint 92)", () => {
  it("should report running when PID alive", () => {
    const lockPath = makeTempLockPath();
    const manager = new LockManager({
      lockPath,
      isProcessAlive: () => true,
    });

    manager.acquire();

    const status = manager.isRunning();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
    expect(status.startTime).toBeDefined();

    manager.release();
  });

  it("should report not running when no lock", () => {
    const lockPath = makeTempLockPath();
    const manager = new LockManager({ lockPath });

    const status = manager.isRunning();
    expect(status.running).toBe(false);
  });
});
