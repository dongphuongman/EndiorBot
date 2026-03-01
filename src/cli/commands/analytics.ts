/**
 * Analytics Command
 *
 * Display usage, cost, and performance analytics.
 *
 * Usage:
 *   endiorbot analytics              # Show today's summary
 *   endiorbot analytics --week       # Show weekly summary
 *   endiorbot analytics --month      # Show monthly summary
 *   endiorbot analytics cost         # Show cost breakdown
 *   endiorbot analytics agents       # Show agent usage
 *
 * @module cli/commands/analytics
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import type { Command } from "commander";
import { getMetricsCollector } from "../../analytics/index.js";

// ============================================================================
// Types
// ============================================================================

interface AnalyticsOptions {
  today?: boolean;
  week?: boolean;
  month?: boolean;
  all?: boolean;
  json?: boolean;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Show analytics summary.
 */
async function summaryAction(options: AnalyticsOptions): Promise<void> {
  const collector = getMetricsCollector();

  let period: "today" | "week" | "month" | "all" = "today";
  if (options.week) period = "week";
  if (options.month) period = "month";
  if (options.all) period = "all";

  const summary = collector.getSummary(period);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(collector.formatSummary(summary));
}

/**
 * Show cost breakdown.
 */
async function costAction(options: AnalyticsOptions): Promise<void> {
  const collector = getMetricsCollector();

  let period: "today" | "week" | "month" | "all" = "today";
  if (options.week) period = "week";
  if (options.month) period = "month";
  if (options.all) period = "all";

  const summary = collector.getSummary(period);

  if (options.json) {
    console.log(JSON.stringify({
      period,
      totalCost: summary.totalCost,
      totalTokens: summary.totalTokens,
      costTrend: summary.costTrend,
    }, null, 2));
    return;
  }

  console.log(`💰 Cost Analysis (${period})`);
  console.log("");
  console.log(`  Total Cost: $${summary.totalCost.toFixed(4)}`);
  console.log(`  Total Tokens: ${summary.totalTokens.toLocaleString()}`);
  console.log("");

  if (summary.costTrend.length > 0) {
    console.log("  Daily Cost Trend:");
    for (const { date, cost } of summary.costTrend.slice(-7)) {
      const bar = "█".repeat(Math.min(Math.ceil(cost * 100), 20));
      console.log(`    ${date}: $${cost.toFixed(4)} ${bar}`);
    }
  }
}

/**
 * Show agent usage breakdown.
 */
async function agentsAction(options: AnalyticsOptions): Promise<void> {
  const collector = getMetricsCollector();

  let period: "today" | "week" | "month" | "all" = "today";
  if (options.week) period = "week";
  if (options.month) period = "month";
  if (options.all) period = "all";

  const summary = collector.getSummary(period);

  if (options.json) {
    console.log(JSON.stringify({
      period,
      totalInvocations: summary.totalInvocations,
      topAgents: summary.topAgents,
      usageTrend: summary.usageTrend,
    }, null, 2));
    return;
  }

  console.log(`🤖 Agent Usage (${period})`);
  console.log("");
  console.log(`  Total Invocations: ${summary.totalInvocations}`);
  console.log(`  Success Rate: ${summary.successRate.toFixed(1)}%`);
  console.log(`  Avg Response: ${summary.avgResponseTimeMs.toFixed(0)}ms`);
  console.log("");

  if (summary.topAgents.length > 0) {
    console.log("  Agent Breakdown:");
    const maxCount = Math.max(...summary.topAgents.map((a) => a.count));
    for (const { agent, count } of summary.topAgents) {
      const pct = summary.totalInvocations > 0
        ? ((count / summary.totalInvocations) * 100).toFixed(1)
        : "0.0";
      const barLength = Math.ceil((count / maxCount) * 15);
      const bar = "█".repeat(barLength);
      console.log(`    @${agent.padEnd(12)} ${String(count).padStart(4)} (${pct}%) ${bar}`);
    }
  } else {
    console.log("  No agent invocations recorded.");
  }
}

/**
 * Show performance metrics.
 */
async function performanceAction(options: AnalyticsOptions): Promise<void> {
  const collector = getMetricsCollector();

  let period: "today" | "week" | "month" | "all" = "today";
  if (options.week) period = "week";
  if (options.month) period = "month";
  if (options.all) period = "all";

  const summary = collector.getSummary(period);

  if (options.json) {
    console.log(JSON.stringify({
      period,
      successRate: summary.successRate,
      avgResponseTimeMs: summary.avgResponseTimeMs,
    }, null, 2));
    return;
  }

  console.log(`⚡ Performance Metrics (${period})`);
  console.log("");
  console.log(`  Success Rate: ${summary.successRate.toFixed(1)}%`);
  console.log(`  Avg Response Time: ${summary.avgResponseTimeMs.toFixed(0)}ms`);
  console.log(`  Total Invocations: ${summary.totalInvocations}`);
  console.log("");

  // Success rate visualization
  const successPct = Math.floor(summary.successRate / 5);
  const successBar = "█".repeat(successPct) + "░".repeat(20 - successPct);
  console.log(`  Success: [${successBar}] ${summary.successRate.toFixed(1)}%`);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register analytics commands.
 */
export function registerAnalyticsCommand(program: Command): void {
  const analytics = program
    .command("analytics")
    .description("Display usage, cost, and performance analytics")
    .option("--today", "Show today's metrics (default)")
    .option("--week", "Show weekly metrics")
    .option("--month", "Show monthly metrics")
    .option("--all", "Show all-time metrics")
    .option("--json", "Output as JSON")
    .action(summaryAction);

  analytics
    .command("cost")
    .description("Show cost breakdown")
    .option("--today", "Show today's metrics")
    .option("--week", "Show weekly metrics")
    .option("--month", "Show monthly metrics")
    .option("--all", "Show all-time metrics")
    .option("--json", "Output as JSON")
    .action(costAction);

  analytics
    .command("agents")
    .description("Show agent usage breakdown")
    .option("--today", "Show today's metrics")
    .option("--week", "Show weekly metrics")
    .option("--month", "Show monthly metrics")
    .option("--all", "Show all-time metrics")
    .option("--json", "Output as JSON")
    .action(agentsAction);

  analytics
    .command("performance")
    .description("Show performance metrics")
    .option("--today", "Show today's metrics")
    .option("--week", "Show weekly metrics")
    .option("--month", "Show monthly metrics")
    .option("--all", "Show all-time metrics")
    .option("--json", "Output as JSON")
    .action(performanceAction);
}
