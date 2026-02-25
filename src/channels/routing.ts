/**
 * Channel Routing Configuration
 *
 * CEO-configurable alert routing to channels (Telegram, Zalo, etc.)
 *
 * Per Sprint 46 Day 9 requirements:
 * - Per-alert-type channel routing
 * - Primary channel fallback
 * - Config persistence (~/.endiorbot/channels.json)
 *
 * @module channels/routing
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Day 10
 * @authority CTO Review
 * @stage 04 - BUILD
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Alert types that can be routed to channels.
 */
export type AlertType = "budget" | "approval" | "gate" | "status" | "error";

/**
 * Channel routing configuration.
 */
export interface ChannelRoutingConfig {
  /** Primary channel for fallback */
  primary: string;
  /** Per-alert-type channel routing */
  routing: Record<AlertType, string[]>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default config file path */
export const DEFAULT_CHANNELS_CONFIG_PATH = join(
  homedir(),
  ".endiorbot",
  "channels.json"
);

/** Default routing configuration */
export const DEFAULT_CHANNEL_ROUTING: ChannelRoutingConfig = {
  primary: "telegram",
  routing: {
    budget: ["telegram", "zalo"],
    approval: ["telegram", "zalo"],
    gate: ["telegram"],
    status: ["telegram"],
    error: ["telegram"],
  },
};

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load channel routing configuration.
 *
 * Priority:
 * 1. Config file (~/.endiorbot/channels.json)
 * 2. Default configuration
 *
 * @param configPath - Optional custom config path
 * @returns Channel routing configuration
 */
export function loadChannelRouting(
  configPath: string = DEFAULT_CHANNELS_CONFIG_PATH
): ChannelRoutingConfig {
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CHANNEL_ROUTING };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as Partial<ChannelRoutingConfig>;

    // Merge with defaults
    return {
      primary: config.primary ?? DEFAULT_CHANNEL_ROUTING.primary,
      routing: {
        ...DEFAULT_CHANNEL_ROUTING.routing,
        ...config.routing,
      },
    };
  } catch {
    return { ...DEFAULT_CHANNEL_ROUTING };
  }
}

/**
 * Save channel routing configuration.
 *
 * @param config - Configuration to save
 * @param configPath - Optional custom config path
 */
export function saveChannelRouting(
  config: ChannelRoutingConfig,
  configPath: string = DEFAULT_CHANNELS_CONFIG_PATH
): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get channels for a specific alert type.
 *
 * Falls back to primary channel if no routing defined.
 *
 * @param type - Alert type
 * @param config - Optional config (loads from file if not provided)
 * @returns Array of channel names to send to
 */
export function getChannelsForAlert(
  type: AlertType,
  config?: ChannelRoutingConfig
): string[] {
  const routing = config ?? loadChannelRouting();
  const channels = routing.routing[type];

  if (!channels || channels.length === 0) {
    return [routing.primary];
  }

  return channels;
}

/**
 * Set channels for a specific alert type.
 *
 * @param type - Alert type
 * @param channels - Array of channel names
 * @param configPath - Optional custom config path
 */
export function setChannelsForAlert(
  type: AlertType,
  channels: string[],
  configPath: string = DEFAULT_CHANNELS_CONFIG_PATH
): void {
  const config = loadChannelRouting(configPath);
  config.routing[type] = channels;
  saveChannelRouting(config, configPath);
}

/**
 * Set the primary (fallback) channel.
 *
 * @param channel - Channel name
 * @param configPath - Optional custom config path
 */
export function setPrimaryChannel(
  channel: string,
  configPath: string = DEFAULT_CHANNELS_CONFIG_PATH
): void {
  const config = loadChannelRouting(configPath);
  config.primary = channel;
  saveChannelRouting(config, configPath);
}

/**
 * Check if a channel is configured for any alert type.
 *
 * @param channel - Channel name to check
 * @param config - Optional config (loads from file if not provided)
 * @returns true if channel is in any routing
 */
export function isChannelInRouting(
  channel: string,
  config?: ChannelRoutingConfig
): boolean {
  const routing = config ?? loadChannelRouting();

  if (routing.primary === channel) {
    return true;
  }

  for (const channels of Object.values(routing.routing)) {
    if (channels.includes(channel)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all configured channels (unique).
 *
 * @param config - Optional config (loads from file if not provided)
 * @returns Array of unique channel names
 */
export function getAllConfiguredChannels(
  config?: ChannelRoutingConfig
): string[] {
  const routing = config ?? loadChannelRouting();
  const channels = new Set<string>([routing.primary]);

  for (const channelList of Object.values(routing.routing)) {
    for (const channel of channelList) {
      channels.add(channel);
    }
  }

  return Array.from(channels);
}
