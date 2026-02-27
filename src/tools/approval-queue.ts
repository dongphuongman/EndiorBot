/**
 * ApprovalQueue - Approval token management with expiry
 * P0 requirement: 5min expiry, one-time use
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 */

import crypto from 'crypto';
import type { ApprovalToken, ToolCall } from './types.js';

export interface ApprovalQueueConfig {
  tokenExpiryMs?: number;
  cleanupIntervalMs?: number;
}

export class ApprovalQueue {
  private tokens: Map<string, ApprovalToken> = new Map();
  private pendingCalls: Map<string, ToolCall> = new Map();
  private readonly tokenExpiryMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  static readonly DEFAULT_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  static readonly DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

  constructor(config: ApprovalQueueConfig = {}) {
    this.tokenExpiryMs = config.tokenExpiryMs ?? ApprovalQueue.DEFAULT_TOKEN_EXPIRY_MS;

    // Auto-cleanup expired tokens
    const cleanupInterval = config.cleanupIntervalMs ?? ApprovalQueue.DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(() => {});
    }, cleanupInterval);
  }

  /**
   * Enqueue a tool call for approval
   * Returns an approval token that must be used within expiry time
   */
  async enqueue(
    tool_name: string,
    args: unknown,
    principal_id: string,
    connection_id: string
  ): Promise<ApprovalToken> {
    const token: ApprovalToken = {
      token: crypto.randomUUID(),
      tool_name,
      args_hash: this.hashArgs(args),
      principal_id,
      connection_id,
      expires_at: new Date(Date.now() + this.tokenExpiryMs),
      used: false,
      idempotency_key: crypto.randomUUID(),
      created_at: new Date(),
    };

    this.tokens.set(token.token, token);

    // Store the original call for later execution
    this.pendingCalls.set(token.token, {
      id: token.idempotency_key,
      name: tool_name,
      arguments: args as Record<string, unknown>,
      principal_id,
      connection_id,
    });

    return token;
  }

  /**
   * Validate and consume an approval token
   * Returns the token if valid, throws if expired/used/invalid
   */
  async validate(tokenId: string): Promise<ApprovalToken> {
    const token = this.tokens.get(tokenId);

    if (!token) {
      throw new ApprovalError('INVALID_TOKEN', 'Approval token not found');
    }

    if (token.used) {
      throw new ApprovalError('TOKEN_USED', 'Approval token already used');
    }

    if (token.expires_at < new Date()) {
      this.tokens.delete(tokenId);
      this.pendingCalls.delete(tokenId);
      throw new ApprovalError('TOKEN_EXPIRED', 'Approval token expired');
    }

    // Mark as used (one-time use) - atomic operation
    token.used = true;
    return token;
  }

  /**
   * Get the pending tool call for an approval token
   */
  async getPendingCall(tokenId: string): Promise<ToolCall | null> {
    return this.pendingCalls.get(tokenId) ?? null;
  }

  /**
   * Get token details without consuming it
   */
  async getTokenDetails(tokenId: string): Promise<ApprovalToken | null> {
    return this.tokens.get(tokenId) ?? null;
  }

  /**
   * Get all pending approvals for a principal
   */
  async getPendingForPrincipal(principal_id: string): Promise<ApprovalToken[]> {
    const pending: ApprovalToken[] = [];
    const now = new Date();

    for (const token of this.tokens.values()) {
      if (
        token.principal_id === principal_id &&
        !token.used &&
        token.expires_at > now
      ) {
        pending.push(token);
      }
    }

    return pending;
  }

  /**
   * Cancel a pending approval (before it's used)
   */
  async cancel(tokenId: string): Promise<boolean> {
    const token = this.tokens.get(tokenId);
    if (!token || token.used) {
      return false;
    }

    this.tokens.delete(tokenId);
    this.pendingCalls.delete(tokenId);
    return true;
  }

  /**
   * Cleanup expired and used tokens
   * Returns number of tokens removed
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let removed = 0;

    for (const [tokenId, token] of this.tokens) {
      if (token.expires_at < now || token.used) {
        this.tokens.delete(tokenId);
        this.pendingCalls.delete(tokenId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get queue stats for monitoring
   */
  getStats(): { pending: number; expired: number; used: number } {
    const now = new Date();
    let pending = 0;
    let expired = 0;
    let used = 0;

    for (const token of this.tokens.values()) {
      if (token.used) {
        used++;
      } else if (token.expires_at < now) {
        expired++;
      } else {
        pending++;
      }
    }

    return { pending, expired, used };
  }

  /**
   * Stop the cleanup timer (for graceful shutdown)
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private hashArgs(args: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
  }
}

/**
 * Custom error class for approval-related errors
 */
export class ApprovalError extends Error {
  constructor(
    public readonly code: 'INVALID_TOKEN' | 'TOKEN_USED' | 'TOKEN_EXPIRED',
    message: string
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}
