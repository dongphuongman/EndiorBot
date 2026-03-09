/**
 * Router Chat Gateway Methods — Sprint 93
 *
 * Thin passthrough to ChannelRouter pipeline. Returns full response
 * with metadata (agent, model, latencyMs) per R2.
 *
 * @module gateway/methods/router-chat
 * @version 1.0.0
 * @authority Sprint 93 Plan (R2)
 * @sprint 93
 */

import type { GatewayServer } from "../server.js";
import type { ChannelRouter } from "../../agents/channel-router.js";
import type { GoalDecomposer } from "../../autonomy/goal-decomposer.js";
import type { MultiAgentDispatcher } from "../../autonomy/multi-agent-dispatcher.js";

// ============================================================================
// Registration
// ============================================================================

/**
 * Register AI chat methods via ChannelRouter.
 *
 * Methods:
 * - router.chat — Send a message through the ChannelRouter AI pipeline
 * - router.status — Get current router status (providers, mode)
 */
export function registerRouterChatMethods(
  server: GatewayServer,
  router: ChannelRouter,
  goalDecomposer?: GoalDecomposer,
  multiAgentDispatcher?: MultiAgentDispatcher,
): void {
  /**
   * router.chat — Route message through AI pipeline.
   *
   * Params: { message: string }
   * Returns: { text, agent, model, latencyMs }
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

    const routeResult = await router.routeMessage(message);
    if (!routeResult) {
      return {
        text: router.getUsageHint(),
        agent: null,
        model: null,
        latencyMs: 0,
      };
    }

    // ── Sprint 95: Multi-agent routing ──
    if (
      goalDecomposer &&
      multiAgentDispatcher &&
      (routeResult.agents.length > 1 || goalDecomposer.shouldDecompose(routeResult.task))
    ) {
      const startMs = Date.now();
      const decomposition = goalDecomposer.decompose(routeResult.task, routeResult.agents);
      const aggregated = await multiAgentDispatcher.dispatch(decomposition, router);
      return {
        text: aggregated.text,
        agent: aggregated.agents.join(", "),
        model: "multi-agent",
        latencyMs: Date.now() - startMs,
      };
    }

    // ── Single-agent path (backward compatible) ──
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
