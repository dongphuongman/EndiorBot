/**
 * Settings Store
 *
 * Manages application settings and theme preferences.
 *
 * @module apps/desktop/src/stores/settings
 * @version 1.0.0
 * @date 2026-02-23
 */

import { create } from "zustand";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // State
  theme: "dark",
  language: "en",
  gatewayPort: 18790,
  isLoading: false,

  // Actions
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem("endiorbot-theme", theme);
    // Also persist to main process
    window.electron.ipcRenderer.invoke("settings:set", "theme", theme);
  },

  setLanguage: (language) => {
    set({ language });
    window.electron.ipcRenderer.invoke("settings:set", "language", language);
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      // Load from localStorage first (theme)
      const storedTheme = localStorage.getItem("endiorbot-theme") as Theme | null;
      if (storedTheme) {
        set({ theme: storedTheme });
      }

      // Load other settings from main process
      const allSettings = await window.electron.ipcRenderer.invoke<{
        theme?: Theme;
        language?: string;
        gatewayPort?: number;
      }>("settings:getAll");

      set({
        theme: storedTheme ?? allSettings.theme ?? "dark",
        language: allSettings.language ?? "en",
        gatewayPort: allSettings.gatewayPort ?? 18790,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      set({ isLoading: false });
    }
  },

  saveSettings: async () => {
    const state = get();
    try {
      await window.electron.ipcRenderer.invoke("settings:set", "theme", state.theme);
      await window.electron.ipcRenderer.invoke("settings:set", "language", state.language);
      await window.electron.ipcRenderer.invoke(
        "settings:set",
        "gatewayPort",
        state.gatewayPort
      );
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },
}));
