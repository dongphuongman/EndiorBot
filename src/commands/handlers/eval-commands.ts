/**
 * Eval Command Handlers
 *
 * Handler for /eval command — evaluate agent output quality.
 *
 * @module commands/handlers/eval-commands
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-025 Sprint 88 Post-turn evaluation
 */

import { getSessionRegistry } from "../../bridge/session-registry.js";

import type { CommandResult } from "../command-dispatcher.js";
import { sanitizeForEcho } from "./shared.js";
import { runEvaluation, getTurnCount } from "./ott-commands.js";

export type { CommandResult } from "../command-dispatcher.js";

// ============================================================================
// Eval Command
// ============================================================================

/**
 * Handle /eval command — evaluate output from an agent session.
 *
 * Usage: /eval <sessionId>
 *
 * Captures tmux output, runs 5-signal vibecoding analysis,
 * stores evaluation, and returns formatted score card.
 *
 * @authority ADR-025 Sprint 88
 */
export async function handleEvalCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  const sessionId = args[0];
  if (!sessionId) {
    return {
      success: false,
      response: `Usage: /eval <sessionId>\n\nEvaluate agent output quality (5-signal vibecoding index).\nUse /sessions to list active sessions.`,
    };
  }

  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session || session.status !== "active") {
    return {
      success: false,
      response: `Session not found or inactive: \`${sanitizeForEcho(sessionId.slice(0, 40))}\`\n\nUse /sessions to list active sessions.`,
    };
  }

  try {
    const turnNumber = getTurnCount(session.id) || 1;
    const summary = await runEvaluation(
      session.id,
      session.tmuxTarget,
      session.riskMode,
      turnNumber,
      actorId,
      session.agentType,
    );

    if (!summary) {
      return {
        success: false,
        response: `No evaluatable output captured from session \`${session.id}\`.\n\nThe agent may not have produced enough output yet.`,
      };
    }

    return {
      success: true,
      response: `📊 *Evaluation* — \`${session.id}\`\n\n${summary}`,
    };
  } catch (err) {
    return {
      success: false,
      response: `Evaluation failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
