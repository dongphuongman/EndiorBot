/**
 * Autonomy Gate Manager
 *
 * Gate A/B/C checks, time/cost/escalation limit enforcement for the
 * Autonomous Session Manager.
 *
 * @module sessions/autonomous/gate-manager
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { SessionBudget } from "../../models/session-budget.js";
import {
  AUTONOMY_GATE_CONFIG,
  type AutonomousSessionConfig,
  type AutonomyGate,
  type EscalationRequest,
  type EscalationResponse,
} from "./types.js";
import type { AutonomousEventEmitter } from "./event-emitter.js";

// ============================================================================
// AutonomyGateManager
// ============================================================================

/**
 * Manages gate-level constraints and escalations for an autonomous session.
 *
 * Responsibilities:
 * - Budget availability checks
 * - Time limit checks (per-gate maxDurationMs)
 * - Escalation lifecycle (create, track pending, resolve)
 * - Budget event handlers (warning, exceeded, Opus cap)
 */
export class AutonomyGateManager {
  private readonly log: Logger;
  private readonly gate: AutonomyGate;
  private readonly nonBlockingEscalation: boolean;
  private readonly conservativeFallback: boolean;
  private readonly sessionId: string;
  private readonly budget: SessionBudget;
  private readonly startTime: Date;
  private readonly emitter: AutonomousEventEmitter;

  private escalations: EscalationRequest[] = [];
  private pendingEscalations: EscalationRequest[] = [];

  constructor(
    config: Pick<
      Required<AutonomousSessionConfig>,
      | "gate"
      | "nonBlockingEscalation"
      | "conservativeFallback"
      | "sessionId"
    >,
    budget: SessionBudget,
    startTime: Date,
    emitter: AutonomousEventEmitter,
  ) {
    this.log = createLogger("AutonomyGateManager");
    this.gate = config.gate;
    this.nonBlockingEscalation = config.nonBlockingEscalation;
    this.conservativeFallback = config.conservativeFallback;
    this.sessionId = config.sessionId;
    this.budget = budget;
    this.startTime = startTime;
    this.emitter = emitter;
  }

  // ==========================================================================
  // Gate Checks
  // ==========================================================================

  /**
   * Returns true if the session still has budget remaining.
   */
  isBudgetAvailable(): boolean {
    const remaining = this.budget.getRemaining();
    return remaining.total > 0;
  }

  /**
   * Returns true if the gate's time limit has been reached.
   */
  isTimeLimitReached(): boolean {
    const elapsed = Date.now() - this.startTime.getTime();
    const maxDuration = AUTONOMY_GATE_CONFIG[this.gate].maxDurationMs;
    return elapsed >= maxDuration;
  }

  /**
   * Returns true if there are pending (blocking) escalations.
   */
  hasBlockingEscalations(): boolean {
    return !this.nonBlockingEscalation && this.pendingEscalations.length > 0;
  }

  /**
   * Count of pending escalations (for status / stability guard).
   */
  get pendingEscalationCount(): number {
    return this.pendingEscalations.length;
  }

  // ==========================================================================
  // Escalation Management
  // ==========================================================================

  /**
   * Create and register a new escalation request.
   * Returns the escalation ID.
   */
  async createEscalation(
    params: Omit<EscalationRequest, "id" | "timestamp" | "context"> & {
      taskId?: string;
      currentState: string;
    },
  ): Promise<string> {
    const escalation: EscalationRequest = {
      id: `esc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      context: {
        sessionId: this.sessionId,
        currentState: params.currentState,
        budgetRemaining: this.budget.getRemaining(),
        taskId: params.taskId,
      },
      severity: params.severity,
      reason: params.reason,
      blocking: params.blocking,
      suggestions: params.suggestions,
    };

    this.escalations.push(escalation);
    if (escalation.blocking || !this.nonBlockingEscalation) {
      this.pendingEscalations.push(escalation);
    }

    this.emitter.emit("escalation_created", {
      escalationId: escalation.id,
      severity: escalation.severity,
      reason: escalation.reason,
      blocking: escalation.blocking,
    });

    this.log.warn("Escalation created", {
      escalationId: escalation.id,
      severity: escalation.severity,
      reason: escalation.reason,
    });

    return escalation.id;
  }

  /**
   * Resolve a pending escalation.
   */
  resolveEscalation(response: EscalationResponse): void {
    this.pendingEscalations = this.pendingEscalations.filter(
      (e) => e.id !== response.escalationId,
    );

    this.emitter.emit("escalation_resolved", {
      escalationId: response.escalationId,
      action: response.action,
    });

    this.log.info("Escalation resolved", {
      escalationId: response.escalationId,
      action: response.action,
    });
  }

  /**
   * Immutable snapshot of all escalations (history).
   */
  getEscalations(): EscalationRequest[] {
    return [...this.escalations];
  }

  /**
   * Current pending escalations (blocking list).
   */
  getPendingEscalations(): EscalationRequest[] {
    return [...this.pendingEscalations];
  }

  // ==========================================================================
  // Budget Event Handlers
  // ==========================================================================

  handleBudgetWarning(details: Record<string, unknown>): void {
    this.emitter.emit("budget_warning", details);

    if (this.conservativeFallback) {
      this.log.info("Budget warning - switching to conservative mode");
    }
  }

  handleBudgetExceeded(
    details: Record<string, unknown>,
    currentState: string,
  ): void {
    this.emitter.emit("budget_exceeded", details);

    void this.createEscalation({
      severity: "critical",
      reason: `Budget exceeded: spent $${(details["spent"] as number).toFixed(2)} of $${details["budget"]}`,
      blocking: true,
      suggestions: ["Review spending", "Increase budget", "Complete essential tasks only"],
      currentState,
    });
  }

  handleOpusCapReached(details: Record<string, unknown>): void {
    this.log.info("Opus cap reached, downgrading to Sonnet", details);
    // Model selector will automatically downgrade
  }
}
