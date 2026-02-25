/**
 * Logging Configuration Integration
 *
 * Configures logging from EndiorBot config file.
 * Supports daily rotation to ~/.endiorbot/logs/.
 *
 * @module logging/config
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 4
 */

import path from "node:path";
import { Logger, type LogLevel, type LoggerOptions } from "./logger.js";
import {
  ConsoleTransport,
  DailyFileTransport,
  type DailyFileTransportOptions,
  type Transport,
} from "./transports.js";
import type { RedactionLevel } from "./redaction.js";
import { STATE_DIR } from "../config/paths.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Logging config from endiorbot.json.
 */
export interface LoggingConfigInput {
  level?: LogLevel;
  format?: "json" | "pretty";
  redactSensitive?: RedactionLevel;
  console?: boolean;
  file?: {
    enabled?: boolean;
    path?: string;
    maxSize?: string;
    maxFiles?: number;
    dailyRotation?: boolean;
  };
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_LOG_DIR = path.join(STATE_DIR, "logs");

const DEFAULT_CONFIG: Required<LoggingConfigInput> = {
  level: "info",
  format: "pretty",
  redactSensitive: "tools",
  console: true,
  file: {
    enabled: true,
    path: DEFAULT_LOG_DIR,
    maxSize: "10MB",
    maxFiles: 7,
    dailyRotation: true,
  },
};

// ============================================================================
// Config Functions
// ============================================================================

/**
 * Create transports from logging config.
 */
export function createTransportsFromConfig(
  config: LoggingConfigInput = {}
): Transport[] {
  const transports: Transport[] = [];

  // Console transport
  const useConsole = config.console ?? DEFAULT_CONFIG.console;
  if (useConsole) {
    transports.push(new ConsoleTransport());
  }

  // File transport
  const fileConfig = config.file ?? DEFAULT_CONFIG.file;
  const fileEnabled = fileConfig.enabled ?? DEFAULT_CONFIG.file.enabled;

  if (fileEnabled) {
    const dailyRotation =
      fileConfig.dailyRotation ?? DEFAULT_CONFIG.file.dailyRotation;

    if (dailyRotation) {
      // Use daily file transport
      const dailyOptions: DailyFileTransportOptions = {
        directory: fileConfig.path ?? DEFAULT_LOG_DIR,
        filename: "endiorbot",
      };
      // Use nullish coalescing with defined values only
      const maxSize = fileConfig.maxSize ?? DEFAULT_CONFIG.file.maxSize;
      const maxDays = fileConfig.maxFiles ?? DEFAULT_CONFIG.file.maxFiles;
      if (maxSize !== undefined) {
        dailyOptions.maxSize = maxSize;
      }
      if (maxDays !== undefined) {
        dailyOptions.maxDays = maxDays;
      }
      transports.push(new DailyFileTransport(dailyOptions));
    }
    // Note: Non-daily rotation uses FileTransport, but daily is preferred
  }

  return transports;
}

/**
 * Configure the application logger from config.
 *
 * @param config - Logging configuration from endiorbot.json
 * @param name - Logger name (default: "endiorbot")
 * @returns Configured logger instance
 */
export function configureLoggerFromConfig(
  config: LoggingConfigInput = {},
  name: string = "endiorbot"
): Logger {
  const transports = createTransportsFromConfig(config);

  const options: LoggerOptions = {
    name,
    level: config.level ?? DEFAULT_CONFIG.level,
    format: config.format ?? DEFAULT_CONFIG.format,
    redaction: config.redactSensitive ?? DEFAULT_CONFIG.redactSensitive,
    transports,
  };

  return new Logger(options);
}

/**
 * Get the default log directory path.
 */
export function getLogDirectory(): string {
  return DEFAULT_LOG_DIR;
}

/**
 * Get the default logging configuration.
 */
export function getDefaultLoggingConfig(): Required<LoggingConfigInput> {
  return { ...DEFAULT_CONFIG };
}
