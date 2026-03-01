/**
 * Metrics Collector
 *
 * Collects and aggregates usage, cost, and performance metrics.
 * Stores metrics in the state directory for dashboard display.
 *
 * Metrics Categories:
 * - Usage: agent invocations, commands executed, handoffs
 * - Cost: token usage, API costs per provider
 * - Performance: response times, success rates, errors
 *
 * @module analytics/metrics-collector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger, type Logger } from "../logging/index.js";
import { resolveStateDir } from "../config/paths.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent invocation metric.
 */
export interface AgentMetric {
  agent: string;
  task: string;
  mode: "READ" | "PATCH" | "INTERACTIVE";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
  cost?: number;
  handoffs?: number;
}

/**
 * Daily metrics summary.
 */
export interface DailyMetrics {
  date: string;
  usage: {
    totalInvocations: number;
    byAgent: Record<string, number>;
    byMode: Record<string, number>;
    handoffs: number;
    commands: number;
  };
  cost: {
    total: number;
    byProvider: Record<string, number>;
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
    byAgent: Record<string, { input: number; output: number }>;
  };
  performance: {
    avgResponseTimeMs: number;
    successRate: number;
    errors: number;
    /** TODO: Requires storing response time array for proper calculation (Sprint 60+) */
    p50ResponseTimeMs: number;
    /** TODO: Requires storing response time array for proper calculation (Sprint 60+) */
    p95ResponseTimeMs: number;
  };
}

/**
 * Session metrics.
 */
export interface SessionMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  invocations: AgentMetric[];
  totalCost: number;
  totalTokens: number;
}

/**
 * Analytics summary for dashboard.
 */
export interface AnalyticsSummary {
  period: "today" | "week" | "month" | "all";
  totalInvocations: number;
  totalCost: number;
  totalTokens: number;
  avgResponseTimeMs: number;
  successRate: number;
  topAgents: { agent: string; count: number }[];
  costTrend: { date: string; cost: number }[];
  usageTrend: { date: string; count: number }[];
}

// ============================================================================
// Constants
// ============================================================================

const METRICS_DIR = "analytics";
const DAILY_FILE_PREFIX = "daily-";
const SESSION_FILE_PREFIX = "session-";

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * Collects and aggregates metrics.
 */
export class MetricsCollector {
  private logger: Logger;
  private metricsDir: string;
  private currentSession: SessionMetrics | null = null;

  constructor() {
    this.logger = createLogger("metrics-collector");
    this.metricsDir = join(resolveStateDir(), METRICS_DIR);
    this.ensureMetricsDir();
  }

  /**
   * Ensure metrics directory exists.
   */
  private ensureMetricsDir(): void {
    if (!existsSync(this.metricsDir)) {
      mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  /**
   * Start a new session.
   */
  startSession(sessionId?: string): string {
    const id = sessionId ?? `session-${Date.now()}`;
    this.currentSession = {
      sessionId: id,
      startTime: Date.now(),
      invocations: [],
      totalCost: 0,
      totalTokens: 0,
    };
    this.logger.debug("Session started", { sessionId: id });
    return id;
  }

  /**
   * End current session and persist.
   */
  endSession(): SessionMetrics | null {
    if (!this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    this.persistSession(this.currentSession);

    const session = this.currentSession;
    this.currentSession = null;
    this.logger.debug("Session ended", { sessionId: session.sessionId });
    return session;
  }

  /**
   * Record an agent invocation.
   */
  recordInvocation(metric: AgentMetric): void {
    // Calculate duration if not set
    if (metric.endTime && !metric.durationMs) {
      metric.durationMs = metric.endTime - metric.startTime;
    }

    // Add to current session
    if (this.currentSession) {
      this.currentSession.invocations.push(metric);
      if (metric.cost) {
        this.currentSession.totalCost += metric.cost;
      }
      if (metric.tokenUsage) {
        this.currentSession.totalTokens += metric.tokenUsage.input + metric.tokenUsage.output;
      }
    }

    // Update daily metrics
    this.updateDailyMetrics(metric);

    this.logger.debug("Invocation recorded", {
      agent: metric.agent,
      success: metric.success,
      durationMs: metric.durationMs,
    });
  }

  /**
   * Update daily metrics with new invocation.
   */
  private updateDailyMetrics(metric: AgentMetric): void {
    const today = this.getToday();
    const daily = this.loadDailyMetrics(today);

    // Update usage
    daily.usage.totalInvocations++;
    daily.usage.byAgent[metric.agent] = (daily.usage.byAgent[metric.agent] ?? 0) + 1;
    daily.usage.byMode[metric.mode] = (daily.usage.byMode[metric.mode] ?? 0) + 1;
    if (metric.handoffs) {
      daily.usage.handoffs += metric.handoffs;
    }

    // Update cost
    if (metric.cost) {
      daily.cost.total += metric.cost;
    }

    // Update tokens
    if (metric.tokenUsage) {
      daily.tokens.totalInput += metric.tokenUsage.input;
      daily.tokens.totalOutput += metric.tokenUsage.output;
      const agentTokens = daily.tokens.byAgent[metric.agent] ?? { input: 0, output: 0 };
      agentTokens.input += metric.tokenUsage.input;
      agentTokens.output += metric.tokenUsage.output;
      daily.tokens.byAgent[metric.agent] = agentTokens;
    }

    // Update performance
    if (metric.durationMs) {
      const totalTime = daily.performance.avgResponseTimeMs * (daily.usage.totalInvocations - 1);
      daily.performance.avgResponseTimeMs = (totalTime + metric.durationMs) / daily.usage.totalInvocations;
    }
    if (!metric.success) {
      daily.performance.errors++;
    }
    daily.performance.successRate =
      ((daily.usage.totalInvocations - daily.performance.errors) / daily.usage.totalInvocations) * 100;

    this.saveDailyMetrics(today, daily);
  }

  /**
   * Get today's date string.
   */
  private getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Load daily metrics for a date.
   */
  private loadDailyMetrics(date: string): DailyMetrics {
    const filePath = join(this.metricsDir, `${DAILY_FILE_PREFIX}${date}.json`);
    if (existsSync(filePath)) {
      try {
        return JSON.parse(readFileSync(filePath, "utf-8")) as DailyMetrics;
      } catch {
        // Fall through to create new
      }
    }

    return {
      date,
      usage: {
        totalInvocations: 0,
        byAgent: {},
        byMode: {},
        handoffs: 0,
        commands: 0,
      },
      cost: {
        total: 0,
        byProvider: {},
      },
      tokens: {
        totalInput: 0,
        totalOutput: 0,
        byAgent: {},
      },
      performance: {
        avgResponseTimeMs: 0,
        successRate: 100,
        errors: 0,
        p50ResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
      },
    };
  }

  /**
   * Save daily metrics.
   */
  private saveDailyMetrics(date: string, metrics: DailyMetrics): void {
    const filePath = join(this.metricsDir, `${DAILY_FILE_PREFIX}${date}.json`);
    writeFileSync(filePath, JSON.stringify(metrics, null, 2));
  }

  /**
   * Persist session to file.
   */
  private persistSession(session: SessionMetrics): void {
    const filePath = join(this.metricsDir, `${SESSION_FILE_PREFIX}${session.sessionId}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  /**
   * Get analytics summary.
   */
  getSummary(period: "today" | "week" | "month" | "all" = "today"): AnalyticsSummary {
    const dates = this.getDateRange(period);
    const dailyMetrics = dates.map((d) => this.loadDailyMetrics(d));

    const summary: AnalyticsSummary = {
      period,
      totalInvocations: 0,
      totalCost: 0,
      totalTokens: 0,
      avgResponseTimeMs: 0,
      successRate: 100,
      topAgents: [],
      costTrend: [],
      usageTrend: [],
    };

    const agentCounts: Record<string, number> = {};
    let totalResponseTime = 0;
    let totalErrors = 0;

    for (const daily of dailyMetrics) {
      summary.totalInvocations += daily.usage.totalInvocations;
      summary.totalCost += daily.cost.total;
      summary.totalTokens += daily.tokens.totalInput + daily.tokens.totalOutput;
      totalResponseTime += daily.performance.avgResponseTimeMs * daily.usage.totalInvocations;
      totalErrors += daily.performance.errors;

      // Aggregate agent counts
      for (const [agent, count] of Object.entries(daily.usage.byAgent)) {
        agentCounts[agent] = (agentCounts[agent] ?? 0) + count;
      }

      // Add trends
      summary.costTrend.push({ date: daily.date, cost: daily.cost.total });
      summary.usageTrend.push({ date: daily.date, count: daily.usage.totalInvocations });
    }

    // Calculate averages
    if (summary.totalInvocations > 0) {
      summary.avgResponseTimeMs = totalResponseTime / summary.totalInvocations;
      summary.successRate = ((summary.totalInvocations - totalErrors) / summary.totalInvocations) * 100;
    }

    // Top agents
    summary.topAgents = Object.entries(agentCounts)
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return summary;
  }

  /**
   * Get date range for period.
   */
  private getDateRange(period: "today" | "week" | "month" | "all"): string[] {
    const today = new Date();
    const dates: string[] = [];

    let daysBack = 0;
    switch (period) {
      case "today":
        daysBack = 1;
        break;
      case "week":
        daysBack = 7;
        break;
      case "month":
        daysBack = 30;
        break;
      case "all":
        daysBack = 365;
        break;
    }

    for (let i = 0; i < daysBack; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().slice(0, 10));
    }

    return dates.reverse();
  }

  /**
   * Format summary for display.
   */
  formatSummary(summary: AnalyticsSummary): string {
    const lines = [
      `📊 Analytics Summary (${summary.period})`,
      "",
      "  Usage:",
      `    Total Invocations: ${summary.totalInvocations}`,
      `    Success Rate: ${summary.successRate.toFixed(1)}%`,
      `    Avg Response Time: ${summary.avgResponseTimeMs.toFixed(0)}ms`,
      "",
      "  Cost:",
      `    Total: $${summary.totalCost.toFixed(4)}`,
      `    Total Tokens: ${summary.totalTokens.toLocaleString()}`,
      "",
    ];

    if (summary.topAgents.length > 0) {
      lines.push("  Top Agents:");
      for (const { agent, count } of summary.topAgents) {
        lines.push(`    @${agent}: ${count} invocations`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: MetricsCollector | undefined;

/**
 * Get the metrics collector singleton.
 */
export function getMetricsCollector(): MetricsCollector {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetMetricsCollector(): void {
  instance = undefined;
}
