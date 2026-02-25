/**
 * Zalo Channel Module
 *
 * Exports for Zalo OA integration.
 *
 * @module channels/zalo
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 4-5
 */

// Config
export type {
  ZaloChannelConfig,
  ZaloChannelConfigPartial,
} from "./zalo-config.js";

export {
  loadZaloConfig,
  isZaloConfigured,
  isValidOaId,
  isValidUserId,
  ZALO_API_BASE,
  ENV_ZALO_ACCESS_TOKEN,
  ENV_ZALO_REFRESH_TOKEN,
  ENV_ZALO_USER_ID,
  ENV_ZALO_OA_ID,
  ENV_ZALO_WEBHOOK_SECRET,
  DEFAULT_CONFIG_PATH,
  DEFAULT_ZALO_CONFIG,
} from "./zalo-config.js";

// Channel
export {
  ZaloChannel,
  createZaloChannel,
  createZaloChannelFromEnv,
} from "./zalo-channel.js";
