/**
 * Native Menu
 *
 * Application menu for macOS and Windows/Linux.
 *
 * @module apps/desktop/electron/main/menu
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { app, Menu, shell, BrowserWindow, dialog } from "electron";

// ============================================================================
// Menu Template
// ============================================================================

/**
 * Build the application menu.
 */
export function buildMenu(mainWindow: BrowserWindow | null): Menu {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Preferences...",
                accelerator: "CmdOrCtrl+,",
                click: () => navigateTo(mainWindow, "/settings"),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),

    // File menu
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => navigateTo(mainWindow, "/chat"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
            ]
          : [
              { role: "delete" as const },
              { type: "separator" as const },
              { role: "selectAll" as const },
            ]),
      ],
    },

    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    // Navigate menu
    {
      label: "Navigate",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+1",
          click: () => navigateTo(mainWindow, "/dashboard"),
        },
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+2",
          click: () => navigateTo(mainWindow, "/chat"),
        },
        {
          label: "Checkpoints",
          accelerator: "CmdOrCtrl+3",
          click: () => navigateTo(mainWindow, "/checkpoints"),
        },
        {
          label: "Fix Stats",
          accelerator: "CmdOrCtrl+4",
          click: () => navigateTo(mainWindow, "/fix-stats"),
        },
        {
          label: "Settings",
          // No accelerator — macOS App menu already owns Cmd+, for Preferences
          // Windows/Linux: Ctrl+, is available but Settings is in Navigate menu as reference
          accelerator: isMac ? undefined : "Ctrl+,",
          click: () => navigateTo(mainWindow, "/settings"),
        },
      ],
    },

    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },

    // Help menu
    {
      role: "help",
      submenu: [
        {
          label: "Documentation",
          click: () => {
            shell.openExternal("https://docs.endiorbot.nqh-internal.example");
          },
        },
        {
          label: "Report Issue",
          click: () => {
            shell.openExternal(
              "https://github.com/Minh-Tam-Solution/EndiorBot/issues"
            );
          },
        },
        { type: "separator" },
        {
          label: "About EndiorBot",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "About EndiorBot",
              message: "EndiorBot",
              detail: `Version: ${app.getVersion()}\nFramework: MTS SDLC 6.1.1\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

/**
 * Navigate to a route in the renderer.
 */
function navigateTo(mainWindow: BrowserWindow | null, route: string): void {
  if (mainWindow) {
    mainWindow.webContents.send("navigate", route);
  }
}

/**
 * Set up the application menu.
 */
export function setupMenu(mainWindow: BrowserWindow | null): void {
  const menu = buildMenu(mainWindow);
  Menu.setApplicationMenu(menu);
}
