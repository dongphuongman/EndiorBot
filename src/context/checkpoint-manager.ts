/**
 * Checkpoint Manager
 *
 * Manages conversation checkpoints for restore functionality.
 * Sprint 65: T5.7 - Checkpoint auto-creation logic.
 * Sprint 65: T5.8 - Checkpoint restore functionality.
 *
 * Checkpoints capture conversation state at key moments:
 * - Manual user request
 * - Time-based intervals
 * - Token count thresholds
 * - Task completion milestones
 * - Pre-destructive operations
 *
 * @module context/checkpoint-manager
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.7-T5.8
 * @sprint 65
 */

import { createLogger, type Logger } from "../logging/index.js";
import { getContextAnchor, type ContextAnchor } from "./context-anchor.js";
import {
  type Checkpoint,
  type CheckpointTrigger,
  type AnchorPoint,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a checkpoint.
 */
export interface CreateCheckpointOptions {
  /** Checkpoint name */
  name: string;
  /** What triggered the checkpoint */
  trigger: CheckpointTrigger;
  /** Git commit SHA (optional) */
  gitCommit?: string;
  /** Git branch (optional) */
  gitBranch?: string;
  /** Modified files since last checkpoint */
  modifiedFiles?: string[];
  /** Current token count */
  tokenCount?: number;
  /** SDLC stage */
  stage?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for restoring a checkpoint.
 */
export interface RestoreCheckpointOptions {
  /** Skip git operations */
  skipGit?: boolean;
  /** Only restore anchors, not files */
  anchorsOnly?: boolean;
}

/**
 * Checkpoint restore result.
 */
export interface RestoreResult {
  /** Whether restore was successful */
  success: boolean;
  /** Checkpoint that was restored */
  checkpoint: Checkpoint;
  /** Anchors that were activated */
  activatedAnchors: string[];
  /** Errors during restore */
  errors: string[];
  /** Restore instructions if manual steps needed */
  instructions?: string;
}

/**
 * Auto-checkpoint configuration.
 */
export interface AutoCheckpointConfig {
  /** Enable time-based checkpoints */
  timeEnabled: boolean;
  /** Time interval in minutes */
  timeIntervalMinutes: number;
  /** Enable token-based checkpoints */
  tokenEnabled: boolean;
  /** Token count threshold */
  tokenThreshold: number;
  /** Enable milestone-based checkpoints */
  milestoneEnabled: boolean;
  /** Maximum checkpoints to keep */
  maxCheckpoints: number;
}

/**
 * Default auto-checkpoint configuration.
 */
export const DEFAULT_AUTO_CHECKPOINT_CONFIG: AutoCheckpointConfig = {
  timeEnabled: true,
  timeIntervalMinutes: 30,
  tokenEnabled: true,
  tokenThreshold: 50000,
  milestoneEnabled: true,
  maxCheckpoints: 50,
};

// ============================================================================
// CheckpointManager Class
// ============================================================================

/**
 * Checkpoint Manager.
 *
 * Manages checkpoint creation, restoration, and auto-creation logic.
 *
 * @example
 * ```typescript
 * const manager = getCheckpointManager();
 *
 * // Create a checkpoint
 * const checkpoint = await manager.create({
 *   name: "Pre-refactor",
 *   trigger: "pre_destructive",
 * });
 *
 * // List checkpoints
 * const checkpoints = await manager.list();
 *
 * // Restore a checkpoint
 * const result = await manager.restore(checkpoint.id);
 * ```
 */
export class CheckpointManager {
  private readonly anchor: ContextAnchor;
  private readonly logger: Logger;
  private readonly config: AutoCheckpointConfig;
  private autoCheckpointTimer: ReturnType<typeof setInterval> | null = null;
  private lastCheckpointTime: Date | null = null;
  private currentTokenCount = 0;

  constructor(
    anchor?: ContextAnchor,
    config: Partial<AutoCheckpointConfig> = {}
  ) {
    this.anchor = anchor ?? getContextAnchor();
    this.logger = createLogger("CheckpointManager");
    this.config = { ...DEFAULT_AUTO_CHECKPOINT_CONFIG, ...config };
  }

  // =========================================================================
  // Checkpoint Creation
  // =========================================================================

  /**
   * Create a new checkpoint.
   */
  async create(options: CreateCheckpointOptions): Promise<Checkpoint> {
    // Collect active anchor IDs
    const activeAnchors = await this.collectActiveAnchorIds();

    // Build checkpoint data with proper optional property handling
    const checkpointData: Omit<Checkpoint, "id" | "createdAt" | "updatedAt"> = {
      type: "checkpoint",
      title: `Checkpoint: ${options.name}`,
      content: `Checkpoint created via ${options.trigger}`,
      priority: this.getPriorityForTrigger(options.trigger),
      state: "active",
      name: options.name,
      trigger: options.trigger,
      modifiedFiles: options.modifiedFiles ?? [],
      tokenCount: options.tokenCount ?? this.currentTokenCount,
      activeAnchors,
      restorable: true,
      tags: ["checkpoint", options.trigger],
      metadata: options.metadata ?? {},
    };

    // Add optional properties only if defined
    if (options.stage) {
      checkpointData.stage = options.stage;
    }
    if (options.gitCommit) {
      checkpointData.gitCommit = options.gitCommit;
    }
    if (options.gitBranch) {
      checkpointData.gitBranch = options.gitBranch;
    }

    const checkpoint = await this.anchor.create<Checkpoint>(checkpointData);

    this.lastCheckpointTime = new Date();

    this.logger.info("Checkpoint created", {
      id: checkpoint.id,
      name: checkpoint.name,
      trigger: checkpoint.trigger,
      activeAnchors: activeAnchors.length,
    });

    // Cleanup old checkpoints if needed
    await this.cleanupOldCheckpoints();

    return checkpoint;
  }

  /**
   * Create a manual checkpoint.
   */
  async createManual(name: string, stage?: string): Promise<Checkpoint> {
    const options: CreateCheckpointOptions = {
      name,
      trigger: "manual",
    };
    if (stage) {
      options.stage = stage;
    }
    return this.create(options);
  }

  /**
   * Create a pre-destructive checkpoint.
   */
  async createPreDestructive(
    operation: string,
    stage?: string
  ): Promise<Checkpoint> {
    const options: CreateCheckpointOptions = {
      name: `Pre-${operation}`,
      trigger: "pre_destructive",
      metadata: { operation },
    };
    if (stage) {
      options.stage = stage;
    }
    return this.create(options);
  }

  /**
   * Create a milestone checkpoint.
   */
  async createMilestone(
    milestone: string,
    stage?: string
  ): Promise<Checkpoint> {
    const options: CreateCheckpointOptions = {
      name: `Milestone: ${milestone}`,
      trigger: "auto_milestone",
      metadata: { milestone },
    };
    if (stage) {
      options.stage = stage;
    }
    return this.create(options);
  }

  /**
   * Create a session end checkpoint.
   */
  async createSessionEnd(): Promise<Checkpoint> {
    return this.create({
      name: "Session End",
      trigger: "session_end",
    });
  }

  // =========================================================================
  // Checkpoint Retrieval
  // =========================================================================

  /**
   * Get a checkpoint by ID.
   */
  async get(id: string): Promise<Checkpoint | null> {
    return this.anchor.get<Checkpoint>(id);
  }

  /**
   * List all checkpoints.
   */
  async list(limit?: number): Promise<Checkpoint[]> {
    const query: import("./types.js").AnchorQuery = {
      types: ["checkpoint"],
      sortBy: "createdAt",
      sortDirection: "desc",
    };
    if (limit !== undefined) {
      query.limit = limit;
    }
    return this.anchor.query<Checkpoint>(query);
  }

  /**
   * Get the most recent checkpoint.
   */
  async getMostRecent(): Promise<Checkpoint | null> {
    return this.anchor.getMostRecent<Checkpoint>("checkpoint");
  }

  /**
   * Get checkpoints by trigger type.
   */
  async getByTrigger(trigger: CheckpointTrigger): Promise<Checkpoint[]> {
    return this.anchor.query<Checkpoint>({
      types: ["checkpoint"],
      tags: [trigger],
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  }

  /**
   * Get restorable checkpoints.
   */
  async getRestorable(): Promise<Checkpoint[]> {
    const all = await this.list();
    return all.filter((cp) => cp.restorable);
  }

  // =========================================================================
  // Checkpoint Restoration
  // =========================================================================

  /**
   * Restore a checkpoint.
   */
  async restore(
    checkpointId: string,
    _options: RestoreCheckpointOptions = {}
  ): Promise<RestoreResult> {
    const checkpoint = await this.get(checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        checkpoint: null as unknown as Checkpoint,
        activatedAnchors: [],
        errors: [`Checkpoint not found: ${checkpointId}`],
      };
    }

    if (!checkpoint.restorable) {
      const result: RestoreResult = {
        success: false,
        checkpoint,
        activatedAnchors: [],
        errors: ["Checkpoint is not restorable"],
      };
      if (checkpoint.restoreInstructions) {
        result.instructions = checkpoint.restoreInstructions;
      }
      return result;
    }

    const errors: string[] = [];
    const activatedAnchors: string[] = [];

    // Restore active anchors
    for (const anchorId of checkpoint.activeAnchors) {
      try {
        const anchor = await this.anchor.get(anchorId);
        if (anchor && anchor.state === "archived") {
          await this.anchor.update(anchorId, { state: "active" });
          activatedAnchors.push(anchorId);
        } else if (anchor) {
          activatedAnchors.push(anchorId);
        }
      } catch (error) {
        errors.push(
          `Failed to restore anchor ${anchorId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Emit restore event
    await this.anchor.update(checkpointId, {
      metadata: {
        ...checkpoint.metadata,
        lastRestored: new Date().toISOString(),
        restoreCount: ((checkpoint.metadata.restoreCount as number) ?? 0) + 1,
      },
    });

    const success = errors.length === 0;

    this.logger.info("Checkpoint restored", {
      id: checkpointId,
      name: checkpoint.name,
      success,
      activatedAnchors: activatedAnchors.length,
      errors: errors.length,
    });

    const result: RestoreResult = {
      success,
      checkpoint,
      activatedAnchors,
      errors,
    };
    if (!success && checkpoint.restoreInstructions) {
      result.instructions = checkpoint.restoreInstructions;
    }
    return result;
  }

  // =========================================================================
  // Auto-Checkpoint Logic
  // =========================================================================

  /**
   * Start auto-checkpoint monitoring.
   */
  startAutoCheckpoint(): void {
    if (this.autoCheckpointTimer) {
      return;
    }

    if (!this.config.timeEnabled) {
      return;
    }

    this.autoCheckpointTimer = setInterval(async () => {
      await this.checkTimeBasedCheckpoint();
    }, this.config.timeIntervalMinutes * 60 * 1000);

    this.logger.debug("Auto-checkpoint started", {
      intervalMinutes: this.config.timeIntervalMinutes,
    });
  }

  /**
   * Stop auto-checkpoint monitoring.
   */
  stopAutoCheckpoint(): void {
    if (this.autoCheckpointTimer) {
      clearInterval(this.autoCheckpointTimer);
      this.autoCheckpointTimer = null;
      this.logger.debug("Auto-checkpoint stopped");
    }
  }

  /**
   * Update current token count (for token-based checkpoints).
   */
  async updateTokenCount(tokenCount: number): Promise<Checkpoint | null> {
    this.currentTokenCount = tokenCount;

    if (!this.config.tokenEnabled) {
      return null;
    }

    // Check if we should create a token-based checkpoint
    if (tokenCount >= this.config.tokenThreshold) {
      const lastCheckpoint = await this.getMostRecent();

      // Don't create if we just created one
      const minInterval = 5 * 60 * 1000; // 5 minutes
      if (
        lastCheckpoint &&
        Date.now() - lastCheckpoint.createdAt.getTime() < minInterval
      ) {
        return null;
      }

      // Don't create if the last one was also token-based
      if (lastCheckpoint && lastCheckpoint.trigger === "auto_tokens") {
        return null;
      }

      const checkpoint = await this.create({
        name: `Token threshold (${tokenCount})`,
        trigger: "auto_tokens",
        tokenCount,
      });

      this.logger.info("Token-based checkpoint created", {
        tokenCount,
        threshold: this.config.tokenThreshold,
      });

      return checkpoint;
    }

    return null;
  }

  /**
   * Check and create time-based checkpoint if needed.
   */
  private async checkTimeBasedCheckpoint(): Promise<void> {
    const now = new Date();
    const intervalMs = this.config.timeIntervalMinutes * 60 * 1000;

    if (
      this.lastCheckpointTime &&
      now.getTime() - this.lastCheckpointTime.getTime() < intervalMs
    ) {
      return;
    }

    await this.create({
      name: `Auto (${this.config.timeIntervalMinutes}min)`,
      trigger: "auto_time",
      tokenCount: this.currentTokenCount,
    });

    this.logger.debug("Time-based checkpoint created");
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Cleanup old checkpoints to stay within limit.
   */
  private async cleanupOldCheckpoints(): Promise<void> {
    const checkpoints = await this.list();

    if (checkpoints.length <= this.config.maxCheckpoints) {
      return;
    }

    // Keep manual and pre_destructive checkpoints longer
    const toDelete = checkpoints
      .filter(
        (cp) => cp.trigger !== "manual" && cp.trigger !== "pre_destructive"
      )
      .slice(this.config.maxCheckpoints - 10); // Keep some buffer

    for (const cp of toDelete) {
      await this.anchor.archive(cp.id);
      this.logger.debug("Checkpoint archived", { id: cp.id });
    }
  }

  /**
   * Archive a checkpoint.
   */
  async archive(checkpointId: string): Promise<Checkpoint | null> {
    const updated = await this.anchor.archive(checkpointId);
    return updated as Checkpoint | null;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Collect IDs of all active anchors.
   */
  private async collectActiveAnchorIds(): Promise<string[]> {
    const active = await this.anchor.query<AnchorPoint>({
      states: ["active"],
    });
    return active.map((a) => a.id);
  }

  /**
   * Get priority for trigger type.
   */
  private getPriorityForTrigger(
    trigger: CheckpointTrigger
  ): "critical" | "high" | "medium" | "low" {
    switch (trigger) {
      case "manual":
        return "high";
      case "pre_destructive":
        return "critical";
      case "auto_milestone":
        return "high";
      case "session_end":
        return "high";
      case "auto_time":
        return "low";
      case "auto_tokens":
        return "medium";
    }
  }

  /**
   * Format checkpoint for display.
   */
  formatForDisplay(checkpoint: Checkpoint): string {
    const lines: string[] = [
      `## Checkpoint: ${checkpoint.name}`,
      "",
      `**Trigger:** ${checkpoint.trigger}`,
      `**Created:** ${checkpoint.createdAt.toISOString()}`,
      `**Tokens:** ${checkpoint.tokenCount}`,
      `**Restorable:** ${checkpoint.restorable ? "Yes" : "No"}`,
    ];

    if (checkpoint.gitBranch) {
      lines.push(`**Branch:** ${checkpoint.gitBranch}`);
    }

    if (checkpoint.gitCommit) {
      lines.push(`**Commit:** ${checkpoint.gitCommit.slice(0, 8)}`);
    }

    if (checkpoint.modifiedFiles.length > 0) {
      lines.push("", "**Modified Files:**");
      for (const file of checkpoint.modifiedFiles.slice(0, 10)) {
        lines.push(`- ${file}`);
      }
      if (checkpoint.modifiedFiles.length > 10) {
        lines.push(`- ... and ${checkpoint.modifiedFiles.length - 10} more`);
      }
    }

    if (checkpoint.activeAnchors.length > 0) {
      lines.push("", `**Active Anchors:** ${checkpoint.activeAnchors.length}`);
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: CheckpointManager | null = null;

/**
 * Get the default CheckpointManager instance.
 */
export function getCheckpointManager(
  config?: Partial<AutoCheckpointConfig>
): CheckpointManager {
  if (!defaultManager) {
    defaultManager = new CheckpointManager(undefined, config);
  }
  return defaultManager;
}

/**
 * Reset the default CheckpointManager instance.
 */
export function resetCheckpointManager(): void {
  if (defaultManager) {
    defaultManager.stopAutoCheckpoint();
  }
  defaultManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a checkpoint.
 */
export async function createCheckpoint(
  name: string,
  trigger: CheckpointTrigger = "manual",
  options: Partial<CreateCheckpointOptions> = {}
): Promise<Checkpoint> {
  const manager = getCheckpointManager();
  return manager.create({ name, trigger, ...options });
}

/**
 * Restore a checkpoint.
 */
export async function restoreCheckpoint(
  checkpointId: string,
  options?: RestoreCheckpointOptions
): Promise<RestoreResult> {
  const manager = getCheckpointManager();
  return manager.restore(checkpointId, options);
}

/**
 * List all checkpoints.
 */
export async function listCheckpoints(limit?: number): Promise<Checkpoint[]> {
  const manager = getCheckpointManager();
  return manager.list(limit);
}
