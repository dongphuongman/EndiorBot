/**
 * Performance Command
 *
 * Display and manage performance metrics.
 *
 * Usage:
 *   endiorbot performance           # Show performance report
 *   endiorbot performance cache     # Show cache statistics
 *   endiorbot performance clear     # Clear caches
 *
 * @module cli/commands/performance
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

import type { Command } from "commander";
import {
  getPerformanceMonitor,
  contextCache,
  gateCache,
  projectCache,
  tierConfigCache,
} from "../../performance/index.js";

// ============================================================================
// Actions
// ============================================================================

/**
 * Show performance report.
 */
async function reportAction(): Promise<void> {
  const monitor = getPerformanceMonitor();
  console.log(monitor.formatReport());
}

/**
 * Show cache statistics.
 */
async function cacheAction(): Promise<void> {
  const caches = [
    { name: "Context", cache: contextCache },
    { name: "Gate", cache: gateCache },
    { name: "Project", cache: projectCache },
    { name: "Tier Config", cache: tierConfigCache },
  ];

  console.log("📦 Cache Statistics\n");
  console.log("Cache           Size    Hits    Misses    Hit Rate    Evictions");
  console.log("─".repeat(65));

  for (const { name, cache } of caches) {
    const stats = cache.getStats();
    console.log(
      `${name.padEnd(16)}${String(stats.size).padStart(4)}    ` +
      `${String(stats.hits).padStart(4)}    ${String(stats.misses).padStart(6)}    ` +
      `${stats.hitRate.toFixed(1).padStart(7)}%    ${String(stats.evictions).padStart(9)}`
    );
  }
}

/**
 * Clear all caches.
 */
async function clearAction(): Promise<void> {
  contextCache.clear();
  gateCache.clear();
  projectCache.clear();
  tierConfigCache.clear();

  console.log("✅ All caches cleared");
}

/**
 * Prune expired cache entries.
 */
async function pruneAction(): Promise<void> {
  let total = 0;
  total += contextCache.prune();
  total += gateCache.prune();
  total += projectCache.prune();
  total += tierConfigCache.prune();

  console.log(`✅ Pruned ${total} expired entries`);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register performance commands.
 */
export function registerPerformanceCommand(program: Command): void {
  const perf = program
    .command("performance")
    .alias("perf")
    .description("Display and manage performance metrics")
    .action(reportAction);

  perf
    .command("cache")
    .description("Show cache statistics")
    .action(cacheAction);

  perf
    .command("clear")
    .description("Clear all caches")
    .action(clearAction);

  perf
    .command("prune")
    .description("Remove expired cache entries")
    .action(pruneAction);
}
