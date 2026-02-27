/**
 * Gateway Tools Methods
 *
 * JSON-RPC methods for Composio tool execution.
 * Sprint 50 - Day 7-8 - Gateway Integration
 *
 * @module gateway/methods/tools
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 50 Day 7-8
 */

import type { GatewayServer } from '../server.js';
import type { ClientInfo } from '../types.js';
import type {
  Tool,
  ToolResult,
  PolicyDecision,
  ComposioConnection,
  ApprovalToken,
} from '../../tools/types.js';
import { ToolControlPlane, type DryRunResult } from '../../tools/control-plane.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for tools.discover method.
 */
export interface ToolsDiscoverParams {
  principal_id: string;
  apps?: string[];
}

/**
 * Result of tools.discover method.
 */
export interface ToolsDiscoverResult {
  tools: Tool[];
  total: number;
}

/**
 * Parameters for tools.execute method.
 */
export interface ToolsExecuteParams {
  principal_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  connection_id?: string;
  approval_token?: string;
}

/**
 * Result of tools.execute method.
 */
export interface ToolsExecuteResult {
  status: 'success' | 'pending_approval' | 'denied';
  result?: ToolResult;
  approval_token?: string | undefined;
  expires_at?: Date | undefined;
  message?: string | undefined;
}

/**
 * Parameters for tools.approve method.
 */
export interface ToolsApproveParams {
  approval_token: string;
}

/**
 * Result of tools.approve method.
 */
export interface ToolsApproveResult {
  result: ToolResult;
  executed_at: Date;
}

/**
 * Parameters for tools.cancel method.
 */
export interface ToolsCancelParams {
  approval_token: string;
}

/**
 * Result of tools.cancel method.
 */
export interface ToolsCancelResult {
  success: boolean;
  message: string;
}

/**
 * Parameters for tools.status method.
 */
export interface ToolsStatusParams {
  approval_token: string;
}

/**
 * Result of tools.status method.
 */
export interface ToolsStatusResult {
  token: ApprovalToken | null;
  pending_call: {
    name: string;
    principal_id: string;
  } | null;
}

/**
 * Parameters for tools.connections method.
 */
export interface ToolsConnectionsParams {
  principal_id: string;
}

/**
 * Result of tools.connections method.
 */
export interface ToolsConnectionsResult {
  connections: ComposioConnection[];
  total: number;
}

/**
 * Parameters for tools.dryRun method.
 */
export interface ToolsDryRunParams {
  tool_name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of tools.dryRun method.
 */
export type ToolsDryRunResult = DryRunResult;

/**
 * Parameters for tools.initOAuth method.
 */
export interface ToolsInitOAuthParams {
  principal_id: string;
  app_name: string;
  scopes?: string[];
}

/**
 * Result of tools.initOAuth method.
 */
export interface ToolsInitOAuthResult {
  connection_id: string;
  redirect_url: string;
  state: string;
  expires_at: Date;
}

/**
 * Parameters for tools.handleCallback method.
 */
export interface ToolsHandleCallbackParams {
  state: string;
  code?: string;
  error?: string;
  error_description?: string;
}

/**
 * Result of tools.handleCallback method.
 */
export interface ToolsHandleCallbackResult {
  success: boolean;
  connection_id: string;
  principal_id: string;
  app_name: string;
  error?: string | undefined;
}

// ============================================================================
// State
// ============================================================================

let controlPlane: ToolControlPlane | null = null;

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Discover available tools for a principal.
 * tools.discover
 */
async function handleToolsDiscover(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsDiscoverResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { principal_id, apps } = params as ToolsDiscoverParams;

  if (!principal_id) {
    throw new Error('principal_id is required');
  }

  const tools = await controlPlane.discoverTools(principal_id, apps);
  return { tools, total: tools.length };
}

/**
 * Execute a tool with policy check.
 * tools.execute
 */
async function handleToolsExecute(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsExecuteResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const {
    principal_id,
    tool_name,
    arguments: args,
    approval_token,
  } = params as ToolsExecuteParams;

  if (!principal_id) {
    throw new Error('principal_id is required');
  }
  if (!tool_name) {
    throw new Error('tool_name is required');
  }

  // If approval token provided, execute with approval
  if (approval_token) {
    const result = await controlPlane.executeWithApproval(approval_token);
    return { status: 'success', result };
  }

  // Evaluate policy
  const decision: PolicyDecision = await controlPlane.evaluate(
    tool_name,
    args,
    principal_id
  );

  if (decision.action === 'allow') {
    // Auto-execute READ tools
    const result = await controlPlane.execute(tool_name, args, principal_id);
    return { status: 'success', result };
  }

  if (decision.action === 'require_approval') {
    return {
      status: 'pending_approval',
      approval_token: decision.approval_token,
      expires_at: decision.expires_at,
      message: `${decision.risk} tool requires CEO approval. Use tools.approve within 5 minutes.`,
    };
  }

  // Denied
  return {
    status: 'denied',
    message: `Tool execution denied: ${decision.reason}`,
  };
}

/**
 * Approve a pending tool execution.
 * tools.approve
 */
async function handleToolsApprove(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsApproveResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { approval_token } = params as ToolsApproveParams;

  if (!approval_token) {
    throw new Error('approval_token is required');
  }

  const result = await controlPlane.executeWithApproval(approval_token);
  return { result, executed_at: new Date() };
}

/**
 * Cancel a pending tool execution.
 * tools.cancel
 */
async function handleToolsCancel(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsCancelResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { approval_token } = params as ToolsCancelParams;

  if (!approval_token) {
    throw new Error('approval_token is required');
  }

  const cancelled = await controlPlane.cancelApproval(approval_token);
  return {
    success: cancelled,
    message: cancelled
      ? `Approval token ${approval_token} cancelled`
      : 'Token not found or already used',
  };
}

/**
 * Get status of a pending tool execution.
 * tools.status
 */
async function handleToolsStatus(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsStatusResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { approval_token } = params as ToolsStatusParams;

  if (!approval_token) {
    throw new Error('approval_token is required');
  }

  const token = await controlPlane.getApprovalStatus(approval_token);
  const pendingCall = token
    ? await controlPlane.getPendingCall(approval_token)
    : null;

  return {
    token,
    pending_call: pendingCall
      ? {
          name: pendingCall.name,
          principal_id: pendingCall.principal_id,
        }
      : null,
  };
}

/**
 * List OAuth connections for a principal.
 * tools.connections
 */
async function handleToolsConnections(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsConnectionsResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { principal_id } = params as ToolsConnectionsParams;

  if (!principal_id) {
    throw new Error('principal_id is required');
  }

  const connections = await controlPlane.getConnections(principal_id);
  return { connections, total: connections.length };
}

/**
 * Dry-run a tool call (simulate without executing).
 * tools.dryRun
 */
async function handleToolsDryRun(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsDryRunResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { tool_name, arguments: args } = params as ToolsDryRunParams;

  if (!tool_name) {
    throw new Error('tool_name is required');
  }

  return controlPlane.dryRun(tool_name, args);
}

/**
 * Initiate OAuth flow for an app.
 * tools.initOAuth
 */
async function handleToolsInitOAuth(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsInitOAuthResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { principal_id, app_name, scopes } = params as ToolsInitOAuthParams;

  if (!principal_id) {
    throw new Error('principal_id is required');
  }
  if (!app_name) {
    throw new Error('app_name is required');
  }

  const result = await controlPlane.initOAuth(principal_id, app_name, scopes);
  return result;
}

/**
 * Handle OAuth callback after user authorization.
 * tools.handleCallback
 */
async function handleToolsHandleCallback(
  params: unknown,
  _client: ClientInfo
): Promise<ToolsHandleCallbackResult> {
  if (!controlPlane) {
    throw new Error('ToolControlPlane not initialized');
  }

  const { state, code, error, error_description } = params as ToolsHandleCallbackParams;

  if (!state) {
    throw new Error('state is required');
  }

  const result = await controlPlane.handleOAuthCallback({
    state,
    code,
    error,
    error_description,
  });

  return result;
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register tools methods with the gateway server.
 */
export function registerToolsMethods(
  server: GatewayServer,
  plane?: ToolControlPlane
): void {
  // Use provided control plane or create one
  if (plane) {
    controlPlane = plane;
  } else if (!controlPlane) {
    controlPlane = new ToolControlPlane();
    void controlPlane.initialize();
  }

  // Register methods
  server.registerMethod('tools.discover', handleToolsDiscover);
  server.registerMethod('tools.execute', handleToolsExecute);
  server.registerMethod('tools.approve', handleToolsApprove);
  server.registerMethod('tools.cancel', handleToolsCancel);
  server.registerMethod('tools.status', handleToolsStatus);
  server.registerMethod('tools.connections', handleToolsConnections);
  server.registerMethod('tools.dryRun', handleToolsDryRun);
  server.registerMethod('tools.initOAuth', handleToolsInitOAuth);
  server.registerMethod('tools.handleCallback', handleToolsHandleCallback);
}

// ============================================================================
// Internal API
// ============================================================================

/**
 * Get the control plane instance.
 */
export function getControlPlane(): ToolControlPlane | null {
  return controlPlane;
}

/**
 * Set the control plane instance (for testing).
 */
export function setControlPlane(plane: ToolControlPlane | null): void {
  controlPlane = plane;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Reset tools state (for testing).
 */
export function resetToolsState(): void {
  if (controlPlane) {
    void controlPlane.dispose();
  }
  controlPlane = null;
}
