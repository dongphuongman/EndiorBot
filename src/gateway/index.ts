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
