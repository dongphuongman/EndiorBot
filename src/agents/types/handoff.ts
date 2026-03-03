/**
 * Handoff Types & Schema
 *
 * JSON schema for agent handoffs in the workflow engine.
 * Based on Sprint 55 plan - P0-2: Handoff Protocol.
 *
 * @module agents/types/handoff
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 * @authority ADR-001 Multi-Model Orchestrator
 */

// ============================================================================
// Agent Roles (12 SDLC Roles)
// ============================================================================

/**
 * SE4A Agents (9 Executors) - Active at LITE tier.
 */
export type SE4ARole =
  | "researcher"  // Stage 00, Gate G0.1
  | "pm"          // Stage 00-01, Gate G0.1, G1
  | "pjm"         // Stage 01-04, Sprint Gate
  | "architect"   // Stage 02-03, Gate G2
  | "coder"       // Stage 04, Sprint Gate
  | "reviewer"    // Stage 04-05, Gate G3
  | "tester"      // Stage 05, Gate G3
  | "devops"      // Stage 06-07, Gate G4
  | "fullstack";  // All stages, LITE tier composite agent

/**
 * SE4H Agents (3 Advisors) - Active at STANDARD+ tier.
 */
export type SE4HRole =
  | "ceo"         // Strategic direction
  | "cpo"         // Product vision
  | "cto";        // Technical standards

/**
 * Router Agent.
 */
export type RouterRole = "assistant";

/**
 * All agent roles combined.
 */
export type AgentRole = SE4ARole | SE4HRole | RouterRole;

// ============================================================================
// Handoff JSON Schema
// ============================================================================

/**
 * Priority levels for handoffs.
 */
export type HandoffPriority = "P0" | "P1" | "P2";

/**
 * Single handoff request from an agent.
 */
export interface HandoffItem {
  /** Target agent role */
  to: AgentRole;
  /** Intent/task for the target agent */
  intent: string;
  /** Priority level */
  priority: HandoffPriority;
  /** Input data for the target agent */
  inputs: Record<string, unknown>;
  /** Reason for this handoff */
  reason: string;
}

/**
 * Handoff response from an agent.
 * This is the JSON schema that agents must return.
 */
export interface HandoffRequest {
  /** Array of handoff items */
  handoff: HandoffItem[];
}

/**
 * Parsed handoff with metadata.
 */
export interface ParsedHandoff extends HandoffItem {
  /** Source agent that initiated this handoff */
  from: AgentRole;
  /** Depth in the handoff chain (0 = CEO initiated) */
  depth: number;
  /** Timestamp of handoff request */
  timestamp: Date;
  /** Correlation ID for tracing */
  correlationId: string;
}

// ============================================================================
// Allowed Transitions
// ============================================================================

/**
 * Allowed agent transitions.
 * Defines which agents can hand off to which other agents.
 * PM cannot call DevOps directly (must go through chain).
 */
export const ALLOWED_TRANSITIONS: Record<AgentRole, readonly AgentRole[]> = {
  // SE4A Executors
  researcher: ["pm"] as const,
  pm: ["architect", "pjm"] as const,
  pjm: ["coder", "tester"] as const,
  architect: ["coder", "reviewer"] as const,
  coder: ["reviewer", "tester"] as const,
  reviewer: ["coder", "pm"] as const,
  tester: ["coder", "devops"] as const,
  devops: ["tester"] as const,
  fullstack: [] as const,  // Self-contained: handles all stages, no handoff needed

  // SE4H Advisors (can only advise, not delegate)
  ceo: [] as const,
  cpo: [] as const,
  cto: [] as const,

  // Router (routes to SE4A agents)
  assistant: ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack"] as const,
} as const;

// ============================================================================
// Handoff Guards
// ============================================================================

/**
 * Guard configuration for handoff chains.
 */
export interface HandoffGuardsConfig {
  /** Maximum depth of handoff chain (e.g., PM → Architect → Coder = 3) */
  maxDepth: number;
  /** Maximum total handoffs per CEO request */
  maxTotalPerRequest: number;
  /** Timeout per agent in seconds */
  timeoutPerAgent: number;
  /** Maximum retries per agent */
  maxRetries: number;
  /** Cooldown between retries in ms */
  retryCooldownMs: number;
}

/**
 * Default handoff guards configuration.
 */
export const DEFAULT_HANDOFF_GUARDS: HandoffGuardsConfig = {
  maxDepth: 3,                    // PM → Architect → Coder (3 levels)
  maxTotalPerRequest: 5,          // Max 5 handoffs per CEO request
  timeoutPerAgent: 300,           // 5 minutes per agent
  maxRetries: 2,                  // Retry 2x on failure
  retryCooldownMs: 1000,          // 1 second between retries
};

// ============================================================================
// Handoff State
// ============================================================================

/**
 * Status of a handoff in the workflow.
 */
export type HandoffStatus =
  | "pending"       // Waiting to be processed
  | "confirmed"     // CEO confirmed, ready to execute
  | "running"       // Agent is executing
  | "completed"     // Successfully completed
  | "rejected"      // CEO rejected the handoff
  | "failed"        // Agent execution failed
  | "timeout"       // Agent timed out
  | "blocked";      // Transition not allowed

/**
 * Tracked handoff with execution state.
 */
export interface TrackedHandoff extends ParsedHandoff {
  /** Current status */
  status: HandoffStatus;
  /** Error message if failed */
  error?: string;
  /** Start time of execution */
  startedAt?: Date;
  /** End time of execution */
  completedAt?: Date;
  /** Result from agent execution */
  result?: AgentResult;
}

/**
 * Result from agent execution.
 */
export interface AgentResult {
  /** Output text from agent */
  output: string;
  /** Artifacts created (files, documents) */
  artifacts: AgentArtifact[];
  /** Further handoffs requested */
  handoffs: HandoffItem[];
  /** Token usage */
  tokenUsage: {
    input: number;
    output: number;
  };
  /** Execution duration in ms */
  durationMs: number;
}

/**
 * Artifact created by an agent.
 */
export interface AgentArtifact {
  /** Type of artifact */
  type: "file" | "document" | "spec" | "plan" | "review" | "patch";
  /** Path or identifier */
  path: string;
  /** Description */
  description: string;
  /** Content (for small artifacts) */
  content?: string;
}

// ============================================================================
// Workflow Chain
// ============================================================================

/**
 * Complete workflow chain from CEO request.
 */
export interface WorkflowChain {
  /** Unique chain ID */
  id: string;
  /** Correlation ID for tracing */
  correlationId: string;
  /** Original CEO request */
  originalRequest: string;
  /** Project context */
  projectId: string;
  /** All handoffs in this chain */
  handoffs: TrackedHandoff[];
  /** Current depth in chain */
  currentDepth: number;
  /** Total handoffs executed */
  totalHandoffs: number;
  /** Chain status */
  status: "active" | "completed" | "failed" | "cancelled";
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt?: Date;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a role is a valid SE4A executor.
 */
export function isSE4ARole(role: string): role is SE4ARole {
  const se4aRoles: SE4ARole[] = [
    "researcher", "pm", "pjm", "architect",
    "coder", "reviewer", "tester", "devops", "fullstack",
  ];
  return se4aRoles.includes(role as SE4ARole);
}

/**
 * Check if a role is a valid SE4H advisor.
 */
export function isSE4HRole(role: string): role is SE4HRole {
  const se4hRoles: SE4HRole[] = ["ceo", "cpo", "cto"];
  return se4hRoles.includes(role as SE4HRole);
}

/**
 * Check if a role is the router.
 */
export function isRouterRole(role: string): role is RouterRole {
  return role === "assistant";
}

/**
 * Check if a role is valid.
 */
export function isValidRole(role: string): role is AgentRole {
  return isSE4ARole(role) || isSE4HRole(role) || isRouterRole(role);
}

/**
 * Check if a transition is allowed.
 */
export function isAllowedTransition(from: AgentRole, to: AgentRole): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Validate a handoff request JSON.
 */
export function isValidHandoffRequest(obj: unknown): obj is HandoffRequest {
  if (typeof obj !== "object" || obj === null) return false;
  const request = obj as Record<string, unknown>;

  if (!Array.isArray(request.handoff)) return false;

  for (const item of request.handoff) {
    if (typeof item !== "object" || item === null) return false;
    const handoff = item as Record<string, unknown>;

    if (typeof handoff.to !== "string" || !isValidRole(handoff.to)) return false;
    if (typeof handoff.intent !== "string" || handoff.intent.length === 0) return false;
    if (!["P0", "P1", "P2"].includes(handoff.priority as string)) return false;
    if (typeof handoff.inputs !== "object") return false;
    if (typeof handoff.reason !== "string") return false;
  }

  return true;
}
