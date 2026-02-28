/**
 * Zalo Channel Module
 *
 * Exports for Zalo OA and Zalo Bot integration.
 *
 * @module channels/zalo
 * @version 1.1.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 51
 */

// ============================================================================
// Zalo OA (Official Account) - Legacy
// ============================================================================

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

// ============================================================================
// Zalo Bot Platform (Zapps.me) - NEW
// ============================================================================

// API Client
export type {
  ZaloBotApiResponse,
  ZaloBotInfo,
  ZaloBotMessage,
  ZaloBotUpdate,
  ZaloBotSendMessageParams,
  ZaloBotSendPhotoParams,
  ZaloBotSetWebhookParams,
  ZaloBotGetUpdatesParams,
} from "./zalo-bot-api.js";

export {
  ZALO_BOT_API_BASE,
  ZaloBotApiError,
  callZaloBotApi,
  getMe as getBotMe,
  sendMessage as sendBotMessage,
  sendPhoto as sendBotPhoto,
  getUpdates as getBotUpdates,
  setWebhook as setBotWebhook,
  deleteWebhook as deleteBotWebhook,
  getWebhookInfo as getBotWebhookInfo,
} from "./zalo-bot-api.js";

// Config
export type {
  ZaloBotChannelConfig,
  ZaloBotChannelConfigPartial,
} from "./zalo-bot-channel.js";

export {
  ENV_ZALO_BOT_TOKEN,
  ENV_ZALO_BOT_CHAT_ID,
  DEFAULT_ZALO_BOT_CONFIG,
  loadZaloBotConfig,
  isZaloBotConfigured,
} from "./zalo-bot-channel.js";

// Channel
export {
  ZaloBotChannel,
  createZaloBotChannel,
  createZaloBotChannelFromEnv,
} from "./zalo-bot-channel.js";
