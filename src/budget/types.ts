/**
 * Budget Types
 *
 * Core interfaces for budget control and cost tracking.
 * Based on ADR-007 Autonomous Execution Budget specification.
 */

// ============================================================================
// Task Types
// ============================================================================

export type TaskType =
  | "code_implementation"
  | "code_review"
  | "test_writing"
  | "bug_fix"
  | "refactoring"
  | "documentation"
  | "architecture"
  | "research"
  | "general";

// ============================================================================
// Budget Configuration
// ============================================================================

/**
 * Action to take when a budget limit is reached.
 */
export interface LimitAction {
  /** Action type */
  action: "pause_and_notify" | "switch_to_self_hosted" | "fail_fast";
  /** Fallback model for 'switch_to_self_hosted' action (self-hosted Ollama server) */
  fallback_model?: string;
  /** Milliseconds to wait before escalating */
  pause_duration?: number;
}

/**
 * Notification configuration for budget alerts.
 */
export interface NotificationConfig {
  /** Channels to send notifications to */
  channels: ("console" | "email" | "slack")[];
  /** Max notifications per hour */
  rate_limit: number;
  /** Milliseconds to batch notifications */
  batch_window: number;
  /** Priority levels to send notifications for */
  priority_levels: {
    /** Send on 80% threshold */
    warning: boolean;
    /** Send on limit reached */
    limit: boolean;
    /** Send on circuit breaker */
    breach: boolean;
  };
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Enable circuit breakers */
  enabled: boolean;
  /** Max retries per task before tripping */
  max_retry_per_task: number;
  /** Max cost per task in USD */
  max_cost_per_task: number;
  /** Max duration per task in milliseconds */
  max_duration_per_task: number;
  /** Escalate to CEO on breach */
  escalate_on_breach: boolean;
}

/**
 * Cost estimation configuration.
 */
export interface EstimationConfig {
  /** Enable cost estimation */
  enabled: boolean;
  /** Cost threshold requiring CEO approval (USD) */
  require_approval_above: number;
  /** Minimum confidence score (0-1) */
  confidence_threshold: number;
}

/**
 * Complete budget configuration.
 * Per ADR-007: $2 session, $10 daily, 80% warning.
 */
export interface BudgetConfig {
  /** Daily budget limit in USD (default: $10.00) */
  daily_limit: number;
  /** Per-session budget limit in USD (default: $2.00) */
  per_session_limit: number;
  /** Per-track budget limit in USD (default: $0.50, Sprint 39+) */
  per_track_limit?: number;
  /** Warning threshold percentage (default: 80%) */
  warning_threshold: number;
  /** Action on limit reached */
  on_limit_reached: LimitAction;
  /** Notification settings */
  notification: NotificationConfig;
  /** Circuit breaker settings */
  circuit_breakers: CircuitBreakerConfig;
  /** Cost estimation settings */
  estimation: EstimationConfig;
}

// ============================================================================
// Budget State
// ============================================================================

/**
 * Session budget tracking.
 */
export interface SessionBudget {
  /** Current session cost in USD */
  costSoFar: number;
  /** Session budget limit in USD */
  limit: number;
  /** Session start time */
  startTime: Date;
}

/**
 * Daily budget tracking.
 */
export interface DailyBudget {
  /** Today's total cost in USD */
  costSoFar: number;
  /** Daily budget limit in USD */
  limit: number;
  /** Current date (YYYY-MM-DD, UTC) */
  date: string;
  /** Next reset time (midnight UTC) */
  resetAt: Date;
}

/**
 * Per-track budget tracking (Sprint 39+).
 */
export interface TrackBudget {
  /** Track cost so far in USD */
  costSoFar: number;
  /** Track budget limit in USD */
  limit: number;
}

/**
 * Token usage record for a single API call.
 */
export interface TokenUsageRecord {
  /** Timestamp of the API call */
  timestamp: Date;
  /** Model used (e.g., "claude-opus-4") */
  model: string;
  /** Provider (e.g., "anthropic", "openai") */
  provider: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cost in USD */
  cost: number;
  /** Task type for categorization */
  taskType?: TaskType;
  /** Task ID for tracking */
  taskId?: string;
  /** Track ID for parallel execution (Sprint 39+) */
  trackId?: string;
}

/**
 * Historical cost data for estimation.
 */
export interface HistoricalData {
  /** Average cost per task type */
  avgCostPerTask: Partial<Record<TaskType, number>>;
  /** Average cost per model */
  avgCostPerModel: Record<string, number>;
  /** Total amount spent (lifetime) */
  totalSpent: number;
}

/**
 * Complete budget state.
 */
export interface BudgetState {
  /** Session budget tracking */
  session: SessionBudget;
  /** Daily budget tracking */
  daily: DailyBudget;
  /** Per-track budgets (Sprint 39+) */
  tracks?: Record<string, TrackBudget>;
  /** Token usage history */
  tokenUsage: TokenUsageRecord[];
  /** Historical data for estimation */
  historical: HistoricalData;
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Confidence level for cost estimates.
 */
export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Cost breakdown by component.
 */
export interface CostBreakdown {
  /** Model API cost */
  model_cost: number;
  /** Tool usage cost (if any) */
  tool_cost?: number;
  /** API overhead/fees */
  api_overhead?: number;
}

/**
 * Cost estimate for a task.
 */
export interface CostEstimate {
  /** Estimated cost in USD */
  estimated_cost: number;
  /** Estimated token counts */
  estimated_tokens: {
    input: number;
    output: number;
  };
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Confidence score (0-1) */
  confidence_score: number;
  /** Historical average for this task type */
  historical_avg?: number;
  /** Cost breakdown by component */
  breakdown?: CostBreakdown;
  /** Recommendation for cost savings */
  recommendation?: string;
}

/**
 * Context for cost estimation.
 */
export interface TaskContext {
  /** User prompt/query */
  prompt: string;
  /** Files included in context */
  files?: Array<{ path: string; content: string }>;
  /** Conversation history */
  conversationHistory?: string;
  /** Task type hint */
  taskType?: TaskType;
}

// ============================================================================
// Budget Actions
// ============================================================================

/**
 * Action type for budget decisions.
 */
export type BudgetActionType =
  | "continue"
  | "pause"
  | "switch_model"
  | "escalate"
  | "fail";

/**
 * Budget action result.
 */
export interface BudgetAction {
  /** Action to take */
  action: BudgetActionType;
  /** Reason for the action */
  reason?: string;
  /** Model to switch to (for 'switch_model') */
  model?: string;
  /** Approval ID (for 'escalate') */
  approvalId?: string;
  /** Remaining budget after action */
  remainingBudget?: {
    session: number;
    daily: number;
  };
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker status.
 */
export type CircuitBreakerStatus = "closed" | "open" | "half_open";

/**
 * Reason for circuit breaker tripping.
 */
export type CircuitBreakerReason =
  | "max_retry_exceeded"
  | "max_cost_exceeded"
  | "max_duration_exceeded";

/**
 * Task metrics for circuit breaker evaluation.
 */
export interface TaskMetrics {
  /** Number of retries so far */
  retryCount: number;
  /** Cost spent on this task */
  costSoFar: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Task start time */
  startTime: Date;
}

/**
 * Circuit breaker evaluation result.
 */
export interface CircuitBreakerResult {
  /** Current circuit breaker status */
  status: CircuitBreakerStatus;
  /** Reason for tripping (if open) */
  reason?: CircuitBreakerReason;
  /** Whether to escalate to CEO */
  escalate: boolean;
  /** Current task metrics */
  metrics: TaskMetrics;
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Notification types.
 */
export type NotificationType =
  | "budget_limit"
  | "budget_warning"
  | "approval_required"
  | "decision_notification"
  | "batch_summary";

/**
 * Notification priority levels.
 */
export type NotificationPriority = "low" | "medium" | "high" | "critical";

/**
 * Notification message.
 */
export interface Notification {
  /** Notification type */
  type: NotificationType;
  /** Priority level */
  priority: NotificationPriority;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Available options for CEO */
  options?: Record<string, string>;
}

// ============================================================================
// Approval Queue
// ============================================================================

/**
 * Approval request status.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/**
 * Approval request for CEO decision.
 */
export interface ApprovalRequest {
  /** Unique approval ID */
  id: string;
  /** Request type */
  type: "budget_increase" | "continue_over_limit" | "expensive_task";
  /** Request message */
  message: string;
  /** Current status */
  status: ApprovalStatus;
  /** Created timestamp */
  createdAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Resolution timestamp */
  resolvedAt?: Date;
  /** Resolution notes */
  notes?: string;
  /** Related cost estimate */
  costEstimate?: CostEstimate;
  /** Requested budget increase (USD) */
  requestedAmount?: number;
}

// ============================================================================
// Model Pricing
// ============================================================================

/**
 * Model pricing information.
 */
export interface ModelPricing {
  /** Provider name */
  provider: string;
  /** Model ID */
  model: string;
  /** Cost per 1K input tokens (USD) */
  input_per_1k: number;
  /** Cost per 1K output tokens (USD) */
  output_per_1k: number;
  /** Last updated timestamp */
  updatedAt: Date;
}

// ============================================================================
// Budget Events
// ============================================================================

/**
 * Budget event types.
 */
export type BudgetEventType =
  | "cost_recorded"
  | "warning_triggered"
  | "threshold_warning"
  | "limit_reached"
  | "circuit_breaker_tripped"
  | "model_switched"
  | "approval_requested"
  | "approval_resolved"
  | "daily_reset"
  | "budget_restored";

/**
 * Budget event for logging.
 */
export interface BudgetEvent {
  /** Event type */
  type: BudgetEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data: {
    /** Session ID */
    sessionId?: string;
    /** Task ID */
    taskId?: string;
    /** Cost amount */
    cost?: number;
    /** Budget type affected */
    budgetType?: "session" | "daily" | "track";
    /** Percentage of limit used */
    percentUsed?: number;
    /** Action taken */
    action?: BudgetActionType;
    /** Additional details */
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default budget configuration per ADR-007.
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  daily_limit: 10.0,
  per_session_limit: 2.0,
  per_track_limit: 0.5,
  warning_threshold: 80,

  on_limit_reached: {
    action: "pause_and_notify",
    fallback_model: "self-hosted/qwen3-coder", // self-hosted Ollama server
    pause_duration: 60000, // 1 minute
  },

  notification: {
    channels: ["console"],
    rate_limit: 4,
    batch_window: 300000, // 5 minutes
    priority_levels: {
      warning: true,
      limit: true,
      breach: true,
    },
  },

  circuit_breakers: {
    enabled: true,
    max_retry_per_task: 3,
    max_cost_per_task: 0.5,
    max_duration_per_task: 300000, // 5 minutes
    escalate_on_breach: true,
  },

  estimation: {
    enabled: true,
    require_approval_above: 1.0,
    confidence_threshold: 0.7,
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial budget state.
 */
export function createInitialBudgetState(config: BudgetConfig): BudgetState {
  const now = new Date();
  const isoStr = now.toISOString();
  const todayStr = isoStr.substring(0, 10); // YYYY-MM-DD format
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);

  const budgetState: BudgetState = {
    session: {
      costSoFar: 0,
      limit: config.per_session_limit,
      startTime: now,
    },
    daily: {
      costSoFar: 0,
      limit: config.daily_limit,
      date: todayStr,
      resetAt: midnight,
    },
    tokenUsage: [],
    historical: {
      avgCostPerTask: {},
      avgCostPerModel: {},
      totalSpent: 0,
    },
  };
  // Note: tracks is intentionally omitted (optional property)
  return budgetState;
}

/**
 * Create empty task metrics.
 */
export function createEmptyTaskMetrics(): TaskMetrics {
  return {
    retryCount: 0,
    costSoFar: 0,
    durationMs: 0,
    startTime: new Date(),
  };
}

/**
 * Check if budget state needs daily reset.
 */
export function needsDailyReset(state: BudgetState): boolean {
  const now = new Date();
  const currentDate = now.toISOString().substring(0, 10); // YYYY-MM-DD
  return state.daily.date !== currentDate;
}

/**
 * Calculate percentage of budget used.
 */
export function calculateBudgetPercentage(
  costSoFar: number,
  limit: number,
): number {
  if (limit <= 0) return 100;
  return Math.min(100, (costSoFar / limit) * 100);
}

/**
 * Check if budget is at warning threshold.
 */
export function isAtWarningThreshold(
  costSoFar: number,
  limit: number,
  warningThreshold: number,
): boolean {
  const percentage = calculateBudgetPercentage(costSoFar, limit);
  return percentage >= warningThreshold && percentage < 100;
}

/**
 * Check if budget limit is reached.
 */
export function isLimitReached(costSoFar: number, limit: number): boolean {
  return costSoFar >= limit;
}
