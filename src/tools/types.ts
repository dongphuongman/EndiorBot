/**
 * Tool-related type definitions for Composio integration
 * Phase 1: Security Foundation
 */

// Risk classification
export type ToolRisk = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';

// Policy decision
export type PolicyAction = 'allow' | 'deny' | 'require_approval';

export interface PolicyDecision {
  action: PolicyAction;
  risk: ToolRisk;
  reason: string;
  approval_token?: string;
  expires_at?: Date;
}

// Tool definition (from Composio)
export interface Tool {
  name: string;
  app: string;
  description: string;
  parameters: ToolParameter[];
  tags: string[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
  pattern?: string;
}

// Tool call
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  principal_id: string;
  connection_id?: string;
}

// Tool result
export interface ToolResult {
  id: string;
  success: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  duration_ms: number;
}

// Approval token
export interface ApprovalToken {
  token: string;
  tool_name: string;
  args_hash: string;
  principal_id: string;
  connection_id: string;
  expires_at: Date;
  used: boolean;
  idempotency_key: string;
  created_at: Date;
}

// Connection (OAuth)
export interface ComposioConnection {
  principal_id: string;
  composio_entity_id: string;
  connection_id: string;
  app_name: string;
  connection_status: 'pending' | 'active' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

// Audit log entry
export interface ToolAuditLog {
  id: string;
  principal_id: string;
  tool: string;
  args_hash: string;
  connection_id: string;
  result_summary: string;
  duration_ms: number;
  status: 'success' | 'failure' | 'denied' | 'pending_approval';
  risk: ToolRisk;
  approval_token?: string;
  error_code?: string;
  timestamp: Date;
}

// Brain event (Layer 1)
export interface ToolExecutionEvent {
  type: 'tool_execution';
  tool_name: string;
  principal_id: string;
  input_hash: string;
  output_summary: string;
  success: boolean;
  latency_ms: number;
  cost_usd: number;
  connection_id: string;
  timestamp: Date;
}
