/**
 * OTT Approval Flow
 * Sprint 51 - Day 5-6 - Composio Integration Phase 2
 *
 * Send tool approval requests to CEO via Telegram/Zalo
 * and wait for approval response.
 *
 * Features:
 * - Send formatted approval requests
 * - Wait for approval with timeout
 * - Handle approval/rejection responses
 * - Magic link support (future)
 *
 * @module tools/ott-approval
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import type { PolicyDecision, ToolRisk } from './types.js';
import type { TelegramChannel } from '../channels/telegram/telegram-channel.js';
import type { ZaloChannel } from '../channels/zalo/zalo-channel.js';
import { createLogger, type Logger } from '../logging/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * OTT approval service configuration.
 */
export interface OTTApprovalConfig {
  /** Telegram channel instance (optional) */
  telegramChannel?: TelegramChannel;
  /** Zalo channel instance (optional) */
  zaloChannel?: ZaloChannel;
  /** Preferred channel for approvals */
  preferredChannel: 'telegram' | 'zalo';
  /** CEO chat ID for the preferred channel */
  ceoChatId: string;
  /** Timeout for approval (ms, default: 5 minutes) */
  approvalTimeoutMs?: number;
  /** Enable retry on timeout (default: false) */
  retryOnTimeout?: boolean;
  /** Max retries (default: 1) */
  maxRetries?: number;
}

/**
 * Pending approval tracking.
 */
interface PendingApproval {
  token: string;
  decision: PolicyDecision;
  toolName: string;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  expiresAt: Date;
  retryCount: number;
}

/**
 * Approval response from OTT channel.
 */
export interface OTTApprovalResponse {
  token: string;
  approved: boolean;
  approvedBy?: string;
  timestamp: Date;
  channel: 'telegram' | 'zalo';
}

/**
 * Approval request sent to OTT.
 */
export interface OTTApprovalRequest {
  token: string;
  toolName: string;
  risk: ToolRisk;
  reason: string;
  principal_id: string;
  expiresAt: Date;
  sentAt: Date;
  channel: 'telegram' | 'zalo';
}

// =============================================================================
// OTTApprovalService
// =============================================================================

/**
 * OTT Approval Service for CEO tool approval via Telegram/Zalo.
 *
 * Usage:
 * ```typescript
 * const ottService = new OTTApprovalService({
 *   telegramChannel,
 *   preferredChannel: 'telegram',
 *   ceoChatId: '123456789',
 * });
 *
 * const approved = await ottService.requestApproval(decision);
 * ```
 */
export class OTTApprovalService {
  private config: Required<OTTApprovalConfig>;
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private approvalHistory: OTTApprovalResponse[] = [];
  private log: Logger;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: OTTApprovalConfig) {
    this.config = {
      ...config,
      approvalTimeoutMs: config.approvalTimeoutMs ?? 5 * 60 * 1000, // 5 min
      retryOnTimeout: config.retryOnTimeout ?? false,
      maxRetries: config.maxRetries ?? 1,
    };
    this.log = createLogger('ott-approval');

    // Start cleanup interval
    this.startCleanup();
  }

  // ===========================================================================
  // Core Approval Flow
  // ===========================================================================

  /**
   * Request CEO approval via OTT channel.
   * Returns true if approved, false if rejected.
   * Throws on timeout or channel error.
   */
  async requestApproval(
    decision: PolicyDecision,
    toolName: string,
    principal_id: string
  ): Promise<boolean> {
    const token = decision.approval_token;
    if (!token) {
      throw new OTTApprovalError('MISSING_TOKEN', 'Decision has no approval token');
    }

    // Check if channel is available
    const channel = await this.getActiveChannel();
    if (!channel) {
      throw new OTTApprovalError(
        'NO_CHANNEL',
        'No OTT channel configured for approval'
      );
    }

    // Format and send message
    const message = this.formatApprovalMessage(decision, toolName, principal_id);
    const sent = await this.sendApprovalRequest(message, token);

    if (!sent) {
      throw new OTTApprovalError('SEND_FAILED', 'Failed to send approval request');
    }

    this.log.info('Approval request sent', {
      token: token.slice(0, 8),
      toolName,
      channel: this.config.preferredChannel,
    });

    // Wait for approval response
    return this.waitForApproval(token, decision, toolName);
  }

  /**
   * Handle approval response from OTT channel.
   * Called by channel handler when /approve or /reject is received.
   */
  handleApprovalResponse(
    tokenPrefix: string,
    approved: boolean,
    approvedBy?: string
  ): boolean {
    // Find pending approval by token prefix (first 8 chars)
    let foundToken: string | null = null;
    for (const [token, _] of this.pendingApprovals) {
      if (token.startsWith(tokenPrefix) || token.slice(0, 8) === tokenPrefix) {
        foundToken = token;
        break;
      }
    }

    if (!foundToken) {
      this.log.warn('No pending approval for token prefix', { tokenPrefix });
      return false;
    }

    const pending = this.pendingApprovals.get(foundToken);
    if (!pending) {
      return false;
    }

    // Record response
    const response: OTTApprovalResponse = {
      token: foundToken,
      approved,
      approvedBy,
      timestamp: new Date(),
      channel: this.config.preferredChannel,
    };
    this.approvalHistory.push(response);

    // Resolve promise
    pending.resolve(approved);
    this.pendingApprovals.delete(foundToken);

    this.log.info('Approval response received', {
      token: foundToken.slice(0, 8),
      approved,
      approvedBy,
    });

    return true;
  }

  /**
   * Cancel a pending approval request.
   */
  cancelPendingApproval(token: string): boolean {
    const pending = this.pendingApprovals.get(token);
    if (!pending) {
      return false;
    }

    pending.reject(new OTTApprovalError('CANCELLED', 'Approval request cancelled'));
    this.pendingApprovals.delete(token);
    return true;
  }

  // ===========================================================================
  // Message Formatting
  // ===========================================================================

  /**
   * Format approval message for OTT channel.
   */
  private formatApprovalMessage(
    decision: PolicyDecision,
    toolName: string,
    principal_id: string
  ): string {
    const tokenShort = decision.approval_token?.slice(0, 8) || 'unknown';
    const expiresIn = decision.expires_at
      ? Math.round((decision.expires_at.getTime() - Date.now()) / 1000 / 60)
      : 5;

    const riskEmoji = this.getRiskEmoji(decision.risk);

    return `
${riskEmoji} **Tool Approval Required**

**Tool**: \`${toolName}\`
**Risk Level**: ${decision.risk}
**Principal**: ${principal_id.slice(0, 8)}...
**Reason**: ${decision.reason}
**Expires**: ${expiresIn} minutes

Reply with:
\`/approve ${tokenShort}\` - Approve this action
\`/reject ${tokenShort}\` - Reject this action
    `.trim();
  }

  /**
   * Get emoji for risk level.
   */
  private getRiskEmoji(risk: ToolRisk): string {
    switch (risk) {
      case 'READ':
        return '📖';
      case 'WRITE':
        return '✏️';
      case 'DESTRUCTIVE':
        return '⚠️';
      case 'MONEY':
        return '💰';
      case 'ADMIN':
        return '🔐';
      default:
        return '🔔';
    }
  }

  // ===========================================================================
  // Channel Communication
  // ===========================================================================

  /**
   * Get the active OTT channel.
   */
  private async getActiveChannel(): Promise<TelegramChannel | ZaloChannel | null> {
    const { preferredChannel, telegramChannel, zaloChannel } = this.config;

    if (preferredChannel === 'telegram' && telegramChannel) {
      const available = await telegramChannel.isAvailable();
      if (available) return telegramChannel;
    }

    if (preferredChannel === 'zalo' && zaloChannel) {
      const available = await zaloChannel.isAvailable();
      if (available) return zaloChannel;
    }

    // Fallback to other channel
    if (telegramChannel) {
      const available = await telegramChannel.isAvailable();
      if (available) return telegramChannel;
    }

    if (zaloChannel) {
      const available = await zaloChannel.isAvailable();
      if (available) return zaloChannel;
    }

    return null;
  }

  /**
   * Send approval request to OTT channel.
   */
  private async sendApprovalRequest(
    message: string,
    _token: string
  ): Promise<boolean> {
    const channel = await this.getActiveChannel();
    if (!channel) {
      return false;
    }

    try {
      // Use sendAlert for formatted messages
      const alert = {
        type: 'tool_approval' as const,
        priority: 'high' as const,
        title: 'Tool Approval Required',
        message,
        timestamp: new Date(),
      };

      return await channel.sendAlert(alert);
    } catch (error) {
      this.log.error('Failed to send approval request', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Wait for approval response with timeout.
   */
  private async waitForApproval(
    token: string,
    decision: PolicyDecision,
    toolName: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const expiresAt = new Date(Date.now() + this.config.approvalTimeoutMs);

      const pending: PendingApproval = {
        token,
        decision,
        toolName,
        resolve,
        reject,
        createdAt: new Date(),
        expiresAt,
        retryCount: 0,
      };

      this.pendingApprovals.set(token, pending);

      // Set timeout
      setTimeout(() => {
        const stillPending = this.pendingApprovals.get(token);
        if (stillPending) {
          this.pendingApprovals.delete(token);
          reject(new OTTApprovalError('TIMEOUT', 'Approval request timed out'));
        }
      }, this.config.approvalTimeoutMs);
    });
  }

  // ===========================================================================
  // Cleanup & Stats
  // ===========================================================================

  /**
   * Start cleanup interval for expired approvals.
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [token, pending] of this.pendingApprovals) {
        if (pending.expiresAt.getTime() < now) {
          pending.reject(new OTTApprovalError('EXPIRED', 'Approval request expired'));
          this.pendingApprovals.delete(token);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get approval statistics.
   */
  getStats(): {
    pending: number;
    totalRequests: number;
    approved: number;
    rejected: number;
    averageResponseTimeMs: number;
  } {
    const approved = this.approvalHistory.filter((r) => r.approved).length;
    const rejected = this.approvalHistory.filter((r) => !r.approved).length;

    return {
      pending: this.pendingApprovals.size,
      totalRequests: this.approvalHistory.length,
      approved,
      rejected,
      averageResponseTimeMs: 0, // TODO: Calculate from history
    };
  }

  /**
   * Get recent approval history.
   */
  getRecentHistory(limit = 10): OTTApprovalResponse[] {
    return this.approvalHistory.slice(-limit);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Reject all pending approvals
    for (const [token, pending] of this.pendingApprovals) {
      pending.reject(new OTTApprovalError('DISPOSED', 'Service disposed'));
      this.pendingApprovals.delete(token);
    }
  }
}

// =============================================================================
// Error Class
// =============================================================================

/**
 * OTT Approval Error.
 */
export class OTTApprovalError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_TOKEN'
      | 'NO_CHANNEL'
      | 'SEND_FAILED'
      | 'TIMEOUT'
      | 'EXPIRED'
      | 'CANCELLED'
      | 'DISPOSED',
    message: string
  ) {
    super(message);
    this.name = 'OTTApprovalError';
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create OTT approval service.
 */
export function createOTTApprovalService(
  config: OTTApprovalConfig
): OTTApprovalService {
  return new OTTApprovalService(config);
}
