/**
 * Session State Machine
 *
 * Manages structured state transitions for autonomous sessions.
 * Implements state guards and actions for safe transitions.
 *
 * @module sessions/state-machine
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @authority Master Plan v4.3, Sprint 69-71 T9.1
 * @sprint 69-71
 */

import { createLogger, type Logger } from "../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Session states aligned with SDLC stages.
 */
export enum ResilienceState {
  INIT = "INIT",
  PLANNING = "PLANNING",
  DESIGN = "DESIGN",
  INTEGRATE = "INTEGRATE",
  BUILD = "BUILD",
  TEST = "TEST",
  DONE = "DONE",
  ERROR = "ERROR",
  PAUSED = "PAUSED",
}

/**
 * State transition definition.
 */
export interface StateTransition {
  /** Source state (or '*' for any state) */
  from: ResilienceState | "*";
  /** Target state (or '*' for previous state) */
  to: ResilienceState | "*";
  /** Trigger name that activates this transition */
  trigger: string;
  /** Optional guard condition (must return true to allow transition) */
  guard?: () => Promise<boolean>;
  /** Optional action to execute on transition */
  action?: () => Promise<void>;
}

/**
 * State history entry.
 */
export interface StateHistoryEntry {
  /** State at this point */
  state: ResilienceState;
  /** Timestamp of state change */
  timestamp: string;
  /** Trigger that caused the transition */
  trigger: string;
  /** Previous state */
  fromState?: ResilienceState;
}

/**
 * State machine configuration.
 */
export interface StateMachineConfig {
  /** Initial state */
  initialState?: ResilienceState;
  /** Custom transitions (merged with defaults) */
  customTransitions?: StateTransition[];
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Default Transitions
// ============================================================================

/**
 * Default state transitions following SDLC flow.
 */
export const DEFAULT_STATE_TRANSITIONS: StateTransition[] = [
  // Normal flow (SDLC progression)
  { from: ResilienceState.INIT, to: ResilienceState.PLANNING, trigger: "start" },
  {
    from: ResilienceState.PLANNING,
    to: ResilienceState.DESIGN,
    trigger: "plan_complete",
  },
  {
    from: ResilienceState.DESIGN,
    to: ResilienceState.INTEGRATE,
    trigger: "design_complete",
  },
  {
    from: ResilienceState.INTEGRATE,
    to: ResilienceState.BUILD,
    trigger: "integration_ready",
  },
  {
    from: ResilienceState.BUILD,
    to: ResilienceState.TEST,
    trigger: "build_complete",
  },
  { from: ResilienceState.TEST, to: ResilienceState.DONE, trigger: "tests_pass" },

  // Skip paths (fast-forward for simple tasks)
  { from: ResilienceState.INIT, to: ResilienceState.BUILD, trigger: "quick_start" },
  {
    from: ResilienceState.PLANNING,
    to: ResilienceState.BUILD,
    trigger: "skip_design",
  },
  { from: ResilienceState.BUILD, to: ResilienceState.DONE, trigger: "skip_test" },

  // Error handling
  { from: "*", to: ResilienceState.ERROR, trigger: "fatal_error" },
  { from: ResilienceState.ERROR, to: ResilienceState.PAUSED, trigger: "escalate" },

  // Pause/resume
  { from: "*", to: ResilienceState.PAUSED, trigger: "pause" },
  { from: ResilienceState.PAUSED, to: "*", trigger: "resume" },

  // Retry paths (recovery)
  { from: ResilienceState.BUILD, to: ResilienceState.BUILD, trigger: "retry_build" },
  {
    from: ResilienceState.TEST,
    to: ResilienceState.BUILD,
    trigger: "test_failure",
  },
  { from: ResilienceState.ERROR, to: ResilienceState.BUILD, trigger: "retry" },

  // Rollback paths
  {
    from: ResilienceState.TEST,
    to: ResilienceState.DESIGN,
    trigger: "design_issue",
  },
  {
    from: ResilienceState.BUILD,
    to: ResilienceState.PLANNING,
    trigger: "replan_needed",
  },
];

// ============================================================================
// Session State Machine
// ============================================================================

/**
 * Session State Machine.
 *
 * Manages state transitions for autonomous sessions with guards and actions.
 *
 * @example
 * ```typescript
 * const machine = new ResilienceStateMachine('session-123');
 *
 * // Start session
 * await machine.transition('start');
 * console.log(machine.getState()); // PLANNING
 *
 * // Progress through stages
 * await machine.transition('plan_complete');
 * await machine.transition('design_complete');
 * await machine.transition('integration_ready');
 * await machine.transition('build_complete');
 * await machine.transition('tests_pass');
 * console.log(machine.getState()); // DONE
 * ```
 */
export class ResilienceStateMachine {
  private readonly log: Logger;
  private readonly sessionId: string;
  private readonly transitions: StateTransition[];
  private readonly debug: boolean;

  private currentState: ResilienceState;
  private previousState: ResilienceState | null = null;
  private history: StateHistoryEntry[] = [];

  constructor(sessionId: string, config: StateMachineConfig = {}) {
    this.log = createLogger("ResilienceStateMachine");
    this.sessionId = sessionId;
    this.currentState = config.initialState ?? ResilienceState.INIT;
    this.debug = config.debug ?? false;

    // Merge custom transitions with defaults
    this.transitions = [
      ...DEFAULT_STATE_TRANSITIONS,
      ...(config.customTransitions ?? []),
    ];

    // Record initial state
    this.history.push({
      state: this.currentState,
      timestamp: new Date().toISOString(),
      trigger: "init",
    });

    if (this.debug) {
      this.log.debug("State machine initialized", {
        sessionId,
        initialState: this.currentState,
        transitionCount: this.transitions.length,
      });
    }
  }

  // ============================================================================
  // State Transitions
  // ============================================================================

  /**
   * Attempt a state transition.
   *
   * @param trigger - Trigger name
   * @returns True if transition succeeded
   * @throws Error if no valid transition found
   */
  async transition(trigger: string): Promise<boolean> {
    const transition = this.findTransition(this.currentState, trigger);

    if (!transition) {
      const error = new Error(
        `Invalid transition: ${this.currentState} --[${trigger}]--> ???`
      );
      this.log.error("Invalid transition", {
        sessionId: this.sessionId,
        currentState: this.currentState,
        trigger,
      });
      throw error;
    }

    // Check guard condition
    if (transition.guard) {
      const allowed = await transition.guard();
      if (!allowed) {
        this.log.debug("Transition blocked by guard", {
          sessionId: this.sessionId,
          from: this.currentState,
          to: transition.to,
          trigger,
        });
        return false;
      }
    }

    // Execute action
    if (transition.action) {
      try {
        await transition.action();
      } catch (error) {
        this.log.error("Transition action failed", {
          sessionId: this.sessionId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // Resolve target state
    const targetState = this.resolveTargetState(transition);

    // Update state
    this.previousState = this.currentState;
    this.currentState = targetState;

    // Record in history
    this.history.push({
      state: targetState,
      timestamp: new Date().toISOString(),
      trigger,
      fromState: this.previousState,
    });

    // Log state change
    this.log.info("State transition", {
      sessionId: this.sessionId,
      from: this.previousState,
      to: targetState,
      trigger,
    });

    return true;
  }

  /**
   * Check if a transition is valid from current state.
   *
   * @param trigger - Trigger name
   * @returns True if transition is valid
   */
  canTransition(trigger: string): boolean {
    return !!this.findTransition(this.currentState, trigger);
  }

  /**
   * Get valid triggers from current state.
   *
   * @returns Array of valid trigger names
   */
  getValidTriggers(): string[] {
    return this.transitions
      .filter((t) => t.from === this.currentState || t.from === "*")
      .map((t) => t.trigger);
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current state.
   */
  getState(): ResilienceState {
    return this.currentState;
  }

  /**
   * Get previous state.
   */
  getPreviousState(): ResilienceState | null {
    return this.previousState;
  }

  /**
   * Get session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get state history.
   */
  getHistory(): StateHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get time in current state (ms).
   */
  getTimeInState(): number {
    const lastEntry = this.history[this.history.length - 1];
    if (!lastEntry) return 0;
    return Date.now() - new Date(lastEntry.timestamp).getTime();
  }

  // ============================================================================
  // State Predicates
  // ============================================================================

  /**
   * Check if session is in a terminal state (DONE or ERROR).
   */
  isTerminal(): boolean {
    return (
      this.currentState === ResilienceState.DONE ||
      this.currentState === ResilienceState.ERROR
    );
  }

  /**
   * Check if session is paused.
   */
  isPaused(): boolean {
    return this.currentState === ResilienceState.PAUSED;
  }

  /**
   * Check if session is in error state.
   */
  isError(): boolean {
    return this.currentState === ResilienceState.ERROR;
  }

  /**
   * Check if session is active (not terminal, not paused).
   */
  isActive(): boolean {
    return !this.isTerminal() && !this.isPaused();
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize state machine for checkpointing.
   */
  serialize(): {
    sessionId: string;
    currentState: ResilienceState;
    previousState: ResilienceState | null;
    history: StateHistoryEntry[];
  } {
    return {
      sessionId: this.sessionId,
      currentState: this.currentState,
      previousState: this.previousState,
      history: this.history,
    };
  }

  /**
   * Restore state machine from serialized data.
   */
  static restore(
    data: {
      sessionId: string;
      currentState: ResilienceState;
      previousState: ResilienceState | null;
      history: StateHistoryEntry[];
    },
    config: StateMachineConfig = {}
  ): ResilienceStateMachine {
    const machine = new ResilienceStateMachine(data.sessionId, {
      ...config,
      initialState: data.currentState,
    });

    // Clear initial history and restore
    machine.history.length = 0;
    machine.history.push(...data.history);
    machine.previousState = data.previousState;

    return machine;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Find a transition matching source state and trigger.
   */
  private findTransition(
    from: ResilienceState,
    trigger: string
  ): StateTransition | undefined {
    // First try exact match
    const exactMatch = this.transitions.find(
      (t) => t.from === from && t.trigger === trigger
    );
    if (exactMatch) return exactMatch;

    // Then try wildcard match
    return this.transitions.find(
      (t) => t.from === "*" && t.trigger === trigger
    );
  }

  /**
   * Resolve the target state (handling '*' for previous state).
   */
  private resolveTargetState(transition: StateTransition): ResilienceState {
    if (transition.to === "*") {
      // '*' means return to previous state (for resume)
      return this.previousState ?? ResilienceState.INIT;
    }
    return transition.to as ResilienceState;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new session state machine.
 */
export function createStateMachine(
  sessionId: string,
  config?: StateMachineConfig
): ResilienceStateMachine {
  return new ResilienceStateMachine(sessionId, config);
}

/**
 * Get SDLC stage from session state.
 */
export function stateToSDLCStage(
  state: ResilienceState
): string | null {
  const mapping: Record<ResilienceState, string | null> = {
    [ResilienceState.INIT]: "00-FOUNDATION",
    [ResilienceState.PLANNING]: "01-PLANNING",
    [ResilienceState.DESIGN]: "02-DESIGN",
    [ResilienceState.INTEGRATE]: "03-INTEGRATE",
    [ResilienceState.BUILD]: "04-BUILD",
    [ResilienceState.TEST]: "05-TEST",
    [ResilienceState.DONE]: null,
    [ResilienceState.ERROR]: null,
    [ResilienceState.PAUSED]: null,
  };
  return mapping[state];
}

/**
 * Get session state from SDLC stage.
 */
export function sdlcStageToState(stage: string): ResilienceState {
  const mapping: Record<string, ResilienceState> = {
    "00-FOUNDATION": ResilienceState.INIT,
    "01-PLANNING": ResilienceState.PLANNING,
    "02-DESIGN": ResilienceState.DESIGN,
    "03-INTEGRATE": ResilienceState.INTEGRATE,
    "04-BUILD": ResilienceState.BUILD,
    "05-TEST": ResilienceState.TEST,
    "06-DEPLOY": ResilienceState.DONE,
    "07-OPERATE": ResilienceState.DONE,
  };
  return mapping[stage] ?? ResilienceState.INIT;
}
