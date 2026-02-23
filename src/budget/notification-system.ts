/**
 * Notification System for Budget Control
 *
 * Sends notifications for budget events via multiple channels.
 *
 * Per PM Day 9 guidance:
 * - Reuses NotificationRateLimiter from CircuitBreaker (no duplicate)
 * - Multiple channels: terminal + file
 * - Rate limit: max 4/hour (critical bypasses)
 * - Priority-based routing
 *
 * @module budget/notification-system
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 36 Day 9
 * @authority ADR-007 Budget Control
 */

import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { NotificationRateLimiter } from "./circuit-breaker.js";
import type { NotificationPriority } from "./types.js";

// Re-export NotificationPriority for convenience
export type { NotificationPriority } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Default notification log file path */
export const DEFAULT_NOTIFICATION_LOG_PATH = join(
  homedir(),
  ".endiorbot",
  "notifications.log",
);

/** Max log file entries before rotation */
export const MAX_LOG_ENTRIES = 1000;

/**
 * Notification event types.
 */
export type NotificationEventType =
  | "budget_warning"
  | "budget_limit"
  | "approval_needed"
  | "escalation"
  | "daily_reset"
  | "model_switched"
  | "approval_resolved";

/**
 * Notification event.
 */
export interface NotificationEvent {
  /** Event type */
  type: NotificationEventType;
  /** Priority level */
  priority: NotificationPriority;
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Event timestamp */
  timestamp: Date;
}

/**
 * Notification channel interface.
 */
export interface NotificationChannel {
  /** Channel name */
  name: string;
  /** Send notification */
  send(event: NotificationEvent): Promise<void>;
  /** Check if channel is enabled */
  isEnabled(): boolean;
}

/**
 * Notification system configuration.
 */
export interface NotificationSystemConfig {
  /** Enable terminal output */
  terminalEnabled: boolean;
  /** Enable file logging */
  fileEnabled: boolean;
  /** File log path */
  logPath: string;
  /** Use colors in terminal */
  useColors: boolean;
  /** Minimum priority to send (lower priorities filtered) */
  minPriority: NotificationPriority;
  /** Include timestamp in output */
  includeTimestamp: boolean;
}

/**
 * Default notification system config.
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationSystemConfig = {
  terminalEnabled: true,
  fileEnabled: true,
  logPath: DEFAULT_NOTIFICATION_LOG_PATH,
  useColors: true,
  minPriority: "low",
  includeTimestamp: true,
};

/**
 * Notification history entry.
 */
export interface NotificationHistoryEntry {
  /** Entry ID */
  id: string;
  /** Event */
  event: NotificationEvent;
  /** Channels sent to */
  channels: string[];
  /** Rate limited? */
  rateLimited: boolean;
  /** Sent timestamp */
  sentAt: Date;
}

/**
 * Notification statistics.
 */
export interface NotificationStats {
  /** Total sent */
  totalSent: number;
  /** Total rate limited */
  totalRateLimited: number;
  /** Sent by type */
  byType: Record<NotificationEventType, number>;
  /** Sent by priority */
  byPriority: Record<NotificationPriority, number>;
  /** Last sent timestamp */
  lastSentAt?: Date;
}

// ============================================================================
// ANSI Color Codes (no external dependency)
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

// ============================================================================
// Terminal Channel
// ============================================================================

/**
 * Terminal notification channel.
 */
export class TerminalChannel implements NotificationChannel {
  readonly name = "terminal";
  private enabled: boolean;
  private useColors: boolean;
  private includeTimestamp: boolean;

  constructor(
    enabled: boolean = true,
    useColors: boolean = true,
    includeTimestamp: boolean = true,
  ) {
    this.enabled = enabled;
    this.useColors = useColors;
    this.includeTimestamp = includeTimestamp;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async send(event: NotificationEvent): Promise<void> {
    if (!this.enabled) return;

    const output = this.formatEvent(event);
    console.warn(output);
  }

  private formatEvent(event: NotificationEvent): string {
    const icon = this.getIcon(event.type, event.priority);
    const color = this.getColor(event.priority);
    const timestamp = this.includeTimestamp
      ? `[${event.timestamp.toLocaleTimeString()}] `
      : "";

    if (this.useColors) {
      return [
        "",
        `${color}${COLORS.bold}${icon}  ${event.title}${COLORS.reset}`,
        `${COLORS.dim}${timestamp}${COLORS.reset}${event.message}`,
        "",
      ].join("\n");
    }

    return [
      "",
      `${icon}  ${event.title}`,
      `${timestamp}${event.message}`,
      "",
    ].join("\n");
  }

  private getIcon(type: NotificationEventType, priority: NotificationPriority): string {
    if (priority === "critical") return "🚨";
    switch (type) {
      case "budget_warning":
        return "⚠️";
      case "budget_limit":
        return "🛑";
      case "approval_needed":
        return "📋";
      case "escalation":
        return "⬆️";
      case "daily_reset":
        return "🔄";
      case "model_switched":
        return "🔀";
      case "approval_resolved":
        return "✅";
      default:
        return "📢";
    }
  }

  private getColor(priority: NotificationPriority): string {
    switch (priority) {
      case "critical":
        return COLORS.red;
      case "high":
        return COLORS.yellow;
      case "medium":
        return COLORS.cyan;
      case "low":
        return COLORS.dim;
      default:
        return COLORS.reset;
    }
  }
}

// ============================================================================
// File Channel
// ============================================================================

/**
 * File notification channel.
 */
export class FileChannel implements NotificationChannel {
  readonly name = "file";
  private enabled: boolean;
  private logPath: string;
  private entryCount: number = 0;

  constructor(enabled: boolean = true, logPath: string = DEFAULT_NOTIFICATION_LOG_PATH) {
    this.enabled = enabled;
    this.logPath = logPath;
    this.ensureLogDir();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getLogPath(): string {
    return this.logPath;
  }

  async send(event: NotificationEvent): Promise<void> {
    if (!this.enabled) return;

    const logEntry = this.formatLogEntry(event);
    this.appendToLog(logEntry);
  }

  private formatLogEntry(event: NotificationEvent): string {
    const entry = {
      timestamp: event.timestamp.toISOString(),
      type: event.type,
      priority: event.priority,
      title: event.title,
      message: event.message,
      metadata: event.metadata,
    };
    return JSON.stringify(entry);
  }

  private appendToLog(entry: string): void {
    try {
      this.ensureLogDir();
      appendFileSync(this.logPath, entry + "\n", "utf-8");
      this.entryCount++;

      // Note: Log rotation would be implemented here for production
      // For now, we just track count
    } catch {
      // Silently fail on write errors
    }
  }

  private ensureLogDir(): void {
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================================================
// Notification System
// ============================================================================

/**
 * NotificationSystem - Central notification management.
 *
 * Per PM Day 9 guidance:
 * - Reuses NotificationRateLimiter (no duplicate instance)
 * - Multiple channels (terminal + file)
 * - Priority-based filtering
 * - Rate limiting (critical bypasses)
 */
export class NotificationSystem {
  private rateLimiter: NotificationRateLimiter;
  private config: NotificationSystemConfig;
  private channels: NotificationChannel[] = [];
  private history: NotificationHistoryEntry[] = [];
  private stats: NotificationStats;

  constructor(
    rateLimiter: NotificationRateLimiter,
    config?: Partial<NotificationSystemConfig>,
  ) {
    this.rateLimiter = rateLimiter;
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };

    // Initialize channels
    this.channels = [
      new TerminalChannel(
        this.config.terminalEnabled,
        this.config.useColors,
        this.config.includeTimestamp,
      ),
      new FileChannel(this.config.fileEnabled, this.config.logPath),
    ];

    // Initialize stats
    this.stats = this.createEmptyStats();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Send a notification.
   */
  async notify(event: NotificationEvent): Promise<boolean> {
    // Check priority filter
    if (!this.meetsPriorityThreshold(event.priority)) {
      return false;
    }

    // Check rate limit (critical bypasses)
    const canSend = this.canSend(event.priority);
    if (!canSend) {
      this.recordRateLimited(event);
      return false;
    }

    // Send to all enabled channels
    const sentChannels: string[] = [];
    for (const channel of this.channels) {
      if (channel.isEnabled()) {
        try {
          await channel.send(event);
          sentChannels.push(channel.name);
        } catch {
          // Continue to other channels on error
        }
      }
    }

    // Record sent
    if (sentChannels.length > 0) {
      this.rateLimiter.recordSent();
      this.recordSent(event, sentChannels);
    }

    return sentChannels.length > 0;
  }

  /**
   * Check if notification can be sent (rate limit check).
   */
  canSend(priority?: NotificationPriority): boolean {
    // Critical bypasses rate limit
    if (priority === "critical") {
      return true;
    }

    return this.rateLimiter.canSend();
  }

  /**
   * Get remaining notifications this hour.
   */
  getRemainingThisHour(): number {
    return this.rateLimiter.getRemaining();
  }

  /**
   * Send budget warning notification.
   */
  async notifyBudgetWarning(
    budgetType: "session" | "daily",
    percentUsed: number,
    used: number,
    limit: number,
  ): Promise<boolean> {
    const priority: NotificationPriority = percentUsed >= 90 ? "high" : "medium";

    return this.notify({
      type: "budget_warning",
      priority,
      title: "BUDGET WARNING",
      message: `${budgetType.charAt(0).toUpperCase() + budgetType.slice(1)} budget at ${percentUsed.toFixed(0)}% ($${used.toFixed(2)} / $${limit.toFixed(2)})`,
      metadata: { budgetType, percentUsed, used, limit },
      timestamp: new Date(),
    });
  }

  /**
   * Send budget limit reached notification.
   */
  async notifyBudgetLimit(
    budgetType: "session" | "daily",
    used: number,
    limit: number,
  ): Promise<boolean> {
    return this.notify({
      type: "budget_limit",
      priority: "critical",
      title: "BUDGET LIMIT REACHED",
      message: `${budgetType.charAt(0).toUpperCase() + budgetType.slice(1)} budget exhausted ($${used.toFixed(2)} / $${limit.toFixed(2)}). Execution paused.`,
      metadata: { budgetType, used, limit },
      timestamp: new Date(),
    });
  }

  /**
   * Send approval needed notification.
   */
  async notifyApprovalNeeded(
    decisionType: string,
    reason: string,
    approvalId: string,
  ): Promise<boolean> {
    return this.notify({
      type: "approval_needed",
      priority: "high",
      title: "APPROVAL NEEDED",
      message: `${decisionType}: ${reason}\nApproval ID: ${approvalId}\nRun: endiorbot queue approve ${approvalId}`,
      metadata: { decisionType, reason, approvalId },
      timestamp: new Date(),
    });
  }

  /**
   * Send escalation notification.
   */
  async notifyEscalation(
    level: number,
    action: string,
    reason: string,
  ): Promise<boolean> {
    const priority: NotificationPriority = level >= 3 ? "high" : "medium";

    return this.notify({
      type: "escalation",
      priority,
      title: `ESCALATION L${level}`,
      message: `Action: ${action}\nReason: ${reason}`,
      metadata: { level, action, reason },
      timestamp: new Date(),
    });
  }

  /**
   * Send model switched notification.
   */
  async notifyModelSwitched(
    fromModel: string,
    toModel: string,
    reason: string,
  ): Promise<boolean> {
    return this.notify({
      type: "model_switched",
      priority: "medium",
      title: "MODEL SWITCHED",
      message: `Switched from ${fromModel} to ${toModel}\nReason: ${reason}`,
      metadata: { fromModel, toModel, reason },
      timestamp: new Date(),
    });
  }

  /**
   * Send daily reset notification.
   */
  async notifyDailyReset(): Promise<boolean> {
    return this.notify({
      type: "daily_reset",
      priority: "low",
      title: "DAILY BUDGET RESET",
      message: "Daily budget has been reset to 100%",
      timestamp: new Date(),
    });
  }

  /**
   * Send approval resolved notification.
   */
  async notifyApprovalResolved(
    approvalId: string,
    status: "approved" | "rejected",
    resolvedBy: string,
  ): Promise<boolean> {
    return this.notify({
      type: "approval_resolved",
      priority: "medium",
      title: `APPROVAL ${status.toUpperCase()}`,
      message: `Approval ${approvalId} was ${status} by ${resolvedBy}`,
      metadata: { approvalId, status, resolvedBy },
      timestamp: new Date(),
    });
  }

  // ==========================================================================
  // Channel Management
  // ==========================================================================

  /**
   * Get all channels.
   */
  getChannels(): NotificationChannel[] {
    return [...this.channels];
  }

  /**
   * Add a custom channel.
   */
  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  /**
   * Remove a channel by name.
   */
  removeChannel(name: string): boolean {
    const index = this.channels.findIndex((c) => c.name === name);
    if (index >= 0) {
      this.channels.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable terminal channel.
   */
  setTerminalEnabled(enabled: boolean): void {
    const terminal = this.channels.find((c) => c.name === "terminal");
    if (terminal && "setEnabled" in terminal) {
      (terminal as TerminalChannel).setEnabled(enabled);
    }
  }

  /**
   * Enable/disable file channel.
   */
  setFileEnabled(enabled: boolean): void {
    const file = this.channels.find((c) => c.name === "file");
    if (file && "setEnabled" in file) {
      (file as FileChannel).setEnabled(enabled);
    }
  }

  // ==========================================================================
  // History & Stats
  // ==========================================================================

  /**
   * Get notification history.
   */
  getHistory(): NotificationHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get notification statistics.
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Clear history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get configuration.
   */
  getConfig(): NotificationSystemConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<NotificationSystemConfig>): void {
    this.config = { ...this.config, ...updates };

    // Update channel states
    if (updates.terminalEnabled !== undefined) {
      this.setTerminalEnabled(updates.terminalEnabled);
    }
    if (updates.fileEnabled !== undefined) {
      this.setFileEnabled(updates.fileEnabled);
    }
  }

  /**
   * Get rate limiter.
   */
  getRateLimiter(): NotificationRateLimiter {
    return this.rateLimiter;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if priority meets threshold.
   */
  private meetsPriorityThreshold(priority: NotificationPriority): boolean {
    const levels: NotificationPriority[] = ["low", "medium", "high", "critical"];
    const eventLevel = levels.indexOf(priority);
    const minLevel = levels.indexOf(this.config.minPriority);
    return eventLevel >= minLevel;
  }

  /**
   * Record sent notification.
   */
  private recordSent(event: NotificationEvent, channels: string[]): void {
    const entry: NotificationHistoryEntry = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      event,
      channels,
      rateLimited: false,
      sentAt: new Date(),
    };

    this.history.push(entry);

    // Keep last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    // Update stats
    this.stats.totalSent++;
    this.stats.byType[event.type] = (this.stats.byType[event.type] ?? 0) + 1;
    this.stats.byPriority[event.priority] =
      (this.stats.byPriority[event.priority] ?? 0) + 1;
    this.stats.lastSentAt = new Date();
  }

  /**
   * Record rate limited notification.
   */
  private recordRateLimited(event: NotificationEvent): void {
    const entry: NotificationHistoryEntry = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      event,
      channels: [],
      rateLimited: true,
      sentAt: new Date(),
    };

    this.history.push(entry);

    // Keep last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    // Update stats
    this.stats.totalRateLimited++;
  }

  /**
   * Create empty stats.
   */
  private createEmptyStats(): NotificationStats {
    return {
      totalSent: 0,
      totalRateLimited: 0,
      byType: {} as Record<NotificationEventType, number>,
      byPriority: {} as Record<NotificationPriority, number>,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a notification system with shared rate limiter.
 */
export function createNotificationSystem(
  rateLimiter: NotificationRateLimiter,
  config?: Partial<NotificationSystemConfig>,
): NotificationSystem {
  return new NotificationSystem(rateLimiter, config);
}

/**
 * Get priority level as number (for comparison).
 */
export function getPriorityLevel(priority: NotificationPriority): number {
  const levels: NotificationPriority[] = ["low", "medium", "high", "critical"];
  return levels.indexOf(priority);
}

/**
 * Compare priorities.
 */
export function comparePriorities(
  a: NotificationPriority,
  b: NotificationPriority,
): number {
  return getPriorityLevel(a) - getPriorityLevel(b);
}

/**
 * Format notification for display.
 */
export function formatNotification(event: NotificationEvent): string {
  const icon = getNotificationIcon(event.type);
  return `${icon} [${event.priority.toUpperCase()}] ${event.title}: ${event.message}`;
}

/**
 * Get icon for notification type.
 */
export function getNotificationIcon(type: NotificationEventType): string {
  switch (type) {
    case "budget_warning":
      return "⚠️";
    case "budget_limit":
      return "🛑";
    case "approval_needed":
      return "📋";
    case "escalation":
      return "⬆️";
    case "daily_reset":
      return "🔄";
    case "model_switched":
      return "🔀";
    case "approval_resolved":
      return "✅";
    default:
      return "📢";
  }
}
