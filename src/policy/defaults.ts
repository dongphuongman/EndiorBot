/**
 * Default Channel Policies — per-channel rate limits and constraints.
 *
 * @module policy/defaults
 * @version 1.0.0
 * @authority Sprint 94 Plan (D2)
 * @sprint 94
 */

import type { ChannelSource } from "../protocol/types.js";
import type { ChannelPolicy } from "./types.js";

// ============================================================================
// Default Policies
// ============================================================================

/**
 * Default per-channel policies.
 *
 * These coordinate with (not replace) existing rate limiters:
 * - BridgePolicyManager: 20 cmds/min (bridge-policy.ts)
 * - OTTMessageRouter: 30 msgs/min (message-router.ts)
 * - WebhookHandler: 100/min per IP (webhook-handler.ts)
 * - PolicyEngine: 10/tool/min (policy-engine.ts)
 */
export const DEFAULT_CHANNEL_POLICIES: Record<ChannelSource, ChannelPolicy> = {
  telegram: {
    channel: "telegram",
    messagesPerMinute: 30,
    commandsPerMinute: 20,
    maxMessageLength: 4096,
    requireSanitization: true,
  },
  zalo: {
    channel: "zalo",
    messagesPerMinute: 20,
    commandsPerMinute: 15,
    maxMessageLength: 2000,
    requireSanitization: true,
  },
  web: {
    channel: "web",
    messagesPerMinute: 60,
    commandsPerMinute: 30,
    maxMessageLength: 10000,
    requireSanitization: true,
  },
  webhook: {
    channel: "webhook",
    messagesPerMinute: 100,
    commandsPerMinute: 50,
    maxMessageLength: 1048576,
    requireSanitization: true,
  },
  cli: {
    channel: "cli",
    messagesPerMinute: 120,
    commandsPerMinute: 60,
    maxMessageLength: 50000,
    requireSanitization: false,
  },
  desktop: {
    channel: "desktop",
    messagesPerMinute: 120,
    commandsPerMinute: 60,
    maxMessageLength: 50000,
    requireSanitization: false,
  },
};
