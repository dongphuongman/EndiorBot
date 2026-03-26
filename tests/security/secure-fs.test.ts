/**
 * Secure FS Tests
 *
 * Tests for file system operations with secure permission enforcement.
 * Uses real fs operations in isolated tmp directories.
 *
 * @module tests/security/secure-fs
 * @version 1.0.0
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  mkdirSecure,
  ensureSecureDir,
  writeFileSecure,
  appendFileSecure,
  fixDirPermissions,
  fixFilePermissions,
  fixPermissionsRecursive,
  ensureSecureStateDir,
  SECURE_DIR_MODE,
  SECURE_FILE_MODE,
} from "../../src/security/secure-fs.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a unique temp directory for test isolation.
 */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-secure-fs-test-"));
}

/**
 * Get the Unix permission bits from a path (e.g. 0o700, 0o600).
 */
function getMode(p: string): number {
  return fs.statSync(p).mode & 0o777;
}

// ============================================================================
// SecureFS
// ============================================================================

describe("secure-fs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  describe("constants", () => {
    it("SECURE_DIR_MODE should be 0o700", () => {
      expect(SECURE_DIR_MODE).toBe(0o700);
    });

    it("SECURE_FILE_MODE should be 0o600", () => {
      expect(SECURE_FILE_MODE).toBe(0o600);
    });
  });

  // --------------------------------------------------------------------------
  // mkdirSecure()
  // --------------------------------------------------------------------------

  describe("mkdirSecure()", () => {
    it("should create a directory with 0o700 permissions", () => {
      const dir = path.join(tmpDir, "new-dir");
      mkdirSecure(dir);
      expect(fs.existsSync(dir)).toBe(true);
      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
    });

    it("should create nested directories (recursive=true by default)", () => {
      const nested = path.join(tmpDir, "a", "b", "c");
      mkdirSecure(nested);
      expect(fs.existsSync(nested)).toBe(true);
    });

    it("should fix permissions on an existing directory", () => {
      const dir = path.join(tmpDir, "existing");
      fs.mkdirSync(dir, { mode: 0o755 });
      // Initially 0o755 (or umask-adjusted equivalent)
      mkdirSecure(dir);
      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
    });

    it("should not throw if directory already exists with correct permissions", () => {
      const dir = path.join(tmpDir, "idempotent");
      mkdirSecure(dir);
      expect(() => mkdirSecure(dir)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // ensureSecureDir()
  // --------------------------------------------------------------------------

  describe("ensureSecureDir()", () => {
    it("should create directory if it does not exist", () => {
      const dir = path.join(tmpDir, "ensure-me");
      ensureSecureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it("should set 0o700 on newly created directory", () => {
      const dir = path.join(tmpDir, "ensure-perms");
      ensureSecureDir(dir);
      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
    });

    it("should be idempotent on existing secure directory", () => {
      const dir = path.join(tmpDir, "ensured");
      ensureSecureDir(dir);
      expect(() => ensureSecureDir(dir)).not.toThrow();
      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
    });
  });

  // --------------------------------------------------------------------------
  // writeFileSecure()
  // --------------------------------------------------------------------------

  describe("writeFileSecure()", () => {
    it("should create a file with 0o600 permissions", () => {
      const file = path.join(tmpDir, "secret.txt");
      writeFileSecure(file, "sensitive data");
      expect(fs.existsSync(file)).toBe(true);
      expect(getMode(file)).toBe(SECURE_FILE_MODE);
    });

    it("should write the expected content", () => {
      const file = path.join(tmpDir, "content.txt");
      writeFileSecure(file, "hello world");
      expect(fs.readFileSync(file, "utf-8")).toBe("hello world");
    });

    it("should create parent directories if they do not exist", () => {
      const file = path.join(tmpDir, "sub", "dir", "file.txt");
      writeFileSecure(file, "nested");
      expect(fs.existsSync(file)).toBe(true);
    });

    it("should overwrite existing file and preserve 0o600", () => {
      const file = path.join(tmpDir, "overwrite.txt");
      writeFileSecure(file, "first");
      writeFileSecure(file, "second");
      expect(fs.readFileSync(file, "utf-8")).toBe("second");
      expect(getMode(file)).toBe(SECURE_FILE_MODE);
    });
  });

  // --------------------------------------------------------------------------
  // appendFileSecure()
  // --------------------------------------------------------------------------

  describe("appendFileSecure()", () => {
    it("should append content to existing file", () => {
      const file = path.join(tmpDir, "append.txt");
      writeFileSecure(file, "line1\n");
      appendFileSecure(file, "line2\n");
      expect(fs.readFileSync(file, "utf-8")).toBe("line1\nline2\n");
    });

    it("should create file with 0o600 if it does not exist", () => {
      const file = path.join(tmpDir, "new-append.txt");
      appendFileSecure(file, "initial");
      expect(fs.existsSync(file)).toBe(true);
      expect(getMode(file)).toBe(SECURE_FILE_MODE);
    });

    it("should create parent directories if they do not exist", () => {
      const file = path.join(tmpDir, "nested", "append.log");
      appendFileSecure(file, "log entry");
      expect(fs.existsSync(file)).toBe(true);
    });

    it("should append multiple times correctly", () => {
      const file = path.join(tmpDir, "multi-append.txt");
      appendFileSecure(file, "a");
      appendFileSecure(file, "b");
      appendFileSecure(file, "c");
      expect(fs.readFileSync(file, "utf-8")).toBe("abc");
    });
  });

  // --------------------------------------------------------------------------
  // fixDirPermissions()
  // --------------------------------------------------------------------------

  describe("fixDirPermissions()", () => {
    it("should set 0o700 on an existing directory", () => {
      const dir = path.join(tmpDir, "fix-dir");
      fs.mkdirSync(dir, { mode: 0o755 });
      fixDirPermissions(dir);
      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
    });

    it("should not throw if directory does not exist", () => {
      const nonExistent = path.join(tmpDir, "no-such-dir");
      expect(() => fixDirPermissions(nonExistent)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // fixFilePermissions()
  // --------------------------------------------------------------------------

  describe("fixFilePermissions()", () => {
    it("should set 0o600 on an existing file", () => {
      const file = path.join(tmpDir, "fix-file.txt");
      fs.writeFileSync(file, "data", { mode: 0o644 });
      fixFilePermissions(file);
      expect(getMode(file)).toBe(SECURE_FILE_MODE);
    });

    it("should not throw if file does not exist", () => {
      const nonExistent = path.join(tmpDir, "no-such-file.txt");
      expect(() => fixFilePermissions(nonExistent)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // fixPermissionsRecursive()
  // --------------------------------------------------------------------------

  describe("fixPermissionsRecursive()", () => {
    it("should fix permissions on a flat directory", () => {
      const dir = path.join(tmpDir, "flat");
      fs.mkdirSync(dir, { mode: 0o755 });
      fs.writeFileSync(path.join(dir, "a.txt"), "a", { mode: 0o644 });
      fs.writeFileSync(path.join(dir, "b.txt"), "b", { mode: 0o644 });

      fixPermissionsRecursive(dir);

      expect(getMode(dir)).toBe(SECURE_DIR_MODE);
      expect(getMode(path.join(dir, "a.txt"))).toBe(SECURE_FILE_MODE);
      expect(getMode(path.join(dir, "b.txt"))).toBe(SECURE_FILE_MODE);
    });

    it("should recursively fix nested directories and files", () => {
      const root = path.join(tmpDir, "nested-root");
      const sub = path.join(root, "sub");
      fs.mkdirSync(root, { mode: 0o755 });
      fs.mkdirSync(sub, { mode: 0o755 });
      fs.writeFileSync(path.join(root, "root.txt"), "r", { mode: 0o644 });
      fs.writeFileSync(path.join(sub, "sub.txt"), "s", { mode: 0o644 });

      fixPermissionsRecursive(root);

      expect(getMode(root)).toBe(SECURE_DIR_MODE);
      expect(getMode(sub)).toBe(SECURE_DIR_MODE);
      expect(getMode(path.join(root, "root.txt"))).toBe(SECURE_FILE_MODE);
      expect(getMode(path.join(sub, "sub.txt"))).toBe(SECURE_FILE_MODE);
    });

    it("should not throw if path does not exist", () => {
      expect(() =>
        fixPermissionsRecursive(path.join(tmpDir, "nonexistent"))
      ).not.toThrow();
    });

    it("should fix a single file when called with a file path", () => {
      const file = path.join(tmpDir, "single.txt");
      fs.writeFileSync(file, "data", { mode: 0o644 });
      fixPermissionsRecursive(file);
      expect(getMode(file)).toBe(SECURE_FILE_MODE);
    });
  });

  // --------------------------------------------------------------------------
  // ensureSecureStateDir()
  // --------------------------------------------------------------------------

  describe("ensureSecureStateDir()", () => {
    it("should create the state dir with 0o700", () => {
      const stateDir = path.join(tmpDir, ".endiorbot-state");
      ensureSecureStateDir(stateDir);
      expect(fs.existsSync(stateDir)).toBe(true);
      expect(getMode(stateDir)).toBe(SECURE_DIR_MODE);
    });

    it("should fix permissions on existing subdirs logs, sessions, etc.", () => {
      const stateDir = path.join(tmpDir, ".endiorbot-state2");
      fs.mkdirSync(stateDir, { mode: 0o755 });

      // Pre-create subdirs with loose permissions
      const subdirs = ["logs", "sessions", "brain", "credentials", "audit"];
      for (const sub of subdirs) {
        fs.mkdirSync(path.join(stateDir, sub), { mode: 0o755 });
      }

      ensureSecureStateDir(stateDir);

      for (const sub of subdirs) {
        expect(getMode(path.join(stateDir, sub))).toBe(SECURE_DIR_MODE);
      }
    });

    it("should not fail when subdirs do not exist", () => {
      const stateDir = path.join(tmpDir, ".endiorbot-empty");
      expect(() => ensureSecureStateDir(stateDir)).not.toThrow();
    });

    it("should be idempotent", () => {
      const stateDir = path.join(tmpDir, ".endiorbot-idem");
      ensureSecureStateDir(stateDir);
      expect(() => ensureSecureStateDir(stateDir)).not.toThrow();
      expect(getMode(stateDir)).toBe(SECURE_DIR_MODE);
    });
  });
});
