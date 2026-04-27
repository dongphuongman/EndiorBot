/**
 * Gateway Methods Index
 *
 * Exports and registration for all gateway methods.
 *
 * @module gateway/methods
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 3
 */

import type { GatewayServer } from "../server.js";
import type { CommandDispatcher } from "../../commands/command-dispatcher.js";
import type { ChannelRouter } from "../../agents/channel-router.js";
import type { GatewayIngress } from "../ingress.js";

// Registration functions
import { registerSessionMethods } from "./sessions.js";
import { registerBudgetMethods } from "./budget.js";
import { registerApprovalMethods } from "./approval.js";
import { registerCheckpointMethods } from "./checkpoints.js";
import { registerAgentMethods } from "./agents.js";
import { registerChatMethods } from "./chat.js";

// Sprint 93: Bridge commands + Router chat
import { registerBridgeCommandMethods } from "./bridge-commands.js";
import { registerRouterChatMethods } from "./router-chat.js";
export { registerBridgeCommandMethods, getBridgeCommandCount } from "./bridge-commands.js";
export { registerRouterChatMethods } from "./router-chat.js";
import { registerEvalMethods } from "./eval.js";
import { registerOptimizerMethods } from "./optimizer.js";
import { registerToolsMethods } from "./tools.js";

// ============================================================================
// Type Exports (with gateway prefix to avoid conflicts)
// ============================================================================

// Session types
export type { SessionInfo } from "./sessions.js";

// Budget types
export type { BudgetStatus, BudgetHistoryEntry } from "./budget.js";

// Approval types (renamed to avoid conflict with sessions/checkpoint ApprovalRequest)
export type {
  ApprovalRequest as GatewayApprovalRequest,
  ApprovalType as GatewayApprovalType,
  ApprovalStatus as GatewayApprovalStatus,
} from "./approval.js";

// Checkpoint types (renamed to avoid potential conflicts)
export type { CheckpointInfo as GatewayCheckpointInfo } from "./checkpoints.js";

// Agent types
export type {
  AgentInfo,
  AgentType,
  AgentStatus,
  RoutingDecision,
  ConsultationResult,
} from "./agents.js";

// Chat types
export type {
  ChatSendParams,
  ChatSendResult,
  ChatStreamParams,
  ChatStreamResult,
  ChatChunkData,
  ChatDoneData,
  ChatErrorData,
} from "./chat.js";

// Eval types (Sprint 48)
export type {
  EvalScoreParams,
  EvalScoreResult,
  EvalHistoryParams,
  EvalHistoryResult,
  EvalCompareParams,
  EvalCompareResult,
} from "./eval.js";

// Optimizer types (Sprint 48)
export type {
  OptimizerStatus,
  OptimizerMetrics,
  OptimizerStatusResult,
  OptimizerResetResult,
} from "./optimizer.js";

// Tools types (Sprint 50)
export type {
  ToolsDiscoverParams,
  ToolsDiscoverResult,
  ToolsExecuteParams,
  ToolsExecuteResult,
  ToolsApproveParams,
  ToolsApproveResult,
  ToolsCancelParams,
  ToolsCancelResult,
  ToolsStatusParams,
  ToolsStatusResult,
  ToolsConnectionsParams,
  ToolsConnectionsResult,
  ToolsDryRunParams,
  ToolsDryRunResult,
  ToolsInitOAuthParams,
  ToolsInitOAuthResult,
  ToolsHandleCallbackParams,
  ToolsHandleCallbackResult,
} from "./tools.js";

// ============================================================================
// Function Exports
// ============================================================================

// Session methods
export {
  registerSessionMethods,
  addTestSession,
  clearSessions,
  getSessionsMap,
} from "./sessions.js";

// Budget methods
export {
  registerBudgetMethods,
  recordCost,
  resetBudgetState,
  getBudgetState,
} from "./budget.js";

// Approval methods (with renamed function to avoid conflict)
export {
  registerApprovalMethods,
  createApprovalRequest as createGatewayApprovalRequest,
  waitForApproval,
  clearApprovalQueue,
  getApprovalQueue,
} from "./approval.js";

// Checkpoint methods
export {
  registerCheckpointMethods,
  storeCheckpoint,
  updateCheckpoint,
  clearCheckpoints,
  getCheckpointsMap,
  addTestCheckpoint,
} from "./checkpoints.js";

// Agent methods
export {
  registerAgentMethods,
  registerAgent,
  updateAgentStatus,
  removeAgent,
  clearAgents,
  getAgentsMap,
} from "./agents.js";

// Chat methods
export {
  registerChatMethods,
  clearActiveStreams,
  getActiveStreamsCount,
  resetServerRef,
} from "./chat.js";

// Eval methods (Sprint 48)
export {
  registerEvalMethods,
  clearEvalHistory,
  getEvaluator,
} from "./eval.js";

// Optimizer methods (Sprint 48)
export {
  registerOptimizerMethods,
  getLoop,
  startLoop,
  stopLoop,
  pauseLoop,
  resumeLoop,
} from "./optimizer.js";

// Tools methods (Sprint 50)
export {
  registerToolsMethods,
  getControlPlane,
  setControlPlane,
  resetToolsState,
} from "./tools.js";

// ============================================================================
// Aggregate Registration
// ============================================================================

/**
 * Options for registering all gateway methods.
 *
 * Sprint 93: `dispatcher` and `router` are optional so callers that do not
 * have those dependencies (e.g. the standalone `gateway start` command) can
 * still call this function without wiring bridge-command or router.chat
 * methods.  When provided, `registerBridgeCommandMethods` and
 * `registerRouterChatMethods` are called inside this function so Desktop Chat
 * reaches the 39 dispatcher commands and the router.chat endpoint via WebSocket.
 */
export interface RegisterAllMethodsOptions {
  /** CommandDispatcher — required to enable cmd.* bridge methods. */
  dispatcher?: CommandDispatcher;
  /** ChannelRouter — required to enable router.chat and router.status methods. */
  router?: ChannelRouter;
  /** GatewayIngress — optional; improves router.chat pipeline when provided. */
  ingress?: GatewayIngress;
}

/**
 * Register all gateway methods with the server.
 *
 * Pass `options.dispatcher` and `options.router` to also register the Sprint 93
 * bridge-command methods (`cmd.*`) and the router-chat method (`router.chat`).
 */
export function registerAllMethods(
  server: GatewayServer,
  options: RegisterAllMethodsOptions = {},
): void {
  registerSessionMethods(server);
  registerBudgetMethods(server);
  registerApprovalMethods(server);
  registerCheckpointMethods(server);
  registerAgentMethods(server);
  registerChatMethods(server);
  registerEvalMethods(server);
  registerOptimizerMethods(server);
  registerToolsMethods(server);

  // Sprint 93: Bridge commands (cmd.*) — requires CommandDispatcher
  if (options.dispatcher) {
    registerBridgeCommandMethods(server, options.dispatcher);
  }

  // Sprint 93/99: Router chat (router.chat, router.status) — requires ChannelRouter
  if (options.router) {
    registerRouterChatMethods(server, options.router, options.ingress);
  }
}

/**
 * Method count by module.
 */
export const METHOD_COUNTS = {
  sessions: 6,
  budget: 5,
  approval: 5,
  checkpoints: 6,
  agents: 5,
  chat: 4,         // chat.send, chat.stream, chat.abort, chat.history
  eval: 3,         // eval.score, eval.history, eval.compare (Sprint 48)
  optimizer: 2,    // optimizer.status, optimizer.reset (Sprint 48)
  tools: 9,        // tools.discover, tools.execute, tools.approve, tools.cancel, tools.status, tools.connections, tools.dryRun, tools.initOAuth, tools.handleCallback (Sprint 50)
  system: 4,       // Built into server (ping, version, stats, health)
  subscription: 2, // Built into server (subscribe, unsubscribe)
  auth: 1,         // Built into server (auth)
  total: 52,
} as const;
