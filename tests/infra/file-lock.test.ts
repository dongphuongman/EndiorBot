/**
 * File Lock Manager Tests
 *
 * @module tests/infra/file-lock
 * @date 2026-02-23
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  FileLockManager,
  createFileLockManager,
  resetFileLockManager,
} from "../../src/infra/file-lock.js";

describe("FileLockManager", () => {
  let lockManager: FileLockManager;

  beforeEach(() => {
    resetFileLockManager();
    lockManager = createFileLockManager();
  });

  describe("acquire", () => {
    it("should acquire read lock on unlocked file", async () => {
      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      expect(result.acquired).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.type).toBe("read");
      expect(result.lock?.owner).toBe("task-1");
    });

    it("should acquire write lock on unlocked file", async () => {
      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
      });

      expect(result.acquired).toBe(true);
      expect(result.lock?.type).toBe("write");
    });

    it("should allow multiple read locks on same file", async () => {
      const result1 = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      const result2 = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-2",
      });

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
    });

    it("should block write lock when read lock exists", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-2",
        blocking: false,
      });

      expect(result.acquired).toBe(false);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.reason).toContain("read locks");
    });

    it("should block read lock when write lock exists", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
      });

      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-2",
        blocking: false,
      });

      expect(result.acquired).toBe(false);
      expect(result.conflict?.reason).toContain("locked for writing");
    });

    it("should block write lock when write lock exists", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
      });

      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-2",
        blocking: false,
      });

      expect(result.acquired).toBe(false);
    });

    it("should allow same owner to acquire multiple read locks", async () => {
      const result1 = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      const result2 = await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
    });
  });

  describe("release", () => {
    it("should release lock by lock object", async () => {
      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
      });

      const released = lockManager.release(result.lock!);
      expect(released).toBe(true);
      expect(lockManager.isLocked("/test/file.ts")).toBe(false);
    });

    it("should release lock by lock ID", async () => {
      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
      });

      const released = lockManager.release(result.lock!.id);
      expect(released).toBe(true);
    });

    it("should return false for non-existent lock", () => {
      const released = lockManager.release("non-existent-id");
      expect(released).toBe(false);
    });
  });

  describe("releaseAll", () => {
    it("should release all locks for an owner", async () => {
      await lockManager.acquire({
        path: "/test/file1.ts",
        type: "read",
        owner: "task-1",
      });

      await lockManager.acquire({
        path: "/test/file2.ts",
        type: "write",
        owner: "task-1",
      });

      await lockManager.acquire({
        path: "/test/file3.ts",
        type: "read",
        owner: "task-2",
      });

      const count = lockManager.releaseAll("task-1");

      expect(count).toBe(2);
      expect(lockManager.isLocked("/test/file1.ts")).toBe(false);
      expect(lockManager.isLocked("/test/file2.ts")).toBe(false);
      expect(lockManager.isLocked("/test/file3.ts")).toBe(true);
    });
  });

  describe("isLocked", () => {
    it("should return false for unlocked file", () => {
      expect(lockManager.isLocked("/test/file.ts")).toBe(false);
    });

    it("should return true for locked file", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      expect(lockManager.isLocked("/test/file.ts")).toBe(true);
    });

    it("should check specific lock type", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      expect(lockManager.isLocked("/test/file.ts", "read")).toBe(true);
      expect(lockManager.isLocked("/test/file.ts", "write")).toBe(false);
    });
  });

  describe("getLocks", () => {
    it("should return empty array for unlocked file", () => {
      expect(lockManager.getLocks("/test/file.ts")).toEqual([]);
    });

    it("should return all locks for a file", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
      });

      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-2",
      });

      const locks = lockManager.getLocks("/test/file.ts");
      expect(locks.length).toBe(2);
    });
  });

  describe("getOwnerLocks", () => {
    it("should return all locks for an owner", async () => {
      await lockManager.acquire({
        path: "/test/file1.ts",
        type: "read",
        owner: "task-1",
      });

      await lockManager.acquire({
        path: "/test/file2.ts",
        type: "write",
        owner: "task-1",
      });

      const locks = lockManager.getOwnerLocks("task-1");
      expect(locks.length).toBe(2);
    });
  });

  describe("getAllLocks", () => {
    it("should return all active locks", async () => {
      await lockManager.acquire({
        path: "/test/file1.ts",
        type: "read",
        owner: "task-1",
      });

      await lockManager.acquire({
        path: "/test/file2.ts",
        type: "write",
        owner: "task-2",
      });

      const locks = lockManager.getAllLocks();
      expect(locks.length).toBe(2);
    });
  });

  describe("cleanAllExpired", () => {
    it("should clean expired locks", async () => {
      // Acquire lock with very short timeout
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "read",
        owner: "task-1",
        timeout: 1, // 1ms timeout
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleaned = lockManager.cleanAllExpired();
      expect(cleaned).toBe(1);
      expect(lockManager.isLocked("/test/file.ts")).toBe(false);
    });
  });

  describe("blocking acquire", () => {
    it("should wait for lock release", async () => {
      // Acquire lock
      const lock1 = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
        timeout: 100,
      });

      // Start blocking acquire
      const acquirePromise = lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-2",
        timeout: 500,
        blocking: true,
      });

      // Release first lock after short delay
      setTimeout(() => {
        lockManager.release(lock1.lock!);
      }, 50);

      const result = await acquirePromise;
      expect(result.acquired).toBe(true);
      expect(result.lock?.owner).toBe("task-2");
    });

    it("should timeout if lock not released", async () => {
      await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-1",
        timeout: 1000,
      });

      const result = await lockManager.acquire({
        path: "/test/file.ts",
        type: "write",
        owner: "task-2",
        timeout: 50,
        blocking: true,
      });

      expect(result.acquired).toBe(false);
      expect(result.conflict?.reason).toContain("timed out");
    });
  });
});
