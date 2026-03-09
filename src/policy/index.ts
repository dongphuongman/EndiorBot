/**
 * Policy Module — channel policy engine for EndiorBot.
 *
 * @module policy
 * @version 1.0.0
 * @sprint 94
 */

export { ChannelPolicyEngine } from "./channel-policy-engine.js";
export { DEFAULT_CHANNEL_POLICIES } from "./defaults.js";
export type {
  ChannelPolicy,
  PolicyScope,
  PolicyCheckResult,
  ChannelStats,
} from "./types.js";
