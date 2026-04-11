/**
 * AuthManager - OAuth connection management for Composio
 * Sprint 50 - Day 5-6 + Day 9 - Real Composio API Integration
 *
 * Handles:
 * - Principal UUID mapping to Composio entities
 * - OAuth connection initiation
 * - OAuth callback handling
 * - Connection status tracking
 */

import crypto from 'crypto';
import type { ComposioConnection } from './types.js';
import { ComposioClient } from './composio-client.js';

/**
 * Connection request for OAuth initiation
 */
export interface ConnectionRequest {
  principal_id: string;
  app_name: string;
  scopes?: string[] | undefined;
}

/**
 * Connection result after OAuth completion
 */
export interface ConnectionResult {
  connection_id: string;
  redirect_url: string;
  device_code?: string;
  user_code?: string;
  verification_url?: string;
  expires_in?: number;
}

/**
 * OAuth initiation result
 */
export interface OAuthInitResult {
  connection_id: string;
  redirect_url: string;
  state: string;
  expires_at: Date;
}

/**
 * OAuth callback parameters
 */
export interface OAuthCallbackParams {
  state: string;
  code?: string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
  success: boolean;
  connection_id: string;
  principal_id: string;
  app_name: string;
  error?: string;
}

/**
 * Principal mapping entry
 */
export interface PrincipalMapping {
  principal_id: string;
  composio_entity_id: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Pending OAuth state
 */
interface PendingOAuthState {
  connection_id: string;
  principal_id: string;
  app_name: string;
  expires_at: Date;
}

/**
 * Configuration for AuthManager
 */
export interface AuthManagerConfig {
  /** Callback URL for OAuth redirect */
  callbackUrl?: string;
  /** Connection timeout in seconds */
  connectionTimeoutSec?: number;
}

/**
 * AuthManager handles OAuth connections for external tools
 */
export class AuthManager {
  private composioClient: ComposioClient;
  private readonly config: Required<AuthManagerConfig>;
  private pendingConnections: Map<string, ConnectionRequest> = new Map();
  private pendingOAuthStates: Map<string, PendingOAuthState> = new Map();
  private principalMappings: Map<string, PrincipalMapping> = new Map();

  static readonly DEFAULT_CALLBACK_URL =
    process.env["ENDIORBOT_OAUTH_CALLBACK_URL"] ?? 'http://localhost:18790/oauth/callback';
  static readonly DEFAULT_TIMEOUT_SEC = 300; // 5 minutes

  constructor(composioClient: ComposioClient, config: AuthManagerConfig = {}) {
    this.composioClient = composioClient;
    this.config = {
      callbackUrl: config.callbackUrl ?? AuthManager.DEFAULT_CALLBACK_URL,
      connectionTimeoutSec: config.connectionTimeoutSec ?? AuthManager.DEFAULT_TIMEOUT_SEC,
    };
  }

  // ==========================================================================
  // OAuth Flow (Day 9)
  // ==========================================================================

  /**
   * Initiate OAuth flow for an app
   * Returns redirect URL and state token
   */
  async initOAuth(
    principal_id: string,
    app_name: string,
    scopes?: string[]
  ): Promise<OAuthInitResult> {
    // Validate app is supported
    if (!this.isAppSupported(app_name)) {
      throw new AuthManagerError('UNSUPPORTED_APP', `App '${app_name}' is not supported`);
    }

    // Shell doesn't need OAuth
    if (app_name === 'shell') {
      throw new AuthManagerError('NO_OAUTH_NEEDED', 'Shell app does not require OAuth');
    }

    // Generate state token for CSRF protection
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.config.connectionTimeoutSec * 1000);

    // Initiate connection with Composio
    const result = await this.composioClient.initiateConnection(principal_id, app_name);

    // Store pending OAuth state
    this.pendingOAuthStates.set(state, {
      connection_id: result.connection_id,
      principal_id,
      app_name,
      expires_at: expiresAt,
    });

    // Store pending connection
    this.pendingConnections.set(result.connection_id, {
      principal_id,
      app_name,
      scopes,
    });

    // Set timeout to cleanup
    setTimeout(() => {
      this.pendingOAuthStates.delete(state);
      this.pendingConnections.delete(result.connection_id);
    }, this.config.connectionTimeoutSec * 1000);

    // Append state to redirect URL
    const redirectUrl = this.appendStateToUrl(result.redirect_url, state);

    return {
      connection_id: result.connection_id,
      redirect_url: redirectUrl,
      state,
      expires_at: expiresAt,
    };
  }

  /**
   * Handle OAuth callback after user authorizes
   */
  async handleCallback(params: OAuthCallbackParams): Promise<OAuthCallbackResult> {
    const { state, code, error, error_description } = params;

    // Validate state token
    const pendingState = this.pendingOAuthStates.get(state);
    if (!pendingState) {
      throw new AuthManagerError('INVALID_STATE', 'Invalid or expired OAuth state');
    }

    // Check if expired
    if (pendingState.expires_at < new Date()) {
      this.pendingOAuthStates.delete(state);
      throw new AuthManagerError('STATE_EXPIRED', 'OAuth state has expired');
    }

    // Check for OAuth error
    if (error) {
      this.pendingOAuthStates.delete(state);
      this.pendingConnections.delete(pendingState.connection_id);
      return {
        success: false,
        connection_id: pendingState.connection_id,
        principal_id: pendingState.principal_id,
        app_name: pendingState.app_name,
        error: error_description ?? error,
      };
    }

    // Process the callback with Composio
    try {
      await this.composioClient.handleOAuthCallback(
        pendingState.connection_id,
        code ?? ''
      );

      // Update principal mapping
      await this.updatePrincipalMapping(pendingState.principal_id);

      // Clean up
      this.pendingOAuthStates.delete(state);
      this.completePendingConnection(pendingState.connection_id);

      return {
        success: true,
        connection_id: pendingState.connection_id,
        principal_id: pendingState.principal_id,
        app_name: pendingState.app_name,
      };
    } catch (err) {
      this.pendingOAuthStates.delete(state);
      this.pendingConnections.delete(pendingState.connection_id);
      return {
        success: false,
        connection_id: pendingState.connection_id,
        principal_id: pendingState.principal_id,
        app_name: pendingState.app_name,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Get pending OAuth state details
   */
  getPendingOAuthState(state: string): PendingOAuthState | null {
    return this.pendingOAuthStates.get(state) ?? null;
  }

  // ==========================================================================
  // Principal Mapping (Day 9)
  // ==========================================================================

  /**
   * Get or create principal mapping
   */
  async getPrincipalMapping(principal_id: string): Promise<PrincipalMapping> {
    const existing = this.principalMappings.get(principal_id);
    if (existing) {
      return existing;
    }

    // Create new mapping via Composio
    const entity = await this.composioClient.getOrCreateEntity(principal_id);

    const mapping: PrincipalMapping = {
      principal_id,
      composio_entity_id: entity.id,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.principalMappings.set(principal_id, mapping);
    return mapping;
  }

  /**
   * Update principal mapping (refresh entity ID)
   */
  async updatePrincipalMapping(principal_id: string): Promise<PrincipalMapping> {
    const entity = await this.composioClient.getOrCreateEntity(principal_id);

    const existing = this.principalMappings.get(principal_id);
    const mapping: PrincipalMapping = {
      principal_id,
      composio_entity_id: entity.id,
      created_at: existing?.created_at ?? new Date(),
      updated_at: new Date(),
    };

    this.principalMappings.set(principal_id, mapping);
    return mapping;
  }

  /**
   * Get Composio entity ID for a principal
   */
  async getEntityId(principal_id: string): Promise<string> {
    const mapping = await this.getPrincipalMapping(principal_id);
    return mapping.composio_entity_id;
  }

  /**
   * Check if principal has a mapping
   */
  hasPrincipalMapping(principal_id: string): boolean {
    return this.principalMappings.has(principal_id);
  }

  // ==========================================================================
  // Existing Connection Methods
  // ==========================================================================

  /**
   * Initiate an OAuth connection for an app (legacy method)
   * Returns redirect URL for browser-based OAuth
   */
  async initiateConnection(request: ConnectionRequest): Promise<ConnectionResult> {
    const result = await this.composioClient.initiateConnection(
      request.principal_id,
      request.app_name
    );

    // Store pending connection
    this.pendingConnections.set(result.connection_id, request);

    // Set timeout to cleanup pending connection
    setTimeout(() => {
      this.pendingConnections.delete(result.connection_id);
    }, this.config.connectionTimeoutSec * 1000);

    return result;
  }

  /**
   * Get all connections for a principal
   */
  async getConnections(principal_id: string): Promise<ComposioConnection[]> {
    return this.composioClient.getConnections(principal_id);
  }

  /**
   * Get connections by app name
   */
  async getConnectionsByApp(
    principal_id: string,
    app_name: string
  ): Promise<ComposioConnection[]> {
    const connections = await this.getConnections(principal_id);
    return connections.filter((c) => c.app_name === app_name);
  }

  /**
   * Get active connection for an app
   */
  async getActiveConnection(
    principal_id: string,
    app_name: string
  ): Promise<ComposioConnection | null> {
    const connections = await this.getConnectionsByApp(principal_id, app_name);
    return connections.find((c) => c.connection_status === 'active') ?? null;
  }

  /**
   * Check if a connection exists for an app
   */
  async hasConnection(principal_id: string, app_name: string): Promise<boolean> {
    const connection = await this.getActiveConnection(principal_id, app_name);
    return connection !== null;
  }

  /**
   * Disconnect (revoke) a connection
   */
  async disconnect(principal_id: string, connection_id: string): Promise<void> {
    await this.composioClient.disconnect(principal_id, connection_id);
  }

  /**
   * Disconnect all connections for a principal
   */
  async disconnectAll(principal_id: string): Promise<number> {
    const connections = await this.getConnections(principal_id);
    let disconnected = 0;

    for (const connection of connections) {
      try {
        await this.disconnect(principal_id, connection.connection_id);
        disconnected++;
      } catch {
        // Continue with other connections
      }
    }

    return disconnected;
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(
    principal_id: string,
    connection_id: string
  ): Promise<'pending' | 'active' | 'revoked' | 'not_found'> {
    const connections = await this.getConnections(principal_id);
    const connection = connections.find((c) => c.connection_id === connection_id);

    if (!connection) return 'not_found';
    return connection.connection_status;
  }

  /**
   * Check if a pending connection exists
   */
  hasPendingConnection(connection_id: string): boolean {
    return this.pendingConnections.has(connection_id);
  }

  /**
   * Get pending connection details
   */
  getPendingConnection(connection_id: string): ConnectionRequest | null {
    return this.pendingConnections.get(connection_id) ?? null;
  }

  /**
   * Complete a pending connection (called after OAuth callback)
   */
  completePendingConnection(connection_id: string): void {
    this.pendingConnections.delete(connection_id);
  }

  /**
   * Get supported apps that can be connected
   */
  getSupportedApps(): string[] {
    // Phase 1 apps
    return ['github', 'gmail', 'google_calendar', 'slack', 'shell'];
  }

  /**
   * Check if an app is supported
   */
  isAppSupported(app_name: string): boolean {
    return this.getSupportedApps().includes(app_name);
  }

  /**
   * Get required scopes for an app
   */
  getRequiredScopes(app_name: string): string[] {
    const scopeMap: Record<string, string[]> = {
      github: ['repo', 'read:user'],
      gmail: ['https://www.googleapis.com/auth/gmail.modify'],
      google_calendar: ['https://www.googleapis.com/auth/calendar'],
      slack: ['channels:read', 'chat:write'],
      shell: [], // No OAuth needed
    };

    return scopeMap[app_name] ?? [];
  }

  /**
   * Get connection stats for a principal
   */
  async getStats(principal_id: string): Promise<{
    total: number;
    active: number;
    pending: number;
    revoked: number;
    byApp: Record<string, number>;
  }> {
    const connections = await this.getConnections(principal_id);

    const stats = {
      total: connections.length,
      active: 0,
      pending: 0,
      revoked: 0,
      byApp: {} as Record<string, number>,
    };

    for (const conn of connections) {
      // Count by status
      switch (conn.connection_status) {
        case 'active':
          stats.active++;
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'revoked':
          stats.revoked++;
          break;
      }

      // Count by app
      stats.byApp[conn.app_name] = (stats.byApp[conn.app_name] ?? 0) + 1;
    }

    return stats;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private appendStateToUrl(url: string, state: string): string {
    const urlObj = new URL(url);
    urlObj.searchParams.set('state', state);
    return urlObj.toString();
  }
}

/**
 * Custom error class for AuthManager-related errors
 */
export class AuthManagerError extends Error {
  constructor(
    public readonly code:
      | 'UNSUPPORTED_APP'
      | 'NO_OAUTH_NEEDED'
      | 'INVALID_STATE'
      | 'STATE_EXPIRED'
      | 'CALLBACK_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'AuthManagerError';
  }
}
