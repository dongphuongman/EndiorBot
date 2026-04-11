/**
 * Agent Intelligence Module — barrel index
 *
 * @module agents/intelligence
 * @sprint 121
 */

export {
  classifyPatchIntent,
  type PatchIntent,
  type PatchIntentResult,
} from "./patch-intent-classifier.js";

export {
  getWorkspaceContext,
  formatWorkspaceContext,
  clearWorkspaceContextCache,
  type WorkspaceContext,
} from "./workspace-context.js";

export {
  MAX_PATCH_FILES,
  MAX_PATCH_OPERATIONS,
  MAX_PATCH_BUDGET_USD,
  PATCH_TIMEOUT_MS,
  PATCH_CONFIRMATION_TTL_MS,
  PATCH_SCOPE_SYSTEM_PROMPT,
} from "./patch-budget.js";

export {
  applyActiveMemoryHook,
  fetchActiveMemoryContext,
  fetchWithCircuitBreaker,
  getFromCache,
  setCache,
  clearCache,
  estimateTokens,
  getBreakerState,
  resetBreaker,
  buildActiveMemoryConfig,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_INJECT_TOKENS,
  DEFAULT_QUERY_MODE,
  type ActiveMemoryConfig,
  type SessionLike,
  type ConversationTurn,
  type CircuitBreakerState,
} from "./active-memory.js";
