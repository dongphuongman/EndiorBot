/**
 * Expert Routing — OpenMythos #7 (MoE analog, pragmatic version)
 *
 * Historical performance scoring for agent-model selection. Tracks
 * success rate per agent × provider × task-type to inform future
 * routing decisions. NOT multi-agent per request — CPO correctly
 * rejected that; this is smarter single-agent selection.
 *
 * CTO conditions:
 *   - Behind FF_EXPERT_ROUTING_ENABLED (env: ENDIORBOT_FF_EXPERT_ROUTING_ENABLED)
 *   - Read-only first: logs recommendations but does NOT change routing
 *   - Only influences routing when FF is enabled AND data threshold met
 *
 * Phase 1 (this implementation): data collection + recommendation logging
 * Phase 2 (future sprint): active routing based on historical data
 *
 * @module providers/expert-routing
 * @sprint OpenMythos adoption (deferred from Sprint 141)
 */

import { createLogger } from "../logging/logger.js";

const log = createLogger("expert-routing");

// ============================================================================
// Types
// ============================================================================

export interface RoutingRecord {
  agent: string;
  provider: string;
  model: string;
  taskType: string;
  success: boolean;
  durationMs: number;
  tokenCount: number;
  timestamp: number;
}

export interface ProviderScore {
  provider: string;
  model: string;
  successRate: number;
  avgDurationMs: number;
  avgTokens: number;
  sampleCount: number;
}

export interface RoutingRecommendation {
  agent: string;
  taskType: string;
  recommended: ProviderScore;
  alternatives: ProviderScore[];
  confidence: number; // 0-1 based on sample count
  reason: string;
}

// ============================================================================
// In-memory performance store (process lifetime)
// ============================================================================

const records: RoutingRecord[] = [];
const MAX_RECORDS = 1000; // cap in-memory storage

/**
 * Record a routing outcome for future scoring.
 * Called after every agent invocation regardless of FF state (data collection).
 */
export function recordRoutingOutcome(record: RoutingRecord): void {
  records.push(record);
  // Evict oldest when cap reached (FIFO)
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS);
  }
}

/**
 * Score providers for a given agent + task-type combination.
 * Returns scores sorted by success rate (descending).
 */
export function scoreProviders(
  agent: string,
  taskType: string,
): ProviderScore[] {
  const matching = records.filter(
    (r) => r.agent === agent && r.taskType === taskType,
  );

  // Group by provider+model
  const groups = new Map<string, RoutingRecord[]>();
  for (const r of matching) {
    const key = `${r.provider}::${r.model}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const scores: ProviderScore[] = [];
  for (const [key, group] of groups) {
    const [provider, model] = key.split("::");
    const successes = group.filter((r) => r.success).length;
    scores.push({
      provider: provider!,
      model: model!,
      successRate: group.length > 0 ? successes / group.length : 0,
      avgDurationMs: group.length > 0
        ? Math.round(group.reduce((sum, r) => sum + r.durationMs, 0) / group.length)
        : 0,
      avgTokens: group.length > 0
        ? Math.round(group.reduce((sum, r) => sum + r.tokenCount, 0) / group.length)
        : 0,
      sampleCount: group.length,
    });
  }

  return scores.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Get a routing recommendation for an agent + task-type.
 * Returns null if insufficient data (< 5 records).
 *
 * CTO condition: this is READ-ONLY — it logs the recommendation but
 * does not change the actual routing. Active routing requires
 * FF_EXPERT_ROUTING_ENABLED=true AND is not yet implemented (Phase 2).
 */
export function getRecommendation(
  agent: string,
  taskType: string,
): RoutingRecommendation | null {
  const scores = scoreProviders(agent, taskType);
  if (scores.length === 0) return null;

  const totalSamples = scores.reduce((sum, s) => sum + s.sampleCount, 0);
  if (totalSamples < 5) return null; // insufficient data

  const best = scores[0]!;
  const confidence = Math.min(1, totalSamples / 50); // scales to 1.0 at 50 samples

  const recommendation: RoutingRecommendation = {
    agent,
    taskType,
    recommended: best,
    alternatives: scores.slice(1),
    confidence,
    reason: `${best.provider}/${best.model} has ${(best.successRate * 100).toFixed(0)}% success rate across ${best.sampleCount} calls (confidence: ${(confidence * 100).toFixed(0)}%)`,
  };

  // CTO condition: always log, never act (Phase 1)
  const ffEnabled = process.env.ENDIORBOT_FF_EXPERT_ROUTING_ENABLED === "true";
  log.info("Expert routing recommendation", {
    agent,
    taskType,
    recommended: `${best.provider}/${best.model}`,
    successRate: best.successRate,
    sampleCount: best.sampleCount,
    confidence,
    ffEnabled,
    phase: ffEnabled ? "ACTIVE (Phase 2 — would influence routing)" : "READ-ONLY (Phase 1 — logging only)",
  });

  return recommendation;
}

/**
 * Get all routing statistics (for dashboard / cost report).
 */
export function getRoutingStats(): {
  totalRecords: number;
  byAgent: Record<string, number>;
  byProvider: Record<string, { success: number; total: number }>;
} {
  const byAgent: Record<string, number> = {};
  const byProvider: Record<string, { success: number; total: number }> = {};

  for (const r of records) {
    byAgent[r.agent] = (byAgent[r.agent] ?? 0) + 1;
    const prov = byProvider[r.provider] ?? { success: 0, total: 0 };
    prov.total++;
    if (r.success) prov.success++;
    byProvider[r.provider] = prov;
  }

  return { totalRecords: records.length, byAgent, byProvider };
}

/**
 * Reset records (for testing).
 */
export function resetRoutingRecords(): void {
  records.length = 0;
}
