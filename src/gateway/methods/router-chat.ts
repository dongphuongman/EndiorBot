/**
 * Router Chat Gateway Methods — Sprint 93 + Sprint 99
 *
 * Sprint 99: Routes through GatewayIngress instead of ChannelRouter directly.
 * This enforces the architectural invariant: ALL interfaces → Ingress.
 * CTO MF-1: Returns metadata (agent, model, latencyMs) via InboundResponse.
 *
 * @module gateway/methods/router-chat
 * @version 2.0.0
 * @authority ADR-029 AD-4, Sprint 99
 * @sprint 99
 */

import type { GatewayServer } from "../server.js";
import type { ChannelRouter } from "../../agents/channel-router.js";
import type { GatewayIngress, InboundMessage } from "../ingress.js";
import { sanitize } from "../../security/input-sanitizer.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("gateway.router-chat");

// ============================================================================
// Registration
// ============================================================================

/**
 * Register AI chat methods via GatewayIngress.
 *
 * Sprint 99: Web → Ingress (same pipeline as Telegram).
 * Accepts optional `senderId` and `chatId` for per-chat workspace + history.
 *
 * Methods:
 * - router.chat — Send a message through GatewayIngress pipeline
 * - router.status — Get current router status (providers, mode)
 */
export function registerRouterChatMethods(
  server: GatewayServer,
  router: ChannelRouter,
  ingress?: GatewayIngress,
): void {
  /**
   * router.chat — Route message through Ingress pipeline.
   *
   * Params: { message: string, senderId?: string, chatId?: string }
   * Returns: { text, agent, model, latencyMs, format? }
   */
  server.registerMethod("router.chat", async (params: unknown) => {
    const p = (params ?? {}) as Record<string, unknown>;
    const message = String(p.message ?? "");

    if (!message.trim()) {
      return {
        text: "Empty message. " + router.getUsageHint(),
        agent: null,
        model: null,
        latencyMs: 0,
      };
    }

    // Sprint 99: Route through Ingress when available (architectural invariant)
    if (ingress) {
      const senderId = String(p.senderId ?? "web-anonymous");
      const chatId = p.chatId ? String(p.chatId) : `web-${senderId}`;

      const startMs = Date.now();
      // Sprint 116 T2: Sanitize web input before routing
      const { sanitized: safeContent, violations } = sanitize(message, "web");
      if (violations.length > 0) {
        log.warn("Input sanitization violations", { channel: "web", senderId, violations });
      }
      const msg: InboundMessage = {
        channel: "web",
        senderId,
        content: violations.length > 0 ? safeContent : message,
        metadata: { chatId },
      };

      const response = await ingress.handleInbound(msg);
      const latencyMs = Date.now() - startMs;

      return {
        text: response.text,
        agent: response.metadata?.agent ?? null,
        model: response.metadata?.model ?? null,
        latencyMs: response.metadata?.latencyMs ?? latencyMs,
        format: response.format ?? null,
      };
    }

    // Fallback: direct router call (backward compat when ingress not provided)
    const routeResult = await router.routeMessage(message);
    if (!routeResult) {
      return {
        text: router.getUsageHint(),
        agent: null,
        model: null,
        latencyMs: 0,
      };
    }

    const agent = routeResult.agents[0] ?? "assistant";
    const startMs = Date.now();
    const result = await router.callAI(agent, routeResult.task);

    return {
      text: router.formatResponse(agent, result),
      agent,
      model: result.provider,
      latencyMs: Date.now() - startMs,
    };
  });

  /**
   * router.status — Get router configuration and provider status.
   */
  server.registerMethod("router.status", async () => {
    return router.getStatus();
  });
}
