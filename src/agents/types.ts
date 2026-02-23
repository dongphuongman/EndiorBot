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

/**
 * Task complexity levels with clear criteria.
 * Used for model selection and quality gates.
 *
 * - simple: Trivial tasks, no reasoning required (typos, renames)
 * - moderate: Standard tasks, some reasoning (simple features, bug fixes)
 * - complex: Multi-step reasoning, cross-domain (architecture, integrations)
 * - critical: High-stakes, requires validation (security, production)
 */
export type TaskComplexity = "simple" | "moderate" | "complex" | "critical";

/**
 * Model tier for capability-based selection.
 */
export type ModelTier = "fast" | "balanced" | "powerful" | "expert";

/**
 * Complexity scoring factors.
 */
export interface ComplexityFactors {
  /** Number of concepts involved */
  conceptCount: number;
  /** Cross-domain references */
  domainCrossing: boolean;
  /** Estimated tokens needed */
  estimatedTokens: number;
  /** Requires multi-step reasoning */
  multiStepReasoning: boolean;
  /** Has security implications */
  securityImplications: boolean;
  /** Production/deployment scope */
  productionScope: boolean;
  /** Needs external validation */
  needsValidation: boolean;
}

/**
 * Extended classification with complexity scoring.
 */
export interface QueryClassification {
  /** Task type category */
  taskType: TaskType;
  /** Complexity level (simple/moderate/complex/critical) */
  complexity: TaskComplexity;
  /** Legacy complexity for backward compat */
  legacyComplexity: "low" | "medium" | "high";
  /** Domain of the query */
  domain: string;
  /** Urgency level */
  urgency: "low" | "normal" | "high";
  /** Model recommendation */
  recommendedModel: ModelRecommendation;
  /** Minimum model tier for quality */
  minModelTier: ModelTier;
  /** Complexity scoring factors */
  factors: ComplexityFactors;
  /** Overall complexity score (0-100) */
  complexityScore: number;
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

// ============================================================================
// Parallel Execution
// ============================================================================

/**
 * Task status in parallel execution.
 */
export type ParallelTaskStatus =
  | "pending"      // Not started
  | "ready"        // Dependencies met, ready to run
  | "running"      // Currently executing
  | "completed"    // Successfully completed
  | "failed"       // Failed with error
  | "blocked"      // Blocked by dependency or resource
  | "cancelled";   // Cancelled by user or system

/**
 * Parallel task definition.
 */
export interface ParallelTask {
  /** Unique task ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Task type for routing */
  type: TaskType;
  /** Complexity for resource allocation */
  complexity: TaskComplexity;
  /** Task payload/query */
  query: string;
  /** Files this task will read */
  reads?: string[];
  /** Files this task will write */
  writes?: string[];
  /** Tasks this depends on */
  dependsOn?: string[];
  /** Execution timeout in ms */
  timeout?: number;
  /** Task priority (higher = sooner) */
  priority?: number;
}

/**
 * Track for parallel execution.
 * Each track is an independent execution unit.
 */
export interface ExecutionTrack {
  /** Track ID */
  id: string;
  /** Track name */
  name: string;
  /** Current status */
  status: "idle" | "running" | "paused" | "stopped";
  /** Current task ID */
  currentTaskId?: string;
  /** Assigned budget percentage (0-100) */
  budgetPercent: number;
  /** Tasks assigned to this track */
  taskIds: string[];
  /** Completed task count */
  completed: number;
  /** Failed task count */
  failed: number;
}

/**
 * Batch of tasks that can run in parallel.
 */
export interface TaskBatch {
  /** Batch ID */
  id: string;
  /** Batch number (execution order) */
  order: number;
  /** Task IDs in this batch */
  taskIds: string[];
  /** Dependencies from previous batches */
  dependsOnBatches: string[];
}

/**
 * Parallel execution result.
 */
export interface ParallelExecutionResult {
  /** Total tasks */
  totalTasks: number;
  /** Successfully completed */
  completedTasks: number;
  /** Failed tasks */
  failedTasks: number;
  /** Tasks per batch */
  batches: {
    batchId: string;
    taskCount: number;
    successCount: number;
    failCount: number;
    durationMs: number;
  }[];
  /** Total execution time */
  totalDurationMs: number;
  /** Task-level results */
  taskResults: Map<string, ParallelTaskResult>;
}

/**
 * Individual task result.
 */
export interface ParallelTaskResult {
  /** Task ID */
  taskId: string;
  /** Final status */
  status: ParallelTaskStatus;
  /** Start time */
  startedAt?: Date;
  /** End time */
  completedAt?: Date;
  /** Duration in ms */
  durationMs?: number;
  /** Result data */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Track that executed this task */
  trackId?: string;
}
