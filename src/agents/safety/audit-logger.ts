/**
 * Audit Logger
 *
 * Logs all agent invocations to JSONL for compliance and debugging.
 * Each line is a self-contained JSON object.
 *
 * Log Location: ~/.endiorbot/logs/audit.jsonl
 *
 * @module agents/safety/audit-logger
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { appendFileSync, existsSync, statSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { ensureSecureDir } from "../../security/secure-fs.js";
import { createLogger, type Logger } from "../../logging/index.js";
import type { AgentRole } from "../types/handoff.js";
import type { InvokeMode } from "../invoke/claude-code-bridge.js";
import type { RiskLevel } from "./risk-classifier.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Audit log entry.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  ts: string;
  /** Unique invocation ID */
  id: string;
  /** Agent role */
  agent: AgentRole;
  /** Task description */
  task: string;
  /** Project identifier */
  project?: string;
  /** Git branch */
  branch?: string;
  /** Git commit hash */
  commit?: string;
  /** Execution mode */
  mode: InvokeMode;
  /** Service tier */
  tier: string;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Input tokens */
  tokens_in?: number;
  /** Output tokens */
  tokens_out?: number;
  /** Estimated cost in USD */
  cost_usd?: number;
  /** Risk level */
  risk: RiskLevel;
  /** Execution status */
  status: "success" | "error" | "timeout" | "cancelled";
  /** Error message if failed */
  error?: string;
  /** Handoff target agent */
  handoff_to?: AgentRole;
  /** Context manifest summary */
  context_manifest?: {
    tier1: boolean;
    tier2: boolean;
    tokens: number;
  };
  /** Files affected */
  files_affected?: string[];
  /** User ID (for multi-user) */
  user_id?: string;
  /** Session ID */
  session_id?: string;
}

/**
 * Audit logger configuration.
 */
export interface AuditConfig {
  /** Log file path */
  logPath: string;
  /** Maximum file size before rotation (bytes) */
  maxFileSize: number;
  /** Number of backup files to keep */
  maxBackups: number;
  /** Include sensitive fields */
  includeSensitive: boolean;
  /** Enable console logging */
  consoleLog: boolean;
  /** Verbose mode */
  verbose: boolean;
}

/**
 * Default audit configuration.
 */
export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  logPath: join(homedir(), ".endiorbot", "logs", "audit.jsonl"),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5,
  includeSensitive: false,
  consoleLog: false,
  verbose: false,
};

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Token costs per 1M tokens (approximate).
 */
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-opus": { input: 15.0, output: 75.0 },
  "claude-3-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  default: { input: 3.0, output: 15.0 },
};

/**
 * Calculate estimated cost.
 */
function calculateCost(
  tokensIn: number,
  tokensOut: number,
  model = "default"
): number {
  const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS["default"];
  if (!costs) {
    return 0;
  }
  const inputCost = (tokensIn / 1_000_000) * costs.input;
  const outputCost = (tokensOut / 1_000_000) * costs.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places
}

// ============================================================================
// Audit Logger Class
// ============================================================================

/**
 * Audit Logger for agent invocations.
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 *
 * logger.log({
 *   agent: "pm",
 *   task: "plan payment gateway",
 *   mode: "READ",
 *   tier: "LITE",
 *   duration_ms: 45000,
 *   risk: "LOW",
 *   status: "success",
 * });
 * ```
 */
export class AuditLogger {
  private config: AuditConfig;
  private log: Logger;
  private sessionId: string;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.log = createLogger("audit-logger");
    this.sessionId = this.generateSessionId();
    this.ensureLogDirectory();
  }

  // ==========================================================================
  // Logging
  // ==========================================================================

  /**
   * Log an audit entry.
   */
  logEntry(entry: Omit<AuditEntry, "ts" | "id" | "session_id">): AuditEntry {
    const fullEntry: AuditEntry = {
      ts: new Date().toISOString(),
      id: this.generateId(),
      session_id: this.sessionId,
      ...entry,
    };

    // Calculate cost if tokens provided
    if (entry.tokens_in !== undefined && entry.tokens_out !== undefined && !entry.cost_usd) {
      fullEntry.cost_usd = calculateCost(entry.tokens_in, entry.tokens_out);
    }

    // Sanitize if needed
    const sanitized = this.config.includeSensitive
      ? fullEntry
      : this.sanitizeEntry(fullEntry);

    // Write to file
    this.writeEntry(sanitized);

    // Console log if enabled
    if (this.config.consoleLog) {
      this.consoleLogEntry(sanitized);
    }

    return fullEntry;
  }

  /**
   * Convenience method for successful invocation.
   */
  logSuccess(params: {
    agent: AgentRole;
    task: string;
    mode: InvokeMode;
    tier: string;
    duration_ms: number;
    risk: RiskLevel;
    tokens_in?: number;
    tokens_out?: number;
    handoff_to?: AgentRole;
    project?: string;
    branch?: string;
    commit?: string;
    files_affected?: string[];
    context_manifest?: AuditEntry["context_manifest"];
  }): AuditEntry {
    const { context_manifest, ...rest } = params;
    return this.logEntry({
      ...rest,
      ...(context_manifest ? { context_manifest } : {}),
      status: "success",
    });
  }

  /**
   * Convenience method for failed invocation.
   */
  logError(params: {
    agent: AgentRole;
    task: string;
    mode: InvokeMode;
    tier: string;
    duration_ms: number;
    risk: RiskLevel;
    error: string;
    project?: string;
    branch?: string;
    commit?: string;
  }): AuditEntry {
    return this.logEntry({
      ...params,
      status: "error",
    });
  }

  /**
   * Convenience method for timeout.
   */
  logTimeout(params: {
    agent: AgentRole;
    task: string;
    mode: InvokeMode;
    tier: string;
    duration_ms: number;
    risk: RiskLevel;
    project?: string;
  }): AuditEntry {
    return this.logEntry({
      ...params,
      status: "timeout",
      error: "Execution timed out",
    });
  }

  /**
   * Convenience method for cancellation.
   */
  logCancelled(params: {
    agent: AgentRole;
    task: string;
    mode: InvokeMode;
    tier: string;
    duration_ms: number;
    risk: RiskLevel;
    project?: string;
  }): AuditEntry {
    return this.logEntry({
      ...params,
      status: "cancelled",
    });
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Write entry to log file.
   */
  private writeEntry(entry: AuditEntry): void {
    try {
      // Check rotation
      this.rotateIfNeeded();

      // Append line
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(this.config.logPath, line, "utf-8");

      if (this.config.verbose) {
        this.log.debug("Audit entry written", { id: entry.id });
      }
    } catch (err) {
      this.log.error("Failed to write audit entry", { error: err });
    }
  }

  /**
   * Ensure log directory exists.
   */
  private ensureLogDirectory(): void {
    const dir = dirname(this.config.logPath);
    if (!existsSync(dir)) {
      ensureSecureDir(dir);
      this.log.info("Created audit log directory", { dir });
    }
  }

  /**
   * Rotate log file if needed.
   */
  private rotateIfNeeded(): void {
    if (!existsSync(this.config.logPath)) return;

    try {
      const stats = statSync(this.config.logPath);
      if (stats.size < this.config.maxFileSize) return;

      // Rotate files
      for (let i = this.config.maxBackups - 1; i >= 1; i--) {
        const oldPath = `${this.config.logPath}.${i}`;
        const newPath = `${this.config.logPath}.${i + 1}`;
        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      // Move current to .1
      renameSync(this.config.logPath, `${this.config.logPath}.1`);
      this.log.info("Rotated audit log", { path: this.config.logPath });
    } catch (err) {
      this.log.error("Failed to rotate audit log", { error: err });
    }
  }

  // ==========================================================================
  // Sanitization
  // ==========================================================================

  /**
   * Sanitize entry to remove sensitive data.
   */
  private sanitizeEntry(entry: AuditEntry): AuditEntry {
    const sanitized = { ...entry };

    // Truncate task if too long
    if (sanitized.task && sanitized.task.length > 200) {
      sanitized.task = sanitized.task.slice(0, 197) + "...";
    }

    // Redact sensitive patterns in task
    sanitized.task = this.redactSensitive(sanitized.task);

    // Redact error message
    if (sanitized.error) {
      sanitized.error = this.redactSensitive(sanitized.error);
    }

    return sanitized;
  }

  /**
   * Redact sensitive patterns.
   */
  private redactSensitive(text: string): string {
    // Redact potential secrets
    const patterns = [
      /\b[A-Za-z0-9+/]{40,}=*\b/g, // Base64-like
      /\bsk[-_][A-Za-z0-9]{32,}\b/g, // API keys
      /\b[A-Fa-f0-9]{32,}\b/g, // Hex tokens
      /password\s*[:=]\s*["']?[^"'\s]+/gi,
      /secret\s*[:=]\s*["']?[^"'\s]+/gi,
      /token\s*[:=]\s*["']?[^"'\s]+/gi,
    ];

    let result = text;
    for (const pattern of patterns) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }

  // ==========================================================================
  // Console Logging
  // ==========================================================================

  /**
   * Log entry to console.
   */
  private consoleLogEntry(entry: AuditEntry): void {
    const icon = entry.status === "success" ? "✅" : entry.status === "error" ? "❌" : "⏱️";
    const parts = [
      `${icon} @${entry.agent}`,
      `[${entry.mode}]`,
      entry.task.slice(0, 50),
      `${entry.duration_ms}ms`,
      entry.cost_usd ? `$${entry.cost_usd}` : "",
    ].filter(Boolean);

    console.log(parts.join(" | "));
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Generate unique ID.
   */
  private generateId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Generate session ID.
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Get log file path.
   */
  getLogPath(): string {
    return this.config.logPath;
  }

  /**
   * Get session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalLogger: AuditLogger | undefined;

/**
 * Get global audit logger.
 */
export function getAuditLogger(config?: Partial<AuditConfig>): AuditLogger {
  if (!globalLogger) {
    globalLogger = new AuditLogger(config);
  }
  return globalLogger;
}

/**
 * Reset global audit logger.
 */
export function resetAuditLogger(): void {
  globalLogger = undefined;
}

/**
 * Create a new audit logger.
 */
export function createAuditLogger(config?: Partial<AuditConfig>): AuditLogger {
  return new AuditLogger(config);
}

/**
 * Quick log function.
 */
export function auditLog(entry: Omit<AuditEntry, "ts" | "id" | "session_id">): AuditEntry {
  return getAuditLogger().logEntry(entry);
}
