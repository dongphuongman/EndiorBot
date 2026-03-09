/**
 * Session Context Extractor — Sprint 96
 *
 * Extracts transferable context from completed goals and sessions.
 * Uses SessionRelay.summarizeForHandoff() for content summarization.
 * Scores extracted context via ContextQualityScorer.
 *
 * @module context/transfer/session-context-extractor
 * @version 1.0.0
 * @sprint 96
 */

import { getTokenCounter } from "../../sessions/token-counter.js";
import { SessionRelay } from "../../autonomy/session-relay.js";
import type { SubtaskResult, SessionRelayContext } from "../../autonomy/types.js";
import type { TransferableContext, TransferContextType } from "./types.js";
import { DEFAULT_TRANSFER_CONFIG } from "./types.js";
import { ContextQualityScorer, getContextQualityScorer } from "./quality-scorer.js";

// ============================================================================
// Constants
// ============================================================================

/** Max tokens per individual extracted context */
const MAX_EXTRACT_TOKENS = 200;

let idCounter = 0;

function generateTransferId(): string {
  return `txfr-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

// ============================================================================
// SessionContextExtractor
// ============================================================================

export class SessionContextExtractor {
  private readonly relay: SessionRelay;
  private readonly scorer: ContextQualityScorer;
  private readonly tokenCounter: ReturnType<typeof getTokenCounter>;

  constructor(scorer?: ContextQualityScorer) {
    this.relay = new SessionRelay();
    this.scorer = scorer ?? getContextQualityScorer();
    this.tokenCounter = getTokenCounter();
  }

  /**
   * Extract transferable context from a completed multi-agent goal.
   */
  extractFromGoalResult(
    goalId: string,
    projectId: string,
    sessionId: string,
    subtaskResults: SubtaskResult[],
    tags?: string[],
    sdlcStage?: string,
  ): TransferableContext[] {
    const contexts: TransferableContext[] = [];

    // Extract individual agent results as task_output
    for (const result of subtaskResults) {
      if (!result.success || !result.output) continue;

      const summarized = this.relay.summarizeForHandoff(result.output, MAX_EXTRACT_TOKENS);
      const type: TransferContextType = this.classifyOutput(result);

      const params: Parameters<typeof this.buildContext>[0] = {
        projectId,
        sourceSessionId: sessionId,
        sourceGoalId: goalId,
        type,
        content: summarized,
        tags: tags ?? [],
        agentSource: result.agent,
        metadata: {
          provider: result.provider ?? "unknown",
          success: result.success,
          durationMs: result.durationMs,
          estimatedCostUsd: result.estimatedCostUsd,
        },
      };
      if (sdlcStage) params.sdlcStage = sdlcStage;

      const ctx = this.buildContext(params);

      contexts.push(ctx);
    }

    // Extract aggregate goal result
    if (subtaskResults.length > 1) {
      const successfulResults = subtaskResults.filter((r) => r.success);
      if (successfulResults.length > 0) {
        const combined = successfulResults
          .map((r) => `@${r.agent}: ${this.relay.summarizeForHandoff(r.output, 100)}`)
          .join("\n");

        const goalParams: Parameters<typeof this.buildContext>[0] = {
          projectId,
          sourceSessionId: sessionId,
          sourceGoalId: goalId,
          type: "goal_result",
          content: combined,
          tags: tags ?? [],
          metadata: {
            agents: successfulResults.map((r) => r.agent),
            totalDurationMs: subtaskResults.reduce((sum, r) => sum + r.durationMs, 0),
            totalCostUsd: subtaskResults.reduce((sum, r) => sum + r.estimatedCostUsd, 0),
            success: true,
          },
        };
        if (sdlcStage) goalParams.sdlcStage = sdlcStage;

        const goalCtx = this.buildContext(goalParams);

        contexts.push(goalCtx);
      }
    }

    return contexts;
  }

  /**
   * Extract transferable context from a SessionRelayContext.
   */
  extractFromRelay(
    relayCtx: SessionRelayContext,
    projectId: string,
    tags?: string[],
    sdlcStage?: string,
  ): TransferableContext[] {
    return this.extractFromGoalResult(
      relayCtx.goalId,
      projectId,
      relayCtx.sessionId,
      relayCtx.completedSubtasks,
      tags,
      sdlcStage,
    );
  }

  /**
   * Create a single scored transferable context from raw content.
   */
  summarizeAndScore(
    content: string,
    type: TransferContextType,
    projectId: string,
    sessionId: string,
    tags?: string[],
    sdlcStage?: string,
    metadata?: Record<string, unknown>,
  ): TransferableContext {
    const summarized = this.relay.summarizeForHandoff(content, MAX_EXTRACT_TOKENS);

    const params: Parameters<typeof this.buildContext>[0] = {
      projectId,
      sourceSessionId: sessionId,
      type,
      content: summarized,
      tags: tags ?? [],
      metadata: metadata ?? {},
    };
    if (sdlcStage) params.sdlcStage = sdlcStage;

    return this.buildContext(params);
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Classify a subtask result's output type.
   */
  private classifyOutput(result: SubtaskResult): TransferContextType {
    const agent = result.agent.toLowerCase();

    if (agent === "architect" || agent === "pm") return "architecture";
    if (agent === "reviewer" || agent === "tester") return "task_output";

    // Check content for decision patterns
    const output = result.output.toLowerCase();
    if (output.includes("decision:") || output.includes("decided to") || output.includes("choose")) {
      return "decision";
    }
    if (output.includes("error") || output.includes("fix") || output.includes("bug")) {
      return "error_pattern";
    }

    return "task_output";
  }

  /**
   * Build a TransferableContext with quality scoring.
   * Uses exactOptionalPropertyTypes pattern: build object first, then set optional fields.
   */
  private buildContext(params: {
    projectId: string;
    sourceSessionId: string;
    sourceGoalId?: string;
    type: TransferContextType;
    content: string;
    tags: string[];
    agentSource?: string;
    sdlcStage?: string;
    metadata: Record<string, unknown>;
  }): TransferableContext {
    const now = new Date();
    const expiresAt = this.getExpiryDate(params.type, now);

    const quality = this.scorer.score(
      {
        id: "",
        projectId: params.projectId,
        sourceSessionId: params.sourceSessionId,
        type: params.type,
        content: params.content,
        tokenCount: this.tokenCounter.count(params.content),
        quality: { relevance: 0, recency: 0, confidence: 0, completeness: 0, composite: 0 },
        tags: params.tags,
        createdAt: now.toISOString(),
        metadata: params.metadata,
      },
      undefined,
      params.tags,
      params.sdlcStage,
    );

    // Build with required fields first (exactOptionalPropertyTypes)
    const ctx: TransferableContext = {
      id: generateTransferId(),
      projectId: params.projectId,
      sourceSessionId: params.sourceSessionId,
      type: params.type,
      content: params.content,
      tokenCount: this.tokenCounter.count(params.content),
      quality,
      tags: params.tags,
      createdAt: now.toISOString(),
      metadata: params.metadata,
    };

    // Set optional fields conditionally
    if (params.sourceGoalId) ctx.sourceGoalId = params.sourceGoalId;
    if (params.agentSource) ctx.agentSource = params.agentSource;
    if (params.sdlcStage) ctx.sdlcStage = params.sdlcStage;
    if (expiresAt) ctx.expiresAt = expiresAt;

    return ctx;
  }

  /**
   * Calculate expiry date based on context type.
   */
  private getExpiryDate(type: TransferContextType, from: Date): string | undefined {
    const config = DEFAULT_TRANSFER_CONFIG;

    switch (type) {
      case "task_output":
      case "error_pattern":
        return new Date(from.getTime() + config.taskOutputExpiryMs).toISOString();
      case "decision":
      case "architecture":
      case "goal_result":
      case "blocker_resolution":
        return new Date(from.getTime() + config.decisionExpiryMs).toISOString();
    }
  }
}
