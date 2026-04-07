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
import { FactStore } from "../../memory/fact-store.js";
import {
  isMemoryDisabled,
  evictExpiredFacts,
  formatFactsForInjection,
} from "../../memory/memory-policy.js";

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
export async function buildContextEnvelope(): Promise<ContextEnvelope | null> {
  try {
    const active = loadActiveProject();
    if (!active) return null;

    const sprintName = active.name;
    const tier = active.tier;
    const projectPath = active.path;

    // Load memory facts (ADR-038 T3 — read path)
    let memoryBlock = "";
    let injectedFactsCount = 0;
    const factIdsUsed: string[] = [];
    if (!isMemoryDisabled()) {
      try {
        const store = new FactStore(active.name);
        await store.load();
        const allFacts = store.query({});
        const validFacts = evictExpiredFacts(allFacts)
          .filter(f => f.confidence >= 0.5)  // minScore: 0.5 (per sprint spec)
          .slice(0, 5);
        memoryBlock = formatFactsForInjection(validFacts);
        injectedFactsCount = validFacts.length;
        for (const f of validFacts) factIdsUsed.push(f.id);
      } catch {
        // Memory unavailable — graceful fallback
      }
    }

    let content = [
      CONTEXT_HEADER,
      `Sprint: ${sprintName}`,
      `Tier: ${tier}`,
      `Project: ${projectPath}`,
      memoryBlock ? `\n${memoryBlock}` : "",
      CONTEXT_FOOTER,
    ].filter(Boolean).join("\n");

    // Cap to character limit
    if (content.length > CONTEXT_CHAR_LIMIT) {
      content = content.slice(0, CONTEXT_CHAR_LIMIT);
    }

    const contentHash = createHash("sha256").update(content).digest("hex");

    const envelope: ContextEnvelope = {
      sprintName,
      tier,
      projectPath,
      content,
      contentHash,
    };
    if (injectedFactsCount > 0) {
      envelope.injectedFactsCount = injectedFactsCount;
      envelope.factIdsUsed = factIdsUsed;
    }
    return envelope;
  } catch {
    // Active project unavailable or parse error — graceful fallback
    return null;
  }
}

// ============================================================================
// CRG Context Enrichment (ADR-045 — Sprint 131)
// ============================================================================

/** Agents that benefit from CRG graph context */
const GRAPH_AWARE_AGENTS = new Set(["reviewer", "architect", "coder", "tester"]);

/** Max chars for graph context (~500 tokens) */
const GRAPH_CONTEXT_CAP = 2000;

/**
 * Enrich a context envelope with CRG blast radius for graph-aware agents.
 * Fail-soft: if CRG unavailable or errors, envelope is returned unchanged.
 */
export async function enrichWithCRG(
  envelope: ContextEnvelope,
  agentRole: string,
  repoId: string,
  changedFiles?: string[],
): Promise<ContextEnvelope> {
  if (!GRAPH_AWARE_AGENTS.has(agentRole)) return envelope;
  if (!changedFiles || changedFiles.length === 0) return envelope;

  try {
    const { getCRGClient, formatImpactForContext } = await import("../../graph/client.js");
    const client = getCRGClient();
    if (!client.isAvailable()) return envelope;

    const impact = await client.impactRadius(repoId, changedFiles);
    const graphContext = formatImpactForContext(impact).slice(0, GRAPH_CONTEXT_CAP);

    return { ...envelope, graphContext };
  } catch {
    // CRG unavailable — graceful fallback, no change
    return envelope;
  }
}
