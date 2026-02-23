/**
 * Auto Updater
 *
 * Handles automatic updates using electron-updater.
 *
 * @module apps/desktop/electron/main/updater
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { app, ipcMain, BrowserWindow } from "electron";
// Note: electron-updater will be imported at runtime
// import { autoUpdater } from "electron-updater";

// ============================================================================
// Types
// ============================================================================

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

let updateState: UpdateState = { status: "idle" };
let mainWindow: BrowserWindow | null = null;

// ============================================================================
// Updater Functions
// ============================================================================

/**
 * Initialize the auto-updater.
 * Only active in packaged builds.
 */
export async function initUpdater(win: BrowserWindow): Promise<void> {
  mainWindow = win;

  // Skip in development
  if (!app.isPackaged) {
    updateState = { status: "idle" };
    return;
  }

  try {
    // Dynamic import for electron-updater
    const { autoUpdater } = await import("electron-updater");

    // Configure updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on("checking-for-update", () => {
      setStatus("checking");
    });

    autoUpdater.on("update-available", (info) => {
      setStatus("available", info.version);
    });

    autoUpdater.on("update-not-available", () => {
      setStatus("not-available");
    });

    autoUpdater.on("download-progress", (progress) => {
      updateState = {
        status: "downloading",
        progress: progress.percent,
      };
      notifyRenderer();
    });

    autoUpdater.on("update-downloaded", (info) => {
      setStatus("downloaded", info.version);
    });

    autoUpdater.on("error", (error) => {
      updateState = {
        status: "error",
        error: error.message,
      };
      notifyRenderer();
    });

    // Check for updates on startup (after a delay)
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 5000);
  } catch (error) {
    console.error("Failed to initialize updater:", error);
  }
}

/**
 * Set update status and notify renderer.
 */
function setStatus(status: UpdateStatus, version?: string): void {
  updateState = {
    status,
    ...(version !== undefined && { version }),
  };
  notifyRenderer();
}

/**
 * Notify renderer of status change.
 */
function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:status-changed", updateState);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register update-related IPC handlers.
 */
export function registerUpdaterIpc(): void {
  // Get current update status
  ipcMain.handle("update:status", () => {
    return updateState;
  });

  // Get app version
  ipcMain.handle("update:version", () => {
    return app.getVersion();
  });

  // Check for updates manually
  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) {
      return { available: false, message: "Updates disabled in development" };
    }

    try {
      const { autoUpdater } = await import("electron-updater");
      const result = await autoUpdater.checkForUpdates();
      return {
        available: result?.updateInfo !== undefined,
        version: result?.updateInfo?.version,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : "Check failed",
      };
    }
  });

  // Download update
  ipcMain.handle("update:download", async () => {
    if (!app.isPackaged) {
      return { success: false, message: "Updates disabled in development" };
    }

    try {
      const { autoUpdater } = await import("electron-updater");
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Download failed",
      };
    }
  });

  // Install update (quit and install)
  ipcMain.handle("update:install", async () => {
    if (!app.isPackaged) {
      return { success: false, message: "Updates disabled in development" };
    }

    try {
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Install failed",
      };
    }
  });
}

// ============================================================================
// Export State
// ============================================================================

/**
 * Get current update state.
 */
export function getUpdateState(): UpdateState {
  return { ...updateState };
}
