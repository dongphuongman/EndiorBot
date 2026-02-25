/**
 * Conversation Message Handler
 *
 * Routes CEO messages through intent parsing and action execution.
 * Sends replies back on the same channel.
 *
 * Per Sprint 46 Days 6-7 CTO direction:
 * - Parse intent from message
 * - Execute action based on intent
 * - Reply on same channel (no cross-channel replies)
 *
 * @module channels/conversation/message-handler
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 6-7
 * @authority CTO Review
 * @stage 04 - BUILD
 */

import { parseIntent, type ParsedIntent } from "./intents.js";
import { executeAction, type ActionContext, type ActionResult } from "./actions.js";
import type { BidirectionalChannel, IncomingMessage } from "../types.js";
import type { ApprovalQueue } from "../../budget/approval-queue.js";
import type { SessionManager } from "../../sessions/session-manager.js";
import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Message handler configuration.
 */
export interface MessageHandlerConfig {
  /** Approval queue for APPROVE/REJECT */
  approvalQueue?: ApprovalQueue;
  /** Session manager for STATUS */
  sessionManager?: SessionManager;
  /** Retry callback for TRY_DIFFERENT */
  onRetry?: (strategy?: string) => Promise<void>;
  /** Error store for SHOW_ERROR */
  errorStore?: ErrorStore;
  /** Whether to include debug info in replies */
  debugMode?: boolean;
}

/**
 * Error store interface.
 */
export interface ErrorStore {
  /** Get last error */
  getLastError(): Error | string | undefined;
  /** Set last error */
  setLastError(error: Error | string): void;
  /** Clear error */
  clearError(): void;
}

/**
 * Handler result including channel info.
 */
export interface HandleResult {
  /** Parsed intent */
  intent: ParsedIntent;
  /** Action result */
  actionResult: ActionResult;
  /** Reply sent successfully */
  replySent: boolean;
  /** Channel that received the message */
  sourceChannel: string;
}

// ============================================================================
// Simple Error Store
// ============================================================================

/**
 * Simple in-memory error store.
 */
export class SimpleErrorStore implements ErrorStore {
  private lastError: Error | string | null = null;

  getLastError(): Error | string | undefined {
    return this.lastError ?? undefined;
  }

  setLastError(error: Error | string): void {
    this.lastError = error;
  }

  clearError(): void {
    this.lastError = null;
  }
}

// ============================================================================
// Conversation Message Handler
// ============================================================================

/**
 * Handles CEO messages via bidirectional channels.
 *
 * Flow:
 * 1. Receive message from channel
 * 2. Parse intent (command first, NLP second)
 * 3. Execute action
 * 4. Reply on same channel
 */
export class ConversationMessageHandler {
  private readonly log: Logger;
  private readonly config: MessageHandlerConfig;
  private readonly errorStore: ErrorStore;
  private readonly channels: Map<string, BidirectionalChannel> = new Map();

  constructor(config: MessageHandlerConfig = {}) {
    this.log = createLogger("conversation-handler");
    this.config = config;
    this.errorStore = config.errorStore ?? new SimpleErrorStore();

    this.log.info("ConversationMessageHandler initialized", {
      hasApprovalQueue: !!config.approvalQueue,
      hasSessionManager: !!config.sessionManager,
      hasRetryCallback: !!config.onRetry,
      debugMode: !!config.debugMode,
    });
  }

  // ==========================================================================
  // Channel Management
  // ==========================================================================

  /**
   * Register a bidirectional channel.
   */
  registerChannel(channel: BidirectionalChannel): void {
    this.channels.set(channel.name, channel);

    // Wire up message handler
    channel.onMessage(async (message: IncomingMessage) => {
      await this.handleMessage(message, channel);
    });

    this.log.info("Channel registered", { channel: channel.name });
  }

  /**
   * Unregister a channel.
   */
  unregisterChannel(name: string): boolean {
    const channel = this.channels.get(name);
    if (channel) {
      channel.offMessage();
      this.channels.delete(name);
      this.log.info("Channel unregistered", { channel: name });
      return true;
    }
    return false;
  }

  /**
   * Get registered channel names.
   */
  getChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle an incoming message.
   *
   * @param message - Incoming message
   * @param channel - Source channel for reply
   * @returns Handle result
   */
  async handleMessage(
    message: IncomingMessage,
    channel: BidirectionalChannel,
  ): Promise<HandleResult> {
    const startTime = Date.now();

    this.log.info("Handling message", {
      channel: channel.name,
      messageId: message.messageId,
      contentLength: message.content.length,
    });

    // Step 1: Parse intent
    const intent = parseIntent(message.content);

    this.log.debug("Intent parsed", {
      intent: intent.intent,
      confidence: intent.confidence,
      method: intent.method,
      params: intent.params,
    });

    // Step 2: Build action context
    const context = this.buildActionContext();

    // Step 3: Execute action
    const actionResult = await executeAction(intent, context);

    this.log.debug("Action executed", {
      intent: intent.intent,
      success: actionResult.success,
      durationMs: Date.now() - startTime,
    });

    // Step 4: Reply on same channel
    const replySent = await this.sendReply(channel, actionResult, intent);

    const result: HandleResult = {
      intent,
      actionResult,
      replySent,
      sourceChannel: channel.name,
    };

    this.log.info("Message handled", {
      channel: channel.name,
      intent: intent.intent,
      success: actionResult.success,
      replySent,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Process a message manually (without channel context).
   * Useful for testing or direct integration.
   */
  async processMessage(content: string): Promise<{ intent: ParsedIntent; result: ActionResult }> {
    const intent = parseIntent(content);
    const context = this.buildActionContext();
    const result = await executeAction(intent, context);
    return { intent, result };
  }

  // ==========================================================================
  // Reply
  // ==========================================================================

  /**
   * Send reply on channel.
   */
  private async sendReply(
    channel: BidirectionalChannel,
    result: ActionResult,
    intent: ParsedIntent,
  ): Promise<boolean> {
    let replyText = result.message;

    // Add debug info if enabled
    if (this.config.debugMode) {
      replyText += `\n\n_[${intent.intent} | ${intent.method} | ${intent.confidence}]_`;
    }

    try {
      const sent = await channel.send(replyText);

      if (!sent) {
        this.log.warn("Reply send returned false", { channel: channel.name });
      }

      return sent;
    } catch (error) {
      this.log.error("Failed to send reply", {
        channel: channel.name,
        error: (error as Error).message,
      });
      return false;
    }
  }

  // ==========================================================================
  // Context Building
  // ==========================================================================

  /**
   * Build action context from config.
   */
  private buildActionContext(): ActionContext {
    const context: ActionContext = {};

    // Conditionally add properties (exactOptionalPropertyTypes)
    if (this.config.approvalQueue) {
      context.approvalQueue = this.config.approvalQueue;
    }
    if (this.config.sessionManager) {
      context.sessionManager = this.config.sessionManager;
    }
    const lastError = this.errorStore.getLastError();
    if (lastError !== undefined) {
      context.lastError = lastError;
    }
    if (this.config.onRetry) {
      context.onRetry = this.config.onRetry;
    }

    return context;
  }

  // ==========================================================================
  // Error Store Access
  // ==========================================================================

  /**
   * Set last error (for SHOW_ERROR intent).
   */
  setLastError(error: Error | string): void {
    this.errorStore.setLastError(error);
  }

  /**
   * Clear last error.
   */
  clearError(): void {
    this.errorStore.clearError();
  }

  /**
   * Get last error.
   */
  getLastError(): Error | string | undefined {
    return this.errorStore.getLastError();
  }

  // ==========================================================================
  // Configuration Update
  // ==========================================================================

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<MessageHandlerConfig>): void {
    if (updates.approvalQueue !== undefined) {
      this.config.approvalQueue = updates.approvalQueue;
    }
    if (updates.sessionManager !== undefined) {
      this.config.sessionManager = updates.sessionManager;
    }
    if (updates.onRetry !== undefined) {
      this.config.onRetry = updates.onRetry;
    }
    if (updates.debugMode !== undefined) {
      this.config.debugMode = updates.debugMode;
    }

    this.log.info("Config updated");
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const [name, channel] of this.channels) {
      channel.offMessage();
      this.log.debug("Disconnected channel", { channel: name });
    }
    this.channels.clear();
    this.errorStore.clearError();
    this.log.info("ConversationMessageHandler disposed");
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a conversation message handler.
 */
export function createMessageHandler(
  config?: MessageHandlerConfig,
): ConversationMessageHandler {
  return new ConversationMessageHandler(config);
}

/**
 * Singleton instance.
 */
let globalHandler: ConversationMessageHandler | undefined;

/**
 * Get global message handler.
 */
export function getMessageHandler(): ConversationMessageHandler {
  if (!globalHandler) {
    globalHandler = new ConversationMessageHandler();
  }
  return globalHandler;
}

/**
 * Reset global message handler.
 */
export function resetMessageHandler(): void {
  if (globalHandler) {
    globalHandler.dispose();
    globalHandler = undefined;
  }
}

/**
 * Configure global message handler.
 */
export function configureMessageHandler(config: MessageHandlerConfig): ConversationMessageHandler {
  if (globalHandler) {
    globalHandler.dispose();
  }
  globalHandler = new ConversationMessageHandler(config);
  return globalHandler;
}
