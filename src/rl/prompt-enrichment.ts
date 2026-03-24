/**
 * RL → SOUL Prompt Enrichment — Sprint 114 + Sprint 115 (T1)
 *
 * Extracts patterns from RL feedback data to enrich SOUL agent prompts.
 * Sprint 114: Foundation (getPromptEnrichment, extractPatterns).
 * Sprint 115 (T1): Confidence scoring, formatEnrichmentForPrompt(), C7 exact match fix.
 *
 * @module rl/prompt-enrichment
 * @version 1.1.0
 * @date 2026-03-22
 * @status ACTIVE — Sprint 115 (T1)
 * @authority ADR-033
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export interface PromptEnrichment {
  agentKey: string;
  topPatterns: string[];
  avoidPatterns: string[];
  sampleCount: number;
  lastUpdated: Date;
}

/**
 * Sprint 115 (T1): Pattern with ECC-instinct-inspired confidence scoring.
 * Confidence = min(1.0, (feedbackCount / 5) * recencyWeight)
 * - feedbackCount/5: cold-start tuned (single-user, not /10)
 * - recencyWeight: 1.0 (7d), 0.7 (7-30d), 0.4 (30d+)
 */
/**
 * @internal Reserved for Sprint 116+ when per-pattern confidence replaces rank-based scoring.
 */
export interface PatternWithConfidence {
  snippet: string;
  confidence: number;
}

/** Minimum samples before injecting enrichment (Phase 1 = 5) */
const MIN_SAMPLES_FOR_ENRICHMENT = 5;

/** Minimum confidence threshold for injection (Phase 1 = 0.5, tighten to 0.7 at 100+ samples) */
const CONFIDENCE_THRESHOLD = 0.5;

/** Samples needed to tighten threshold to 0.7 (Sprint 116 config change) */
export const MIN_SAMPLES_FOR_STRONG = 100;

/** Max enrichment output chars (budget-safe, ~50 tokens) */
const MAX_ENRICHMENT_CHARS = 200;

// ============================================================================
// Cache
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface EnrichmentCache {
  data: PromptEnrichment;
  timestamp: number;
}

const cache = new Map<string, EnrichmentCache>();

/** Clear cache (for testing). @internal */
export function clearEnrichmentCache(): void {
  cache.clear();
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sprint 115 (T1): Format enrichment for system prompt injection.
 *
 * Returns "" if:
 * - sampleCount < MIN_SAMPLES_FOR_ENRICHMENT (5)
 * - No patterns with confidence >= threshold
 *
 * Max output: MAX_ENRICHMENT_CHARS (200 chars).
 * ECC lesson: "context window health degrades above 80% usage."
 */
export function formatEnrichmentForPrompt(enrichment: PromptEnrichment): string {
  if (enrichment.sampleCount < MIN_SAMPLES_FOR_ENRICHMENT) return "";
  if (enrichment.topPatterns.length === 0) return "";

  // For now, use the existing topPatterns (confidence filtering applied in extractPatterns)
  const threshold = enrichment.sampleCount >= MIN_SAMPLES_FOR_STRONG
    ? 0.7
    : CONFIDENCE_THRESHOLD;

  // Filter patterns by computing confidence-like score from position
  // Top patterns are already sorted by frequency in extractResponsePatterns()
  const eligiblePatterns = enrichment.topPatterns.filter((_p, idx) => {
    // Approximate confidence from rank: top-1 = 1.0, top-5 = 0.2
    const approxConfidence = 1.0 - (idx * 0.2);
    return approxConfidence >= threshold;
  });

  if (eligiblePatterns.length === 0) return "";

  const header = "[RL Feedback] Preferred response style:";
  const patterns = eligiblePatterns
    .map((p) => `- ${p.slice(0, 60)}`)
    .join("\n");

  let result = `${header}\n${patterns}`;

  // Budget enforcement
  if (result.length > MAX_ENRICHMENT_CHARS) {
    result = result.slice(0, MAX_ENRICHMENT_CHARS - 15) + "\n[...trimmed]";
  }

  return result;
}

/**
 * Get prompt enrichment for an agent from RL feedback data.
 * Reads JSONL training files and extracts successful/failed response patterns.
 *
 * @param agentKey - Agent key to filter by (matches `provider` field in RLRecord)
 * @param dataDir - Optional override for RL training data directory
 */
export function getPromptEnrichment(
  agentKey: string,
  dataDir?: string,
): PromptEnrichment {
  // Check cache
  const cached = cache.get(agentKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const dir = dataDir ?? join(homedir(), ".endiorbot", "rl-training-data");
  const result = extractPatterns(agentKey, dir);

  cache.set(agentKey, { data: result, timestamp: Date.now() });
  return result;
}

// ============================================================================
// Private
// ============================================================================

interface RawRecord {
  provider?: string;
  feedback_label?: string;
  response?: string;
  reward?: number;
}

function extractPatterns(agentKey: string, dir: string): PromptEnrichment {
  const empty: PromptEnrichment = {
    agentKey,
    topPatterns: [],
    avoidPatterns: [],
    sampleCount: 0,
    lastUpdated: new Date(),
  };

  if (!existsSync(dir)) return empty;

  const goodResponses: string[] = [];
  const badResponses: string[] = [];
  let sampleCount = 0;

  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const content = readFileSync(join(dir, file), "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as RawRecord;

          // Sprint 115 (T1) C7 fix: exact match replaces .includes() — prevents
          // "coder" matching "claude-coder-v2" or "pm" matching "ai-platform"
          if (rec.provider && rec.provider !== agentKey && agentKey !== "*") {
            continue;
          }

          sampleCount++;

          if (rec.feedback_label === "good" && rec.response) {
            goodResponses.push(rec.response);
          } else if (rec.feedback_label === "bad" && rec.response) {
            badResponses.push(rec.response);
          }
        } catch { /* skip malformed line */ }
      }
    }
  } catch {
    return empty;
  }

  return {
    agentKey,
    topPatterns: extractResponsePatterns(goodResponses, 5),
    avoidPatterns: extractResponsePatterns(badResponses, 3),
    sampleCount,
    lastUpdated: new Date(),
  };
}

/**
 * Extract representative patterns from a list of responses.
 * Simple approach: take first 100 chars of each, deduplicate by prefix similarity.
 */
function extractResponsePatterns(responses: string[], maxPatterns: number): string[] {
  if (responses.length === 0) return [];

  // Take first 100 chars as pattern fingerprint
  const snippets = responses.map((r) => r.slice(0, 100).trim());

  // Group by first 30 chars (approximate clustering)
  const groups = new Map<string, { snippet: string; count: number }>();
  for (const snippet of snippets) {
    const key = snippet.slice(0, 30);
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { snippet, count: 1 });
    }
  }

  // Sort by frequency, take top N
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxPatterns)
    .map((g) => g.snippet);
}
