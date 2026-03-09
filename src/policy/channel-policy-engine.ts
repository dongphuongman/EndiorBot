/**
 * Channel Policy Engine — unified per-channel rate limiting.
 *
 * Wraps and coordinates 4 existing rate-limiting systems:
 * - BridgePolicyManager (20 cmds/min per actor)
 * - OTTMessageRouter (30 msgs/min per sender)
 * - PolicyEngine (10/tool/min, 30 total/min)
 * - WebhookHandler (100/min per IP)
 *
 * Does NOT replace existing systems — adds a unified coordination layer.
 *
 * @module policy/channel-policy-engine
 * @version 1.0.0
 * @authority Sprint 94 Plan (D2)
 * @sprint 94
 */

import type { ChannelSource } from "../protocol/types.js";
import type {
  ChannelPolicy,
  PolicyCheckResult,
  PolicyScope,
  ChannelStats,
} from "./types.js";
import { DEFAULT_CHANNEL_POLICIES } from "./defaults.js";

// ============================================================================
// Rate Tracking
// ============================================================================

/** Sliding window: array of timestamps within the last 60s */
interface RateBucket {
  timestamps: number[];
}

/** Per-sender, per-channel tracking */
type SenderKey = string; // format: `${channel}:${senderId}`

// ============================================================================
// ChannelPolicyEngine
// ============================================================================

/**
 * Unified channel policy engine.
 *
 * Provides per-channel rate limiting using sliding-window counters.
 * Configurable defaults per channel type with runtime override support.
 */
export class ChannelPolicyEngine {
  private readonly policies: Map<ChannelSource, ChannelPolicy>;
  private readonly messageBuckets = new Map<SenderKey, RateBucket>();
  private readonly commandBuckets = new Map<SenderKey, RateBucket>();
  private readonly stats = new Map<ChannelSource, { total: number; denied: number }>();

  constructor(customPolicies?: Partial<Record<ChannelSource, Partial<ChannelPolicy>>>) {
    // Start with defaults, apply custom overrides
    this.policies = new Map();
    for (const [channel, policy] of Object.entries(DEFAULT_CHANNEL_POLICIES)) {
      const ch = channel as ChannelSource;
      const custom = customPolicies?.[ch];
      if (custom) {
        this.policies.set(ch, { ...policy, ...custom, channel: ch });
      } else {
        this.policies.set(ch, { ...policy });
      }
      this.stats.set(ch, { total: 0, denied: 0 });
    }
  }

  /**
   * Check if a message/command is allowed by the channel policy.
   *
   * @param channel - Source channel
   * @param senderId - Sender identifier
   * @param scope - What type of action ("message" or "command")
   */
  check(channel: ChannelSource, senderId: string, scope: PolicyScope): PolicyCheckResult {
    const policy = this.policies.get(channel);
    if (!policy) {
      return { allowed: true, scope };
    }

    const key: SenderKey = `${channel}:${senderId}`;
    const now = Date.now();

    // Select appropriate bucket and limit
    const buckets = scope === "command" ? this.commandBuckets : this.messageBuckets;
    const limit = scope === "command" ? policy.commandsPerMinute : policy.messagesPerMinute;

    // Get or create bucket
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }

    // Sliding window: prune timestamps older than 60s
    const windowStart = now - 60_000;
    bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

    // Track stats
    const channelStats = this.stats.get(channel);
    if (channelStats) {
      channelStats.total++;
    }

    // Check rate limit
    if (bucket.timestamps.length >= limit) {
      if (channelStats) {
        channelStats.denied++;
      }
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limit} ${scope}s per minute for ${channel}`,
        scope,
        remaining: 0,
      };
    }

    // Record this request
    bucket.timestamps.push(now);

    return {
      allowed: true,
      scope,
      remaining: limit - bucket.timestamps.length,
    };
  }

  /**
   * Check message content against channel policy limits.
   */
  checkContentLength(channel: ChannelSource, contentLength: number): PolicyCheckResult {
    const policy = this.policies.get(channel);
    if (!policy) {
      return { allowed: true, scope: "message" };
    }

    if (contentLength > policy.maxMessageLength) {
      return {
        allowed: false,
        reason: `Message exceeds ${policy.maxMessageLength} char limit for ${channel} (${contentLength} chars)`,
        scope: "message",
      };
    }

    return { allowed: true, scope: "message" };
  }

  /**
   * Get policy for a specific channel.
   */
  getPolicy(channel: ChannelSource): ChannelPolicy | undefined {
    return this.policies.get(channel);
  }

  /**
   * Whether sanitization is required for this channel.
   */
  requiresSanitization(channel: ChannelSource): boolean {
    return this.policies.get(channel)?.requireSanitization ?? true;
  }

  /**
   * Override policy for a channel (runtime adjustment).
   */
  overridePolicy(channel: ChannelSource, overrides: Partial<ChannelPolicy>): void {
    const current = this.policies.get(channel);
    if (current) {
      this.policies.set(channel, { ...current, ...overrides, channel });
    }
  }

  /**
   * Reset rate limit tracking for a specific sender on a channel.
   */
  resetLimits(channel: ChannelSource, senderId: string): void {
    const key: SenderKey = `${channel}:${senderId}`;
    this.messageBuckets.delete(key);
    this.commandBuckets.delete(key);
  }

  /**
   * Get per-channel statistics.
   */
  getStats(): ChannelStats[] {
    const result: ChannelStats[] = [];

    for (const [channel, policy] of this.policies) {
      const stats = this.stats.get(channel);
      // Count current rate across all senders for this channel
      let currentRate = 0;
      const windowStart = Date.now() - 60_000;

      for (const [key, bucket] of this.messageBuckets) {
        if (key.startsWith(`${channel}:`)) {
          currentRate += bucket.timestamps.filter((t) => t > windowStart).length;
        }
      }

      result.push({
        channel,
        totalMessages: stats?.total ?? 0,
        totalDenied: stats?.denied ?? 0,
        currentRate,
        policy,
      });
    }

    return result;
  }
}
