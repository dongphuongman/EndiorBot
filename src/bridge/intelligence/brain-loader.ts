/**
 * Brain L4 Loader
 *
 * Loads L4 mental models from the Brain store and formats them
 * for injection into Bridge sessions via SessionIntelligenceEnvelope.
 *
 * @module bridge/intelligence/brain-loader
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-025 Session Intelligence Envelope
 * @stage 04 - BUILD (Sprint 87)
 */

import { createHash } from "node:crypto";
import { getAllModels, getFormattedRules } from "../../brain/layers/mental-models.js";
import type { BrainEnvelope } from "./envelope.js";

// ============================================================================
// Constants
// ============================================================================

/** Token budget for Brain L4 content (2K tokens ≈ 8192 chars at ~4 chars/token) */
export const BRAIN_TOKEN_BUDGET = 2048;

/** Character limit derived from token budget (conservative 4 chars/token) */
const BRAIN_CHAR_LIMIT = BRAIN_TOKEN_BUDGET * 4;

const BRAIN_HEADER = "[Brain L4 Mental Models]";
const BRAIN_FOOTER = "[End Brain L4]";
const BRAIN_SOURCE = "mental-models.json";

// ============================================================================
// Loader
// ============================================================================

/**
 * Load Brain L4 mental models for session injection.
 *
 * Reads from the existing brain store, formats with markers,
 * caps to BRAIN_TOKEN_BUDGET, and computes SHA256 hash.
 *
 * Returns null if no models exist or on any error (graceful fallback).
 */
export function loadBrainL4(): BrainEnvelope | null {
  try {
    const models = getAllModels();
    if (models.length === 0) return null;

    const formatted = getFormattedRules();
    if (!formatted) return null;

    let content = `${BRAIN_HEADER}\n${formatted}\n${BRAIN_FOOTER}`;

    // Cap to character limit, truncate at line boundary
    if (content.length > BRAIN_CHAR_LIMIT) {
      content = truncateAtLineBreak(content, BRAIN_CHAR_LIMIT);
    }

    const contentHash = createHash("sha256").update(content).digest("hex");

    return {
      content,
      contentHash,
      modelCount: models.length,
      source: BRAIN_SOURCE,
    };
  } catch {
    // Brain store unavailable or read error — graceful fallback
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Truncate content at a line break to stay within maxChars.
 * Always preserves the footer marker.
 */
function truncateAtLineBreak(content: string, maxChars: number): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    // Reserve space for footer + newline
    const footerReserve = BRAIN_FOOTER.length + 1;
    if (currentLength + line.length + 1 > maxChars - footerReserve) {
      break;
    }
    result.push(line);
    currentLength += line.length + 1; // +1 for newline
  }

  // Ensure header is present
  if (result.length === 0) {
    return `${BRAIN_HEADER}\n${BRAIN_FOOTER}`;
  }

  // Ensure footer is present
  const lastLine = result[result.length - 1];
  if (lastLine !== BRAIN_FOOTER) {
    result.push(BRAIN_FOOTER);
  }

  return result.join("\n");
}
