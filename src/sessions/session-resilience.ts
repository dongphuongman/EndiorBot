/**
 * Session Resilience Manager
 *
 * Enhanced session manager with state machine, checkpointing, and recovery.
 * Provides autonomous session execution with resilience features.
 *
 * @module sessions/session-resilience
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @authority Master Plan v4.3, Sprint 69-71 T9.2
 * @sprint 69-71
 */

import { createLogger, type Logger } from "../logging/index.js";
import {
  ResilienceStateMachine,
  ResilienceState,
  stateToSDLCStage,
  type StateHistoryEntry,
} from "./state-machine.js";
import {
  createCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  listCheckpoints,
  getLatestCheckpoint,
  type CheckpointState,
  type CheckpointReason,
  type SoulType,
  type ExecutionPhase,
  type TokenUsageRecord,
} from "./checkpoint/index.js";
import { PatchManager } from "../sdlc/patches/index.js";
import type { Session } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Session resilience configuration.
 */
export interface SessionResilienceConfig {
  /** Project root directory */
  projectRoot: string;
  /** Session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Project ID */
  projectId: string;
  /** Active agent persona */
  activeSoul?: SoulType;
  /** Enable auto-checkpointing */
  autoCheckpoint?: boolean;
  /** Checkpoint interval in patches */
  checkpointPatchInterval?: number;
  /** Checkpoint interval in ms (0 = disabled) */
  checkpointTimeInterval?: number;
  /** Max retries for transient failures */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Stage execution result.
 */
export interface StageResult {
  /** Stage ID */
  stage: string;
  /** Success flag */
  success: boolean;
  /** Duration in ms */
  durationMs: number;
  /** Files modified */
  filesModified?: string[];
  /** Files created */
  filesCreated?: string[];
  /** Error if failed */
  error?: string;
  /** Checkpoint ID created */
  checkpointId?: string;
}

/**
 * Session status.
 */
export interface SessionStatus {
  /** Session ID */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Current state */
  state: ResilienceState;
  /** Current SDLC stage (if applicable) */
  sdlcStage: string | null;
  /** Session duration in ms */
  durationMs: number;
  /** Last activity timestamp */
  lastActivity: string;
  /** State history */
  history: StateHistoryEntry[];
  /** Checkpoint count */
  checkpointCount: number;
  /** Latest checkpoint ID */
  latestCheckpointId?: string;
  /** Patch count */
  patchCount: number;
  /** Is active (not terminal, not paused) */
  isActive: boolean;
}

/**
 * Session start options.
 */
export interface StartOptions {
  /** Checkpoint ID to resume from */
  resumeFrom?: string;
  /** Initial state override */
  initialState?: ResilienceState;
}

// ============================================================================
// Session Resilience Manager
// ============================================================================

/**
 * Session Resilience Manager.
 *
 * Provides autonomous session execution with:
 * - State machine for structured transitions
 * - Auto-checkpointing on events and intervals
 * - Integration with PatchManager for change tracking
 * - Checkpoint-based resume capability
 *
 * @example
 * ```typescript
 * const manager = new SessionResilienceManager({
 *   projectRoot: '/path/to/project',
 *   projectId: 'my-project',
 * });
 *
 * // Start new session
 * await manager.start();
 *
 * // Execute stages
 * await manager.executeStage('04-BUILD');
 *
 * // Check status
 * const status = manager.getStatus();
 * console.log(status.state); // BUILD
 *
 * // Resume from checkpoint
 * await manager.start({ resumeFrom: 'ckpt-20260302-...' });
 * ```
 */
export class SessionResilienceManager {
  private readonly log: Logger;
  private readonly config: Required<SessionResilienceConfig>;
  private stateMachine: ResilienceStateMachine;
  private patchManager: PatchManager;
  private startTime: Date;
  private patchesSinceCheckpoint: number = 0;
  private lastCheckpointTime: Date;
  private tokenUsage: TokenUsageRecord[] = [];
  private sessionCost: number = 0;

  constructor(config: SessionResilienceConfig) {
    this.log = createLogger("SessionResilienceManager");
    this.config = {
      sessionId: config.sessionId ?? this.generateSessionId(),
      activeSoul: "coder",
      autoCheckpoint: true,
      checkpointPatchInterval: 5,
      checkpointTimeInterval: 15 * 60 * 1000, // 15 minutes
      maxRetries: 3,
      debug: false,
      ...config,
    };

    this.startTime = new Date();
    this.lastCheckpointTime = new Date();

    // Initialize state machine
    this.stateMachine = new ResilienceStateMachine(this.config.sessionId, {
      debug: this.config.debug,
    });

    // Initialize patch manager
    this.patchManager = new PatchManager({
      projectRoot: this.config.projectRoot,
    });

    this.log.info("Session resilience manager initialized", {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
    });
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Start a new session or resume from checkpoint.
   */
  async start(options: StartOptions = {}): Promise<void> {
    if (options.resumeFrom) {
      await this.resume(options.resumeFrom);
      return;
    }

    // Create initial state machine if needed
    if (options.initialState) {
      this.stateMachine = new ResilienceStateMachine(this.config.sessionId, {
        initialState: options.initialState,
        debug: this.config.debug,
      });
    }

    // Transition to PLANNING (start)
    if (this.stateMachine.getState() === ResilienceState.INIT) {
      await this.stateMachine.transition("start");
    }

    // Create initial checkpoint
    if (this.config.autoCheckpoint) {
      await this.createCheckpoint("session_start", "Session started");
    }

    this.log.info("Session started", {
      sessionId: this.config.sessionId,
      state: this.stateMachine.getState(),
    });
  }

  /**
   * Resume session from checkpoint.
   */
  async resume(checkpointId: string): Promise<void> {
    this.log.info("Resuming session from checkpoint", {
      sessionId: this.config.sessionId,
      checkpointId,
    });

    const checkpoint = await loadCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // Restore state machine from checkpoint
    if (checkpoint.statemachine) {
      const stateData = {
        sessionId: this.config.sessionId,
        currentState: this.inferStateFromCheckpoint(checkpoint),
        previousState: null,
        history: [],
      };
      this.stateMachine = ResilienceStateMachine.restore(stateData);
    }

    // Transition to resumed state if paused
    if (this.stateMachine.getState() === ResilienceState.PAUSED) {
      await this.stateMachine.transition("resume");
    }

    // Update cost tracking
    this.sessionCost = checkpoint.cost?.sessionCostSoFar ?? 0;
    this.tokenUsage = checkpoint.cost?.tokenUsage ?? [];

    this.log.info("Session resumed", {
      sessionId: this.config.sessionId,
      state: this.stateMachine.getState(),
      fromCheckpoint: checkpointId,
    });
  }

  /**
   * Pause the current session.
   */
  async pause(reason?: string): Promise<string> {
    await this.stateMachine.transition("pause");

    // Create checkpoint
    const checkpointId = await this.createCheckpoint(
      "user_pause",
      reason ?? "Session paused by user"
    );

    this.log.info("Session paused", {
      sessionId: this.config.sessionId,
      checkpointId,
    });

    return checkpointId;
  }

  /**
   * Complete the session (mark as DONE).
   */
  async complete(): Promise<void> {
    // Try to transition to DONE
    if (this.stateMachine.canTransition("tests_pass")) {
      await this.stateMachine.transition("tests_pass");
    } else if (this.stateMachine.canTransition("skip_test")) {
      await this.stateMachine.transition("skip_test");
    }

    // Final checkpoint
    if (this.config.autoCheckpoint) {
      await this.createCheckpoint("session_complete", "Session completed");
    }

    this.log.info("Session completed", {
      sessionId: this.config.sessionId,
      duration: Date.now() - this.startTime.getTime(),
    });
  }

  // ============================================================================
  // Stage Execution
  // ============================================================================

  /**
   * Execute a stage with auto-checkpointing.
   */
  async executeStage(
    stageId: string,
    work: () => Promise<{ filesModified?: string[]; filesCreated?: string[] }>
  ): Promise<StageResult> {
    const startTime = Date.now();

    this.log.info("Executing stage", {
      sessionId: this.config.sessionId,
      stage: stageId,
    });

    try {
      // Transition to stage state if needed
      const targetState = this.getStateForStage(stageId);
      if (
        targetState &&
        this.stateMachine.getState() !== targetState
      ) {
        const trigger = this.getTriggerForState(targetState);
        if (trigger && this.stateMachine.canTransition(trigger)) {
          await this.stateMachine.transition(trigger);
        }
      }

      // Execute work
      const result = await work();

      // Track changes
      if (result.filesModified || result.filesCreated) {
        this.patchesSinceCheckpoint++;
      }

      // Auto-checkpoint if threshold reached
      let checkpointId: string | undefined;
      if (this.shouldCheckpoint()) {
        checkpointId = await this.createCheckpoint(
          "stage_complete",
          `Stage ${stageId} complete`
        );
      }

      const durationMs = Date.now() - startTime;

      this.log.info("Stage completed", {
        sessionId: this.config.sessionId,
        stage: stageId,
        durationMs,
        checkpointCreated: !!checkpointId,
      });

      const stageResult: StageResult = {
        stage: stageId,
        success: true,
        durationMs,
      };
      if (result.filesModified) stageResult.filesModified = result.filesModified;
      if (result.filesCreated) stageResult.filesCreated = result.filesCreated;
      if (checkpointId) stageResult.checkpointId = checkpointId;
      return stageResult;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log.error("Stage failed", {
        sessionId: this.config.sessionId,
        stage: stageId,
        error: errorMessage,
      });

      return {
        stage: stageId,
        success: false,
        durationMs,
        error: errorMessage,
      };
    }
  }

  // ============================================================================
  // Checkpointing
  // ============================================================================

  /**
   * Create a checkpoint.
   */
  async createCheckpoint(
    reason: CheckpointReason,
    description?: string
  ): Promise<string> {
    const session: Session = {
      id: this.config.sessionId,
      projectId: this.config.projectId,
      createdAt: this.startTime,
      lastActiveAt: new Date(),
      messages: [],
      tokenCount: 0,
      maxTokens: 50000,
      sdlcStage: (stateToSDLCStage(this.stateMachine.getState()) ??
        "04-BUILD") as Session["sdlcStage"],
      activeGates: [],
      compactionCount: 0,
    };

    const checkpointOptions: import("./checkpoint/index.js").CreateCheckpointOptions = {
      reason,
      session,
      activeSoul: this.config.activeSoul,
      currentPhase: this.inferPhaseFromState(),
      sessionCostSoFar: this.sessionCost,
      tokenUsage: this.tokenUsage,
      modifiedFiles: [],
      createdFiles: [],
    };
    if (description) checkpointOptions.description = description;

    const checkpoint = await createCheckpoint(checkpointOptions);

    await saveCheckpoint(checkpoint);

    // Reset checkpoint counters
    this.patchesSinceCheckpoint = 0;
    this.lastCheckpointTime = new Date();

    this.log.debug("Checkpoint created", {
      checkpointId: checkpoint.meta.id,
      reason,
    });

    return checkpoint.meta.id;
  }

  /**
   * Get list of checkpoints for this session.
   */
  async getCheckpoints(): Promise<
    Array<{ id: string; createdAt: string; reason: string }>
  > {
    const checkpoints = await listCheckpoints(this.config.projectId);
    return checkpoints.map((c) => ({
      id: c.id,
      createdAt:
        c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      reason: c.reason,
    }));
  }

  /**
   * Get latest checkpoint.
   */
  async getLatestCheckpoint(): Promise<CheckpointState | null> {
    return getLatestCheckpoint(this.config.projectId);
  }

  // ============================================================================
  // Status
  // ============================================================================

  /**
   * Get current session status.
   */
  getStatus(): SessionStatus {
    const state = this.stateMachine.getState();
    const history = this.stateMachine.getHistory();

    const status: SessionStatus = {
      sessionId: this.config.sessionId,
      projectId: this.config.projectId,
      state,
      sdlcStage: stateToSDLCStage(state),
      durationMs: Date.now() - this.startTime.getTime(),
      lastActivity: new Date().toISOString(),
      history,
      checkpointCount: 0, // Would need to query
      patchCount: this.patchesSinceCheckpoint,
      isActive: this.stateMachine.isActive(),
    };

    return status;
  }

  /**
   * Get state machine.
   */
  getStateMachine(): ResilienceStateMachine {
    return this.stateMachine;
  }

  /**
   * Get patch manager.
   */
  getPatchManager(): PatchManager {
    return this.patchManager;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Check if checkpoint should be created.
   */
  private shouldCheckpoint(): boolean {
    if (!this.config.autoCheckpoint) return false;

    // Check patch count threshold
    if (this.patchesSinceCheckpoint >= this.config.checkpointPatchInterval) {
      return true;
    }

    // Check time threshold
    if (this.config.checkpointTimeInterval > 0) {
      const elapsed = Date.now() - this.lastCheckpointTime.getTime();
      if (elapsed >= this.config.checkpointTimeInterval) {
        return true;
      }
    }

    return false;
  }

  /**
   * Infer state from checkpoint data.
   */
  private inferStateFromCheckpoint(checkpoint: CheckpointState): ResilienceState {
    const phase = checkpoint.execution?.currentPhase;
    if (!phase) return ResilienceState.INIT;

    const mapping: Record<string, ResilienceState> = {
      planning: ResilienceState.PLANNING,
      design: ResilienceState.DESIGN,
      implementation: ResilienceState.BUILD,
      testing: ResilienceState.TEST,
      completion: ResilienceState.DONE,
    };

    return mapping[phase] ?? ResilienceState.BUILD;
  }

  /**
   * Infer execution phase from current state.
   */
  private inferPhaseFromState(): ExecutionPhase {
    const mapping: Record<ResilienceState, ExecutionPhase> = {
      [ResilienceState.INIT]: "planning",
      [ResilienceState.PLANNING]: "planning",
      [ResilienceState.DESIGN]: "design",
      [ResilienceState.INTEGRATE]: "implementation",
      [ResilienceState.BUILD]: "implementation",
      [ResilienceState.TEST]: "testing",
      [ResilienceState.DONE]: "completion",
      [ResilienceState.ERROR]: "implementation",
      [ResilienceState.PAUSED]: "implementation",
    };

    return mapping[this.stateMachine.getState()] ?? "implementation";
  }

  /**
   * Get target state for SDLC stage.
   */
  private getStateForStage(stageId: string): ResilienceState | null {
    const mapping: Record<string, ResilienceState> = {
      "00-FOUNDATION": ResilienceState.INIT,
      "01-PLANNING": ResilienceState.PLANNING,
      "02-DESIGN": ResilienceState.DESIGN,
      "03-INTEGRATE": ResilienceState.INTEGRATE,
      "04-BUILD": ResilienceState.BUILD,
      "05-TEST": ResilienceState.TEST,
    };

    return mapping[stageId] ?? null;
  }

  /**
   * Get trigger to transition to target state.
   */
  private getTriggerForState(target: ResilienceState): string | null {
    const triggers: Record<ResilienceState, string> = {
      [ResilienceState.INIT]: "start",
      [ResilienceState.PLANNING]: "start",
      [ResilienceState.DESIGN]: "plan_complete",
      [ResilienceState.INTEGRATE]: "design_complete",
      [ResilienceState.BUILD]: "integration_ready",
      [ResilienceState.TEST]: "build_complete",
      [ResilienceState.DONE]: "tests_pass",
      [ResilienceState.ERROR]: "fatal_error",
      [ResilienceState.PAUSED]: "pause",
    };

    return triggers[target] ?? null;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let currentManager: SessionResilienceManager | null = null;

/**
 * Get the current session resilience manager.
 */
export function getSessionResilienceManager(): SessionResilienceManager | null {
  return currentManager;
}

/**
 * Set the current session resilience manager.
 */
export function setSessionResilienceManager(
  manager: SessionResilienceManager | null
): void {
  currentManager = manager;
}

/**
 * Create a new session resilience manager.
 */
export function createSessionResilienceManager(
  config: SessionResilienceConfig
): SessionResilienceManager {
  const manager = new SessionResilienceManager(config);
  currentManager = manager;
  return manager;
}

/**
 * Reset the session resilience manager (for testing).
 */
export function resetSessionResilienceManager(): void {
  currentManager = null;
}
