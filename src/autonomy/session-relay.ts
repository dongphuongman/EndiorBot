/**
 * Session Relay
 *
 * Propagates context between sequential agent invocations.
 * Maintains a SessionRelayContext that accumulates results as subtasks
 * complete, with a 2K token cap per context injection (CLAUDE.md invariant).
 *
 * @module autonomy/session-relay
 * @version 1.0.0
 * @authority Sprint 95 Plan (Phase 3)
 * @sprint 95
 */

import { getTokenCounter } from "../sessions/token-counter.js";
import type { SessionRelayContext, SubtaskResult } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Max tokens for context injection — CLAUDE.md Token Budget invariant */
const MAX_CONTEXT_TOKENS = 2000;

/** Separator between agent context sections */
const SECTION_SEPARATOR = "\n---\n";

// ============================================================================
// SessionRelay
// ============================================================================

export class SessionRelay {
  private readonly maxTokens: number;

  constructor(maxTokens = MAX_CONTEXT_TOKENS) {
    this.maxTokens = maxTokens;
  }

  /**
   * Create a new relay context for a goal.
   */
  createRelay(goalId: string, sessionId: string): SessionRelayContext {
    return {
      sessionId,
      goalId,
      completedSubtasks: [],
      sharedContext: "",
      handoffChain: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Record a completed subtask result into the relay context.
   * Updates sharedContext and handoffChain.
   */
  recordSubtaskResult(relay: SessionRelayContext, result: SubtaskResult): void {
    relay.completedSubtasks.push(result);
    relay.handoffChain.push(result.agent);

    // Rebuild shared context from all completed subtasks
    relay.sharedContext = this.buildSharedContext(relay.completedSubtasks);
  }

  /**
   * Build context string for the next agent.
   * Includes prior agents' outputs, respecting the 2K token cap.
   */
  buildAgentContext(relay: SessionRelayContext, nextAgent: string): string {
    if (relay.completedSubtasks.length === 0) return "";

    const counter = getTokenCounter();
    const header = `[Context for @${nextAgent}] Prior agents completed ${relay.completedSubtasks.length} step(s):`;
    const sections: string[] = [header];

    // Add each completed subtask's output, newest first for relevance
    const reversed = [...relay.completedSubtasks].reverse();
    for (const sub of reversed) {
      if (!sub.success) continue;

      const section = `[@${sub.agent}]: ${sub.output}`;
      const candidate = sections.join(SECTION_SEPARATOR) + SECTION_SEPARATOR + section;

      if (counter.willFit(candidate, this.maxTokens)) {
        sections.push(section);
      } else {
        // Try truncated version
        const remaining = this.maxTokens - counter.count(sections.join(SECTION_SEPARATOR));
        if (remaining > 50) {
          const truncated = counter.truncateToFit(section, remaining - 10);
          sections.push(truncated);
        }
        break;
      }
    }

    return sections.join(SECTION_SEPARATOR);
  }

  /**
   * Summarize an output for handoff, respecting token budget.
   */
  summarizeForHandoff(output: string, maxTokens?: number): string {
    const limit = maxTokens ?? Math.floor(this.maxTokens / 2);
    const counter = getTokenCounter();

    if (counter.willFit(output, limit)) return output;
    return counter.truncateToFit(output, limit);
  }

  /**
   * Get current relay status.
   */
  getRelayStatus(relay: SessionRelayContext): RelayStatus {
    const totalMs = relay.completedSubtasks.reduce((sum, s) => sum + s.durationMs, 0);
    const totalCost = relay.completedSubtasks.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    const failed = relay.completedSubtasks.filter((s) => !s.success).length;

    return {
      goalId: relay.goalId,
      completedCount: relay.completedSubtasks.length,
      failedCount: failed,
      totalDurationMs: totalMs,
      totalCostUsd: totalCost,
      handoffChain: [...relay.handoffChain],
      contextTokens: getTokenCounter().count(relay.sharedContext),
    };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  /**
   * Build shared context from all completed subtasks.
   */
  private buildSharedContext(subtasks: SubtaskResult[]): string {
    const counter = getTokenCounter();
    const parts: string[] = [];

    for (const sub of subtasks) {
      if (!sub.success || !sub.output) continue;
      const section = `[@${sub.agent}]: ${sub.output}`;
      const candidate = parts.join(SECTION_SEPARATOR) + (parts.length ? SECTION_SEPARATOR : "") + section;

      if (counter.willFit(candidate, this.maxTokens)) {
        parts.push(section);
      } else {
        // Truncate last section to fit
        const remaining = this.maxTokens - counter.count(parts.join(SECTION_SEPARATOR));
        if (remaining > 50) {
          parts.push(counter.truncateToFit(section, remaining - 10));
        }
        break;
      }
    }

    return parts.join(SECTION_SEPARATOR);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface RelayStatus {
  goalId: string;
  completedCount: number;
  failedCount: number;
  totalDurationMs: number;
  totalCostUsd: number;
  handoffChain: string[];
  contextTokens: number;
}
