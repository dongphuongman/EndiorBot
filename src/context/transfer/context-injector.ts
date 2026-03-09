/**
 * Context Injector — Sprint 97
 *
 * Injects prior session context at session start.
 * Uses ContextSelector.selectForSession() → buildInjectionPayload().
 * Tracks injection state for checkpoint/restore.
 *
 * CTO F2: Retention = selectedTokens / gatedTokens (not total available).
 * AD-2: Inject before first task in AutonomousSessionManager.runLoop().
 *
 * @module context/transfer/context-injector
 * @version 1.0.0
 * @sprint 97
 */

import type {
  ContextSelectionResult,
  TransferableContext,
  ContextCheckpointState,
} from "./types.js";
import {
  ContextSelector,
  getContextSelector,
} from "./context-selector.js";

// ============================================================================
// ContextInjector
// ============================================================================

export interface ContextInjectorOptions {
  selector?: ContextSelector;
}

export class ContextInjector {
  private readonly selector: ContextSelector;
  private injected: boolean;
  private lastResult: ContextSelectionResult | undefined;
  private injectedContextIds: string[];
  private sessionId: string | undefined;

  constructor(options?: ContextInjectorOptions) {
    this.selector = options?.selector ?? getContextSelector();
    this.injected = false;
    this.injectedContextIds = [];
  }

  /**
   * Inject prior session context at session start.
   *
   * Returns the formatted injection payload (markdown) ready to prepend
   * to session context. Returns empty string if no prior context exists
   * or if injection was already performed for this session.
   */
  async injectAtSessionStart(
    projectId: string,
    sessionId: string,
    currentGoal?: string,
    currentTags?: string[],
    currentStage?: string,
  ): Promise<string> {
    // Prevent double injection in same session
    if (this.injected && this.sessionId === sessionId) {
      return "";
    }

    const result = await this.selector.selectForSession(
      projectId,
      currentGoal,
      currentTags,
      currentStage,
    );

    this.lastResult = result;
    this.sessionId = sessionId;
    this.injected = true;
    this.injectedContextIds = result.selected.map((c) => c.id);

    if (result.selected.length === 0) {
      return "";
    }

    return this.selector.buildInjectionPayload(result.selected);
  }

  /**
   * Get IDs of currently injected contexts.
   */
  getInjectedContextIds(): string[] {
    return [...this.injectedContextIds];
  }

  /**
   * Get the full selection result from last injection.
   */
  getInjectionResult(): ContextSelectionResult | undefined {
    return this.lastResult;
  }

  /**
   * Whether injection has been performed for the current session.
   */
  isInjected(): boolean {
    return this.injected;
  }

  /**
   * Update injected context (used by mid-session refresh).
   */
  updateInjectedContext(selected: TransferableContext[], result: ContextSelectionResult): void {
    this.lastResult = result;
    this.injectedContextIds = selected.map((c) => c.id);
  }

  /**
   * Build checkpoint state for persistence.
   * CTO F1: Stored in ExecutionContext.partialResults["contextTransfer"].
   */
  buildCheckpointState(turnCount: number, refreshCount: number, lastRefreshAt: string): ContextCheckpointState {
    return {
      injectedContextIds: [...this.injectedContextIds],
      injectedTokens: this.lastResult?.totalTokens ?? 0,
      retentionRate: this.lastResult?.retentionRate ?? 0,
      refreshCount,
      lastRefreshAt,
      turnCount,
    };
  }

  /**
   * Restore from checkpoint state.
   */
  restoreFromCheckpoint(state: ContextCheckpointState, sessionId: string): void {
    this.injectedContextIds = [...state.injectedContextIds];
    this.injected = state.injectedContextIds.length > 0;
    this.sessionId = sessionId;
    // lastResult will be rebuilt by lifecycle manager if needed
  }

  /**
   * Reset state for next session.
   */
  cleanup(): void {
    this.injected = false;
    this.lastResult = undefined;
    this.injectedContextIds = [];
    this.sessionId = undefined;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalInjector: ContextInjector | undefined;

export function getContextInjector(): ContextInjector {
  if (!globalInjector) {
    globalInjector = new ContextInjector();
  }
  return globalInjector;
}

export function resetContextInjector(): void {
  globalInjector = undefined;
}
