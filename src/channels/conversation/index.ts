/**
 * Conversation Module
 *
 * Intent parsing and action handling for CEO messages.
 *
 * @module channels/conversation
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 6-7
 */

// Intents
export type {
  Intent,
  ParsedIntent,
  IntentParams,
} from "./intents.js";

export {
  parseIntent,
  requiresApprovalId,
  isActionableIntent,
  getIntentDescription,
} from "./intents.js";

// Actions
export type {
  ActionResult,
  ActionContext,
  ActionHandler,
} from "./actions.js";

export {
  executeAction,
  getActionHandler,
} from "./actions.js";

// Message Handler
export type {
  MessageHandlerConfig,
  ErrorStore,
  HandleResult,
} from "./message-handler.js";

export {
  ConversationMessageHandler,
  SimpleErrorStore,
  createMessageHandler,
  getMessageHandler,
  resetMessageHandler,
  configureMessageHandler,
} from "./message-handler.js";
