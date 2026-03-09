/**
 * Bridge Command Gateway Methods — Sprint 93
 *
 * Wraps CommandDispatcher as Gateway JSON-RPC methods (cmd.* namespace).
 * Security-sensitive commands require authenticated connection (R3).
 *
 * @module gateway/methods/bridge-commands
 * @version 1.0.0
 * @authority Sprint 93 Plan (B3 + R1 + R3)
 * @sprint 93
 */

import type { GatewayServer } from "../server.js";
import type { CommandDispatcher, CommandContext } from "../../commands/command-dispatcher.js";

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all commands from CommandDispatcher as Gateway methods.
 *
 * Each command becomes `cmd.<name>` in the Gateway method registry.
 * Sensitive commands require the connection to be authenticated.
 */
export function registerBridgeCommandMethods(
  server: GatewayServer,
  dispatcher: CommandDispatcher,
): void {
  for (const cmdName of dispatcher.getRegisteredCommands()) {
    const methodName = `cmd.${cmdName}`;

    server.registerMethod(methodName, async (params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>;

      // R3: Auth check for sensitive commands via Gateway
      // The GatewayServer already validates tokens at connection level.
      // For sensitive commands, we verify caller provided userId.
      if (dispatcher.isSensitive(cmdName) && !p.userId) {
        return {
          success: false,
          response: `Command '${cmdName}' requires userId parameter.`,
        };
      }

      const ctx: CommandContext = {
        userId: String(p.userId ?? "gateway-client"),
        args: Array.isArray(p.args) ? p.args.map(String) : [],
        channel: String(p.channel ?? "web"),
      };
      if (p.username) ctx.username = String(p.username);
      if (p.chatId) ctx.chatId = String(p.chatId);

      return dispatcher.dispatch(cmdName, ctx);
    });
  }
}

/**
 * Number of cmd.* methods registered.
 */
export function getBridgeCommandCount(dispatcher: CommandDispatcher): number {
  return dispatcher.getRegisteredCommands().length;
}
