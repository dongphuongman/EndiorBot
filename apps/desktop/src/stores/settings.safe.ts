/**
 * SAFE Settings Store - Works without IPC
 */

import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface SettingsState {
  theme: Theme;
  language: string;
  gatewayPort: number;
  isLoading: boolean;
}

interface SettingsActions {
  setTheme: (theme: Theme) => void;
  setLanguage: (language: string) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

type SettingsStore = SettingsState & SettingsActions;

// Safe IPC helper
const safeIpcInvoke = async (channel: string, ...args: any[]) => {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer?.invoke) {
    try {
      return await window.electron.ipcRenderer.invoke(channel, ...args);
    } catch (error) {
      console.warn(`IPC call failed: ${channel}`, error);
      return null;
    }
  }
  return null;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // State
  theme: "dark",
  language: "en",
  gatewayPort: 19000,
  isLoading: false,

  // Actions
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem("endiorbot-theme", theme);
    // Try to persist to main process (optional)
    safeIpcInvoke("settings:set", "theme", theme);
  },

  setLanguage: (language) => {
    set({ language });
    safeIpcInvoke("settings:set", "language", language);
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      // Load from localStorage (always works)
      const storedTheme = localStorage.getItem("endiorbot-theme") as Theme | null;

      // Try to load from main process (optional)
      const allSettings = await safeIpcInvoke("settings:getAll") || {};

      set({
        theme: storedTheme ?? allSettings.theme ?? "dark",
        language: allSettings.language ?? "en",
        gatewayPort: allSettings.gatewayPort ?? 19000,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      // Fallback to defaults
      set({
        theme: "dark",
        language: "en",
        gatewayPort: 19000,
        isLoading: false
      });
    }
  },

  saveSettings: async () => {
    const state = get();
    try {
      await safeIpcInvoke("settings:set", "theme", state.theme);
      await safeIpcInvoke("settings:set", "language", state.language);
      await safeIpcInvoke("settings:set", "gatewayPort", state.gatewayPort);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },
}));
