/**
 * Electron Main Process Entry Point
 *
 * Handles application lifecycle, window creation, and IPC registration.
 *
 * @module apps/desktop/electron/main
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 * @authority ADR-003 CLI-Desktop Protocol
 */

import { app, shell, ipcMain } from "electron";
import path from "node:path";
import { createWindow, getMainWindow, restoreWindowState } from "./window.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { setupMenu } from "./menu.js";
import { createTray } from "./tray.js";
import { initUpdater, registerUpdaterIpc } from "./updater.js";

// __dirname in CJS context (esbuild bundles to CJS)
declare const __dirname: string;

// Environment
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Paths
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const PRELOAD_PATH = path.join(__dirname, "../preload/index.js");
const RENDERER_PATH = path.join(__dirname, "../../dist/index.html");

// ============================================================================
// App Lifecycle
// ============================================================================

/**
 * Initialize application when ready.
 */
async function onReady(): Promise<void> {
  // Register IPC handlers before creating window
  registerIpcHandlers();
  registerUpdaterIpc();

  // Create main window
  const win = createWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f172a", // slate-900
  });

  // Restore window state (position, size)
  restoreWindowState(win);

  // Load content
  if (isDev) {
    await win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(RENDERER_PATH);
  }

  // Show window when ready
  win.once("ready-to-show", () => {
    win.show();
  });

  // Setup menu
  setupMenu(win);

  // Create system tray
  createTray(win);

  // Initialize auto-updater
  initUpdater(win);

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

/**
 * Handle all windows closed.
 */
function onWindowAllClosed(): void {
  // On macOS, keep app in dock unless explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
}

/**
 * Handle app activation (macOS dock click).
 */
function onActivate(): void {
  const win = getMainWindow();
  if (!win) {
    onReady();
  } else {
    win.show();
  }
}

// ============================================================================
// App Events
// ============================================================================

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  // Wait for app ready
  app.whenReady().then(onReady);

  // App lifecycle events
  app.on("window-all-closed", onWindowAllClosed);
  app.on("activate", onActivate);

  // Security: Disable navigation to external URLs
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "file:" && !url.startsWith(VITE_DEV_SERVER_URL)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
  });
}

// ============================================================================
// IPC Handlers (App-level)
// ============================================================================

ipcMain.handle("app:quit", () => {
  app.quit();
});

ipcMain.handle("app:relaunch", () => {
  app.relaunch();
  app.quit();
});

ipcMain.handle("app:getPath", (_event, name: string) => {
  return app.getPath(name as Parameters<typeof app.getPath>[0]);
});

ipcMain.handle("app:version", () => {
  return app.getVersion();
});

ipcMain.handle("app:isDev", () => {
  return isDev;
});

ipcMain.handle("shell:openExternal", (_event, url: string) => {
  return shell.openExternal(url);
});

ipcMain.handle("shell:showItemInFolder", (_event, fullPath: string) => {
  shell.showItemInFolder(fullPath);
});
