/**
 * Context Envelope Builder
 *
 * Reads active project state and composes a ContextEnvelope
 * for injection into Bridge sessions via SessionIntelligenceEnvelope.
 *
 * @module bridge/intelligence/context-builder
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-025 Session Intelligence Envelope
 * @stage 04 - BUILD (Sprint 87)
 */

import { createHash } from "node:crypto";
import { loadActiveProject } from "../../config/paths.js";
import type { ContextEnvelope } from "./envelope.js";

// ============================================================================
// Constants
// ============================================================================

/** Token budget for Context content (2K tokens ≈ 8192 chars at ~4 chars/token) */
export const CONTEXT_TOKEN_BUDGET = 2048;

/** Character limit derived from token budget */
const CONTEXT_CHAR_LIMIT = CONTEXT_TOKEN_BUDGET * 4;

const CONTEXT_HEADER = "[Session Context]";
const CONTEXT_FOOTER = "[End Session Context]";

// ============================================================================
// Builder
// ============================================================================

/**
 * Build a ContextEnvelope from active project state.
 *
 * Reads from ~/.endiorbot/active-project.json via loadActiveProject().
 * Returns null if no active project or on any error (graceful fallback).
 */
export function buildContextEnvelope(): ContextEnvelope | null {
  try {
    const active = loadActiveProject();
    if (!active) return null;

    const sprintName = active.name;
    const tier = active.tier;
    const projectPath = active.path;

    let content = [
      CONTEXT_HEADER,
      `Sprint: ${sprintName}`,
      `Tier: ${tier}`,
      `Project: ${projectPath}`,
      CONTEXT_FOOTER,
    ].join("\n");

    // Cap to character limit
    if (content.length > CONTEXT_CHAR_LIMIT) {
      content = content.slice(0, CONTEXT_CHAR_LIMIT);
    }

    const contentHash = createHash("sha256").update(content).digest("hex");

    return {
      sprintName,
      tier,
      projectPath,
      content,
      contentHash,
    };
  } catch {
    // Active project unavailable or parse error — graceful fallback
    return null;
  }
}
