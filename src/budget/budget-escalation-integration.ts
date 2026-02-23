/**
 * Budget-Escalation Integration
 *
 * Wires BudgetTracker events to EscalationRouter for automatic escalation.
 *
 * Per CTO Day 8-9 guidance:
 * - When BudgetTracker emits threshold_warning or limit_reached event
 * - EscalationRouter.route() should be called automatically
 * - Creates appropriate DecisionContext from budget event data
 * - Optionally sends notifications via NotificationSystem
 */

import type { BudgetTracker } from "./budget-tracker.js";
import type { EscalationRouter, EscalationDecision } from "./escalation-router.js";
import type { ApprovalQueue } from "./approval-queue.js";
import type { BudgetEvent } from "./types.js";
import type { DecisionContext, DecisionType, ClassificationResult } from "./decision-classifier.js";
import type { NotificationSystem } from "./notification-system.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Integration configuration.
 */
export interface BudgetEscalationConfig {
  /** Auto-route threshold_warning events */
  routeWarnings: boolean;
  /** Auto-route limit_reached events */
  routeLimitReached: boolean;
  /** Include cost info in decision context */
  includeCostInfo: boolean;
  /** Log escalation decisions */
  logDecisions: boolean;
  /** Send notifications for escalation decisions */
  sendNotifications: boolean;
}

/**
 * Default integration config.
 */
export const DEFAULT_INTEGRATION_CONFIG: BudgetEscalationConfig = {
  routeWarnings: true,
  routeLimitReached: true,
  includeCostInfo: true,
  logDecisions: false,
  sendNotifications: true,
};

/**
 * Escalation result from budget event.
 */
export interface BudgetEscalationResult {
  /** Original budget event */
  event: BudgetEvent;
  /** Escalation decision */
  decision: EscalationDecision;
  /** Whether approval was queued */
  approvalQueued: boolean;
  /** Approval ID if queued */
  approvalId?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Listener for budget escalation results.
 */
export type BudgetEscalationListener = (result: BudgetEscalationResult) => void;

// ============================================================================
// Budget-Escalation Integration
// ============================================================================

/**
 * BudgetEscalationIntegration - Connects BudgetTracker to EscalationRouter.
 *
 * Per CTO Day 8-9 guidance:
 * - Automatically routes budget events to escalation system
 * - Creates DecisionContext from budget event data
 * - Queues approvals when needed
 * - Sends notifications via NotificationSystem when configured
 */
export class BudgetEscalationIntegration {
  private tracker: BudgetTracker;
  private router: EscalationRouter;
  private queue: ApprovalQueue;
  private notificationSystem: NotificationSystem | null = null;
  private config: BudgetEscalationConfig;
  private unsubscribe: (() => void) | null = null;
  private listeners: BudgetEscalationListener[] = [];
  private results: BudgetEscalationResult[] = [];

  constructor(
    tracker: BudgetTracker,
    router: EscalationRouter,
    queue: ApprovalQueue,
    config?: Partial<BudgetEscalationConfig>,
    notificationSystem?: NotificationSystem,
  ) {
    this.tracker = tracker;
    this.router = router;
    this.queue = queue;
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...config };
    this.notificationSystem = notificationSystem ?? null;

    // Wire approval queue callback to router
    this.router.setApprovalQueueCallback(
      async (context: DecisionContext, classification: ClassificationResult) => {
        return this.queue.enqueue(context, classification.bucket, classification.reason);
      },
    );
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Start listening to budget events and routing to escalation.
   */
  start(): void {
    if (this.unsubscribe) {
      return; // Already started
    }

    this.unsubscribe = this.tracker.onEvent((event) => {
      void this.handleBudgetEvent(event);
    });
  }

  /**
   * Stop listening to budget events.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Check if integration is active.
   */
  isActive(): boolean {
    return this.unsubscribe !== null;
  }

  /**
   * Subscribe to escalation results.
   */
  onEscalation(listener: BudgetEscalationListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get escalation results history.
   */
  getResults(): BudgetEscalationResult[] {
    return [...this.results];
  }

  /**
   * Clear escalation results history.
   */
  clearResults(): void {
    this.results = [];
  }

  /**
   * Get configuration.
   */
  getConfig(): BudgetEscalationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<BudgetEscalationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Set notification system for sending escalation notifications.
   */
  setNotificationSystem(system: NotificationSystem): void {
    this.notificationSystem = system;
  }

  /**
   * Get notification system if configured.
   */
  getNotificationSystem(): NotificationSystem | null {
    return this.notificationSystem;
  }

  /**
   * Get connected components.
   */
  getComponents(): {
    tracker: BudgetTracker;
    router: EscalationRouter;
    queue: ApprovalQueue;
    notificationSystem: NotificationSystem | null;
  } {
    return {
      tracker: this.tracker,
      router: this.router,
      queue: this.queue,
      notificationSystem: this.notificationSystem,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Handle budget event and route to escalation if needed.
   */
  private async handleBudgetEvent(event: BudgetEvent): Promise<void> {
    // Only route relevant events
    if (!this.shouldRoute(event)) {
      return;
    }

    // Create decision context from budget event
    const context = this.createDecisionContext(event);

    // Route through escalation router
    const decision = await this.router.route(context);

    // Check if approval was queued
    const approvalQueued =
      decision.action === "queue_approval" || decision.action === "block";
    const approvalId = decision.approvalId;

    // Create result
    const result: BudgetEscalationResult = {
      event,
      decision,
      approvalQueued,
      timestamp: new Date(),
    };
    if (approvalId !== undefined) {
      result.approvalId = approvalId;
    }

    // Store result
    this.results.push(result);

    // Keep last 50 results
    if (this.results.length > 50) {
      this.results = this.results.slice(-50);
    }

    // Send notifications if configured
    if (this.config.sendNotifications && this.notificationSystem) {
      await this.sendNotification(event, decision, approvalId);
    }

    // Notify listeners
    this.notifyListeners(result);

    // Log if configured
    if (this.config.logDecisions) {
      this.logDecision(event, decision);
    }
  }

  /**
   * Check if event should be routed to escalation.
   */
  private shouldRoute(event: BudgetEvent): boolean {
    switch (event.type) {
      case "threshold_warning":
      case "warning_triggered":
        return this.config.routeWarnings;
      case "limit_reached":
        return this.config.routeLimitReached;
      default:
        return false;
    }
  }

  /**
   * Create DecisionContext from budget event.
   */
  private createDecisionContext(event: BudgetEvent): DecisionContext {
    const decisionType = this.mapEventToDecisionType(event);
    const description = this.generateDescription(event);

    const context: DecisionContext = {
      type: decisionType,
      description,
    };

    // Add cost info if configured and available
    if (this.config.includeCostInfo && event.data.cost !== undefined) {
      context.costImpact = event.data.cost;
    }

    // Add budget percentage if available
    if (event.data.percentUsed !== undefined) {
      context.budgetPercentage = event.data.percentUsed;
    }

    return context;
  }

  /**
   * Map budget event to decision type.
   */
  private mapEventToDecisionType(event: BudgetEvent): DecisionType {
    switch (event.type) {
      case "threshold_warning":
      case "warning_triggered":
        return "budget_threshold";
      case "limit_reached":
        return "deploy"; // High-severity, maps to blocking
      default:
        return "budget_threshold";
    }
  }

  /**
   * Generate human-readable description for event.
   */
  private generateDescription(event: BudgetEvent): string {
    const budgetType = event.data.budgetType ?? "unknown";
    const percentUsed = event.data.percentUsed;

    switch (event.type) {
      case "threshold_warning":
      case "warning_triggered":
        return `Budget warning: ${budgetType} budget at ${percentUsed?.toFixed(0) ?? "?"}%`;
      case "limit_reached":
        return `Budget limit reached: ${budgetType} budget exhausted (100%)`;
      default:
        return `Budget event: ${event.type}`;
    }
  }

  /**
   * Send notification for budget event and escalation decision.
   */
  private async sendNotification(
    event: BudgetEvent,
    decision: EscalationDecision,
    approvalId?: string,
  ): Promise<void> {
    if (!this.notificationSystem) return;

    try {
      const budgetType = (event.data.budgetType ?? "session") as "session" | "daily";
      const percentUsed = event.data.percentUsed ?? 100;
      const used = event.data.cost ?? 0;
      const limit = used / (percentUsed / 100) || 0;

      // Send appropriate notification based on event type
      if (event.type === "limit_reached") {
        await this.notificationSystem.notifyBudgetLimit(budgetType, used, limit);
      } else if (event.type === "threshold_warning" || event.type === "warning_triggered") {
        await this.notificationSystem.notifyBudgetWarning(
          budgetType,
          percentUsed,
          used,
          limit,
        );
      }

      // Send escalation notification if blocking
      if (decision.action === "queue_approval" || decision.action === "block") {
        await this.notificationSystem.notifyEscalation(
          decision.level,
          decision.action,
          decision.reason,
        );

        // Send approval needed notification if queued
        if (approvalId) {
          await this.notificationSystem.notifyApprovalNeeded(
            decision.classification.context.type,
            decision.reason,
            approvalId,
          );
        }
      }
    } catch {
      // Ignore notification errors - don't block escalation flow
    }
  }

  /**
   * Notify listeners of escalation result.
   */
  private notifyListeners(result: BudgetEscalationResult): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Log escalation decision (for debugging).
   */
  private logDecision(event: BudgetEvent, decision: EscalationDecision): void {
    const logMessage = [
      `[BudgetEscalation] Event: ${event.type}`,
      `Budget: ${event.data.budgetType ?? "unknown"} at ${event.data.percentUsed?.toFixed(0) ?? "?"}%`,
      `Decision: L${decision.level} → ${decision.action}`,
      `Reason: ${decision.reason}`,
    ].join(" | ");

    // Use console.warn for now (can be replaced with proper logger)
    console.warn(logMessage);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and start a budget-escalation integration.
 */
export function createBudgetEscalationIntegration(
  tracker: BudgetTracker,
  router: EscalationRouter,
  queue: ApprovalQueue,
  config?: Partial<BudgetEscalationConfig>,
  notificationSystem?: NotificationSystem,
): BudgetEscalationIntegration {
  const integration = new BudgetEscalationIntegration(
    tracker,
    router,
    queue,
    config,
    notificationSystem,
  );
  integration.start();
  return integration;
}

/**
 * Create integration without auto-starting.
 */
export function createBudgetEscalationIntegrationManual(
  tracker: BudgetTracker,
  router: EscalationRouter,
  queue: ApprovalQueue,
  config?: Partial<BudgetEscalationConfig>,
  notificationSystem?: NotificationSystem,
): BudgetEscalationIntegration {
  return new BudgetEscalationIntegration(tracker, router, queue, config, notificationSystem);
}

/**
 * Helper to check if a budget event should trigger escalation.
 */
export function shouldEscalateBudgetEvent(event: BudgetEvent): boolean {
  return (
    event.type === "threshold_warning" ||
    event.type === "warning_triggered" ||
    event.type === "limit_reached"
  );
}

/**
 * Helper to get severity level for a budget event.
 */
export function getBudgetEventSeverity(
  event: BudgetEvent,
): "low" | "medium" | "high" | "critical" {
  switch (event.type) {
    case "limit_reached":
      return "critical";
    case "threshold_warning":
    case "warning_triggered":
      if (event.data.percentUsed !== undefined && event.data.percentUsed >= 90) {
        return "high";
      }
      return "medium";
    default:
      return "low";
  }
}
