/**
 * Escalation Router for Budget Control
 *
 * Routes decisions based on classification and manages escalation flow.
 *
 * Per CTO Day 6-7 guidance:
 * - Integrates with DecisionClassifier for bucket assignment
 * - Uses shared NotificationRateLimiter (no second instance)
 * - Routes to ApprovalQueue for blocking decisions
 *
 * Escalation Levels:
 * - L1: Auto-retry or auto-execute
 * - L2: Multi-model consultation
 * - L3: Human (CEO) intervention
 */

import type { NotificationRateLimiter } from "./circuit-breaker.js";
import {
  createDecisionClassifier,
  type DecisionClassifier,
  type DecisionContext,
  type DecisionBucket,
  type ClassificationResult,
  type DecisionType,
} from "./decision-classifier.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Escalation level (L1 → L2 → L3).
 */
export type EscalationLevel = 1 | 2 | 3;

/**
 * Escalation action to take.
 */
export type EscalationAction =
  | "execute" // Auto-execute (L1)
  | "retry" // Retry with adjustment (L1)
  | "consult" // Multi-model consultation (L2)
  | "notify" // Notify CEO but continue (L2)
  | "queue_approval" // Queue for CEO approval (L3)
  | "block" // Block until approved (L3)
  | "fail"; // Cannot proceed

/**
 * Escalation decision result.
 */
export interface EscalationDecision {
  /** Assigned level */
  level: EscalationLevel;
  /** Action to take */
  action: EscalationAction;
  /** Classification result */
  classification: ClassificationResult;
  /** Should notify CEO? */
  shouldNotify: boolean;
  /** Notification rate-limited? */
  notificationRateLimited: boolean;
  /** Reason for decision */
  reason: string;
  /** Approval request ID (if queued) */
  approvalId?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Escalation router configuration.
 */
export interface EscalationRouterConfig {
  /** Enable auto-execution for low-risk decisions */
  autoExecuteEnabled: boolean;
  /** Enable multi-model consultation */
  consultationEnabled: boolean;
  /** Max retries before escalating */
  maxRetries: number;
  /** Cost threshold for escalation ($) */
  costEscalationThreshold: number;
  /** Budget percentage threshold for escalation */
  budgetEscalationThreshold: number;
}

/**
 * Default escalation router config.
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationRouterConfig = {
  autoExecuteEnabled: true,
  consultationEnabled: true,
  maxRetries: 3,
  costEscalationThreshold: 0.5, // $0.50
  budgetEscalationThreshold: 80, // 80%
};

/**
 * Escalation history entry.
 */
export interface EscalationHistoryEntry {
  /** Entry ID */
  id: string;
  /** Decision context */
  context: DecisionContext;
  /** Escalation decision */
  decision: EscalationDecision;
  /** Timestamp */
  timestamp: Date;
  /** Outcome (if resolved) */
  outcome?: "approved" | "rejected" | "auto_resolved" | "pending";
}

/**
 * Callback for approval queue integration.
 */
export type ApprovalQueueCallback = (
  context: DecisionContext,
  classification: ClassificationResult,
) => Promise<string | undefined>;

// ============================================================================
// Escalation Router
// ============================================================================

/**
 * EscalationRouter - Routes decisions based on classification.
 *
 * Per CTO Day 6-7 guidance:
 * - Uses shared NotificationRateLimiter from circuit-breaker
 * - Routes to ApprovalQueue for blocking decisions
 * - Supports multi-model consultation for complex decisions
 */
export class EscalationRouter {
  private classifier: DecisionClassifier;
  private rateLimiter: NotificationRateLimiter;
  private config: EscalationRouterConfig;
  private history: EscalationHistoryEntry[] = [];
  private retryCounters: Map<string, number> = new Map();
  private approvalQueueCallback?: ApprovalQueueCallback;

  constructor(
    rateLimiter: NotificationRateLimiter,
    config?: Partial<EscalationRouterConfig>,
    classifier?: DecisionClassifier,
  ) {
    this.rateLimiter = rateLimiter;
    this.config = { ...DEFAULT_ESCALATION_CONFIG, ...config };
    this.classifier = classifier ?? createDecisionClassifier();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Route a decision and determine escalation action.
   */
  async route(context: DecisionContext): Promise<EscalationDecision> {
    // Classify the decision
    const classification = this.classifier.classify(context);

    // Determine escalation level and action
    const { level, action, reason } = this.determineEscalation(
      context,
      classification,
    );

    // Check notification rate limit
    const canNotify = this.rateLimiter.canSend();
    const shouldNotify = classification.shouldNotify && canNotify;

    // Record notification if sending
    if (shouldNotify) {
      this.rateLimiter.recordSent();
    }

    // Queue for approval if blocking
    let approvalId: string | undefined;
    if (action === "queue_approval" || action === "block") {
      approvalId = await this.queueForApproval(context, classification);
    }

    const decision: EscalationDecision = {
      level,
      action,
      classification,
      shouldNotify,
      notificationRateLimited: classification.shouldNotify && !canNotify,
      reason,
      ...(approvalId !== undefined && { approvalId }),
      timestamp: new Date(),
    };

    // Record in history
    this.recordHistory(context, decision);

    return decision;
  }

  /**
   * Check if intervention is required for a decision type.
   */
  checkInterventionRequired(type: DecisionType): boolean {
    return this.classifier.requiresApproval(type);
  }

  /**
   * Get escalation level for a decision type.
   */
  getEscalationLevel(type: DecisionType): EscalationLevel {
    const bucket = this.classifier.getDefaultBucket(type);
    return this.bucketToLevel(bucket);
  }

  /**
   * Record a retry for a context key.
   */
  recordRetry(contextKey: string): number {
    const count = this.retryCounters.get(contextKey) ?? 0;
    this.retryCounters.set(contextKey, count + 1);
    return count + 1;
  }

  /**
   * Get retry count for a context key.
   */
  getRetryCount(contextKey: string): number {
    return this.retryCounters.get(contextKey) ?? 0;
  }

  /**
   * Reset retry counter for a context key.
   */
  resetRetryCount(contextKey: string): void {
    this.retryCounters.delete(contextKey);
  }

  /**
   * Set approval queue callback for integration.
   */
  setApprovalQueueCallback(callback: ApprovalQueueCallback): void {
    this.approvalQueueCallback = callback;
  }

  /**
   * Get escalation history.
   */
  getHistory(): EscalationHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear escalation history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get configuration.
   */
  getConfig(): EscalationRouterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<EscalationRouterConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get classifier instance.
   */
  getClassifier(): DecisionClassifier {
    return this.classifier;
  }

  /**
   * Get rate limiter instance.
   */
  getRateLimiter(): NotificationRateLimiter {
    return this.rateLimiter;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Determine escalation level and action.
   */
  private determineEscalation(
    context: DecisionContext,
    classification: ClassificationResult,
  ): { level: EscalationLevel; action: EscalationAction; reason: string } {
    const { bucket } = classification;

    // Check for retry escalation
    const contextKey = this.getContextKey(context);
    const retryCount = this.retryCounters.get(contextKey) ?? 0;
    if (retryCount >= this.config.maxRetries) {
      return {
        level: 3,
        action: "block",
        reason: `Max retries (${this.config.maxRetries}) exceeded`,
      };
    }

    // Check for cost escalation
    if (
      context.costImpact &&
      context.costImpact >= this.config.costEscalationThreshold
    ) {
      return {
        level: 3,
        action: "queue_approval",
        reason: `Cost impact ($${context.costImpact.toFixed(2)}) exceeds threshold`,
      };
    }

    // Check for budget escalation
    if (
      context.budgetPercentage &&
      context.budgetPercentage >= this.config.budgetEscalationThreshold
    ) {
      if (context.budgetPercentage >= 100) {
        return {
          level: 3,
          action: "block",
          reason: "Budget limit reached (100%)",
        };
      }
      return {
        level: 2,
        action: "notify",
        reason: `Budget at ${context.budgetPercentage.toFixed(0)}%`,
      };
    }

    // Route based on bucket
    switch (bucket) {
      case "auto":
        if (!this.config.autoExecuteEnabled) {
          return {
            level: 2,
            action: "notify",
            reason: "Auto-execute disabled, notifying instead",
          };
        }
        return {
          level: 1,
          action: "execute",
          reason: classification.reason,
        };

      case "notify":
        return {
          level: 2,
          action: "notify",
          reason: classification.reason,
        };

      case "block":
        return {
          level: 3,
          action: "queue_approval",
          reason: classification.reason,
        };

      case "consult":
        if (!this.config.consultationEnabled) {
          return {
            level: 3,
            action: "queue_approval",
            reason: "Consultation disabled, requiring approval instead",
          };
        }
        return {
          level: 2,
          action: "consult",
          reason: classification.reason,
        };

      default:
        // Unknown bucket - default to notify
        return {
          level: 2,
          action: "notify",
          reason: `Unknown bucket: ${bucket}`,
        };
    }
  }

  /**
   * Convert bucket to escalation level.
   */
  private bucketToLevel(bucket: DecisionBucket): EscalationLevel {
    switch (bucket) {
      case "auto":
        return 1;
      case "notify":
        return 2;
      case "consult":
        return 2;
      case "block":
        return 3;
      default:
        return 2;
    }
  }

  /**
   * Get unique key for a context (for retry tracking).
   */
  private getContextKey(context: DecisionContext): string {
    const parts = [
      context.type,
      context.description?.substring(0, 50),
      context.filesAffected?.join(",").substring(0, 100),
    ].filter(Boolean);
    return parts.join("::");
  }

  /**
   * Queue a decision for approval.
   */
  private async queueForApproval(
    context: DecisionContext,
    classification: ClassificationResult,
  ): Promise<string | undefined> {
    if (this.approvalQueueCallback) {
      return await this.approvalQueueCallback(context, classification);
    }
    // Generate a local ID if no queue callback
    return `esc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Record escalation in history.
   */
  private recordHistory(
    context: DecisionContext,
    decision: EscalationDecision,
  ): void {
    const entry: EscalationHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      context,
      decision,
      timestamp: new Date(),
      outcome: decision.action === "execute" ? "auto_resolved" : "pending",
    };

    this.history.push(entry);

    // Keep last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an escalation router with shared rate limiter.
 */
export function createEscalationRouter(
  rateLimiter: NotificationRateLimiter,
  config?: Partial<EscalationRouterConfig>,
): EscalationRouter {
  return new EscalationRouter(rateLimiter, config);
}

/**
 * Helper to determine if an action requires waiting.
 */
export function actionRequiresWait(action: EscalationAction): boolean {
  return action === "queue_approval" || action === "block";
}

/**
 * Helper to determine if an action allows continuation.
 */
export function actionAllowsContinuation(action: EscalationAction): boolean {
  return action === "execute" || action === "retry" || action === "notify";
}

/**
 * Get human-readable action description.
 */
export function getActionDescription(action: EscalationAction): string {
  switch (action) {
    case "execute":
      return "Auto-executing (low risk)";
    case "retry":
      return "Retrying with adjustments";
    case "consult":
      return "Initiating multi-model consultation";
    case "notify":
      return "Notifying CEO and continuing";
    case "queue_approval":
      return "Queued for CEO approval";
    case "block":
      return "Blocked until approved";
    case "fail":
      return "Cannot proceed";
    default:
      return "Unknown action";
  }
}

/**
 * Get escalation level description.
 */
export function getLevelDescription(level: EscalationLevel): string {
  switch (level) {
    case 1:
      return "L1: Auto-handled";
    case 2:
      return "L2: AI-assisted (consultation/notification)";
    case 3:
      return "L3: Human intervention required";
    default:
      return "Unknown level";
  }
}
