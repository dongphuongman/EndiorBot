/**
 * Gateway Configuration
 *
 * Loads gateway configuration from environment and config files.
 *
 * @module gateway/config
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 */

import { DEFAULT_GATEWAY_CONFIG, type GatewayConfig } from "./types.js";

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Environment variable names.
 */
export const GatewayEnvVars = {
  /** Gateway port */
  PORT: "ENDIORBOT_GATEWAY_PORT",
  /** Gateway host */
  HOST: "ENDIORBOT_GATEWAY_HOST",
  /** Authentication token */
  TOKEN: "ENDIORBOT_GATEWAY_TOKEN",
  /** Enable authentication */
  AUTH_ENABLED: "ENDIORBOT_GATEWAY_AUTH",
  /** Allowed CORS origins (comma-separated) */
  CORS_ORIGINS: "ENDIORBOT_CORS_ORIGINS",
} as const;

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load gateway configuration from environment.
 */
export function loadGatewayConfigFromEnv(): Partial<GatewayConfig> {
  const config: Partial<GatewayConfig> = {};

  // Port
  const portStr = process.env[GatewayEnvVars.PORT];
  if (portStr) {
    const port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.port = port;
    }
  }

  // Host
  const host = process.env[GatewayEnvVars.HOST];
  if (host) {
    config.host = host;
  }

  // Auth token
  const token = process.env[GatewayEnvVars.TOKEN];
  if (token) {
    config.authToken = token;
    config.authEnabled = true;
  }

  // Auth enabled
  const authEnabled = process.env[GatewayEnvVars.AUTH_ENABLED];
  if (authEnabled !== undefined) {
    config.authEnabled = authEnabled === "true" || authEnabled === "1";
  }

  // CORS origins (Sprint 116 T3)
  const corsOrigins = process.env[GatewayEnvVars.CORS_ORIGINS];
  if (corsOrigins) {
    config.corsOrigins = corsOrigins.split(",").map((o) => o.trim()).filter(Boolean);
  }

  return config;
}

/**
 * Load gateway configuration from config object.
 */
export function loadGatewayConfigFromObject(
  obj: Record<string, unknown>
): Partial<GatewayConfig> {
  const config: Partial<GatewayConfig> = {};

  if (typeof obj.port === "number") {
    config.port = obj.port;
  }

  if (typeof obj.host === "string") {
    config.host = obj.host;
  }

  if (typeof obj.authEnabled === "boolean") {
    config.authEnabled = obj.authEnabled;
  }

  if (typeof obj.authToken === "string") {
    config.authToken = obj.authToken;
  }

  if (typeof obj.pingInterval === "number") {
    config.pingInterval = obj.pingInterval;
  }

  if (typeof obj.pingTimeout === "number") {
    config.pingTimeout = obj.pingTimeout;
  }

  if (typeof obj.maxMessageSize === "number") {
    config.maxMessageSize = obj.maxMessageSize;
  }

  return config;
}

/**
 * Resolve full gateway configuration.
 * Priority: env > explicit > defaults
 */
export function resolveGatewayConfig(
  explicit?: Partial<GatewayConfig>
): GatewayConfig {
  const envConfig = loadGatewayConfigFromEnv();

  return {
    ...DEFAULT_GATEWAY_CONFIG,
    ...explicit,
    ...envConfig,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result.
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate gateway configuration.
 */
export function validateGatewayConfig(
  config: GatewayConfig
): ConfigValidationResult {
  const errors: string[] = [];

  // Port validation
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port} (must be 1-65535)`);
  }

  // Host validation
  if (!config.host) {
    errors.push("Host cannot be empty");
  }

  // Auth token required if auth enabled
  if (config.authEnabled && !config.authToken) {
    errors.push("Auth token required when authentication is enabled");
  }

  // Ping interval validation
  if (config.pingInterval < 1000) {
    errors.push("Ping interval must be at least 1000ms");
  }

  // Ping timeout validation
  if (config.pingTimeout < 1000) {
    errors.push("Ping timeout must be at least 1000ms");
  }

  if (config.pingTimeout >= config.pingInterval) {
    errors.push("Ping timeout must be less than ping interval");
  }

  // Max message size validation
  if (config.maxMessageSize < 1024) {
    errors.push("Max message size must be at least 1KB");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Configuration Display
// ============================================================================

/**
 * Get configuration summary for display.
 */
export function getConfigSummary(config: GatewayConfig): string {
  const lines = [
    `Gateway Configuration:`,
    `  Port: ${config.port}`,
    `  Host: ${config.host}`,
    `  Auth: ${config.authEnabled ? "enabled" : "disabled"}`,
    `  Ping Interval: ${config.pingInterval}ms`,
    `  Ping Timeout: ${config.pingTimeout}ms`,
    `  Max Message Size: ${Math.round(config.maxMessageSize / 1024)}KB`,
  ];

  return lines.join("\n");
}
