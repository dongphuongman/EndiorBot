/**
 * Context Selector — Sprint 96
 *
 * Selects which past context to inject into a new session.
 * Scores → gates → sorts → fills up to 600-token budget.
 *
 * CTO F1: maxInjectionTokens = 600 (shares 2K total with AnchorBudget's 800).
 * Uses AnchorBudget priority-based allocation pattern.
 *
 * @module context/transfer/context-selector
 * @version 1.0.0
 * @sprint 96
 */

import { getTokenCounter } from "../../sessions/token-counter.js";
import type {
  TransferableContext,
  TransferContextType,
  ContextSelectionResult,
} from "./types.js";
import { DEFAULT_TRANSFER_CONFIG } from "./types.js";
import {
  ContextQualityScorer,
  getContextQualityScorer,
} from "./quality-scorer.js";
import {
  ContextQualityGate,
  getContextQualityGate,
} from "./quality-gate.js";
import {
  ContextTransferStore,
  getContextTransferStore,
} from "./context-transfer-store.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Priority order for context types during budget filling.
 * Higher-value types are prioritized when budget is tight.
 */
const TYPE_PRIORITY: TransferContextType[] = [
  "decision",
  "architecture",
  "goal_result",
  "blocker_resolution",
  "error_pattern",
  "task_output",
];

// ============================================================================
// ContextSelector
// ============================================================================

export interface ContextSelectorOptions {
  maxTokens?: number;
  scorer?: ContextQualityScorer;
  gate?: ContextQualityGate;
  store?: ContextTransferStore;
}

export class ContextSelector {
  private readonly maxTokens: number;
  private readonly scorer: ContextQualityScorer;
  private readonly gate: ContextQualityGate;
  private readonly store: ContextTransferStore;
  private readonly tokenCounter: ReturnType<typeof getTokenCounter>;

  constructor(options?: ContextSelectorOptions) {
    this.maxTokens = options?.maxTokens ?? DEFAULT_TRANSFER_CONFIG.maxInjectionTokens;
    this.scorer = options?.scorer ?? getContextQualityScorer();
    this.gate = options?.gate ?? getContextQualityGate();
    this.store = options?.store ?? getContextTransferStore();
    this.tokenCounter = getTokenCounter();
  }

  /**
   * Select past context for a new session.
   *
   * Algorithm:
   * 1. Load all TransferableContext for project
   * 2. Score each with ContextQualityScorer
   * 3. Filter through ContextQualityGate
   * 4. Sort by composite score descending
   * 5. Fill up to maxTokens budget
   */
  async selectForSession(
    projectId: string,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): Promise<ContextSelectionResult> {
    // 1. Load all non-expired entries
    const all = await this.store.listByProject(projectId, { excludeExpired: true });

    if (all.length === 0) {
      return {
        selected: [],
        dropped: [],
        totalTokens: 0,
        budgetUtilization: 0,
        retentionRate: 0,
      };
    }

    // 2. Re-score each entry with current context
    const scored = all.map((ctx) => {
      const quality = this.scorer.score(ctx, currentGoal, currentTags, currentStage);
      return { ...ctx, quality };
    });

    // 3. Filter through quality gate
    const gateResults = this.gate.evaluateBatch(scored, currentGoal, currentTags, currentStage);
    const passed: TransferableContext[] = [];
    const failedGate: TransferableContext[] = [];

    for (let i = 0; i < scored.length; i++) {
      const result = gateResults[i];
      if (result && result.passed) {
        passed.push(scored[i]!);
      } else {
        failedGate.push(scored[i]!);
      }
    }

    // 4. Sort by type priority first, then by composite score descending
    passed.sort((a, b) => {
      const priorityA = TYPE_PRIORITY.indexOf(a.type);
      const priorityB = TYPE_PRIORITY.indexOf(b.type);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.quality.composite - a.quality.composite;
    });

    // 5. Fill up to budget
    const selected: TransferableContext[] = [];
    const droppedBudget: TransferableContext[] = [];
    let usedTokens = 0;

    for (const ctx of passed) {
      if (usedTokens + ctx.tokenCount <= this.maxTokens) {
        selected.push(ctx);
        usedTokens += ctx.tokenCount;
      } else {
        droppedBudget.push(ctx);
      }
    }

    const dropped = [...failedGate, ...droppedBudget];
    // CTO F2 (Sprint 97): retention = selectedTokens / gatedTokens (not total available).
    // This makes ≥95% achievable — quality gate filters stale/low-quality first,
    // retention measures "of the good stuff, how much did we keep?"
    const gatedTokens = passed.reduce((sum, c) => sum + c.tokenCount, 0);

    return {
      selected,
      dropped,
      totalTokens: usedTokens,
      budgetUtilization: this.maxTokens > 0 ? usedTokens / this.maxTokens : 0,
      retentionRate: gatedTokens > 0 ? usedTokens / gatedTokens : 0,
    };
  }

  /**
   * Build a formatted injection payload from selected contexts.
   * Ready to prepend to session context.
   */
  buildInjectionPayload(selected: TransferableContext[]): string {
    if (selected.length === 0) return "";

    const sections = selected.map((ctx) => {
      const header = `[${ctx.type}] @${ctx.agentSource ?? "system"} (${ctx.sdlcStage ?? "unknown"})`;
      return `${header}\n${ctx.content}`;
    });

    const payload = "## Prior Session Context\n\n" + sections.join("\n\n---\n\n");

    // Final token check — hard cap
    if (!this.tokenCounter.willFit(payload, this.maxTokens)) {
      return this.tokenCounter.truncateToFit(payload, this.maxTokens);
    }

    return payload;
  }

  /**
   * Estimate context retention rate.
   * T3 target: >= 0.95
   */
  estimateRetentionRate(
    selected: TransferableContext[],
    total: TransferableContext[],
  ): number {
    if (total.length === 0) return 0;
    const selectedTokens = selected.reduce((sum, c) => sum + c.tokenCount, 0);
    const totalTokens = total.reduce((sum, c) => sum + c.tokenCount, 0);
    return totalTokens > 0 ? selectedTokens / totalTokens : 0;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalSelector: ContextSelector | undefined;

export function getContextSelector(): ContextSelector {
  if (!globalSelector) {
    globalSelector = new ContextSelector();
  }
  return globalSelector;
}

export function resetContextSelector(): void {
  globalSelector = undefined;
}
