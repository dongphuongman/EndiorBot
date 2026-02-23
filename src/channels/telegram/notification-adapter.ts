/**
 * Telegram Channel Notification Adapter
 *
 * Adapts TelegramChannel (IChannel) to NotificationChannel interface
 * for integration with NotificationSystem.
 *
 * Per Sprint 38 Week 1 requirements:
 * - Bridge IChannel to NotificationChannel
 * - Map NotificationEvent to EscalationAlert
 * - Enable Telegram in NotificationSystem
 *
 * @module channels/telegram/notification-adapter
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Week 1
 * @authority Sprint 38 Plan - NotificationSystem Integration
 * @stage 04 - BUILD
 */

import type { TelegramChannel } from "./telegram-channel.js";
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationEventType,
} from "../../budget/notification-system.js";
import type { EscalationAlert, EscalationAlertType, AlertPriority } from "../types.js";

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Map NotificationEventType to EscalationAlertType.
 * Not all notification types have corresponding escalation types.
 */
const EVENT_TYPE_MAP: Partial<Record<NotificationEventType, EscalationAlertType>> = {
  budget_warning: "budget_warning",
  budget_limit: "budget_limit",
  approval_needed: "approval_needed",
  escalation: "escalation_3strike",
  // Note: daily_reset, model_switched, approval_resolved don't map to escalation types
};


// ============================================================================
// Telegram Channel Adapter
// ============================================================================

/**
 * Adapter to use TelegramChannel with NotificationSystem.
 *
 * Implements NotificationChannel interface to wrap TelegramChannel (IChannel).
 * Converts NotificationEvent to EscalationAlert format for Telegram.
 *
 * @example
 * ```typescript
 * const telegram = new TelegramChannel(config);
 * const adapter = new TelegramChannelAdapter(telegram);
 *
 * // Add to NotificationSystem
 * notificationSystem.addChannel(adapter);
 * ```
 */
export class TelegramChannelAdapter implements NotificationChannel {
  readonly name = "telegram";

  private channel: TelegramChannel;
  private enabled: boolean;
  private initialized: boolean = false;

  /**
   * Create a new TelegramChannelAdapter.
   *
   * @param channel - TelegramChannel instance to wrap
   * @param enabled - Initial enabled state (default: true)
   */
  constructor(channel: TelegramChannel, enabled: boolean = true) {
    this.channel = channel;
    this.enabled = enabled;
  }

  // ==========================================================================
  // NotificationChannel Interface
  // ==========================================================================

  /**
   * Check if channel is enabled.
   *
   * Note: This is synchronous per NotificationChannel interface.
   * Use checkAvailability() for async availability check.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable the channel.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Send a notification event via Telegram.
   *
   * Converts NotificationEvent to EscalationAlert if applicable,
   * otherwise sends as plain message.
   */
  async send(event: NotificationEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Check availability on first send
    if (!this.initialized) {
      const available = await this.channel.isAvailable();
      if (!available) {
        this.enabled = false;
        return;
      }
      this.initialized = true;
    }

    const escalationType = EVENT_TYPE_MAP[event.type];

    if (escalationType) {
      // Send as structured alert
      const alert = this.convertToAlert(event, escalationType);
      await this.channel.sendAlert(alert);
    } else {
      // Send as plain message for non-escalation events
      const message = this.formatAsMessage(event);
      await this.channel.send(message);
    }
  }

  // ==========================================================================
  // Async Availability Check
  // ==========================================================================

  /**
   * Check if Telegram channel is available.
   *
   * Unlike isEnabled(), this performs actual async availability check.
   */
  async checkAvailability(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    return this.channel.isAvailable();
  }

  // ==========================================================================
  // Conversion Methods
  // ==========================================================================

  /**
   * Convert NotificationEvent to EscalationAlert.
   */
  private convertToAlert(
    event: NotificationEvent,
    type: EscalationAlertType,
  ): EscalationAlert {
    const alert: EscalationAlert = {
      type,
      title: event.title,
      body: event.message,
      timestamp: event.timestamp,
      priority: event.priority as AlertPriority,
    };

    // Add metadata only if present (exactOptionalPropertyTypes)
    if (event.metadata) {
      alert.metadata = event.metadata;
    }

    // Extract approvalId from metadata if present
    if (event.metadata?.approvalId) {
      alert.approvalId = String(event.metadata.approvalId);
    }

    // Extract projectId from metadata if present
    if (event.metadata?.projectId) {
      alert.projectId = String(event.metadata.projectId);
    }

    // Add action hints for approval events
    if (type === "approval_needed" && alert.approvalId) {
      alert.actions = [
        `/approve ${alert.approvalId}`,
        `/reject ${alert.approvalId}`,
        `/status ${alert.approvalId}`,
      ];
    }

    return alert;
  }

  /**
   * Format event as plain message for non-escalation events.
   */
  private formatAsMessage(event: NotificationEvent): string {
    const icon = this.getEventIcon(event.type);
    const timestamp = event.timestamp.toLocaleTimeString();

    let message = `${icon} *${event.title}*\n`;
    message += `_${timestamp}_\n\n`;
    message += event.message;

    return message;
  }

  /**
   * Get emoji icon for event type.
   */
  private getEventIcon(type: NotificationEventType): string {
    switch (type) {
      case "budget_warning":
        return "⚠️";
      case "budget_limit":
        return "🔴";
      case "approval_needed":
        return "⏳";
      case "escalation":
        return "🚨";
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

  // ==========================================================================
  // Access to Underlying Channel
  // ==========================================================================

  /**
   * Get the underlying TelegramChannel.
   *
   * Useful for setting up polling or approval queue.
   */
  getChannel(): TelegramChannel {
    return this.channel;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a TelegramChannelAdapter from TelegramChannel.
 */
export function createTelegramAdapter(
  channel: TelegramChannel,
  enabled?: boolean,
): TelegramChannelAdapter {
  return new TelegramChannelAdapter(channel, enabled);
}

/**
 * Check if an event type should be sent to Telegram.
 *
 * Critical and high priority events, or escalation types, should go to Telegram.
 */
export function shouldSendToTelegram(event: NotificationEvent): boolean {
  // Critical events always go to Telegram
  if (event.priority === "critical") {
    return true;
  }

  // High priority escalation events
  if (event.priority === "high" && EVENT_TYPE_MAP[event.type]) {
    return true;
  }

  // Approval events always notify CEO
  if (event.type === "approval_needed") {
    return true;
  }

  return false;
}
