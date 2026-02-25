/**
 * Config Error Types
 *
 * Errors related to configuration loading and validation.
 *
 * @module errors/config
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError } from "./base.js";

// ============================================================================
// Config Error Codes
// ============================================================================

/**
 * Config-specific error codes.
 */
export type ConfigErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID_JSON"
  | "CONFIG_INVALID_SCHEMA"
  | "CONFIG_MISSING_REQUIRED"
  | "CONFIG_INVALID_VALUE"
  | "CONFIG_PERMISSION_DENIED"
  | "CONFIG_WRITE_FAILED"
  | "CONFIG_ENV_MISSING";

// ============================================================================
// Config Error Class
// ============================================================================

/**
 * Error from configuration loading/validation.
 */
export class ConfigError extends EndiorBotError {
  /** Config error code */
  public readonly configCode: ConfigErrorCode;

  /** Config file path */
  public readonly configPath?: string;

  /** Field that caused the error */
  public readonly field?: string;

  /** Expected value/type */
  public readonly expected?: string;

  /** Actual value/type */
  public readonly actual?: string;

  constructor(
    message: string,
    options: {
      code: ConfigErrorCode;
      configPath?: string;
      field?: string;
      expected?: string;
      actual?: string;
      cause?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    const metadata: Record<string, unknown> = { ...options.metadata };
    if (options.configPath !== undefined) {
      metadata.configPath = options.configPath;
    }
    if (options.field !== undefined) {
      metadata.field = options.field;
    }
    if (options.expected !== undefined) {
      metadata.expected = options.expected;
    }
    if (options.actual !== undefined) {
      metadata.actual = options.actual;
    }

    super(message, {
      code: options.code,
      category: "CONFIG",
      retryable: false, // Config errors require user intervention
      severity: "error",
      metadata,
      ...(options.cause ? { cause: options.cause } : {}),
    });

    this.name = "ConfigError";
    this.configCode = options.code;
    if (options.configPath !== undefined) {
      this.configPath = options.configPath;
    }
    if (options.field !== undefined) {
      this.field = options.field;
    }
    if (options.expected !== undefined) {
      this.expected = options.expected;
    }
    if (options.actual !== undefined) {
      this.actual = options.actual;
    }
  }

  /**
   * Get suggested fix for the error.
   */
  getSuggestion(): string {
    switch (this.configCode) {
      case "CONFIG_NOT_FOUND":
        return `Create config file at ${this.configPath} or run 'endiorbot config init'`;
      case "CONFIG_INVALID_JSON":
        return "Check config file for JSON syntax errors";
      case "CONFIG_INVALID_SCHEMA":
        return "Validate config against expected schema";
      case "CONFIG_MISSING_REQUIRED":
        return `Add required field '${this.field}' to config`;
      case "CONFIG_INVALID_VALUE":
        return `Change '${this.field}' from '${this.actual}' to valid value (expected: ${this.expected})`;
      case "CONFIG_PERMISSION_DENIED":
        return `Check file permissions for ${this.configPath}`;
      case "CONFIG_WRITE_FAILED":
        return "Ensure write access to config directory";
      case "CONFIG_ENV_MISSING":
        return `Set environment variable '${this.field}'`;
      default:
        return "Check configuration documentation";
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a config not found error.
 */
export function configNotFoundError(configPath: string): ConfigError {
  return new ConfigError(`Config file not found: ${configPath}`, {
    code: "CONFIG_NOT_FOUND",
    configPath,
  });
}

/**
 * Create an invalid JSON error.
 */
export function invalidJsonError(
  configPath: string,
  cause?: Error
): ConfigError {
  const options: {
    code: ConfigErrorCode;
    configPath: string;
    cause?: Error;
  } = {
    code: "CONFIG_INVALID_JSON",
    configPath,
  };
  if (cause !== undefined) {
    options.cause = cause;
  }
  return new ConfigError(`Invalid JSON in config file: ${configPath}`, options);
}

/**
 * Create a missing required field error.
 */
export function missingRequiredError(field: string): ConfigError {
  return new ConfigError(`Missing required config field: ${field}`, {
    code: "CONFIG_MISSING_REQUIRED",
    field,
  });
}

/**
 * Create an invalid value error.
 */
export function invalidValueError(
  field: string,
  expected: string,
  actual: string
): ConfigError {
  return new ConfigError(
    `Invalid config value for '${field}': expected ${expected}, got ${actual}`,
    {
      code: "CONFIG_INVALID_VALUE",
      field,
      expected,
      actual,
    }
  );
}

/**
 * Create an env missing error.
 */
export function envMissingError(envVar: string): ConfigError {
  return new ConfigError(`Required environment variable not set: ${envVar}`, {
    code: "CONFIG_ENV_MISSING",
    field: envVar,
  });
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a ConfigError.
 */
export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}
