/**
 * IPC Handlers Registry
 *
 * Registers all IPC handlers for main ↔ renderer communication.
 * Wired to EndiorBot core modules for real data.
 *
 * @module apps/desktop/electron/main/ipc-handlers
 * @version 1.2.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 44 Day 8 IPC→Gateway Wiring
 * @authority ADR-003 CLI-Desktop Protocol
 */

import { ipcMain, dialog, app } from "electron";
import { getWindowIpcHandlers, getMainWindow } from "./window.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "dotenv";

// ============================================================================
// Core Module Imports (Lazy loaded to handle build order)
// ============================================================================

// We use dynamic imports to avoid build-time resolution issues
// when the desktop app is built before the core library

let coreModules: {
  getSessionManager: () => import("endiorbot").SessionManager;
  createBudgetTracker: (config?: Partial<import("endiorbot").BudgetConfig>) => import("endiorbot").BudgetTracker;
  listCheckpoints: (sessionId?: string) => Promise<import("endiorbot").CheckpointSummary[]>;
  loadCheckpoint: (id: string) => Promise<import("endiorbot").CheckpointState | null>;
  // Sprint 41: Persistent FixLogger (file-backed for cross-session history)
  getPersistentFixLogger: () => Promise<import("endiorbot").PersistentFixLogger>;
  // Sprint 44: Gateway
  createGatewayServer: (config?: Partial<import("endiorbot").GatewayConfig>) => import("endiorbot").GatewayServer;
  setGatewayServer: (server: import("endiorbot").GatewayServer | null) => void;
  getGatewayServer: () => import("endiorbot").GatewayServer | null;
  registerAllMethods: (server: import("endiorbot").GatewayServer) => void;
  initializeProvidersFromEnv: () => Promise<number>;
} | null = null;

/** Resolve EndiorBot project root (the directory containing endiorbot.mjs). */
function findProjectRoot(): string | null {
  const cwd = process.cwd();
  const candidates = [
    cwd,                                               // if cwd = project root
    path.resolve(cwd, "../.."),                        // if cwd = apps/desktop
    path.resolve(__dirname, "../../../.."),             // dist-electron/main → root
    path.resolve(__dirname, "../../../../.."),          // one more level
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "endiorbot.mjs"))) return dir;
  }
  // Fallback: look for .env anywhere up from cwd
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, ".env"))) return dir;
  }
  return null;
}

/** Load .env and .env.local from project root so API keys are available. */
function loadEnvFromProjectRoot(): void {
  const root = findProjectRoot();
  if (!root) return;
  const envPath = path.join(root, ".env");
  const envLocalPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) config({ path: envPath });
  if (fs.existsSync(envLocalPath)) config({ path: envLocalPath, override: true });
}

async function loadCoreModules(): Promise<typeof coreModules> {
  if (coreModules) return coreModules;

  try {
    const core = await import("endiorbot");
    coreModules = {
      getSessionManager: core.getSessionManager,
      createBudgetTracker: core.createBudgetTracker,
      listCheckpoints: core.listCheckpoints,
      loadCheckpoint: core.loadCheckpoint,
      getPersistentFixLogger: core.getPersistentFixLogger,
      // Sprint 44: Gateway
      createGatewayServer: core.createGatewayServer,
      setGatewayServer: core.setGatewayServer,
      getGatewayServer: core.getGatewayServer,
      registerAllMethods: core.registerAllMethods,
      initializeProvidersFromEnv: core.initializeProvidersFromEnv,
    };
    return coreModules;
  } catch (error) {
    console.warn("[IPC] Core modules not available, using fallbacks:", error);
    return null;
  }
}

// Singleton instances
let budgetTracker: import("endiorbot").BudgetTracker | null = null;
let fixLogger: import("endiorbot").PersistentFixLogger | null = null;

async function getBudgetTracker(): Promise<import("endiorbot").BudgetTracker | null> {
  if (budgetTracker) return budgetTracker;
  const core = await loadCoreModules();
  if (!core) return null;
  budgetTracker = core.createBudgetTracker();
  return budgetTracker;
}

async function getFixLogger(): Promise<import("endiorbot").PersistentFixLogger | null> {
  if (fixLogger) return fixLogger;
  const core = await loadCoreModules();
  if (!core) return null;
  // Sprint 41: Use persistent file-backed FixLogger for cross-session history
  fixLogger = await core.getPersistentFixLogger();
  return fixLogger;
}

// ============================================================================
// Window Handlers
// ============================================================================

function registerWindowHandlers(): void {
  const handlers = getWindowIpcHandlers();

  ipcMain.handle("window:minimize", () => handlers.minimize());
  ipcMain.handle("window:maximize", () => handlers.maximize());
  ipcMain.handle("window:close", () => handlers.close());
  ipcMain.handle("window:isMaximized", () => handlers.isMaximized());
  ipcMain.handle("window:isFullScreen", () => handlers.isFullScreen());
  ipcMain.handle("window:setFullScreen", (_event, fullScreen: boolean) =>
    handlers.setFullScreen(fullScreen)
  );
}

// ============================================================================
// Dialog Handlers
// ============================================================================

function registerDialogHandlers(): void {
  ipcMain.handle("dialog:open", async (_event, options: Electron.OpenDialogOptions) => {
    const win = getMainWindow();
    if (!win) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(win, options);
  });

  ipcMain.handle("dialog:save", async (_event, options: Electron.SaveDialogOptions) => {
    const win = getMainWindow();
    if (!win) return { canceled: true };
    return dialog.showSaveDialog(win, options);
  });

  ipcMain.handle(
    "dialog:message",
    async (
      _event,
      options: { type?: string; title?: string; message: string; buttons?: string[] }
    ) => {
      const win = getMainWindow();
      if (!win) return { response: 0 };
      return dialog.showMessageBox(win, {
        type: (options.type as "none" | "info" | "error" | "question" | "warning") ?? "info",
        title: options.title ?? "EndiorBot",
        message: options.message,
        buttons: options.buttons ?? ["OK"],
      });
    }
  );
}

// ============================================================================
// Settings Handlers (Wired to ~/.endiorbot/config.json)
// ============================================================================

interface DesktopSettings {
  theme: "light" | "dark" | "system";
  language: string;
  gatewayPort: number;
  autoStartGateway: boolean;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: DesktopSettings = {
  theme: "dark",
  language: "en",
  gatewayPort: 18790,
  autoStartGateway: true,
};

function getConfigPath(): string {
  const homeDir = app.getPath("home");
  return path.join(homeDir, ".endiorbot", "config.json");
}

function loadSettings(): DesktopSettings {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content) as Partial<DesktopSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.warn("[IPC] Failed to load settings:", error);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: DesktopSettings): boolean {
  const configPath = getConfigPath();
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[IPC] Failed to save settings:", error);
    return false;
  }
}

function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", (_event, key: string) => {
    const settings = loadSettings();
    return settings[key];
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    const settings = loadSettings();
    settings[key] = value;
    return saveSettings(settings);
  });

  ipcMain.handle("settings:getAll", () => {
    return loadSettings();
  });

  // ── API Key Management ──
  // API keys shown in Settings → API Keys section
  const API_KEY_ENV_MAP: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    kimi: "KIMI_API_KEY",
    ollama: "OLLAMA_REMOTE_API_KEY",
    mcp_gateway: "MCP_GATEWAY_API_KEY",
    telegram: "ENDIORBOT_TELEGRAM_BOT_TOKEN",
    github: "GITHUB_PAT",
  };

  // Sprint 144: Config vars managed by dedicated UI sections (Gateway editor, etc.)
  // These use the same setApiKey IPC but are NOT shown in the API Keys list.
  const CONFIG_ENV_MAP: Record<string, string> = {
    gateway_port: "ENDIORBOT_GATEWAY_PORT",
    gateway_token: "ENDIORBOT_GATEWAY_TOKEN",
    webhook_secret: "ENDIORBOT_WEBHOOK_SECRET",
    kimi_proxy_url: "ENDIORBOT_KIMI_PROXY_URL",
  };

  // Combined map for setApiKey handler (accepts both keys and config vars)
  const ALL_ENV_MAP: Record<string, string> = { ...API_KEY_ENV_MAP, ...CONFIG_ENV_MAP };

  function getEnvFilePath(): string {
    const root = findProjectRoot();
    if (root) return path.join(root, ".env");
    return path.join(process.cwd(), ".env");
  }

  ipcMain.handle("settings:getApiKeys", () => {
    loadEnvFromProjectRoot();

    // Return ALL env vars (API keys + config) — UI filters display per section
    const keys: Array<{ id: string; envVar: string; masked: string; isSet: boolean }> = [];
    for (const [id, envVar] of Object.entries(ALL_ENV_MAP)) {
      const value = process.env[envVar] ?? "";
      const isSet = value.length > 0;
      // Config vars (port, URL) show full value; secrets show masked
      const isSecret = API_KEY_ENV_MAP[id] !== undefined;
      const masked = isSet
        ? isSecret ? value.slice(0, 4) + "••••" + value.slice(-4) : value
        : "";
      keys.push({ id, envVar, masked, isSet });
    }
    return { keys };
  });

  ipcMain.handle("settings:setApiKey", (_event, id: string, value: string) => {
    const envVar = ALL_ENV_MAP[id];
    if (!envVar) return { success: false, error: `Unknown key id: ${id}` };

    const envPath = getEnvFilePath();
    try {
      let content = "";
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, "utf-8");
      }

      // Replace existing line or append
      const regex = new RegExp(`^${envVar}=.*$`, "m");
      const newLine = `${envVar}=${value}`;
      if (regex.test(content)) {
        content = content.replace(regex, newLine);
      } else {
        content = content.trimEnd() + "\n" + newLine + "\n";
      }

      fs.writeFileSync(envPath, content, "utf-8");
      // Update process.env for current session
      process.env[envVar] = value;
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

// ============================================================================
// Gateway Handlers (Wired to GatewayServer - Sprint 44 Day 8)
// ============================================================================

// Gateway server instance (managed by IPC)
let gatewayServer: import("endiorbot").GatewayServer | null = null;

function registerGatewayHandlers(): void {
  ipcMain.handle("gateway:status", async () => {
    const core = await loadCoreModules();

    // Check module-level instance first
    if (gatewayServer) {
      return {
        status: gatewayServer.isRunning ? "running" : "stopped",
        port: gatewayServer.config.port,
        activeConnections: gatewayServer.stats.activeConnections,
      };
    }

    // Check global singleton (in case started externally)
    if (core) {
      const globalServer = core.getGatewayServer();
      if (globalServer) {
        return {
          status: globalServer.isRunning ? "running" : "stopped",
          port: globalServer.config.port,
          activeConnections: globalServer.stats.activeConnections,
        };
      }
    }

    return { status: "stopped" };
  });

  ipcMain.handle("gateway:isConnected", async () => {
    if (gatewayServer?.isRunning) return true;

    const core = await loadCoreModules();
    if (core) {
      const globalServer = core.getGatewayServer();
      return globalServer?.isRunning ?? false;
    }

    return false;
  });

  ipcMain.handle("gateway:start", async () => {
    const core = await loadCoreModules();

    if (!core) {
      return { success: false, error: "Core modules not available" };
    }

    // Check if already running
    if (gatewayServer?.isRunning) {
      return { success: true, message: "Gateway already running" };
    }

    try {
      // Load .env.local so API keys (Anthropic, OpenAI, Gemini) are available
      loadEnvFromProjectRoot();
      await core.initializeProvidersFromEnv();

      // Load port from settings
      const settings = loadSettings();
      const port = settings.gatewayPort ?? 18790;

      // Create and start gateway server
      gatewayServer = core.createGatewayServer({ port });

      // Register all gateway methods
      core.registerAllMethods(gatewayServer);

      // Set as global singleton
      core.setGatewayServer(gatewayServer);

      // Start the server
      await gatewayServer.start();

      console.log(`[IPC] Gateway server started on port ${port}`);

      return {
        success: true,
        port,
        message: `Gateway started on port ${port}`,
      };
    } catch (error) {
      console.error("[IPC] Failed to start gateway:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("gateway:stop", async () => {
    const core = await loadCoreModules();

    try {
      if (gatewayServer) {
        await gatewayServer.stop();
        gatewayServer = null;
      }

      // Clear global singleton
      if (core) {
        core.setGatewayServer(null);
      }

      console.log("[IPC] Gateway server stopped");

      return { success: true };
    } catch (error) {
      console.error("[IPC] Failed to stop gateway:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("gateway:restart", async () => {
    const core = await loadCoreModules();

    if (!core) {
      return { success: false, error: "Core modules not available" };
    }

    try {
      // Stop existing server
      if (gatewayServer) {
        await gatewayServer.stop();
        gatewayServer = null;
        core.setGatewayServer(null);
      }

      // Load .env.local and (re)initialize providers so API keys are available
      loadEnvFromProjectRoot();
      await core.initializeProvidersFromEnv();

      // Load port from settings
      const settings = loadSettings();
      const port = settings.gatewayPort ?? 18790;

      // Create and start new server
      gatewayServer = core.createGatewayServer({ port });
      core.registerAllMethods(gatewayServer);
      core.setGatewayServer(gatewayServer);
      await gatewayServer.start();

      console.log(`[IPC] Gateway server restarted on port ${port}`);

      return {
        success: true,
        port,
        message: `Gateway restarted on port ${port}`,
      };
    } catch (error) {
      console.error("[IPC] Failed to restart gateway:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Session Handlers (Wired to SessionManager)
// ============================================================================

function registerSessionHandlers(): void {
  ipcMain.handle("session:get", async () => {
    const core = await loadCoreModules();
    if (!core) {
      // Fallback for when core modules aren't available
      return {
        id: "demo-session",
        projectId: "endiorbot",
        status: "active",
        createdAt: new Date().toISOString(),
        tokenCount: 0,
        maxTokens: 50000,
        sdlcStage: "04-BUILD",
        activeGates: [],
      };
    }

    const manager = core.getSessionManager();
    const session = manager.getActiveSession();

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      projectId: session.projectId,
      status: "active",
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      tokenCount: session.tokenCount,
      maxTokens: session.maxTokens,
      sdlcStage: session.sdlcStage,
      activeGates: session.activeGates,
      messageCount: session.messages.length,
      compactionCount: session.compactionCount,
    };
  });

  ipcMain.handle("session:list", async () => {
    // Session listing requires SessionStore which we don't expose directly
    // Return active session as single-item list for now
    const core = await loadCoreModules();
    if (!core) {
      return [];
    }

    const manager = core.getSessionManager();
    const session = manager.getActiveSession();

    if (!session) {
      return [];
    }

    return [
      {
        id: session.id,
        projectId: session.projectId,
        status: "active",
        createdAt: session.createdAt.toISOString(),
      },
    ];
  });
}

// ============================================================================
// Budget Handlers (Wired to BudgetTracker)
// ============================================================================

function registerBudgetHandlers(): void {
  ipcMain.handle("budget:get", async () => {
    const tracker = await getBudgetTracker();

    if (!tracker) {
      // Fallback for when core modules aren't available
      return {
        session: {
          used: 0,
          limit: 2.0,
          remaining: 2.0,
          percentage: 0,
          thresholdLevel: "normal",
        },
        daily: {
          used: 0,
          limit: 10.0,
          remaining: 10.0,
          percentage: 0,
          thresholdLevel: "normal",
        },
        canProceed: true,
        warnings: [],
        currency: "USD",
      };
    }

    const status = await tracker.getStatus();

    return {
      session: status.session,
      daily: status.daily,
      tracks: status.tracks,
      canProceed: status.canProceed,
      warnings: status.warnings,
      currency: "USD",
    };
  });
}

// ============================================================================
// Checkpoint Handlers (Wired to Checkpoint module)
// ============================================================================

function registerCheckpointHandlers(): void {
  ipcMain.handle("checkpoints:list", async () => {
    const core = await loadCoreModules();
    if (!core) {
      // Fallback
      return [];
    }

    try {
      const checkpoints = await core.listCheckpoints();
      return checkpoints.map((cp) => ({
        id: cp.id,
        createdAt: cp.createdAt.toISOString(),
        reason: cp.reason,
        description: cp.description ?? `${cp.reason} checkpoint`,
        sessionCost: cp.sessionCost,
        filesModified: cp.filesModified,
        currentPhase: cp.currentPhase,
        sizeBytes: cp.sizeBytes,
        compressed: cp.compressed,
      }));
    } catch (error) {
      console.error("[IPC] Failed to list checkpoints:", error);
      return [];
    }
  });

  ipcMain.handle("checkpoints:restore", async (_event, id: string) => {
    const core = await loadCoreModules();
    if (!core) {
      return { success: false, error: "Core modules not available" };
    }

    try {
      const checkpoint = await core.loadCheckpoint(id);
      if (!checkpoint) {
        return { success: false, error: "Checkpoint not found" };
      }

      // Note: Actual restore flow requires more context (conflict handling, etc.)
      // This just validates the checkpoint exists and is loadable
      return {
        success: true,
        checkpointId: id,
        sessionId: checkpoint.session.session.id,
        createdAt: checkpoint.meta.createdAt.toISOString(),
      };
    } catch (error) {
      console.error("[IPC] Failed to restore checkpoint:", error);
      return { success: false, error: String(error) };
    }
  });
}

// ============================================================================
// Fix Stats Handlers (Wired to Sprint 41 PersistentFixLogger)
// ============================================================================

function registerFixStatsHandlers(): void {
  ipcMain.handle("fixStats:getWeeklySummary", async () => {
    const logger = await getFixLogger();

    if (!logger) {
      // Fallback when core modules unavailable
      return {
        totalFixes: 0,
        successRate: 0,
        byCategory: {},
        period: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      };
    }

    try {
      // Sprint 41 FixLogger provides getWeeklySummary() with full analytics
      const summary = await logger.getWeeklySummary(0); // Current week

      // Transform byCategory to desktop format
      const byCategory: Record<string, { count: number; successRate: number; target: number; met: boolean }> = {};
      for (const [cat, data] of Object.entries(summary.byCategory)) {
        byCategory[cat] = {
          count: data.total,
          successRate: data.successRate,
          target: data.targetRate,
          met: data.metTarget,
        };
      }

      return {
        totalFixes: summary.totalAttempts,
        successRate: summary.successRate,
        successfulFixes: summary.successfulFixes,
        failedFixes: summary.failedFixes,
        escalatedFixes: summary.escalatedFixes,
        byCategory,
        topPatterns: summary.topPatterns,
        problematicPatterns: summary.problematicPatterns,
        period: {
          start: summary.weekStart,
          end: summary.weekEnd,
        },
      };
    } catch (error) {
      console.error("[IPC] Failed to get weekly summary:", error);
      return {
        totalFixes: 0,
        successRate: 0,
        byCategory: {},
        period: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        error: String(error),
      };
    }
  });

  ipcMain.handle("fixStats:getPatterns", async () => {
    const logger = await getFixLogger();

    if (!logger) {
      return [];
    }

    try {
      // Sprint 41 FixLogger provides getRecurringPatterns() with grouped analysis
      const patterns = await logger.getRecurringPatterns(2); // Min 2 occurrences

      // Transform to desktop format
      return patterns.map((p) => ({
        id: p.errorCode,
        category: p.category,
        count: p.count,
        successRate: p.successRate,
        patterns: p.patterns.map((pp) => ({
          patternId: pp.patternId,
          count: pp.count,
          successRate: pp.successRate,
          trend: pp.trend,
          recommendation: pp.recommendation,
        })),
      }));
    } catch (error) {
      console.error("[IPC] Failed to get patterns:", error);
      return [];
    }
  });
}

// ============================================================================
// Register All Handlers
// ============================================================================

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 */
// ============================================================================
// Repos Handlers (Wired to RepoRegistry via repos.json)
// ============================================================================

function registerReposHandlers(): void {
  ipcMain.handle("repos:list", async () => {
    try {
      const stateDir = process.env.ENDIORBOT_STATE_DIR
        || path.join(app.getPath("home"), ".endiorbot");
      const reposPath = path.join(stateDir, "repos.json");

      if (!fs.existsSync(reposPath)) {
        return { repos: [], error: null };
      }

      const data = JSON.parse(fs.readFileSync(reposPath, "utf-8"));
      const repos = (data.repos || []).map((r: { name: string; path: string; registeredAt?: string; defaultBranch?: string }) => ({
        name: r.name,
        path: r.path,
        registeredAt: r.registeredAt,
        defaultBranch: r.defaultBranch ?? "main",
        exists: fs.existsSync(r.path),
      }));

      return { repos, error: null };
    } catch (error) {
      return { repos: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
}

// ============================================================================
// Gates Handlers (Wired to SDLC Gate Engine or .sdlc-config.json fallback)
// ============================================================================

interface GateInfo {
  id: string;
  name: string;
  status: "pass" | "fail" | "pending" | "skipped";
  lastChecked: string | null;
}

const GATE_DEFINITIONS: Array<{ id: string; name: string }> = [
  { id: "G0", name: "Project Initialization" },
  { id: "G0.1", name: "Requirements Baseline" },
  { id: "G1", name: "Architecture Approved" },
  { id: "G2", name: "Design Complete" },
  { id: "G3", name: "Implementation Ready" },
  { id: "G4", name: "Release Ready" },
  { id: "G-Sprint", name: "Sprint Complete" },
];

function registerGatesHandlers(): void {
  ipcMain.handle("gates:status", async () => {
    // Try EndiorBot core first
    try {
      const core = await import("endiorbot") as unknown as Record<string, unknown>;
      if (typeof core.getGateEngine === "function") {
        const engine = (core.getGateEngine as () => unknown)() as Record<string, unknown> | null;
        if (engine && typeof engine.evaluateAll === "function") {
          const results = await (engine.evaluateAll as () => Promise<unknown[]>)();
          return { gates: results, source: "core" };
        }
      }
    } catch {
      // Core not available — fall through to file fallback
    }

    // Fallback: read .sdlc-config.json from cwd
    const candidatePaths = [
      path.join(process.cwd(), ".sdlc-config.json"),
      path.join(app.getPath("home"), ".endiorbot", "projects", "endiorbot", ".sdlc-config.json"),
    ];

    let sdlcConfig: Record<string, unknown> | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          sdlcConfig = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
          break;
        } catch {
          // ignore parse errors
        }
      }
    }

    const gateStatuses = sdlcConfig?.gate_statuses as Record<string, string> | undefined;
    const gates: GateInfo[] = GATE_DEFINITIONS.map((g) => {
      const rawStatus = gateStatuses?.[g.id];
      let status: GateInfo["status"] = "pending";
      if (rawStatus === "PASS" || rawStatus === "pass") status = "pass";
      else if (rawStatus === "FAIL" || rawStatus === "fail") status = "fail";
      else if (rawStatus === "SKIPPED" || rawStatus === "skipped") status = "skipped";

      return {
        id: g.id,
        name: g.name,
        status,
        lastChecked: sdlcConfig ? new Date().toISOString() : null,
      };
    });

    return {
      gates,
      tier: (sdlcConfig?.tier as string) ?? null,
      frameworkVersion: (sdlcConfig?.framework_version as string) ?? null,
      source: sdlcConfig ? "sdlc-config" : "static",
    };
  });
}

// ============================================================================
// Experts / Providers Handlers
// ============================================================================

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  tier: 1 | 2 | 3;
  tierLabel: string;
  description: string;
}

function registerExpertsHandlers(): void {
  ipcMain.handle("experts:providers", () => {
    loadEnvFromProjectRoot();

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const kimiKey = process.env.KIMI_API_KEY;
    const ollamaKey = process.env.OLLAMA_API_KEY || process.env.OLLAMA_REMOTE_URL;
    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    const providers: ProviderInfo[] = [
      {
        id: "anthropic",
        name: "Claude (Anthropic)",
        configured: Boolean(anthropicKey),
        tier: 1,
        tierLabel: "Tier 1 — Elite",
        description: "Claude Opus / Sonnet — primary reasoning engine",
      },
      {
        id: "openai",
        name: "OpenAI GPT",
        configured: Boolean(openaiKey),
        tier: 2,
        tierLabel: "Tier 2 — Standard",
        description: "GPT-4o — multi-model consultation fallback",
      },
      {
        id: "gemini",
        name: "Google Gemini",
        configured: Boolean(geminiKey),
        tier: 2,
        tierLabel: "Tier 2 — Standard",
        description: "Gemini 1.5 Pro — large context window tasks",
      },
      {
        id: "kimi",
        name: "Kimi (Moonshot)",
        configured: Boolean(kimiKey),
        tier: 2,
        tierLabel: "Tier 2 — Standard",
        description: "Kimi — long document analysis via AI-Platform proxy",
      },
      {
        id: "ollama",
        name: "Ollama (Local)",
        configured: Boolean(ollamaKey),
        tier: 3,
        tierLabel: "Tier 3 — Efficiency",
        description: "Local models via Ollama — privacy-first, offline capable",
      },
    ];

    return { providers };
  });
}

export function registerIpcHandlers(): void {
  registerWindowHandlers();
  registerDialogHandlers();
  registerSettingsHandlers();
  registerGatewayHandlers();
  registerSessionHandlers();
  registerBudgetHandlers();
  registerCheckpointHandlers();
  registerFixStatsHandlers();
  registerReposHandlers();
  registerGatesHandlers();
  registerExpertsHandlers();
}

/**
 * Auto-start Gateway by spawning `endiorbot.mjs serve` as a subprocess.
 * Electron's bundled context can't import endiorbot core directly,
 * so we run it as a separate Node.js process.
 */
import { spawn, type ChildProcess } from "node:child_process";

let gatewayProcess: ChildProcess | null = null;

export async function autoStartGateway(): Promise<{ success: boolean; port?: number; error?: string }> {
  if (gatewayProcess && !gatewayProcess.killed) {
    return { success: true, port: 18790 };
  }

  const settings = loadSettings();
  const port = settings.gatewayPort ?? 18790;

  // Find endiorbot.mjs — walk up from apps/desktop to project root
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "endiorbot.mjs"),                      // if cwd = project root
    path.resolve(cwd, "../../endiorbot.mjs"),              // if cwd = apps/desktop
    path.resolve(__dirname, "../../../../endiorbot.mjs"),   // dist-electron/main → root
    path.resolve(__dirname, "../../../../../endiorbot.mjs"),// one more level up
  ];

  console.log("[Gateway] cwd:", cwd, "__dirname:", __dirname);

  let entryPoint: string | null = null;
  for (const p of candidates) {
    const resolved = path.resolve(p);
    console.log("[Gateway] checking:", resolved, fs.existsSync(resolved) ? "EXISTS" : "—");
    if (fs.existsSync(resolved)) {
      entryPoint = resolved;
      break;
    }
  }

  if (!entryPoint) {
    return { success: false, error: `Cannot find endiorbot.mjs (cwd=${cwd}, __dirname=${__dirname})` };
  }

  const projectRoot = path.dirname(entryPoint);
  console.log("[Gateway] entryPoint:", entryPoint, "projectRoot:", projectRoot);

  return new Promise((resolve) => {
    // Build clean env — remove Electron-specific vars so child is plain Node
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    delete cleanEnv.ELECTRON_NO_ASAR;
    cleanEnv.ENDIORBOT_GATEWAY_PORT = String(port);

    gatewayProcess = spawn("node", [entryPoint!, "serve", "--no-telegram", "--no-zalo"], {
      cwd: projectRoot,
      env: cleanEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        started = true;
        // Gateway may still be starting — optimistically report success
        resolve({ success: true, port });
      }
    }, 5000);

    gatewayProcess.stdout?.on("data", (data: Buffer) => {
      const line = data.toString();
      console.log("[Gateway]", line.trim());
      // Detect successful start from gateway output
      if (!started && (line.includes("Gateway") || line.includes("listening") || line.includes(String(port)))) {
        started = true;
        clearTimeout(timeout);
        resolve({ success: true, port });
      }
    });

    gatewayProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[Gateway:err]", data.toString().trim());
    });

    gatewayProcess.on("error", (err) => {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      }
    });

    gatewayProcess.on("exit", (code) => {
      console.log(`[Gateway] Process exited with code ${code}`);
      gatewayProcess = null;
      if (!started) {
        started = true;
        clearTimeout(timeout);
        resolve({ success: false, error: `Gateway exited with code ${code}` });
      }
    });
  });
}

/** Stop the gateway subprocess (called on app quit). */
export function stopGateway(): void {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill("SIGTERM");
    gatewayProcess = null;
  }
}
