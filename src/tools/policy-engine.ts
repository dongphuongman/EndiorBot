/**
 * PolicyEngine - Risk classification and policy enforcement
 * P0 requirement from Expert 8
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 */

import type { ToolRisk, PolicyDecision } from './types.js';
import { ApprovalQueue } from './approval-queue.js';

/**
 * Phase 1: 10 curated tools only
 * Tools are classified by their risk level
 */
const TOOL_RISK_MATRIX: Map<string, ToolRisk> = new Map([
  // READ tools (auto-approved)
  ['github.get_repo', 'READ'],
  ['github.get_issue', 'READ'],
  ['gmail.list_messages', 'READ'],
  ['google_calendar.list_events', 'READ'],
  ['slack.list_channels', 'READ'],

  // WRITE tools (require approval)
  ['github.create_issue', 'WRITE'],
  ['gmail.send_message', 'WRITE'],
  ['google_calendar.create_event', 'WRITE'],
  ['slack.send_message', 'WRITE'],

  // DESTRUCTIVE tools (require approval + warning)
  ['shell.execute_command', 'DESTRUCTIVE'],
]);

/**
 * Rate limiting state per window
 */
interface RateLimitState {
  /** Tool calls per principal per tool: Map<"principal:tool", count> */
  toolCounts: Map<string, number>;
  /** Total calls per principal: Map<principal, count> */
  principalCounts: Map<string, number>;
  /** Destructive calls per principal (hourly): Map<principal, count> */
  destructiveCounts: Map<string, number>;
  /** Last reset time for minute counters */
  lastMinuteReset: Date;
  /** Last reset time for hour counters */
  lastHourReset: Date;
}

export interface PolicyEngineConfig {
  /** Calls per tool per minute per principal */
  perToolPerMinute?: number;
  /** Total calls per minute per principal */
  perPrincipalPerMinute?: number;
  /** Destructive operations per hour per principal */
  destructivePerHour?: number;
  /** Auto-approve READ tools */
  autoApproveRead?: boolean;
}

export class PolicyEngine {
  private approvalQueue: ApprovalQueue;
  private rateLimitState: RateLimitState;
  private readonly config: Required<PolicyEngineConfig>;

  // Default rate limits from TOOL-POLICY.md
  static readonly DEFAULT_PER_TOOL_PER_MINUTE = 10;
  static readonly DEFAULT_PER_PRINCIPAL_PER_MINUTE = 30;
  static readonly DEFAULT_DESTRUCTIVE_PER_HOUR = 5;

  constructor(approvalQueue: ApprovalQueue, config: PolicyEngineConfig = {}) {
    this.approvalQueue = approvalQueue;
    this.config = {
      perToolPerMinute: config.perToolPerMinute ?? PolicyEngine.DEFAULT_PER_TOOL_PER_MINUTE,
      perPrincipalPerMinute: config.perPrincipalPerMinute ?? PolicyEngine.DEFAULT_PER_PRINCIPAL_PER_MINUTE,
      destructivePerHour: config.destructivePerHour ?? PolicyEngine.DEFAULT_DESTRUCTIVE_PER_HOUR,
      autoApproveRead: config.autoApproveRead ?? true,
    };
    this.rateLimitState = {
      toolCounts: new Map(),
      principalCounts: new Map(),
      destructiveCounts: new Map(),
      lastMinuteReset: new Date(),
      lastHourReset: new Date(),
    };
  }

  /**
   * Evaluate a tool call against policies
   * Returns a decision: allow, deny, or require_approval
   */
  async evaluate(
    toolName: string,
    args: unknown,
    principal_id: string,
    connection_id?: string
  ): Promise<PolicyDecision> {
    // 1. Check whitelist
    if (!TOOL_RISK_MATRIX.has(toolName)) {
      return {
        action: 'deny',
        risk: 'ADMIN',
        reason: `Tool '${toolName}' not in Phase 1 whitelist`,
      };
    }

    // 2. Validate principal_id format (UUID)
    if (!this.isValidUUID(principal_id)) {
      return {
        action: 'deny',
        risk: 'ADMIN',
        reason: 'Invalid principal_id format (must be UUID)',
      };
    }

    // 3. Check rate limits BEFORE recording usage
    const rateLimitCheck = this.checkRateLimits(toolName, principal_id);
    if (!rateLimitCheck.allowed) {
      return {
        action: 'deny',
        risk: TOOL_RISK_MATRIX.get(toolName)!,
        reason: rateLimitCheck.reason,
      };
    }

    // 4. Get risk classification
    const risk = TOOL_RISK_MATRIX.get(toolName)!;

    // 5. Record rate limit usage (after validation passes)
    this.recordUsage(toolName, principal_id, risk);

    // 6. Apply policy based on risk
    if (risk === 'READ' && this.config.autoApproveRead) {
      return {
        action: 'allow',
        risk,
        reason: 'READ tools auto-approved',
      };
    }

    // WRITE/DESTRUCTIVE/MONEY/ADMIN require approval
    const token = await this.approvalQueue.enqueue(
      toolName,
      args,
      principal_id,
      connection_id ?? ''
    );

    return {
      action: 'require_approval',
      risk,
      reason: `${risk} tool requires CEO approval`,
      approval_token: token.token,
      expires_at: token.expires_at,
    };
  }

  /**
   * Get the risk level for a tool
   */
  getToolRisk(toolName: string): ToolRisk | null {
    return TOOL_RISK_MATRIX.get(toolName) ?? null;
  }

  /**
   * Check if a tool is in the Phase 1 whitelist
   */
  isToolAllowed(toolName: string): boolean {
    return TOOL_RISK_MATRIX.has(toolName);
  }

  /**
   * Get all whitelisted tools
   */
  getWhitelistedTools(): string[] {
    return Array.from(TOOL_RISK_MATRIX.keys());
  }

  /**
   * Get rate limit stats for monitoring
   */
  getRateLimitStats(principal_id: string): {
    toolCounts: Record<string, number>;
    totalCalls: number;
    destructiveCalls: number;
    limits: {
      perToolPerMinute: number;
      perPrincipalPerMinute: number;
      destructivePerHour: number;
    };
  } {
    this.maybeResetRateLimits();

    const toolCounts: Record<string, number> = {};
    for (const [key, count] of this.rateLimitState.toolCounts) {
      if (key.startsWith(`${principal_id}:`)) {
        const toolName = key.split(':')[1] ?? 'unknown';
        toolCounts[toolName] = count;
      }
    }

    return {
      toolCounts,
      totalCalls: this.rateLimitState.principalCounts.get(principal_id) ?? 0,
      destructiveCalls: this.rateLimitState.destructiveCounts.get(principal_id) ?? 0,
      limits: {
        perToolPerMinute: this.config.perToolPerMinute,
        perPrincipalPerMinute: this.config.perPrincipalPerMinute,
        destructivePerHour: this.config.destructivePerHour,
      },
    };
  }

  /**
   * Reset rate limits (for testing or admin override)
   */
  resetRateLimits(principal_id?: string): void {
    if (principal_id) {
      // Reset for specific principal
      for (const key of this.rateLimitState.toolCounts.keys()) {
        if (key.startsWith(`${principal_id}:`)) {
          this.rateLimitState.toolCounts.delete(key);
        }
      }
      this.rateLimitState.principalCounts.delete(principal_id);
      this.rateLimitState.destructiveCounts.delete(principal_id);
    } else {
      // Reset all
      this.rateLimitState.toolCounts.clear();
      this.rateLimitState.principalCounts.clear();
      this.rateLimitState.destructiveCounts.clear();
      this.rateLimitState.lastMinuteReset = new Date();
      this.rateLimitState.lastHourReset = new Date();
    }
  }

  private isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private checkRateLimits(
    toolName: string,
    principal_id: string
  ): { allowed: boolean; reason: string } {
    this.maybeResetRateLimits();

    const toolKey = `${principal_id}:${toolName}`;
    const toolCount = this.rateLimitState.toolCounts.get(toolKey) ?? 0;
    const principalCount = this.rateLimitState.principalCounts.get(principal_id) ?? 0;
    const risk = TOOL_RISK_MATRIX.get(toolName);
    const destructiveCount = this.rateLimitState.destructiveCounts.get(principal_id) ?? 0;

    // Check per-tool limit
    if (toolCount >= this.config.perToolPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${toolName} (${this.config.perToolPerMinute}/min)`,
      };
    }

    // Check per-principal limit
    if (principalCount >= this.config.perPrincipalPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: total calls (${this.config.perPrincipalPerMinute}/min)`,
      };
    }

    // Check destructive limit
    if (risk === 'DESTRUCTIVE' && destructiveCount >= this.config.destructivePerHour) {
      return {
        allowed: false,
        reason: `Destructive operation limit exceeded (${this.config.destructivePerHour}/hour)`,
      };
    }

    return { allowed: true, reason: '' };
  }

  private recordUsage(toolName: string, principal_id: string, risk: ToolRisk): void {
    const toolKey = `${principal_id}:${toolName}`;

    // Increment tool count
    this.rateLimitState.toolCounts.set(
      toolKey,
      (this.rateLimitState.toolCounts.get(toolKey) ?? 0) + 1
    );

    // Increment principal count
    this.rateLimitState.principalCounts.set(
      principal_id,
      (this.rateLimitState.principalCounts.get(principal_id) ?? 0) + 1
    );

    // Increment destructive count if applicable
    if (risk === 'DESTRUCTIVE') {
      this.rateLimitState.destructiveCounts.set(
        principal_id,
        (this.rateLimitState.destructiveCounts.get(principal_id) ?? 0) + 1
      );
    }
  }

  private maybeResetRateLimits(): void {
    const now = new Date();
    const minuteElapsed = now.getTime() - this.rateLimitState.lastMinuteReset.getTime();
    const hourElapsed = now.getTime() - this.rateLimitState.lastHourReset.getTime();

    // Reset tool and principal counts every minute
    if (minuteElapsed >= 60 * 1000) {
      this.rateLimitState.toolCounts.clear();
      this.rateLimitState.principalCounts.clear();
      this.rateLimitState.lastMinuteReset = now;
    }

    // Reset destructive counts every hour
    if (hourElapsed >= 60 * 60 * 1000) {
      this.rateLimitState.destructiveCounts.clear();
      this.rateLimitState.lastHourReset = now;
    }
  }
}
