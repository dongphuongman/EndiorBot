/**
 * Budget Module
 *
 * Budget control and cost tracking for autonomous execution.
 * Based on ADR-007 Autonomous Execution Budget specification.
 *
 * @module budget
 * @version 1.1.0
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Task types
  TaskType,
  // Configuration
  LimitAction,
  NotificationConfig,
  CircuitBreakerConfig,
  EstimationConfig,
  BudgetConfig,
  // State
  SessionBudget,
  DailyBudget,
  TrackBudget,
  TokenUsageRecord,
  HistoricalData,
  BudgetState,
  // Cost estimation
  ConfidenceLevel,
  CostBreakdown,
  CostEstimate,
  TaskContext,
  // Actions
  BudgetActionType,
  BudgetAction,
  // Circuit breaker
  CircuitBreakerStatus,
  CircuitBreakerReason,
  TaskMetrics,
  CircuitBreakerResult,
  // Notifications
  NotificationType,
  NotificationPriority,
  Notification,
  // Pricing
  ModelPricing,
  // Events
  BudgetEventType,
  BudgetEvent,
} from "./types.js";

// ============================================================================
// Value Exports from types.ts
// ============================================================================

export {
  // Default configuration
  DEFAULT_BUDGET_CONFIG,
  // Factory functions
  createInitialBudgetState,
  createEmptyTaskMetrics,
  // Utility functions
  needsDailyReset,
  calculateBudgetPercentage,
  isAtWarningThreshold,
  isLimitReached,
} from "./types.js";

// ============================================================================
// Circuit Breaker Exports
// ============================================================================

export {
  // Classes
  CircuitBreaker,
  NotificationRateLimiter,
  // Factory functions
  createCircuitBreakers,
  createCircuitBreaker,
  // Constants
  DEFAULT_THRESHOLDS,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_MAX_NOTIFICATIONS_PER_HOUR,
} from "./circuit-breaker.js";

export type {
  // Types
  ThresholdLevel,
  CircuitBreakerAction,
  ThresholdEvaluation,
  CircuitBreakerState,
} from "./circuit-breaker.js";

// ============================================================================
// Budget Tracker Exports
// ============================================================================

export {
  // Classes
  BudgetTracker,
  // Factory functions
  createBudgetTracker,
  getBudgetStatus,
  estimateCost,
} from "./budget-tracker.js";

export type {
  // Types
  BudgetScope,
  BudgetStatus,
} from "./budget-tracker.js";

// ============================================================================
// Pricing Registry Exports
// ============================================================================

export {
  // Classes
  PricingRegistry,
  // Factory functions
  createPricingRegistry,
  getDefaultModelPricing,
  // Constants
  DEFAULT_PRICING_CONFIG,
  DEFAULT_PRICING_PATH,
} from "./pricing-registry.js";

export type {
  // Types
  PricingConfig,
  ModelPricingEntry,
} from "./pricing-registry.js";

// ============================================================================
// Cost Estimator Exports
// ============================================================================

export {
  // Classes
  CostEstimator,
  // Factory functions
  createCostEstimator,
  quickEstimate,
  // Constants
  BASE_OUTPUT_ESTIMATES,
  DEFAULT_ESTIMATOR_CONFIG,
} from "./cost-estimator.js";

export type {
  // Types
  CostEstimatorConfig,
  TokenEstimate,
  ConfidenceResult,
  ConfidenceFactor,
} from "./cost-estimator.js";

// ============================================================================
// Checkpoint Integration Exports
// ============================================================================

export {
  // Classes
  DailyBudgetStore,
  // Factory functions
  createDailyBudgetStore,
  extractCostState,
  restoreBudgetFromCheckpoint,
  createBudgetStateFromCheckpoint,
  syncDailyBudget,
  needsBudgetRestore,
  // Constants
  DEFAULT_DAILY_BUDGET_PATH,
  DEFAULT_DAILY_LIMIT,
} from "./checkpoint-integration.js";

export type {
  // Types
  PersistedDailyBudget,
  CheckpointBudgetResult,
} from "./checkpoint-integration.js";

// ============================================================================
// Decision Classifier Exports
// ============================================================================

export {
  // Classes
  DecisionClassifier,
  // Factory functions
  createDecisionClassifier,
  classifyDecision,
  isAutoExecutable,
  getBucketPriority,
  getRiskPriority,
  // Constants
  DEFAULT_INTERVENTION_MATRIX,
} from "./decision-classifier.js";

export type {
  // Types
  DecisionBucket,
  DecisionType,
  RiskLevel,
  DecisionContext,
  ClassificationResult,
  InterventionRule,
  EscalationCondition,
} from "./decision-classifier.js";

// ============================================================================
// Escalation Router Exports
// ============================================================================

export {
  // Classes
  EscalationRouter,
  // Factory functions
  createEscalationRouter,
  actionRequiresWait,
  actionAllowsContinuation,
  getActionDescription,
  getLevelDescription,
  // Constants
  DEFAULT_ESCALATION_CONFIG,
} from "./escalation-router.js";

export type {
  // Types
  EscalationLevel,
  EscalationAction,
  EscalationDecision,
  EscalationRouterConfig,
  EscalationHistoryEntry,
  ApprovalQueueCallback,
} from "./escalation-router.js";

// ============================================================================
// Approval Queue Exports
// ============================================================================

export {
  // Classes
  ApprovalQueue,
  // Factory functions
  createApprovalQueue,
  isActionable,
  getTimeUntilExpiry,
  formatRequest,
  // Constants
  DEFAULT_APPROVAL_QUEUE_PATH,
  MAX_QUEUE_SIZE,
  DEFAULT_EXPIRY_MS,
} from "./approval-queue.js";

export type {
  // Types
  ApprovalStatus,
  ApprovalUrgency,
  ApprovalRequest,
  PersistedQueueData,
  QueueStats,
} from "./approval-queue.js";

// ============================================================================
// Budget-Escalation Integration Exports
// ============================================================================

export {
  // Classes
  BudgetEscalationIntegration,
  // Factory functions
  createBudgetEscalationIntegration,
  createBudgetEscalationIntegrationManual,
  shouldEscalateBudgetEvent,
  getBudgetEventSeverity,
  // Constants
  DEFAULT_INTEGRATION_CONFIG,
} from "./budget-escalation-integration.js";

export type {
  // Types
  BudgetEscalationConfig,
  BudgetEscalationResult,
  BudgetEscalationListener,
} from "./budget-escalation-integration.js";

// ============================================================================
// Notification System Exports
// ============================================================================

export {
  // Classes
  NotificationSystem,
  TerminalChannel,
  FileChannel,
  // Factory functions
  createNotificationSystem,
  getPriorityLevel,
  comparePriorities,
  formatNotification,
  getNotificationIcon,
  // Constants
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_NOTIFICATION_LOG_PATH,
  MAX_LOG_ENTRIES,
} from "./notification-system.js";

export type {
  // Types (NotificationPriority is exported from types.ts)
  NotificationEventType,
  NotificationEvent,
  NotificationChannel,
  NotificationSystemConfig,
  NotificationHistoryEntry,
  NotificationStats,
} from "./notification-system.js";
