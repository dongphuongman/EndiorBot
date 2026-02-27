/**
 * ToolAwareOrchestrator - Wraps provider + Composio for tool-aware conversations
 * Sprint 51 - Day 1-2 - Composio Integration Phase 2
 *
 * Key concept: Providers return tool_calls as **proposals only**.
 * Actual execution happens through ToolControlPlane for policy enforcement.
 *
 * @module tools/orchestrator
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import crypto from 'crypto';
import type { AIProvider, ChatRequest, ChatResponse, Message } from '../providers/types.js';
import { ToolControlPlane } from './control-plane.js';
import { ToolRegistry } from './tool-registry.js';
import type {
  Tool,
  ToolCall,
  ToolResult,
  PolicyDecision,
  ToolRisk,
} from './types.js';
import { createLogger, type Logger } from '../logging/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for ToolAwareOrchestrator
 */
export interface OrchestratorConfig {
  /** AI provider for chat */
  provider: AIProvider;
  /** ToolControlPlane for policy enforcement */
  controlPlane: ToolControlPlane;
  /** ToolRegistry for tool discovery */
  toolRegistry: ToolRegistry;
  /** Principal ID for this session */
  principal_id: string;
  /** Auto-execute READ tools without approval (default: true) */
  autoExecuteReads?: boolean;
  /** Callback when approval is required */
  onApprovalRequired?: (decision: PolicyDecision, toolCall: ToolCall) => Promise<void>;
  /** Callback for tool execution events (Brain integration) */
  onToolExecution?: (event: ToolExecutionEvent) => Promise<void>;
}

/**
 * Extended ChatResponse with tool awareness
 */
export interface ToolAwareResponse extends Omit<ChatResponse, 'toolCalls'> {
  /** Original tool calls from the provider */
  tool_calls?: ToolCall[];
  /** Results of executed tools */
  tool_results?: ToolResult[];
  /** Decisions requiring CEO approval */
  pending_approvals?: PolicyDecision[];
  /** Whether tools were invoked */
  tools_invoked: boolean;
}

/**
 * Tool execution event for Brain integration
 */
export interface ToolExecutionEvent {
  type: 'tool_execution';
  tool_name: string;
  principal_id: string;
  success: boolean;
  latency_ms: number;
  risk: ToolRisk;
  auto_executed: boolean;
  timestamp: Date;
}

/**
 * Tool specification for provider injection
 */
interface ProviderTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// =============================================================================
// ToolAwareOrchestrator
// =============================================================================

/**
 * Orchestrates AI conversations with tool awareness.
 *
 * Features:
 * - Injects available tools into provider requests
 * - Extracts tool_calls from provider responses
 * - Routes calls through ToolControlPlane for policy
 * - Auto-executes READ tools (configurable)
 * - Queues WRITE/DESTRUCTIVE for CEO approval
 */
export class ToolAwareOrchestrator {
  private provider: AIProvider;
  private controlPlane: ToolControlPlane;
  private toolRegistry: ToolRegistry;
  private principal_id: string;
  private autoExecuteReads: boolean;
  private onApprovalRequired?: (decision: PolicyDecision, toolCall: ToolCall) => Promise<void>;
  private onToolExecution?: (event: ToolExecutionEvent) => Promise<void>;
  private log: Logger;

  constructor(config: OrchestratorConfig) {
    this.provider = config.provider;
    this.controlPlane = config.controlPlane;
    this.toolRegistry = config.toolRegistry;
    this.principal_id = config.principal_id;
    this.autoExecuteReads = config.autoExecuteReads ?? true;
    this.onApprovalRequired = config.onApprovalRequired;
    this.onToolExecution = config.onToolExecution;
    this.log = createLogger('tool-orchestrator');
  }

  // ===========================================================================
  // Core Chat
  // ===========================================================================

  /**
   * Send chat request with tool awareness.
   * Injects available tools, handles tool_calls in response.
   */
  async chat(request: ChatRequest): Promise<ToolAwareResponse> {
    const startTime = Date.now();

    // 1. Get available tools for this principal
    const tools = await this.toolRegistry.discoverTools(this.principal_id);
    this.log.debug('Discovered tools', { count: tools.length });

    // 2. Inject tools into request
    const toolAwareRequest = this.injectTools(request, tools);

    // 3. Send to provider
    const response = await this.provider.chat(toolAwareRequest);

    // 4. Extract tool_calls from response
    const toolCalls = this.extractToolCalls(response);

    if (toolCalls.length === 0) {
      return {
        ...response,
        tools_invoked: false,
      };
    }

    this.log.info('Tool calls detected', {
      count: toolCalls.length,
      tools: toolCalls.map((t) => t.name),
    });

    // 5. Process each tool call through ToolControlPlane
    const results: ToolResult[] = [];
    const pendingApprovals: PolicyDecision[] = [];

    for (const toolCall of toolCalls) {
      const callStartTime = Date.now();
      const decision = await this.controlPlane.evaluate(
        toolCall.name,
        toolCall.arguments,
        this.principal_id,
        toolCall.connection_id
      );

      if (decision.action === 'allow') {
        // Auto-execute if READ or autoExecuteReads is true
        if (decision.risk === 'READ' || this.autoExecuteReads) {
          const result = await this.controlPlane.execute(
            toolCall.name,
            toolCall.arguments,
            this.principal_id,
            toolCall.connection_id
          );
          results.push(result);

          // Emit execution event
          await this.emitToolEvent(toolCall, result, decision.risk, true, callStartTime);
        } else {
          // WRITE tools that need approval
          pendingApprovals.push(decision);
          if (this.onApprovalRequired) {
            await this.onApprovalRequired(decision, toolCall);
          }
        }
      } else if (decision.action === 'require_approval') {
        // Queue for CEO approval
        pendingApprovals.push(decision);
        if (this.onApprovalRequired) {
          await this.onApprovalRequired(decision, toolCall);
        }
      } else {
        // Denied
        const deniedResult: ToolResult = {
          id: toolCall.id,
          success: false,
          error: {
            code: 'POLICY_DENIED',
            message: decision.reason,
          },
          duration_ms: Date.now() - callStartTime,
        };
        results.push(deniedResult);

        // Emit denied event
        await this.emitToolEvent(toolCall, deniedResult, decision.risk, false, callStartTime);
      }
    }

    const totalDuration = Date.now() - startTime;
    this.log.info('Chat with tools completed', {
      totalDuration,
      toolsCalled: toolCalls.length,
      toolsExecuted: results.length,
      pendingApprovals: pendingApprovals.length,
    });

    return {
      ...response,
      tool_calls: toolCalls,
      tool_results: results,
      pending_approvals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
      tools_invoked: true,
    };
  }

  /**
   * Continue conversation with tool results.
   * Used after CEO approval or manual tool execution.
   */
  async continueWithToolResults(
    originalRequest: ChatRequest,
    toolResults: ToolResult[]
  ): Promise<ToolAwareResponse> {
    // Add tool results to conversation
    const toolResultMessage: Message = {
      role: 'assistant', // Tool results come back as assistant context
      content: this.formatToolResults(toolResults),
    };

    const messagesWithResults = [...originalRequest.messages, toolResultMessage];

    return this.chat({
      ...originalRequest,
      messages: messagesWithResults,
    });
  }

  /**
   * Execute a pending approval token.
   */
  async executeApproval(approvalToken: string): Promise<ToolResult> {
    return this.controlPlane.executeWithApproval(approvalToken);
  }

  // ===========================================================================
  // Tool Injection
  // ===========================================================================

  /**
   * Inject available tools into the request.
   */
  private injectTools(request: ChatRequest, tools: Tool[]): ChatRequest {
    // Convert Composio tools to provider format
    const providerTools = tools.map((tool) => this.convertToProviderTool(tool));

    return {
      ...request,
      tools: providerTools,
    };
  }

  /**
   * Convert Composio tool to provider-specific format.
   */
  private convertToProviderTool(tool: Tool): ProviderTool {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      properties[param.name] = {
        type: this.mapParameterType(param.type),
        description: param.description,
      };

      // Add enum if present
      if (param.enum && param.enum.length > 0) {
        (properties[param.name] as Record<string, unknown>).enum = param.enum;
      }

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    };
  }

  /**
   * Map Composio parameter types to JSON Schema types.
   */
  private mapParameterType(
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  ): string {
    // Types are already JSON Schema compatible
    return type;
  }

  // ===========================================================================
  // Tool Call Extraction
  // ===========================================================================

  /**
   * Extract tool calls from provider response.
   */
  private extractToolCalls(response: ChatResponse): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const call of response.toolCalls) {
        toolCalls.push({
          id: call.id || crypto.randomUUID(),
          name: call.name,
          arguments: call.arguments,
          principal_id: this.principal_id,
        });
      }
    }

    return toolCalls;
  }

  /**
   * Format tool results for conversation continuation.
   */
  private formatToolResults(results: ToolResult[]): string {
    const formatted = results.map((r) => {
      if (r.success) {
        return `Tool ${r.id}: SUCCESS\n${JSON.stringify(r.output, null, 2)}`;
      } else {
        return `Tool ${r.id}: FAILED\nError: ${r.error?.message || 'Unknown error'}`;
      }
    });

    return `<tool_results>\n${formatted.join('\n\n')}\n</tool_results>`;
  }

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  /**
   * Emit tool execution event for Brain integration.
   */
  private async emitToolEvent(
    toolCall: ToolCall,
    result: ToolResult,
    risk: ToolRisk,
    autoExecuted: boolean,
    startTime: number
  ): Promise<void> {
    if (!this.onToolExecution) {
      return;
    }

    const event: ToolExecutionEvent = {
      type: 'tool_execution',
      tool_name: toolCall.name,
      principal_id: this.principal_id,
      success: result.success,
      latency_ms: Date.now() - startTime,
      risk,
      auto_executed: autoExecuted,
      timestamp: new Date(),
    };

    try {
      await this.onToolExecution(event);
    } catch (error) {
      this.log.warn('Failed to emit tool event', {
        error: (error as Error).message,
      });
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get available tools for this principal.
   */
  async getAvailableTools(): Promise<Tool[]> {
    return this.toolRegistry.discoverTools(this.principal_id);
  }

  /**
   * Check if a specific tool is available.
   */
  async isToolAvailable(toolName: string): Promise<boolean> {
    const tools = await this.getAvailableTools();
    return tools.some((t) => t.name === toolName);
  }

  /**
   * Get rate limit status.
   */
  getRateLimitStats() {
    return this.controlPlane.getRateLimitStats(this.principal_id);
  }

  /**
   * Get approval queue status.
   */
  getApprovalQueueStats() {
    return this.controlPlane.getApprovalQueueStats();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ToolAwareOrchestrator with minimal config.
 */
export function createToolAwareOrchestrator(
  config: OrchestratorConfig
): ToolAwareOrchestrator {
  return new ToolAwareOrchestrator(config);
}
