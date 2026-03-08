/**
 * Evaluation Store — Sprint 88 (ADR-025)
 *
 * Per-session JSONL storage for post-turn evaluation results.
 * Follows the BridgeAuditLogger JSONL append pattern.
 *
 * Storage: ~/.endiorbot/sessions/{sessionId}/evaluations.jsonl
 *
 * @module bridge/intelligence/evaluation-store
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-025 (Post-turn layer)
 * @stage 04 - BUILD (Sprint 88)
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import type { EvaluatorSignals } from "./envelope.js";

// ============================================================================
// Types
// ============================================================================

/**
 * A single evaluation record stored in JSONL.
 */
export interface EvaluationRecord {
  /** Unique evaluation ID (eval_<timestamp>_<hex>) */
  id: string;
  /** ISO 8601 timestamp */
  ts: string;
  /** Turn number evaluated */
  turnNumber: number;
  /** Vibecoding index score (0-100) */
  score: number;
  /** Per-signal breakdown */
  signals: EvaluatorSignals;
  /** Human-readable summary */
  summary: string;
  /** SHA256 hash of captured output */
  captureHash: string;
  /** Number of lines captured from tmux */
  captureLines: number;
}

// ============================================================================
// Path
// ============================================================================

/**
 * Get the evaluation JSONL file path for a session.
 */
export function getEvaluationStorePath(sessionId: string): string {
  return join(homedir(), ".endiorbot", "sessions", sessionId, "evaluations.jsonl");
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique evaluation ID.
 */
export function generateEvaluationId(): string {
  return `eval_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

// ============================================================================
// Append
// ============================================================================

/**
 * Append an evaluation record to the session's JSONL file.
 * Creates the session directory if it doesn't exist.
 * Silent on error — evaluation storage must never break the send flow.
 */
export function appendEvaluation(sessionId: string, record: EvaluationRecord): void {
  try {
    const filePath = getEvaluationStorePath(sessionId);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(record) + "\n";
    appendFileSync(filePath, line, "utf-8");
  } catch {
    // Silent — don't break operation for storage failure
  }
}

// ============================================================================
// Load (CTO MF-2: per-line error handling)
// ============================================================================

/**
 * Load all evaluation records for a session.
 * Returns empty array if file doesn't exist or is completely unreadable.
 * Skips corrupted lines (partial write on crash) — CTO MF-2.
 */
export function loadEvaluations(sessionId: string): EvaluationRecord[] {
  try {
    const filePath = getEvaluationStorePath(sessionId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const records: EvaluationRecord[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as EvaluationRecord);
      } catch {
        // Skip corrupted line — partial write on crash (CTO MF-2)
        continue;
      }
    }

    return records;
  } catch {
    return [];
  }
}
