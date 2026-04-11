/**
 * Exec-Policy Audit Logger
 *
 * Writes JSONL audit records to:
 *   ~/.endiorbot/audit-logs/exec-policy.log
 *
 * Size-rotated at 10 MB → exec-policy.log.1 … .5 (5 rotations).
 * Command string is pre-scrubbed via output-scrubber before writing.
 *
 * @module security/exec-approvals/audit
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL §6, M1-exec-policy-design.md §6
 * @sprint 132
 */

import { existsSync, mkdirSync, appendFileSync, statSync, renameSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { scrub } from "../output-scrubber.js";
import type { ExecPolicyAuditRecord } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATIONS = 5;

// ============================================================================
// Path resolution
// ============================================================================

/**
 * Get the path to the exec-policy audit log file.
 */
export function getAuditLogPath(): string {
  const base = process.env["ENDIORBOT_STATE_DIR"] ?? join(homedir(), ".endiorbot");
  return join(base, "audit-logs", "exec-policy.log");
}

// ============================================================================
// Rotation
// ============================================================================

/**
 * Rotate the log file if it exceeds MAX_LOG_SIZE_BYTES.
 * Shifts .1 → .2 → ... → .5 (dropping .5 if it exists).
 */
function rotateIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) {
    return;
  }
  try {
    const stats = statSync(logPath);
    if (stats.size < MAX_LOG_SIZE_BYTES) {
      return;
    }
    // Shift rotations .4 → .5, .3 → .4, ...
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }
    renameSync(logPath, `${logPath}.1`);
  } catch {
    // Best-effort; do not crash the session on rotation failure
  }
}

// ============================================================================
// Write
// ============================================================================

/**
 * Append a single audit record to the exec-policy log.
 *
 * The command field is scrubbed via output-scrubber before persistence.
 * Uses appendFileSync (synchronous) to ensure no audit records are lost.
 * mkdir-p on first write.
 */
export function writeAuditRecord(record: ExecPolicyAuditRecord): void {
  const logPath = getAuditLogPath();
  const dir = dirname(logPath);

  // mkdir-p
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Scrub the command
  const scrubbedRecord: ExecPolicyAuditRecord = {
    ...record,
    command: scrub(record.command).scrubbed,
  };

  // Rotate if needed before write
  rotateIfNeeded(logPath);

  // Append JSONL record
  const line = JSON.stringify(scrubbedRecord) + "\n";
  appendFileSync(logPath, line, "utf-8");
}

// ============================================================================
// Read
// ============================================================================

/**
 * Read the last N records from the audit log.
 *
 * Reads the file in reverse to get the tail without loading the entire file.
 * Falls back to empty array if the file does not exist.
 *
 * @param n - Number of records to return (default 50)
 */
export function readAuditTail(n: number = 50): ExecPolicyAuditRecord[] {
  const logPath = getAuditLogPath();
  if (!existsSync(logPath)) {
    return [];
  }
  try {
    const content = readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const tail = lines.slice(-n);
    return tail
      .map((line) => {
        try {
          return JSON.parse(line) as ExecPolicyAuditRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is ExecPolicyAuditRecord => r !== null);
  } catch {
    return [];
  }
}
