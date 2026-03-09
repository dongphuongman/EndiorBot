/**
 * Gateway Ingress — Single entry point for all inbound messages.
 *
 * OTT adapters call handleInbound(), never dispatch directly.
 * This ensures Gateway is the SSOT (B3 fix).
 *
 * Auth for sensitive commands is unified here (Final Synthesis Fix #2):
 * both WebSocket and OTT ingress paths go through the same check.
 *
 * @module gateway/ingress
 * @version 1.0.0
 * @authority Sprint 93 Plan (B3)
 * @sprint 93
 */

import type { CommandDispatcher, CommandContext } from "../commands/command-dispatcher.js";
import type { ChannelRouter } from "../agents/channel-router.js";
import type { ChannelPolicyEngine } from "../policy/channel-policy-engine.js";
import type { ChannelSource } from "../protocol/types.js";
import type { GoalDecomposer } from "../autonomy/goal-decomposer.js";
import type { MultiAgentDispatcher } from "../autonomy/multi-agent-dispatcher.js";

// ============================================================================
// Types
// ============================================================================

export interface InboundMessage {
  /** Source channel identifier */
  channel: string;
  /** Sender ID (channel-specific user ID) */
  senderId: string;
  /** Message content (text) */
  content: string;
  /** Optional vendor-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface InboundResponse {
  /** Response text */
  text: string;
  /** Preferred format (adapters can override per vendor) */
  format?: "markdown" | "plain" | "html";
  /** Optional inline keyboard / button data */
  replyMarkup?: unknown;
}

// ============================================================================
// GatewayIngress
// ============================================================================

export class GatewayIngress {
  private readonly policyEngine: ChannelPolicyEngine | undefined;
  private readonly goalDecomposer: GoalDecomposer | undefined;
  private readonly multiAgentDispatcher: MultiAgentDispatcher | undefined;

  constructor(
    private readonly dispatcher: CommandDispatcher,
    private readonly router: ChannelRouter,
    policyEngine?: ChannelPolicyEngine,
    goalDecomposer?: GoalDecomposer,
    multiAgentDispatcher?: MultiAgentDispatcher,
  ) {
    this.policyEngine = policyEngine;
    this.goalDecomposer = goalDecomposer;
    this.multiAgentDispatcher = multiAgentDispatcher;
  }

  /**
   * Handle an inbound message from any channel.
   *
   * Flow:
   * 1. If starts with `/` → try CommandDispatcher
   *    - Found → return result
   *    - NOT found → return "Unknown command" error (Fix #1: no fall-through to chat)
   * 2. Otherwise → route through ChannelRouter (AI chat)
   */
  async handleInbound(msg: InboundMessage): Promise<InboundResponse> {
    const text = msg.content.trim();

    // ── Sprint 94 F3: Policy pre-check ──
    if (this.policyEngine) {
      const channel = msg.channel as ChannelSource;
      const scope = text.startsWith("/") ? "command" : "message";
      const policyResult = this.policyEngine.check(channel, msg.senderId, scope);
      if (!policyResult.allowed) {
        return { text: policyResult.reason ?? "Rate limit exceeded. Please try again later." };
      }
      const contentCheck = this.policyEngine.checkContentLength(channel, text.length);
      if (!contentCheck.allowed) {
        return { text: contentCheck.reason ?? "Message too long." };
      }
    }

    // ── Command dispatch ──
    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const firstPart = parts[0] ?? "";
      // Strip @botname suffix (Telegram sends "/link@Endior_bot")
      const cmdName = (firstPart.toLowerCase().split("@")[0] ?? "").slice(1);
      const args = parts.slice(1);

      if (!cmdName) {
        return { text: "Empty command. Type /help for available commands." };
      }

      // Fix #1: Unknown command → return error, NOT fall through to chat
      if (!this.dispatcher.has(cmdName)) {
        return {
          text: `Unknown command: /${cmdName}. Type /help for available commands.`,
        };
      }

      // Fix #2: Auth check for sensitive commands (unified for WebSocket + OTT)
      // OTT adapters pass senderId which maps to userId in CommandContext
      const ctx: CommandContext = {
        userId: msg.senderId,
        args,
        channel: msg.channel,
      };
      const chatIdVal = msg.metadata?.chatId ? String(msg.metadata.chatId) : undefined;
      if (chatIdVal) ctx.chatId = chatIdVal;
      if (msg.metadata) ctx.rawMessage = msg.metadata;

      const result = await this.dispatcher.dispatch(cmdName, ctx);

      if (!result) {
        return { text: `Command /${cmdName} failed unexpectedly.` };
      }

      const response: InboundResponse = { text: result.response };
      if (result.format) response.format = result.format;
      if (result.replyMarkup) response.replyMarkup = result.replyMarkup;
      return response;
    }

    // ── AI chat via ChannelRouter ──
    const routeResult = await this.router.routeMessage(text);
    if (!routeResult) {
      return { text: this.router.getUsageHint() };
    }

    // ── Sprint 95: Multi-agent routing ──
    // When multiple agents detected OR GoalDecomposer identifies multi-agent need,
    // route through the autonomy pipeline. Single-agent path remains unchanged.
    if (
      this.goalDecomposer &&
      this.multiAgentDispatcher &&
      (routeResult.agents.length > 1 || this.goalDecomposer.shouldDecompose(routeResult.task))
    ) {
      const decomposition = this.goalDecomposer.decompose(
        routeResult.task,
        routeResult.agents,
      );
      const aggregated = await this.multiAgentDispatcher.dispatch(decomposition, this.router);
      const response: InboundResponse = { text: aggregated.text };
      if (aggregated.format) response.format = aggregated.format;
      return response;
    }

    // ── Single-agent path (backward compatible) ──
    const agent = routeResult.agents[0] ?? "assistant";
    const result = await this.router.callAI(agent, routeResult.task);

    return {
      text: this.router.formatResponse(agent, result),
      format: "markdown" as const,
    };
  }
}
