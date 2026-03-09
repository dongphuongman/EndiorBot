/**
 * Gateway Module Exports
 *
 * WebSocket gateway for real-time Desktop ↔ CLI communication.
 *
 * @module gateway
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 */

// Types
export * from "./types.js";

// Protocol
export * from "./protocol/index.js";

// Configuration
export {
  GatewayEnvVars,
  loadGatewayConfigFromEnv,
  loadGatewayConfigFromObject,
  resolveGatewayConfig,
  validateGatewayConfig,
  getConfigSummary,
  type ConfigValidationResult,
} from "./config.js";

// Server
export { GatewayServer, createGatewayServer } from "./server.js";

// Web Server (HTTP + WebSocket hybrid for browser interface)
export { WebGatewayServer, createWebGatewayServer } from "./web-server.js";

// Authentication
export {
  GatewayAuthManager,
  RateLimiter,
  isLocalhostAddress,
  createAuthManager,
  createRateLimiter,
  type TokenPayload,
  type TokenValidationResult,
  type AuthConfig,
} from "./auth.js";

// Events
export {
  setGatewayServer,
  getGatewayServer,
  hasGatewayServer,
  emitEvent,
  recordCostWithEvents,
  resetBudgetWarnings,
  resetAllBudgetWarnings,
  createApprovalRequestWithEvents,
  emitApprovalResolved,
  emitSessionStarted,
  emitSessionEnded,
  emitAgentStatus,
  emitGateStatus,
  emitNotification,
  clearEventState,
} from "./events.js";

// Methods
export * from "./methods/index.js";

// Ingress (Sprint 93 — single entry point for OTT adapters)
export {
  GatewayIngress,
  type InboundMessage,
  type InboundResponse,
} from "./ingress.js";

// Chat Handler (Sprint 54 - 3-Model Consultation)
export {
  ChatHandler,
  getChatHandler,
  resetChatHandler,
  classifyTask,
  routeTask,
  type ChatTaskType,
  type ChatHandlerRequest,
  type ChatHandlerResponse,
  type ConsolidatedResponse,
  type ModelSelection,
} from "./chat-handler.js";
