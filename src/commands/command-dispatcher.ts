/**
 * Command Dispatcher — Central command registry for all interfaces.
 *
 * Maps command names → handler functions. Used by Gateway methods (WebSocket)
 * and GatewayIngress (OTT adapters). Single source of truth for command routing.
 *
 * Pattern aligns with MTClaw Channel.HandleMessage() flow (ADR-002).
 *
 * @module commands/command-dispatcher
 * @version 1.0.0
 * @authority ADR-024 + Sprint 93 Plan
 * @sprint 93
 */

// ============================================================================
// Types
// ============================================================================

export interface CommandResult {
  success: boolean;
  response: string;
  format?: "markdown" | "plain";
  /** Optional inline keyboard data (Telegram-specific, adapters use if supported) */
  replyMarkup?: unknown;
}

export interface CommandContext {
  /** Raw channel user ID (e.g. Telegram user ID) */
  userId: string;
  /** Display name / username */
  username?: string;
  /** Command arguments (words after the command name) */
  args: string[];
  /** Source channel */
  channel: string;
  /** Chat/conversation ID (for remote commands) */
  chatId?: string;
  /** Vendor-specific raw message data */
  rawMessage?: unknown;
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>;

/** Commands that require identity linking (actorId) before use */
const LINKED_COMMANDS = new Set([
  "launch", "sessions", "switch", "capture", "kill", "kill-team",
  "send", "eval", "team-status",
  "focus", "cp", "sh", "attach", "run",
  "approve", "reject",
]);

/** Security-sensitive commands that require elevated auth via Gateway */
export const SENSITIVE_COMMANDS = new Set([
  "launch", "kill", "kill-team", "link",
  "sh", "run", "cp", "attach",
  "approve",
]);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Require a linked actorId for bridge commands (CTO F3).
 * Calls getLinkedActorId() and returns error if not linked.
 */
export function requireLinkedActor(
  ctx: CommandContext,
  getLinkedActorId: (userId: string) => string | null,
): { actorId: string } | CommandResult {
  const actorId = getLinkedActorId(ctx.userId);
  if (!actorId) {
    return {
      success: false,
      response: "Not linked. Use /link first to bind your identity.",
    };
  }
  return { actorId };
}

// ============================================================================
// CommandDispatcher
// ============================================================================

export class CommandDispatcher {
  private readonly handlers = new Map<string, CommandHandler>();

  /**
   * Register a command handler.
   */
  register(name: string, handler: CommandHandler): void {
    this.handlers.set(name.toLowerCase(), handler);
  }

  /**
   * Dispatch a command by name. Returns null if command not found.
   */
  async dispatch(name: string, ctx: CommandContext): Promise<CommandResult | null> {
    const handler = this.handlers.get(name.toLowerCase());
    if (!handler) return null;
    return handler(ctx);
  }

  /**
   * Check if a command is registered.
   */
  has(name: string): boolean {
    return this.handlers.has(name.toLowerCase());
  }

  /**
   * Check if a command requires identity linking.
   */
  requiresLink(name: string): boolean {
    return LINKED_COMMANDS.has(name.toLowerCase());
  }

  /**
   * Check if a command is security-sensitive.
   */
  isSensitive(name: string): boolean {
    return SENSITIVE_COMMANDS.has(name.toLowerCase());
  }

  /**
   * Get list of all registered command names.
   */
  getRegisteredCommands(): string[] {
    return [...this.handlers.keys()];
  }
}
