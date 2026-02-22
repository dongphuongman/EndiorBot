/**
 * Agent Types
 *
 * Core interfaces for agent orchestration.
 * Based on TS-003 Agent Orchestration specification.
 */

import type { SDLCStage } from "../sessions/types.js";

// ============================================================================
// Task Classification
// ============================================================================

export type TaskType =
  | "architecture"    // Multi-model recommended
  | "security"        // Cross-validation critical
  | "code_gen"        // Single model (speed)
  | "bug_fix"         // Single model (speed)
  | "research"        // Multi-model (diverse data)
  | "general";        // Auto-detect

export interface QueryClassification {
  complexity: "low" | "medium" | "high";
  domain: string;
  urgency: "low" | "normal" | "high";
  recommendedModel: ModelRecommendation;
}

export interface ModelRecommendation {
  model: string;
  reason: string;
}

// ============================================================================
// Model Selection
// ============================================================================

export type ModelRole = "primary" | "expert";

export interface ModelSelection {
  provider: string;
  model: string;
  role: ModelRole;
}

// ============================================================================
// Consultation
// ============================================================================

export interface ConsultationRequest {
  query: string;
  taskType: TaskType;
  models?: ModelSelection[];
  timeout?: number;
  minResponses?: number;
}

export interface ModelResponse {
  provider: string;
  model: string;
  role: ModelRole;
  content: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface Disagreement {
  topic: string;
  positions: {
    provider: string;
    position: string;
    reasoning?: string;
  }[];
}

export interface ConsensusResult {
  hasConsensus: boolean;
  consensusPoints: string[];
  disagreements: Disagreement[];
  recommendation: string;
}

export interface SDLCComplianceCheck {
  passed: boolean;
  currentStage: SDLCStage;
  requiredArtifacts: string[];
  missingArtifacts: string[];
  recommendations: string[];
}

export interface ConsultationResult {
  taskId: string;
  query: string;
  taskType: TaskType;
  responses: ModelResponse[];
  consensus: ConsensusResult;
  sdlcCompliance: SDLCComplianceCheck;
  totalLatencyMs: number;
}

export interface ConsultationChunk {
  taskId: string;
  provider: string;
  delta: string;
  done: boolean;
}

// ============================================================================
// Agent Scope
// ============================================================================

export interface AgentWorkspace {
  path: string;
  allowedPaths: string[];
  blockedPaths: string[];
}

export interface AgentPermissions {
  canExecuteCommands: boolean;
  canModifyFiles: boolean;
  canAccessNetwork: boolean;
  canApproveGates: boolean;
  maxTokenBudget: number;
}

export interface AgentScope {
  id: string;
  name: string;
  workspace: AgentWorkspace;
  permissions: AgentPermissions;
}

// ============================================================================
// Agent Events
// ============================================================================

export type AgentEventType =
  | "consultation-started"
  | "consultation-response"
  | "consultation-completed"
  | "consultation-error"
  | "task-classified";

export interface AgentEvent {
  type: AgentEventType;
  taskId?: string;
  timestamp: Date;
  data?: unknown;
}

export type AgentEventListener = (event: AgentEvent) => void;
