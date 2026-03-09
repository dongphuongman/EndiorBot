/**
 * Response Aggregator
 *
 * Merges results from multiple agents into a single AggregatedResponse.
 * Uses template-based aggregation (not LLM summarization) for T2 — AD-3.
 * CTO F3: Does NOT reuse ChannelRouter.formatResponse().
 *
 * @module autonomy/response-aggregator
 * @version 1.0.0
 * @authority Sprint 95 Plan (Phase 4)
 * @sprint 95
 */

import type { AggregatedResponse, SubtaskResult } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default max output length (characters) */
const DEFAULT_MAX_LENGTH = 8000;

// ============================================================================
// ResponseAggregator
// ============================================================================

export class ResponseAggregator {
  private readonly maxLength: number;

  constructor(maxLength = DEFAULT_MAX_LENGTH) {
    this.maxLength = maxLength;
  }

  /**
   * Aggregate multiple subtask results into a single response.
   */
  aggregate(results: SubtaskResult[]): AggregatedResponse {
    if (results.length === 0) {
      return this.emptyResponse();
    }

    // Single result: passthrough
    if (results.length === 1) {
      return this.singleResponse(results[0]!);
    }

    // Multi-agent: template aggregation
    return this.multiResponse(results);
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private emptyResponse(): AggregatedResponse {
    return {
      text: "No results available.",
      format: "plain",
      agents: [],
      totalDurationMs: 0,
      totalCostUsd: 0,
      subtaskResults: [],
    };
  }

  private singleResponse(result: SubtaskResult): AggregatedResponse {
    return {
      text: result.success ? result.output : `Error: ${result.error ?? "Unknown error"}`,
      format: "markdown",
      agents: [result.agent],
      totalDurationMs: result.durationMs,
      totalCostUsd: result.estimatedCostUsd,
      subtaskResults: [result],
    };
  }

  private multiResponse(results: SubtaskResult[]): AggregatedResponse {
    const agents = results.map((r) => r.agent);
    const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalCostUsd = results.reduce((sum, r) => sum + r.estimatedCostUsd, 0);

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Build sections
    const parts: string[] = [];

    // Header
    parts.push(this.formatHeader(results, totalDurationMs, totalCostUsd));

    // Successful agent sections
    for (const result of successful) {
      parts.push(this.formatSection(result));
    }

    // Failed sections (if any)
    if (failed.length > 0) {
      parts.push(this.formatFailedSections(failed));
    }

    let text = parts.join("\n\n");
    text = this.truncateIfNeeded(text);

    return {
      text,
      format: "markdown",
      agents,
      totalDurationMs,
      totalCostUsd,
      subtaskResults: results,
    };
  }

  private formatHeader(
    results: SubtaskResult[],
    totalDurationMs: number,
    totalCostUsd: number,
  ): string {
    const agents = results.map((r) => `@${r.agent}`).join(", ");
    const successful = results.filter((r) => r.success).length;
    const durationSec = (totalDurationMs / 1000).toFixed(1);

    return `**Multi-agent response** (${agents}) — ${successful}/${results.length} completed, ${durationSec}s, ~$${totalCostUsd.toFixed(2)}`;
  }

  private formatSection(result: SubtaskResult): string {
    return `### @${result.agent}\n\n${result.output}`;
  }

  private formatFailedSections(failed: SubtaskResult[]): string {
    const items = failed
      .map((r) => `- @${r.agent}: ${r.error ?? "Unknown error"}`)
      .join("\n");
    return `### Errors\n\n${items}`;
  }

  private truncateIfNeeded(text: string): string {
    if (text.length <= this.maxLength) return text;
    return text.slice(0, this.maxLength - 20) + "\n\n[...truncated]";
  }
}
