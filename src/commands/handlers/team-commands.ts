/**
 * Team Command Handlers
 *
 * Handlers for team monitoring commands: /team-status, /kill-team,
 * and the team cost threshold callback.
 *
 * @module commands/handlers/team-commands
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-026 Team Monitoring + ADR-030 Unified Commands
 */

import { getAgentLauncher } from "../../bridge/agent-launcher.js";
import { getSessionRegistry } from "../../bridge/session-registry.js";
import { getTmuxBridge } from "../../bridge/tmux/tmux-bridge.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import { getBridgePolicyManager } from "../../bridge/security/bridge-policy.js";
import { getFeatureFlagWithEnvOverride } from "../../config/feature-flags.js";
import { getTeamStatus, getTeamSessions, formatTeamDashboard } from "../../bridge/teams/team-monitor.js";
import { createPricingRegistry } from "../../budget/pricing-registry.js";
import { createTeamCostKeyboard } from "../../channels/telegram/keyboards.js";

import type { CommandResult } from "../command-dispatcher.js";
import { sanitizeForEcho } from "./shared.js";
import { activeSessionMap } from "./bridge-commands.js";

export type { CommandResult } from "../command-dispatcher.js";

// ============================================================================
// Cost Threshold Overrides
// ============================================================================

/** In-memory cost threshold overrides (teamId → adjusted threshold USD). */
export const costThresholdOverrides = new Map<string, number>();

// ============================================================================
// Team Status Command
// ============================================================================

/**
 * Handle /team-status command — show team dashboard with health + cost.
 */
export async function handleTeamStatusCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /team-status <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /sessions to check." };
  }

  const tmux = getTmuxBridge();
  const policy = getBridgePolicyManager().getPolicy();
  const pricingRegistry = createPricingRegistry();
  const override = costThresholdOverrides.get(session.teamId);

  const deps: import("../../bridge/teams/team-monitor.js").TeamStatusDeps = {
    registry,
    tmux,
    policy,
    pricingRegistry,
  };
  if (override !== undefined) deps.thresholdOverride = override;

  const status = await getTeamStatus(session.teamId, deps);

  const dashboard = formatTeamDashboard(status);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_status_checked",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId: session.teamId,
      memberCount: status.members.length,
      totalCostUsd: status.totalCostUsd,
      thresholdExceeded: status.thresholdExceeded,
    },
  });

  // If threshold exceeded, include cost keyboard
  const result: CommandResult = { success: true, response: dashboard };
  if (status.thresholdExceeded) {
    result.replyMarkup = createTeamCostKeyboard(session.teamId);
  }
  return result;
}

// ============================================================================
// Kill Team Command
// ============================================================================

/**
 * Handle /kill-team command — kill all sessions in a team.
 */
export async function handleKillTeamCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /kill-team <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /kill for solo sessions." };
  }

  const teamId = session.teamId;
  const teamSessions = getTeamSessions(teamId, registry);

  if (teamSessions.length === 0) {
    return { success: true, response: `Team ${teamId}-team already stopped.` };
  }

  const launcher = getAgentLauncher();
  const killedIds: string[] = [];

  for (const ts of teamSessions) {
    const killResult = await launcher.kill(ts.id, actorId);
    if (killResult.success) {
      killedIds.push(ts.id);
    }
    // Clear from active session if it was the current one
    if (activeSessionMap.get(actorId) === ts.id) {
      activeSessionMap.delete(actorId);
    }
  }

  // Clear cost override for this team
  costThresholdOverrides.delete(teamId);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_killed",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId,
      memberCount: killedIds.length,
      sessionIds: killedIds,
    },
  });

  return {
    success: true,
    response: `💀 Team ${teamId}-team killed (${killedIds.length} members stopped).`,
  };
}

// ============================================================================
// Team Cost Callback
// ============================================================================

/**
 * Handle team cost threshold callback (Sprint 91).
 *
 * action: "extend" → add $2 to cost override
 * action: "stop" → kill team
 */
export async function handleTeamCostCallback(
  action: string,
  teamId: string,
  actorId: string,
): Promise<CommandResult> {
  const audit = getBridgeAuditLogger();

  if (action === "extend") {
    const policy = getBridgePolicyManager().getPolicy();
    const current = costThresholdOverrides.get(teamId) ?? policy.teamCostThresholdUsd;
    const newThreshold = current + 2.0;
    costThresholdOverrides.set(teamId, newThreshold);

    audit.log({
      event: "team_cost_extended",
      actorId,
      actor: "telegram",
      details: { teamId, previousThreshold: current, newThreshold },
    });

    return {
      success: true,
      response: `✅ Cost limit extended to $${newThreshold.toFixed(2)} for ${teamId}-team.`,
    };
  }

  if (action === "stop") {
    // Find any active session for this team to get a sessionId
    const registry = getSessionRegistry();
    const teamSessions = getTeamSessions(teamId, registry);
    if (teamSessions.length === 0) {
      return { success: true, response: `Team ${teamId}-team already stopped.` };
    }
    return handleKillTeamCommand([teamSessions[0]!.id], actorId);
  }

  return { success: false, response: `Unknown cost action: ${action}` };
}
