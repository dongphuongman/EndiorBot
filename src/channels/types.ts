/**
 * Channel Types
 *
 * Core interfaces for notification channels.
 * Defines IChannel interface and EscalationAlert type.
 *
 * Per Sprint 38 Week 1 requirements:
 * - Channel abstraction for OTT (Telegram first)
 * - EscalationAlert for budget/approval/escalation events
 * - CEO reachable anywhere via mobile
 *
 * @module channels/types
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Week 1
 * @authority Sprint 38 Plan - OTT Escalation
 * @stage 04 - BUILD
 */

// ============================================================================
// Escalation Alert Types
// ============================================================================

/**
 * Types of escalation alerts that can be sent via channels.
 */
export type EscalationAlertType =
  | "budget_warning"      // Budget threshold warning (e.g., 80%)
  | "budget_limit"        // Budget limit reached (100%)
  | "approval_needed"     // Awaiting CEO approval for action
  | "escalation_3strike"  // Three strikes - session paused
  | "gate_failed";        // SDLC gate validation failed

/**
 * Priority levels for escalation alerts.
 */
export type AlertPriority = "low" | "medium" | "high" | "critical";

/**
 * Escalation alert sent via notification channels.
 */
export interface EscalationAlert {
  /** Type of escalation */
  type: EscalationAlertType;
  /** Alert title (short, for notification header) */
  title: string;
  /** Alert body (detailed description) */
  body: string;
  /** Approval ID if this requires approval */
  approvalId?: string;
  /** Project ID context */
  projectId?: string;
  /** When the alert was generated */
  timestamp: Date;
  /** Alert priority */
  priority: AlertPriority;
  /** Optional action buttons/commands hint */
  actions?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Channel Interface
// ============================================================================

/**
 * Channel interface for sending notifications.
 *
 * Implementations:
 * - TerminalChannel (existing)
 * - FileChannel (existing)
 * - TelegramChannel (Sprint 38)
 * - Future: ZaloChannel (Sprint 46)
 */
export interface IChannel {
  /** Channel name (e.g., "telegram", "terminal", "file") */
  readonly name: string;

  /**
   * Send a plain text message.
   * @param message - Message to send
   * @returns true if sent successfully
   */
  send(message: string): Promise<boolean>;

  /**
   * Send a structured escalation alert.
   * @param alert - EscalationAlert to send
   * @returns true if sent successfully
   */
  sendAlert(alert: EscalationAlert): Promise<boolean>;

  /**
   * Check if the channel is available and configured.
   * @returns true if channel can send messages
   */
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Bidirectional Channel Interface (Sprint 46)
// ============================================================================

/**
 * Incoming message from a bidirectional channel.
 */
export interface IncomingMessage {
  /** Unique message ID from source */
  messageId: string;
  /** Sender ID (user/chat) */
  senderId: string;
  /** Message content */
  content: string;
  /** When message was received */
  receivedAt: Date;
  /** Optional reply-to message ID */
  replyTo?: string;
  /** Optional sender display name */
  senderName?: string;
  /** Optional metadata from source */
  metadata?: Record<string, unknown>;
}

/**
 * Message handler for bidirectional channels.
 */
export type IncomingMessageHandler = (message: IncomingMessage) => Promise<void>;

/**
 * Bidirectional channel interface for two-way communication.
 *
 * Extends IChannel with receive capabilities:
 * - Poll-based: receive() for manual polling
 * - Event-based: onMessage() for push notifications
 * - Lifecycle: start()/stop() for connection management
 *
 * Per Sprint 46 Days 4-5 CTO direction:
 * - Telegram first, then Zalo
 * - Wire through OTTMessageRouter for security
 */
export interface BidirectionalChannel extends IChannel {
  /**
   * Poll for incoming messages.
   * @returns Array of received messages since last poll
   */
  receive(): Promise<IncomingMessage[]>;

  /**
   * Register handler for incoming messages.
   * @param handler - Function to handle incoming messages
   */
  onMessage(handler: IncomingMessageHandler): void;

  /**
   * Remove registered message handler.
   */
  offMessage(): void;

  /**
   * Start receiving messages (connect/start polling).
   */
  start(): Promise<void>;

  /**
   * Stop receiving messages (disconnect/stop polling).
   */
  stop(): Promise<void>;

  /**
   * Check if channel is actively receiving messages.
   */
  isReceiving(): boolean;
}

/**
 * Type guard for bidirectional channels.
 */
export function isBidirectionalChannel(channel: IChannel): channel is BidirectionalChannel {
  return (
    'receive' in channel &&
    'onMessage' in channel &&
    'start' in channel &&
    'stop' in channel &&
    'isReceiving' in channel
  );
}

// ============================================================================
// Channel Configuration
// ============================================================================

/**
 * Base channel configuration.
 */
export interface ChannelConfig {
  /** Enable/disable the channel */
  enabled: boolean;
  /** Channel-specific options */
  options?: Record<string, unknown>;
}

/**
 * Notification channels configuration.
 */
export interface NotificationChannelsConfig {
  /** Terminal output (always enabled as fallback) */
  terminal?: ChannelConfig;
  /** File logging */
  file?: ChannelConfig & {
    path?: string;
  };
  /** Telegram bot */
  telegram?: ChannelConfig & {
    botToken?: string;
    chatId?: string;
  };
}

// ============================================================================
// Channel Registry Types
// ============================================================================

/**
 * Registered channel entry.
 */
export interface RegisteredChannel {
  /** Channel instance */
  channel: IChannel;
  /** Channel priority (lower = higher priority) */
  priority: number;
  /** Alert types this channel handles (empty = all) */
  alertTypes?: EscalationAlertType[];
}

/**
 * Channel registry for managing multiple channels.
 */
export interface IChannelRegistry {
  /** Register a channel */
  register(channel: IChannel, priority?: number): void;

  /** Unregister a channel by name */
  unregister(name: string): boolean;

  /** Get all registered channels */
  getChannels(): RegisteredChannel[];

  /** Get a specific channel by name */
  getChannel(name: string): IChannel | undefined;

  /** Send alert to all available channels */
  broadcast(alert: EscalationAlert): Promise<Map<string, boolean>>;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format an EscalationAlert for display.
 */
export function formatAlert(alert: EscalationAlert): string {
  const emoji = getAlertEmoji(alert.type);
  const priority = getPriorityIndicator(alert.priority);

  let text = `${emoji} ${priority} ${alert.title}\n`;
  text += `${alert.body}\n`;

  if (alert.approvalId) {
    text += `\nID: ${alert.approvalId}`;
  }

  if (alert.projectId) {
    text += `\nProject: ${alert.projectId}`;
  }

  if (alert.actions && alert.actions.length > 0) {
    text += `\n\nActions:\n${alert.actions.map(a => `  ${a}`).join("\n")}`;
  }

  return text;
}

/**
 * Get emoji for alert type.
 */
export function getAlertEmoji(type: EscalationAlertType): string {
  switch (type) {
    case "budget_warning":
      return "⚠️";
    case "budget_limit":
      return "🔴";
    case "approval_needed":
      return "⏳";
    case "escalation_3strike":
      return "🚨";
    case "gate_failed":
      return "❌";
    default:
      return "📢";
  }
}

/**
 * Get priority indicator.
 */
export function getPriorityIndicator(priority: AlertPriority): string {
  switch (priority) {
    case "critical":
      return "[CRITICAL]";
    case "high":
      return "[HIGH]";
    case "medium":
      return "";
    case "low":
      return "[LOW]";
    default:
      return "";
  }
}

/**
 * Format alert for Markdown (Telegram).
 */
export function formatAlertMarkdown(alert: EscalationAlert): string {
  const emoji = getAlertEmoji(alert.type);
  const priority = getPriorityIndicator(alert.priority);

  let text = `${emoji} *${alert.title}*`;
  if (priority) {
    text += ` ${priority}`;
  }
  text += "\n\n";
  text += alert.body;

  if (alert.approvalId) {
    text += `\n\nID: \`${alert.approvalId}\``;
  }

  if (alert.projectId) {
    text += `\nProject: \`${alert.projectId}\``;
  }

  if (alert.actions && alert.actions.length > 0) {
    text += "\n\n" + alert.actions.join("\n");
  }

  return text;
}
