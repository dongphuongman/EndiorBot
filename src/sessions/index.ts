/**
 * Sessions Module
 *
 * Session and project context management.
 */

// Types
export type {
  GateId,
  GateStatus,
  GitState,
  ProjectContext,
  ProjectTier,
  SDLCConfig,
  SDLCStage,
  Session,
  SessionEvent,
  SessionEventListener,
  SessionEventType,
  SessionStore,
  SessionSummary,
} from "./types.js";

export { COMPACTION_THRESHOLD, TOKEN_BUDGETS } from "./types.js";

// Token Counter
export { getTokenCounter, TokenCounter } from "./token-counter.js";

// Session Store
export { FileSessionStore, getSessionStore } from "./session-store.js";

// Session Manager
export {
  getSessionManager,
  resetSessionManager,
  SessionManager,
} from "./session-manager.js";
