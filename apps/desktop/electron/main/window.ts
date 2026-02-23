/**
 * Window Management
 *
 * Handles window creation, state persistence, and multi-monitor support.
 *
 * @module apps/desktop/electron/main/window
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { BrowserWindow, screen } from "electron";
import Store from "electron-store";

// ============================================================================
// Types
// ============================================================================

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface WindowOptions {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  webPreferences: Electron.WebPreferences;
  show?: boolean;
  titleBarStyle?: "default" | "hidden" | "hiddenInset" | "customButtonsOnHover";
  backgroundColor?: string;
}

// ============================================================================
// State Store
// ============================================================================

// Lazy initialization to avoid accessing app before ready
let store: Store<{ windowState: WindowState }> | null = null;

function getStore(): Store<{ windowState: WindowState }> {
  if (!store) {
    store = new Store<{ windowState: WindowState }>({
      name: "endiorbot-desktop-window-state",
      defaults: {
        windowState: {
          width: 1200,
          height: 800,
          isMaximized: false,
        },
      },
    });
  }
  return store;
}

// ============================================================================
// Window Reference
// ============================================================================

let mainWindow: BrowserWindow | null = null;

// ============================================================================
// Window Functions
// ============================================================================

/**
 * Create the main application window.
 */
export function createWindow(options: WindowOptions): BrowserWindow {
  mainWindow = new BrowserWindow(options);

  // Track window state changes
  mainWindow.on("resize", () => saveWindowState());
  mainWindow.on("move", () => saveWindowState());
  mainWindow.on("maximize", () => saveWindowState());
  mainWindow.on("unmaximize", () => saveWindowState());
  mainWindow.on("close", () => saveWindowState());

  // Clear reference when closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Get the main window instance.
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Restore window state from persisted storage.
 */
export function restoreWindowState(win: BrowserWindow): void {
  const state = getStore().get("windowState");

  // Validate bounds are on a visible display
  const bounds = validateBounds(state);

  if (bounds.x !== undefined && bounds.y !== undefined) {
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  } else {
    win.setSize(bounds.width, bounds.height);
    win.center();
  }

  if (state.isMaximized) {
    win.maximize();
  }
}

/**
 * Save current window state to persistent storage.
 */
function saveWindowState(): void {
  if (!mainWindow) return;

  const isMaximized = mainWindow.isMaximized();
  const bounds = mainWindow.getBounds();

  // Only save bounds if not maximized (to remember pre-maximize size)
  if (!isMaximized) {
    getStore().set("windowState", {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: false,
    });
  } else {
    // Just update maximized state
    const current = getStore().get("windowState");
    getStore().set("windowState", {
      ...current,
      isMaximized: true,
    });
  }
}

/**
 * Validate window bounds are visible on a connected display.
 */
function validateBounds(state: WindowState): WindowState {
  const displays = screen.getAllDisplays();

  // Check if stored position is visible on any display
  if (state.x !== undefined && state.y !== undefined) {
    const isVisible = displays.some((display) => {
      const { x, y, width, height } = display.bounds;
      return (
        state.x! >= x &&
        state.x! < x + width &&
        state.y! >= y &&
        state.y! < y + height
      );
    });

    if (isVisible) {
      return state;
    }
  }

  // Return default bounds (centered on primary display)
  return {
    width: state.width,
    height: state.height,
    isMaximized: state.isMaximized,
  };
}

// ============================================================================
// Window IPC Handlers
// ============================================================================

export function getWindowIpcHandlers() {
  return {
    minimize: () => mainWindow?.minimize(),
    maximize: () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
    },
    close: () => mainWindow?.close(),
    isMaximized: () => mainWindow?.isMaximized() ?? false,
    isFullScreen: () => mainWindow?.isFullScreen() ?? false,
    setFullScreen: (fullScreen: boolean) => mainWindow?.setFullScreen(fullScreen),
  };
}
