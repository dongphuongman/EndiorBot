/**
 * RL → SOUL Prompt Enrichment — Sprint 114
 *
 * Extracts patterns from RL feedback data to enrich SOUL agent prompts.
 * Foundation only — actual prompt injection deferred to Sprint 115.
 *
 * @module rl/prompt-enrichment
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE — Sprint 114
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

          // Match agent: provider field contains agent key
          // e.g., "claude-code", "ai-platform", "cloud" — or specific agent names
          if (rec.provider && !rec.provider.includes(agentKey) && agentKey !== "*") {
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
