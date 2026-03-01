/**
 * Workflow Engine
 *
 * State machine for managing agent execution chains.
 * Handles agent invocations, handoffs, confirmations, and transitions.
 *
 * States:
 *   IDLE → RUNNING → WAITING_CONFIRM → DONE
 *                  ↓
 *               ERROR
 *
 * @module agents/orchestrator/workflow-engine
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { EventEmitter } from "node:events";
import { createLogger, type Logger } from "../../logging/index.js";
import type { AgentRole, ParsedHandoff } from "../types/handoff.js";
import type { QueryClassification } from "../types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Workflow states.
 */
export type WorkflowState =
  | "IDLE"
  | "RUNNING"
  | "WAITING_CONFIRM"
  | "PAUSED"
  | "DONE"
  | "ERROR"
  | "TIMEOUT";

/**
 * Workflow step record.
 */
export interface WorkflowStep {
  /** Step index */
  index: number;
  /** Agent that executed */
  agent: AgentRole;
  /** Task description */
  task: string;
  /** Start timestamp */
  startedAt: Date;
  /** End timestamp */
  endedAt?: Date;
  /** Duration in ms */
  durationMs?: number;
  /** Step state */
  state: "pending" | "running" | "completed" | "failed" | "skipped";
  /** Output from agent */
  output?: string;
  /** Error if failed */
  error?: string;
  /** Handoff request */
  handoff?: ParsedHandoff;
  /** Token usage */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Workflow execution context.
 */
export interface WorkflowContext {
  /** Workflow ID */
  id: string;
  /** Current state */
  state: WorkflowState;
  /** Initial agent */
  initialAgent: AgentRole;
  /** Initial task */
  initialTask: string;
  /** Task classification */
  classification?: QueryClassification;
  /** Execution steps */
  steps: WorkflowStep[];
  /** Current step index */
  currentStep: number;
  /** Pending handoff (awaiting confirmation) */
  pendingHandoff?: ParsedHandoff;
  /** Workflow started at */
  startedAt: Date;
  /** Workflow ended at */
  endedAt?: Date;
  /** Total duration */
  totalDurationMs?: number;
  /** Error if any */
  error?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Workflow events.
 */
export interface WorkflowEvents {
  "state:change": (from: WorkflowState, to: WorkflowState, context: WorkflowContext) => void;
  "step:start": (step: WorkflowStep, context: WorkflowContext) => void;
  "step:complete": (step: WorkflowStep, context: WorkflowContext) => void;
  "step:fail": (step: WorkflowStep, error: string, context: WorkflowContext) => void;
  "handoff:request": (handoff: ParsedHandoff, context: WorkflowContext) => void;
  "handoff:confirm": (handoff: ParsedHandoff, confirmed: boolean, context: WorkflowContext) => void;
  "workflow:complete": (context: WorkflowContext) => void;
  "workflow:error": (error: string, context: WorkflowContext) => void;
  "workflow:timeout": (context: WorkflowContext) => void;
}

/**
 * Workflow engine configuration.
 */
export interface WorkflowConfig {
  /** Maximum steps allowed */
  maxSteps: number;
  /** Step timeout in seconds */
  stepTimeout: number;
  /** Total workflow timeout in seconds */
  workflowTimeout: number;
  /** Auto-confirm low-risk handoffs */
  autoConfirmLowRisk: boolean;
  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default workflow configuration.
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  maxSteps: 10,
  stepTimeout: 300, // 5 minutes per step
  workflowTimeout: 1800, // 30 minutes total
  autoConfirmLowRisk: false,
  verbose: false,
};

// ============================================================================
// Workflow Engine Class
// ============================================================================

/**
 * Workflow Engine manages agent execution chains.
 *
 * @example
 * ```typescript
 * const engine = new WorkflowEngine();
 *
 * engine.on("handoff:request", async (handoff, ctx) => {
 *   const confirmed = await promptUser(`Continue to @${handoff.to}?`);
 *   engine.confirmHandoff(ctx.id, confirmed);
 * });
 *
 * const workflow = await engine.start("pm", "plan payment gateway");
 * ```
 */
export class WorkflowEngine extends EventEmitter {
  private config: WorkflowConfig;
  private workflows: Map<string, WorkflowContext> = new Map();
  private log: Logger;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<WorkflowConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.log = createLogger("workflow-engine");
  }

  // ==========================================================================
  // Workflow Lifecycle
  // ==========================================================================

  /**
   * Start a new workflow.
   */
  start(
    agent: AgentRole,
    task: string,
    classification?: QueryClassification,
    metadata: Record<string, unknown> = {}
  ): WorkflowContext {
    const id = this.generateId();

    const context: WorkflowContext = {
      id,
      state: "IDLE",
      initialAgent: agent,
      initialTask: task,
      ...(classification ? { classification } : {}),
      steps: [],
      currentStep: -1,
      startedAt: new Date(),
      metadata,
    };

    this.workflows.set(id, context);
    this.log.info("Workflow started", { id, agent, task });

    // Set workflow timeout
    this.setWorkflowTimeout(id);

    // Transition to RUNNING and create first step
    this.transition(id, "RUNNING");
    this.createStep(id, agent, task);

    return context;
  }

  /**
   * Get workflow context.
   */
  get(id: string): WorkflowContext | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all active workflows.
   */
  listActive(): WorkflowContext[] {
    return Array.from(this.workflows.values()).filter(
      (w) => !["DONE", "ERROR", "TIMEOUT"].includes(w.state)
    );
  }

  /**
   * Pause a workflow.
   */
  pause(id: string): boolean {
    const context = this.workflows.get(id);
    if (!context || context.state !== "RUNNING") {
      return false;
    }

    this.transition(id, "PAUSED");
    this.log.info("Workflow paused", { id });
    return true;
  }

  /**
   * Resume a paused workflow.
   */
  resume(id: string): boolean {
    const context = this.workflows.get(id);
    if (!context || context.state !== "PAUSED") {
      return false;
    }

    this.transition(id, "RUNNING");
    this.log.info("Workflow resumed", { id });
    return true;
  }

  /**
   * Cancel a workflow.
   */
  cancel(id: string, reason?: string): boolean {
    const context = this.workflows.get(id);
    if (!context) {
      return false;
    }

    context.error = reason ?? "Cancelled by user";
    this.transition(id, "ERROR");
    this.cleanup(id);
    this.log.info("Workflow cancelled", { id, reason });
    return true;
  }

  // ==========================================================================
  // Step Management
  // ==========================================================================

  /**
   * Create a new step in the workflow.
   */
  private createStep(id: string, agent: AgentRole, task: string): WorkflowStep {
    const context = this.workflows.get(id);
    if (!context) {
      throw new Error(`Workflow not found: ${id}`);
    }

    if (context.steps.length >= this.config.maxSteps) {
      context.error = `Maximum steps (${this.config.maxSteps}) exceeded`;
      this.transition(id, "ERROR");
      throw new Error(context.error);
    }

    const step: WorkflowStep = {
      index: context.steps.length,
      agent,
      task,
      startedAt: new Date(),
      state: "pending",
    };

    context.steps.push(step);
    context.currentStep = step.index;

    this.log.debug("Step created", { id, step: step.index, agent });
    return step;
  }

  /**
   * Mark current step as running.
   */
  startStep(id: string): WorkflowStep | undefined {
    const context = this.workflows.get(id);
    if (!context) return undefined;

    const step = context.steps[context.currentStep];
    if (!step || step.state !== "pending") return undefined;

    step.state = "running";
    step.startedAt = new Date();

    // Set step timeout
    this.setStepTimeout(id, step.index);

    this.emit("step:start", step, context);
    this.log.debug("Step started", { id, step: step.index });
    return step;
  }

  /**
   * Complete current step with output.
   */
  completeStep(
    id: string,
    output: string,
    handoff?: ParsedHandoff,
    tokenUsage?: { input: number; output: number }
  ): WorkflowStep | undefined {
    const context = this.workflows.get(id);
    if (!context) return undefined;

    const step = context.steps[context.currentStep];
    if (!step || step.state !== "running") return undefined;

    step.state = "completed";
    step.endedAt = new Date();
    step.durationMs = step.endedAt.getTime() - step.startedAt.getTime();
    step.output = output;
    if (handoff) {
      step.handoff = handoff;
    }
    if (tokenUsage) {
      step.tokenUsage = tokenUsage;
    }

    // Clear step timeout
    this.clearStepTimeout(id, step.index);

    this.emit("step:complete", step, context);
    this.log.info("Step completed", {
      id,
      step: step.index,
      durationMs: step.durationMs,
      hasHandoff: !!handoff,
    });

    // Handle handoff or completion
    if (handoff) {
      this.requestHandoff(id, handoff);
    } else {
      this.completeWorkflow(id);
    }

    return step;
  }

  /**
   * Fail current step with error.
   */
  failStep(id: string, error: string): WorkflowStep | undefined {
    const context = this.workflows.get(id);
    if (!context) return undefined;

    const step = context.steps[context.currentStep];
    if (!step) return undefined;

    step.state = "failed";
    step.endedAt = new Date();
    step.durationMs = step.endedAt.getTime() - step.startedAt.getTime();
    step.error = error;

    this.clearStepTimeout(id, step.index);
    this.emit("step:fail", step, error, context);

    context.error = error;
    this.transition(id, "ERROR");
    this.cleanup(id);

    this.log.error("Step failed", { id, step: step.index, error });
    return step;
  }

  // ==========================================================================
  // Handoff Management
  // ==========================================================================

  /**
   * Request handoff confirmation.
   */
  private requestHandoff(id: string, handoff: ParsedHandoff): void {
    const context = this.workflows.get(id);
    if (!context) return;

    context.pendingHandoff = handoff;
    this.transition(id, "WAITING_CONFIRM");

    this.emit("handoff:request", handoff, context);
    this.log.info("Handoff requested", { id, to: handoff.to, priority: handoff.priority });

    // Auto-confirm low-risk if configured
    if (this.config.autoConfirmLowRisk && handoff.priority === "P2") {
      this.log.info("Auto-confirming low-risk handoff", { id, to: handoff.to });
      this.confirmHandoff(id, true);
    }
  }

  /**
   * Confirm or reject a pending handoff.
   */
  confirmHandoff(id: string, confirmed: boolean): boolean {
    const context = this.workflows.get(id);
    if (!context || context.state !== "WAITING_CONFIRM" || !context.pendingHandoff) {
      return false;
    }

    const handoff = context.pendingHandoff;
    delete context.pendingHandoff;

    this.emit("handoff:confirm", handoff, confirmed, context);

    if (confirmed) {
      // Create next step
      this.transition(id, "RUNNING");
      this.createStep(id, handoff.to, handoff.intent);
      this.log.info("Handoff confirmed", { id, to: handoff.to });
    } else {
      // Complete workflow (user declined continuation)
      this.log.info("Handoff declined", { id, to: handoff.to });
      this.completeWorkflow(id);
    }

    return true;
  }

  // ==========================================================================
  // Workflow Completion
  // ==========================================================================

  /**
   * Complete the workflow.
   */
  private completeWorkflow(id: string): void {
    const context = this.workflows.get(id);
    if (!context) return;

    context.endedAt = new Date();
    context.totalDurationMs = context.endedAt.getTime() - context.startedAt.getTime();

    this.transition(id, "DONE");
    this.cleanup(id);

    this.emit("workflow:complete", context);
    this.log.info("Workflow completed", {
      id,
      steps: context.steps.length,
      durationMs: context.totalDurationMs,
    });
  }

  // ==========================================================================
  // State Transitions
  // ==========================================================================

  /**
   * Transition to a new state.
   */
  private transition(id: string, newState: WorkflowState): void {
    const context = this.workflows.get(id);
    if (!context) return;

    const oldState = context.state;
    if (oldState === newState) return;

    // Validate transition
    if (!this.isValidTransition(oldState, newState)) {
      this.log.warn("Invalid state transition", { id, from: oldState, to: newState });
      return;
    }

    context.state = newState;
    this.emit("state:change", oldState, newState, context);
    this.log.debug("State transition", { id, from: oldState, to: newState });
  }

  /**
   * Check if a state transition is valid.
   */
  private isValidTransition(from: WorkflowState, to: WorkflowState): boolean {
    const validTransitions: Record<WorkflowState, WorkflowState[]> = {
      IDLE: ["RUNNING", "ERROR"],
      RUNNING: ["WAITING_CONFIRM", "PAUSED", "DONE", "ERROR", "TIMEOUT"],
      WAITING_CONFIRM: ["RUNNING", "DONE", "ERROR", "TIMEOUT"],
      PAUSED: ["RUNNING", "ERROR"],
      DONE: [], // Terminal state
      ERROR: [], // Terminal state
      TIMEOUT: [], // Terminal state
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  // ==========================================================================
  // Timeout Management
  // ==========================================================================

  /**
   * Set workflow timeout.
   */
  private setWorkflowTimeout(id: string): void {
    const timeoutId = setTimeout(() => {
      const context = this.workflows.get(id);
      if (context && !["DONE", "ERROR", "TIMEOUT"].includes(context.state)) {
        context.error = `Workflow timed out after ${this.config.workflowTimeout}s`;
        this.transition(id, "TIMEOUT");
        this.cleanup(id);
        this.emit("workflow:timeout", context);
        this.log.warn("Workflow timed out", { id });
      }
    }, this.config.workflowTimeout * 1000);

    this.timeouts.set(`workflow:${id}`, timeoutId);
  }

  /**
   * Set step timeout.
   */
  private setStepTimeout(id: string, stepIndex: number): void {
    const timeoutId = setTimeout(() => {
      const context = this.workflows.get(id);
      if (context) {
        const step = context.steps[stepIndex];
        if (step && step.state === "running") {
          this.failStep(id, `Step timed out after ${this.config.stepTimeout}s`);
        }
      }
    }, this.config.stepTimeout * 1000);

    this.timeouts.set(`step:${id}:${stepIndex}`, timeoutId);
  }

  /**
   * Clear step timeout.
   */
  private clearStepTimeout(id: string, stepIndex: number): void {
    const key = `step:${id}:${stepIndex}`;
    const timeoutId = this.timeouts.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(key);
    }
  }

  /**
   * Clean up workflow resources.
   */
  private cleanup(id: string): void {
    // Clear workflow timeout
    const workflowTimeout = this.timeouts.get(`workflow:${id}`);
    if (workflowTimeout) {
      clearTimeout(workflowTimeout);
      this.timeouts.delete(`workflow:${id}`);
    }

    // Clear any step timeouts
    for (const [key, timeoutId] of this.timeouts.entries()) {
      if (key.startsWith(`step:${id}:`)) {
        clearTimeout(timeoutId);
        this.timeouts.delete(key);
      }
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Generate a unique workflow ID.
   */
  private generateId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get workflow summary.
   */
  getSummary(id: string): string | undefined {
    const context = this.workflows.get(id);
    if (!context) return undefined;

    const completedSteps = context.steps.filter((s) => s.state === "completed").length;
    const failedSteps = context.steps.filter((s) => s.state === "failed").length;

    return [
      `Workflow: ${id}`,
      `State: ${context.state}`,
      `Steps: ${completedSteps}/${context.steps.length} completed, ${failedSteps} failed`,
      `Duration: ${context.totalDurationMs ?? Date.now() - context.startedAt.getTime()}ms`,
      context.error ? `Error: ${context.error}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Export workflow for persistence.
   */
  export(id: string): WorkflowContext | undefined {
    return this.workflows.get(id);
  }

  /**
   * Import workflow from persistence.
   */
  import(context: WorkflowContext): void {
    this.workflows.set(context.id, context);
    this.log.info("Workflow imported", { id: context.id, state: context.state });
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalEngine: WorkflowEngine | undefined;

/**
 * Get global workflow engine.
 */
export function getWorkflowEngine(config?: Partial<WorkflowConfig>): WorkflowEngine {
  if (!globalEngine) {
    globalEngine = new WorkflowEngine(config);
  }
  return globalEngine;
}

/**
 * Reset global workflow engine.
 */
export function resetWorkflowEngine(): void {
  globalEngine = undefined;
}

/**
 * Create a new workflow engine.
 */
export function createWorkflowEngine(config?: Partial<WorkflowConfig>): WorkflowEngine {
  return new WorkflowEngine(config);
}
