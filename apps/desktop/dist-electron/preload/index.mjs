"use strict";
const electron = require("electron");
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
  "update:install"
];
const EVENT_CHANNELS = [
  "gateway:status-changed",
  "gateway:message",
  "session:updated",
  "budget:updated",
  "checkpoint:created",
  "notification",
  "navigate",
  "update:status-changed"
];
function isValidInvokeChannel(channel) {
  return INVOKE_CHANNELS.includes(channel);
}
function isValidEventChannel(channel) {
  return EVENT_CHANNELS.includes(channel);
}
const electronAPI = {
  /**
   * IPC communication methods.
   */
  ipcRenderer: {
    /**
     * Invoke a channel and wait for response.
     */
    invoke: async (channel, ...args) => {
      if (!isValidInvokeChannel(channel)) {
        throw new Error(`Invalid IPC channel: ${channel}`);
      }
      return electron.ipcRenderer.invoke(channel, ...args);
    },
    /**
     * Listen for events from main process.
     * Returns the wrapped listener so it can be removed with `off`.
     */
    on: (channel, callback) => {
      if (!isValidEventChannel(channel)) {
        console.warn(`Invalid event channel: ${channel}`);
        return void 0;
      }
      const wrapped = (_event, ...args) => callback(...args);
      electron.ipcRenderer.on(channel, wrapped);
      return wrapped;
    },
    /**
     * Listen for a single event.
     */
    once: (channel, callback) => {
      if (!isValidEventChannel(channel)) {
        console.warn(`Invalid event channel: ${channel}`);
        return;
      }
      electron.ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    },
    /**
     * Remove event listener.
     * Pass the wrapped listener returned by `on`, not the original callback.
     */
    off: (channel, wrappedListener) => {
      if (!isValidEventChannel(channel)) {
        return;
      }
      electron.ipcRenderer.removeListener(channel, wrappedListener);
    }
  },
  /**
   * Open URL in default browser.
   */
  openExternal: (url) => {
    return electron.ipcRenderer.invoke("shell:openExternal", url);
  },
  /**
   * Platform identifier.
   */
  platform: process.platform,
  /**
   * Whether running in development mode.
   */
  isDev: process.env.NODE_ENV === "development"
};
electron.contextBridge.exposeInMainWorld("electron", electronAPI);
