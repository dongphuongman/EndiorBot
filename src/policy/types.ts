/**
 * Channel Policy Types — per-channel rate limiting and configuration.
 *
 * @module policy/types
 * @version 1.0.0
 * @authority Sprint 94 Plan (D2)
 * @sprint 94
 */

import type { ChannelSource } from "../protocol/types.js";

// ============================================================================
// Policy Scope
// ============================================================================

/**
 * Policy scope — what layer this policy applies to.
 */
export type PolicyScope = "channel" | "command" | "message";

// ============================================================================
// Channel Policy
// ============================================================================

/**
 * Per-channel policy configuration.
 *
 * Defines rate limits and constraints per channel source.
 * The ChannelPolicyEngine uses these to coordinate across
 * the 4 existing rate-limiting systems without replacing them.
 */
export interface ChannelPolicy {
  /** Channel identifier */
  channel: ChannelSource;
  /** Messages per minute per sender */
  messagesPerMinute: number;
  /** Commands per minute per sender */
  commandsPerMinute: number;
  /** Max message length (chars) */
  maxMessageLength: number;
  /** Whether input sanitization is required */
  requireSanitization: boolean;
}

// ============================================================================
// Policy Check Result
// ============================================================================

/**
 * Result of a policy check.
 */
export interface PolicyCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Denial reason if not allowed */
  reason?: string;
  /** Which scope triggered the check */
  scope: PolicyScope;
  /** Remaining quota (for rate limits) */
  remaining?: number;
}

// ============================================================================
// Channel Stats
// ============================================================================

/**
 * Per-channel statistics for monitoring.
 */
export interface ChannelStats {
  /** Channel identifier */
  channel: ChannelSource;
  /** Total messages processed */
  totalMessages: number;
  /** Total messages denied */
  totalDenied: number;
  /** Current rate (messages in last minute) */
  currentRate: number;
  /** Policy applied */
  policy: ChannelPolicy;
}
