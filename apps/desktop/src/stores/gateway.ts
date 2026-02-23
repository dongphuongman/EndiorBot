/**
 * Gateway Store
 *
 * Manages gateway connection state and provides IPC methods.
 *
 * @module apps/desktop/src/stores/gateway
 * @version 1.0.0
 * @date 2026-02-23
 */

import { create } from "zustand";
import type { GatewayStatus } from "../types/electron";

// ============================================================================
// Types
// ============================================================================

interface GatewayState {
  status: GatewayStatus["status"];
  message?: string;
  isConnected: boolean;
  lastChecked?: string;
}

interface GatewayActions {
  checkStatus: () => Promise<void>;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  restart: () => Promise<boolean>;
}

type GatewayStore = GatewayState & GatewayActions;

// ============================================================================
// Store
// ============================================================================

export const useGatewayStore = create<GatewayStore>((set) => ({
  // State
  status: "stopped",
  message: undefined,
  isConnected: false,
  lastChecked: undefined,

  // Actions
  checkStatus: async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke<GatewayStatus>(
        "gateway:status"
      );
      set({
        status: result.status,
        message: result.message,
        isConnected: result.status === "running",
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      set({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        isConnected: false,
      });
    }
  },

  start: async () => {
    try {
      set({ status: "starting" });
      const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
        "gateway:start"
      );
      if (result.success) {
        set({ status: "running", isConnected: true });
      }
      return result.success;
    } catch (error) {
      set({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to start",
      });
      return false;
    }
  },

  stop: async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
        "gateway:stop"
      );
      if (result.success) {
        set({ status: "stopped", isConnected: false });
      }
      return result.success;
    } catch (error) {
      set({ status: "error", message: "Failed to stop" });
      return false;
    }
  },

  restart: async () => {
    try {
      set({ status: "starting" });
      const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
        "gateway:restart"
      );
      if (result.success) {
        set({ status: "running", isConnected: true });
      }
      return result.success;
    } catch (error) {
      set({ status: "error", message: "Failed to restart" });
      return false;
    }
  },
}));
