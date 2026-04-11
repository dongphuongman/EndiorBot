/**
 * Zalo Channel Configuration
 *
 * Configuration loader for Zalo OA (Official Account) integration.
 *
 * Per Sprint 46 Days 4-5 requirements:
 * - OAuth2-based authentication
 * - OA access token from env or config file
 * - Chat ID for CEO notifications
 * - Webhook support for incoming messages
 *
 * @module channels/zalo/zalo-config
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 4-5
 * @authority ADR-005 Python-to-TypeScript Porting
 * @stage 04 - BUILD
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { envInt } from "../../config/timeouts.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Zalo channel configuration.
 */
export interface ZaloChannelConfig {
  /** OA (Official Account) access token */
  accessToken: string;
  /** OA refresh token for token renewal */
  refreshToken?: string;
  /** User ID for CEO (recipient) */
  userId: string;
  /** OA ID */
  oaId: string;
  /** Enable webhook for incoming messages */
  enableWebhook: boolean;
  /** Webhook secret for verification */
  webhookSecret?: string;
  /** Polling interval in ms (default: 5000) */
  pollingInterval: number;
  /** Request timeout in ms */
  timeoutMs: number;
}

/**
 * Partial config for overrides.
 */
export type ZaloChannelConfigPartial = Partial<ZaloChannelConfig>;

// ============================================================================
// Constants
// ============================================================================

/** Zalo OA API base URL */
export const ZALO_API_BASE = "https://openapi.zalo.me/v3.0";

/** Environment variable names */
export const ENV_ZALO_ACCESS_TOKEN = "ENDIORBOT_ZALO_ACCESS_TOKEN";
export const ENV_ZALO_REFRESH_TOKEN = "ENDIORBOT_ZALO_REFRESH_TOKEN";
export const ENV_ZALO_USER_ID = "ENDIORBOT_ZALO_USER_ID";
export const ENV_ZALO_OA_ID = "ENDIORBOT_ZALO_OA_ID";
export const ENV_ZALO_WEBHOOK_SECRET = "ENDIORBOT_ZALO_WEBHOOK_SECRET";

/** Default config file path */
export const DEFAULT_CONFIG_PATH = join(homedir(), ".endiorbot", "config.json");

/** Default configuration values */
export const DEFAULT_ZALO_CONFIG: Omit<ZaloChannelConfig, "accessToken" | "userId" | "oaId"> = {
  enableWebhook: false,
  pollingInterval: envInt("ENDIORBOT_ZALO_POLLING_MS", 5000),
  timeoutMs: 10_000,
};

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load Zalo configuration from environment and config file.
 *
 * Priority:
 * 1. Environment variables (highest)
 * 2. Config file (~/.endiorbot/config.json → channels.zalo)
 * 3. Defaults
 *
 * @returns Configuration or null if not configured
 */
export function loadZaloConfig(): ZaloChannelConfig | null {
  // 1. Try environment variables first
  const envConfig = loadFromEnv();
  if (envConfig && envConfig.accessToken && envConfig.userId && envConfig.oaId) {
    return {
      ...DEFAULT_ZALO_CONFIG,
      ...envConfig,
      accessToken: envConfig.accessToken,
      userId: envConfig.userId,
      oaId: envConfig.oaId,
    };
  }

  // 2. Try config file
  const fileConfig = loadFromFile();
  if (fileConfig && fileConfig.accessToken && fileConfig.userId && fileConfig.oaId) {
    return {
      ...DEFAULT_ZALO_CONFIG,
      ...fileConfig,
      accessToken: fileConfig.accessToken,
      userId: fileConfig.userId,
      oaId: fileConfig.oaId,
    };
  }

  // 3. Not configured
  return null;
}

/**
 * Load configuration from environment variables.
 */
function loadFromEnv(): ZaloChannelConfigPartial | null {
  const accessToken = process.env[ENV_ZALO_ACCESS_TOKEN];
  const userId = process.env[ENV_ZALO_USER_ID];
  const oaId = process.env[ENV_ZALO_OA_ID];

  // All required
  if (!accessToken || !userId || !oaId) {
    return null;
  }

  const config: ZaloChannelConfigPartial = {
    accessToken,
    userId,
    oaId,
  };

  // Optional
  const refreshToken = process.env[ENV_ZALO_REFRESH_TOKEN];
  if (refreshToken) {
    config.refreshToken = refreshToken;
  }

  const webhookSecret = process.env[ENV_ZALO_WEBHOOK_SECRET];
  if (webhookSecret) {
    config.webhookSecret = webhookSecret;
    config.enableWebhook = true;
  }

  return config;
}

/**
 * Load configuration from config file.
 */
function loadFromFile(configPath: string = DEFAULT_CONFIG_PATH): ZaloChannelConfigPartial | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as {
      channels?: {
        zalo?: {
          accessToken?: string;
          refreshToken?: string;
          userId?: string;
          oaId?: string;
          enableWebhook?: boolean;
          webhookSecret?: string;
          pollingInterval?: number;
          timeoutMs?: number;
        };
      };
    };

    const zalo = config.channels?.zalo;
    if (!zalo?.accessToken || !zalo?.userId || !zalo?.oaId) {
      return null;
    }

    const result: ZaloChannelConfigPartial = {
      accessToken: zalo.accessToken,
      userId: zalo.userId,
      oaId: zalo.oaId,
      enableWebhook: zalo.enableWebhook ?? false,
      pollingInterval: zalo.pollingInterval ?? 5000,
      timeoutMs: zalo.timeoutMs ?? 10_000,
    };

    if (zalo.refreshToken) {
      result.refreshToken = zalo.refreshToken;
    }
    if (zalo.webhookSecret) {
      result.webhookSecret = zalo.webhookSecret;
    }

    return result;
  } catch {
    return null;
  }
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Check if Zalo is configured.
 */
export function isZaloConfigured(): boolean {
  return loadZaloConfig() !== null;
}

/**
 * Validate OA ID format.
 * Zalo OA IDs are numeric strings.
 */
export function isValidOaId(oaId: string): boolean {
  return /^\d+$/.test(oaId);
}

/**
 * Validate user ID format.
 * Zalo user IDs are numeric strings.
 */
export function isValidUserId(userId: string): boolean {
  return /^\d+$/.test(userId);
}
