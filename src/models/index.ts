/**
 * Models Module
 *
 * Model tiering and budget management for autonomous sessions.
 *
 * @module models
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.3-T12.4
 * @sprint 72
 */

// Types
export type {
  ModelConfig,
  BudgetConfig,
  BudgetState,
  TierSpending,
  BudgetEvent,
  BudgetEventType,
  ModelSelectionResult,
  ModelSelectionReason,
  ModelCallRecord,
  BudgetCheckResult,
  TaskType,
} from "./types.js";

// Enums
export { ModelTier } from "./types.js";

// Constants
export {
  MODEL_CONFIGS,
  DEFAULT_BUDGET_CONFIG,
} from "./types.js";

// Functions
export {
  getModelConfig,
  getModelConfigById,
  createInitialBudgetState,
} from "./types.js";

// Model Selector
export type { ModelSelectorConfig } from "./model-selector.js";
export {
  ModelSelector,
  DEFAULT_MODEL_SELECTOR_CONFIG,
  getModelSelector,
  setModelSelector,
  resetModelSelector,
  createModelSelector,
} from "./model-selector.js";

// Session Budget
export type { BudgetEventListener } from "./session-budget.js";
export {
  SessionBudget,
  getSessionBudget,
  setSessionBudget,
  resetSessionBudget,
  createSessionBudget,
} from "./session-budget.js";
