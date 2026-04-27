/**
 * Serve Command — Unified EndiorBot Startup
 *
 * Single command to start everything:
 * 1. ChannelRouter (AI routing SSOT)
 * 2. CommandDispatcher (central command registry)
 * 3. Gateway Ingress (single entry point)
 * 4. Gateway Server (WebSocket + HTTP on :18790)
 * 5. OTT Adapters (Telegram, Zalo)
 *
 * Fix B1: Named `serve` to avoid collision with existing `start` (project init).
 * Fix B2: Old scripts remain functional — this is the NEW unified path.
 * Fix R5: Error boundary per component — one adapter crash doesn't kill process.
 * Fix R6: Graceful shutdown in reverse order, 5s per component, 20s max.
 *
 * @module cli/commands/serve
 * @version 1.0.0
 * @authority Sprint 93 Plan (B1 + R5 + R6)
 * @sprint 93
 */

import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import {
  createGatewayServer,
  setGatewayServer,
} from "../../gateway/index.js";
import { registerAllMethods } from "../../gateway/methods/index.js";
import { GatewayIngress } from "../../gateway/ingress.js";
import { createCommandDispatcher } from "../../commands/index.js";
import { createChannelRouter } from "../../agents/channel-router.js";
import { createTelegramOttAdapter } from "../../channels/telegram/telegram-ott-adapter.js";
import { createZaloOttAdapter } from "../../channels/zalo/zalo-ott-adapter.js";
import { initializeProvidersFromEnv } from "../../providers/init.js";
import { ChannelPolicyEngine } from "../../policy/channel-policy-engine.js";
import { collectHealthReport } from "../../monitoring/metrics.js";
import { GoalDecomposer } from "../../autonomy/goal-decomposer.js";
import { MultiAgentDispatcher } from "../../autonomy/multi-agent-dispatcher.js";
// Sprint 106 (ADR-032): Event Bus Foundation
// Sprint 107 (ADR-032): Bus Reliability — Debounce + Dedup
import { getMessageBus, resetMessageBus } from "../../bus/message-bus.js";
import { BusConsumer } from "../../bus/consumer.js";
import { BusDebounce } from "../../bus/debounce.js";
import { BusDedup } from "../../bus/dedup.js";
// Sprint 110.5 (ADR-033): RL Feedback Service — CEO 👍/🔄/👎 keyboard
import { RLFeedbackService } from "../../rl/feedback-service.js";
// Sprint 113 (ADR-034): Cross-System Agent Communication — EndiorBot ↔ MCP Gateway
import { McpGatewayBridge } from "../../mcp-gateway/bridge.js";
import { loadMcpGatewayConfig } from "../../mcp-gateway/config.js";
// Sprint 116 T4: Env validation at startup
import { validateServeEnv, checkProviderKeys } from "../../config/env-schema.js";

// ============================================================================
// Terminal Colors
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

// ============================================================================
// Types
// ============================================================================

export interface ServeOptions {
  port?: string;
  noTelegram?: boolean;
  noZalo?: boolean;
  force?: boolean;
}

interface Component {
  name: string;
  stop: () => Promise<void>;
}

// ============================================================================
// PID Lockfile (Sprint 144 T1)
// ============================================================================

function getPidLockPath(): string {
  const base = process.env["ENDIORBOT_STATE_DIR"] ?? join(homedir(), ".endiorbot");
  return join(base, "serve.pid");
}

/**
 * Check if another serve process is running. If so, exit or force-kill.
 * Returns true if lock was acquired, false if should exit.
 */
function acquirePidLock(force: boolean): boolean {
  const lockPath = getPidLockPath();
  const dir = dirname(lockPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(lockPath)) {
    const existingPid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (!isNaN(existingPid)) {
      // Check if process is alive
      try {
        process.kill(existingPid, 0); // signal 0 = check existence
        // Process alive
        if (force) {
          console.log(yellow(`  ⚠️  Killing existing serve process (PID ${existingPid})...`));
          try { process.kill(existingPid, "SIGTERM"); } catch { /* already dead */ }
          // Give it 2s to exit gracefully
          const start = Date.now();
          while (Date.now() - start < 2000) {
            try { process.kill(existingPid, 0); } catch { break; }
          }
        } else {
          console.error(red(`\n  ❌ EndiorBot already running (PID ${existingPid}).`));
          console.error(red(`     Use --force to kill existing + take over.\n`));
          return false;
        }
      } catch {
        // Process dead — stale lockfile, clean up
      }
    }
    // Remove stale/killed lockfile
    try { unlinkSync(lockPath); } catch { /* ignore */ }
  }

  // Write our PID
  writeFileSync(lockPath, String(process.pid), { encoding: "utf-8", mode: 0o600 });
  return true;
}

function releasePidLock(): void {
  const lockPath = getPidLockPath();
  try {
    // Only delete if it's OUR pid (avoid race)
    if (existsSync(lockPath)) {
      const stored = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
      if (stored === process.pid) {
        unlinkSync(lockPath);
      }
    }
  } catch { /* best-effort */ }
}

// ============================================================================
// Action
// ============================================================================

/**
 * Serve action — start all components in a single process.
 *
 * Startup order (Fix #3: session-dependent components last):
 * 1. PID lockfile (Sprint 144: singleton enforcement)
 * 2. AI providers (needed by ChannelRouter)
 * 3. ChannelRouter (AI routing SSOT)
 * 4. CommandDispatcher (central command registry)
 * 5. GatewayIngress (single entry point — wires dispatcher + router)
 * 6. Gateway Server (WebSocket + HTTP — registers all methods)
 * 7. OTT Adapters (Telegram, Zalo — each with error boundary)
 */
async function serveAction(options: ServeOptions): Promise<void> {
  const components: Component[] = [];

  // Sprint 144 T1: Singleton serve enforcement via PID lockfile
  if (!acquirePidLock(!!options.force)) {
    process.exit(1);
  }
  // Release on exit (normal, SIGTERM, SIGINT)
  const cleanupLock = (): void => { releasePidLock(); };
  process.on("exit", cleanupLock);
  process.on("SIGTERM", () => { cleanupLock(); process.exit(0); });
  process.on("SIGINT", () => { cleanupLock(); process.exit(0); });

  // Sprint 116 T4: Validate env vars at startup (fail-fast)
  try {
    const env = validateServeEnv();
    const providerWarning = checkProviderKeys(env);
    if (providerWarning) {
      console.log(yellow(`  Warning: ${providerWarning}`));
    }
  } catch (err) {
    console.error(red(`Environment Error: ${(err as Error).message}`));
    process.exit(1);
  }

  // Sprint 144: Port resolution order: --port flag → ENDIORBOT_GATEWAY_PORT env → 18790 default
  // Must match resolveGatewayConfig() so the log message shows the actual port.
  const envPort = process.env["ENDIORBOT_GATEWAY_PORT"];
  const port = options.port
    ? parseInt(options.port, 10)
    : envPort
      ? parseInt(envPort, 10)
      : 18790;

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(red("Error: Invalid port number"));
    process.exit(1);
  }

  console.log("");
  console.log(bold("═══════════════════════════════════════════════════════════════"));
  console.log(bold("  EndiorBot — Unified Serve"));
  console.log(bold("═══════════════════════════════════════════════════════════════"));
  console.log("");

  try {
    // 1. AI providers
    console.log(dim("  Initializing AI providers..."));
    const providerCount = await initializeProvidersFromEnv();
    if (providerCount === 0) {
      console.log(yellow("  Warning: No AI providers configured — chat will not work"));
    } else {
      console.log(green(`  ${providerCount} AI provider(s) ready`));
    }

    // 1.5 MCP Gateway Bridge — optional cross-system agent communication (Sprint 113, ADR-034)
    let mcpGatewayBridge: McpGatewayBridge | undefined;
    try {
      const mcpConfig = loadMcpGatewayConfig();
      if (mcpConfig) {
        mcpGatewayBridge = new McpGatewayBridge(mcpConfig);
        await mcpGatewayBridge.connect();
        components.push({ name: "McpGatewayBridge", stop: async () => { await mcpGatewayBridge!.disconnect(); } });
        console.log(green("  MCP Gateway Bridge ready"));
      } else {
        console.log(dim("  MCP Gateway Bridge: not configured (skipped)"));
      }
    } catch (e) {
      console.log(yellow(`  MCP Gateway Bridge: ${(e as Error).message} (skipped)`));
    }

    // 2. ChannelRouter (AI routing SSOT)
    console.log(dim("  Initializing ChannelRouter..."));
    // CTO C4: exactOptionalPropertyTypes — only pass mcpGatewayBridge if defined
    const routerConfig: Partial<import("../../agents/channel-router.js").ChannelRouterConfig> = {};
    if (mcpGatewayBridge) routerConfig.mcpGatewayBridge = mcpGatewayBridge;
    const router = createChannelRouter(routerConfig);
    await router.initialize();
    console.log(green("  ChannelRouter ready"));

    // 3. CommandDispatcher (central command registry)
    const dispatcher = createCommandDispatcher();
    const cmdCount = dispatcher.getRegisteredCommands().length;
    console.log(green(`  CommandDispatcher ready (${cmdCount} commands)`));

    // 3.5 ChannelPolicyEngine (Sprint 94 — per-channel rate limits)
    const policyEngine = new ChannelPolicyEngine();
    console.log(green("  ChannelPolicyEngine ready"));

    // 3.6 Autonomy T2 — Multi-Agent (Sprint 95)
    const goalDecomposer = new GoalDecomposer();
    const multiAgentDispatcher = new MultiAgentDispatcher();
    console.log(green("  Autonomy T2 ready (GoalDecomposer + MultiAgentDispatcher)"));

    // 4. GatewayIngress (single entry point — F3: inject policyEngine, Sprint 95: multi-agent)
    const ingress = new GatewayIngress(dispatcher, router, policyEngine, goalDecomposer, multiAgentDispatcher);
    console.log(green("  GatewayIngress ready"));

    // 4.5. Message Bus (Sprint 106, ADR-032) — decouples channel polling from AI processing
    //      Sprint 107: Debounce + Dedup for reliability
    const bus = getMessageBus();
    const busDebounce = new BusDebounce(500); // 500ms last-message-wins per sender
    const busDedup = new BusDedup();          // 20min TTL, 1000 max entries
    const busConsumer = new BusConsumer(bus, ingress, busDedup);
    busConsumer.start();
    components.push({
      name: "MessageBus",
      stop: async () => {
        busConsumer.stop();
        busDebounce.cancel(); // flush all pending timers
        resetMessageBus();
      },
    });
    console.log(green("  MessageBus ready (EventEmitter, debounce=500ms, dedup=20min)"));

    // 5. Gateway Server
    console.log(dim("  Starting Gateway server..."));
    const server = createGatewayServer({ port });
    registerAllMethods(server, { dispatcher, router, ingress });
    setGatewayServer(server);
    await server.start();
    components.push({
      name: "Gateway",
      stop: async () => {
        await server.stop();
        setGatewayServer(null);
      },
    });
    console.log(green(`  Gateway started on http://127.0.0.1:${port} (web) | ws://127.0.0.1:${port}/ws`));

    // Wire bus outbound events → WebSocket broadcast (Sprint 106, ADR-032)
    // Web UI clients subscribed to "bus.response" receive async responses.
    //
    // Sprint 137 A9 stub for WebUI / Desktop progress: BusConsumer's A6
    // heartbeats and A7 fallback announces are delivered to the originating
    // OTT channel via msg.replyFn (P0-01 single-owner invariant). Web UI
    // requests today bypass the bus entirely (gateway → ingress directly),
    // so they never trigger BusConsumer ticks. When Web UI grows to publish
    // through the bus, add a parallel `bus.progress` event class on the
    // outbound broadcast (msg.isProgress is the discriminator already on
    // BusOutboundMessage). CLI is sync-only and prints its own per-call
    // spinner via process.stderr — also not in the bus path.
    bus.onOutbound((msg) => {
      server.broadcast({
        type: "bus.response",
        timestamp: Date.now(),
        data: {
          correlationId: msg.correlationId,
          text: msg.text,
          isError: msg.isError ?? false,
        },
      });
    });

    // Track running OTT adapter names for health report
    const runningAdapters: string[] = [];

    // 5.5. RL Feedback Service (Sprint 110.5, ADR-033) — must be init before OTT adapters
    const feedbackService = new RLFeedbackService();
    const rlExpireTimer = setInterval(() => { feedbackService.expireStale(); }, 15 * 60 * 1000);
    components.push({
      name: "RLFeedbackService",
      stop: async () => { clearInterval(rlExpireTimer); },
    });
    console.log(green("  RLFeedbackService ready (15-min expiry timer)"));

    // 6. OTT Adapters (R5: error boundary per adapter)
    if (!options.noTelegram) {
      try {
        const telegram = createTelegramOttAdapter(ingress, bus, busDebounce, feedbackService); // Sprint 110.5: pass feedbackService
        if (telegram) {
          await telegram.start();
          components.push({ name: "Telegram", stop: () => telegram.stop() });
          runningAdapters.push("telegram");
          console.log(green(`  Telegram adapter started`));
        } else {
          console.log(dim("  Telegram: not configured (skipped)"));
        }
      } catch (error) {
        console.log(yellow(`  Telegram: failed to start — ${(error as Error).message}`));
      }
    } else {
      console.log(dim("  Telegram: disabled via --no-telegram"));
    }

    if (!options.noZalo) {
      try {
        const zalo = createZaloOttAdapter(ingress);
        if (zalo) {
          await zalo.start();
          components.push({ name: "Zalo", stop: () => zalo.stop() });
          runningAdapters.push("zalo");
          console.log(green(`  Zalo adapter started`));
        } else {
          console.log(dim("  Zalo: not configured (skipped)"));
        }
      } catch (error) {
        console.log(yellow(`  Zalo: failed to start — ${(error as Error).message}`));
      }
    } else {
      console.log(dim("  Zalo: disabled via --no-zalo"));
    }

    // Sprint 94 D5: Intentionally override the base system.health registered by
    // registerAllMethods() — this enhanced version includes OTT adapter + router info (CTO F4).
    server.registerMethod("system.health", async (params) => {
      const opts = params as { checkProviders?: boolean; providerCheckTimeout?: number } | undefined;
      return collectHealthReport(server.stats, 0, {
        checkProviders: opts?.checkProviders ?? false,
        providerCheckTimeout: opts?.providerCheckTimeout ?? 5000,
        ottAdapterNames: runningAdapters,
        channelRouterInfo: { routerReady: true, providerCount },
      });
    });

    // Startup complete
    console.log("");
    console.log(bold("═══════════════════════════════════════════════════════════════"));
    console.log(green(`  ${components.length} component(s) running. Press Ctrl+C to stop.`));
    console.log(bold("═══════════════════════════════════════════════════════════════"));
    console.log("");

    // R6: Graceful shutdown sequence (reverse order, 5s per component, 20s max)
    const shutdown = async (): Promise<void> => {
      console.log("\n" + yellow("Shutting down..."));

      for (const comp of [...components].reverse()) {
        try {
          await Promise.race([
            comp.stop(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 5000),
            ),
          ]);
          console.log(green(`  ${comp.name} stopped`));
        } catch {
          console.warn(yellow(`  ${comp.name} stop timeout (5s)`));
        }
      }

      console.log(green("All components stopped."));
      process.exit(0);
    };

    process.on("SIGTERM", () => void shutdown());
    process.on("SIGINT", () => void shutdown());

    // Keep process alive
    await new Promise<void>(() => {
      // Never resolves — process stays alive until SIGTERM/SIGINT
    });
  } catch (error) {
    // R5: Startup error — clean up what already started
    console.error(red(`\nStartup failed: ${(error as Error).message}`));

    for (const comp of [...components].reverse()) {
      try {
        await comp.stop();
      } catch {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the `serve` command.
 *
 * B1: Named `serve` (not `start`) to avoid collision with project init.
 */
export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start unified EndiorBot (Gateway + OTT + all services)")
    .option("-p, --port <port>", "Gateway port (default: 18790)")
    .option("--no-telegram", "Skip Telegram OTT adapter")
    .option("--no-zalo", "Skip Zalo OTT adapter")
    .option("--force", "Kill existing serve process and take over")
    .action(serveAction);
}
