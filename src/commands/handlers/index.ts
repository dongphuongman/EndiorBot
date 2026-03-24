/**
 * Handlers barrel — re-exports all command handlers from domain-specific modules.
 *
 * @module commands/handlers/index
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 */

// ============================================================================
// Shared utilities
// ============================================================================
export { sanitizeForEcho, TEAM_ICONS } from "./shared.js";

// ============================================================================
// SDLC Commands
// ============================================================================
export {
  handleGateCommand,
  handleComplianceCommand,
  executeFixCommand,
  handleFixCommand,
  handleConsultCommand,
  handleInitCommand,
  executeInitCommand,
} from "./sdlc-commands.js";

export type {
  ExecuteInitOptions,
  ExecuteInitResult,
} from "./sdlc-commands.js";

// ============================================================================
// Bridge Commands
// ============================================================================
export {
  handleLinkCommand,
  getLinkedActorId,
  handleLaunchCommand,
  handleComplexityGateCallback,
  handleSessionsCommand,
  handleSwitchCommand,
  handleModeCommand,
  handleWebhookCommand,
  activeSessionMap,
  pendingTeamLaunches,
  pendingTeamTimeouts,
  TEAM_GATE_TIMEOUT_MS,
} from "./bridge-commands.js";

// ============================================================================
// OTT Commands
// ============================================================================
export {
  handleAgentsCommand,
  handleTeamsCommand,
  handleConfigCommand,
  handleCaptureCommand,
  handleKillCommand,
  handleSendCommand,
  handleCostCommand,
  generateHelpMessage,
  runEvaluation,
} from "./ott-commands.js";

// ============================================================================
// Team Commands
// ============================================================================
export {
  handleTeamStatusCommand,
  handleKillTeamCommand,
  handleTeamCostCallback,
  costThresholdOverrides,
} from "./team-commands.js";

// ============================================================================
// Eval Commands
// ============================================================================
export { handleEvalCommand } from "./eval-commands.js";

// ============================================================================
// Permission Formatters
// ============================================================================
export {
  formatPermissionMessage,
  formatPermissionDecisionMessage,
  formatPermissionTimeoutMessage,
} from "./permission-formatters.js";

// ============================================================================
// Type re-exports
// ============================================================================
export type { CommandResult } from "../command-dispatcher.js";
