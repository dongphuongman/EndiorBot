/**
 * Handoff Guards
 *
 * Validates handoff transitions, enforces limits, and manages guard state.
 * Prevents infinite loops, excessive depth, and invalid transitions.
 *
 * Guards:
 * - maxDepth: 3 (PM → Architect → Coder)
 * - maxTotalPerRequest: 5 (max handoffs per CEO request)
 * - timeoutPerAgent: 300s (5 minutes)
 * - maxRetries: 2 (retry on transient failure)
 *
 * @module agents/orchestrator/handoff-guards
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import {
  type AgentRole,
  type HandoffItem,
  type HandoffGuardsConfig,
  type WorkflowChain,
  DEFAULT_HANDOFF_GUARDS,
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  isValidRole,
} from "../types/handoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Guard violation result.
 */
export interface GuardViolation {
  /** Type of violation */
  type:
    | "MAX_DEPTH_EXCEEDED"
    | "MAX_TOTAL_EXCEEDED"
    | "INVALID_TRANSITION"
    | "TIMEOUT"
    | "LOOP_DETECTED"
    | "INVALID_ROLE";
  /** Human-readable message */
  message: string;
  /** Current state when violation occurred */
  state: {
    currentDepth: number;
    totalHandoffs: number;
    from?: AgentRole;
    to?: AgentRole;
    visitedAgents?: AgentRole[];
  };
}

/**
 * Guard check result.
 */
export type GuardCheckResult =
  | { allowed: true }
  | { allowed: false; violation: GuardViolation };

/**
 * Workflow guard state.
 */
export interface GuardState {
  /** Current chain ID */
  chainId: string;
  /** Current depth in handoff chain */
  currentDepth: number;
  /** Total handoffs executed */
  totalHandoffs: number;
  /** Agents visited in current chain (for loop detection) */
  visitedAgents: AgentRole[];
  /** Start time of current chain */
  startTime: Date;
  /** Last agent in chain */
  lastAgent?: AgentRole;
  /** Retry counts per agent */
  retryCounts: Map<AgentRole, number>;
}

// ============================================================================
// HandoffGuards Class
// ============================================================================

/**
 * Enforces handoff guards and limits.
 *
 * Usage:
 * ```typescript
 * const guards = new HandoffGuards();
 * const state = guards.createState("chain_123");
 *
 * // Before each handoff
 * const check = guards.checkHandoff(state, "pm", "architect");
 * if (!check.allowed) {
 *   console.error(check.violation.message);
 *   return;
 * }
 *
 * // After successful handoff
 * guards.recordHandoff(state, "architect");
 * ```
 */
export class HandoffGuards {
  private readonly config: HandoffGuardsConfig;

  constructor(config: Partial<HandoffGuardsConfig> = {}) {
    this.config = { ...DEFAULT_HANDOFF_GUARDS, ...config };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Create initial guard state for a new workflow chain.
   */
  createState(chainId: string): GuardState {
    return {
      chainId,
      currentDepth: 0,
      totalHandoffs: 0,
      visitedAgents: [],
      startTime: new Date(),
      retryCounts: new Map(),
    };
  }

  /**
   * Create guard state from existing workflow chain.
   */
  stateFromChain(chain: WorkflowChain): GuardState {
    const visitedAgents: AgentRole[] = [];
    for (const h of chain.handoffs) {
      if (!visitedAgents.includes(h.from)) {
        visitedAgents.push(h.from);
      }
      if (!visitedAgents.includes(h.to)) {
        visitedAgents.push(h.to);
      }
    }

    const lastHandoff = chain.handoffs[chain.handoffs.length - 1];
    return {
      chainId: chain.id,
      currentDepth: chain.currentDepth,
      totalHandoffs: chain.totalHandoffs,
      visitedAgents,
      startTime: chain.startedAt,
      ...(lastHandoff ? { lastAgent: lastHandoff.to } : {}),
      retryCounts: new Map(),
    };
  }

  // ==========================================================================
  // Guard Checks
  // ==========================================================================

  /**
   * Check if a handoff is allowed.
   */
  checkHandoff(state: GuardState, from: AgentRole, to: AgentRole): GuardCheckResult {
    // 1. Validate roles
    if (!isValidRole(from)) {
      return {
        allowed: false,
        violation: {
          type: "INVALID_ROLE",
          message: `Invalid source role: ${from}`,
          state: this.extractState(state, from, to),
        },
      };
    }

    if (!isValidRole(to)) {
      return {
        allowed: false,
        violation: {
          type: "INVALID_ROLE",
          message: `Invalid target role: ${to}`,
          state: this.extractState(state, from, to),
        },
      };
    }

    // 2. Check transition allowed
    if (!isAllowedTransition(from, to)) {
      const allowed = ALLOWED_TRANSITIONS[from];
      return {
        allowed: false,
        violation: {
          type: "INVALID_TRANSITION",
          message: `${from} cannot hand off to ${to}. Allowed: ${allowed.join(", ") || "none"}`,
          state: this.extractState(state, from, to),
        },
      };
    }

    // 3. Check depth limit
    if (state.currentDepth >= this.config.maxDepth) {
      return {
        allowed: false,
        violation: {
          type: "MAX_DEPTH_EXCEEDED",
          message: `Max handoff depth (${this.config.maxDepth}) exceeded`,
          state: this.extractState(state, from, to),
        },
      };
    }

    // 4. Check total limit
    if (state.totalHandoffs >= this.config.maxTotalPerRequest) {
      return {
        allowed: false,
        violation: {
          type: "MAX_TOTAL_EXCEEDED",
          message: `Max total handoffs (${this.config.maxTotalPerRequest}) exceeded`,
          state: this.extractState(state, from, to),
        },
      };
    }

    // 5. Check for loops (same agent visited twice in short chain)
    if (this.detectLoop(state, to)) {
      return {
        allowed: false,
        violation: {
          type: "LOOP_DETECTED",
          message: `Potential loop detected: ${to} already visited recently`,
          state: this.extractState(state, from, to),
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check all guards for a handoff item.
   */
  checkHandoffItem(
    state: GuardState,
    from: AgentRole,
    item: HandoffItem
  ): GuardCheckResult {
    return this.checkHandoff(state, from, item.to);
  }

  /**
   * Check if agent has exceeded timeout.
   */
  checkTimeout(state: GuardState): GuardCheckResult {
    const elapsed = Date.now() - state.startTime.getTime();
    const timeout = this.config.timeoutPerAgent * 1000;

    if (elapsed > timeout) {
      return {
        allowed: false,
        violation: {
          type: "TIMEOUT",
          message: `Agent timeout exceeded (${this.config.timeoutPerAgent}s)`,
          state: {
            currentDepth: state.currentDepth,
            totalHandoffs: state.totalHandoffs,
            visitedAgents: state.visitedAgents,
          },
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check if retry is allowed for an agent.
   */
  canRetry(state: GuardState, agent: AgentRole): boolean {
    const count = state.retryCounts.get(agent) ?? 0;
    return count < this.config.maxRetries;
  }

  // ==========================================================================
  // State Updates
  // ==========================================================================

  /**
   * Record a successful handoff.
   */
  recordHandoff(state: GuardState, to: AgentRole): void {
    state.currentDepth += 1;
    state.totalHandoffs += 1;
    state.visitedAgents.push(to);
    state.lastAgent = to;
    state.startTime = new Date(); // Reset timeout for new agent
  }

  /**
   * Record a retry attempt.
   */
  recordRetry(state: GuardState, agent: AgentRole): void {
    const count = state.retryCounts.get(agent) ?? 0;
    state.retryCounts.set(agent, count + 1);
  }

  /**
   * Get retry cooldown in ms.
   */
  getRetryCooldown(): number {
    return this.config.retryCooldownMs;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get allowed transitions for an agent.
   */
  getAllowedTransitions(agent: AgentRole): readonly AgentRole[] {
    return ALLOWED_TRANSITIONS[agent] ?? [];
  }

  /**
   * Validate a complete handoff chain.
   */
  validateChain(handoffs: Array<{ from: AgentRole; to: AgentRole }>): GuardCheckResult {
    const state = this.createState("validation");

    for (const { from, to } of handoffs) {
      const check = this.checkHandoff(state, from, to);
      if (!check.allowed) {
        return check;
      }
      this.recordHandoff(state, to);
    }

    return { allowed: true };
  }

  /**
   * Get current configuration.
   */
  getConfig(): Readonly<HandoffGuardsConfig> {
    return this.config;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Detect potential loops in handoff chain.
   * A loop is detected if the same agent is visited twice within the last 3 handoffs.
   */
  private detectLoop(state: GuardState, to: AgentRole): boolean {
    // Only check recent history to allow legitimate back-and-forth
    const recentHistory = state.visitedAgents.slice(-3);
    return recentHistory.includes(to);
  }

  /**
   * Extract state for violation reporting.
   */
  private extractState(
    state: GuardState,
    from?: AgentRole,
    to?: AgentRole
  ): GuardViolation["state"] {
    return {
      currentDepth: state.currentDepth,
      totalHandoffs: state.totalHandoffs,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      visitedAgents: [...state.visitedAgents],
    };
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalGuards: HandoffGuards | undefined;

/**
 * Get the global HandoffGuards instance.
 */
export function getHandoffGuards(
  config?: Partial<HandoffGuardsConfig>
): HandoffGuards {
  if (!globalGuards) {
    globalGuards = new HandoffGuards(config);
  }
  return globalGuards;
}

/**
 * Reset the global HandoffGuards (for testing).
 */
export function resetHandoffGuards(): void {
  globalGuards = undefined;
}

/**
 * Create a new HandoffGuards instance.
 */
export function createHandoffGuards(
  config?: Partial<HandoffGuardsConfig>
): HandoffGuards {
  return new HandoffGuards(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check if a single transition is valid.
 */
export function isValidHandoff(from: AgentRole, to: AgentRole): boolean {
  return isValidRole(from) && isValidRole(to) && isAllowedTransition(from, to);
}

/**
 * Get human-readable description of allowed transitions.
 */
export function describeTransitions(agent: AgentRole): string {
  const allowed = ALLOWED_TRANSITIONS[agent];
  if (allowed.length === 0) {
    return `${agent} cannot delegate to other agents`;
  }
  return `${agent} can hand off to: ${allowed.join(", ")}`;
}
