/**
 * ComposioClient - Wrapper for @composio/core SDK
 * Sprint 50 - Day 5-6 - Real Composio API Integration
 *
 * Handles:
 * - API initialization with graceful degradation
 * - Tool discovery from Composio
 * - Tool execution via Composio
 * - Connection management (OAuth)
 */

import type { Tool, ToolCall, ComposioConnection } from './types.js';

/**
 * Result of OAuth callback processing
 */
export interface OAuthCallbackResult {
  success: boolean;
  connection_id: string;
  error?: string;
}

/**
 * Configuration for ComposioClient
 */
export interface ComposioClientConfig {
  /** Composio API key (optional - graceful degradation if not provided) */
  apiKey?: string;
  /** Base URL for Composio API */
  baseUrl?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Enable mock mode for testing */
  mockMode?: boolean;
}

/**
 * Entity represents a user/principal in Composio
 */
interface ComposioEntity {
  id: string;
  connections: ComposioConnection[];
}

/**
 * ComposioClient provides access to Composio's tool ecosystem
 * with graceful degradation when API key is not configured
 */
export class ComposioClient {
  private readonly config: Required<ComposioClientConfig>;
  private composio: unknown; // Composio SDK instance
  private initialized = false;
  private entities: Map<string, ComposioEntity> = new Map();

  static readonly DEFAULT_TIMEOUT_MS = 30000;
  static readonly DEFAULT_BASE_URL = 'https://api.composio.dev';

  constructor(config: ComposioClientConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.COMPOSIO_API_KEY ?? '',
      baseUrl: config.baseUrl ?? ComposioClient.DEFAULT_BASE_URL,
      timeoutMs: config.timeoutMs ?? ComposioClient.DEFAULT_TIMEOUT_MS,
      mockMode: config.mockMode ?? false,
    };
  }

  /**
   * Initialize the Composio SDK
   * Returns false if API key is not configured (graceful degradation)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return this.isConfigured();

    if (!this.config.apiKey && !this.config.mockMode) {
      console.warn('[ComposioClient] No API key configured - running in degraded mode');
      this.initialized = true;
      return false;
    }

    if (this.config.mockMode) {
      console.info('[ComposioClient] Running in mock mode');
      this.initialized = true;
      return true;
    }

    try {
      // Dynamic import to avoid hard dependency
      const { Composio } = await import('@composio/core');
      this.composio = new Composio({ apiKey: this.config.apiKey });
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[ComposioClient] Failed to initialize:', error);
      this.initialized = true;
      return false;
    }
  }

  /**
   * Check if Composio is properly configured
   */
  isConfigured(): boolean {
    return this.config.mockMode || (!!this.config.apiKey && !!this.composio);
  }

  /**
   * Get available tools from Composio for a principal
   */
  async getTools(principal_id: string, apps: string[] = []): Promise<Tool[]> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode) {
      return this.getMockTools(apps);
    }

    if (!this.isConfigured()) {
      // Return empty list in degraded mode
      return [];
    }

    try {
      const entity = await this.getOrCreateEntity(principal_id);
      // @ts-expect-error - Composio SDK types
      const tools = await this.composio.getTools({
        entityId: entity.id,
        apps: apps.length > 0 ? apps : undefined,
      });

      return this.normalizeTools(tools);
    } catch (error) {
      console.error('[ComposioClient] Failed to get tools:', error);
      return [];
    }
  }

  /**
   * Execute a tool via Composio
   */
  async executeTool(call: ToolCall, principal_id: string): Promise<unknown> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode) {
      return this.mockExecute(call);
    }

    if (!this.isConfigured()) {
      throw new ComposioError('NOT_CONFIGURED', 'Composio API key not configured');
    }

    try {
      const entity = await this.getOrCreateEntity(principal_id);
      // @ts-expect-error - Composio SDK types
      const result = await this.composio.executeAction({
        actionId: call.name,
        entityId: entity.id,
        connectedAccountId: call.connection_id,
        params: call.arguments,
      });

      return result;
    } catch (error) {
      throw new ComposioError(
        'EXECUTION_FAILED',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get or create an entity for a principal
   */
  async getOrCreateEntity(principal_id: string): Promise<ComposioEntity> {
    if (this.entities.has(principal_id)) {
      return this.entities.get(principal_id)!;
    }

    if (this.config.mockMode) {
      const entity: ComposioEntity = {
        id: `entity_${principal_id.slice(0, 8)}`,
        connections: [],
      };
      this.entities.set(principal_id, entity);
      return entity;
    }

    if (!this.isConfigured()) {
      throw new ComposioError('NOT_CONFIGURED', 'Composio API key not configured');
    }

    try {
      // @ts-expect-error - Composio SDK types
      const entity = await this.composio.getEntity({ id: principal_id });
      const composioEntity: ComposioEntity = {
        id: entity.id,
        connections: [],
      };
      this.entities.set(principal_id, composioEntity);
      return composioEntity;
    } catch {
      // Create new entity if not found
      // @ts-expect-error - Composio SDK types
      const entity = await this.composio.createEntity({ id: principal_id });
      const composioEntity: ComposioEntity = {
        id: entity.id,
        connections: [],
      };
      this.entities.set(principal_id, composioEntity);
      return composioEntity;
    }
  }

  /**
   * Get connections for a principal
   */
  async getConnections(principal_id: string): Promise<ComposioConnection[]> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode || !this.isConfigured()) {
      return this.entities.get(principal_id)?.connections ?? [];
    }

    try {
      const entity = await this.getOrCreateEntity(principal_id);
      // @ts-expect-error - Composio SDK types
      const connections = await this.composio.getConnections({
        entityId: entity.id,
      });

      return connections.map((conn: Record<string, unknown>) => ({
        principal_id,
        composio_entity_id: entity.id,
        connection_id: conn.id as string,
        app_name: conn.appName as string,
        connection_status: conn.status as 'pending' | 'active' | 'revoked',
        created_at: new Date(conn.createdAt as string),
        updated_at: new Date(conn.updatedAt as string),
      }));
    } catch (error) {
      console.error('[ComposioClient] Failed to get connections:', error);
      return [];
    }
  }

  /**
   * Initiate OAuth connection for an app
   */
  async initiateConnection(
    principal_id: string,
    app_name: string
  ): Promise<{ redirect_url: string; connection_id: string }> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode) {
      return {
        redirect_url: `https://mock.composio.dev/oauth/${app_name}`,
        connection_id: `mock_conn_${Date.now()}`,
      };
    }

    if (!this.isConfigured()) {
      throw new ComposioError('NOT_CONFIGURED', 'Composio API key not configured');
    }

    try {
      const entity = await this.getOrCreateEntity(principal_id);
      // @ts-expect-error - Composio SDK types
      const result = await this.composio.initiateConnection({
        entityId: entity.id,
        appName: app_name,
      });

      return {
        redirect_url: result.redirectUrl,
        connection_id: result.connectionId,
      };
    } catch (error) {
      throw new ComposioError(
        'CONNECTION_FAILED',
        error instanceof Error ? error.message : 'Failed to initiate connection'
      );
    }
  }

  /**
   * Handle OAuth callback after user authorization
   * Called when user completes OAuth flow and is redirected back
   */
  async handleOAuthCallback(connection_id: string, code: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode) {
      // In mock mode, mark connection as active in any entity that has it pending
      for (const entity of this.entities.values()) {
        const conn = entity.connections.find((c) => c.connection_id === connection_id);
        if (conn) {
          conn.connection_status = 'active';
          conn.updated_at = new Date();
        }
      }
      return;
    }

    if (!this.isConfigured()) {
      throw new ComposioError('NOT_CONFIGURED', 'Composio API key not configured');
    }

    try {
      // @ts-expect-error - Composio SDK types
      await this.composio.completeConnection({
        connectionId: connection_id,
        authorizationCode: code,
      });
    } catch (error) {
      throw new ComposioError(
        'CALLBACK_FAILED',
        error instanceof Error ? error.message : 'Failed to complete OAuth callback'
      );
    }
  }

  /**
   * Disconnect an OAuth connection
   */
  async disconnect(principal_id: string, connection_id: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (this.config.mockMode) {
      const entity = this.entities.get(principal_id);
      if (entity) {
        entity.connections = entity.connections.filter(
          (c) => c.connection_id !== connection_id
        );
      }
      return;
    }

    if (!this.isConfigured()) {
      throw new ComposioError('NOT_CONFIGURED', 'Composio API key not configured');
    }

    try {
      // @ts-expect-error - Composio SDK types
      await this.composio.deleteConnection({ connectionId: connection_id });
    } catch (error) {
      throw new ComposioError(
        'DISCONNECT_FAILED',
        error instanceof Error ? error.message : 'Failed to disconnect'
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    configured: boolean;
    connected: boolean;
    mockMode: boolean;
  }> {
    if (!this.initialized) await this.initialize();

    return {
      configured: this.isConfigured(),
      connected: this.isConfigured() && !this.config.mockMode,
      mockMode: this.config.mockMode,
    };
  }

  /**
   * Get mock tools for testing
   */
  private getMockTools(apps: string[]): Tool[] {
    const allTools: Tool[] = [
      {
        name: 'github.get_repo',
        app: 'github',
        description: 'Get repository information',
        parameters: [
          { name: 'owner', type: 'string', description: 'Repository owner', required: true },
          { name: 'repo', type: 'string', description: 'Repository name', required: true },
        ],
        tags: ['READ'],
      },
      {
        name: 'github.get_issue',
        app: 'github',
        description: 'Get issue details',
        parameters: [
          { name: 'owner', type: 'string', description: 'Repository owner', required: true },
          { name: 'repo', type: 'string', description: 'Repository name', required: true },
          { name: 'issue_number', type: 'number', description: 'Issue number', required: true },
        ],
        tags: ['READ'],
      },
      {
        name: 'github.create_issue',
        app: 'github',
        description: 'Create a new issue',
        parameters: [
          { name: 'owner', type: 'string', description: 'Repository owner', required: true },
          { name: 'repo', type: 'string', description: 'Repository name', required: true },
          { name: 'title', type: 'string', description: 'Issue title', required: true },
          { name: 'body', type: 'string', description: 'Issue body', required: false },
        ],
        tags: ['WRITE'],
      },
      {
        name: 'gmail.list_messages',
        app: 'gmail',
        description: 'List email messages',
        parameters: [
          { name: 'max_results', type: 'number', description: 'Max results', required: false },
          { name: 'query', type: 'string', description: 'Search query', required: false },
        ],
        tags: ['READ'],
      },
      {
        name: 'gmail.send_message',
        app: 'gmail',
        description: 'Send an email',
        parameters: [
          { name: 'to', type: 'string', description: 'Recipient email', required: true },
          { name: 'subject', type: 'string', description: 'Email subject', required: true },
          { name: 'body', type: 'string', description: 'Email body', required: true },
        ],
        tags: ['WRITE'],
      },
      {
        name: 'google_calendar.list_events',
        app: 'google_calendar',
        description: 'List calendar events',
        parameters: [
          { name: 'calendar_id', type: 'string', description: 'Calendar ID', required: false },
          { name: 'max_results', type: 'number', description: 'Max results', required: false },
        ],
        tags: ['READ'],
      },
      {
        name: 'google_calendar.create_event',
        app: 'google_calendar',
        description: 'Create a calendar event',
        parameters: [
          { name: 'summary', type: 'string', description: 'Event title', required: true },
          { name: 'start', type: 'string', description: 'Start time (ISO)', required: true },
          { name: 'end', type: 'string', description: 'End time (ISO)', required: true },
        ],
        tags: ['WRITE'],
      },
      {
        name: 'slack.list_channels',
        app: 'slack',
        description: 'List Slack channels',
        parameters: [
          { name: 'exclude_archived', type: 'boolean', description: 'Exclude archived', required: false },
        ],
        tags: ['READ'],
      },
      {
        name: 'slack.send_message',
        app: 'slack',
        description: 'Send a Slack message',
        parameters: [
          { name: 'channel', type: 'string', description: 'Channel ID', required: true },
          { name: 'text', type: 'string', description: 'Message text', required: true },
        ],
        tags: ['WRITE'],
      },
      {
        name: 'shell.execute_command',
        app: 'shell',
        description: 'Execute a shell command',
        parameters: [
          { name: 'command', type: 'string', description: 'Command to execute', required: true },
          { name: 'cwd', type: 'string', description: 'Working directory', required: false },
          { name: 'timeout', type: 'number', description: 'Timeout in ms', required: false },
        ],
        tags: ['DESTRUCTIVE'],
      },
    ];

    if (apps.length === 0) {
      return allTools;
    }

    return allTools.filter((tool) => apps.includes(tool.app));
  }

  /**
   * Mock execution for testing
   */
  private async mockExecute(call: ToolCall): Promise<unknown> {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    const args = call.arguments;

    switch (call.name) {
      case 'github.get_repo':
        return {
          name: args.repo ?? 'mock-repo',
          full_name: `${args.owner}/${args.repo}`,
          private: false,
          stargazers_count: 42,
        };

      case 'github.get_issue':
        return {
          number: args.issue_number ?? 1,
          title: 'Mock Issue',
          state: 'open',
          body: 'This is a mock issue',
        };

      case 'github.create_issue':
        return {
          number: Math.floor(Math.random() * 1000) + 100,
          title: args.title ?? 'New Issue',
          state: 'open',
          html_url: `https://github.com/${args.owner}/${args.repo}/issues/123`,
        };

      case 'gmail.list_messages':
        return {
          messages: [
            { id: 'msg1', threadId: 'thread1' },
            { id: 'msg2', threadId: 'thread2' },
          ],
          resultSizeEstimate: 2,
        };

      case 'gmail.send_message':
        return {
          id: `sent_${Date.now()}`,
          threadId: `thread_${Date.now()}`,
        };

      case 'google_calendar.list_events':
        return {
          items: [{ id: 'event1', summary: 'Mock Meeting' }],
          nextPageToken: null,
        };

      case 'google_calendar.create_event':
        return {
          id: `event_${Date.now()}`,
          htmlLink: 'https://calendar.google.com/event/...',
        };

      case 'slack.list_channels':
        return {
          channels: [
            { id: 'C123', name: 'general' },
            { id: 'C456', name: 'random' },
          ],
        };

      case 'slack.send_message':
        return {
          ok: true,
          channel: args.channel ?? 'C123',
          ts: Date.now().toString(),
        };

      case 'shell.execute_command':
        return {
          stdout: `mock output for: ${args.command}`,
          stderr: '',
          exitCode: 0,
        };

      default:
        throw new ComposioError('UNKNOWN_TOOL', `Unknown tool: ${call.name}`);
    }
  }

  /**
   * Normalize Composio tools to our Tool interface
   */
  private normalizeTools(tools: unknown[]): Tool[] {
    return tools.map((tool) => {
      const t = tool as Record<string, unknown>;
      return {
        name: t.name as string,
        app: t.appName as string,
        description: t.description as string,
        parameters: (t.parameters as Array<Record<string, unknown>> || []).map((p) => {
          const param: {
            name: string;
            type: 'string' | 'number' | 'boolean' | 'array' | 'object';
            description: string;
            required: boolean;
            enum?: string[];
            pattern?: string;
          } = {
            name: p.name as string,
            type: p.type as 'string' | 'number' | 'boolean' | 'array' | 'object',
            description: p.description as string,
            required: p.required as boolean,
          };
          if (p.enum) param.enum = p.enum as string[];
          if (p.pattern) param.pattern = p.pattern as string;
          return param;
        }),
        tags: (t.tags as string[]) || [],
      };
    });
  }
}

/**
 * Custom error class for Composio-related errors
 */
export class ComposioError extends Error {
  constructor(
    public readonly code:
      | 'NOT_CONFIGURED'
      | 'EXECUTION_FAILED'
      | 'CONNECTION_FAILED'
      | 'CALLBACK_FAILED'
      | 'DISCONNECT_FAILED'
      | 'UNKNOWN_TOOL',
    message: string
  ) {
    super(message);
    this.name = 'ComposioError';
  }
}
