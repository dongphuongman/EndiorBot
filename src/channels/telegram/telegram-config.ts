/**
 * Telegram Channel Configuration
 *
 * Configuration loader for Telegram bot integration.
 *
 * Per Sprint 38 Week 1 requirements:
 * - Bot token from env or config file
 * - Chat ID for CEO notifications
 * - Secure configuration handling
 *
 * @module channels/telegram/telegram-config
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Week 1
 * @authority Sprint 38 Plan - OTT Escalation
 * @stage 04 - BUILD
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Telegram channel configuration.
 */
export interface TelegramChannelConfig {
  /** Bot token from BotFather */
  botToken: string;
  /** Chat ID for CEO (can be user ID or group ID) */
  chatId: string;
  /** Parse mode for messages */
  parseMode: "Markdown" | "MarkdownV2" | "HTML";
  /** Disable notification sound (default: false) */
  disableNotification: boolean;
  /** Enable polling for commands (default: true) */
  enablePolling: boolean;
  /** Polling interval in ms (default: 3000) */
  pollingInterval: number;
}

/**
 * Partial config for overrides.
 */
export type TelegramChannelConfigPartial = Partial<TelegramChannelConfig>;

// ============================================================================
// Constants
// ============================================================================

/** Environment variable names */
export const ENV_TELEGRAM_BOT_TOKEN = "ENDIORBOT_TELEGRAM_BOT_TOKEN";
export const ENV_TELEGRAM_CHAT_ID = "ENDIORBOT_TELEGRAM_CHAT_ID";
export const ENV_TELEGRAM_PARSE_MODE = "ENDIORBOT_TELEGRAM_PARSE_MODE";
export const ENV_TELEGRAM_POLLING = "ENDIORBOT_TELEGRAM_POLLING";

/** Default config file path */
export const DEFAULT_CONFIG_PATH = join(homedir(), ".endiorbot", "config.json");

/** Default configuration values */
export const DEFAULT_TELEGRAM_CONFIG: Omit<TelegramChannelConfig, "botToken" | "chatId"> = {
  parseMode: "Markdown",
  disableNotification: false,
  enablePolling: true,
  pollingInterval: 3000,
};

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load Telegram configuration from environment and config file.
 *
 * Priority:
 * 1. Environment variables (highest)
 * 2. Config file (~/.endiorbot/config.json → channels.telegram)
 * 3. Defaults
 *
 * @returns Configuration or null if not configured
 */
export function loadTelegramConfig(): TelegramChannelConfig | null {
  // 1. Try environment variables first
  const envConfig = loadFromEnv();
  if (envConfig && envConfig.botToken && envConfig.chatId) {
    return {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...envConfig,
      botToken: envConfig.botToken,
      chatId: envConfig.chatId,
    };
  }

  // 2. Try config file
  const fileConfig = loadFromFile();
  if (fileConfig && fileConfig.botToken && fileConfig.chatId) {
    return {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...fileConfig,
      botToken: fileConfig.botToken,
      chatId: fileConfig.chatId,
    };
  }

  // 3. Not configured
  return null;
}

/**
 * Load configuration from environment variables.
 */
function loadFromEnv(): TelegramChannelConfigPartial | null {
  const botToken = process.env[ENV_TELEGRAM_BOT_TOKEN];
  const chatId = process.env[ENV_TELEGRAM_CHAT_ID];

  // Both are required
  if (!botToken || !chatId) {
    return null;
  }

  const config: TelegramChannelConfigPartial = {
    botToken,
    chatId,
  };

  // Optional overrides
  const parseMode = process.env[ENV_TELEGRAM_PARSE_MODE];
  if (parseMode === "Markdown" || parseMode === "MarkdownV2" || parseMode === "HTML") {
    config.parseMode = parseMode;
  }

  const polling = process.env[ENV_TELEGRAM_POLLING];
  if (polling !== undefined) {
    config.enablePolling = polling.toLowerCase() !== "false";
  }

  return config;
}

/**
 * Load configuration from config file.
 */
function loadFromFile(configPath: string = DEFAULT_CONFIG_PATH): TelegramChannelConfigPartial | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as {
      channels?: {
        telegram?: {
          botToken?: string;
          chatId?: string;
          parseMode?: string;
          disableNotification?: boolean;
          enablePolling?: boolean;
          pollingInterval?: number;
        };
      };
    };

    const telegram = config.channels?.telegram;
    if (!telegram?.botToken || !telegram?.chatId) {
      return null;
    }

    return {
      botToken: telegram.botToken,
      chatId: telegram.chatId,
      parseMode: validateParseMode(telegram.parseMode),
      disableNotification: telegram.disableNotification ?? false,
      enablePolling: telegram.enablePolling ?? true,
      pollingInterval: telegram.pollingInterval ?? 3000,
    };
  } catch {
    return null;
  }
}

/**
 * Validate parse mode string.
 */
function validateParseMode(mode?: string): "Markdown" | "MarkdownV2" | "HTML" {
  if (mode === "MarkdownV2" || mode === "HTML") {
    return mode;
  }
  return "Markdown";
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Check if Telegram is configured.
 */
export function isTelegramConfigured(): boolean {
  return loadTelegramConfig() !== null;
}

/**
 * Validate bot token format.
 * Telegram bot tokens have format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
 */
export function isValidBotToken(token: string): boolean {
  // Format: <bot_id>:<token_part>
  const parts = token.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const botId = parts[0];
  const tokenPart = parts[1];

  // Both parts must exist
  if (!botId || !tokenPart) {
    return false;
  }

  // Bot ID should be numeric
  if (!/^\d+$/.test(botId)) {
    return false;
  }

  // Token part should be alphanumeric with possible -_
  if (!/^[A-Za-z0-9_-]+$/.test(tokenPart)) {
    return false;
  }

  // Minimum length check
  if (tokenPart.length < 30) {
    return false;
  }

  return true;
}

/**
 * Validate chat ID format.
 * Can be positive (user) or negative (group/channel) number.
 */
export function isValidChatId(chatId: string): boolean {
  // Must be a number (can be negative for groups)
  return /^-?\d+$/.test(chatId);
}
