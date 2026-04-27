/**
 * Kimi Proxy Subprocess Orchestrator
 *
 * Manages the lifecycle of a local claude-code-proxy subprocess
 * so that EndiorBot can use Kimi2.6 as a first-class fallback
 * without requiring the CEO to manually start the proxy.
 *
 * @module providers/kimi-proxy/subprocess-orchestrator
 * @since Sprint 140
 */

import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import { safeFetch } from "../../security/safe-fetch.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("providers.kimi-proxy.orchestrator");

/** Maximum time to wait for proxy health check (ms). */
const HEALTH_CHECK_TIMEOUT_MS = 3000;

/** Maximum time to wait for proxy startup (ms). */
const STARTUP_TIMEOUT_MS = 10000;

/** Poll interval during startup (ms). */
const STARTUP_POLL_INTERVAL_MS = 300;

export interface SubprocessOrchestratorState {
  process: ChildProcess | null;
  port: number;
  url: string;
  healthy: boolean;
}

let globalState: SubprocessOrchestratorState | null = null;

/**
 * Find an available TCP port on 127.0.0.1.
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", (err) => reject(err));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object" && "port" in addr) {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Unable to determine free port")));
      }
    });
  });
}

/**
 * Locate the claude-code-proxy binary in PATH.
 * Returns null if not found.
 */
async function findBinaryAsync(): Promise<string | null> {
  const { execSync } = await import("child_process");
  try {
    const result = execSync("which claude-code-proxy", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    const path = result.trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

/**
 * Check if Kimi auth is configured for the proxy.
 */
async function checkKimiAuth(binaryPath: string): Promise<boolean> {
  const { execFile } = await import("child_process");
  return new Promise((resolve) => {
    const child = execFile(binaryPath, ["kimi", "auth", "status"], {
      timeout: 5000,
      env: { ...process.env },
    }, (error, _stdout, _stderr) => {
      resolve(error === null);
    });
    if (!child) resolve(false);
  });
}

/**
 * Poll the proxy health endpoint until it responds or timeout.
 */
async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const res = await safeFetch(`${url}/healthz`, { signal: controller.signal }, { provider: "kimi-proxy" });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // Ignore and retry
    }
    await new Promise((r) => setTimeout(r, STARTUP_POLL_INTERVAL_MS));
  }
  return false;
}

/**
 * Start the claude-code-proxy subprocess on a dynamic port.
 *
 * Implements CTO conditions:
 *   1. Dynamic port allocation
 *   2. Graceful degrade (returns null if binary missing / not auth)
 *   3. Health check timeout ≤ 3s
 *   5. Auth pre-check
 */
export async function startKimiProxy(): Promise<SubprocessOrchestratorState | null> {
  // Singleton guard — return cached state if already called
  if (globalState) {
    log.debug("Returning cached kimi-proxy state (already started)");
    return globalState;
  }

  // Kill switch (CTO Condition 6)
  if (process.env.ENDIORBOT_DISABLE_KIMI_PROXY === "true") {
    log.info("Kimi proxy disabled via ENDIORBOT_DISABLE_KIMI_PROXY");
    return null;
  }

  // External proxy detection — reuse an already-running proxy (e.g. claude-kimi alias)
  // Set ENDIORBOT_KIMI_PROXY_URL=http://127.0.0.1:18765 to skip subprocess spawn.
  //
  // Sprint 144 T4: DEPRECATED subprocess spawner.
  // Recommended setup: CEO runs `claude-code-proxy serve` externally + sets
  // ENDIORBOT_KIMI_PROXY_URL. Subprocess spawn is unreliable (health check
  // races, stale processes, short-lived auth tokens). If no URL is set AND
  // no binary found, log a notice instead of failing silently.
  const externalUrl = process.env.ENDIORBOT_KIMI_PROXY_URL;
  if (externalUrl) {
    const healthy = await waitForHealth(externalUrl, HEALTH_CHECK_TIMEOUT_MS);
    if (healthy) {
      log.info(`Using external kimi-proxy at ${externalUrl} (ENDIORBOT_KIMI_PROXY_URL)`);
      globalState = { process: null, port: 0, url: externalUrl, healthy: true };
      return globalState;
    }
    log.warn(`ENDIORBOT_KIMI_PROXY_URL=${externalUrl} not healthy — falling back to subprocess spawn`);
  }

  // Sprint 144 T4: Deprecation notice for subprocess spawner
  console.warn("⚠️  [kimi-proxy] Subprocess spawner is DEPRECATED (Sprint 144).");
  console.warn("   Recommended: run 'claude-code-proxy serve' externally + set ENDIORBOT_KIMI_PROXY_URL.");
  console.warn("   Subprocess spawn is unreliable. See docs/06-deploy/README.md.");

  // Find binary
  const binaryPath = await findBinaryAsync();
  if (!binaryPath) {
    log.warn("claude-code-proxy binary not found in PATH — skipping kimi-proxy");
    return null;
  }
  log.debug(`Found claude-code-proxy at ${binaryPath}`);

  // Auth pre-check (CTO Condition 5)
  const hasAuth = await checkKimiAuth(binaryPath);
  if (!hasAuth) {
    log.warn("claude-code-proxy kimi auth not configured — run 'claude-code-proxy kimi auth login'. Skipping kimi-proxy.");
    return null;
  }
  log.debug("Kimi auth verified");

  // Dynamic port (CTO Condition 1)
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  log.info(`Starting claude-code-proxy on ${url}`);

  const child = spawn(binaryPath, ["serve"], {
    detached: false,
    env: {
      ...process.env,
      PORT: String(port),
      // Reduce proxy log noise
      CCP_LOG_STDERR: process.env.CCP_LOG_STDERR ?? "0",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });

  if (!child.pid) {
    log.error("Failed to spawn claude-code-proxy");
    return null;
  }

  log.debug(`Spawned claude-code-proxy (pid=${child.pid})`);

  // Health check with timeout (CTO Condition 3)
  const healthy = await waitForHealth(url, STARTUP_TIMEOUT_MS);
  if (!healthy) {
    log.error(`claude-code-proxy failed health check at ${url} within ${STARTUP_TIMEOUT_MS}ms — killing process`);
    child.kill("SIGTERM");
    return null;
  }

  log.info(`claude-code-proxy healthy at ${url}`);

  globalState = { process: child, port, url, healthy: true };
  return globalState;
}

/**
 * Stop the managed proxy subprocess.
 *
 * Implements CTO Condition 4: SIGTERM on shutdown.
 */
export function stopKimiProxy(): void {
  if (!globalState || !globalState.process) {
    return;
  }

  const child = globalState.process;
  log.info(`Stopping claude-code-proxy (pid=${child.pid})`);

  // Send SIGTERM first
  child.kill("SIGTERM");

  // Force kill after grace period if still running
  const gracePeriod = 5000;
  const timer = setTimeout(() => {
    if (!child.killed) {
      log.warn(`claude-code-proxy (pid=${child.pid}) did not exit within ${gracePeriod}ms — sending SIGKILL`);
      child.kill("SIGKILL");
    }
  }, gracePeriod);

  child.on("exit", () => {
    clearTimeout(timer);
    log.debug("claude-code-proxy exited");
  });

  globalState = null;
}

/**
 * Get the current proxy state (null if not started).
 */
export function getKimiProxyState(): SubprocessOrchestratorState | null {
  return globalState;
}

/**
 * Register process exit handlers to ensure cleanup.
 * Should be called once during application bootstrap.
 */
export function registerKimiProxyCleanup(): void {
  const cleanup = () => {
    stopKimiProxy();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
}
