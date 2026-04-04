/**
 * Agent Error Types
 *
 * Error types specific to agent orchestration and invocation.
 *
 * @module errors/agent
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 58
 */

import { EndiorBotError, type ErrorSeverity } from "./base.js";

// ============================================================================
// Agent Error Codes
// ============================================================================

/**
 * Agent-specific error codes.
 */
export type AgentErrorCode =
  | "AGENT_NOT_FOUND"
  | "AGENT_INACTIVE"
  | "HANDOFF_BLOCKED"
  | "HANDOFF_DEPTH_EXCEEDED"
  | "HANDOFF_INVALID_TRANSITION"
  | "WORKFLOW_FAILED"
  | "WORKFLOW_TIMEOUT"
  | "INVOCATION_FAILED"
  | "INVOCATION_TIMEOUT"
  | "CONTEXT_TOO_LARGE"
  | "RESPONSE_PARSE_ERROR"
  | "RISK_THRESHOLD_EXCEEDED"
  | "MODE_NOT_ALLOWED";

// ============================================================================
// Agent Error Class
// ============================================================================

/**
 * Error related to agent orchestration.
 */
export class AgentError extends EndiorBotError {
  /**
   * Agent that caused the error.
   */
  readonly agent?: string;

  /**
   * Workflow ID if applicable.
   */
  readonly workflowId?: string;

  constructor(
    message: string,
    options: {
      code: AgentErrorCode;
      severity?: ErrorSeverity;
      cause?: Error;
      retryable?: boolean;
      agent?: string;
      workflowId?: string;
      metadata?: Record<string, unknown>;
      agentGuidance?: string;
    }
  ) {
    super(message, {
      code: options.code,
      category: "AGENT",
      severity: options.severity ?? "error",
      ...(options.cause ? { cause: options.cause } : {}),
      retryable: options.retryable ?? false,
      ...(options.agentGuidance ? { agentGuidance: options.agentGuidance } : {}),
      metadata: {
        ...options.metadata,
        ...(options.agent ? { agent: options.agent } : {}),
        ...(options.workflowId ? { workflowId: options.workflowId } : {}),
      },
    });

    if (options.agent) {
      this.agent = options.agent;
    }
    if (options.workflowId) {
      this.workflowId = options.workflowId;
    }
  }
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is an AgentError.
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create "agent not found" error.
 */
export function agentNotFoundError(
  agentName: string,
  validAgents: string[]
): AgentError {
  return new AgentError(
    `Unknown agent: @${agentName}. Valid agents: ${validAgents.join(", ")}`,
    {
      code: "AGENT_NOT_FOUND",
      severity: "error",
      retryable: false,
      agent: agentName,
      metadata: { validAgents },
      agentGuidance: "Try /help to see available agents. Check spelling or use @assistant for routing.",
    }
  );
}

/**
 * Create "agent inactive" error (tier restriction).
 */
export function agentInactiveError(
  agentName: string,
  requiredTier: string,
  currentTier: string
): AgentError {
  return new AgentError(
    `Agent @${agentName} requires ${requiredTier} tier. Current tier: ${currentTier}`,
    {
      code: "AGENT_INACTIVE",
      severity: "warning",
      retryable: false,
      agent: agentName,
      metadata: { requiredTier, currentTier },
      agentGuidance: `Upgrade project tier to ${requiredTier} or use an agent available at ${currentTier} tier.`,
    }
  );
}

/**
 * Create "handoff blocked" error.
 */
export function handoffBlockedError(
  fromAgent: string,
  toAgent: string,
  reason: string
): AgentError {
  return new AgentError(
    `Handoff from @${fromAgent} to @${toAgent} blocked: ${reason}`,
    {
      code: "HANDOFF_BLOCKED",
      severity: "warning",
      retryable: false,
      agent: fromAgent,
      metadata: { fromAgent, toAgent, reason },
      agentGuidance: "Check ALLOWED_TRANSITIONS for valid handoff paths. SE4H agents cannot delegate.",
    }
  );
}

/**
 * Create "handoff depth exceeded" error.
 */
export function handoffDepthExceededError(
  currentDepth: number,
  maxDepth: number,
  workflowId?: string
): AgentError {
  return new AgentError(
    `Handoff chain too deep: ${currentDepth} exceeds limit of ${maxDepth}`,
    {
      code: "HANDOFF_DEPTH_EXCEEDED",
      severity: "warning",
      retryable: false,
      ...(workflowId ? { workflowId } : {}),
      metadata: { currentDepth, maxDepth },
      agentGuidance: "Simplify the handoff chain or complete the task within the current agent.",
    }
  );
}

/**
 * Create "invalid transition" error.
 */
export function invalidTransitionError(
  fromAgent: string,
  toAgent: string,
  allowedTargets: string[]
): AgentError {
  return new AgentError(
    `Transition from @${fromAgent} to @${toAgent} not allowed. Allowed: ${allowedTargets.join(", ")}`,
    {
      code: "HANDOFF_INVALID_TRANSITION",
      severity: "error",
      retryable: false,
      agent: fromAgent,
      metadata: { fromAgent, toAgent, allowedTargets },
      agentGuidance: `Hand off to one of the allowed targets: ${allowedTargets.join(", ")}.`,
    }
  );
}

/**
 * Create "workflow failed" error.
 */
export function workflowFailedError(
  workflowId: string,
  reason: string,
  cause?: Error
): AgentError {
  return new AgentError(`Workflow ${workflowId} failed: ${reason}`, {
    code: "WORKFLOW_FAILED",
    severity: "error",
    retryable: false,
    workflowId,
    ...(cause ? { cause } : {}),
    agentGuidance: "Check the failure reason. Retry the workflow or escalate to @architect for redesign.",
  });
}

/**
 * Create "workflow timeout" error.
 */
export function workflowTimeoutError(
  workflowId: string,
  timeoutMs: number
): AgentError {
  return new AgentError(
    `Workflow ${workflowId} timed out after ${timeoutMs}ms`,
    {
      code: "WORKFLOW_TIMEOUT",
      severity: "error",
      retryable: true,
      workflowId,
      metadata: { timeoutMs },
      agentGuidance: "Retry the workflow. If it times out again, break the task into smaller steps.",
    }
  );
}

/**
 * Create "invocation failed" error.
 */
export function invocationFailedError(
  agent: string,
  reason: string,
  cause?: Error
): AgentError {
  return new AgentError(`Agent @${agent} invocation failed: ${reason}`, {
    code: "INVOCATION_FAILED",
    severity: "error",
    retryable: true,
    agent,
    ...(cause ? { cause } : {}),
    agentGuidance: "Retry the invocation. If it fails again, try a different provider or check /cost for budget.",
  });
}

/**
 * Create "invocation timeout" error.
 */
export function invocationTimeoutError(
  agent: string,
  timeoutMs: number
): AgentError {
  return new AgentError(
    `Agent @${agent} invocation timed out after ${timeoutMs}ms`,
    {
      code: "INVOCATION_TIMEOUT",
      severity: "error",
      retryable: true,
      agent,
      metadata: { timeoutMs },
      agentGuidance: "Retry with a simpler prompt or switch to a faster model (sonnet/haiku).",
    }
  );
}

/**
 * Create "context too large" error.
 */
export function contextTooLargeError(
  agent: string,
  contextTokens: number,
  maxTokens: number
): AgentError {
  return new AgentError(
    `Context for @${agent} too large: ${contextTokens} tokens exceeds ${maxTokens} limit`,
    {
      code: "CONTEXT_TOO_LARGE",
      severity: "warning",
      retryable: false,
      agent,
      metadata: { contextTokens, maxTokens },
      agentGuidance: "Reduce context by summarizing history or splitting the task into smaller parts.",
    }
  );
}

/**
 * Create "response parse error".
 */
export function responseParseError(
  agent: string,
  reason: string
): AgentError {
  return new AgentError(`Failed to parse @${agent} response: ${reason}`, {
    code: "RESPONSE_PARSE_ERROR",
    severity: "warning",
    retryable: false,
    agent,
    agentGuidance: "Retry the request. If parsing fails again, check the prompt format matches expected schema.",
  });
}

/**
 * Create "risk threshold exceeded" error.
 */
export function riskThresholdExceededError(
  agent: string,
  riskLevel: string,
  action: string
): AgentError {
  return new AgentError(
    `Action "${action}" by @${agent} exceeds risk threshold (${riskLevel})`,
    {
      code: "RISK_THRESHOLD_EXCEEDED",
      severity: "critical",
      retryable: false,
      agent,
      metadata: { riskLevel, action },
      agentGuidance: "Request CEO approval for this action or use a lower-risk alternative.",
    }
  );
}

/**
 * Create "mode not allowed" error.
 */
export function modeNotAllowedError(
  agent: string,
  requestedMode: string,
  allowedModes: string[]
): AgentError {
  return new AgentError(
    `Mode "${requestedMode}" not allowed for @${agent}. Allowed: ${allowedModes.join(", ")}`,
    {
      code: "MODE_NOT_ALLOWED",
      severity: "error",
      retryable: false,
      agent,
      metadata: { requestedMode, allowedModes },
      agentGuidance: `Switch to one of the allowed modes: ${allowedModes.join(", ")}.`,
    }
  );
}
