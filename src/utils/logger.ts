/**
 * Structured Logger
 *
 * Sprint 116 T10: JSON structured logging for security-sensitive modules.
 * Replaces ad-hoc console.log/warn/error with structured JSON output.
 *
 * @module utils/logger
 * @version 1.0.0
 */

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}

/**
 * Create a structured logger for a module.
 *
 * Output: JSON lines to stderr (info/debug) or stderr (warn/error).
 * Format: { level, module, msg, ts, ...ctx }
 */
export function createLogger(module: string): Logger {
  const emit = (level: string, msg: string, ctx?: LogContext): void => {
    const entry = { level, module, msg, ts: Date.now(), ...ctx };
    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
    debug: (msg, ctx) => {
      if (process.env.ENDIORBOT_DEBUG === "true") {
        emit("debug", msg, ctx);
      }
    },
  };
}
