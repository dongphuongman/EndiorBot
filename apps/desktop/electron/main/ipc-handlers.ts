/**
 * IPC Handlers Registry
 *
 * Registers all IPC handlers for main ↔ renderer communication.
 * Wired to EndiorBot core modules for real data.
 *
 * @module apps/desktop/electron/main/ipc-handlers
 * @version 1.1.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 * @authority ADR-003 CLI-Desktop Protocol
 */

import { ipcMain, dialog } from "electron";
import { getWindowIpcHandlers, getMainWindow } from "./window.js";

// ============================================================================
// Core Module Imports (Lazy loaded to handle build order)
// ============================================================================

// We use dynamic imports to avoid build-time resolution issues
// when the desktop app is built before the core library

let coreModules: {
  getSessionManager: () => import("endiorbot").SessionManager;
  createBudgetTracker: (config?: unknown) => import("endiorbot").BudgetTracker;
  listCheckpoints: (sessionId?: string) => Promise<import("endiorbot").CheckpointSummary[]>;
  loadCheckpoint: (id: string) => Promise<import("endiorbot").CheckpointState | null>;
  // Sprint 41: Persistent FixLogger (file-backed for cross-session history)
  getPersistentFixLogger: () => Promise<import("endiorbot").PersistentFixLogger>;
} | null = null;

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
// Settings Handlers (Placeholder for Sprint 44)
// ============================================================================

function registerSettingsHandlers(): void {
  // Settings will be wired to EndiorBot config in Sprint 44
  const settings: Record<string, unknown> = {
    theme: "dark",
    language: "en",
    gatewayPort: 18790,
  };

  ipcMain.handle("settings:get", (_event, key: string) => {
    return settings[key];
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    settings[key] = value;
    return true;
  });

  ipcMain.handle("settings:getAll", () => {
    return { ...settings };
  });
}

// ============================================================================
// Gateway Handlers (Placeholder for Sprint 44)
// ============================================================================

function registerGatewayHandlers(): void {
  // Gateway integration will be implemented in Sprint 44
  let gatewayStatus: "stopped" | "starting" | "running" | "error" = "stopped";

  ipcMain.handle("gateway:status", () => {
    return { status: gatewayStatus, message: "Gateway not implemented yet" };
  });

  ipcMain.handle("gateway:isConnected", () => {
    return gatewayStatus === "running";
  });

  ipcMain.handle("gateway:start", async () => {
    gatewayStatus = "starting";
    // Simulate startup
    setTimeout(() => {
      gatewayStatus = "running";
    }, 1000);
    return { success: true };
  });

  ipcMain.handle("gateway:stop", async () => {
    gatewayStatus = "stopped";
    return { success: true };
  });

  ipcMain.handle("gateway:restart", async () => {
    gatewayStatus = "starting";
    setTimeout(() => {
      gatewayStatus = "running";
    }, 1000);
    return { success: true };
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
        sessionId: cp.sessionId,
        createdAt: cp.createdAt.toISOString(),
        brainDigest: cp.brainDigest,
        description: `${cp.reason} - ${cp.completedActionsCount} actions`,
        reason: cp.reason,
        completedActionsCount: cp.completedActionsCount,
        sdlcStage: cp.sdlcStage,
        taskCount: cp.taskCount,
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
        sessionId: checkpoint.session.sessionId,
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
export function registerIpcHandlers(): void {
  registerWindowHandlers();
  registerDialogHandlers();
  registerSettingsHandlers();
  registerGatewayHandlers();
  registerSessionHandlers();
  registerBudgetHandlers();
  registerCheckpointHandlers();
  registerFixStatsHandlers();
}
