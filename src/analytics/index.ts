/**
 * Analytics Module
 *
 * Provides usage, cost, and performance analytics for EndiorBot.
 *
 * @module analytics
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

export {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  type AgentMetric,
  type DailyMetrics,
  type SessionMetrics,
  type AnalyticsSummary,
} from "./metrics-collector.js";
