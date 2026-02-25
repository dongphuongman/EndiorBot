/**
 * SAFE Gateway Store - WebSocket connection to Gateway
 */

import { create } from "zustand";

interface GatewayState {
  isConnected: boolean;
  status: 'offline' | 'connecting' | 'connected' | 'error';
  port: number;
  lastChecked: Date | null;
  ws: WebSocket | null;
}

interface GatewayActions {
  checkStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

type GatewayStore = GatewayState & GatewayActions;

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  // State
  isConnected: false,
  status: 'offline',
  port: 19000,
  lastChecked: null,
  ws: null,

  // Actions
  checkStatus: async () => {
    const state = get();

    // If already connected, just update lastChecked
    if (state.isConnected && state.ws && state.ws.readyState === WebSocket.OPEN) {
      set({ lastChecked: new Date() });
      return;
    }

    // If connecting, don't create another connection
    if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Close old connection if it exists but not open
    if (state.ws && state.ws.readyState !== WebSocket.OPEN) {
      try {
        state.ws.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Try to connect
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${state.port}`);

      // Set timeout for connection
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          set({
            isConnected: false,
            status: 'offline',
            lastChecked: new Date(),
            ws: null
          });
        }
      }, 3000); // 3 second timeout

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ Gateway connected!');
        set({
          isConnected: true,
          status: 'connected',
          lastChecked: new Date(),
          ws
        });
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        // Silent error - Gateway might not be running
        set({
          isConnected: false,
          status: 'offline',
          lastChecked: new Date(),
          ws: null
        });
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        const currentState = get();
        // Only log if we were previously connected
        if (currentState.isConnected) {
          console.log('Gateway disconnected');
        }
        set({
          isConnected: false,
          status: 'offline',
          ws: null
        });
      };
    } catch (error) {
      set({
        isConnected: false,
        status: 'offline',
        lastChecked: new Date(),
        ws: null
      });
    }
  },

  connect: async () => {
    const state = get();
    set({ status: 'connecting' });

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${state.port}`);

      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          set({
            isConnected: true,
            status: 'connected',
            ws
          });
          resolve(undefined);
        };
        ws.onerror = reject;
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
    const state = get();
    if (state.ws) {
      state.ws.close();
    }
    set({
      isConnected: false,
      status: 'offline',
      ws: null
    });
  },
}));
