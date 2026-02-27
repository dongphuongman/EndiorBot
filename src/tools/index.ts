/**
 * Tools module - Composio Integration Phase 1
 * Sprint 50 - Security Foundation + Real API Integration
 *
 * This module provides a secure tool execution infrastructure
 * with policy enforcement, approval workflows, and audit logging.
 */

// Types
export * from './types.js';

// Day 3-4: Core security components
export { PolicyEngine, type PolicyEngineConfig } from './policy-engine.js';
export { ApprovalQueue, ApprovalError, type ApprovalQueueConfig } from './approval-queue.js';
export { AuditLogger, type AuditLoggerConfig } from './audit-logger.js';
export { ToolControlPlane, type ToolControlPlaneConfig, type DryRunResult } from './control-plane.js';

// Day 5-6: Real API integration
export { ComposioClient, ComposioError, type ComposioClientConfig } from './composio-client.js';
export {
  ToolRegistry,
  ToolRegistryError,
  PHASE_1_WHITELIST,
  type Phase1Tool,
  type ToolRegistryConfig,
} from './tool-registry.js';
export {
  ToolExecutor,
  ToolExecutorError,
  type ToolExecutorConfig,
  type ValidationResult,
} from './tool-executor.js';
export {
  AuthManager,
  type AuthManagerConfig,
  type ConnectionRequest,
  type ConnectionResult,
} from './auth-manager.js';

// Re-export commonly used types for convenience
export type {
  Tool,
  ToolCall,
  ToolResult,
  ToolRisk,
  PolicyAction,
  PolicyDecision,
  ApprovalToken,
  ComposioConnection,
  ToolAuditLog,
  ToolExecutionEvent,
} from './types.js';
