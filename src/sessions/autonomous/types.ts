/**
 * Autonomous Session Types
 *
 * Type definitions for autonomous session management.
 *
 * @module sessions/autonomous/types
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 * @authority Master Plan v4.3, Sprint 72 T12.5
 * @sprint 72
 */

import type { ResilienceState } from "../state-machine.js";
import type { ModelTier, TaskType, ModelSelectionResult } from "../../models/types.js";
import type { FailureType } from "../failure/index.js";

// ============================================================================
// Autonomy Levels
// ============================================================================

/**
 * Autonomy level for session execution.
 */
export enum AutonomyLevel {
  /** Human reviews all actions */
  SUPERVISED = "SUPERVISED",
  /** Human reviews critical actions only */
  ASSISTED = "ASSISTED",
  /** Autonomous with escalation on blockers */
  AUTONOMOUS = "AUTONOMOUS",
  /** Full autonomy (emergency fallback only) */
  FULL_AUTONOMY = "FULL_AUTONOMY",
}

/**
 * Gate types for autonomy control.
 */
export type AutonomyGate = "A" | "B" | "C";

/**
 * Gate definitions.
 *
 * - Gate A: Design only (no writes) - 30 minutes
 * - Gate B: Limited writes (build + test) - 30 minutes
 * - Gate C: Full autonomy - 2 hours
 */
export const AUTONOMY_GATE_CONFIG: Record<
  AutonomyGate,
  {
    level: AutonomyLevel;
    maxDurationMs: number;
    allowedStages: ResilienceState[];
    maxCostUsd: number;
  }
> = {
  A: {
    level: AutonomyLevel.SUPERVISED,
    maxDurationMs: 30 * 60 * 1000, // 30 minutes
    allowedStages: [],
    maxCostUsd: 0.5,
  },
  B: {
    level: AutonomyLevel.ASSISTED,
    maxDurationMs: 30 * 60 * 1000, // 30 minutes
    allowedStages: [],
    maxCostUsd: 2.0,
  },
  C: {
    level: AutonomyLevel.AUTONOMOUS,
    maxDurationMs: 2 * 60 * 60 * 1000, // 2 hours
    allowedStages: [],
    maxCostUsd: 10.0,
  },
};

// ============================================================================
// Task Types
// ============================================================================

/**
 * Autonomous task definition.
 */
export interface AutonomousTask {
  /** Unique task ID */
  id: string;
  /** Task type (maps to model tier) */
  type: TaskType;
  /** Task description */
  description: string;
  /** Target SDLC stage */
  stage: ResilienceState;
  /** Priority (1 = highest) */
  priority: number;
  /** Estimated cost */
  estimatedCost: number;
  /** Max retries */
  maxRetries: number;
  /** Dependencies (task IDs that must complete first) */
  dependencies: string[];
  /** Created timestamp */
  createdAt: string;
}

/**
 * Task execution result.
 */
export interface TaskExecutionResult {
  /** Task ID */
  taskId: string;
  /** Success flag */
  success: boolean;
  /** Model tier used */
  modelTier: ModelTier;
  /** Model selection details */
  modelSelection: ModelSelectionResult;
  /** Actual cost */
  actualCost: number;
  /** Duration in ms */
  durationMs: number;
  /** Files modified */
  filesModified: string[];
  /** Files created */
  filesCreated: string[];
  /** Failure info (if failed) */
  failure?: {
    type: FailureType;
    message: string;
    retryCount: number;
  };
  /** Output/artifacts */
  output?: string;
}

// ============================================================================
// Decision Types
// ============================================================================

/**
 * Decision point during autonomous execution.
 */
export interface DecisionPoint {
  /** Decision ID */
  id: string;
  /** Decision type */
  type: DecisionType;
  /** Context description */
  context: string;
  /** Available options */
  options: DecisionOption[];
  /** Auto-selected option (if any) */
  autoSelected?: string;
  /** Requires escalation */
  requiresEscalation: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Decision types.
 */
export type DecisionType =
  | "model_selection"
  | "error_recovery"
  | "stage_transition"
  | "budget_warning"
  | "escalation_required";

/**
 * Decision option.
 */
export interface DecisionOption {
  /** Option ID */
  id: string;
  /** Option label */
  label: string;
  /** Risk level */
  risk: "low" | "medium" | "high";
  /** Is conservative choice */
  isConservative: boolean;
  /** Estimated impact */
  impact: string;
}

// ============================================================================
// Escalation Types
// ============================================================================

/**
 * Escalation request.
 */
export interface EscalationRequest {
  /** Escalation ID */
  id: string;
  /** Severity level */
  severity: "info" | "warning" | "critical";
  /** Reason for escalation */
  reason: string;
  /** Context data */
  context: Record<string, unknown>;
  /** Related task ID */
  taskId?: string;
  /** Suggested actions */
  suggestions: string[];
  /** Timestamp */
  timestamp: string;
  /** Is blocking (session pauses) */
  blocking: boolean;
}

/**
 * Escalation response.
 */
export interface EscalationResponse {
  /** Escalation ID */
  escalationId: string;
  /** Action taken */
  action: "proceed" | "abort" | "modify" | "defer";
  /** Modified parameters (if action=modify) */
  modifiedParams?: Record<string, unknown>;
  /** User message */
  message?: string;
  /** Response timestamp */
  respondedAt: string;
}

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Autonomous session configuration.
 */
export interface AutonomousSessionConfig {
  /** Project root directory */
  projectRoot: string;
  /** Project ID */
  projectId: string;
  /** Session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Autonomy gate (A/B/C) */
  gate: AutonomyGate;
  /** Target sprint goal */
  sprintGoal?: string;
  /** Total budget (USD) */
  budgetUsd: number;
  /** Opus cap (USD) */
  opusCapUsd: number;
  /** Opus cap (minutes) */
  opusCapMin: number;
  /** Max task retries */
  maxTaskRetries: number;
  /** Enable conservative fallback */
  conservativeFallback: boolean;
  /** Non-blocking escalation (default: true) */
  nonBlockingEscalation: boolean;
  /** Auto-checkpoint on stage transition */
  autoCheckpoint: boolean;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default autonomous session configuration.
 */
export const DEFAULT_AUTONOMOUS_CONFIG: Omit<
  AutonomousSessionConfig,
  "projectRoot" | "projectId"
> = {
  gate: "B",
  budgetUsd: 10.0,
  opusCapUsd: 3.0,
  opusCapMin: 20,
  maxTaskRetries: 3,
  conservativeFallback: true,
  nonBlockingEscalation: true,
  autoCheckpoint: true,
  debug: false,
};

// ============================================================================
// Session Status
// ============================================================================

/**
 * Autonomous session status.
 */
export interface AutonomousSessionStatus {
  /** Session ID */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Current state */
  state: ResilienceState;
  /** Autonomy level */
  autonomyLevel: AutonomyLevel;
  /** Gate */
  gate: AutonomyGate;
  /** Session duration (ms) */
  durationMs: number;
  /** Tasks completed */
  tasksCompleted: number;
  /** Tasks failed */
  tasksFailed: number;
  /** Tasks pending */
  tasksPending: number;
  /** Current task ID */
  currentTaskId?: string;
  /** Budget spent (USD) */
  budgetSpent: number;
  /** Budget remaining (USD) */
  budgetRemaining: number;
  /** Opus time used (minutes) */
  opusTimeUsed: number;
  /** Escalations count */
  escalationCount: number;
  /** Pending escalations */
  pendingEscalations: EscalationRequest[];
  /** Is active */
  isActive: boolean;
  /** Last activity */
  lastActivity: string;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Autonomous session event types.
 */
export type AutonomousEventType =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_completed"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "model_selected"
  | "model_downgraded"
  | "budget_warning"
  | "budget_exceeded"
  | "escalation_created"
  | "escalation_resolved"
  | "stage_transition"
  | "checkpoint_created"
  | "recovery_attempted";

/**
 * Autonomous session event.
 */
export interface AutonomousEvent {
  /** Event type */
  type: AutonomousEventType;
  /** Session ID */
  sessionId: string;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data: Record<string, unknown>;
}

/**
 * Event listener.
 */
export type AutonomousEventListener = (event: AutonomousEvent) => void;
