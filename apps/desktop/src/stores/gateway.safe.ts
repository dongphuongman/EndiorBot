/**
 * SAFE Gateway Store - Works without IPC
 */

import { create } from "zustand";

interface GatewayState {
  isConnected: boolean;
  status: 'offline' | 'connecting' | 'connected' | 'error';
  port: number;
  lastChecked: Date | null;
}

interface GatewayActions {
  checkStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

type GatewayStore = GatewayState & GatewayActions;

export const useGatewayStore = create<GatewayStore>((set) => ({
  // State
  isConnected: false,
  status: 'offline',
  port: 19000,
  lastChecked: null,

  // Actions
  checkStatus: async () => {
    try {
      // Try WebSocket connection check
      // For now, just mark as checked (will implement later)
      set({
        lastChecked: new Date(),
        status: 'offline' // Default until Gateway is actually running
      });
    } catch (error) {
      console.error("Gateway status check failed:", error);
      set({ status: 'error' });
    }
  },

  connect: async () => {
    set({ status: 'connecting' });
    try {
      // TODO: Implement WebSocket connection
      // For now, just simulate
      await new Promise(resolve => setTimeout(resolve, 500));
      set({
        isConnected: false, // Will be true when Gateway is actually running
        status: 'offline'
      });
    } catch (error) {
      console.error("Gateway connection failed:", error);
      set({
        isConnected: false,
        status: 'error'
      });
    }
  },

  disconnect: async () => {
    set({
      isConnected: false,
      status: 'offline'
    });
  },
}));
