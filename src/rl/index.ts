/**
 * RL Feedback Capture — Sprint 110 (ADR-033)
 *
 * Barrel export for the RL module.
 *
 * @module rl
 * @sprint 110
 */

export type {
  FeedbackStatus,
  FeedbackLabel,
  RLTurn,
  RLSession,
  RLRecord,
  RLEventLogEntry,
} from "./types.js";

export type { RLStats } from "./observability.js";

export { RLSessionTracker, SESSION_IDLE_TIMEOUT_MS, SESSION_TIMEZONE, FEEDBACK_WINDOW_MS } from "./session-tracker.js";

export { RLDataStore, RLEventLog } from "./data-store.js";

export { RLFeedbackService } from "./feedback-service.js";
export type { AgentResponseParams } from "./feedback-service.js";

export { getPromptEnrichment, clearEnrichmentCache } from "./prompt-enrichment.js";
export type { PromptEnrichment } from "./prompt-enrichment.js";
