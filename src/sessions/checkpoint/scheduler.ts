/**
 * Checkpoint Scheduler
 *
 * Manages automatic checkpointing based on time, events, and patch counts.
 *
 * @module sessions/checkpoint/scheduler
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @authority Master Plan v4.3, Sprint 69-71 T9.3
 * @sprint 69-71
 */

import { createLogger, type Logger } from "../../logging/index.js";
import { type CheckpointReason } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Checkpoint trigger types.
 */
export type CheckpointTriggerType = "time" | "event" | "patch_count";

/**
 * Checkpoint trigger definition.
 */
export interface CheckpointTrigger {
  /** Trigger type */
  type: CheckpointTriggerType;
  /** Trigger condition */
  condition: CheckpointCondition;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Whether this trigger is enabled */
  enabled?: boolean;
}

/**
 * Time-based condition.
 */
export interface TimeCondition {
  /** Interval in milliseconds or human-readable string */
  interval: number | string;
}

/**
 * Event-based condition.
 */
export interface EventCondition {
  /** Event name to trigger on */
  event: CheckpointEvent;
}

/**
 * Patch count condition.
 */
export interface PatchCountCondition {
  /** Number of patches to trigger checkpoint */
  count: number;
}

export type CheckpointCondition =
  | TimeCondition
  | EventCondition
  | PatchCountCondition;

/**
 * Events that can trigger checkpoints.
 */
export type CheckpointEvent =
  | "session_start"
  | "session_end"
  | "stage_complete"
  | "task_complete"
  | "gate_pass"
  | "gate_fail"
  | "error"
  | "escalation"
  | "rollback"
  | "user_request"
  | "before_risky_action";

/**
 * Event data passed to scheduler.
 */
export interface CheckpointEventData {
  /** Event type */
  type: CheckpointEvent;
  /** Event payload */
  payload?: Record<string, unknown>;
  /** Timestamp */
  timestamp?: string;
}

/**
 * Scheduler configuration.
 */
export interface CheckpointSchedulerConfig {
  /** Enable scheduler */
  enabled?: boolean;
  /** Custom triggers (merged with defaults) */
  customTriggers?: CheckpointTrigger[];
  /** Minimum interval between checkpoints (ms) */
  minInterval?: number;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Checkpoint reason with context.
 */
export interface CheckpointReasonContext {
  /** Reason code */
  reason: CheckpointReason;
  /** Human-readable description */
  description: string;
  /** Trigger that caused the checkpoint */
  trigger: CheckpointTrigger;
  /** Event data (if event-based) */
  event?: CheckpointEventData;
}

// ============================================================================
// Default Triggers
// ============================================================================

/**
 * Default checkpoint strategy triggers.
 */
export const DEFAULT_CHECKPOINT_TRIGGERS: CheckpointTrigger[] = [
  // Time-based (every 15 minutes)
  {
    type: "time",
    condition: { interval: 15 * 60 * 1000 }, // 15 min
    priority: 3,
    enabled: true,
  },

  // Event-based (stage completion)
  {
    type: "event",
    condition: { event: "stage_complete" },
    priority: 1,
    enabled: true,
  },

  // Event-based (task completion)
  {
    type: "event",
    condition: { event: "task_complete" },
    priority: 2,
    enabled: true,
  },

  // Event-based (escalation)
  {
    type: "event",
    condition: { event: "escalation" },
    priority: 0,
    enabled: true,
  },

  // Event-based (rollback)
  {
    type: "event",
    condition: { event: "rollback" },
    priority: 0,
    enabled: true,
  },

  // Event-based (before risky action)
  {
    type: "event",
    condition: { event: "before_risky_action" },
    priority: 0,
    enabled: true,
  },

  // Event-based (error)
  {
    type: "event",
    condition: { event: "error" },
    priority: 1,
    enabled: true,
  },

  // Patch-based (every 5 patches)
  {
    type: "patch_count",
    condition: { count: 5 },
    priority: 2,
    enabled: true,
  },
];

// ============================================================================
// Checkpoint Scheduler
// ============================================================================

/**
 * Checkpoint Scheduler.
 *
 * Manages automatic checkpointing based on configurable triggers:
 * - Time-based: Create checkpoint after time interval
 * - Event-based: Create checkpoint on specific events
 * - Patch-based: Create checkpoint after N patches
 *
 * @example
 * ```typescript
 * const scheduler = new CheckpointScheduler({
 *   enabled: true,
 *   minInterval: 5000,
 * });
 *
 * // Check if should checkpoint
 * const result = scheduler.shouldCheckpoint({
 *   type: 'stage_complete',
 *   payload: { stage: '04-BUILD' },
 * });
 *
 * if (result) {
 *   await createCheckpoint(result.reason, result.description);
 *   scheduler.recordCheckpoint();
 * }
 *
 * // Track patches
 * scheduler.onPatchCreated();
 * ```
 */
export class CheckpointScheduler {
  private readonly log: Logger;
  private readonly config: Required<CheckpointSchedulerConfig>;
  private readonly triggers: CheckpointTrigger[];

  private lastCheckpoint: Date;
  private patchesSinceCheckpoint: number = 0;
  private totalCheckpoints: number = 0;

  constructor(config: CheckpointSchedulerConfig = {}) {
    this.log = createLogger("CheckpointScheduler");
    this.config = {
      enabled: true,
      customTriggers: [],
      minInterval: 5000, // 5 seconds minimum between checkpoints
      debug: false,
      ...config,
    };

    // Merge custom triggers with defaults
    this.triggers = [
      ...DEFAULT_CHECKPOINT_TRIGGERS,
      ...this.config.customTriggers,
    ].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    this.lastCheckpoint = new Date();

    if (this.config.debug) {
      this.log.debug("Checkpoint scheduler initialized", {
        triggerCount: this.triggers.length,
        enabled: this.config.enabled,
      });
    }
  }

  // ============================================================================
  // Core Methods
  // ============================================================================

  /**
   * Check if a checkpoint should be created.
   *
   * @param event - Optional event that triggered the check
   * @returns Checkpoint reason context if should checkpoint, null otherwise
   */
  shouldCheckpoint(event?: CheckpointEventData): CheckpointReasonContext | null {
    if (!this.config.enabled) {
      return null;
    }

    // Check minimum interval
    const elapsed = Date.now() - this.lastCheckpoint.getTime();
    if (elapsed < this.config.minInterval) {
      if (this.config.debug) {
        this.log.debug("Checkpoint blocked by min interval", {
          elapsed,
          minInterval: this.config.minInterval,
        });
      }
      return null;
    }

    // Check each trigger in priority order
    for (const trigger of this.triggers) {
      if (!trigger.enabled) continue;

      const shouldTrigger = this.evaluateTrigger(trigger, event);
      if (shouldTrigger) {
        const context = this.buildReasonContext(trigger, event);
        if (this.config.debug) {
          this.log.debug("Checkpoint trigger matched", {
            type: trigger.type,
            reason: context.reason,
          });
        }
        return context;
      }
    }

    return null;
  }

  /**
   * Record that a checkpoint was created.
   */
  recordCheckpoint(): void {
    this.lastCheckpoint = new Date();
    this.patchesSinceCheckpoint = 0;
    this.totalCheckpoints++;

    if (this.config.debug) {
      this.log.debug("Checkpoint recorded", {
        total: this.totalCheckpoints,
      });
    }
  }

  /**
   * Record that a patch was created.
   */
  onPatchCreated(): void {
    this.patchesSinceCheckpoint++;

    if (this.config.debug) {
      this.log.debug("Patch recorded", {
        patchesSinceCheckpoint: this.patchesSinceCheckpoint,
      });
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get time since last checkpoint in ms.
   */
  getTimeSinceLastCheckpoint(): number {
    return Date.now() - this.lastCheckpoint.getTime();
  }

  /**
   * Get number of patches since last checkpoint.
   */
  getPatchesSinceCheckpoint(): number {
    return this.patchesSinceCheckpoint;
  }

  /**
   * Get total checkpoints created in this session.
   */
  getTotalCheckpoints(): number {
    return this.totalCheckpoints;
  }

  /**
   * Get enabled triggers.
   */
  getEnabledTriggers(): CheckpointTrigger[] {
    return this.triggers.filter((t) => t.enabled);
  }

  /**
   * Check if scheduler is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Enable or disable the scheduler.
   */
  setEnabled(enabled: boolean): void {
    (this.config as { enabled: boolean }).enabled = enabled;
  }

  /**
   * Enable or disable a specific trigger type.
   */
  setTriggerEnabled(type: CheckpointTriggerType, enabled: boolean): void {
    for (const trigger of this.triggers) {
      if (trigger.type === type) {
        (trigger as { enabled: boolean }).enabled = enabled;
      }
    }
  }

  /**
   * Update time interval.
   */
  setTimeInterval(intervalMs: number): void {
    for (const trigger of this.triggers) {
      if (trigger.type === "time") {
        (trigger.condition as TimeCondition).interval = intervalMs;
      }
    }
  }

  /**
   * Update patch count threshold.
   */
  setPatchCountThreshold(count: number): void {
    for (const trigger of this.triggers) {
      if (trigger.type === "patch_count") {
        (trigger.condition as PatchCountCondition).count = count;
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Evaluate a single trigger.
   */
  private evaluateTrigger(
    trigger: CheckpointTrigger,
    event?: CheckpointEventData
  ): boolean {
    switch (trigger.type) {
      case "time":
        return this.evaluateTimeTrigger(trigger.condition as TimeCondition);

      case "event":
        return this.evaluateEventTrigger(
          trigger.condition as EventCondition,
          event
        );

      case "patch_count":
        return this.evaluatePatchCountTrigger(
          trigger.condition as PatchCountCondition
        );

      default:
        return false;
    }
  }

  /**
   * Evaluate time-based trigger.
   */
  private evaluateTimeTrigger(condition: TimeCondition): boolean {
    const intervalMs =
      typeof condition.interval === "string"
        ? this.parseInterval(condition.interval)
        : condition.interval;

    const elapsed = Date.now() - this.lastCheckpoint.getTime();
    return elapsed >= intervalMs;
  }

  /**
   * Evaluate event-based trigger.
   */
  private evaluateEventTrigger(
    condition: EventCondition,
    event?: CheckpointEventData
  ): boolean {
    if (!event) return false;
    return event.type === condition.event;
  }

  /**
   * Evaluate patch count trigger.
   */
  private evaluatePatchCountTrigger(condition: PatchCountCondition): boolean {
    return this.patchesSinceCheckpoint >= condition.count;
  }

  /**
   * Parse human-readable interval string.
   */
  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)\s*(min|minute|minutes|s|sec|second|seconds|h|hour|hours)$/i);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!.toLowerCase();

    switch (unit) {
      case "s":
      case "sec":
      case "second":
      case "seconds":
        return value * 1000;
      case "min":
      case "minute":
      case "minutes":
        return value * 60 * 1000;
      case "h":
      case "hour":
      case "hours":
        return value * 60 * 60 * 1000;
      default:
        return value;
    }
  }

  /**
   * Build checkpoint reason context from trigger.
   */
  private buildReasonContext(
    trigger: CheckpointTrigger,
    event?: CheckpointEventData
  ): CheckpointReasonContext {
    switch (trigger.type) {
      case "time":
        return {
          reason: "time_interval",
          description: "Automatic checkpoint (time interval)",
          trigger,
        };

      case "event":
        return this.buildEventReasonContext(trigger, event);

      case "patch_count":
        return {
          reason: "milestone",
          description: `Automatic checkpoint (${this.patchesSinceCheckpoint} patches)`,
          trigger,
        };

      default:
        return {
          reason: "manual",
          description: "Manual checkpoint",
          trigger,
        };
    }
  }

  /**
   * Build reason context for event triggers.
   */
  private buildEventReasonContext(
    trigger: CheckpointTrigger,
    event?: CheckpointEventData
  ): CheckpointReasonContext {
    const eventCondition = trigger.condition as EventCondition;
    const eventType = eventCondition.event;

    const reasonMap: Record<CheckpointEvent, CheckpointReason> = {
      session_start: "session_start",
      session_end: "session_end",
      stage_complete: "milestone",
      task_complete: "milestone",
      gate_pass: "milestone",
      gate_fail: "error_recovery",
      error: "error_recovery",
      escalation: "escalation",
      rollback: "before_rollback",
      user_request: "user_pause",
      before_risky_action: "before_risky_action",
    };

    const descriptionMap: Record<CheckpointEvent, string> = {
      session_start: "Session started",
      session_end: "Session ended",
      stage_complete: `Stage completed: ${event?.payload?.stage ?? "unknown"}`,
      task_complete: `Task completed: ${event?.payload?.task ?? "unknown"}`,
      gate_pass: `Gate passed: ${event?.payload?.gate ?? "unknown"}`,
      gate_fail: `Gate failed: ${event?.payload?.gate ?? "unknown"}`,
      error: `Error occurred: ${event?.payload?.error ?? "unknown"}`,
      escalation: "Issue escalated to human",
      rollback: "Before rollback",
      user_request: "User requested checkpoint",
      before_risky_action: `Before risky action: ${event?.payload?.action ?? "unknown"}`,
    };

    const result: CheckpointReasonContext = {
      reason: reasonMap[eventType] ?? "manual",
      description: descriptionMap[eventType] ?? `Event: ${eventType}`,
      trigger,
    };
    if (event) result.event = event;
    return result;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let defaultScheduler: CheckpointScheduler | null = null;

/**
 * Get the default checkpoint scheduler.
 */
export function getCheckpointScheduler(): CheckpointScheduler {
  if (!defaultScheduler) {
    defaultScheduler = new CheckpointScheduler();
  }
  return defaultScheduler;
}

/**
 * Reset the default checkpoint scheduler (for testing).
 */
export function resetCheckpointScheduler(): void {
  defaultScheduler = null;
}

/**
 * Create a new checkpoint scheduler.
 */
export function createCheckpointScheduler(
  config?: CheckpointSchedulerConfig
): CheckpointScheduler {
  return new CheckpointScheduler(config);
}
