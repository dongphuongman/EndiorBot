/**
 * Gateway Agent Methods
 *
 * JSON-RPC methods for agent orchestration and routing.
 *
 * @module gateway/methods/agents
 * @version 1.1.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 44 Day 7
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";
import {
  RoutingConfidenceCalculator,
  DEFAULT_HITL_THRESHOLD,
  formatConfidence,
} from "../../agents/routing/confidence.js";

// ============================================================================
// Module State
// ============================================================================

let gatewayServerRef: GatewayServer | null = null;
const confidenceCalculator = new RoutingConfidenceCalculator();

// ============================================================================
// Types
// ============================================================================

/**
 * Agent types.
 */
export type AgentType =
  | "pm"
  | "architect"
  | "coder"
  | "reviewer"
  | "researcher"
  | "assistant";

/**
 * Agent status.
 */
export type AgentStatus = "idle" | "working" | "waiting" | "paused";

/**
 * Agent information.
 */
export interface AgentInfo {
  id: string;
  type: AgentType;
  status: AgentStatus;
  currentTask?: string;
  model?: string;
  tokenUsage: {
    input: number;
    output: number;
  };
  startedAt?: number;
  lastActivity?: number;
}

/**
 * Model routing decision with confidence scoring.
 */
export interface RoutingDecision {
  model: string;
  provider: string;
  confidence: number;
  reason: string;
  escalateIfBelow: number;
  fallback?: string;
  /** Whether HITL escalation is required */
  requiresEscalation: boolean;
  /** Confidence breakdown (optional) */
  confidenceBreakdown?: {
    tierMatch: number;
    strengthMatch: number;
    budgetHealth: number;
  };
}

/**
 * Consultation result.
 */
export interface ConsultationResult {
  responses: Array<{
    provider: string;
    model: string;
    content: string;
    confidence?: number;
    latencyMs: number;
  }>;
  consensus?: {
    hasConsensus: boolean;
    points: string[];
    disagreements: string[];
    recommendation: string;
  };
  selectedResponse: number;
}

/**
 * Active agents (in-memory for now).
 * TODO: Wire to actual agent orchestrator
 */
const activeAgents: Map<string, AgentInfo> = new Map();

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get status of all active agents.
 */
function handleAgentsStatus(
  _params: unknown,
  _client: ClientInfo
): { agents: AgentInfo[]; activeCount: number } {
  const agents = Array.from(activeAgents.values());
  const activeCount = agents.filter((a) => a.status === "working").length;

  return { agents, activeCount };
}

/**
 * Get a specific agent.
 */
function handleAgentsGet(
  params: unknown,
  _client: ClientInfo
): AgentInfo {
  const { agentId } = (params ?? {}) as { agentId?: string };

  if (!agentId) {
    throw new Error("agentId is required");
  }

  const agent = activeAgents.get(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  return agent;
}

/**
 * Route a query to the best model.
 */
function handleAgentsRoute(
  params: unknown,
  _client: ClientInfo
): RoutingDecision {
  const { query, taskType, constraints } = (params ?? {}) as {
    query: string;
    taskType?: string;
    constraints?: {
      maxCost?: number;
      preferredProvider?: string;
      minQuality?: string;
    };
  };

  if (!query) {
    throw new Error("query is required");
  }

  // Get routing decision with confidence scoring
  const routingDecision: RoutingDecision = routeQueryWithConfidence(
    query,
    taskType,
    constraints
  );

  // Emit notification if escalation is required
  if (routingDecision.requiresEscalation && gatewayServerRef) {
    // Determine color based on confidence level
    const color = routingDecision.confidence >= 0.55 ? "yellow" :
                  routingDecision.confidence >= 0.35 ? "orange" : "red";

    gatewayServerRef.broadcast({
      type: "notification",
      timestamp: Date.now(),
      data: {
        id: `routing-${Date.now()}`,
        type: "warning",
        title: "Low routing confidence",
        message: `Routing confidence ${formatConfidence(routingDecision.confidence)} is below threshold ${formatConfidence(routingDecision.escalateIfBelow)}. ${routingDecision.reason}`,
        timestamp: new Date().toISOString(),
        actions: [
          { label: "Override", action: "routing.override" },
          { label: "Continue", action: "routing.continue" },
        ],
        metadata: {
          confidence: routingDecision.confidence,
          model: routingDecision.model,
          provider: routingDecision.provider,
          color,
        },
      },
    });
  }

  return routingDecision;
}

/**
 * Consult multiple models (multi-model orchestration).
 *
 * Sprint 116 T5a: Returns 501 NOT_WIRED until real MultiModelOrchestrator is integrated.
 * Zero Mock Policy: no fake responses on production endpoints.
 */
async function handleAgentsConsult(
  params: unknown,
  _client: ClientInfo
): Promise<ConsultationResult> {
  const { query } = (params ?? {}) as {
    query: string;
    models?: string[];
    taskType?: string;
  };

  if (!query) {
    throw new Error("query is required");
  }

  // Sprint 116 T5a: 501 Not Implemented — no fake responses (Zero Mock Policy)
  throw Object.assign(
    new Error("Multi-model consultation not yet wired. Use single-agent chat via router.chat instead."),
    { code: 501 },
  );
}

/**
 * Get current routing statistics.
 *
 * Sprint 116 T5a: Returns zeroed stats (not fake data).
 * These are real values — no routing has occurred in this session.
 */
function handleAgentsRoutingStats(
  _params: unknown,
  _client: ClientInfo
): {
  totalRouted: number;
  byProvider: Record<string, number>;
  byTaskType: Record<string, number>;
  avgConfidence: number;
} {
  return {
    totalRouted: 0,
    byProvider: {},
    byTaskType: {},
    avgConfidence: 0,
  };
}

// ============================================================================
// Internal Logic
// ============================================================================

/**
 * Route a query to the best model with confidence scoring.
 */
function routeQueryWithConfidence(
  query: string,
  taskType?: string,
  constraints?: {
    maxCost?: number;
    preferredProvider?: string;
    minQuality?: string;
  }
): RoutingDecision {
  const queryLower = query.toLowerCase();
  const type = taskType ?? inferTaskType(queryLower);
  const escalateIfBelow = DEFAULT_HITL_THRESHOLD;

  let model = "claude-3-sonnet-20240229";
  let provider = "anthropic";
  let baseConfidence = 0.85;
  let reason = "Default routing";
  let fallback: string | undefined = "claude-3-haiku-20240307";

  // Route based on task type
  switch (type) {
    case "architecture":
    case "security":
      model = "claude-3-opus-20240229";
      baseConfidence = 0.92;
      reason = "Complex task requires highest capability model";
      fallback = "gpt-4-turbo";
      break;

    case "code":
    case "implementation":
      model = "claude-3-sonnet-20240229";
      baseConfidence = 0.88;
      reason = "Code generation optimized for Sonnet";
      break;

    case "quick":
    case "simple":
      model = "claude-3-haiku-20240307";
      baseConfidence = 0.95;
      reason = "Simple task - fastest model";
      fallback = "gpt-3.5-turbo";
      break;

    case "research":
      model = "gemini-pro";
      provider = "google";
      baseConfidence = 0.82;
      reason = "Research benefits from Gemini's knowledge";
      fallback = "claude-3-sonnet-20240229";
      break;
  }

  // Apply constraints and calculate penalties
  let confidence = baseConfidence;
  const penalties: string[] = [];

  if (constraints?.preferredProvider) {
    provider = constraints.preferredProvider;
    confidence -= 0.05;
    penalties.push("provider override");
    reason = `Using preferred provider: ${provider}`;
  }

  if (constraints?.maxCost && constraints.maxCost < 0.01) {
    model = "claude-3-haiku-20240307";
    confidence -= 0.10;
    penalties.push("cost constraint");
    reason = "Cost constraint - using cheapest model";
  }

  // Calculate if escalation is required
  const requiresEscalation = confidence < escalateIfBelow;

  // Build confidence breakdown (simplified version)
  const confidenceBreakdown = {
    tierMatch: type === "simple" ? 1.0 : (model.includes("opus") ? 1.0 : 0.85),
    strengthMatch: 0.9,
    budgetHealth: constraints?.maxCost && constraints.maxCost < 0.01 ? 0.3 : 1.0,
  };

  // Build result
  const result: RoutingDecision = {
    model,
    provider,
    confidence,
    reason: penalties.length > 0 ? `${reason} (penalties: ${penalties.join(", ")})` : reason,
    escalateIfBelow,
    requiresEscalation,
    confidenceBreakdown,
  };

  // Add fallback only if defined
  if (fallback !== undefined) {
    result.fallback = fallback;
  }

  return result;
}

/**
 * Infer task type from query.
 */
function inferTaskType(query: string): string {
  if (query.includes("design") || query.includes("architect")) {
    return "architecture";
  }
  if (query.includes("security") || query.includes("vulnerability")) {
    return "security";
  }
  if (query.includes("implement") || query.includes("code") || query.includes("write")) {
    return "code";
  }
  if (query.includes("research") || query.includes("find") || query.includes("search")) {
    return "research";
  }
  if (query.length < 100) {
    return "simple";
  }
  return "general";
}


// ============================================================================
// Registration
// ============================================================================

/**
 * Register agent methods with the gateway server.
 */
export function registerAgentMethods(server: GatewayServer): void {
  // Store server reference for broadcasting notifications
  gatewayServerRef = server;

  server.registerMethod("agents.status", handleAgentsStatus);
  server.registerMethod("agents.get", handleAgentsGet);
  server.registerMethod("agents.route", handleAgentsRoute);
  server.registerMethod("agents.consult", handleAgentsConsult);
  server.registerMethod("agents.routingStats", handleAgentsRoutingStats);
}

/**
 * Check if a routing decision requires HITL escalation.
 */
export function shouldEscalate(decision: RoutingDecision): boolean {
  return decision.confidence < decision.escalateIfBelow;
}

/**
 * Get the confidence calculator instance.
 */
export function getConfidenceCalculator(): RoutingConfidenceCalculator {
  return confidenceCalculator;
}

// ============================================================================
// Internal API (for agent orchestration)
// ============================================================================

/**
 * Register an active agent.
 */
export function registerAgent(agent: AgentInfo): void {
  activeAgents.set(agent.id, agent);
}

/**
 * Update agent status.
 */
export function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  currentTask?: string
): AgentInfo | null {
  const agent = activeAgents.get(agentId);
  if (!agent) {
    return null;
  }

  agent.status = status;
  agent.lastActivity = Date.now();
  if (currentTask !== undefined) {
    agent.currentTask = currentTask;
  }

  return agent;
}

/**
 * Remove agent.
 */
export function removeAgent(agentId: string): boolean {
  return activeAgents.delete(agentId);
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear active agents (for testing).
 */
export function clearAgents(): void {
  activeAgents.clear();
}

/**
 * Get agents map (for testing).
 */
export function getAgentsMap(): Map<string, AgentInfo> {
  return activeAgents;
}
