/**
 * Metrics Module
 *
 * Agent Effectiveness Rating (AER) metrics calculation.
 *
 * @module metrics
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72
 * @sprint 72
 */

// Types
export type {
  AERMetrics,
  AEREventLogEntry,
  AEREventType,
  AERRetrievalLogEntry,
  AERCalculatorConfig,
  AERResult,
  AERTargets,
  AERMetricStatus,
  ModelUsageBreakdown,
  ModelTierUsage,
  ModelPricing,
} from "./types.js";

// Constants
export {
  DEFAULT_AER_CONFIG,
  DEFAULT_AER_TARGETS,
  MODEL_PRICING,
} from "./types.js";

// Functions
export {
  createEmptyMetrics,
  calculateModelCost,
  getModelTier,
  checkAERPass,
  isAERPassing,
} from "./types.js";

// AER Calculator
export {
  AERCalculator,
  getAERCalculator,
  resetAERCalculator,
  createAERCalculator,
} from "./aer-calculator.js";
