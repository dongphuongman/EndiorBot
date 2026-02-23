/**
 * Preload Script - IPC Bridge
 *
 * Exposes a secure API to the renderer process via contextBridge.
 * This is the ONLY way renderer can communicate with main process.
 *
 * Security Model:
 * - No Node.js APIs exposed directly
 * - All channels are whitelisted
 * - Type-safe API surface
 *
 * @module apps/desktop/electron/preload
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 * @authority ADR-003 CLI-Desktop Protocol
 */

import { contextBridge, ipcRenderer } from "electron";

// ============================================================================
// Channel Whitelist
// ============================================================================

/**
 * Allowed IPC channels for invoke (request-response).
 */
const INVOKE_CHANNELS = [
  // App
  "app:quit",
  "app:relaunch",
  "app:getPath",
  "app:version",
  "app:isDev",
  // Shell
  "shell:openExternal",
  "shell:showItemInFolder",
  // Window
  "window:minimize",
  "window:maximize",
  "window:close",
  "window:isMaximized",
  "window:isFullScreen",
  "window:setFullScreen",
  // Dialog
  "dialog:open",
  "dialog:save",
  "dialog:message",
  // Settings
  "settings:get",
  "settings:set",
  "settings:getAll",
  // Gateway
  "gateway:status",
  "gateway:isConnected",
  "gateway:start",
  "gateway:stop",
  "gateway:restart",
  // Session
  "session:get",
  "session:list",
  // Budget
  "budget:get",
  // Checkpoints
  "checkpoints:list",
  "checkpoints:restore",
  // Fix Stats
  "fixStats:getWeeklySummary",
  "fixStats:getPatterns",
  // Update
  "update:status",
  "update:version",
  "update:check",
  "update:download",
  "update:install",
] as const;

/**
 * Allowed IPC channels for events (main → renderer).
 */
const EVENT_CHANNELS = [
  "gateway:status-changed",
  "gateway:message",
  "session:updated",
  "budget:updated",
  "checkpoint:created",
  "notification",
  "navigate",
  "update:status-changed",
] as const;

// Type helpers
type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
type EventChannel = (typeof EVENT_CHANNELS)[number];

// ============================================================================
// Validation
// ============================================================================

function isValidInvokeChannel(channel: string): channel is InvokeChannel {
  return INVOKE_CHANNELS.includes(channel as InvokeChannel);
}

function isValidEventChannel(channel: string): channel is EventChannel {
  return EVENT_CHANNELS.includes(channel as EventChannel);
}

// ============================================================================
// API Definition
// ============================================================================

/**
 * The API exposed to the renderer process.
 */
const electronAPI = {
  /**
   * IPC communication methods.
   */
  ipcRenderer: {
    /**
     * Invoke a channel and wait for response.
     */
    invoke: async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
      if (!isValidInvokeChannel(channel)) {
        throw new Error(`Invalid IPC channel: ${channel}`);
      }
      return ipcRenderer.invoke(channel, ...args);
    },

    /**
     * Listen for events from main process.
     * Returns the wrapped listener so it can be removed with `off`.
     */
    on: (
      channel: string,
      callback: (...args: unknown[]) => void
    ): (() => void) | undefined => {
      if (!isValidEventChannel(channel)) {
        console.warn(`Invalid event channel: ${channel}`);
        return undefined;
      }
      const wrappedCallback = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
        callback(...args);
      ipcRenderer.on(channel, wrappedCallback);
      // Return a cleanup function to remove the listener
      return () => ipcRenderer.removeListener(channel, wrappedCallback);
    },

    /**
     * Listen for a single event.
     */
    once: (channel: string, callback: (...args: unknown[]) => void): void => {
      if (!isValidEventChannel(channel)) {
        console.warn(`Invalid event channel: ${channel}`);
        return;
      }
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    },

    /**
     * Remove event listener.
     * Pass the wrapped listener returned by `on`, not the original callback.
     */
    off: (channel: string, wrappedListener: (...args: unknown[]) => void): void => {
      if (!isValidEventChannel(channel)) {
        return;
      }
      ipcRenderer.removeListener(channel, wrappedListener as Parameters<typeof ipcRenderer.removeListener>[1]);
    },
  },

  /**
   * Open URL in default browser.
   */
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke("shell:openExternal", url);
  },

  /**
   * Platform identifier.
   */
  platform: process.platform,

  /**
   * Whether running in development mode.
   */
  isDev: process.env.NODE_ENV === "development",
};

// ============================================================================
// Expose to Renderer
// ============================================================================

contextBridge.exposeInMainWorld("electron", electronAPI);

// ============================================================================
// Type Export for Renderer
// ============================================================================

/**
 * Type definition for window.electron
 */
export type ElectronAPI = typeof electronAPI;
