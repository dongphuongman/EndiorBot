/**
 * Context Lifecycle Manager — Sprint 97
 *
 * Orchestrates the full context transfer lifecycle:
 * inject → refresh → extract across session lifecycle.
 *
 * AD-2: Inject before first task in runLoop().
 * AD-4: Mid-session refresh every 30 turns OR 30 min.
 * CTO F1: Checkpoint via partialResults["contextTransfer"].
 * CTO F3: Swap threshold ≥0.1 improvement to prevent thrashing.
 * CTO F5: Additive hooks — does not restructure runLoop().
 *
 * @module context/transfer/context-lifecycle
 * @version 1.0.0
 * @sprint 97
 */

import type {
  ContextCheckpointState,
  ContextRefreshConfig,
  TransferableContext,
} from "./types.js";
import { DEFAULT_REFRESH_CONFIG } from "./types.js";
import {
  ContextInjector,
  getContextInjector,
} from "./context-injector.js";
import {
  ContextSelector,
  getContextSelector,
} from "./context-selector.js";
import {
  SessionContextExtractor,
} from "./session-context-extractor.js";
import {
  ContextTransferStore,
  getContextTransferStore,
} from "./context-transfer-store.js";
import {
  RetentionTracker,
  getRetentionTracker,
} from "./retention-tracker.js";

// ============================================================================
// ContextLifecycleManager
// ============================================================================

export interface ContextLifecycleOptions {
  injector?: ContextInjector;
  selector?: ContextSelector;
  store?: ContextTransferStore;
  tracker?: RetentionTracker;
  refreshConfig?: Partial<ContextRefreshConfig>;
}

export interface LifecycleStatus {
  injected: boolean;
  injectedContextCount: number;
  injectedTokens: number;
  retentionRate: number;
  refreshCount: number;
  lastRefreshAt: string | undefined;
  turnCount: number;
  sessionStartedAt: string | undefined;
}

export class ContextLifecycleManager {
  private readonly injector: ContextInjector;
  private readonly selector: ContextSelector;
  private readonly store: ContextTransferStore;
  private readonly tracker: RetentionTracker;
  private readonly refreshConfig: ContextRefreshConfig;

  private turnCount: number;
  private refreshCount: number;
  private lastRefreshAt: number; // ms timestamp
  private sessionStartedAt: number; // ms timestamp
  private projectId: string | undefined;
  private sessionId: string | undefined;
  private active: boolean;
  /** Sprint 142 P0-1: Dedup guard — prevents double vision injection when
   *  turn-based trigger overlaps with 30-min time-based refresh (CTO C2). */
  private lastVisionInjectionTurn: number;

  constructor(options?: ContextLifecycleOptions) {
    this.injector = options?.injector ?? getContextInjector();
    this.selector = options?.selector ?? getContextSelector();
    this.store = options?.store ?? getContextTransferStore();
    this.tracker = options?.tracker ?? getRetentionTracker();

    this.refreshConfig = {
      ...DEFAULT_REFRESH_CONFIG,
      ...options?.refreshConfig,
    };

    this.turnCount = 0;
    this.refreshCount = 0;
    this.lastRefreshAt = 0;
    this.sessionStartedAt = 0;
    this.active = false;
    this.lastVisionInjectionTurn = -1;
  }

  /**
   * Called at session start — inject prior context.
   * AD-2: Before first task in runLoop().
   */
  async onSessionStart(
    projectId: string,
    sessionId: string,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): Promise<string> {
    this.projectId = projectId;
    this.sessionId = sessionId;
    this.turnCount = 0;
    this.refreshCount = 0;
    this.sessionStartedAt = Date.now();
    this.lastRefreshAt = Date.now();
    this.active = true;

    const payload = await this.injector.injectAtSessionStart(
      projectId, sessionId, currentGoal, currentTags, currentStage,
    );

    // Record retention metrics
    const result = this.injector.getInjectionResult();
    if (result) {
      this.tracker.recordInjection(sessionId, projectId, result);
    }

    return payload;
  }

  /**
   * Called at session end — extract context and record metrics.
   * AD-3: Extracts remaining context from final session state.
   */
  async onSessionEnd(
    subtaskResults?: Array<{ agent: string; success: boolean; output: string }>,
    tags?: string[],
    sdlcStage?: string,
  ): Promise<void> {
    if (!this.active || !this.projectId || !this.sessionId) return;

    // Extract context from session results if available
    if (subtaskResults && subtaskResults.length > 0) {
      const extractor = new SessionContextExtractor();
      const contexts = extractor.extractFromGoalResult(
        `goal-${this.sessionId}`,
        this.projectId,
        this.sessionId,
        subtaskResults.map((r) => ({
          subtaskId: `subtask-${r.agent}`,
          agent: r.agent,
          success: r.success,
          output: r.output,
          durationMs: 0,
          estimatedCostUsd: 0,
        })),
        tags,
        sdlcStage,
      );

      if (contexts.length > 0) {
        await this.store.saveBatch(contexts);
      }
    }

    // Finalize retention metrics
    this.tracker.recordSessionEnd();

    this.active = false;
  }

  /**
   * Check if mid-session refresh should trigger.
   * AD-4: Every 30 turns OR 30 min, whichever comes first.
   */
  shouldRefresh(): boolean {
    if (!this.active) return false;

    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastRefreshAt;

    // Minimum interval guard
    if (timeSinceLastRefresh < this.refreshConfig.minRefreshIntervalMs) {
      return false;
    }

    // Turn-based trigger
    if (this.turnCount > 0 && this.turnCount % this.refreshConfig.turnInterval === 0) {
      return true;
    }

    // Time-based trigger
    if (timeSinceLastRefresh >= this.refreshConfig.timeIntervalMs) {
      return true;
    }

    return false;
  }

  /**
   * Perform mid-session context refresh.
   * CTO F3: Only swap if composite improvement ≥ swapThreshold (0.1).
   */
  async refreshContext(
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): Promise<boolean> {
    if (!this.active || !this.projectId) return false;

    // Get fresh selection
    const newResult = await this.selector.selectForSession(
      this.projectId, currentGoal, currentTags, currentStage,
    );

    // Compare with current injection
    const currentResult = this.injector.getInjectionResult();
    if (!currentResult) {
      // No prior injection — inject now
      this.injector.updateInjectedContext(newResult.selected, newResult);
      this.tracker.recordRefresh(newResult);
      this.refreshCount += 1;
      this.lastRefreshAt = Date.now();
      return true;
    }

    // CTO F3: Check if improvement exceeds swap threshold
    const currentAvgScore = this.averageComposite(currentResult.selected);
    const newAvgScore = this.averageComposite(newResult.selected);

    if (newAvgScore - currentAvgScore >= this.refreshConfig.swapThreshold) {
      this.injector.updateInjectedContext(newResult.selected, newResult);
      this.tracker.recordRefresh(newResult);
      this.refreshCount += 1;
      this.lastRefreshAt = Date.now();
      return true;
    }

    // No swap — improvement below threshold
    this.lastRefreshAt = Date.now();
    return false;
  }

  /**
   * Increment turn count and trigger vision re-injection if due.
   * Call after each task/turn.
   *
   * Sprint 142 P0-1: Implements the aspirational "every 10 turns inject vision"
   * from CLAUDE.md. Previously undocumented as unimplemented (CTO Sprint 132 finding).
   */
  incrementTurn(): void {
    this.turnCount += 1;
    this.checkVisionReInjection();
  }

  /**
   * Sprint 142 P0-1 — Turn-based vision re-injection.
   *
   * Every 10 turns: inject sprint goals summary (compact).
   * Every 20 turns: inject full sprint goals + project vision.
   *
   * CTO C2 dedup guard: `lastVisionInjectionTurn` prevents double-injection
   * when turn-based trigger overlaps with 30-min time-based refresh.
   *
   * Returns the injected content (for testing/logging), or null if no injection.
   */
  checkVisionReInjection(): string | null {
    if (!this.active || this.turnCount === 0) return null;

    // Dedup guard (CTO C2): skip if already injected this turn
    if (this.lastVisionInjectionTurn >= this.turnCount) return null;

    const isFullInjection = this.turnCount % 20 === 0;
    const isSummaryInjection = this.turnCount % 10 === 0;

    if (!isFullInjection && !isSummaryInjection) return null;

    this.lastVisionInjectionTurn = this.turnCount;

    // Emit vision content — caller (autonomous manager) reads this
    // and injects into the next task's context.
    if (isFullInjection) {
      return `[Vision Re-Injection: Turn ${this.turnCount}] Full sprint goals + project vision due.`;
    }
    return `[Vision Re-Injection: Turn ${this.turnCount}] Sprint goals summary due.`;
  }

  /**
   * Get the last vision injection content for the current turn.
   * Called by autonomous session manager to inject into next prompt.
   */
  getVisionInjection(): string | null {
    if (this.lastVisionInjectionTurn !== this.turnCount) return null;

    const isFullInjection = this.turnCount % 20 === 0;
    if (isFullInjection) {
      return `[Vision Re-Injection: Turn ${this.turnCount}] Full sprint goals + project vision due.`;
    }
    if (this.turnCount % 10 === 0) {
      return `[Vision Re-Injection: Turn ${this.turnCount}] Sprint goals summary due.`;
    }
    return null;
  }

  /**
   * Get lifecycle status.
   */
  getStatus(): LifecycleStatus {
    return {
      injected: this.injector.isInjected(),
      injectedContextCount: this.injector.getInjectedContextIds().length,
      injectedTokens: this.injector.getInjectionResult()?.totalTokens ?? 0,
      retentionRate: this.tracker.getSessionMetrics()?.retentionRate ?? 0,
      refreshCount: this.refreshCount,
      lastRefreshAt: this.lastRefreshAt > 0 ? new Date(this.lastRefreshAt).toISOString() : undefined,
      turnCount: this.turnCount,
      sessionStartedAt: this.sessionStartedAt > 0 ? new Date(this.sessionStartedAt).toISOString() : undefined,
    };
  }

  /**
   * Build checkpoint state.
   * CTO F1: Stored in ExecutionContext.partialResults["contextTransfer"].
   */
  buildCheckpointState(): ContextCheckpointState {
    return this.injector.buildCheckpointState(
      this.turnCount,
      this.refreshCount,
      this.lastRefreshAt > 0 ? new Date(this.lastRefreshAt).toISOString() : new Date().toISOString(),
    );
  }

  /**
   * Restore from checkpoint state.
   */
  restoreFromCheckpoint(state: ContextCheckpointState, sessionId: string): void {
    this.injector.restoreFromCheckpoint(state, sessionId);
    this.turnCount = state.turnCount;
    this.refreshCount = state.refreshCount;
    this.lastRefreshAt = new Date(state.lastRefreshAt).getTime();
    this.sessionId = sessionId;
    this.active = true;
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private averageComposite(contexts: TransferableContext[]): number {
    if (contexts.length === 0) return 0;
    const sum = contexts.reduce((s, c) => s + c.quality.composite, 0);
    return sum / contexts.length;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLifecycle: ContextLifecycleManager | undefined;

export function getContextLifecycleManager(): ContextLifecycleManager {
  if (!globalLifecycle) {
    globalLifecycle = new ContextLifecycleManager();
  }
  return globalLifecycle;
}

export function resetContextLifecycleManager(): void {
  globalLifecycle = undefined;
}
