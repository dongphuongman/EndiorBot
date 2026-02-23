/**
 * System Tray
 *
 * System tray icon with context menu for quick actions.
 *
 * @module apps/desktop/electron/main/tray
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { app, Tray, Menu, nativeImage, BrowserWindow } from "electron";
import path from "node:path";

// ============================================================================
// Types
// ============================================================================

type GatewayStatus = "stopped" | "starting" | "running" | "error";

// ============================================================================
// State
// ============================================================================

let tray: Tray | null = null;
let currentStatus: GatewayStatus = "stopped";

// ============================================================================
// Tray Functions
// ============================================================================

/**
 * Create the system tray icon.
 */
export function createTray(mainWindow: BrowserWindow | null): Tray {
  const iconPath = getTrayIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip("EndiorBot");

  // Build context menu
  updateTrayMenu(mainWindow);

  // Click behavior
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Double-click (Windows)
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

/**
 * Get the appropriate tray icon path based on platform.
 */
function getTrayIconPath(): string {
  const iconDir = app.isPackaged
    ? path.join(process.resourcesPath, "icons")
    : path.join(__dirname, "../../resources/icons");

  switch (process.platform) {
    case "darwin":
      // Use template image for macOS (supports dark/light mode)
      return path.join(iconDir, "tray-Template.png");
    case "win32":
      return path.join(iconDir, "tray.ico");
    default:
      return path.join(iconDir, "tray.png");
  }
}

/**
 * Update the tray context menu.
 */
export function updateTrayMenu(mainWindow: BrowserWindow | null): void {
  if (!tray) return;

  const statusLabel = getStatusLabel(currentStatus);
  const statusIcon = getStatusIcon(currentStatus);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${statusIcon} Gateway: ${statusLabel}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Show Window",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Dashboard",
      click: () => navigateTo(mainWindow, "/dashboard"),
    },
    {
      label: "Chat",
      click: () => navigateTo(mainWindow, "/chat"),
    },
    {
      label: "Checkpoints",
      click: () => navigateTo(mainWindow, "/checkpoints"),
    },
    {
      label: "Fix Stats",
      click: () => navigateTo(mainWindow, "/fix-stats"),
    },
    {
      label: "Settings",
      click: () => navigateTo(mainWindow, "/settings"),
    },
    { type: "separator" },
    {
      label: "Quit EndiorBot",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Update the gateway status displayed in tray.
 */
export function updateTrayStatus(
  status: GatewayStatus,
  mainWindow: BrowserWindow | null
): void {
  currentStatus = status;
  updateTrayMenu(mainWindow);

  // Update tooltip
  if (tray) {
    tray.setToolTip(`EndiorBot - Gateway ${getStatusLabel(status)}`);
  }
}

/**
 * Get human-readable status label.
 */
function getStatusLabel(status: GatewayStatus): string {
  switch (status) {
    case "running":
      return "Connected";
    case "starting":
      return "Starting...";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

/**
 * Get status icon emoji.
 */
function getStatusIcon(status: GatewayStatus): string {
  switch (status) {
    case "running":
      return "🟢";
    case "starting":
      return "🟡";
    case "stopped":
      return "⚪";
    case "error":
      return "🔴";
    default:
      return "⚪";
  }
}

/**
 * Navigate to a route in the renderer.
 */
function navigateTo(mainWindow: BrowserWindow | null, route: string): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("navigate", route);
  }
}

/**
 * Destroy the tray icon.
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * Get the tray instance.
 */
export function getTray(): Tray | null {
  return tray;
}
