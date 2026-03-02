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
 *   endiorbot analytics aer          # Show AER metrics (Sprint 72)
 *
 * @module cli/commands/analytics
 * @version 1.1.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 */

import type { Command } from "commander";
import { getMetricsCollector } from "../../analytics/index.js";
import {
  createAERCalculator,
  type AERResult,
  DEFAULT_AER_TARGETS,
} from "../../metrics/index.js";

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

interface AEROptions {
  session?: string;
  last?: number;
  export?: string;
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
// AER Actions (Sprint 72)
// ============================================================================

/**
 * Show AER metrics for a session or multiple sessions.
 */
async function aerAction(options: AEROptions): Promise<void> {
  const calculator = createAERCalculator();

  // Get sessions to analyze
  let sessionIds: string[] = [];
  if (options.session) {
    sessionIds = [options.session];
  } else if (options.last) {
    sessionIds = await calculator.getRecentSessions(options.last);
  } else {
    // Default: get current or most recent session
    sessionIds = await calculator.getRecentSessions(1);
  }

  if (sessionIds.length === 0) {
    console.log("⚠️ No sessions found to analyze.");
    console.log("");
    console.log("Sessions are logged to .endiorbot/events/");
    return;
  }

  // Calculate metrics
  const results: AERResult[] = [];
  for (const sessionId of sessionIds) {
    const result = await calculator.evaluate(sessionId);
    results.push(result);
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Export to markdown if requested
  if (options.export) {
    await exportAERMarkdown(results, options.export);
    console.log(`✅ AER report exported to ${options.export}`);
    return;
  }

  // Display table
  displayAERTable(results);
}

/**
 * Display AER metrics as a formatted table.
 */
function displayAERTable(results: AERResult[]): void {
  console.log("");
  console.log("📊 Agent Effectiveness Rating (AER) Metrics");
  console.log("");

  for (const result of results) {
    const { metrics, metricStatus, passed } = result;
    const statusIcon = passed ? "✅" : "❌";

    console.log(`Session: ${result.sessionId} ${statusIcon}`);
    console.log("─".repeat(60));
    console.log("");

    // Primary metrics table
    const rows = [
      {
        metric: "Autonomy Time",
        value: `${metrics.autonomyTime.toFixed(1)}min`,
        target: `≥${DEFAULT_AER_TARGETS.autonomyTimeMin}min`,
        status: metricStatus.autonomyTime ? "✅" : "❌",
      },
      {
        metric: "Task Completion Rate",
        value: `${(metrics.taskCompletionRate * 100).toFixed(1)}%`,
        target: `≥${DEFAULT_AER_TARGETS.taskCompletionRateMin * 100}%`,
        status: metricStatus.taskCompletionRate ? "✅" : "❌",
      },
      {
        metric: "Recovery Rate",
        value: `${(metrics.recoveryRate * 100).toFixed(1)}%`,
        target: `≥${DEFAULT_AER_TARGETS.recoveryRateMin * 100}%`,
        status: metricStatus.recoveryRate ? "✅" : "❌",
      },
      {
        metric: "Tool Choice Accuracy",
        value: `${(metrics.toolChoiceAccuracy * 100).toFixed(1)}%`,
        target: `≥${DEFAULT_AER_TARGETS.toolChoiceAccuracyMin * 100}%`,
        status: metricStatus.toolChoiceAccuracy ? "✅" : "❌",
      },
      {
        metric: "Cost per Task",
        value: `$${metrics.costPerTask.toFixed(2)}`,
        target: `<$${DEFAULT_AER_TARGETS.costPerTaskMax}`,
        status: metricStatus.costPerTask ? "✅" : "❌",
      },
    ];

    console.log("  Metric                    Value           Target          Status");
    console.log("  " + "─".repeat(70));
    for (const row of rows) {
      console.log(
        `  ${row.metric.padEnd(25)} ${row.value.padEnd(15)} ${row.target.padEnd(15)} ${row.status}`
      );
    }
    console.log("");

    // Breakdown section
    console.log("  Breakdown:");
    console.log(`    Tasks: ${metrics.completedTasks}/${metrics.totalTasks} completed, ${metrics.failedTasks} failed`);
    console.log(`    Recoveries: ${metrics.recoveries}/${metrics.totalFailures} failures recovered`);
    console.log(`    Escalations: ${metrics.escalations}`);
    console.log(`    Total Cost: $${metrics.totalCost.toFixed(4)}`);
    console.log(`    Session Duration: ${metrics.sessionDuration.toFixed(1)} minutes`);
    console.log("");

    // Model usage
    if (metrics.modelUsage.opus.calls > 0 ||
        metrics.modelUsage.sonnet.calls > 0 ||
        metrics.modelUsage.haiku.calls > 0) {
      console.log("  Model Usage:");
      if (metrics.modelUsage.opus.calls > 0) {
        console.log(`    Opus:   ${metrics.modelUsage.opus.calls} calls, ${(metrics.modelUsage.opus.timeSeconds / 60).toFixed(1)}min, $${metrics.modelUsage.opus.cost.toFixed(4)}`);
      }
      if (metrics.modelUsage.sonnet.calls > 0) {
        console.log(`    Sonnet: ${metrics.modelUsage.sonnet.calls} calls, ${(metrics.modelUsage.sonnet.timeSeconds / 60).toFixed(1)}min, $${metrics.modelUsage.sonnet.cost.toFixed(4)}`);
      }
      if (metrics.modelUsage.haiku.calls > 0) {
        console.log(`    Haiku:  ${metrics.modelUsage.haiku.calls} calls, ${(metrics.modelUsage.haiku.timeSeconds / 60).toFixed(1)}min, $${metrics.modelUsage.haiku.cost.toFixed(4)}`);
      }
      console.log("");
    }
  }

  // Summary if multiple sessions
  if (results.length > 1) {
    const passCount = results.filter((r) => r.passed).length;
    console.log("─".repeat(60));
    console.log(`Summary: ${passCount}/${results.length} sessions passed all targets`);
    console.log("");
  }
}

/**
 * Export AER metrics to markdown file.
 */
async function exportAERMarkdown(results: AERResult[], filepath: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");

  let content = `# AER Metrics Report

*Generated: ${new Date().toISOString()}*

## Summary

| Session | Passed | Autonomy | TCR | RR | Cost |
|---------|--------|----------|-----|----|----|
`;

  for (const result of results) {
    const { metrics, passed, sessionId } = result;
    content += `| ${sessionId} | ${passed ? "✅" : "❌"} | ${metrics.autonomyTime.toFixed(1)}min | ${(metrics.taskCompletionRate * 100).toFixed(0)}% | ${(metrics.recoveryRate * 100).toFixed(0)}% | $${metrics.costPerTask.toFixed(2)} |\n`;
  }

  content += `
## Targets

| Metric | Target |
|--------|--------|
| Autonomy Time | ≥${DEFAULT_AER_TARGETS.autonomyTimeMin} minutes |
| Task Completion Rate | ≥${DEFAULT_AER_TARGETS.taskCompletionRateMin * 100}% |
| Recovery Rate | ≥${DEFAULT_AER_TARGETS.recoveryRateMin * 100}% |
| Tool Choice Accuracy | ≥${DEFAULT_AER_TARGETS.toolChoiceAccuracyMin * 100}% |
| Cost per Task | <$${DEFAULT_AER_TARGETS.costPerTaskMax} |

---

*Sprint 72: v2.0 Autonomous SDLC Agent*
`;

  await writeFile(filepath, content);
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

  // AER command (Sprint 72)
  analytics
    .command("aer")
    .description("Show Agent Effectiveness Rating (AER) metrics")
    .option("--session <id>", "Specific session ID to analyze")
    .option("--last <n>", "Analyze last N sessions", parseInt)
    .option("--export <path>", "Export report to markdown file")
    .option("--json", "Output as JSON")
    .action(aerAction);
}
