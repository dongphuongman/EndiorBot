/**
 * RL Data Store — Sprint 110 (ADR-033)
 *
 * Two storage paths:
 * 1. RLDataStore: Training JSONL — only good/bad feedback turns.
 *    Path: ~/.endiorbot/rl-training-data/rl-{YYYY-MM-DD}.jsonl (UTC date)
 *    Format matches OpenClaw-RL's OPENCLAW_RECORD_ENABLED=1 output exactly.
 *    Sprint 111 adds live submission to OpenClaw-RL API alongside this.
 *
 * 2. RLEventLog: All turns event log — including partial/missing/expired.
 *    Path: ~/.endiorbot/rl-state/event-log.jsonl
 *    Used for kill-criteria measurement (feedbackRate survives process restart).
 *
 * See ADR-033 D6 for storage path design decisions.
 *
 * @module rl/data-store
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 110
 * @authority ADR-033
 * @sprint 110
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RLRecord, RLEventLogEntry } from "./types.js";
import type { RLStats } from "./observability.js";

// ============================================================================
// Paths
// ============================================================================

const RL_STATE_DIR = join(homedir(), ".endiorbot", "rl-state");
const RL_TRAINING_DIR = join(homedir(), ".endiorbot", "rl-training-data");
const EVENT_LOG_PATH = join(RL_STATE_DIR, "event-log.jsonl");

function trainingFilePath(): string {
  // UTC date for filename — session lifecycle uses Asia/Ho_Chi_Minh idle-timeout (ADR-033 D7)
  const date = new Date().toISOString().slice(0, 10);
  return join(RL_TRAINING_DIR, `rl-${date}.jsonl`);
}

// ============================================================================
// RLDataStore — Training JSONL (good/bad feedback only)
// ============================================================================

/**
 * Pre-training buffer for RL feedback records.
 * Only accepts records with feedbackLabel in ("good","bad").
 * Partial records go to RLEventLog only.
 *
 * Sprint 111: Live submission to OpenClaw-RL API added alongside this store.
 * JSONL format must match OpenClaw-RL's OPENCLAW_RECORD_ENABLED=1 output.
 */
export class RLDataStore {
  private recordsWritten = 0;
  private writeFailures = 0;

  /**
   * Append a training record to the daily JSONL file.
   * Silently absorbs write failures (non-fatal — event log still captures the turn).
   */
  append(record: RLRecord): void {
    // Only good/bad feedback goes to training JSONL
    if (record.feedback_label === "partial") return;

    try {
      mkdirSync(RL_TRAINING_DIR, { recursive: true });
      const line = JSON.stringify(record) + "\n";
      appendFileSync(trainingFilePath(), line, "utf-8");
      this.recordsWritten++;
    } catch {
      this.writeFailures++;
    }
  }

  getStats(): Pick<RLStats, "recordsWritten" | "writeFailures"> {
    return {
      recordsWritten: this.recordsWritten,
      writeFailures: this.writeFailures,
    };
  }
}

// ============================================================================
// RLEventLog — All turns event log
// ============================================================================

/**
 * Event log capturing ALL turns (including partial/missing/expired).
 * Used for kill-criteria measurement — feedbackRate = received/trainable.
 * Persisted to disk so feedbackRate survives process restart.
 *
 * Single file (not rotated daily) — low volume, only event entries (not full records).
 */
export class RLEventLog {
  /**
   * Append an event log entry.
   * Silently absorbs write failures.
   */
  append(entry: RLEventLogEntry): void {
    try {
      mkdirSync(RL_STATE_DIR, { recursive: true });
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(EVENT_LOG_PATH, line, "utf-8");
    } catch {
      // Non-fatal — observability loss, not data loss
    }
  }
}
