/**
 * AuthManager Tests
 * Sprint 50 - Day 9 - OAuth & Principal Mapping
 *
 * Tests for OAuth flow and principal UUID mapping.
 *
 * @module tests/tools/auth-manager
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 50 Day 9
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuthManager,
  AuthManagerError,
  type OAuthInitResult,
  type OAuthCallbackParams,
} from '../../src/tools/auth-manager.js';
import { ComposioClient } from '../../src/tools/composio-client.js';

describe('AuthManager', () => {
  let composioClient: ComposioClient;
  let authManager: AuthManager;

  beforeEach(() => {
    composioClient = new ComposioClient({ mockMode: true });
    authManager = new AuthManager(composioClient, {
      connectionTimeoutSec: 60,
    });
  });

  afterEach(() => {
    // Cleanup
  });

  // ==========================================================================
  // initOAuth
  // ==========================================================================

  describe('initOAuth', () => {
    it('should return redirect URL and state for supported app', async () => {
      await composioClient.initialize();

      const result = await authManager.initOAuth('user-123', 'github');

      expect(result).toBeDefined();
      expect(result.redirect_url).toContain('mock.composio.dev');
      expect(result.connection_id).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.expires_at).toBeInstanceOf(Date);
    });

    it('should throw UNSUPPORTED_APP for unknown app', async () => {
      await composioClient.initialize();

      await expect(authManager.initOAuth('user-123', 'unknown_app')).rejects.toThrow(
        AuthManagerError
      );

      try {
        await authManager.initOAuth('user-123', 'unknown_app');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthManagerError);
        expect((error as AuthManagerError).code).toBe('UNSUPPORTED_APP');
      }
    });

    it('should throw NO_OAUTH_NEEDED for shell app', async () => {
      await composioClient.initialize();

      await expect(authManager.initOAuth('user-123', 'shell')).rejects.toThrow(AuthManagerError);

      try {
        await authManager.initOAuth('user-123', 'shell');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthManagerError);
        expect((error as AuthManagerError).code).toBe('NO_OAUTH_NEEDED');
      }
    });

    it('should generate unique state tokens', async () => {
      await composioClient.initialize();

      const result1 = await authManager.initOAuth('user-123', 'github');
      const result2 = await authManager.initOAuth('user-123', 'gmail');

      expect(result1.state).not.toBe(result2.state);
    });

    it('should support all Phase 1 apps', async () => {
      await composioClient.initialize();

      const apps = ['github', 'gmail', 'google_calendar', 'slack'];

      for (const app of apps) {
        const result = await authManager.initOAuth('user-123', app);
        expect(result.redirect_url).toBeDefined();
      }
    });

    it('should store pending OAuth state', async () => {
      await composioClient.initialize();

      const result = await authManager.initOAuth('user-123', 'github');
      const pendingState = authManager.getPendingOAuthState(result.state);

      expect(pendingState).toBeDefined();
      expect(pendingState?.principal_id).toBe('user-123');
      expect(pendingState?.app_name).toBe('github');
      expect(pendingState?.connection_id).toBe(result.connection_id);
    });

    it('should set expiration time based on config', async () => {
      await composioClient.initialize();

      const result = await authManager.initOAuth('user-123', 'github');
      const now = Date.now();
      const expiresAt = result.expires_at.getTime();

      // Should expire in approximately 60 seconds (our config)
      expect(expiresAt - now).toBeGreaterThan(55000);
      expect(expiresAt - now).toBeLessThan(65000);
    });
  });

  // ==========================================================================
  // handleCallback
  // ==========================================================================

  describe('handleCallback', () => {
    it('should complete OAuth flow with valid state and code', async () => {
      await composioClient.initialize();

      // First initiate OAuth
      const initResult = await authManager.initOAuth('user-123', 'github');

      // Then handle callback
      const callbackParams: OAuthCallbackParams = {
        state: initResult.state,
        code: 'auth-code-123',
      };
      const result = await authManager.handleCallback(callbackParams);

      expect(result.success).toBe(true);
      expect(result.connection_id).toBe(initResult.connection_id);
      expect(result.principal_id).toBe('user-123');
      expect(result.app_name).toBe('github');
    });

    it('should throw INVALID_STATE for unknown state', async () => {
      await composioClient.initialize();

      const callbackParams: OAuthCallbackParams = {
        state: 'invalid-state-token',
        code: 'auth-code-123',
      };

      await expect(authManager.handleCallback(callbackParams)).rejects.toThrow(AuthManagerError);

      try {
        await authManager.handleCallback(callbackParams);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthManagerError);
        expect((error as AuthManagerError).code).toBe('INVALID_STATE');
      }
    });

    it('should return error response for OAuth error', async () => {
      await composioClient.initialize();

      // First initiate OAuth
      const initResult = await authManager.initOAuth('user-123', 'github');

      // Simulate OAuth error callback
      const callbackParams: OAuthCallbackParams = {
        state: initResult.state,
        error: 'access_denied',
        error_description: 'User denied access',
      };
      const result = await authManager.handleCallback(callbackParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User denied access');
      expect(result.principal_id).toBe('user-123');
    });

    it('should clean up pending state after callback', async () => {
      await composioClient.initialize();

      const initResult = await authManager.initOAuth('user-123', 'github');

      const callbackParams: OAuthCallbackParams = {
        state: initResult.state,
        code: 'auth-code-123',
      };
      await authManager.handleCallback(callbackParams);

      // State should be cleaned up
      const pendingState = authManager.getPendingOAuthState(initResult.state);
      expect(pendingState).toBeNull();
    });

    it('should clean up pending state after error callback', async () => {
      await composioClient.initialize();

      const initResult = await authManager.initOAuth('user-123', 'github');

      const callbackParams: OAuthCallbackParams = {
        state: initResult.state,
        error: 'access_denied',
      };
      await authManager.handleCallback(callbackParams);

      // State should be cleaned up
      const pendingState = authManager.getPendingOAuthState(initResult.state);
      expect(pendingState).toBeNull();
    });
  });

  // ==========================================================================
  // Principal Mapping
  // ==========================================================================

  describe('Principal Mapping', () => {
    it('should create principal mapping on first access', async () => {
      await composioClient.initialize();

      const mapping = await authManager.getPrincipalMapping('user-456');

      expect(mapping).toBeDefined();
      expect(mapping.principal_id).toBe('user-456');
      expect(mapping.composio_entity_id).toBeDefined();
      expect(mapping.created_at).toBeInstanceOf(Date);
    });

    it('should return cached mapping on subsequent access', async () => {
      await composioClient.initialize();

      const mapping1 = await authManager.getPrincipalMapping('user-789');
      const mapping2 = await authManager.getPrincipalMapping('user-789');

      expect(mapping1.composio_entity_id).toBe(mapping2.composio_entity_id);
      expect(mapping1.created_at.getTime()).toBe(mapping2.created_at.getTime());
    });

    it('should update principal mapping', async () => {
      await composioClient.initialize();

      const mapping1 = await authManager.getPrincipalMapping('user-abc');
      const mapping2 = await authManager.updatePrincipalMapping('user-abc');

      expect(mapping2.principal_id).toBe(mapping1.principal_id);
      expect(mapping2.updated_at.getTime()).toBeGreaterThanOrEqual(mapping1.updated_at.getTime());
    });

    it('should get entity ID for principal', async () => {
      await composioClient.initialize();

      const entityId = await authManager.getEntityId('user-xyz');

      expect(entityId).toBeDefined();
      expect(typeof entityId).toBe('string');
    });

    it('should check if principal has mapping', async () => {
      await composioClient.initialize();

      expect(authManager.hasPrincipalMapping('unknown-user')).toBe(false);

      await authManager.getPrincipalMapping('new-user');

      expect(authManager.hasPrincipalMapping('new-user')).toBe(true);
    });
  });

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  describe('Connection Management', () => {
    it('should return empty connections initially', async () => {
      await composioClient.initialize();

      const connections = await authManager.getConnections('user-123');

      expect(connections).toEqual([]);
    });

    it('should check connection existence', async () => {
      await composioClient.initialize();

      const hasConnection = await authManager.hasConnection('user-123', 'github');

      expect(hasConnection).toBe(false);
    });

    it('should return null for non-existent active connection', async () => {
      await composioClient.initialize();

      const connection = await authManager.getActiveConnection('user-123', 'github');

      expect(connection).toBeNull();
    });
  });

  // ==========================================================================
  // Supported Apps
  // ==========================================================================

  describe('Supported Apps', () => {
    it('should return Phase 1 supported apps', () => {
      const apps = authManager.getSupportedApps();

      expect(apps).toContain('github');
      expect(apps).toContain('gmail');
      expect(apps).toContain('google_calendar');
      expect(apps).toContain('slack');
      expect(apps).toContain('shell');
    });

    it('should correctly identify supported apps', () => {
      expect(authManager.isAppSupported('github')).toBe(true);
      expect(authManager.isAppSupported('gmail')).toBe(true);
      expect(authManager.isAppSupported('unknown_app')).toBe(false);
    });

    it('should return required scopes for apps', () => {
      const githubScopes = authManager.getRequiredScopes('github');
      const gmailScopes = authManager.getRequiredScopes('gmail');
      const shellScopes = authManager.getRequiredScopes('shell');

      expect(githubScopes).toContain('repo');
      expect(gmailScopes.length).toBeGreaterThan(0);
      expect(shellScopes).toEqual([]);
    });
  });

  // ==========================================================================
  // Connection Stats
  // ==========================================================================

  describe('Connection Stats', () => {
    it('should return empty stats initially', async () => {
      await composioClient.initialize();

      const stats = await authManager.getStats('user-123');

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.revoked).toBe(0);
      expect(stats.byApp).toEqual({});
    });
  });
});
