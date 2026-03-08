#!/usr/bin/env node
/**
 * Web Gateway Script — HTTP + WebSocket Channel
 *
 * Same architecture as telegram-poll.mjs, different interface:
 * - ROUTER: Local Ollama qwen3.5:9b (think:false, ~2s, zero cost)
 * - PRIMARY: Claude Code Bridge (Max 200 Plan subscription)
 * - FALLBACK: Gemini/OpenAI (when Claude Code unavailable)
 * - LAST FALLBACK: Remote Ollama qwen3-coder:30b
 *
 * Usage: node scripts/web-gateway.mjs
 * Open: http://127.0.0.1:18791
 */

import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load env
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: true });

// Import from dist
const { createWebGatewayServer } = await import(join(root, "dist/gateway/web-server.js"));
const { createChannelRouter } = await import(join(root, "dist/agents/channel-router.js"));

// ============================================================================
// Initialize Channel Router (same flow as telegram-poll.mjs)
// ============================================================================

console.log("[WebGateway] Initializing Channel Router...");

const router = createChannelRouter({
  projectRoot: root,
  verbose: false,
});

const status = await router.initialize();

console.log(`[WebGateway] Router: ${status.router}`);
console.log(`[WebGateway] Primary: ${status.primary}`);
console.log(`[WebGateway] Fallback: ${status.fallback}`);
console.log(`[WebGateway] Last: ${status.last}`);

// ============================================================================
// Create Web Gateway Server
// ============================================================================

const port = parseInt(process.env.ENDIORBOT_GATEWAY_PORT || "18791", 10);

const server = createWebGatewayServer({
  port,
  host: "127.0.0.1",
  authEnabled: false,
});

// Override the built-in echo chat method with real AI routing
server.registerMethod("chat", async (params) => {
  const { message } = params;

  if (!message || typeof message !== "string" || message.trim() === "") {
    throw new Error("message is required");
  }

  // Route message to find agent + task
  const routeResult = await router.routeMessage(message);

  if (!routeResult || routeResult.agents.length === 0) {
    // No agent mentioned — use assistant as default
    const result = await router.callAI("assistant", message);
    console.log(`[WebGateway] @assistant via ${result.provider} in ${result.durationMs}ms`);
    return {
      text: result.content,
      provider: result.provider,
      durationMs: result.durationMs,
      agent: "assistant",
    };
  }

  const { agents, task } = routeResult;
  const primaryAgent = agents[0];

  try {
    const result = await router.callAI(primaryAgent, task);
    console.log(`[WebGateway] @${primaryAgent} via ${result.provider} in ${result.durationMs}ms (${result.content.length} chars)`);

    // If multiple agents mentioned, call them all
    const responses = [{ agent: primaryAgent, ...result }];

    for (let i = 1; i < agents.length; i++) {
      try {
        const out = await router.callAI(agents[i], task);
        console.log(`[WebGateway] @${agents[i]} via ${out.provider} in ${out.durationMs}ms`);
        responses.push({ agent: agents[i], ...out });
      } catch (e) {
        responses.push({
          agent: agents[i],
          content: `Error: ${e.message}`,
          provider: "error",
          durationMs: 0,
        });
      }
    }

    // Format combined response
    const combined = responses
      .map((r) => router.formatResponse(r.agent, r))
      .join("\n\n---\n\n");

    return {
      text: combined,
      provider: result.provider,
      durationMs: result.durationMs,
      agent: primaryAgent,
      agents: agents,
    };
  } catch (e) {
    throw new Error(`AI error for @${primaryAgent}: ${e.message}`);
  }
});

// Add router status method
server.registerMethod("system.router", () => router.getStatus());

// ============================================================================
// Start Server
// ============================================================================

await server.start();

console.log("");
console.log(`[WebGateway] ✓ Web Gateway started`);
console.log(`[WebGateway]   HTTP: http://127.0.0.1:${port}`);
console.log(`[WebGateway]   WS:   ws://127.0.0.1:${port}/ws`);
console.log(`[WebGateway]   Press Ctrl+C to stop`);
console.log("");

process.on("SIGINT", async () => {
  console.log("\n[WebGateway] Stopping...");
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[WebGateway] Stopping...");
  await server.stop();
  process.exit(0);
});
