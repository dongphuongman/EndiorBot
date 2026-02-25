/**
 * Secure File System Operations
 *
 * File system utilities with proper permission enforcement.
 * Ensures sensitive directories and files are not world-readable.
 *
 * @module security/secure-fs
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 6
 */

import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Constants
// ============================================================================

/**
 * Secure directory permissions (owner rwx, no group/other access).
 * 0o700 = rwx------
 */
export const SECURE_DIR_MODE = 0o700;

/**
 * Secure file permissions (owner rw, no group/other access).
 * 0o600 = rw-------
 */
export const SECURE_FILE_MODE = 0o600;

/**
 * Standard directory permissions (owner rwx, group/other rx).
 * 0o755 = rwxr-xr-x
 */
export const STANDARD_DIR_MODE = 0o755;

/**
 * Standard file permissions (owner rw, group/other r).
 * 0o644 = rw-r--r--
 */
export const STANDARD_FILE_MODE = 0o644;

// ============================================================================
// Secure Directory Operations
// ============================================================================

/**
 * Create a directory with secure permissions (0o700).
 * Only the owner can read, write, or traverse.
 *
 * @param dirPath - Path to the directory to create
 * @param recursive - Create parent directories if needed (default: true)
 */
export function mkdirSecure(dirPath: string, recursive = true): void {
  if (fs.existsSync(dirPath)) {
    // Directory exists - ensure permissions are correct
    fs.chmodSync(dirPath, SECURE_DIR_MODE);
    return;
  }

  // Create directory with secure permissions
  fs.mkdirSync(dirPath, { recursive, mode: SECURE_DIR_MODE });
}

/**
 * Ensure a directory exists with secure permissions.
 * Creates the directory if it doesn't exist.
 *
 * @param dirPath - Path to the directory
 */
export function ensureSecureDir(dirPath: string): void {
  mkdirSecure(dirPath, true);
}

// ============================================================================
// Secure File Operations
// ============================================================================

/**
 * Write a file with secure permissions (0o600).
 * Only the owner can read or write.
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write
 * @param encoding - File encoding (default: "utf-8")
 */
export function writeFileSecure(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8"
): void {
  // Ensure parent directory exists with secure permissions
  const dir = path.dirname(filePath);
  ensureSecureDir(dir);

  // Write file with secure permissions
  fs.writeFileSync(filePath, content, { encoding, mode: SECURE_FILE_MODE });
}

/**
 * Append to a file with secure permissions.
 *
 * @param filePath - Path to the file
 * @param content - Content to append
 * @param encoding - File encoding (default: "utf-8")
 */
export function appendFileSecure(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8"
): void {
  // Ensure parent directory exists with secure permissions
  const dir = path.dirname(filePath);
  ensureSecureDir(dir);

  // Create file if it doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", { encoding, mode: SECURE_FILE_MODE });
  }

  // Append content
  fs.appendFileSync(filePath, content, { encoding });
}

// ============================================================================
// Permission Fixing
// ============================================================================

/**
 * Fix permissions on an existing directory to be secure.
 *
 * @param dirPath - Path to the directory
 */
export function fixDirPermissions(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.chmodSync(dirPath, SECURE_DIR_MODE);
  }
}

/**
 * Fix permissions on an existing file to be secure.
 *
 * @param filePath - Path to the file
 */
export function fixFilePermissions(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.chmodSync(filePath, SECURE_FILE_MODE);
  }
}

/**
 * Recursively fix permissions on a directory and all contents.
 *
 * @param dirPath - Root directory path
 */
export function fixPermissionsRecursive(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const stat = fs.statSync(dirPath);
  if (stat.isDirectory()) {
    // Fix directory permissions
    fs.chmodSync(dirPath, SECURE_DIR_MODE);

    // Process contents
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);
      const entryStat = fs.statSync(entryPath);

      if (entryStat.isDirectory()) {
        fixPermissionsRecursive(entryPath);
      } else {
        fs.chmodSync(entryPath, SECURE_FILE_MODE);
      }
    }
  } else {
    // Fix file permissions
    fs.chmodSync(dirPath, SECURE_FILE_MODE);
  }
}

// ============================================================================
// State Directory Operations
// ============================================================================

/**
 * Ensure the EndiorBot state directory exists with secure permissions.
 * Creates ~/.endiorbot/ with 0o700 if it doesn't exist.
 *
 * @param stateDir - Path to state directory
 */
export function ensureSecureStateDir(stateDir: string): void {
  ensureSecureDir(stateDir);

  // Also secure common subdirectories if they exist
  const subdirs = ["logs", "sessions", "brain", "credentials", "audit"];
  for (const subdir of subdirs) {
    const subdirPath = path.join(stateDir, subdir);
    if (fs.existsSync(subdirPath)) {
      fixDirPermissions(subdirPath);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  SECURE_DIR_MODE,
  SECURE_FILE_MODE,
  STANDARD_DIR_MODE,
  STANDARD_FILE_MODE,
  mkdirSecure,
  ensureSecureDir,
  writeFileSecure,
  appendFileSecure,
  fixDirPermissions,
  fixFilePermissions,
  fixPermissionsRecursive,
  ensureSecureStateDir,
};
